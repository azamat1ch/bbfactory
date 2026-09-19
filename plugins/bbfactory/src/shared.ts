import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const id = z.string().trim().min(1).max(200);
export const FACTORY_TASKS_REALTIME_CHANNEL = "factory-tasks";
export const FACTORY_TASK_DIRECTIVE_ID = "factory-task";
export const FACTORY_PANEL_ACTION_ID = "factory-task";
export const requirementSchema = z.strictObject({
  id,
  text: z.string().min(1),
  criterion: z.enum(["automated", "human"]),
});
export const scenarioSchema = z.strictObject({
  id,
  requirementIds: z.array(id).min(1),
  given: z.string().min(1),
  when: z.string().min(1),
  then: z.string().min(1),
});
export const checkSpecSchema = z.strictObject({
  id,
  requirementIds: z.array(id).min(1),
  testRef: z.string().min(1),
  argv: z.array(z.string().min(1)).min(1).max(64),
  timeoutMs: z.number().int().min(1).max(1800000),
  required: z.boolean(),
});
export const specSchema = z
  .strictObject({
    goal: z.string().min(1).max(4000),
    scope: z.string().min(1).max(8000),
    requirements: z.array(requirementSchema).min(1).max(64),
    scenarios: z.array(scenarioSchema).max(128),
    checks: z.array(checkSpecSchema).max(32),
  })
  .superRefine((spec, ctx) => {
    const requirements = new Set(spec.requirements.map((r) => r.id));
    for (const items of [spec.requirements, spec.scenarios, spec.checks]) {
      if (new Set(items.map((item) => item.id)).size !== items.length)
        ctx.addIssue({
          code: "custom",
          message: "Identifiers must be unique within each collection",
        });
    }
    for (const item of [...spec.scenarios, ...spec.checks])
      for (const requirement of item.requirementIds)
        if (!requirements.has(requirement))
          ctx.addIssue({
            code: "custom",
            message: `Unknown requirement ${requirement}`,
          });
  });
