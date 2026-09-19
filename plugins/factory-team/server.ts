import {
  cliCommand,
  defineCli,
  PluginCliError,
  type BbPluginApi,
} from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  DEFAULT_PREFERENCE,
  preferenceSchema,
  profileSchema,
  recordSchema,
  scopeSchema,
  TEAM_CHANGED,
  teamRpcContract,
  type TeamRecord,
  type TeamScope,
} from "./shared.js";

export const teamMigrations = [
  "CREATE TABLE team_preferences (scope TEXT PRIMARY KEY, value TEXT NOT NULL)",
];

export default function plugin(bb: BbPluginApi, initializeStorage = true) {
  const db = bb.storage.database();
  if (initializeStorage) bb.storage.migrate(db, teamMigrations);
  const key = (scope: TeamScope) => `${scope.kind}:${scope.id}`;
  function read(scope: TeamScope): TeamRecord | null {
    const value = db
      .prepare("SELECT value FROM team_preferences WHERE scope = ?")
      .pluck()
      .get(key(scope));
    if (typeof value !== "string") return null;
    const stored = recordSchema
      .extend({
        preference: z.strictObject({
          mode: z.enum(["auto", "off", "selected"]),
          profiles: z.array(profileSchema).max(32),
        }),
      })
      .parse(JSON.parse(value));
    const seen = new Set<string>();
    const profiles = stored.preference.profiles.filter((profile) => {
      const modelKey = JSON.stringify([profile.providerId, profile.model]);
      if (seen.has(modelKey)) return false;
      seen.add(modelKey);
      return true;
    });
    const changed = profiles.length !== stored.preference.profiles.length;
    const record = recordSchema.parse({
      preference: { ...stored.preference, profiles },
      revision: stored.revision + (changed ? 1 : 0),
    });
    if (changed) write(scope, record);
    return record;
  }
  function write(scope: TeamScope, record: TeamRecord) {
    db.prepare(
      "INSERT INTO team_preferences (scope, value) VALUES (?, ?) ON CONFLICT(scope) DO UPDATE SET value = excluded.value",
    ).run(key(scope), JSON.stringify(record));
  }
  const userScope: TeamScope = { kind: "user", id: "default" };
  const defaultRecord = () => read(userScope) ?? { preference: DEFAULT_PREFERENCE, revision: 0 };
  async function get(scope: TeamScope) {
    if (scope.kind === "user") return { ...defaultRecord(), environmentId: null };
    if (scope.kind === "project") {
      await bb.sdk.projects.get({ projectId: scope.id });
      return {
        ...(read(scope) ?? { preference: defaultRecord().preference, revision: 0 }),
        environmentId: null,
      };
    }
    const thread = await bb.sdk.threads.get({ threadId: scope.id });
    const record = db.transaction(() => {
      const saved = read(scope);
      if (saved) return saved;
      const inherited = read({ kind: "project", id: thread.projectId });
      const snapshot = {
        preference: inherited?.preference ?? defaultRecord().preference,
        revision: 0,
      };
      write(scope, snapshot);
      return snapshot;
    })();
    return { ...record, environmentId: thread.environmentId };
  }
  async function set(input: z.infer<(typeof teamRpcContract)["set"]["input"]>) {
    await get(input.scope);
    const record = db.transaction(() => {
      const current = read(input.scope);
      if ((current?.revision ?? 0) !== input.expectedRevision) {
        throw new Error(
          "Team changed in another window. Reload the preference before saving.",
        );
      }
      const saved = {
        preference: input.preference,
        revision: input.expectedRevision + 1,
      };
      write(input.scope, saved);
      if (input.remember && input.scope.kind !== "user") {
        const previous = defaultRecord();
        write(userScope, { preference: saved.preference, revision: previous.revision + 1 });
      }
      return saved;
    })();
    bb.realtime.publish(TEAM_CHANGED, input.scope);
    if (input.remember) bb.realtime.publish(TEAM_CHANGED, userScope);
    return record;
  }
  async function reset({ scope, expectedRevision }: z.infer<typeof teamRpcContract.reset.input>) {
    if (scope.kind === "user") throw new Error("The user default cannot inherit another scope.");
    const current = await get(scope);
    const inherited = scope.kind === "thread"
      ? await get({ kind: "project", id: (await bb.sdk.threads.get({ threadId: scope.id })).projectId })
      : await get(userScope);
    const saved = db.transaction(() => {
      if ((read(scope)?.revision ?? current.revision) !== expectedRevision) throw new Error("Team changed in another window. Reload before resetting.");
      const next = { preference: inherited.preference, revision: expectedRevision + 1 };
      write(scope, next);
      return next;
    })();
    bb.realtime.publish(TEAM_CHANGED, scope);
    return saved;
  }
  bb.events.on("thread.created", ({ thread }) => {
    const scope: TeamScope = { kind: "thread", id: thread.id };
    if (!read(scope))
      write(scope, {
        preference:
          read({ kind: "project", id: thread.projectId })?.preference ??
          defaultRecord().preference,
        revision: 0,
      });
  });
  bb.rpc.register(
    teamRpcContract,
    { get: ({ scope }) => get(scope), set, reset },
    {
      experimental_discoverable: true,
      experimental_description:
        "Read and update versioned Team preferences for a thread or project default.",
    },
  );
  bb.cli.register(
    defineCli({
      name: "team",
      summary: "Read and update this conversation's Team preference",
      commands: {
        reset: cliCommand({
          summary: "Restore the inherited Team for this scope without changing the remembered default",
          options: {
            thread: { type: "string", description: "Thread ID (defaults to current)" },
            project: { type: "string", description: "Project whose default to restore" },
            json: { type: "boolean", description: "Emit JSON" },
          },
          async run(input, context) {
            const scope = resolveScope(input.options, context.threadId);
            const current = await get(scope);
            return { exitCode: 0, stdout: formatRecord(await reset({ scope, expectedRevision: current.revision }), input.options.json) };
          },
        }),
        get: cliCommand({
          summary: "Read Team mode and implementer profiles",
          options: {
            global: { type: "boolean", description: "Use the remembered default across all projects" },
            thread: {
              type: "string",
              description: "Thread ID (defaults to the current thread)",
            },
            project: {
              type: "string",
              description:
                "Read defaults for new conversations in this project",
            },
            json: { type: "boolean", description: "Emit JSON" },
          },
          async run(input, context) {
            const scope = resolveScope(input.options, context.threadId);
            return {
              exitCode: 0,
              stdout: formatRecord(await get(scope), input.options.json),
            };
          },
        }),
        set: cliCommand({
          summary:
            "Save Auto, Off, or Selected implementers; never launches workers",
          options: {
            global: { type: "boolean", description: "Use the remembered default across all projects" },
            thread: {
              type: "string",
              description: "Thread ID (defaults to the current thread)",
            },
            project: {
              type: "string",
              description: "Set defaults for new conversations in this project",
            },
            local: { type: "boolean", description: "Save only this scope without changing the remembered default" },
            mode: {
              type: "enum",
              values: ["auto", "off", "selected"],
              required: true,
              description: "Delegation preference",
            },
            profiles: {
              type: "string",
              description:
                "JSON array of providerId, model, reasoningLevel and optional serviceTier; omitted retains saved profiles",
            },
            revision: {
              type: "integer",
              min: 0,
              max: Number.MAX_SAFE_INTEGER,
              description:
                "Expected revision from team get; prevents overwriting newer changes",
            },
            json: { type: "boolean", description: "Emit JSON" },
          },
          async run(input, context) {
            const scope = resolveScope(input.options, context.threadId);
            const current = await get(scope);
            const preference = preferenceSchema.parse({
              mode: input.options.mode,
              profiles:
                input.options.profiles === undefined
                  ? current.preference.profiles
                  : JSON.parse(input.options.profiles),
            });
            return {
              exitCode: 0,
              stdout: formatRecord(
                await set({
                  scope,
                  preference,
                  remember: !input.options.local,
                  expectedRevision: input.options.revision ?? current.revision,
                }),
                input.options.json,
              ),
            };
          },
        }),
      },
    }),
  );
}

function resolveScope(
  options: { thread?: string; project?: string; global?: boolean },
  threadId: string | undefined,
): TeamScope {
  if ([options.thread, options.project, options.global].filter(Boolean).length > 1)
    throw new PluginCliError("Use one of --thread, --project or --global.", {
      code: "invalid_scope",
    });
  if (options.global) return { kind: "user", id: "default" };
  const id = options.project ?? options.thread ?? threadId;
  if (!id)
    throw new PluginCliError("A thread or project is required.", {
      code: "missing_scope",
      hint: "Pass --thread <id> or --project <id>.",
    });
  return scopeSchema.parse({
    kind: options.project ? "project" : "thread",
    id,
  });
}

function formatRecord(record: TeamRecord, json: boolean | undefined): string {
  if (json) return JSON.stringify(record);
  return [
    `Team: ${record.preference.mode} (revision ${record.revision})`,
    ...record.preference.profiles.map(
      (profile) =>
        `${profile.providerId} / ${profile.model} / ${profile.reasoningLevel}${profile.serviceTier ? ` / ${profile.serviceTier}` : ""}`,
    ),
  ].join("\n");
}
