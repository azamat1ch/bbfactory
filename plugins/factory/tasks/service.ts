import {
  inspectLegacyExecution,
  cancelLegacyExecution,
} from "../execution/legacy.js";
import type { ExecutionHandlers } from "../execution/execution.js";
import { randomUUID } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { teamRpcContract } from "../team/shared.js";
import { workflowExecutionRpcContract } from "../execution/execution-contract.js";
import { createStore, migrations } from "./data.js";
import {
  verificationMethods,
  factoryHostContract,
  factoryRpcContract,
  FACTORY_TASKS_REALTIME_CHANNEL,
  type FactoryTaskDetail,
  type FactoryContent,
  type FactoryEvidence,
  type FactoryAssignment,
} from "./shared.js";

type Input<K extends keyof typeof factoryRpcContract> = z.infer<
  (typeof factoryRpcContract)[K]["input"]
>;
const launchRecordSchema = z.strictObject({
  factoryInput: factoryRpcContract.factoryAssign.input,
  request: workflowExecutionRpcContract.experimental_executionStart.input,
});
type NativeSnapshot = z.infer<
  typeof workflowExecutionRpcContract.experimental_executionInspect.output
>;
function launchArtifactId(taskId: string, launchId: string) {
  return `factory-launch:${JSON.stringify([taskId, launchId])}`;
}
export function createFactoryService(
  bb: BbPluginApi,
  initializeStorage = true,
  execution?: ExecutionHandlers,
) {
  const db = bb.storage.database();
  if (initializeStorage) bb.storage.migrate(db, migrations);
  const store = createStore(db);
  const host = bb.hosts.experimental_client({ contract: factoryHostContract });
  const checks = new Map<string, AbortController>();
  const locks = new Map<string, Promise<unknown>>();
  async function locked<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const previous = locks.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(fn);
    locks.set(id, next);
    try {
      return await next;
    } finally {
      if (locks.get(id) === next) locks.delete(id);
    }
  }
  function legacyLaunch(taskId: string, launchId: string): boolean {
    if (!execution) return true;
    return (
      db
        .prepare(
          "SELECT 1 FROM factory_legacy_launches WHERE task_id = ? AND launch_id = ?",
        )
        .get(taskId, launchId) !== undefined
    );
  }
  function save(detail: FactoryTaskDetail) {
    detail.task.executionRunning =
      checks.has(detail.task.id) ||
      detail.assignments.some(
        (a) => !["succeeded", "failed"].includes(a.nativeStatus),
      );
    const stop = store.stopped(detail.task.id);
    if (stop !== undefined) {
      detail.task.stopRequested = true;
      detail.task.archived ||= stop === 1;
    }
    let previous: FactoryTaskDetail | null = null;
    try {
      previous = store.get(detail.task.id);
    } catch {}
    if (previous && JSON.stringify(previous) === JSON.stringify(detail)) return;
    detail.task.updatedAt = Date.now();
    store.save(detail);
    bb.realtime.publish(FACTORY_TASKS_REALTIME_CHANNEL, {
      taskId: detail.task.id,
      threadId: detail.task.originThreadId,
    });
  }
  async function workspace(environmentId: string) {
    const environment = await bb.sdk.environments.get({ environmentId });
    if (!environment.path) throw new Error("Environment has no workspace path");
    return {
      hostId: environment.hostId,
      rootPath: environment.path,
      projectId: environment.projectId,
    };
  }
  async function content(environmentId: string): Promise<FactoryContent> {
    try {
      const env = await workspace(environmentId);
      return await host.call(
        "captureState",
        { rootPath: env.rootPath },
        { hostId: env.hostId, timeoutMs: 60000 },
      );
    } catch (error) {
      return {
        canonicalPath: "unknown",
        fingerprint: "unknown",
        complete: false,
        detail: String(error),
      };
    }
  }
  function applyNativeSnapshot(
    detail: FactoryTaskDetail,
    launchId: string,
    snapshot: NativeSnapshot,
  ) {
    for (const association of detail.assignments.filter(
      (a) => a.launchId === launchId,
    )) {
      const result = snapshot.assignments.find(
        (result) => result.id === association.id,
      );
      association.runId = snapshot.runId;
      association.nativeStatus =
        snapshot.nativeSettlement === "confirmed" && result
          ? result.status
          : snapshot.nativeSettlement === "pending"
            ? "running"
            : "uncertain";
      if (result)
        Object.assign(association, {
          threadId: result.threadId,
          result: result.result,
          error: result.error,
        });
      else
        association.error =
          snapshot.error ?? "Native snapshot omitted the assignment";
    }
  }
  function markLaunchUncertain(
    detail: FactoryTaskDetail,
    launchId: string,
    error: unknown,
  ) {
    for (const association of detail.assignments.filter(
      (a) => a.launchId === launchId,
    )) {
      association.nativeStatus = "uncertain";
      association.error = String(error);
    }
  }
  async function dispatchLaunch(
    detail: FactoryTaskDetail,
    record: z.infer<typeof launchRecordSchema>,
  ) {
    const launchId = record.request.launchId;
    if (store.stopped(detail.task.id) !== undefined)
      throw new Error("Task has durable stop intent");
    try {
      const snapshot =
        execution && !legacyLaunch(detail.task.id, launchId)
          ? await execution.experimental_executionStart(record.request)
          : execution
            ? inspectLegacyExecution(bb, record.request)
            : await bb.sdk.plugins.callRpc({
                pluginId: "workflows",
                method: "experimental_executionStart",
                input: record.request,
                outputSchema:
                  workflowExecutionRpcContract.experimental_executionStart
                    .output,
              });
      applyNativeSnapshot(detail, launchId, snapshot);
    } catch (error) {
      markLaunchUncertain(detail, launchId, error);
    }
    save(detail);
    return detail;
  }
  async function native(detail: FactoryTaskDetail, cancel: boolean) {
    for (const launchId of new Set(detail.assignments.map((a) => a.launchId))) {
      const input = {
        originThreadId: detail.task.originThreadId,
        callerTaskId: detail.task.id,
        launchId,
      };
      try {
        const method = cancel
          ? "experimental_executionCancel"
          : "experimental_executionInspect";
        const snapshot =
          execution && !legacyLaunch(detail.task.id, launchId)
            ? await execution[method](input)
            : execution
              ? await (cancel
                  ? cancelLegacyExecution(bb, input)
                  : inspectLegacyExecution(bb, input))
              : await bb.sdk.plugins.callRpc({
                  pluginId: "workflows",
                  method,
                  input,
                  outputSchema: cancel
                    ? workflowExecutionRpcContract.experimental_executionCancel
                        .output
                    : workflowExecutionRpcContract.experimental_executionInspect
                        .output,
                });
        applyNativeSnapshot(detail, launchId, snapshot);
      } catch (error) {
        markLaunchUncertain(detail, launchId, error);
      }
    }
  }

  function evaluate(detail: FactoryTaskDetail, state: FactoryContent) {
    if (
      state.complete &&
      detail.observedContent?.complete &&
      (state.fingerprint !== detail.observedContent.fingerprint ||
        state.canonicalPath !== detail.observedContent.canonicalPath)
    ) {
      detail.invalidatedEvidenceIds = [
        ...new Set([
          ...detail.invalidatedEvidenceIds,
          ...detail.evidence.map((e) => e.id),
          ...detail.judgments.map((j) => j.id),
          ...detail.reviews.map((r) => r.id),
        ]),
      ];
    }
    detail.observedContent = state;
    detail.task.executionRunning =
      checks.has(detail.task.id) ||
      detail.assignments.some(
        (a) => !["succeeded", "failed"].includes(a.nativeStatus),
      );
    const task = detail.task;
    const fail = (status: typeof task.status, text: string) => {
      task.status = status;
      task.statusDetail = text;
    };
    if (task.phase === "draft")
      return fail("unverified", "Draft task must be started before acceptance");

    if (store.verifying(task.id))
      return fail(
        "unverified",
        "Verification is pending or was interrupted; rerun checks",
      );
    if (!state.complete)
      return fail("unverified", state.detail ?? "Content identity unavailable");
    if (
      detail.assignments.some(
        (a) => !["succeeded", "failed"].includes(a.nativeStatus),
      )
    )
      return fail("unverified", "Native assignments have not settled");
    if (detail.findings.some((f) => f.required && f.resolution === null))
      return fail("failed", "Required review findings remain unresolved");
    const current = detail.evidence.filter(
      (e) =>
        !detail.invalidatedEvidenceIds.includes(e.id) &&
        e.specVersion === task.specVersion &&
        e.content.fingerprint === state.fingerprint &&
        e.content.canonicalPath === state.canonicalPath,
    );
    let stale = false;
    let missing = false;
    for (const check of task.checks) {
      if (!check.required) continue;
      const evidence = current.filter((e) => e.check.id === check.id).at(-1);
      if (!evidence) {
        missing = true;
        stale ||= detail.evidence.some((e) => e.check.id === check.id);
      } else if (evidence.outcome === "failed")
        return fail("failed", `Required check ${check.id} failed`);
      else if (evidence.outcome !== "passed") {
        missing = true;
        stale ||= evidence.outcome === "stale";
      }
    }
    for (const requirement of task.requirements) {
      for (const method of verificationMethods(requirement)) {
        if (method === "human") {
          const judgment = detail.judgments
            .filter(
              (j) =>
                !detail.invalidatedEvidenceIds.includes(j.id) &&
                j.requirementId === requirement.id &&
                j.specVersion === task.specVersion &&
                j.fingerprint === state.fingerprint,
            )
            .at(-1);
          if (judgment && !judgment.accepted)
            return fail("failed", `Human judgment rejected ${requirement.id}`);
          if (!judgment) {
            missing = true;
            stale ||= detail.judgments.some(
              (j) => j.requirementId === requirement.id,
            );
          }
        } else if (method === "agent") {
          const review = detail.reviews
            .filter(
              (review) =>
                !detail.invalidatedEvidenceIds.includes(review.id) &&
                review.requirementIds.includes(requirement.id) &&
                review.specVersion === task.specVersion &&
                review.fingerprint === state.fingerprint,
            )
            .at(-1);
          if (review && !review.accepted)
            return fail("failed", `Agent review rejected ${requirement.id}`);
          if (!review) {
            missing = true;
            stale ||= detail.reviews.some((review) =>
              review.requirementIds.includes(requirement.id),
            );
          }
        } else if (
          !task.checks.some(
            (c) =>
              c.required &&
              c.requirementIds.includes(requirement.id) &&
              current.filter((e) => e.check.id === c.id).at(-1)?.outcome ===
                "passed",
          )
        )
          missing = true;
      }
    }
    if (missing)
      return fail(
        stale ? "stale" : "unverified",
        stale
          ? "Evidence does not match current content or specification"
          : "Required behavior lacks passing linked evidence or explicit human judgment",
      );
    fail("accepted", "All required checks and decisions match this version.");
  }
  async function refresh(
    taskId: string,
    captures = new Map<string, Promise<FactoryContent>>(),
  ) {
    const detail = store.get(taskId);
    await native(detail, detail.task.stopRequested);
    if (!captures.has(detail.task.environmentId))
      captures.set(
        detail.task.environmentId,
        content(detail.task.environmentId),
      );
    evaluate(detail, await captures.get(detail.task.environmentId)!);
    save(detail);
    return detail;
  }
  async function recordHumanJudgments(
    input: Input<"factoryRecordJudgments">,
    detail: FactoryTaskDetail,
  ) {
    if (
      detail.task.phase !== "active" ||
      detail.task.stopRequested ||
      detail.task.archived
    )
      throw new Error("Human judgment requires an active task");
    if (new Set(input.requirementIds).size !== input.requirementIds.length)
      throw new Error("Requirement IDs must be unique");
    if (
      input.requirementIds.some(
        (id) =>
          !detail.task.requirements.some(
            (requirement) =>
              requirement.id === id &&
              verificationMethods(requirement).includes("human"),
          ),
      )
    )
      throw new Error("All selected requirements must be human criteria");

    const state = await content(detail.task.environmentId);
    evaluate(detail, state);
    save(detail);
    if (!state.complete) throw new Error("Cannot judge unknown content");
    if (
      input.expectedVersion !== detail.task.specVersion ||
      input.expectedFingerprint !== state.fingerprint
    )
      throw new Error(
        "The specification or content changed since review; reload before judging",
      );
    const now = Date.now();
    const rationale = input.rationale;
    const judgments = input.requirementIds.map((requirementId) => ({
      id: randomUUID(),
      taskId: input.taskId,
      requirementId,
      specVersion: detail.task.specVersion,
      fingerprint: state.fingerprint,
      accepted: input.accepted,
      actor: input.actor,
      rationale,
      createdAt: now,
    }));
    detail.judgments.push(...judgments);
    evaluate(detail, state);
    db.transaction(() => {
      for (const judgment of judgments)
        store.artifact(judgment.id, input.taskId, "human-judgment", judgment);
      save(detail);
    })();
    return detail;
  }
  async function reviewedState(
    detail: FactoryTaskDetail,
    input: { expectedVersion: number; expectedFingerprint: string },
  ) {
    if (detail.task.phase !== "active" || detail.task.archived)
      throw new Error("Delivery decisions require an active task");
    const state = await content(detail.task.environmentId);
    evaluate(detail, state);
    if (
      !state.complete ||
      input.expectedVersion !== detail.task.specVersion ||
      input.expectedFingerprint !== state.fingerprint
    ) {
      save(detail);
      throw new Error(
        "The specification or content changed since review; reload before recording",
      );
    }
    return state;
  }
  const service = {
    exportSpec(input: Input<"factoryExportSpec">) {
      input = factoryRpcContract.factoryExportSpec.input.parse(input);
      const detail = store.get(input.taskId);
      return factoryRpcContract.factoryExportSpec.output.parse({
        format: "factory-spec",
        formatVersion: 1,
        spec: detail.specs.find((s) => s.version === detail.task.specVersion)!
          .spec,
      });
    },
    importSpec(
      input: Input<"factoryImportSpec">,
    ): Promise<z.infer<typeof factoryRpcContract.factoryImportSpec.output>> {
      input = factoryRpcContract.factoryImportSpec.input.parse(input);
      return service.createTask({
        threadId: input.threadId,
        spec: input.bundle.spec,
      });
    },
    resumeTask(input: Input<"factoryResumeTask">) {
      input = factoryRpcContract.factoryResumeTask.input.parse(input);
      return locked(input.taskId, async () => {
        const detail = store.get(input.taskId);
        if (detail.task.specVersion !== input.expectedVersion)
          throw new Error("Specification changed; reload before resuming");
        if (detail.task.archived)
          throw new Error("Archived tasks cannot resume");
        await native(detail, false);
        if (
          checks.has(input.taskId) ||
          detail.assignments.some(
            (a) => !["succeeded", "failed"].includes(a.nativeStatus),
          )
        )
          throw new Error("Execution must settle before resuming");
        store.clearStop(input.taskId);
        store.finishVerification(input.taskId);
        detail.task.stopRequested = false;
        evaluate(detail, await content(detail.task.environmentId));
        save(detail);
        return detail;
      });
    },
    recordDelivery(input: Input<"factoryRecordDelivery">) {
      input = factoryRpcContract.factoryRecordDelivery.input.parse(input);
      return locked(input.taskId, async () => {
        const detail = store.get(input.taskId);
        const state = await reviewedState(detail, input);
        const delivery = {
          id: randomUUID(),
          taskId: input.taskId,
          specVersion: detail.task.specVersion,
          content: state,
          mergeUrl: input.mergeUrl,
          status: "delivered" as const,
          verificationStatus: detail.task.status,
          createdAt: Date.now(),
        };
        detail.deliveries.push(delivery);
        db.transaction(() => {
          store.artifact(delivery.id, input.taskId, "delivery", delivery);
          save(detail);
        })();
        return detail;
      });
    },
    approveDelivery(input: Input<"factoryApproveDelivery">) {
      input = factoryRpcContract.factoryApproveDelivery.input.parse(input);
      return locked(input.taskId, async () => {
        const detail = store.get(input.taskId);
        if (input.source === "chat" && !input.sourceRef)
          throw new Error("Chat decisions require a source reference");
        const requirementIds =
          input.scope === "delivery"
            ? detail.task.requirements.map((r) => r.id)
            : input.requirementIds;
        if (input.scope === "delivery" && input.requirementIds.length)
          throw new Error("Whole delivery scope requires empty requirementIds");
        if (
          !requirementIds.length ||
          new Set(requirementIds).size !== requirementIds.length ||
          requirementIds.some(
            (id) => !detail.task.requirements.some((r) => r.id === id),
          )
        )
          throw new Error("Select unique known requirements");
        const state = await reviewedState(detail, input);
        const approval = {
          id: randomUUID(),
          taskId: input.taskId,
          specVersion: detail.task.specVersion,
          fingerprint: state.fingerprint,
          scope: input.scope,
          requirementIds,
          accepted: input.accepted,
          actor: input.actor,
          source: input.source,
          sourceRef: input.sourceRef,
          rationale: input.rationale,
          createdAt: Date.now(),
        };
        const judgments = detail.task.requirements
          .filter(
            (r) =>
              requirementIds.includes(r.id) &&
              verificationMethods(r).includes("human"),
          )
          .map((r) => ({
            id: randomUUID(),
            taskId: input.taskId,
            requirementId: r.id,
            specVersion: detail.task.specVersion,
            fingerprint: state.fingerprint,
            accepted: input.accepted,
            actor: input.actor,
            rationale: input.rationale,
            createdAt: approval.createdAt,
          }));
        detail.approvals.push(approval);
        detail.judgments.push(...judgments);
        evaluate(detail, state);
        db.transaction(() => {
          store.artifact(approval.id, input.taskId, "approval", approval);
          for (const judgment of judgments)
            store.artifact(
              judgment.id,
              input.taskId,
              "human-judgment",
              judgment,
            );
          save(detail);
        })();
        return detail;
      });
    },

    async createTask(input: Input<"factoryCreateTask">) {
      input = factoryRpcContract.factoryCreateTask.input.parse(input);
      const thread = await bb.sdk.threads.get({ threadId: input.threadId });
      if (!thread.environmentId || thread.archivedAt || thread.deletedAt)
        throw new Error("An active thread environment is required");
      const now = Date.now();
      const taskId = `bft_${randomUUID()}`;
      const detail: FactoryTaskDetail = {
        observedContent: null,
        invalidatedEvidenceIds: [],
        approvals: [],
        deliveries: [],
        task: {
          id: taskId,
          projectId: thread.projectId,
          originThreadId: thread.id,
          environmentId: thread.environmentId,
          ...input.spec,
          phase: "draft",
          specVersion: 1,
          status: "unverified",
          statusDetail: "No acceptance evidence",
          archived: false,
          stopRequested: false,
          executionRunning: false,
          createdAt: now,
          updatedAt: now,
        },
        assignments: [],
        evidence: [],
        findings: [],
        judgments: [],
        reviews: [],
        notes: [],
        specs: [
          {
            version: 1,
            spec: input.spec,
            changeReason: "Initial specification",
            createdAt: now,
          },
        ],
      };
      db.transaction(() => {
        store.artifact(`${taskId}:spec:1`, taskId, "spec", detail.specs[0]);
        save(detail);
      })();
      return {
        task: detail.task,
        previewDirective: `::factory-task{taskId="${taskId}"}`,
      };
    },
    getTaskDetail(taskId: string) {
      if (checks.has(taskId)) return Promise.resolve(store.get(taskId));
      return locked(taskId, () => refresh(taskId));
    },
    async listTasks(threadId: string) {
      const captures = new Map<string, Promise<FactoryContent>>();
      return Promise.all(
        store
          .list(threadId)
          .map((d) =>
            (checks.has(d.task.id)
              ? Promise.resolve(store.get(d.task.id))
              : locked(d.task.id, () => refresh(d.task.id, captures))
            ).then((d) => d.task),
          ),
      );
    },
    updateTask(input: Input<"factoryUpdateTask">) {
      input = factoryRpcContract.factoryUpdateTask.input.parse(input);
      return locked(input.taskId, async () => {
        const detail = store.get(input.taskId);
        if (detail.task.specVersion !== input.expectedVersion)
          throw new Error(
            "Specification changed; reload before proposing another revision",
          );
        const version = detail.task.specVersion + 1;
        const spec = {
          version,
          spec: input.spec,
          changeReason: input.changeReason,
          createdAt: Date.now(),
        };
        detail.specs.push(spec);
        Object.assign(detail.task, input.spec, {
          specVersion: version,
          status: detail.task.phase === "draft" ? "unverified" : "stale",
          statusDetail:
            detail.task.phase === "draft"
              ? "Draft specification changed"
              : "Specification changed; independent checks must run again",
        });
        db.transaction(() => {
          store.artifact(
            `${input.taskId}:spec:${version}`,
            input.taskId,
            "spec",
            spec,
          );
          save(detail);
        })();
        return detail;
      });
    },
    startTask(input: Input<"factoryStartTask">) {
      input = factoryRpcContract.factoryStartTask.input.parse(input);
      return locked(input.taskId, async () => {
        const detail = store.get(input.taskId);
        if (detail.task.specVersion !== input.expectedVersion)
          throw new Error("Specification changed; reload before starting");
        if (detail.task.stopRequested || detail.task.archived)
          throw new Error("Stopped or archived tasks cannot be started");
        if (detail.task.phase === "active") return detail;
        const gaps = detail.task.requirements.filter(
          (r) =>
            !r.reviewInstructions.trim() &&
            verificationMethods(r).includes("automated") &&
            !detail.task.checks.some(
              (c) => c.required && c.requirementIds.includes(r.id),
            ),
        );
        if (gaps.length)
          throw new Error(
            `Requirements need a usable verification route: ${gaps.map((r) => r.id).join(", ")}`,
          );
        detail.task.phase = "active";
        evaluate(detail, await content(detail.task.environmentId));
        save(detail);
        return detail;
      });
    },
    verifyTask(taskId: string) {
      return locked(taskId, async () => {
        const detail = store.get(taskId);
        if (detail.task.phase !== "active")
          throw new Error("Verification requires an active task");
        await native(detail, detail.task.stopRequested);
        if (
          detail.task.stopRequested ||
          detail.assignments.some(
            (a) => !["succeeded", "failed"].includes(a.nativeStatus),
          )
        )
          throw new Error(
            "Verification requires settled native assignments and no stop intent",
          );
        const env = await workspace(detail.task.environmentId);
        store.beginVerification(taskId);
        detail.task.status = "unverified";
        detail.task.statusDetail = "Independent verification in progress";
        const controller = new AbortController();
        checks.set(taskId, controller);
        save(detail);
        const before = await content(detail.task.environmentId);
        evaluate(detail, before);
        if (!before.complete) {
          store.finishVerification(taskId);
          checks.delete(taskId);
          evaluate(detail, before);
          save(detail);
          return detail;
        }
        for (const check of detail.task.checks) {
          if (store.stopped(taskId) !== undefined) break;
          let result;
          try {
            result = await host.call(
              "runCheck",
              { rootPath: before.canonicalPath, check },
              {
                hostId: env.hostId,
                timeoutMs: check.timeoutMs + 60000,
                signal: controller.signal,
              },
            );
          } catch (error) {
            result = {
              exitCode: null,
              timedOut: false,
              settled: false,
              startedAt: Date.now(),
              finishedAt: Date.now(),
              logRef: null,
              output: "",
              detail: String(error),
            };
          }
          const after = await content(detail.task.environmentId);
          const unchanged =
            after.complete &&
            before.fingerprint === after.fingerprint &&
            before.canonicalPath === after.canonicalPath;
          const evidence: FactoryEvidence = {
            id: randomUUID(),
            taskId,
            specVersion: detail.task.specVersion,
            check,
            content: before,
            environmentId: detail.task.environmentId,
            hostId: env.hostId,
            result,
            outcome: !unchanged
              ? "stale"
              : !result.settled || result.exitCode === null
                ? "unverified"
                : result.timedOut || result.exitCode !== 0
                  ? "failed"
                  : "passed",
          };
          detail.evidence.push(evidence);
          db.transaction(() => {
            store.artifact(evidence.id, taskId, "check", evidence);
            save(detail);
          })();
          if (!unchanged || !result.settled) break;
        }
        store.finishVerification(taskId);
        checks.delete(taskId);
        evaluate(detail, await content(detail.task.environmentId));
        save(detail);
        return detail;
      });
    },
    assign(input: Input<"factoryAssign">) {
      input = factoryRpcContract.factoryAssign.input.parse(input);
      return locked("assignments", () =>
        locked(input.taskId, async () => {
          const detail = store.get(input.taskId);
          if (detail.task.phase !== "active")
            throw new Error("Assignment requires an active task");
          if (detail.task.stopRequested || detail.task.archived)
            throw new Error("Task has durable stop intent");
          if (
            new Set(input.assignments.map((a) => a.id)).size !==
            input.assignments.length
          )
            throw new Error("Assignment IDs must be unique");
          if (detail.assignments.some((a) => a.launchId === input.launchId)) {
            const stored = store.artifactValue(
              launchArtifactId(input.taskId, input.launchId),
              input.taskId,
              "native-launch-request",
            );
            if (stored === null) {
              await native(detail, false);
              save(detail);
              throw new Error(
                "This legacy launch has no immutable dispatch request; native status was refreshed but a replay cannot be reconstructed safely",
              );
            }
            const record = launchRecordSchema.parse(stored);
            if (JSON.stringify(record.factoryInput) !== JSON.stringify(input))
              throw new Error(
                "Launch identity already belongs to different assignments",
              );
            return dispatchLaunch(detail, record);
          }
          const team = await bb.sdk.plugins.callRpc({
            pluginId: "factory-team",
            method: "get",
            input: {
              scope: { kind: "thread", id: detail.task.originThreadId },
            },
            outputSchema: teamRpcContract.get.output,
          });
          if (!input.overrideReason && team.preference.mode === "off")
            throw new Error("Team is Off; direct execution remains available");
          const additions: FactoryAssignment[] = [];
          for (const assignment of input.assignments) {
            if (detail.assignments.some((a) => a.id === assignment.id))
              throw new Error("Assignment ID already exists");
            if (
              !input.overrideReason &&
              team.preference.mode === "selected" &&
              !team.preference.profiles.some(
                (p) =>
                  p.providerId === assignment.profile.providerId &&
                  p.model === assignment.profile.model &&
                  p.reasoningLevel === assignment.profile.reasoningLevel &&
                  (p.serviceTier ?? "default") ===
                    assignment.profile.serviceTier,
              )
            )
              throw new Error("Assignment is outside selected Team profiles");
            const env = await workspace(assignment.environmentId);
            if (env.projectId !== detail.task.projectId)
              throw new Error(
                "Assignment environment belongs to another project",
              );
            const state = await content(assignment.environmentId);
            if (!state.complete)
              throw new Error(
                `Cannot establish workspace identity: ${state.detail}`,
              );
            const catalog = await bb.sdk.providers.models({
              environmentId: assignment.environmentId,
              providerId: assignment.profile.providerId,
            });
            const provider = catalog.providers.find(
              (p) => p.id === assignment.profile.providerId && p.available,
            );
            const model = catalog.models.find(
              (m) =>
                m.model === assignment.profile.model &&
                (!m.routeProviderId ||
                  m.routeProviderId === assignment.profile.providerId),
            );
            if (!provider || !model || catalog.modelLoadError)
              throw new Error(
                "Selected profile is unavailable on the target host",
              );
            if (
              model.supportedReasoningEfforts.length &&
              !model.supportedReasoningEfforts.some(
                (r) => r.reasoningEffort === assignment.profile.reasoningLevel,
              )
            )
              throw new Error(
                "Model does not support selected reasoning effort",
              );
            if (
              provider.reasoningLevels &&
              !provider.reasoningLevels.some(
                (r) => r.id === assignment.profile.reasoningLevel,
              )
            )
              throw new Error("Unsupported reasoning effort");
            if (
              assignment.profile.serviceTier !== "default" &&
              !provider.serviceTiers?.some(
                (t) => t.id === assignment.profile.serviceTier,
              )
            )
              throw new Error("Unsupported service tier");
            const others = [
              ...store.unresolvedAssociations(env.hostId, state.canonicalPath),
              ...additions,
            ];
            if (
              others.some(
                (a) =>
                  a.hostId === env.hostId &&
                  a.workspacePath === state.canonicalPath &&
                  a.environmentId !== assignment.environmentId,
              )
            )
              throw new Error(
                "Environment aliases the same canonical workspace; use the same native environment or an isolated workspace",
              );
            additions.push({
              ...assignment,
              launchId: input.launchId,
              preferenceRevision: team.revision,
              overrideReason: input.overrideReason ?? null,
              hostId: env.hostId,
              workspacePath: state.canonicalPath,
              runId: null,
              threadId: null,
              nativeStatus: "uncertain",
              result: null,
              error: null,
            });
          }
          const record = launchRecordSchema.parse({
            factoryInput: input,
            request: {
              projectId: detail.task.projectId,
              originThreadId: detail.task.originThreadId,
              callerTaskId: detail.task.id,
              launchId: input.launchId,
              assignments: additions.map((a) => ({
                id: a.id,
                prompt: `${a.prompt}\n\nFactory task ${detail.task.id}, specification ${detail.task.specVersion}. Role: ${a.role}. Ownership: ${a.ownership} (advisory, not filesystem confinement). Scope: ${a.scope}. Preserve acceptance artifacts. Report changes, checks, unresolved findings and handover.`,
                title: a.title,
                ...a.profile,
                environment: { type: "reuse", environmentId: a.environmentId },
                permissionMode: a.permissionMode,
                scope: a.scope,
              })),
            },
          });
          detail.assignments.push(...additions);
          detail.task.status = "unverified";
          detail.task.statusDetail =
            "Native execution requested; worker completion is not acceptance";
          db.transaction(() => {
            store.artifact(
              launchArtifactId(input.taskId, input.launchId),
              input.taskId,
              "native-launch-request",
              record,
            );
            save(detail);
          })();
          return dispatchLaunch(detail, record);
        }),
      );
    },
    cancelTask(input: Input<"factoryCancelTask">) {
      input = factoryRpcContract.factoryCancelTask.input.parse(input);
      const current = store.get(input.taskId);
      if (
        !input.archive &&
        !checks.has(input.taskId) &&
        !current.assignments.some(
          (a) => !["succeeded", "failed"].includes(a.nativeStatus),
        )
      )
        throw new Error("Only running execution can be cancelled");
      store.requestStop(input.taskId, input.archive);
      checks.get(input.taskId)?.abort();
      return locked(input.taskId, async () => {
        const detail = store.get(input.taskId);
        detail.task.stopRequested = true;
        detail.task.archived ||= input.archive;

        save(detail);
        await native(detail, true);
        evaluate(detail, await content(detail.task.environmentId));
        save(detail);
        return detail;
      });
    },
    finding(input: Input<"factoryRecordFinding">) {
      return locked(input.taskId, async () => {
        const detail = store.get(input.taskId);
        if (
          input.requirementIds.some(
            (id) => !detail.task.requirements.some((r) => r.id === id),
          )
        )
          throw new Error("Unknown requirement");
        const finding = {
          ...input,
          id: randomUUID(),
          resolution: null,
          createdAt: Date.now(),
        };
        detail.findings.push(finding);
        store.artifact(finding.id, input.taskId, "finding", finding);
        evaluate(detail, await content(detail.task.environmentId));
        save(detail);
        return detail;
      });
    },
    resolve(input: Input<"factoryResolveFinding">) {
      return locked(input.taskId, async () => {
        const detail = store.get(input.taskId);
        const finding = detail.findings.find((f) => f.id === input.findingId);
        if (!finding) throw new Error("Unknown finding");
        store.artifact(randomUUID(), input.taskId, "finding-resolution", input);
        finding.resolution = input.resolution;
        evaluate(detail, await content(detail.task.environmentId));
        save(detail);
        return detail;
      });
    },
    judge(input: Input<"factoryRecordJudgment">) {
      input = factoryRpcContract.factoryRecordJudgment.input.parse(input);
      return locked(input.taskId, async () => {
        const detail = store.get(input.taskId);
        return recordHumanJudgments(
          factoryRpcContract.factoryRecordJudgments.input.parse({
            taskId: input.taskId,
            requirementIds: [input.requirementId],
            accepted: input.accepted,
            actor: input.actor,
            rationale: input.rationale,
            humanConfirmed: input.humanConfirmed,
            expectedVersion: input.expectedVersion,
            expectedFingerprint: input.expectedFingerprint,
          }),
          detail,
        );
      });
    },
    judgeMany(input: Input<"factoryRecordJudgments">) {
      input = factoryRpcContract.factoryRecordJudgments.input.parse(input);
      return locked(input.taskId, async () =>
        recordHumanJudgments(input, store.get(input.taskId)),
      );
    },
    review(input: Input<"factoryRecordAgentReview">) {
      input = factoryRpcContract.factoryRecordAgentReview.input.parse(input);
      return locked(input.taskId, async () => {
        const detail = store.get(input.taskId);
        if (
          detail.task.phase !== "active" ||
          detail.task.stopRequested ||
          detail.task.archived
        )
          throw new Error("Agent review requires an active task");
        if (new Set(input.requirementIds).size !== input.requirementIds.length)
          throw new Error("Requirement IDs must be unique");
        if (
          input.requirementIds.some(
            (id) =>
              !detail.task.requirements.some(
                (requirement) =>
                  requirement.id === id &&
                  verificationMethods(requirement).includes("agent"),
              ),
          )
        )
          throw new Error("All selected requirements must be agent criteria");
        const state = await content(detail.task.environmentId);
        evaluate(detail, state);
        save(detail);
        if (!state.complete) throw new Error("Cannot review unknown content");
        const { expectedVersion, expectedFingerprint, ...record } = input;
        if (
          expectedVersion !== detail.task.specVersion ||
          expectedFingerprint !== state.fingerprint
        )
          throw new Error(
            "The specification or content changed since review; reload before recording",
          );
        const review = {
          ...record,
          id: randomUUID(),
          specVersion: detail.task.specVersion,
          fingerprint: state.fingerprint,
          createdAt: Date.now(),
        };
        detail.reviews.push(review);
        evaluate(detail, state);
        db.transaction(() => {
          store.artifact(review.id, input.taskId, "agent-review", review);
          save(detail);
        })();
        return detail;
      });
    },
    note(input: Input<"factoryRecordNote">) {
      input = factoryRpcContract.factoryRecordNote.input.parse(input);
      return locked(input.taskId, async () => {
        const detail = store.get(input.taskId);
        const state = await content(detail.task.environmentId);
        const note = {
          ...input,
          id: randomUUID(),
          specVersion: detail.task.specVersion,
          fingerprint: state.complete ? state.fingerprint : null,
          createdAt: Date.now(),
        };
        detail.notes.push(note);
        db.transaction(() => {
          store.artifact(note.id, input.taskId, "note", note);
          save(detail);
        })();
        return detail;
      });
    },
    async reconcile() {
      const captures = new Map<string, Promise<FactoryContent>>();
      for (const detail of store.all())
        await locked(detail.task.id, () => refresh(detail.task.id, captures));
    },
    async archiveThread(threadId: string) {
      await Promise.all(
        store
          .list(threadId)
          .map((detail) =>
            service.cancelTask({ taskId: detail.task.id, archive: true }),
          ),
      );
    },
  };
  return service;
}
export type FactoryService = ReturnType<typeof createFactoryService>;