export const profileSchema = z.strictObject({
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
});
export const assignmentInputSchema = z.strictObject({
  id,
  role: z.enum(["implement", "review", "research"]),
  prompt: z.string().min(1),
  title: id,
  profile: profileSchema,
  environmentId: id,
  permissionMode: z.enum(["accept-edits", "auto", "full"]),
  scope: z.string().min(1),
  ownership: z.enum(["read-only", "exclusive"]),
});
export const assignmentSchema = assignmentInputSchema.extend({
  launchId: id,
  preferenceRevision: z.number().int(),
  overrideReason: z.string().nullable(),
  hostId: id,
  workspacePath: id,
  runId: z.string().nullable(),
  threadId: z.string().nullable(),
  nativeStatus: z.string(),
  result: z.unknown().nullable(),
  error: z.string().nullable(),
});
export const contentSchema = z.strictObject({
  fingerprint: id,
  canonicalPath: id,
  complete: z.boolean(),
  detail: z.string().nullable(),
});
export const checkResultSchema = z.strictObject({
  exitCode: z.number().int().nullable(),
  timedOut: z.boolean(),
  settled: z.boolean(),
  startedAt: z.number(),
  finishedAt: z.number(),
  logRef: z.string().nullable(),
  output: z.string(),
  detail: z.string().nullable(),
});
export const evidenceSchema = z.strictObject({
  id,
  taskId: id,
  specVersion: z.number().int(),
  check: checkSpecSchema,
  content: contentSchema,
  environmentId: id,
  hostId: id,
  result: checkResultSchema,
  outcome: z.enum(["passed", "failed", "unverified", "stale"]),
});
export const findingSchema = z.strictObject({
  id,
  taskId: id,
  requirementIds: z.array(id),
  evidence: z.string().min(1),
  required: z.boolean(),
  resolution: z.string().nullable(),
  createdAt: z.number(),
});
export const judgmentSchema = z.strictObject({
  id,
  taskId: id,
  requirementId: id,
  specVersion: z.number().int(),
  fingerprint: id,
  accepted: z.boolean(),
  actor: z.string().min(1),
  rationale: z.string().min(1),
  createdAt: z.number(),
});
export const taskViewSchema = z.strictObject({
  id,
  projectId: id,
  originThreadId: id,
  environmentId: id,
  goal: z.string(),
  scope: z.string(),
  requirements: z.array(requirementSchema),
  scenarios: z.array(scenarioSchema),
  checks: z.array(checkSpecSchema),
  specVersion: z.number().int(),
  status: z.enum(["accepted", "failed", "unverified", "stale"]),
  statusDetail: z.string(),
  archived: z.boolean(),
  stopRequested: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export const taskDetailSchema = z.strictObject({
  observedContent: contentSchema.nullable().default(null),
  task: taskViewSchema,
  assignments: z.array(assignmentSchema),
  evidence: z.array(evidenceSchema),
  findings: z.array(findingSchema),
  judgments: z.array(judgmentSchema),
  specs: z.array(
    z.strictObject({
      version: z.number().int(),
      spec: specSchema,
      changeReason: z.string(),
      createdAt: z.number(),
    }),
  ),
});
const taskIdInput = z.strictObject({ taskId: id });
export const factoryRpcContract = defineRpcContract({
  factoryListTasks: {
    input: z.strictObject({ threadId: id }),
    output: z.strictObject({ tasks: z.array(taskViewSchema) }),
  },
  factoryGetTask: { input: taskIdInput, output: taskDetailSchema },
  factoryCreateTask: {
    input: z.strictObject({ threadId: id, spec: specSchema }),
    output: z.strictObject({
      task: taskViewSchema,
      previewDirective: z.string(),
    }),
  },
  factoryUpdateTask: {
    input: z.strictObject({
      taskId: id,
      expectedVersion: z.number().int(),
      spec: specSchema,
      changeReason: z.string().min(1),
    }),
    output: taskDetailSchema,
  },
  factoryVerifyTask: { input: taskIdInput, output: taskDetailSchema },
  factoryAssign: {
    input: z.strictObject({
      taskId: id,
      launchId: id,
      assignments: z.array(assignmentInputSchema).min(1).max(32),
      overrideReason: z.string().min(1).optional(),
    }),
    output: taskDetailSchema,
  },
  factoryCancelTask: {
    input: z.strictObject({ taskId: id, archive: z.boolean() }),
    output: taskDetailSchema,
  },
  factoryRecordFinding: {
    input: z.strictObject({
      taskId: id,
      requirementIds: z.array(id),
      evidence: z.string().min(1),
      required: z.boolean(),
    }),
    output: taskDetailSchema,
  },
  factoryResolveFinding: {
    input: z.strictObject({
      taskId: id,
      findingId: id,
      resolution: z.string().min(1),
    }),
    output: taskDetailSchema,
  },
  factoryRecordJudgment: {
    input: z.strictObject({
      taskId: id,
      requirementId: id,
      accepted: z.boolean(),
      actor: z.string().min(1),
      rationale: z.string().min(1),
      humanConfirmed: z.literal(true),
      expectedVersion: z.number().int().positive(),
      expectedFingerprint: id,
    }),
    output: taskDetailSchema,
  },
});
export const factoryHostContract = defineRpcContract({
  captureState: {
    input: z.strictObject({ rootPath: id }),
    output: contentSchema,
  },
  runCheck: {
    input: z.strictObject({ rootPath: id, check: checkSpecSchema }),
    output: checkResultSchema,
  },
});
export type FactoryTaskView = z.infer<typeof taskViewSchema>;
export type FactoryTaskDetail = z.infer<typeof taskDetailSchema>;
export type FactorySpec = z.infer<typeof specSchema>;
export type FactoryEvidence = z.infer<typeof evidenceSchema>;
export type FactoryAssignment = z.infer<typeof assignmentSchema>;
export type FactoryContent = z.infer<typeof contentSchema>;
