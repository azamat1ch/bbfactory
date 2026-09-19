import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  ACTIVE_ATTEMPT_STATES,
  createAttempt,
  createTask,
  getActiveAttempt,
  getActiveAttemptForWorkspace,
  getAttempt,
  getAttemptByWorkerThread,
  getAttemptRequired,
  getLatestAttemptInStates,
  getTask,
  getTaskRequired,
  insertEvidence,
  listAttempts,
  listAttemptsByState,
  listEvidenceForTask,
  listInterruptedEvidence,
  listTasksByStatus,
  listTasksForProject,
  listTasksForThread,
  markEvidenceStale,
  migrations,
  transitionAttemptState,
  updateAttempt,
  updateEvidence,
  updateTask,
  type Db,
  type FactoryAttemptRow,
  type FactoryEvidenceRow,
  type FactoryTaskRow,
} from "./data.js";
import { buildWorkerPrompt } from "./prompt.js";
import {
  DEFAULT_CHECK_TIMEOUT_MS,
  FACTORY_TASKS_REALTIME_CHANNEL,
  factoryHostContract,
  factoryHostSignals,
  type FactoryAttemptView,
  type FactoryCheckSpec,
  type FactoryCheckSpecInput,
  type FactoryEvidenceView,
  type FactoryTaskView,
  permissionModeInputSchema,
  reasoningLevelInputSchema,
} from "./shared.js";
import { z } from "zod";

const RECONCILE_INTERVAL_MS = 15_000;
const HOST_CALL_TIMEOUT_MS = 60_000;
const CHECK_CALL_TIMEOUT_BUFFER_MS = 60_000;
const WORKER_DISCOVERY_LIMIT = 500;
const WORKSPACE_WATCH_IGNORED = [".git/**"];
const MAX_TITLE_LENGTH = 80;

export interface CreateTaskInput {
  threadId: string;
  goal: string;
  scope?: string | undefined;
  requirementIds?: string[] | undefined;
  checks?: FactoryCheckSpecInput[] | undefined;
}

export interface UpdateTaskInput {
  taskId: string;
  goal?: string | undefined;
  scope?: string | undefined;
  requirementIds?: string[] | undefined;
  checks?: FactoryCheckSpecInput[] | undefined;
}

export interface StartAttemptInput {
  taskId: string;
  mode: "direct" | "delegate";
  providerId?: string | undefined;
  model?: string | undefined;
  reasoningLevel?: z.infer<typeof reasoningLevelInputSchema> | undefined;
  permissionMode?: z.infer<typeof permissionModeInputSchema> | undefined;
}

interface WorkerMetadata {
  factoryWorker?: unknown;
  taskId?: unknown;
  attemptId?: unknown;
}

function normalizeChecks(
  inputs: readonly FactoryCheckSpecInput[] | undefined,
): FactoryCheckSpec[] {
  const checks = inputs ?? [];
  const seen = new Set<string>();
  return checks.map((check, index) => {
    const id = check.id ?? `check-${index + 1}`;
    if (seen.has(id)) throw new Error(`Duplicate check id ${id}`);
    seen.add(id);
    return {
      id,
      argv: [...check.argv],
      timeoutMs: check.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS,
    };
  });
}

function parseTaskChecks(row: FactoryTaskRow): FactoryCheckSpec[] {
  const parsed = JSON.parse(row.checksJson) as FactoryCheckSpec[];
  return parsed;
}

function parseRequirementIds(row: FactoryTaskRow): string[] {
  return JSON.parse(row.requirementIdsJson) as string[];
}

