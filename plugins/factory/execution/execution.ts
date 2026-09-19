import { hasWorkspaceConflict } from "./workspace-ownership.js";
import { createExecutionSupervision } from "./execution-supervision.js";
import { workflowHostContract } from "./host-contract.js";
import { createHash } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { Db } from "./data.js";
import {
  executionStartSchema,
  workflowExecutionRpcContract,
  type ExecutionIdentity,
  type ExecutionStart,
  type ExecutionSnapshot,
} from "./execution-contract.js";
import type { WorkflowService } from "./service.js";

export function executionRunId(input: ExecutionIdentity): string {
  return `wfr_exec_${createHash("sha256")
    .update(
      JSON.stringify([
        input.originThreadId,
        input.callerTaskId,
        input.launchId,
      ]),
    )
    .digest("hex")}`;
}

export function executionSource(
  input: ExecutionStart,
  groups: Record<string, string>,
): string {
  const assignments = input.assignments.map((assignment) => {
    const options = {
      title: assignment.id,
      provider: assignment.providerId,
      model: assignment.model,
      reasoningLevel: assignment.reasoningLevel,
    };
    const prompt = `${assignment.prompt}\n\nDeclared coordination scope (advisory, not filesystem confinement): ${assignment.scope}${assignment.ownership === "read-only" ? "\nRead-only assignment: do not modify files in this workspace. This declaration does not change provider permissions." : ""}`;
    return `{ id: ${JSON.stringify(assignment.id)}, group: ${JSON.stringify(groups[assignment.environment.environmentId])}, ownership: ${JSON.stringify(assignment.ownership)}, run: () => agent(${JSON.stringify(prompt)}, ${JSON.stringify(options)}) }`;
  });
  return `export const meta = { name: "delegated-assignments", description: "Native assignment execution" };
const tails = Object.create(null);
const assignments = [${assignments.join(",")}];
const tasks = assignments.map((assignment) => {
  const group = tails[assignment.group] || { writer: Promise.resolve(null), readers: [] };
  tails[assignment.group] = group;
  const previous = assignment.ownership === "read-only"
    ? group.writer
    : Promise.all([group.writer, ...group.readers]).then((results) => results.find((result) => result && result.status === "failed") || null);
  const pending = previous.then(async (previousResult) => {
    if (previousResult && previousResult.status === "failed") return { id: assignment.id, status: "failed", result: null, error: "Prior overlapping assignment failed; replacement blocked" };
    try {
      const result = await assignment.run();
      return { id: assignment.id, status: "succeeded", result, error: null };
    } catch (error) {
      return { id: assignment.id, status: "failed", result: null, error: String(error) };
    }
  });
  if (assignment.ownership === "read-only") group.readers.push(pending);
  else { group.writer = pending; group.readers = []; }
  return () => pending;
});
const results = await parallel(tasks);
const failures = results.filter((result) => result.status === "failed");
if (failures.length) throw new Error(JSON.stringify(failures));
return results;`;
}

export function inspectExecution(
  db: Db,
  service: Pick<WorkflowService, "inspect">,
  identity: ExecutionIdentity,
): ExecutionSnapshot {
  const run = service.inspect(executionRunId(identity));
  if (run === null) throw new Error("Unknown execution identity");
  const request = executionStartSchema.parse(JSON.parse(run.argsJson));
  const assignments = request.assignments.map((assignment) => {
    const call = run.calls.find(
      (candidate) => candidate.options.title === assignment.id,
    );
    return {
      id: assignment.id,
      callId: call?.id ?? null,
      threadId: call?.childThreadId ?? null,
      status:
        call?.status ??
        (run.status === "queued" || run.status === "running"
          ? "queued"
          : run.status),
      result: call?.resultJson == null ? null : JSON.parse(call.resultJson),
      error: call?.error ?? (call === undefined ? run.error : null),
      environmentId: assignment.environment.environmentId,
      permissionMode: assignment.permissionMode,
      scope: assignment.scope,
      ownership: assignment.ownership,
    };
  });
  const unsettled = db
    .prepare(
      "SELECT 1 FROM workflow_spawn_attempts WHERE run_id = ? AND state != 'stopped'",
    )
    .get(run.id);
  const nativeSettlement =
    run.status === "queued" || run.status === "running"
      ? "pending"
      : unsettled === undefined
        ? "confirmed"
        : "unconfirmed";
  return {
    runId: run.id,
    nativeSettlement,
    status:
      run.status === "succeeded" &&
      assignments.some((entry) => entry.status !== "succeeded")
        ? "failed"
        : run.status,
    assignments,
    error: run.error,
  };
}

