import { createHash } from "node:crypto";
import {
  createFakePluginHost,
  type FakePluginHarness,
} from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it } from "vitest";
import {
  insertEvidence,
  transitionAttemptState,
  updateTask,
} from "./data.js";
import { createFactoryService, type FactoryService } from "./service.js";

const ORIGIN_THREAD_ID = "thr_origin";
const ENVIRONMENT_ID = "env_1";
const HOST_ID = "host_1";
const WORKSPACE_PATH = "/workspace/project";

interface FakeWorker {
  id: string;
  status: "active" | "idle" | "error" | "stopping";
  archivedAt: number | null;
  deletedAt: number | null;
  pluginMetadata: Record<string, unknown>;
  stopCalls: number;
}

interface FakeWorkspace {
  files: Record<string, string>;
  head: string | null;
}

interface CheckResult {
  exitCode: number | null;
  timedOut: boolean;
  processTreeSettled?: boolean;
  mutate?: (workspace: FakeWorkspace) => void;
  error?: string;
}

interface Fixture {
  bb: Parameters<typeof createFactoryService>[0];
  harness: FakePluginHarness;
  service: FactoryService;
  workers: Map<string, FakeWorker>;
  workspace: FakeWorkspace;
  spawnCalls: unknown[];
  stopCalls: string[];
  checkCalls: string[][];
  checkResults: Map<string, CheckResult>;
  hostCalls: Array<{ method: string; input: unknown }>;
  makeSpawnFail(error: Error): void;
  setOriginStatus(status: FakeWorker["status"]): void;
  setCaptureIncomplete(reasons: string[] | null): void;
  holdChecks(): () => void;
}

function fingerprintOf(workspace: FakeWorkspace): string {
  const hash = createHash("sha256");
  hash.update(`head:${workspace.head ?? "none"}\n`);
  for (const path of Object.keys(workspace.files).sort()) {
    hash.update(`${path}\0${workspace.files[path]}\n`);
  }
  return hash.digest("hex");
}

