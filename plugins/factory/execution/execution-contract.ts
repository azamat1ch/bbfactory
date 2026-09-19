import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const id = z.string().trim().min(1).max(200);
const status = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export const executionIdentitySchema = z
  .object({
    originThreadId: id,
    callerTaskId: id,
    launchId: id,
  })
  .strict();
export const executionAssignmentSchema = z
  .object({
    id,
    prompt: z.string().min(1).max(100_000),
    title: id,
    providerId: id,
    model: id,
    reasoningLevel: z.enum([
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
      "ultracode",
      "max",
      "ultra",
    ]),
    serviceTier: z.enum(["default", "fast"]),
    environment: z
      .object({ type: z.literal("reuse"), environmentId: id })
      .strict(),
    permissionMode: z.enum(["accept-edits", "auto", "full"]),
    scope: z.string().min(1).max(10_000),
    continuationThreadId: id.nullable().optional(),
    ownership: z
      .enum(["read-only", "exclusive"])
      .default("exclusive")
      .describe(
        "Advisory workspace coordination only; does not change provider permissions. Omitted legacy metadata is exclusive.",
      ),
  })
  .strict();
export const executionStartSchema = executionIdentitySchema
  .extend({
    projectId: id,
    assignments: z.array(executionAssignmentSchema).min(1).max(32),
  })
  .superRefine((value, context) => {
    if (
      new Set(value.assignments.map((entry) => entry.id)).size !==
      value.assignments.length
    )
      context.addIssue({
        code: "custom",
        message: "Assignment IDs must be unique",
      });
  });
export const executionSnapshotSchema = z
  .object({
    runId: id,
    status,
    nativeSettlement: z.enum(["pending", "unconfirmed", "confirmed"]),
    assignments: z.array(
      z
        .object({
          id,
          callId: id.nullable(),
          threadId: id.nullable(),
          status,
          result: z.json(),
          error: z.string().nullable(),
          environmentId: id,
          permissionMode: z.enum(["accept-edits", "auto", "full"]),
          scope: z.string(),
          ownership: z.enum(["read-only", "exclusive"]).default("exclusive"),
        })
        .strict(),
    ),
    error: z.string().nullable(),
  })
  .strict();
export const executionGuidanceReceiptSchema = z
  .object({
    guidanceId: id,
    threadId: id,
    delivery: z.enum(["submitted", "uncertain"]),
    compliance: z.literal("unverified"),
  })
  .strict();
export const executionWaitInputSchema = z
  .object({
    targets: z
      .array(
        executionIdentitySchema.extend({
          afterCursor: z
            .number()
            .int()
            .nonnegative()
            .max(Number.MAX_SAFE_INTEGER),
        }),
      )
      .min(1)
      .max(32),
    timeoutMs: z.number().int().min(0).max(30_000),
  })
  .strict();
export const executionWaitResultSchema = z
  .object({
    event: z
      .object({
        sequence: z.number().int().positive(),
        runId: id,
        kind: z.enum(["assignment", "run"]),
        assignmentId: id.nullable(),
        threadId: id.nullable(),
        status: z.enum(["succeeded", "failed", "cancelled"]),
        output: z.string().nullable(),
        error: z.string().nullable(),
        outputTruncated: z.boolean(),
        errorTruncated: z.boolean(),
      })
      .strict()
      .nullable(),
    cursors: z
      .array(
        executionIdentitySchema.extend({
          cursor: z.number().int().nonnegative(),
        }),
      )
      .max(32),
    timedOut: z.boolean(),
  })
  .strict();
export const workflowExecutionRpcContract = defineRpcContract({
  experimental_executionStart: {
    input: executionStartSchema,
    output: executionSnapshotSchema,
  },
  experimental_executionInspect: {
    input: executionIdentitySchema,
    output: executionSnapshotSchema,
  },
  experimental_executionCancel: {
    input: executionIdentitySchema,
    output: executionSnapshotSchema.extend({ stopConfirmed: z.boolean() }),
  },
  experimental_executionGuide: {
    input: executionIdentitySchema.extend({
      guidanceId: id,
      assignmentId: id,
      message: z.string().min(1).max(100_000),
      mode: z.enum(["steer", "followUp"]),
    }),
    output: executionGuidanceReceiptSchema,
  },
  experimental_executionGuideStatus: {
    input: executionIdentitySchema.extend({ guidanceId: id }),
    output: executionGuidanceReceiptSchema.nullable(),
  },
  experimental_executionWait: {
    input: executionWaitInputSchema,
    output: executionWaitResultSchema,
  },
});
export type ExecutionIdentity = z.infer<typeof executionIdentitySchema>;
export type ExecutionStart = z.infer<typeof executionStartSchema>;
export type ExecutionAssignment = z.infer<typeof executionAssignmentSchema>;
export type ExecutionSnapshot = z.infer<typeof executionSnapshotSchema>;

export type ExecutionWaitInput = z.infer<typeof executionWaitInputSchema>;
export type ExecutionWaitResult = z.infer<typeof executionWaitResultSchema>;
