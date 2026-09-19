import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const FACTORY_TASKS_REALTIME_CHANNEL = "factory-tasks";
export const FACTORY_TASK_DIRECTIVE_ID = "factory-task";
export const FACTORY_PANEL_ACTION_ID = "factory-task";
export const FACTORY_WORKER_METADATA_KEY = "factoryWorker";

export const MAX_CHECK_COUNT = 16;
export const MAX_CHECK_ARGV_LENGTH = 64;
export const DEFAULT_CHECK_TIMEOUT_MS = 10 * 60 * 1000;
export const MAX_CHECK_TIMEOUT_MS = 30 * 60 * 1000;

export const taskStatusSchema = z.enum([
  "proposed",
  "running",
  "awaiting_checks",
  "accepted",
  "failed",
  "blocked",
  "cancelling",
  "cancelled",
]);
export type FactoryTaskStatus = z.infer<typeof taskStatusSchema>;

export const attemptStateSchema = z.enum([
  "spawning",
  "uncertain",
  "running",
  "completed",
  "verifying",
  "verified",
  "cancelling",
  "halted",
  "settled",
]);
export type FactoryAttemptState = z.infer<typeof attemptStateSchema>;

export const attemptIntentSchema = z.enum(["direct", "delegate"]);
export type FactoryAttemptIntent = z.infer<typeof attemptIntentSchema>;

export const evidenceStatusSchema = z.enum([
  "running",
  "passed",
  "failed",
  "error",
  "stale",
  "incomplete",
]);
export type FactoryEvidenceStatus = z.infer<typeof evidenceStatusSchema>;

export const checkSpecSchema = z
  .object({
    id: z.string().trim().min(1).max(80).optional(),
    argv: z.array(z.string().min(1)).min(1).max(MAX_CHECK_ARGV_LENGTH),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .max(MAX_CHECK_TIMEOUT_MS)
      .optional(),
  })
  .strict();
export type FactoryCheckSpecInput = z.infer<typeof checkSpecSchema>;

export interface FactoryCheckSpec {
  id: string;
  argv: string[];
  timeoutMs: number;
}

export const taskViewSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    originThreadId: z.string(),
    goal: z.string(),
    scope: z.string(),
    requirementIds: z.array(z.string()),
    checks: z.array(
      z.object({
        id: z.string(),
        argv: z.array(z.string()),
        timeoutMs: z.number(),
      }),
    ),
    specVersion: z.number().int().positive(),
    status: taskStatusSchema,
    statusDetail: z.string().nullable(),
    activeAttemptId: z.string().nullable(),
    acceptedAttemptId: z.string().nullable(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .strict();
export type FactoryTaskView = z.infer<typeof taskViewSchema>;

export const attemptViewSchema = z
  .object({
    id: z.string(),
    taskId: z.string(),
    seq: z.number().int().positive(),
    intent: attemptIntentSchema,
    state: attemptStateSchema,
    stateDetail: z.string().nullable(),
    workerThreadId: z.string().nullable(),
    environmentId: z.string().nullable(),
    hostId: z.string().nullable(),
    workspacePath: z.string().nullable(),
    baseRevision: z.string().nullable(),
    baseFingerprint: z.string().nullable(),
    providerId: z.string().nullable(),
    model: z.string().nullable(),
    reasoningLevel: z.string().nullable(),
    permissionMode: z.string().nullable(),
    createdAt: z.number(),
    updatedAt: z.number(),
    finishedAt: z.number().nullable(),
  })
  .strict();
export type FactoryAttemptView = z.infer<typeof attemptViewSchema>;

export const evidenceViewSchema = z
  .object({
    id: z.string(),
    taskId: z.string(),
    attemptId: z.string(),
    checkId: z.string(),
    checkArgv: z.array(z.string()),
    specVersion: z.number().int(),
    contentFingerprint: z.string(),
    hostId: z.string(),
    workspacePath: z.string(),
    status: evidenceStatusSchema,
    detail: z.string().nullable(),
    exitCode: z.number().nullable(),
    timedOut: z.boolean(),
    startedAt: z.number().nullable(),
    finishedAt: z.number().nullable(),
    durationMs: z.number().nullable(),
    logRef: z.string().nullable(),
    outputTail: z.string().nullable(),
    createdAt: z.number(),
  })
  .strict();
export type FactoryEvidenceView = z.infer<typeof evidenceViewSchema>;

const taskDetailSchema = z
  .object({
    task: taskViewSchema,
    attempts: z.array(attemptViewSchema),
    evidence: z.array(evidenceViewSchema),
  })
  .strict();
export type FactoryTaskDetail = z.infer<typeof taskDetailSchema>;

export const reasoningLevelInputSchema = z.enum([
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "ultracode",
  "max",
  "ultra",
]);

export const permissionModeInputSchema = z.enum([
  "accept-edits",
  "auto",
  "full",
  "workspace-write",
]);

export const startAttemptInputSchema = z
  .object({
    taskId: z.string().trim().min(1),
    mode: attemptIntentSchema,
    providerId: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).optional(),
    reasoningLevel: reasoningLevelInputSchema.optional(),
    permissionMode: permissionModeInputSchema.optional(),
  })
  .strict();