function makeFixture(): Fixture {
  const workers = new Map<string, FakeWorker>();
  const workspace: FakeWorkspace = {
    files: { "src/index.ts": "export const x = 1\n" },
    head: "abc123",
  };
  const spawnCalls: unknown[] = [];
  const stopCalls: string[] = [];
  const checkCalls: string[][] = [];
  const checkResults = new Map<string, CheckResult>();
  const hostCalls: Array<{ method: string; input: unknown }> = [];
  let spawnError: Error | null = null;
  let spawnCount = 0;
  let originStatus: FakeWorker["status"] = "idle";
  let incompleteReasons: string[] | null = null;
  let checkGate: Promise<void> | null = null;

  const { bb, harness } = createFakePluginHost({
    pluginId: "bbfactory",
    sdk: {
      threads: {
        get: async (input: { threadId: string }) => {
          if (input.threadId === ORIGIN_THREAD_ID) {
            return {
              id: ORIGIN_THREAD_ID,
              projectId: "project_1",
              environmentId: ENVIRONMENT_ID,
              status: originStatus,
              archivedAt: null,
              deletedAt: null,
            };
          }
          const worker = workers.get(input.threadId);
          if (worker === undefined) {
            throw new Error(`Unknown thread ${input.threadId}`);
          }
          return {
            id: worker.id,
            projectId: "project_1",
            environmentId: ENVIRONMENT_ID,
            status: worker.status,
            archivedAt: worker.archivedAt,
            deletedAt: worker.deletedAt,
          };
        },
        list: async (
          input: { originPluginId?: string; archived?: boolean } = {},
        ) => {
          return [...workers.values()]
            .filter((worker) =>
              input.archived === false ? worker.archivedAt === null : true,
            )
            .map((worker) => ({
              id: worker.id,
              originPluginId: input.originPluginId ?? "bbfactory",
              status: worker.status,
              archivedAt: worker.archivedAt,
              deletedAt: worker.deletedAt,
            }));
        },
        getPluginMetadata: async (input: {
          threadId: string;
          pluginId?: string;
        }) => {
          return workers.get(input.threadId)?.pluginMetadata ?? {};
        },
        spawn: async (args: unknown) => {
          spawnCalls.push(args);
          if (spawnError !== null) throw spawnError;
          spawnCount += 1;
          const worker: FakeWorker = {
            id: `thr_worker_${spawnCount}`,
            status: "active",
            archivedAt: null,
            deletedAt: null,
            pluginMetadata:
              ((args as Record<string, unknown>).pluginMetadata as Record<
                string,
                unknown
              >) ?? {},
            stopCalls: 0,
          };
          workers.set(worker.id, worker);
          return { id: worker.id, status: worker.status };
        },
        stop: async (input: { threadId: string }) => {
          stopCalls.push(input.threadId);
          const worker = workers.get(input.threadId);
          if (worker === undefined) {
            throw new Error(`Unknown thread ${input.threadId}`);
          }
          worker.stopCalls += 1;
          worker.status = "stopping";
          return { ok: true };
        },
      },
      environments: {
        get: async (input: { environmentId: string }) => ({
          id: input.environmentId,
          hostId: HOST_ID,
          path: WORKSPACE_PATH,
        }),
      },
      providers: {
        list: async () => [
          {
            id: "codex",
            pluginId: "provider-codex",
            displayName: "Codex",
            available: true,
          },
        ],
      },
    },
    experimental_callHostRpc: (call) => {
      hostCalls.push({ method: call.method, input: call.input });
      const input = call.input as Record<string, unknown>;
      switch (call.method) {
        case "captureState":
          return {
            isGitRepo: workspace.head !== null,
            head: workspace.head,
            fingerprint: fingerprintOf(workspace),
            fileCount: Object.keys(workspace.files).length,
            incomplete: incompleteReasons !== null,
            incompleteReasons: incompleteReasons ?? [],
          };
        case "runCheck": {
          const argv = input.argv as string[];
          checkCalls.push(argv);
          const key = argv.join(" ");
          const result = checkResults.get(key) ?? {
            exitCode: 0,
            timedOut: false,
          };
          if (result.error !== undefined) {
            throw new Error(result.error);
          }
          const run = async () => {
            if (checkGate !== null) await checkGate;
            result.mutate?.(workspace);
            const now = Date.now();
            return {
              exitCode: result.exitCode,
              timedOut: result.timedOut,
              startedAt: now,
              finishedAt: now + 5,
              durationMs: 5,
              logPath: `/data/check-logs/${input.logFileName as string}`,
              outputTail:
                result.exitCode === 0 ? "ok" : "check failed output",
              outputTruncated: false,
              processTreeSettled: result.processTreeSettled ?? true,
            };
          };
          return run();
        }
        case "watchWorkspace":
          return { watching: true };
        case "unwatchWorkspace":
          return { ok: true };
        default:
          throw new Error(`unexpected host call ${call.method}`);
      }
    },
  });
  const service = createFactoryService(bb);
  return {
    bb,
    harness,
    service,
    workers,
    workspace,
    spawnCalls,
    stopCalls,
    checkCalls,
    checkResults,
    hostCalls,
    makeSpawnFail(error: Error) {
      spawnError = error;
    },
    setOriginStatus(status: FakeWorker["status"]) {
      originStatus = status;
    },
    setCaptureIncomplete(reasons: string[] | null) {
      incompleteReasons = reasons;
    },
    holdChecks() {
      let release = () => {};
      checkGate = new Promise<void>((resolve) => {
        release = () => {
          checkGate = null;
          resolve();
        };
      });
      return release;
    },
  };
}

async function createTaskWithCheck(
  fixture: Fixture,
  checks = [{ argv: ["run-tests"] }],
) {
  const { task } = await fixture.service.createTask({
    threadId: ORIGIN_THREAD_ID,
    goal: "Implement the thing",
    checks,
  });
  return task;
}

