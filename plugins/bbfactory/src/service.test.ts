import { createConnection, migrate } from "@bb/db";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it } from "vitest";
import { createFactoryService } from "./service.js";
import { createStore } from "./data.js";
import { factoryHostContract, specSchema, type FactorySpec } from "./shared.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
const spec: FactorySpec = {
  goal: "Reserve last place",
  scope: "Booking service",
  requirements: [
    {
      id: "R1",
      text: "Concurrent requests reserve exactly once",
      criterion: "automated",
    },
  ],
  scenarios: [
    {
      id: "S1",
      requirementIds: ["R1"],
      given: "one place",
      when: "two requests race",
      then: "exactly one succeeds",
    },
  ],
  checks: [
    {
      id: "race",
      requirementIds: ["R1"],
      testRef: "booking.test.ts#race",
      argv: ["node", "booking.test.ts"],
      timeoutMs: 1000,
      required: true,
    },
  ],
};
function fixture() {
  const connection = createConnection(":memory:");
  migrate(connection);
  let fingerprint = "content-v1";
  let complete = true;
  let exitCode: number | null = 0;
  let settled = true;
  let mutate = false;
  let throwCheck = false;
  let hold: (() => Promise<void>) | undefined;
  let team = {
    preference: {
      mode: "selected",
      profiles: [
        {
          providerId: "codex",
          model: "model",
          reasoningLevel: "high",
          serviceTier: "default",
        },
      ],
    },
    revision: 7,
    environmentId: "env",
  };
  let available = true;
  let nativeFailure = false;
  let starts = 0;
  let events = 0;
  const rpcCalls: Array<{ pluginId: string; method: string; input?: unknown }> =
    [];
  const runs = new Map<
    string,
    {
      runId: string;
      status: string;
      assignments: Array<{
        id: string;
        callId: string;
        threadId: string;
        status: string;
        result: null;
        error: null;
        environmentId: string;
        permissionMode: string;
        scope: string;
      }>;
      error: null;
    }
  >();
  const { bb, harness } = createFakePluginHost({
    pluginId: "bbfactory",
    sdk: {
      threads: {
        get: async ({ threadId }: { threadId: string }) => ({
          id: threadId,
          projectId: "project",
          environmentId: "env",
          archivedAt: null,
          deletedAt: null,
        }),
      },
      environments: {
        get: async ({ environmentId }: { environmentId: string }) => ({
          id: environmentId,
          projectId: "project",
          hostId: "host",
          path:
            environmentId === "alias"
              ? "/alias"
              : `/workspace/${environmentId}`,
        }),
      },
      providers: {
        models: async () => ({
          providers: [
            {
              id: "codex",
              available,
              reasoningLevels: [{ id: "high" }],
              serviceTiers: [{ id: "default" }],
            },
          ],
          models: [
            {
              id: "codex:model",
              model: "model",
              supportedReasoningEfforts: [{ reasoningEffort: "high" }],
            },
          ],
          modelLoadError: null,
        }),
      },
      plugins: {
        callRpc: async (input: {
          pluginId: string;
          method: string;
          input?: unknown;
        }) => {
          rpcCalls.push(input);
          if (input.pluginId === "factory-team") return team;
          if (input.pluginId !== "workflows")
            throw new Error("Unknown installed plugin");
          const request = input.input as {
            launchId: string;
            assignments?: Array<{
              id: string;
              environment: { environmentId: string };
              permissionMode: string;
              scope: string;
            }>;
          };
          if (input.method === "experimental_executionStart") {
            starts++;
            const run = {
              runId: `run-${request.launchId}`,
              status: "succeeded",
              nativeSettlement: "confirmed",
              assignments: request.assignments!.map((a) => ({
                id: a.id,
                callId: `call-${a.id}`,
                threadId: `thread-${a.id}`,
                status: "succeeded",
                result: null,
                error: null,
                environmentId: a.environment.environmentId,
                permissionMode: a.permissionMode,
                scope: a.scope,
              })),
              error: null,
            };
            runs.set(request.launchId, run);
            if (nativeFailure)
              throw new Error("Lost response after native launch");
            return run;
          }
          if (nativeFailure) throw new Error("Native transport unavailable");
          const run = runs.get(request.launchId);
          if (!run) throw new Error("Unknown native launch");
          if (input.method === "experimental_executionCancel")
            return { ...run, status: "cancelled", stopConfirmed: false };
          return run;
        },
      },
    },
    experimental_callHostRpc: async (call) => {
      if (call.method === "captureState") {
        const input = factoryHostContract.captureState.input.parse(call.input);
        return {
          fingerprint,
          canonicalPath:
            input.rootPath === "/alias" ? "/workspace/env" : input.rootPath,
          complete,
          detail: complete ? null : "Cannot capture content",
        };
      }
      await hold?.();
      if (throwCheck) throw new Error("Host check lost");
      if (mutate) fingerprint = "content-v2";
      return {
        exitCode,
        timedOut: false,
        settled,
        startedAt: 1,
        finishedAt: 2,
        logRef: "/log",
        output: "ran race assertion",
        detail: null,
      };
    },
  });
  const publish = bb.realtime.publish;
  bb.realtime.publish = (...args) => {
    events++;
    return publish(...args);
  };
  bb.storage.database = () => connection.$client;
  const service = createFactoryService(bb);
  cleanups.push(async () => {
    await harness.dispose();
    connection.$client.close();
  });
  return {
    bb,
    service,
    connection,
    rpcCalls,
    get starts() {
      return starts;
    },
    get events() {
      return events;
    },
    setFingerprint(value: string) {
      fingerprint = value;
    },
    setComplete(value: boolean) {
      complete = value;
    },
    fail() {
      exitCode = 1;
    },
    escape() {
      settled = false;
    },
    mutate() {
      mutate = true;
    },
    throwCheck() {
      throwCheck = true;
    },
    hold(value: () => Promise<void>) {
      hold = value;
    },
    off() {
      team = { ...team, preference: { ...team.preference, mode: "off" } };
    },
    unavailable() {
      available = false;
    },
    nativeFailure(value: boolean) {
      nativeFailure = value;
    },
    create: (definition = spec) =>
      service.createTask({ threadId: "thread", spec: definition }),
  };
}
const assignment = (id: string, environmentId = "env") => ({
  id,
  role: "implement" as const,
  prompt: "Implement booking race",
  title: id,
  profile: {
    providerId: "codex",
    model: "model",
    reasoningLevel: "high" as const,
    serviceTier: "default" as const,
  },
  environmentId,
  permissionMode: "accept-edits" as const,
  scope: "booking",
  ownership: "exclusive" as const,
});

