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
  TEAM_INSTRUCTIONS,
  teamRpcContract,
  type TeamRecord,
  type TeamScope,
} from "./shared.js";

export default function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, [
    "CREATE TABLE team_preferences (scope TEXT PRIMARY KEY, value TEXT NOT NULL)",
  ]);
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
  async function get(scope: TeamScope) {
    if (scope.kind === "project") {
      await bb.sdk.projects.get({ projectId: scope.id });
      return {
        ...(read(scope) ?? { preference: DEFAULT_PREFERENCE, revision: 0 }),
        environmentId: null,
      };
    }
    const thread = await bb.sdk.threads.get({ threadId: scope.id });
    const record = db.transaction(() => {
      const saved = read(scope);
      if (saved) return saved;
      const inherited = read({ kind: "project", id: thread.projectId });
      const snapshot = {
        preference: inherited?.preference ?? DEFAULT_PREFERENCE,
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
      return saved;
    })();
    bb.realtime.publish(TEAM_CHANGED, input.scope);
    return record;
  }
  bb.events.on("thread.created", ({ thread }) => {
    const scope: TeamScope = { kind: "thread", id: thread.id };
    if (!read(scope))
      write(scope, {
        preference:
          read({ kind: "project", id: thread.projectId })?.preference ??
          DEFAULT_PREFERENCE,
        revision: 0,
      });
  });
  bb.rpc.register(
    teamRpcContract,
    { get: ({ scope }) => get(scope), set },
    {
      experimental_discoverable: true,
      experimental_description:
        "Read and update versioned Team preferences for a thread or project default.",
    },
  );
  bb.agents.registerTool({
    name: "bb_team_get",
    description:
      "Read the current conversation's Team preference before starting a new task or choosing workers. Does not start workers or change the lead.",
    instructions: TEAM_INSTRUCTIONS,
    parameters: z.strictObject({}),
    async execute(_input, context) {
      const result = await get({ kind: "thread", id: context.threadId });
      return JSON.stringify({
        ...result,
        enforcement:
          "delegation preference; explicit user instructions override for the current task",
      });
    },
  });
  bb.cli.register(
    defineCli({
      name: "team",
      summary: "Read and update this conversation's Team preference",
      commands: {
        get: cliCommand({
          summary: "Read Team mode and implementer profiles",
          options: {
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
            thread: {
              type: "string",
              description: "Thread ID (defaults to the current thread)",
            },
            project: {
              type: "string",
              description: "Set defaults for new conversations in this project",
            },
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
  options: { thread?: string; project?: string },
  threadId: string | undefined,
): TeamScope {
  if (options.thread && options.project)
    throw new PluginCliError("Use either --thread or --project.", {
      code: "invalid_scope",
    });
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