function toTaskView(row: FactoryTaskRow, activeAttemptId: string | null): FactoryTaskView {
  return {
    id: row.id,
    projectId: row.projectId,
    originThreadId: row.originThreadId,
    goal: row.goal,
    scope: row.scope,
    requirementIds: parseRequirementIds(row),
    checks: parseTaskChecks(row),
    specVersion: row.specVersion,
    status: row.status,
    statusDetail: row.statusDetail,
    activeAttemptId,
    acceptedAttemptId: row.acceptedAttemptId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toAttemptView(row: FactoryAttemptRow): FactoryAttemptView {
  return {
    id: row.id,
    taskId: row.taskId,
    seq: row.seq,
    intent: row.intent,
    state: row.state,
    stateDetail: row.stateDetail,
    workerThreadId: row.workerThreadId,
    environmentId: row.environmentId,
    hostId: row.hostId,
    workspacePath: row.workspacePath,
    baseRevision: row.baseRevision,
    baseFingerprint: row.baseFingerprint,
    providerId: row.providerId,
    model: row.model,
    reasoningLevel: row.reasoningLevel,
    permissionMode: row.permissionMode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    finishedAt: row.finishedAt,
  };
}

function toEvidenceView(row: FactoryEvidenceRow): FactoryEvidenceView {
  return {
    id: row.id,
    taskId: row.taskId,
    attemptId: row.attemptId,
    checkId: row.checkId,
    checkArgv: JSON.parse(row.checkArgv) as string[],
    specVersion: row.specVersion,
    contentFingerprint: row.contentFingerprint,
    hostId: row.hostId,
    workspacePath: row.workspacePath,
    status: row.status,
    detail: row.detail,
    exitCode: row.exitCode,
    timedOut: row.timedOut,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    durationMs: row.durationMs,
    logRef: row.logRef,
    outputTail: row.outputTail,
    createdAt: row.createdAt,
  };
}

function isThreadGone(thread: {
  archivedAt: number | null;
  deletedAt: number | null;
}): boolean {
  return thread.archivedAt !== null || thread.deletedAt !== null;
}

function isWriterTerminal(thread: {
  status: string;
  archivedAt: number | null;
  deletedAt: number | null;
}): boolean {
  return (
    thread.deletedAt !== null ||
    thread.status === "idle" ||
    thread.status === "error"
  );
}

function writerTerminalKind(thread: {
  status: string;
  deletedAt: number | null;
}): "idle" | "failed" | "deleted" {
  if (thread.deletedAt !== null) return "deleted";
  if (thread.status === "error") return "failed";
  return "idle";
}

function isWorkspaceClaimConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    /UNIQUE constraint failed: (index 'factory_attempts_workspace_owner_idx'|factory_attempts\.host_id)/.test(
      error.message,
    )
  );
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export interface FactoryService {
  createTask(input: CreateTaskInput): Promise<{ task: FactoryTaskView; previewDirective: string }>;
  updateTaskSpec(input: UpdateTaskInput): Promise<FactoryTaskView>;
  startAttempt(
    input: StartAttemptInput,
  ): Promise<{ task: FactoryTaskView; attempt: FactoryAttemptView }>;
  completeAttempt(taskId: string): Promise<FactoryTaskView>;
  verifyTask(taskId: string): Promise<FactoryTaskView>;
  cancelTask(taskId: string): Promise<FactoryTaskView>;
  getTaskDetail(taskId: string): {
    task: FactoryTaskView;
    attempts: FactoryAttemptView[];
    evidence: FactoryEvidenceView[];
  };
  listTasks(filter: { threadId?: string; projectId?: string }): FactoryTaskView[];
  onThreadIdle(threadId: string): Promise<void>;
  onThreadFailed(threadId: string, error: string | null): Promise<void>;
  onThreadArchived(threadId: string): Promise<void>;
  onThreadDeleted(threadId: string): Promise<void>;
  reconcileOnce(): Promise<void>;
  recoverAfterRestart(): Promise<void>;
  run(signal: AbortSignal): Promise<void>;
  waitForIdle(): Promise<void>;
}

export function createFactoryService(bb: BbPluginApi): FactoryService {
  const db: Db = bb.storage.database();
  bb.storage.migrate(db, migrations);
  const hostClient = bb.hosts.experimental_client({
    contract: factoryHostContract,
    experimental_signals: factoryHostSignals,
  });
  const verifications = new Map<string, Promise<void>>();
  let reconcileInFlight: Promise<void> | null = null;
  let reconcileAgain = false;

  function publish(taskId: string): void {
    const task = getTask(db, taskId);
    if (task === null) return;
    bb.realtime.publish(FACTORY_TASKS_REALTIME_CHANNEL, {
      taskId: task.id,
      threadId: task.originThreadId,
      projectId: task.projectId,
      status: task.status,
    });
  }

  function taskView(taskId: string): FactoryTaskView {
    const row = getTaskRequired(db, taskId);
    const active = getActiveAttempt(db, taskId);
    return toTaskView(row, active?.id ?? null);
  }

  function haltAttempt(
    attempt: FactoryAttemptRow,
    detail: string,
  ): FactoryAttemptRow {
    return updateAttempt(db, attempt.id, {
      state: "halted",
      stateDetail: detail,
      finishedAt: Date.now(),
    });
  }

  function settleAttempt(
    attempt: FactoryAttemptRow,
    detail: string | null,
  ): void {
    transitionAttemptState(
      db,
      attempt.id,
      ["completed", "verifying"],
      "settled",
      detail,
    );
  }

  async function resolveOriginWorkspace(threadId: string): Promise<{
    projectId: string;
    environmentId: string;
    hostId: string;
    path: string;
  }> {
    const thread = await bb.sdk.threads.get({ threadId });
    if (isThreadGone(thread)) {
      throw new Error("The origin thread is archived or deleted");
    }
    if (thread.environmentId === null) {
      throw new Error("The origin thread has no environment yet");
    }
    const environment = await bb.sdk.environments.get({
      environmentId: thread.environmentId,
    });
    if (environment.path === null) {
      throw new Error("The origin environment has no workspace path yet");
    }
    return {
      projectId: thread.projectId,
      environmentId: environment.id,
      hostId: environment.hostId,
      path: environment.path,
    };
  }

  async function captureBaseState(
    attemptId: string,
    hostId: string,
    path: string,
  ): Promise<void> {
    try {
      const state = await hostClient.call(
        "captureState",
        { rootPath: path },
        { hostId, timeoutMs: HOST_CALL_TIMEOUT_MS },
      );
      updateAttempt(db, attemptId, {
        baseRevision: state.head,
        baseFingerprint: state.fingerprint,
      });
    } catch (error) {
      bb.log.warn(
        `base workspace capture failed for attempt ${attemptId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async function armWorkspaceWatch(
    taskId: string,
    hostId: string,
    path: string,
  ): Promise<boolean> {
    try {
      await hostClient.call(
        "watchWorkspace",
        { key: taskId, rootPath: path, ignoredPaths: [...WORKSPACE_WATCH_IGNORED] },
        { hostId, timeoutMs: HOST_CALL_TIMEOUT_MS },
      );
      return true;
    } catch (error) {
      bb.log.warn(
        `workspace watch failed for task ${taskId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  async function unwatchWorkspace(task: FactoryTaskRow): Promise<void> {
    const attempt = getLatest(db, task.id);
    if (attempt?.hostId === null || attempt?.hostId === undefined) return;
    try {
      await hostClient.call(
        "unwatchWorkspace",
        { key: task.id },
        { hostId: attempt.hostId, timeoutMs: HOST_CALL_TIMEOUT_MS },
      );
    } catch {}
  }

  function getLatest(dbHandle: Db, taskId: string): FactoryAttemptRow | null {
    const attempts = listAttempts(dbHandle, taskId);
    return attempts.at(-1) ?? null;
  }

  function scheduleVerification(taskId: string): void {
    if (verifications.has(taskId)) return;
    const promise = runVerification(taskId)
      .catch((error) => {
        bb.log.warn(
          `verification failed for task ${taskId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        const stuck = getLatestAttemptInStates(db, taskId, ["verifying"]);
        if (stuck !== null) settleVerifiedAttempt(stuck.id);
        const current = getTask(db, taskId);
        if (current !== null && current.status === "awaiting_checks") {
          updateTask(db, taskId, {
            status: "blocked",
            statusDetail: `Verification error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          });
          publish(taskId);
        }
      })
      .finally(() => {
        verifications.delete(taskId);
      });
    verifications.set(taskId, promise);
  }

  function settleVerifiedAttempt(attemptId: string): void {
    transitionAttemptState(
      db,
      attemptId,
      ["verifying"],
      "verified",
      "Verification finished; workspace released",
    );
  }

  async function runVerification(taskId: string): Promise<void> {
    const taskAtStart = getTask(db, taskId);
    if (taskAtStart === null) return;
    if (
      taskAtStart.status === "cancelled" ||
      taskAtStart.status === "cancelling"
    ) {
      return;
    }
    const candidate = getLatestAttemptInStates(db, taskId, [
      "completed",
      "verifying",
      "verified",
    ]);
    if (candidate === null) {
      updateTask(db, taskId, {
        status: "blocked",
        statusDetail: "No completed attempt to verify",
      });
      publish(taskId);
      return;
    }
    let attempt = candidate;
    if (attempt.state !== "verifying") {
      try {
        const claimed = transitionAttemptState(
          db,
          attempt.id,
          ["completed", "verified"],
          "verifying",
          "Declared checks running independently",
        );
        if (claimed === null) return;
        attempt = claimed;
      } catch (error) {
        if (isWorkspaceClaimConflict(error)) {
          markEvidenceStale(
            db,
            taskId,
            "Workspace re-claimed by another live writer",
          );
          updateTask(db, taskId, {
            status: "blocked",
            statusDetail:
              "Workspace is owned by another live writer; this attempt's evidence can no longer be refreshed",
          });
          publish(taskId);
          return;
        }
        throw error;
      }
    }
    const taskRow = getTaskRequired(db, taskId);
    if (taskRow.status !== "awaiting_checks") {
      updateTask(db, taskId, { status: "awaiting_checks" });
      publish(taskId);
    }
    const currentTask = getTaskRequired(db, taskId);
    const checks = parseTaskChecks(currentTask);
    const specVersion = currentTask.specVersion;
    const finishBlocked = (detail: string, unknownWriter: boolean): void => {
      if (unknownWriter) {
        transitionAttemptState(db, attempt.id, ["verifying"], "halted", detail);
      } else {
        settleVerifiedAttempt(attempt.id);
      }
      const latest = getTaskRequired(db, taskId);
      if (latest.status === "awaiting_checks") {
        updateTask(db, taskId, { status: "blocked", statusDetail: detail });
      } else if (latest.status === "cancelling") {
        updateTask(db, taskId, { status: "cancelled", statusDetail: null });
      }
      publish(taskId);
    };
    if (attempt.hostId === null || attempt.workspacePath === null) {
      finishBlocked("Attempt has no resolved host or workspace path", false);
      return;
    }
    if (checks.length === 0) {
      finishBlocked("No declared checks to verify against", false);
      return;
    }
    const hostId = attempt.hostId;
    const workspacePath = attempt.workspacePath;
    const pre = await hostClient.call(
      "captureState",
      { rootPath: workspacePath },
      { hostId, timeoutMs: HOST_CALL_TIMEOUT_MS },
    );
    if (pre.incomplete) {
      finishBlocked(
        `Workspace snapshot incomplete — quiescence cannot be proven: ${
          pre.incompleteReasons.join("; ") || "unknown reason"
        }`,
        true,
      );
      return;
    }
    const runEvidenceIds: string[] = [];
    for (const check of checks) {
      const evidence = insertEvidence(db, {
        taskId,
        attemptId: attempt.id,
        checkId: check.id,
        checkArgv: JSON.stringify(check.argv),
        specVersion,
        contentFingerprint: pre.fingerprint,
        hostId,
        workspacePath,
        status: "running",
      });
      runEvidenceIds.push(evidence.id);
      publish(taskId);
      try {
        const result = await hostClient.call(
          "runCheck",
          {
            rootPath: workspacePath,
            argv: check.argv,
            timeoutMs: check.timeoutMs,
            logFileName: `${evidence.id}.log`,
          },
          {
            hostId,
            timeoutMs: check.timeoutMs + CHECK_CALL_TIMEOUT_BUFFER_MS,
          },
        );
        const unsettled = result.processTreeSettled === false;
        updateEvidence(db, evidence.id, {
          status: unsettled
            ? "incomplete"
            : result.exitCode === 0 && !result.timedOut
              ? "passed"
              : "failed",
          detail: unsettled
            ? "Check killed on timeout but its process tree was not confirmed settled; a stray process may still write to the workspace"
            : result.exitCode === 0 && !result.timedOut
              ? null
              : result.timedOut
                ? `Timed out after ${check.timeoutMs} ms`
                : `Exit code ${result.exitCode ?? "unknown"}`,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          startedAt: result.startedAt,
          finishedAt: result.finishedAt,
          durationMs: result.durationMs,
          logRef: result.logPath,
          outputTail: result.outputTail,
        });
      } catch (error) {
        updateEvidence(db, evidence.id, {
          status: "incomplete",
          detail:
            `Check call failed: ${error instanceof Error ? error.message : String(error)}; ` +
            "the check process may still be running — fate unknown",
          finishedAt: Date.now(),
        });
        publish(taskId);
        break;
      }
      publish(taskId);
    }
    const post = await hostClient.call(
      "captureState",
      { rootPath: workspacePath },
      { hostId, timeoutMs: HOST_CALL_TIMEOUT_MS },
    );
    if (post.incomplete) {
      for (const evidenceId of runEvidenceIds) {
        updateEvidence(db, evidenceId, {
          status: "incomplete",
          detail: `Post-check workspace snapshot incomplete: ${
            post.incompleteReasons.join("; ") || "unknown reason"
          }`,
        });
      }
      finishBlocked(
        "Post-check workspace snapshot incomplete — quiescence cannot be proven",
        true,
      );
      return;
    }
    const results = runEvidenceIds.map(
      (id) =>
        db
          .prepare(`SELECT status FROM factory_evidence WHERE id = ?`)
          .get(id) as { status: string },
    );
    const unsettledIndex = results.findIndex(
      (row) => row.status === "incomplete",
    );
    const current = getTaskRequired(db, taskId);
    const specChanged = current.specVersion !== specVersion;
    const contentChanged = post.fingerprint !== pre.fingerprint;
    if (specChanged) {
      markEvidenceStale(db, taskId, "Task spec changed during verification");
    }
    if (contentChanged) {
      markEvidenceStale(
        db,
        taskId,
        "Workspace content changed during verification",
      );
    }
    if (unsettledIndex !== -1) {
      finishBlocked(
        `Check ${
          checks[unsettledIndex]?.id ?? "?"
        } left a process whose fate is unknown; a stray process may still ` +
          `write — workspace ownership retained`,
        true,
      );
      return;
    }
    if (specChanged) {
      finishBlocked("Task spec changed during verification; re-verify", false);
      return;
    }
    if (contentChanged) {
      finishBlocked(
        "Workspace content changed during verification — a live writer exists; re-verify",
        true,
      );
      return;
    }
    if (current.status !== "awaiting_checks") {
      settleVerifiedAttempt(attempt.id);
      if (current.status === "cancelling") {
        updateTask(db, taskId, { status: "cancelled", statusDetail: null });
      }
      publish(taskId);
      return;
    }
    const failed = results.findIndex((row) => row.status !== "passed");
    if (failed === -1) {
      updateTask(db, taskId, {
        status: "accepted",
        statusDetail: null,
        acceptedAttemptId: attempt.id,
        acceptedFingerprint: pre.fingerprint,
      });
      settleVerifiedAttempt(attempt.id);
      publish(taskId);
      const armed = await armWorkspaceWatch(taskId, hostId, workspacePath);
      if (!armed) {
        markEvidenceStale(
          db,
          taskId,
          "Workspace watch could not be armed after acceptance",
        );
        updateTask(db, taskId, {
          status: "blocked",
          statusDetail:
            "Workspace watch could not be armed; post-acceptance changes would go undetected — re-verify",
        });
        publish(taskId);
      }
      return;
    }
    const check = checks[failed];
    updateTask(db, taskId, {
      status: "failed",
      statusDetail: `Check ${check?.id ?? "?"} did not pass`,
    });
    settleVerifiedAttempt(attempt.id);
    publish(taskId);
    void armWorkspaceWatch(taskId, hostId, workspacePath);
  }

  function recordWorkerCompletion(attempt: FactoryAttemptRow): void {
    if (attempt.state !== "running") return;
    updateAttempt(db, attempt.id, {
      state: "completed",
      finishedAt: Date.now(),
    });
    const task = getTaskRequired(db, attempt.taskId);
    if (task.status !== "cancelled" && task.status !== "cancelling") {
      updateTask(db, task.id, { status: "awaiting_checks", statusDetail: null });
    }
    publish(task.id);
    if (task.status !== "cancelled" && task.status !== "cancelling") {
      scheduleVerification(task.id);
    }
  }

  async function requestWorkerStop(attempt: FactoryAttemptRow): Promise<void> {
    if (attempt.workerThreadId === null) return;
    try {
      await bb.sdk.threads.stop({ threadId: attempt.workerThreadId });
      updateAttempt(db, attempt.id, {
        stateDetail: "Stop requested; awaiting worker termination",
      });
    } catch (error) {
      updateAttempt(db, attempt.id, {
        stateDetail: `Stop request failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }

  function settleCancelled(
    attempt: FactoryAttemptRow,
    terminal: "idle" | "failed" | "deleted",
  ): void {
    if (attempt.state === "cancelling" || attempt.state === "running") {
      if (attempt.intent === "direct" && terminal === "idle") {
        transitionAttemptState(
          db,
          attempt.id,
          ["cancelling", "running"],
          "settled",
          "The lead turn finished organically — no stop was requested, so the workspace is released",
        );
      } else {
        haltAttempt(
          attempt,
          `Writer reached terminal state "${terminal}" after a stop request or ` +
            "non-organic ending; requested stops and teardown do not prove " +
            "detached processes exited — the workspace stays claimed until " +
            "verified-stop evidence exists",
        );
      }
    }
    const task = getTaskRequired(db, attempt.taskId);
    if (task.status === "cancelling") {
      updateTask(db, task.id, { status: "cancelled", statusDetail: null });
      publish(task.id);
    }
  }

  function handleWorkerTerminal(
    attempt: FactoryAttemptRow,
    terminal: "idle" | "failed" | "deleted" | "archived",
    error: string | null,
  ): void {
    if (terminal === "archived") {
      updateAttempt(db, attempt.id, {
        stateDetail:
          "Thread archived; archival does not prove the writer stopped — ownership retained until a terminal state is observed",
      });
      if (attempt.intent === "delegate") {
        void requestWorkerStop(attempt);
      }
      publish(attempt.taskId);
      return;
    }
    if (attempt.state === "cancelling") {
      settleCancelled(attempt, terminal);
      return;
    }
    if (attempt.state !== "running") return;
    if (terminal === "idle") {
      recordWorkerCompletion(attempt);
      return;
    }
    if (attempt.intent === "direct" && terminal === "deleted") {
      haltAttempt(
        attempt,
        "Origin thread was deleted; stray processes may still write — workspace stays claimed",
      );
      updateTask(db, attempt.taskId, {
        status: "cancelled",
        statusDetail: "Origin thread was deleted",
      });
      publish(attempt.taskId);
      return;
    }
    haltAttempt(
      attempt,
      terminal === "failed"
        ? `Writer failed: ${error ?? "unknown error"}; stray processes may still write — workspace stays claimed`
        : "Worker thread was deleted; stray processes may still write — workspace stays claimed",
    );
    const task = getTaskRequired(db, attempt.taskId);
    if (task.status === "running" || task.status === "awaiting_checks") {
      updateTask(db, task.id, {
        status: "blocked",
        statusDetail:
          terminal === "failed"
            ? `Worker failed: ${error ?? "unknown error"}`
            : "Worker thread was deleted",
      });
      publish(task.id);
    }
  }

  async function attachDiscoveredWorker(
    attempt: FactoryAttemptRow,
    workerThreadId: string,
  ): Promise<void> {
    updateAttempt(db, attempt.id, {
      workerThreadId,
      state: "running",
      stateDetail: "Worker thread recovered after uncertain spawn",
    });
    const task = getTaskRequired(db, attempt.taskId);
    if (task.status === "cancelling" || task.status === "cancelled") {
      updateAttempt(db, attempt.id, { state: "cancelling" });
      await requestWorkerStop(getAttemptRequired(db, attempt.id));
      return;
    }
    if (task.status === "blocked" || task.status === "running") {
      updateTask(db, task.id, {
        status: "running",
        statusDetail: null,
      });
    }
    publish(task.id);
  }

  async function discoverWorkers(): Promise<void> {
    const unresolved = listAttemptsByState(db, ["spawning", "uncertain"]).filter(
      (attempt) => attempt.intent === "delegate",
    );
    if (unresolved.length === 0) return;
    const threads = await bb.sdk.threads.list({
      originPluginId: bb.pluginId,
      includeHidden: true,
      limit: WORKER_DISCOVERY_LIMIT,
    });
    for (const thread of threads) {
      let metadata: WorkerMetadata;
      try {
        metadata = (await bb.sdk.threads.getPluginMetadata({
          threadId: thread.id,
        })) as WorkerMetadata;
      } catch {
        continue;
      }
      if (metadata.factoryWorker !== 1) continue;
      const attemptId =
        typeof metadata.attemptId === "string" ? metadata.attemptId : null;
      if (attemptId === null) continue;
      const attempt = unresolved.find((row) => row.id === attemptId);
      if (attempt === undefined) continue;
      await attachDiscoveredWorker(attempt, thread.id);
    }
  }

  async function pollLiveWorkers(): Promise<void> {
    const live = listAttemptsByState(db, ["running", "cancelling"]).filter(
      (attempt) => attempt.workerThreadId !== null,
    );
    for (const attempt of live) {
      const workerThreadId = attempt.workerThreadId;
      if (workerThreadId === null) continue;
      let thread;
      try {
        thread = await bb.sdk.threads.get({ threadId: workerThreadId });
      } catch (error) {
        updateAttempt(db, attempt.id, {
          stateDetail: `Writer status unknown: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
        continue;
      }
      if (thread.deletedAt !== null) {
        handleWorkerTerminal(attempt, "deleted", null);
        continue;
      }
      if (thread.status === "idle") {
        handleWorkerTerminal(attempt, "idle", null);
      } else if (thread.status === "error") {
        handleWorkerTerminal(attempt, "failed", "Writer thread is in error");
      } else if (thread.archivedAt !== null) {
        handleWorkerTerminal(attempt, "archived", null);
      }
    }
  }

  async function reconcileOnceInternal(): Promise<void> {
    await discoverWorkers();
    await pollLiveWorkers();
  }

  async function runReconcile(): Promise<void> {
    do {
      reconcileAgain = false;
      await reconcileOnceInternal();
    } while (reconcileAgain);
  }

  async function startDelegate(
    task: FactoryTaskRow,
    attempt: FactoryAttemptRow,
  ): Promise<void> {
    const prompt = buildWorkerPrompt(toTaskView(task, attempt.id));
    const title =
      task.goal.length > MAX_TITLE_LENGTH
        ? `${task.goal.slice(0, MAX_TITLE_LENGTH - 1)}…`
        : task.goal;
    if (attempt.environmentId === null) {
      throw new Error("Attempt has no environment");
    }
    try {
      const thread = await bb.sdk.threads.spawn({
        projectId: task.projectId,
        environment: {
          type: "reuse",
          environmentId: attempt.environmentId,
        },
        lifecycleOwnerThreadId: task.originThreadId,
        pluginMetadata: {
          factoryWorker: 1,
          taskId: task.id,
          attemptId: attempt.id,
          originThreadId: task.originThreadId,
        },
        prompt,
        title,
        ...(attempt.providerId !== null
          ? { providerId: attempt.providerId }
          : {}),
        ...(attempt.model !== null ? { model: attempt.model } : {}),
        ...(attempt.reasoningLevel !== null
          ? {
              reasoningLevel: attempt.reasoningLevel as z.infer<
                typeof reasoningLevelInputSchema
              >,
            }
          : {}),
        ...(attempt.permissionMode !== null
          ? {
              permissionMode:
                attempt.permissionMode === "workspace-write"
                  ? ("accept-edits" as const)
                  : (attempt.permissionMode as "accept-edits" | "auto" | "full"),
            }
          : {}),
        visibility: "hidden",
      });
      const current = getTaskRequired(db, task.id);
      if (current.status === "cancelling" || current.status === "cancelled") {
        updateAttempt(db, attempt.id, {
          workerThreadId: thread.id,
          state: "cancelling",
        });
        await requestWorkerStop(
          getAttemptRequired(db, attempt.id),
        );
        return;
      }
      updateAttempt(db, attempt.id, {
        workerThreadId: thread.id,
        state: "running",
        stateDetail: null,
      });
      publish(task.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const current = getTaskRequired(db, task.id);
      if (current.status === "cancelling") {
        updateAttempt(db, attempt.id, {
          state: "cancelling",
          stateDetail: `Spawn outcome unknown: ${message}`,
        });
        publish(task.id);
        return;
      }
      updateAttempt(db, attempt.id, {
        state: "uncertain",
        stateDetail:
          `Spawn outcome unknown (${message}); a live writer may exist — reconciling`,
      });
      updateTask(db, task.id, {
        status: "blocked",
        statusDetail:
          "Worker spawn outcome is unknown; a writer may be live. Reconciliation is running; cancel or wait.",
      });
      publish(task.id);
      void service.reconcileOnce().catch((reconcileError) =>
        bb.log.warn(
          `post-spawn reconcile failed: ${
            reconcileError instanceof Error
              ? reconcileError.message
              : String(reconcileError)
          }`,
        ),
      );
    }
  }

  const service: FactoryService = {
    async createTask(input) {
      const thread = await bb.sdk.threads.get({ threadId: input.threadId });
      if (isThreadGone(thread)) {
        throw new Error("The origin thread is archived or deleted");
      }
      const checks = normalizeChecks(input.checks);
      const row = createTask(db, {
        projectId: thread.projectId,
        originThreadId: thread.id,
        goal: input.goal,
        scope: input.scope ?? "",
        requirementIds: input.requirementIds ?? [],
        checks,
      });
      publish(row.id);
      return {
        task: taskView(row.id),
        previewDirective: `::factory-task{task="${row.id}"}`,
      };
    },

    async updateTaskSpec(input) {
      const task = getTaskRequired(db, input.taskId);
      if (task.status === "cancelled") {
        throw new Error(`Task ${task.id} is cancelled`);
      }
      const patch: Parameters<typeof updateTask>[2] = {};
      let specChanged = false;
      if (input.goal !== undefined && input.goal !== task.goal) {
        patch.goal = input.goal;
        specChanged = true;
      }
      if (input.scope !== undefined && input.scope !== task.scope) {
        patch.scope = input.scope;
        specChanged = true;
      }
      if (input.requirementIds !== undefined) {
        const next = JSON.stringify(input.requirementIds);
        if (next !== task.requirementIdsJson) {
          patch.requirementIdsJson = next;
          specChanged = true;
        }
      }
      if (input.checks !== undefined) {
        const normalized = normalizeChecks(input.checks);
        const next = JSON.stringify(normalized);
        if (next !== task.checksJson) {
          patch.checksJson = next;
          specChanged = true;
        }
      }
      if (specChanged) {
        patch.specVersion = task.specVersion + 1;
        markEvidenceStale(db, task.id, "Task spec changed");
        if (task.status === "accepted" || task.status === "failed") {
          patch.status = "blocked";
          patch.statusDetail = "Task spec changed; previous evidence is stale";
        } else if (task.status === "awaiting_checks") {
          patch.statusDetail = "Task spec changed during verification";
        }
      }
      const updated = updateTask(db, task.id, patch);
      publish(updated.id);
      return taskView(updated.id);
    },

    async startAttempt(input) {
      const task = getTaskRequired(db, input.taskId);
      if (task.status === "cancelled") {
        throw new Error(`Task ${task.id} is cancelled`);
      }
      if (task.status === "cancelling") {
        throw new Error(`Task ${task.id} is cancelling; wait for it to settle`);
      }
      const active = getActiveAttempt(db, task.id);
      if (active !== null) {
        throw new Error(
          `Task ${task.id} already has an active attempt ${active.id} ` +
            `(${active.state}); a writer may still exist — cancel first`,
        );
      }
      const workspace = await resolveOriginWorkspace(task.originThreadId);
      if (input.mode === "delegate") {
        if (input.providerId === undefined) {
          throw new Error("Delegated attempts require --provider");
        }
        const providers = await bb.sdk.providers.list({
          environmentId: workspace.environmentId,
        });
        const provider = providers.find(
          (entry) => entry.id === input.providerId,
        );
        if (provider === undefined || !provider.available) {
          throw new Error(
            `Provider ${input.providerId} is not available on this environment`,
          );
        }
      }
      const occupant = getActiveAttemptForWorkspace(
        db,
        workspace.hostId,
        workspace.path,
      );
      if (occupant !== null) {
        throw new Error(
          `Workspace ${workspace.path} on host ${workspace.hostId} already ` +
            `has a live writer (attempt ${occupant.id} on task ` +
            `${occupant.taskId}, state ${occupant.state}); no replacement ` +
            `writer may start until it reaches a confirmed terminal state`,
        );
      }
      let attempt: FactoryAttemptRow;
      try {
        attempt = createAttempt(db, {
          taskId: task.id,
          intent: input.mode,
          originThreadId: task.originThreadId,
          workerThreadId:
            input.mode === "direct" ? task.originThreadId : null,
          environmentId: workspace.environmentId,
          hostId: workspace.hostId,
          workspacePath: workspace.path,
          providerId: input.providerId ?? null,
          model: input.model ?? null,
          reasoningLevel: input.reasoningLevel ?? null,
          permissionMode: input.permissionMode ?? null,
          state: input.mode === "direct" ? "running" : "spawning",
        });
      } catch (error) {
        if (isWorkspaceClaimConflict(error)) {
          const winner = getActiveAttemptForWorkspace(
            db,
            workspace.hostId,
            workspace.path,
          );
          throw new Error(
            `Workspace ${workspace.path} on host ${workspace.hostId} already ` +
              `has a live writer (attempt ${winner?.id ?? "unknown"}); no ` +
              `replacement writer may start until it reaches a confirmed ` +
              `terminal state`,
          );
        }
        throw error;
      }
      updateTask(db, task.id, { status: "running", statusDetail: null });
      publish(task.id);
      void captureBaseState(attempt.id, workspace.hostId, workspace.path);
      if (input.mode === "delegate") {
        await startDelegate(task, getAttemptRequired(db, attempt.id));
      }
      return {
        task: taskView(task.id),
        attempt: toAttemptView(getAttemptRequired(db, attempt.id)),
      };
    },

    async completeAttempt(taskId) {
      const task = getTaskRequired(db, taskId);
      const attempt = getLatestAttemptInStates(db, task.id, ["running"]);
      if (attempt === null) {
        throw new Error(`Task ${task.id} has no running attempt to complete`);
      }
      if (attempt.workerThreadId === null) {
        throw new Error(
          `Attempt ${attempt.id} has no recorded writer thread; its spawn outcome is unknown — reconcile first`,
        );
      }
      let thread;
      try {
        thread = await bb.sdk.threads.get({
          threadId: attempt.workerThreadId,
        });
      } catch (error) {
        updateAttempt(db, attempt.id, {
          stateDetail: `Writer state could not be confirmed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
        throw new Error(
          `Cannot confirm writer ${attempt.workerThreadId} reached a terminal ` +
            `state; the attempt keeps the workspace`,
        );
      }
      if (!isWriterTerminal(thread)) {
        throw new Error(
          `Writer thread ${attempt.workerThreadId} is still ` +
            `${thread.status}${
              thread.archivedAt !== null ? " (archived)" : ""
            }; completion requires a confirmed terminal state`,
        );
      }
      if (thread.deletedAt !== null) {
        handleWorkerTerminal(attempt, "deleted", null);
      } else if (thread.status === "error") {
        handleWorkerTerminal(attempt, "failed", "Writer thread is in error");
      } else {
        recordWorkerCompletion(attempt);
      }
      return taskView(task.id);
    },

    async verifyTask(taskId) {
      const task = getTaskRequired(db, taskId);
      if (task.status === "cancelled" || task.status === "cancelling") {
        throw new Error(`Task ${task.id} is ${task.status}`);
      }
      const latest = getLatest(db, task.id);
      if (latest === null) {
        throw new Error(`Task ${task.id} has no attempt to verify`);
      }
      if (latest.state === "verifying") {
        return taskView(task.id);
      }
      if (latest.state !== "completed" && latest.state !== "verified") {
        throw new Error(
          `Task ${task.id} cannot be verified while its attempt is ` +
            `${latest.state}; the writer may still be live`,
        );
      }
      updateTask(db, task.id, {
        status: "awaiting_checks",
        statusDetail: null,
      });
      publish(task.id);
      scheduleVerification(task.id);
      return taskView(task.id);
    },

    async cancelTask(taskId) {
      const task = getTaskRequired(db, taskId);
      if (task.status === "cancelled") return taskView(task.id);
      const active = getActiveAttempt(db, task.id);
      if (active === null) {
        updateTask(db, task.id, { status: "cancelled", statusDetail: null });
        publish(task.id);
        void unwatchWorkspace(task);
        return taskView(task.id);
      }
      if (active.state === "spawning" || active.state === "uncertain") {
        updateTask(db, task.id, {
          status: "cancelling",
          statusDetail:
            "Cancellation pending: spawn outcome is still unknown; a discovered writer will be stopped",
        });
        publish(task.id);
        return taskView(task.id);
      }
      if (active.state === "cancelling") {
        return taskView(task.id);
      }
      if (active.state === "halted") {
        updateTask(db, task.id, {
          status: "cancelled",
          statusDetail:
            "Cancelled; the halted writer keeps the workspace claimed — detached processes may still write",
        });
        publish(task.id);
        void unwatchWorkspace(task);
        return taskView(task.id);
      }
      if (active.state === "completed") {
        settleAttempt(
          active,
          "Cancelled by user; the writer finished organically before cancellation, so the workspace is released",
        );
        updateTask(db, task.id, { status: "cancelled", statusDetail: null });
        publish(task.id);
        void unwatchWorkspace(task);
        return taskView(task.id);
      }
      if (active.state === "verifying") {
        updateTask(db, task.id, {
          status: "cancelling",
          statusDetail:
            "Cancellation pending: in-flight verification must settle before the workspace is released",
        });
        publish(task.id);
        return taskView(task.id);
      }
      if (active.intent === "direct") {
        updateAttempt(db, active.id, {
          state: "cancelling",
          stateDetail:
            "Cancellation pending: waiting for the lead turn to reach a terminal state; the lead thread is not stopped",
        });
        updateTask(db, task.id, {
          status: "cancelling",
          statusDetail:
            "Cancellation pending: waiting for the lead turn to finish",
        });
        publish(task.id);
        if (active.workerThreadId !== null) {
          try {
            const thread = await bb.sdk.threads.get({
              threadId: active.workerThreadId,
            });
            if (isWriterTerminal(thread)) {
              settleCancelled(
                getAttemptRequired(db, active.id),
                writerTerminalKind(thread),
              );
            }
          } catch {
            updateAttempt(db, active.id, {
              stateDetail: "Lead state unknown; still reconciling",
            });
          }
        }
        return taskView(task.id);
      }
      updateAttempt(db, active.id, { state: "cancelling" });
      updateTask(db, task.id, {
        status: "cancelling",
        statusDetail: "Stop requested; awaiting worker termination",
      });
      publish(task.id);
      await requestWorkerStop(active);
      if (active.workerThreadId !== null) {
        try {
          const thread = await bb.sdk.threads.get({
            threadId: active.workerThreadId,
          });
          if (isWriterTerminal(thread)) {
            settleCancelled(
              getAttemptRequired(db, active.id),
              writerTerminalKind(thread),
            );
          }
        } catch {
          updateAttempt(db, active.id, {
            stateDetail: "Stop outcome unknown; still reconciling",
          });
        }
      }
      return taskView(task.id);
    },

    getTaskDetail(taskId) {
      const row = getTaskRequired(db, taskId);
      const active = getActiveAttempt(db, taskId);
      return {
        task: toTaskView(row, active?.id ?? null),
        attempts: listAttempts(db, taskId).map(toAttemptView),
        evidence: listEvidenceForTask(db, taskId).map(toEvidenceView),
      };
    },

    listTasks(filter) {
      const rows =
        filter.threadId !== undefined
          ? listTasksForThread(db, filter.threadId)
          : filter.projectId !== undefined
            ? listTasksForProject(db, filter.projectId, 200)
            : [];
      return rows.map((row) =>
        toTaskView(row, getActiveAttempt(db, row.id)?.id ?? null),
      );
    },

    async onThreadIdle(threadId) {
      const attempt = getAttemptByWorkerThread(db, threadId);
      if (attempt === null) return;
      handleWorkerTerminal(attempt, "idle", null);
    },

    async onThreadFailed(threadId, error) {
      const attempt = getAttemptByWorkerThread(db, threadId);
      if (attempt === null) return;
      handleWorkerTerminal(attempt, "failed", error);
    },

    async onThreadArchived(threadId) {
      const attempt = getAttemptByWorkerThread(db, threadId);
      if (attempt === null) return;
      handleWorkerTerminal(attempt, "archived", null);
    },

    async onThreadDeleted(threadId) {
      const attempt = getAttemptByWorkerThread(db, threadId);
      if (attempt === null) return;
      handleWorkerTerminal(attempt, "deleted", null);
    },

    async reconcileOnce() {
      if (reconcileInFlight !== null) {
        reconcileAgain = true;
        return reconcileInFlight;
      }
      reconcileInFlight = runReconcile().finally(() => {
        reconcileInFlight = null;
      });
      return reconcileInFlight;
    },

    async recoverAfterRestart() {
      const interruptedAttemptIds = new Set<string>();
      for (const evidence of listInterruptedEvidence(db)) {
        updateEvidence(db, evidence.id, {
          status: "incomplete",
          detail:
            "Verification interrupted by plugin restart; the check process " +
            "may still be running — fate unknown",
          finishedAt: Date.now(),
        });
        interruptedAttemptIds.add(evidence.attemptId);
      }
      for (const attemptId of interruptedAttemptIds) {
        const attempt = getAttempt(db, attemptId);
        if (attempt === null) continue;
        transitionAttemptState(
          db,
          attempt.id,
          ["verifying"],
          "halted",
          "Restart interrupted a check run; its process may still be alive — workspace stays claimed",
        );
        const task = getTaskRequired(db, attempt.taskId);
        if (
          task.status === "awaiting_checks" ||
          task.status === "running"
        ) {
          updateTask(db, task.id, {
            status: "blocked",
            statusDetail:
              "Verification was interrupted by a restart with a check in " +
              "flight; its process fate is unknown — the workspace stays " +
              "claimed until the writer is proven stopped",
          });
          publish(task.id);
        }
      }
      for (const task of listTasksByStatus(db, ["awaiting_checks"])) {
        const latest = getLatest(db, task.id);
        if (latest !== null && interruptedAttemptIds.has(latest.id)) continue;
        scheduleVerification(task.id);
      }
      for (const task of listTasksByStatus(db, ["accepted", "failed"])) {
        const attempt =
          task.acceptedAttemptId !== null
            ? getAttempt(db, task.acceptedAttemptId)
            : getLatest(db, task.id);
        const failClosed = (detail: string): void => {
          if (task.status !== "accepted") return;
          markEvidenceStale(db, task.id, detail);
          updateTask(db, task.id, { status: "blocked", statusDetail: detail });
          publish(task.id);
        };
        if (
          attempt === null ||
          attempt.hostId === null ||
          attempt.workspacePath === null
        ) {
          failClosed(
            "Cannot reconfirm accepted content after restart: no resolved workspace",
          );
          continue;
        }
        if (task.status === "accepted") {
          let state;
          try {
            state = await hostClient.call(
              "captureState",
              { rootPath: attempt.workspacePath },
              { hostId: attempt.hostId, timeoutMs: HOST_CALL_TIMEOUT_MS },
            );
          } catch (error) {
            failClosed(
              `Post-restart workspace recapture failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            continue;
          }
          if (state.incomplete) {
            failClosed(
              `Post-restart workspace snapshot incomplete: ${
                state.incompleteReasons.join("; ") || "unknown reason"
              }`,
            );
            continue;
          }
          if (state.fingerprint !== task.acceptedFingerprint) {
            failClosed(
              "Workspace content changed while the plugin was down; previous evidence is stale",
            );
            continue;
          }
        }
        const armed = await armWorkspaceWatch(
          task.id,
          attempt.hostId,
          attempt.workspacePath,
        );
        if (!armed) {
          failClosed(
            "Workspace watch could not be armed after restart; post-acceptance changes would go undetected",
          );
        }
      }
      await reconcileOnceInternal();
    },

    async run(signal) {
      while (!signal.aborted) {
        try {
          await reconcileOnceInternal();
        } catch (error) {
          bb.log.warn(
            `factory reconcile failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        await sleep(RECONCILE_INTERVAL_MS, signal);
      }
    },

    async waitForIdle() {
      while (verifications.size > 0) {
        await Promise.all([...verifications.values()]);
      }
    },
  };

  hostClient.experimental_onSignal("workspaceChanged", (event) => {
    const taskId = event.payload.key;
    const task = getTask(db, taskId);
    if (task === null) return;
    const changed = markEvidenceStale(
      db,
      taskId,
      "Workspace content changed after verification",
    );
    if (task.status === "accepted" || task.status === "failed") {
      updateTask(db, taskId, {
        status: "blocked",
        statusDetail:
          "Workspace content changed after verification; re-verify",
      });
    }
    if (changed > 0 || task.status === "accepted" || task.status === "failed") {
      publish(taskId);
    }
  });

  return service;
}