describe("Factory acceptance against real SQLite migrations", () => {
  it("no-change refresh never publishes a fetch loop", async () => {
    const f = fixture();
    const { task } = await f.create();
    await f.service.verifyTask(task.id);
    const events = f.events;
    const first = await f.service.getTaskDetail(task.id);
    const second = await f.service.getTaskDetail(task.id);
    expect(second.task.updatedAt).toBe(first.task.updatedAt);
    expect(f.events).toBe(events);
  });
  it("direct work accepts linked checks and invalidates evidence when new content arrives", async () => {
    const f = fixture();
    const { task } = await f.create();
    expect((await f.service.verifyTask(task.id)).task.status).toBe("accepted");
    f.setFingerprint("new-file-added");
    const changed = await f.service.getTaskDetail(task.id);
    expect(changed.task.status).toBe("stale");
    expect(changed.evidence[0].content.fingerprint).toBe("content-v1");
    expect(() =>
      f.connection.$client
        .prepare(
          "UPDATE factory_artifacts SET value = '{}' WHERE kind = 'check'",
        )
        .run(),
    ).toThrow("immutable");
    expect(f.starts).toBe(0);
  });
  it("scenarios and passing unrelated commands never cover missing requirements", async () => {
    const f = fixture();
    const { task } = await f.create({
      ...spec,
      requirements: [
        ...spec.requirements,
        { id: "R2", text: "Waitlist loser", criterion: "automated" },
      ],
    });
    expect((await f.service.verifyTask(task.id)).task.status).toBe(
      "unverified",
    );
    expect(() =>
      specSchema.parse({
        ...spec,
        checks: [{ ...spec.checks[0], requirementIds: ["missing"] }],
      }),
    ).toThrow();
  });
  it.each(["capture", "escape", "mutation", "transport"])(
    "never accepts %s uncertainty",
    async (mode) => {
      const f = fixture();
      const { task } = await f.create();
      if (mode === "capture") f.setComplete(false);
      if (mode === "escape") f.escape();
      if (mode === "mutation") f.mutate();
      if (mode === "transport") f.throwCheck();
      expect((await f.service.verifyTask(task.id)).task.status).not.toBe(
        "accepted",
      );
    },
  );
  it("required failures and review findings block acceptance; evidence and spec revisions persist", async () => {
    const f = fixture();
    const { task } = await f.create();
    await f.service.verifyTask(task.id);
    const finding = await f.service.finding({
      taskId: task.id,
      requirementIds: ["R1"],
      evidence: "Two requests both succeeded in review",
      required: true,
    });
    expect(finding.task.status).toBe("failed");
    await f.service.resolve({
      taskId: task.id,
      findingId: finding.findings[0].id,
      resolution: "Fixed lock, independent reproduction now passes",
    });
    const revised = await f.service.updateTask({
      taskId: task.id,
      expectedVersion: 1,
      spec: { ...spec, goal: "New accepted goal" },
      changeReason: "User changed requirement",
    });
    expect(revised.task.status).toBe("stale");
    expect(revised.specs).toHaveLength(2);
    expect(revised.evidence).toHaveLength(1);
    f.fail();
    expect((await f.service.verifyTask(task.id)).task.status).toBe("failed");
  });
  it("requires explicit human attestation bound to current spec and content", async () => {
    const f = fixture();
    const { task } = await f.create({
      ...spec,
      requirements: [
        { id: "R1", text: "Review visual design", criterion: "human" },
      ],
      checks: [],
    });
    expect((await f.service.verifyTask(task.id)).task.status).toBe(
      "unverified",
    );
    expect(
      (
        await f.service.judge({
          taskId: task.id,
          requirementId: "R1",
          accepted: true,
          actor: "user",
          rationale: "Confirmed requested design",
          humanConfirmed: true,
          expectedVersion: 1,
          expectedFingerprint: "content-v1",
        })
      ).task.status,
    ).toBe("accepted");
    f.setFingerprint("redesign");
    await expect(
      f.service.judge({
        taskId: task.id,
        requirementId: "R1",
        accepted: true,
        actor: "user",
        rationale: "Stale browser form",
        humanConfirmed: true,
        expectedVersion: 1,
        expectedFingerprint: "content-v1",
      }),
    ).rejects.toThrow("changed since review");
    expect((await f.service.getTaskDetail(task.id)).task.status).toBe("stale");
  });
  it("persists stop before a blocked check returns and cannot overwrite it with green evidence", async () => {
    const f = fixture();
    const { task } = await f.create();
    let release!: () => void;
    let started!: () => void;
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    f.hold(() => {
      started();
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const verify = f.service.verifyTask(task.id);
    await began;
    const cancel = f.service.cancelTask({ taskId: task.id, archive: true });
    expect(createStore(f.connection.$client).stopped(task.id)).toBe(1);
    release();
    await verify;
    const result = await cancel;
    expect(result.task.status).toBe("unverified");
    expect(result.task.archived).toBe(true);
    const restarted = createFactoryService(f.bb);
    expect((await restarted.getTaskDetail(task.id)).task.stopRequested).toBe(
      true,
    );
  });
  it("interrupted verification remains unverified after restart", async () => {
    const f = fixture();
    const { task } = await f.create();
    await f.service.verifyTask(task.id);
    createStore(f.connection.$client).beginVerification(task.id);
    const restarted = createFactoryService(f.bb);
    expect((await restarted.getTaskDetail(task.id)).task.status).toBe(
      "unverified",
    );
  });
});

describe("Factory native associations and Team selection", () => {
  it("allows several workers using one eligible model and preserves actual selection revision", async () => {
    const f = fixture();
    const { task } = await f.create();
    const result = await f.service.assign({
      taskId: task.id,
      launchId: "launch",
      assignments: [
        assignment("a"),
        { ...assignment("b", "review-env"), role: "review" },
      ],
    });
    expect(result.assignments).toHaveLength(2);
    expect(result.assignments.map((a) => a.preferenceRevision)).toEqual([7, 7]);
    expect(result.assignments[1].threadId).toBe("thread-b");
    expect(result.task.status).toBe("unverified");
    expect((await f.service.verifyTask(task.id)).task.status).toBe("accepted");
  });
  it("Off requires an explicit task override, never modifies saved preference, and validates host model", async () => {
    const f = fixture();
    const { task } = await f.create();
    f.off();
    await expect(
      f.service.assign({
        taskId: task.id,
        launchId: "one",
        assignments: [assignment("a")],
      }),
    ).rejects.toThrow("Off");
    const result = await f.service.assign({
      taskId: task.id,
      launchId: "one",
      assignments: [assignment("a")],
      overrideReason: "User explicitly requested delegation",
    });
    expect(result.assignments[0].overrideReason).toContain("User");
    expect(f.rpcCalls.some((c) => c.method === "set")).toBe(false);
    f.unavailable();
    await expect(
      f.service.assign({
        taskId: task.id,
        launchId: "two",
        assignments: [assignment("b")],
        overrideReason: "User request",
      }),
    ).rejects.toThrow("unavailable");
  });
  it("reconciles a lost reply after restart without duplicate launch and rejects changed retries", async () => {
    const f = fixture();
    const { task } = await f.create();
    f.nativeFailure(true);
    const input = {
      taskId: task.id,
      launchId: "one",
      assignments: [assignment("a")],
    };
    expect((await f.service.assign(input)).assignments[0].nativeStatus).toBe(
      "uncertain",
    );
    f.nativeFailure(false);
    const restarted = createFactoryService(f.bb);
    expect((await restarted.assign(input)).assignments[0].threadId).toBe(
      "thread-a",
    );
    expect(f.starts).toBe(1);
    await expect(
      restarted.assign({
        ...input,
        assignments: [{ ...assignment("a"), prompt: "changed" }],
      }),
    ).rejects.toThrow("different");
  });
  it("rejects symlink alias environments rather than allowing competing native writers", async () => {
    const f = fixture();
    const { task } = await f.create();
    await expect(
      f.service.assign({
        taskId: task.id,
        launchId: "aliases",
        assignments: [assignment("a"), assignment("b", "alias")],
      }),
    ).rejects.toThrow("aliases");
    expect(f.starts).toBe(0);
  });
});