describe("factory service", () => {
  const fixtures: Fixture[] = [];
  function fixture(): Fixture {
    const created = makeFixture();
    fixtures.push(created);
    return created;
  }
  afterEach(async () => {
    await Promise.all(fixtures.map((entry) => entry.harness.dispose()));
    fixtures.length = 0;
  });

  it("creates a proposed task and delegates one bounded attempt to the selected provider", async () => {
    const f = fixture();
    const task = await createTaskWithCheck(f);
    expect(task.status).toBe("proposed");

    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
      model: "gpt-test",
      reasoningLevel: "medium",
      permissionMode: "auto",
    });
    expect(started.task.status).toBe("running");
    expect(started.attempt.state).toBe("running");
    expect(f.spawnCalls).toHaveLength(1);
    const spawn = f.spawnCalls[0] as Record<string, unknown>;
    expect(spawn.providerId).toBe("codex");
    expect(spawn.model).toBe("gpt-test");
    expect(spawn.visibility).toBe("hidden");
    expect(spawn.lifecycleOwnerThreadId).toBe(ORIGIN_THREAD_ID);
    expect(spawn.origin).toBe("plugin");
    expect(spawn.originPluginId).toBe("bbfactory");
    const metadata = spawn.pluginMetadata as Record<string, unknown>;
    expect(metadata.factoryWorker).toBe(1);
    expect(metadata.taskId).toBe(task.id);
    expect(metadata.attemptId).toBe(started.attempt.id);
    const environment = spawn.environment as Record<string, unknown>;
    expect(environment).toMatchObject({
      type: "reuse",
      environmentId: ENVIRONMENT_ID,
    });
  });

  it("worker claims done but the check fails: task stays unaccepted with evidence", async () => {
    const f = fixture();
    f.checkResults.set("run-tests", {
      exitCode: 1,
      timedOut: false,
    });
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
    });
    const workerId = started.attempt.workerThreadId;
    expect(workerId).not.toBeNull();

    await f.service.onThreadIdle(workerId ?? "");
    await f.service.waitForIdle();

    const detail = f.service.getTaskDetail(task.id);
    expect(detail.task.status).toBe("failed");
    expect(detail.attempts[0]?.state).toBe("verified");
    expect(detail.evidence).toHaveLength(1);
    expect(detail.evidence[0]?.status).toBe("failed");
    expect(detail.evidence[0]?.exitCode).toBe(1);
    expect(detail.evidence[0]?.outputTail).toContain("check failed");
  });

  it("passing checks on captured content accepts the task and arms a watch", async () => {
    const f = fixture();
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
    });
    await f.service.onThreadIdle(started.attempt.workerThreadId ?? "");
    await f.service.waitForIdle();

    const detail = f.service.getTaskDetail(task.id);
    expect(detail.task.status).toBe("accepted");
    expect(detail.task.acceptedAttemptId).toBe(started.attempt.id);
    expect(detail.evidence[0]?.status).toBe("passed");
    expect(
      f.hostCalls.filter((call) => call.method === "watchWorkspace"),
    ).toHaveLength(1);
  });

  it("spec change after acceptance stales evidence and withdraws acceptance", async () => {
    const f = fixture();
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
    });
    await f.service.onThreadIdle(started.attempt.workerThreadId ?? "");
    await f.service.waitForIdle();
    expect(f.service.getTaskDetail(task.id).task.status).toBe("accepted");

    const updated = await f.service.updateTaskSpec({
      taskId: task.id,
      checks: [{ argv: ["run-tests"], id: "v2-check" }],
    });
    expect(updated.specVersion).toBe(2);
    expect(updated.status).toBe("blocked");
    const detail = f.service.getTaskDetail(task.id);
    expect(detail.evidence[0]?.status).toBe("stale");
  });

  it("workspace change after acceptance invalidates evidence", async () => {
    const f = fixture();
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
    });
    await f.service.onThreadIdle(started.attempt.workerThreadId ?? "");
    await f.service.waitForIdle();
    expect(f.service.getTaskDetail(task.id).task.status).toBe("accepted");

    await f.harness.experimental_emitHostSignal(HOST_ID, "workspaceChanged", {
      key: task.id,
    });
    const detail = f.service.getTaskDetail(task.id);
    expect(detail.task.status).toBe("blocked");
    expect(detail.evidence[0]?.status).toBe("stale");
  });

  it("content changing during verification marks evidence stale, not accepted", async () => {
    const f = fixture();
    f.checkResults.set("run-tests", {
      exitCode: 0,
      timedOut: false,
      mutate: (workspace) => {
        workspace.files["src/late.ts"] = "export const y = 2\n";
      },
    });
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
    });
    await f.service.onThreadIdle(started.attempt.workerThreadId ?? "");
    await f.service.waitForIdle();
    const detail = f.service.getTaskDetail(task.id);
    expect(detail.task.status).toBe("blocked");
    expect(detail.evidence[0]?.status).toBe("stale");
  });

  it("direct execution needs no worker and uses the same verification gate", async () => {
    const f = fixture();
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "direct",
    });
    expect(f.spawnCalls).toHaveLength(0);
    expect(started.attempt.intent).toBe("direct");
    expect(started.attempt.state).toBe("running");
    expect(started.attempt.workerThreadId).toBe(ORIGIN_THREAD_ID);

    await f.service.completeAttempt(task.id);
    await f.service.waitForIdle();
    const detail = f.service.getTaskDetail(task.id);
    expect(detail.task.status).toBe("accepted");
    expect(detail.evidence[0]?.status).toBe("passed");
    expect(f.checkCalls).toEqual([["run-tests"]]);
  });

  it("a lost spawn reply leaves the attempt uncertain and blocks any replacement writer", async () => {
    const f = fixture();
    f.makeSpawnFail(new Error("transport dropped"));
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
    });
    expect(started.attempt.state).toBe("uncertain");
    expect(started.task.status).toBe("blocked");

    await expect(
      f.service.startAttempt({ taskId: task.id, mode: "delegate", providerId: "codex" }),
    ).rejects.toThrow(/active attempt/);

    const second = await f.service.createTask({
      threadId: ORIGIN_THREAD_ID,
      goal: "Other task",
      checks: [{ argv: ["run-tests"] }],
    });
    await expect(
      f.service.startAttempt({
        taskId: second.task.id,
        mode: "delegate",
        providerId: "codex",
      }),
    ).rejects.toThrow(/live writer/);
  });

  it("uncertain spawn + cancel keeps the workspace owned until the writer is resolved", async () => {
    const f = fixture();
    f.makeSpawnFail(new Error("transport dropped"));
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
    });
    await f.service.cancelTask(task.id);
    expect(f.service.getTaskDetail(task.id).task.status).toBe("cancelling");

    const second = await f.service.createTask({
      threadId: ORIGIN_THREAD_ID,
      goal: "Other task",
      checks: [{ argv: ["run-tests"] }],
    });
    await expect(
      f.service.startAttempt({
        taskId: second.task.id,
        mode: "delegate",
        providerId: "codex",
      }),
    ).rejects.toThrow(/live writer/);

    const orphan: FakeWorker = {
      id: "thr_orphan",
      status: "active",
      archivedAt: null,
      deletedAt: null,
      pluginMetadata: {
        factoryWorker: 1,
        taskId: task.id,
        attemptId: started.attempt.id,
        originThreadId: ORIGIN_THREAD_ID,
      },
      stopCalls: 0,
    };
    f.workers.set(orphan.id, orphan);
    await f.service.reconcileOnce();
    expect(f.workers.get(orphan.id)?.stopCalls).toBe(1);
    orphan.status = "idle";
    await f.service.reconcileOnce();
    const detail = f.service.getTaskDetail(task.id);
    expect(detail.task.status).toBe("cancelled");
    expect(detail.attempts[0]?.state).toBe("halted");
    await expect(
      f.service.startAttempt({
        taskId: second.task.id,
        mode: "delegate",
        providerId: "codex",
      }),
    ).rejects.toThrow(/live writer/);
  });

  it("reconcile reattaches a worker whose spawn reply was lost", async () => {
    const f = fixture();
    f.makeSpawnFail(new Error("transport dropped"));
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
    });
    const orphan: FakeWorker = {
      id: "thr_orphan",
      status: "active",
      archivedAt: null,
      deletedAt: null,
      pluginMetadata: {
        factoryWorker: 1,
        taskId: task.id,
        attemptId: started.attempt.id,
        originThreadId: ORIGIN_THREAD_ID,
      },
      stopCalls: 0,
    };
    f.workers.set(orphan.id, orphan);
    await f.service.reconcileOnce();
    const detail = f.service.getTaskDetail(task.id);
    expect(detail.attempts[0]?.state).toBe("running");
    expect(detail.attempts[0]?.workerThreadId).toBe("thr_orphan");
    expect(detail.task.status).toBe("running");
  });

  it("cancel while running waits for confirmed stop before releasing the workspace", async () => {
    const f = fixture();
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
    });
    const worker = f.workers.get(started.attempt.workerThreadId ?? "");
    await f.service.cancelTask(task.id);
    expect(worker?.stopCalls).toBe(1);
    expect(f.service.getTaskDetail(task.id).task.status).toBe("cancelling");
    await expect(
      f.service.startAttempt({
        taskId: task.id,
        mode: "delegate",
        providerId: "codex",
      }),
    ).rejects.toThrow();

    if (worker !== undefined) worker.status = "idle";
    await f.service.reconcileOnce();
    const detail = f.service.getTaskDetail(task.id);
    expect(detail.task.status).toBe("cancelled");
    expect(detail.attempts[0]?.state).toBe("halted");

    const second = await f.service.createTask({
      threadId: ORIGIN_THREAD_ID,
      goal: "Other task",
      checks: [{ argv: ["run-tests"] }],
    });
    await expect(
      f.service.startAttempt({
        taskId: second.task.id,
        mode: "delegate",
        providerId: "codex",
      }),
    ).rejects.toThrow(/live writer/);
  });

  it("duplicate completion events cause one product transition and one check run", async () => {
    const f = fixture();
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
    });
    const workerId = started.attempt.workerThreadId ?? "";
    await f.service.onThreadIdle(workerId);
    await f.service.onThreadIdle(workerId);
    await f.service.onThreadIdle(workerId);
    await f.service.waitForIdle();
    expect(f.checkCalls).toEqual([["run-tests"]]);
    const detail = f.service.getTaskDetail(task.id);
    expect(detail.task.status).toBe("accepted");
    expect(detail.evidence).toHaveLength(1);
  });

  it("worker failure blocks the task without claiming acceptance", async () => {
    const f = fixture();
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
    });
    await f.service.onThreadFailed(
      started.attempt.workerThreadId ?? "",
      "provider crashed",
    );
    const detail = f.service.getTaskDetail(task.id);
    expect(detail.task.status).toBe("blocked");
    expect(detail.attempts[0]?.state).toBe("halted");
    expect(f.checkCalls).toHaveLength(0);
  });

  it("persists durable task state across plugin reload", async () => {
    const f = fixture();
    const task = await createTaskWithCheck(f);
    await f.service.startAttempt({
      taskId: task.id,
      mode: "direct",
    });
    const reloaded = await f.harness.lifecycle.reload(async (bb) => {
      const service = createFactoryService(bb);
      const detail = service.getTaskDetail(task.id);
      expect(detail.task.status).toBe("running");
      expect(detail.attempts[0]?.state).toBe("running");
      expect(detail.task.goal).toBe("Implement the thing");
    });
    await reloaded.harness.dispose();
  });

  it("manual completion while the worker is still active keeps ownership", async () => {
    const f = fixture();
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
    });
    await expect(f.service.completeAttempt(task.id)).rejects.toThrow(
      /terminal state/,
    );
    expect(
      f.service.getTaskDetail(task.id).attempts[0]?.state,
    ).toBe("running");

    const second = await f.service.createTask({
      threadId: ORIGIN_THREAD_ID,
      goal: "Other task",
      checks: [{ argv: ["run-tests"] }],
    });
    await expect(
      f.service.startAttempt({
        taskId: second.task.id,
        mode: "delegate",
        providerId: "codex",
      }),
    ).rejects.toThrow(/live writer/);

    const worker = f.workers.get(started.attempt.workerThreadId ?? "");
    if (worker !== undefined) worker.status = "idle";
    await f.service.completeAttempt(task.id);
    await f.service.waitForIdle();
    expect(f.service.getTaskDetail(task.id).task.status).toBe("accepted");
  });

  it("an archived but still-active worker is not terminal proof", async () => {
    const f = fixture();
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
    });
    const worker = f.workers.get(started.attempt.workerThreadId ?? "");
    if (worker !== undefined) worker.archivedAt = Date.now();

    await f.service.onThreadArchived(started.attempt.workerThreadId ?? "");
    const detail = f.service.getTaskDetail(task.id);
    expect(detail.attempts[0]?.state).toBe("running");
    expect(worker?.stopCalls).toBe(1);

    const second = await f.service.createTask({
      threadId: ORIGIN_THREAD_ID,
      goal: "Other task",
      checks: [{ argv: ["run-tests"] }],
    });
    await expect(
      f.service.startAttempt({
        taskId: second.task.id,
        mode: "delegate",
        providerId: "codex",
      }),
    ).rejects.toThrow(/live writer/);

    if (worker !== undefined) worker.status = "idle";
    await f.service.onThreadIdle(started.attempt.workerThreadId ?? "");
    await f.service.waitForIdle();
    expect(f.service.getTaskDetail(task.id).task.status).toBe("accepted");
  });

  it("cancelling a direct attempt never stops the lead and stays pending until it settles", async () => {
    const f = fixture();
    f.setOriginStatus("active");
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "direct",
    });
    await f.service.cancelTask(task.id);
    const detail = f.service.getTaskDetail(task.id);
    expect(detail.task.status).toBe("cancelling");
    expect(detail.attempts[0]?.state).toBe("cancelling");
    expect(f.stopCalls).not.toContain(ORIGIN_THREAD_ID);

    const second = await f.service.createTask({
      threadId: ORIGIN_THREAD_ID,
      goal: "Other task",
      checks: [{ argv: ["run-tests"] }],
    });
    await expect(
      f.service.startAttempt({
        taskId: second.task.id,
        mode: "delegate",
        providerId: "codex",
      }),
    ).rejects.toThrow(/live writer/);

    f.setOriginStatus("idle");
    await f.service.onThreadIdle(ORIGIN_THREAD_ID);
    const settled = f.service.getTaskDetail(task.id);
    expect(settled.task.status).toBe("cancelled");
    expect(settled.attempts[0]?.state).toBe("settled");
    await expect(
      f.service.startAttempt({
        taskId: second.task.id,
        mode: "delegate",
        providerId: "codex",
      }),
    ).resolves.toMatchObject({ task: { status: "running" } });
  });

  it("workspace ownership survives verification; a new writer cannot overlap checks", async () => {
    const f = fixture();
    const release = f.holdChecks();
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
    });
    const worker = f.workers.get(started.attempt.workerThreadId ?? "");
    if (worker !== undefined) worker.status = "idle";
    await f.service.onThreadIdle(started.attempt.workerThreadId ?? "");

    const second = await f.service.createTask({
      threadId: ORIGIN_THREAD_ID,
      goal: "Other task",
      checks: [{ argv: ["run-tests"] }],
    });
    await expect(
      f.service.startAttempt({
        taskId: second.task.id,
        mode: "delegate",
        providerId: "codex",
      }),
    ).rejects.toThrow(/live writer/);

    release();
    await f.service.waitForIdle();
    expect(f.service.getTaskDetail(task.id).task.status).toBe("accepted");
    await expect(
      f.service.startAttempt({
        taskId: second.task.id,
        mode: "delegate",
        providerId: "codex",
      }),
    ).resolves.toMatchObject({ task: { status: "running" } });
  });

  it("an incomplete workspace snapshot can never produce an accepted task", async () => {
    const f = fixture();
    f.setCaptureIncomplete(["unreadable directory src/generated: EACCES"]);
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
    });
    const worker = f.workers.get(started.attempt.workerThreadId ?? "");
    if (worker !== undefined) worker.status = "idle";
    await f.service.onThreadIdle(started.attempt.workerThreadId ?? "");
    await f.service.waitForIdle();
    const detail = f.service.getTaskDetail(task.id);
    expect(detail.task.status).toBe("blocked");
    expect(detail.task.statusDetail).toContain("incomplete");
    expect(detail.evidence).toHaveLength(0);
  });

  it("an unsettled check process tree keeps workspace ownership even through cancel", async () => {
    const f = fixture();
    f.checkResults.set("run-tests", {
      exitCode: null,
      timedOut: true,
      processTreeSettled: false,
    });
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
    });
    const worker = f.workers.get(started.attempt.workerThreadId ?? "");
    if (worker !== undefined) worker.status = "idle";
    await f.service.onThreadIdle(started.attempt.workerThreadId ?? "");
    await f.service.waitForIdle();
    const detail = f.service.getTaskDetail(task.id);
    expect(detail.task.status).toBe("blocked");
    expect(detail.attempts[0]?.state).toBe("halted");
    expect(detail.evidence[0]?.status).toBe("incomplete");

    await f.service.cancelTask(task.id);
    expect(f.service.getTaskDetail(task.id).task.status).toBe("cancelled");
    expect(
      f.service.getTaskDetail(task.id).attempts[0]?.state,
    ).toBe("halted");

    const second = await f.service.createTask({
      threadId: ORIGIN_THREAD_ID,
      goal: "Other task",
      checks: [{ argv: ["run-tests"] }],
    });
    await expect(
      f.service.startAttempt({
        taskId: second.task.id,
        mode: "delegate",
        providerId: "codex",
      }),
    ).rejects.toThrow(/live writer/);
  });

  it("a lost runCheck reply halts the lease and skips remaining checks", async () => {
    const f = fixture();
    f.checkResults.set("run-tests", {
      exitCode: null,
      timedOut: false,
      error: "transport dropped",
    });
    const task = await createTaskWithCheck(f, [
      { argv: ["run-tests"] },
      { argv: ["run-lint"] },
    ]);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
    });
    const worker = f.workers.get(started.attempt.workerThreadId ?? "");
    if (worker !== undefined) worker.status = "idle";
    await f.service.onThreadIdle(started.attempt.workerThreadId ?? "");
    await f.service.waitForIdle();

    const detail = f.service.getTaskDetail(task.id);
    expect(detail.task.status).toBe("blocked");
    expect(detail.attempts[0]?.state).toBe("halted");
    expect(detail.evidence).toHaveLength(1);
    expect(detail.evidence[0]?.status).toBe("incomplete");
    expect(f.checkCalls).toEqual([["run-tests"]]);

    await f.service.cancelTask(task.id);
    expect(f.service.getTaskDetail(task.id).task.status).toBe("cancelled");
    const second = await f.service.createTask({
      threadId: ORIGIN_THREAD_ID,
      goal: "Other task",
      checks: [{ argv: ["run-tests"] }],
    });
    await expect(
      f.service.startAttempt({
        taskId: second.task.id,
        mode: "delegate",
        providerId: "codex",
      }),
    ).rejects.toThrow(/live writer/);
  });

  it("restart with a check in flight halts instead of rerunning it", async () => {
    const f = fixture();
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
    });
    const db = f.bb.storage.database();
    transitionAttemptState(
      db,
      started.attempt.id,
      ["running"],
      "verifying",
      "Declared checks running independently",
    );
    updateTask(db, task.id, { status: "awaiting_checks" });
    insertEvidence(db, {
      taskId: task.id,
      attemptId: started.attempt.id,
      checkId: "check-1",
      checkArgv: JSON.stringify(["run-tests"]),
      specVersion: 1,
      contentFingerprint: "fp",
      hostId: HOST_ID,
      workspacePath: WORKSPACE_PATH,
      status: "running",
    });

    const reloaded = await f.harness.lifecycle.reload(async (bb) => {
      const service = createFactoryService(bb);
      await service.recoverAfterRestart();
      const detail = service.getTaskDetail(task.id);
      expect(detail.task.status).toBe("blocked");
      expect(detail.attempts[0]?.state).toBe("halted");
      expect(detail.evidence[0]?.status).toBe("incomplete");
      expect(f.checkCalls).toHaveLength(0);
    });
    await reloaded.harness.dispose();
  });

  it("restart with changed accepted content fails closed to blocked", async () => {
    const f = fixture();
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
    });
    const worker = f.workers.get(started.attempt.workerThreadId ?? "");
    if (worker !== undefined) worker.status = "idle";
    await f.service.onThreadIdle(started.attempt.workerThreadId ?? "");
    await f.service.waitForIdle();
    expect(f.service.getTaskDetail(task.id).task.status).toBe("accepted");

    f.workspace.files["src/drifted.ts"] = "export const z = 3\n";
    const reloaded = await f.harness.lifecycle.reload(async (bb) => {
      const service = createFactoryService(bb);
      await service.recoverAfterRestart();
      const detail = service.getTaskDetail(task.id);
      expect(detail.task.status).toBe("blocked");
      expect(detail.task.statusDetail).toContain("changed while the plugin was down");
      expect(detail.evidence[0]?.status).toBe("stale");
    });
    await reloaded.harness.dispose();
  });

  it("restart with unchanged accepted content re-arms the watch", async () => {
    const f = fixture();
    const task = await createTaskWithCheck(f);
    const started = await f.service.startAttempt({
      taskId: task.id,
      mode: "delegate",
      providerId: "codex",
    });
    const worker = f.workers.get(started.attempt.workerThreadId ?? "");
    if (worker !== undefined) worker.status = "idle";
    await f.service.onThreadIdle(started.attempt.workerThreadId ?? "");
    await f.service.waitForIdle();
    expect(f.service.getTaskDetail(task.id).task.status).toBe("accepted");

    f.hostCalls.length = 0;
    const reloaded = await f.harness.lifecycle.reload(async (bb) => {
      const service = createFactoryService(bb);
      await service.recoverAfterRestart();
      const detail = service.getTaskDetail(task.id);
      expect(detail.task.status).toBe("accepted");
      expect(
        f.hostCalls.filter((call) => call.method === "watchWorkspace"),
      ).toHaveLength(1);
    });
    await reloaded.harness.dispose();
  });

  it("the workspace claim is enforced atomically, not only by the pre-check", async () => {
    const f = fixture();
    const first = await createTaskWithCheck(f);
    const second = await f.service.createTask({
      threadId: ORIGIN_THREAD_ID,
      goal: "Other task",
      checks: [{ argv: ["run-tests"] }],
    });
    const [a, b] = await Promise.allSettled([
      f.service.startAttempt({ taskId: first.id, mode: "direct" }),
      f.service.startAttempt({ taskId: second.task.id, mode: "direct" }),
    ]);
    const outcomes = [a, b].map((entry) => entry.status);
    expect(outcomes.sort()).toEqual(["fulfilled", "rejected"]);
    const rejected = [a, b].find((entry) => entry.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(Error);
    expect(
      ((rejected as PromiseRejectedResult).reason as Error).message,
    ).toMatch(/live writer/);
  });
});
