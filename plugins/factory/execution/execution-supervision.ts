import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { Db } from "./data.js";
import {
  executionGuidanceReceiptSchema,
  type ExecutionIdentity,
  type ExecutionSnapshot,
  type ExecutionWaitInput,
  type ExecutionWaitResult,
} from "./execution-contract.js";
import type { WorkflowService } from "./service.js";
import { utf8Prefix } from "./utf8.js";

interface GuidanceInput extends ExecutionIdentity {
  guidanceId: string;
  assignmentId: string;
  message: string;
  mode: "steer" | "followUp";
}
interface GuidanceRow {
  guidanceId: string;
  assignmentId: string;
  threadId: string;
  message: string;
  mode: string;
  delivery: string;
}
interface EventRow {
  sequence: number;
  runId: string;
  assignmentId: string | null;
  threadId: string | null;
  status: "succeeded" | "failed" | "cancelled";
  output: string | null;
  error: string | null;
}

export function createExecutionSupervision(
  bb: BbPluginApi,
  db: Db,
  service: WorkflowService,
  inspect: (identity: ExecutionIdentity) => ExecutionSnapshot,
  resolveRunId: (identity: ExecutionIdentity) => string,
) {
  function guidance(
    runId: string,
    guidanceId: string,
  ): GuidanceRow | undefined {
    return db
      .prepare(
        `SELECT guidance_id AS guidanceId, assignment_id AS assignmentId, thread_id AS threadId,
      message, mode, delivery FROM workflow_execution_guidance WHERE run_id = ? AND guidance_id = ?`,
      )
      .get(runId, guidanceId) as GuidanceRow | undefined;
  }
  function receipt(row: GuidanceRow) {
    return executionGuidanceReceiptSchema.parse({
      guidanceId: row.guidanceId,
      threadId: row.threadId,
      delivery: row.delivery,
      compliance: "unverified",
    });
  }
  return {
    async guide(input: GuidanceInput) {
      const snapshot = inspect(input);
      const previous = guidance(snapshot.runId, input.guidanceId);
      if (previous !== undefined) {
        if (
          previous.assignmentId !== input.assignmentId ||
          previous.message !== input.message ||
          previous.mode !== input.mode
        )
          throw new Error("Guidance identity already has a different request");
        return receipt(previous);
      }
      const assignment = snapshot.assignments.find(
        (entry) => entry.id === input.assignmentId,
      );
      if (!assignment?.threadId || assignment.status !== "running")
        throw new Error(
          "Assignment has no running native worker; use a new Factory assignment with continuationThreadId to continue a settled session",
        );
      db.prepare(
        `INSERT INTO workflow_execution_guidance (run_id, guidance_id, assignment_id, thread_id, message, mode, delivery)
        VALUES (?, ?, ?, ?, ?, ?, 'uncertain')`,
      ).run(
        snapshot.runId,
        input.guidanceId,
        input.assignmentId,
        assignment.threadId,
        input.message,
        input.mode,
      );
      try {
        await bb.sdk.threads.send({
          threadId: assignment.threadId,
          input: [{ type: "text", text: input.message, mentions: [] }],
          mode: input.mode === "steer" ? "steer" : "queue-if-active",
        });
        db.prepare(
          "UPDATE workflow_execution_guidance SET delivery = 'submitted' WHERE run_id = ? AND guidance_id = ?",
        ).run(snapshot.runId, input.guidanceId);
      } catch (error) {
        bb.log.warn(
          `Guidance ${input.guidanceId} delivery uncertain; automatic resend suppressed: ${String(error)}`,
        );
      }
      return receipt(guidance(snapshot.runId, input.guidanceId)!);
    },
    guideStatus(input: ExecutionIdentity & { guidanceId: string }) {
      const row = guidance(resolveRunId(input), input.guidanceId);
      return row === undefined ? null : receipt(row);
    },
    wait(input: ExecutionWaitInput): Promise<ExecutionWaitResult> {
      const targets = input.targets.map((target) => ({
        ...target,
        runId: resolveRunId(target),
      }));
      if (
        new Set(targets.map((target) => target.runId)).size !== targets.length
      )
        throw new Error("Wait targets must be unique");
      function result(): ExecutionWaitResult {
        let first: EventRow | undefined;
        for (const target of targets) {
          const event = db
            .prepare(
              `SELECT sequence, run_id AS runId, assignment_id AS assignmentId, thread_id AS threadId,
            status, result_json AS output, error FROM workflow_execution_events WHERE run_id = ? AND sequence > ? ORDER BY sequence LIMIT 1`,
            )
            .get(target.runId, target.afterCursor) as EventRow | undefined;
          if (
            event !== undefined &&
            (first === undefined || event.sequence < first.sequence)
          )
            first = event;
        }
        const output =
          first?.output == null ? null : utf8Prefix(first.output, 2048);
        const error =
          first?.error == null ? null : utf8Prefix(first.error, 1024);
        return {
          event:
            first === undefined
              ? null
              : {
                  ...first,
                  kind: first.assignmentId === null ? "run" : "assignment",
                  output,
                  error,
                  outputTruncated: output !== first.output,
                  errorTruncated: error !== first.error,
                },
          cursors: targets.map((target) => ({
            originThreadId: target.originThreadId,
            callerTaskId: target.callerTaskId,
            launchId: target.launchId,
            cursor:
              first?.runId === target.runId
                ? first.sequence
                : target.afterCursor,
          })),
          timedOut: first === undefined,
        };
      }
      return new Promise((resolve, reject) => {
        let unsubscribe = () => {};
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (timeout: boolean) => {
          try {
            const snapshot = result();
            if (!timeout && snapshot.event === null) return;
            unsubscribe();
            clearTimeout(timer);
            resolve(snapshot);
          } catch (error) {
            unsubscribe();
            clearTimeout(timer);
            reject(error);
          }
        };
        unsubscribe = service.subscribeExecution(
          targets.map((target) => target.runId),
          () => finish(false),
        );
        timer = setTimeout(() => finish(true), input.timeoutMs);
        finish(input.timeoutMs === 0);
      });
    },
  };
}