export const factoryRpcContract = defineRpcContract({
  factoryListTasks: {
    input: z
      .object({
        threadId: z.string().trim().min(1).optional(),
        projectId: z.string().trim().min(1).optional(),
      })
      .strict(),
    output: z.object({ tasks: z.array(taskViewSchema) }).strict(),
  },
  factoryGetTask: {
    input: z.object({ taskId: z.string().trim().min(1) }).strict(),
    output: taskDetailSchema,
  },
  factoryCreateTask: {
    input: z
      .object({
        threadId: z.string().trim().min(1),
        goal: z.string().trim().min(1).max(4000),
        scope: z.string().trim().max(8000).optional(),
        requirementIds: z.array(z.string().trim().min(1).max(120)).max(64).optional(),
        checks: z.array(checkSpecSchema).max(MAX_CHECK_COUNT).optional(),
      })
      .strict(),
    output: z
      .object({ task: taskViewSchema, previewDirective: z.string() })
      .strict(),
  },
  factoryUpdateTask: {
    input: z
      .object({
        taskId: z.string().trim().min(1),
        goal: z.string().trim().min(1).max(4000).optional(),
        scope: z.string().trim().max(8000).optional(),
        requirementIds: z
          .array(z.string().trim().min(1).max(120))
          .max(64)
          .optional(),
        checks: z.array(checkSpecSchema).max(MAX_CHECK_COUNT).optional(),
      })
      .strict(),
    output: z.object({ task: taskViewSchema }).strict(),
  },
  factoryStartAttempt: {
    input: startAttemptInputSchema,
    output: z
      .object({ task: taskViewSchema, attempt: attemptViewSchema })
      .strict(),
  },
  factoryCompleteAttempt: {
    input: z.object({ taskId: z.string().trim().min(1) }).strict(),
    output: z.object({ task: taskViewSchema }).strict(),
  },
  factoryVerifyTask: {
    input: z.object({ taskId: z.string().trim().min(1) }).strict(),
    output: z.object({ task: taskViewSchema }).strict(),
  },
  factoryCancelTask: {
    input: z.object({ taskId: z.string().trim().min(1) }).strict(),
    output: z.object({ task: taskViewSchema }).strict(),
  },
});

export const captureStateOutputSchema = z
  .object({
    isGitRepo: z.boolean(),
    head: z.string().nullable(),
    fingerprint: z.string(),
    fileCount: z.number().int().nonnegative(),
    incomplete: z.boolean(),
    incompleteReasons: z.array(z.string().max(400)).max(50),
  })
  .strict();
export type FactoryCaptureState = z.infer<typeof captureStateOutputSchema>;

export const factoryHostContract = defineRpcContract({
  captureState: {
    input: z.object({ rootPath: z.string().min(1) }).strict(),
    output: captureStateOutputSchema,
  },
  runCheck: {
    input: z
      .object({
        rootPath: z.string().min(1),
        argv: z.array(z.string().min(1)).min(1).max(MAX_CHECK_ARGV_LENGTH),
        timeoutMs: z.number().int().positive().max(MAX_CHECK_TIMEOUT_MS),
        logFileName: z.string().min(1).max(160),
      })
      .strict(),
    output: z
      .object({
        exitCode: z.number().int().nullable(),
        timedOut: z.boolean(),
        startedAt: z.number(),
        finishedAt: z.number(),
        durationMs: z.number(),
        logPath: z.string(),
        outputTail: z.string(),
        outputTruncated: z.boolean(),
        processTreeSettled: z.boolean(),
      })
      .strict(),
  },
  watchWorkspace: {
    input: z
      .object({
        key: z.string().min(1).max(120),
        rootPath: z.string().min(1),
        ignoredPaths: z.array(z.string().min(1)).max(64).optional(),
      })
      .strict(),
    output: z.object({ watching: z.literal(true) }).strict(),
  },
  unwatchWorkspace: {
    input: z.object({ key: z.string().min(1).max(120) }).strict(),
    output: z.object({ ok: z.literal(true) }).strict(),
  },
});

export const factoryHostSignals = {
  workspaceChanged: {
    payload: z.object({ key: z.string() }).strict(),
  },
};