export function registerExecutionRpc(
  bb: BbPluginApi,
  db: Db,
  service: WorkflowService,
) {
  const host = bb.hosts.experimental_client({ contract: workflowHostContract });
  let starts = Promise.resolve();
  const inspect = (identity: ExecutionIdentity) =>
    inspectExecution(db, service, identity);
  async function start(input: ExecutionStart): Promise<ExecutionSnapshot> {
    const runId = executionRunId(input);
    const existing = service.get(runId);
    if (existing !== null) {
      if (
        JSON.stringify(
          executionStartSchema.parse(JSON.parse(existing.argsJson)),
        ) !== JSON.stringify(input)
      )
        throw new Error("Launch identity already has a different request");
      return inspect(input);
    }
    const origin = await bb.sdk.threads.get({ threadId: input.originThreadId });
    if (origin.projectId !== input.projectId)
      throw new Error("Execution origin belongs to another project");
    const roots: Record<string, { hostId: string; rootPath: string }> = {};
    for (const assignment of input.assignments) {
      const environment = await bb.sdk.environments.get({
        environmentId: assignment.environment.environmentId,
      });
      if (environment.projectId !== input.projectId)
        throw new Error("Assignment environment belongs to another project");
      if (environment.path === null)
        throw new Error("Assignment environment has no workspace root");
      const canonical = await host.call(
        "canonicalRoot",
        { path: environment.path },
        { hostId: environment.hostId },
      );
      roots[environment.id] = {
        hostId: environment.hostId,
        rootPath: canonical.path,
      };
      if (
        hasWorkspaceConflict(db, {
          environmentId: environment.id,
          hostId: environment.hostId,
          rootPath: canonical.path,
          ownership: assignment.ownership,
        })
      )
        throw new Error(
          "Assignment workspace has active or unresolved native execution ownership; replacement blocked",
        );
      const providers = await bb.sdk.providers.list({
        environmentId: assignment.environment.environmentId,
      });
      const provider = providers.find(
        (entry) => entry.id === assignment.providerId && entry.available,
      );
      if (!provider)
        throw new Error(
          `Provider ${assignment.providerId} unavailable in assignment environment`,
        );
      if (
        assignment.serviceTier !== "default" &&
        !provider.serviceTiers?.some(
          (tier) => tier.id === assignment.serviceTier,
        )
      )
        throw new Error(`Service tier ${assignment.serviceTier} unsupported`);
    }
    await service.start({
      projectId: input.projectId,
      originThreadId: input.originThreadId,
      source: executionSource(input, executionGroups(roots)),
      args: input,
      resumedFromRunId: null,
      executionRunId: runId,
      executionHosts: roots,
    });
    return inspect(input);
  }
  const supervision = createExecutionSupervision(
    bb,
    db,
    service,
    inspect,
    (identity) => {
      const runId = executionRunId(identity);
      if (
        db.prepare("SELECT 1 FROM workflow_runs WHERE id = ?").get(runId) ===
        undefined
      )
        throw new Error("Unknown execution identity");
      return runId;
    },
  );
  const handlers = {
    experimental_executionStart(input: ExecutionStart) {
      const request = executionStartSchema.parse(input);
      const pending = starts.then(() => start(request));
      starts = pending.then(
        () => undefined,
        () => undefined,
      );
      return pending;
    },
    experimental_executionInspect: inspect,
    async experimental_executionCancel(input: ExecutionIdentity) {
      const snapshot = inspect(input);
      await service.stop(snapshot.runId);
      const attempts = db
        .prepare(
          "SELECT thread_id AS threadId FROM workflow_spawn_attempts WHERE run_id = ? AND state != 'stopped'",
        )
        .all(snapshot.runId) as Array<{ threadId: string | null }>;
      for (const attempt of attempts) {
        if (attempt.threadId === null) continue;
        try {
          await bb.sdk.threads.stop({ threadId: attempt.threadId });
          db.prepare(
            "UPDATE workflow_spawn_attempts SET state = 'stopped' WHERE run_id = ? AND thread_id = ?",
          ).run(snapshot.runId, attempt.threadId);
        } catch (error) {
          bb.log.warn(`Execution stop unconfirmed: ${String(error)}`);
        }
      }
      const unresolved = db
        .prepare(
          "SELECT 1 FROM workflow_spawn_attempts WHERE run_id = ? AND state != 'stopped'",
        )
        .get(snapshot.runId);
      return { ...inspect(input), stopConfirmed: unresolved === undefined };
    },
    experimental_executionGuide: supervision.guide,
    experimental_executionGuideStatus: supervision.guideStatus,
    experimental_executionWait: supervision.wait,
  };
  bb.rpc.register(workflowExecutionRpcContract, handlers, {
    experimental_discoverable: true,
    experimental_description:
      "Start, inspect, cancel and guide durable native assignment executions with caller task and launch identity.",
  });
  return handlers;
}

export type ExecutionHandlers = ReturnType<typeof registerExecutionRpc>;

export function rootsOverlap(left: string, right: string): boolean {
  const first = left.replace(/\/+$/, "");
  const second = right.replace(/\/+$/, "");
  return (
    first === second ||
    first.startsWith(`${second}/`) ||
    second.startsWith(`${first}/`)
  );
}

export function executionGroups(
  roots: Record<string, { hostId: string; rootPath: string }>,
): Record<string, string> {
  const groups: Record<string, string> = {};
  const entries = Object.entries(roots);
  for (const [id] of entries) groups[id] = id;
  for (const [leftId, left] of entries) {
    for (const [rightId, right] of entries) {
      if (
        left.hostId !== right.hostId ||
        !rootsOverlap(left.rootPath, right.rootPath)
      )
        continue;
      const old = groups[rightId];
      for (const [id] of entries)
        if (groups[id] === old) groups[id] = groups[leftId];
    }
  }
  return groups;
}
