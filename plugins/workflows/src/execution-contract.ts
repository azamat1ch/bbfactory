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
        })
        .strict(),
    ),
    error: z.string().nullable(),
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
      assignmentId: id,
      message: z.string().min(1).max(100_000),
      mode: z.enum(["steer", "followUp"]),
    }),
    output: z
      .object({
        threadId: id,
        delivery: z.literal("submitted"),
        compliance: z.literal("unverified"),
      })
      .strict(),
  },
});
export type ExecutionIdentity = z.infer<typeof executionIdentitySchema>;
export type ExecutionStart = z.infer<typeof executionStartSchema>;
export type ExecutionAssignment = z.infer<typeof executionAssignmentSchema>;
export type ExecutionSnapshot = z.infer<typeof executionSnapshotSchema>;
