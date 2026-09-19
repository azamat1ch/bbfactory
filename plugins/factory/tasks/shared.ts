import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const id = z.string().trim().min(1).max(200);
export const FACTORY_TASKS_REALTIME_CHANNEL = "factory-tasks";
export const FACTORY_TASK_DIRECTIVE_ID = "factory-task";
export const FACTORY_PANEL_ACTION_ID = "factory-task";
export const requirementSchema = z.strictObject({
  id,
  text: z.string().min(1),
  criterion: z.enum(["automated", "agent", "human"]),
  verificationMethods: z
    .array(z.enum(["automated", "agent", "human"]))
    .max(3)
    .refine(
      (methods) => new Set(methods).size === methods.length,
      "Verification methods must be unique",
    )
    .default([]),
  reviewInstructions: z.string().default(""),
  artifactRefs: z.array(z.string()).default([]),
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
export const teamPlanItemSchema = z.strictObject({
  id,
  title: id,
  role: z.enum(["implement", "review", "research"]),
  profile: profileSchema,
  requirementIds: z.array(id),
  rationale: z.string(),
});
const specFields = {
  problem: z.string().default(""),
  outcome: z.string().default(""),
  goal: z.string().min(1).max(4000),
  scope: z.string().min(1).max(8000),
  requirements: z.array(requirementSchema).min(1).max(128),
  scenarios: z.array(scenarioSchema).max(256),
  checks: z.array(checkSpecSchema).max(128),
  teamPlan: z.array(teamPlanItemSchema).default([]),
};
export const specSchema = z
  .strictObject(specFields)
  .superRefine((spec, ctx) => {
    const requirements = new Set(spec.requirements.map((r) => r.id));
    for (const items of [
      spec.requirements,
      spec.scenarios,
      spec.checks,
      spec.teamPlan,
    ]) {
      if (new Set(items.map((item) => item.id)).size !== items.length)
        ctx.addIssue({
          code: "custom",
          message: "Identifiers must be unique within each collection",
        });
    }
    for (const item of [...spec.scenarios, ...spec.checks, ...spec.teamPlan])
      for (const requirement of item.requirementIds)
        if (!requirements.has(requirement))
          ctx.addIssue({
            code: "custom",
            message: `Unknown requirement ${requirement}`,
          });
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
  continuationThreadId: id.nullable().optional(),
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
  rationale: z.string(),
  createdAt: z.number(),
});
export const reviewSchema = z.strictObject({
  id,
  taskId: id,
  requirementIds: z.array(id).min(1),
  specVersion: z.number().int(),
  fingerprint: id,
  reviewer: z.string().min(1),
  summary: z.string().min(1),
  limitations: z.string(),
  artifactRefs: z.array(z.string().min(1)).min(1),
  accepted: z.boolean(),
  createdAt: z.number(),
});
export const noteSchema = z.strictObject({
  id,
  taskId: id,
  kind: z.enum(["note", "decision", "blocker", "conclusion"]),
  text: z.string().min(1),
  artifactRefs: z.array(z.string()),
  specVersion: z.number().int(),
  fingerprint: z.string().nullable(),
  createdAt: z.number(),
});
export const taskViewSchema = z.strictObject({
  id,
  projectId: id,
  originThreadId: id,
  environmentId: id,
  problem: z.string().default(""),
  outcome: z.string().default(""),
  goal: z.string(),
  scope: z.string(),
  requirements: z.array(requirementSchema),
  scenarios: z.array(scenarioSchema),
  checks: z.array(checkSpecSchema),
  teamPlan: z.array(teamPlanItemSchema).default([]),
  phase: z.enum(["draft", "active"]).default("active"),
  specVersion: z.number().int(),
  status: z.enum(["accepted", "failed", "unverified", "stale"]),
  statusDetail: z.string(),
  archived: z.boolean(),
  stopRequested: z.boolean(),
  executionRunning: z.boolean().default(false),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export function verificationMethods(
  requirement: z.infer<typeof requirementSchema>,
) {
  return requirement.verificationMethods.length
    ? requirement.verificationMethods
    : [requirement.criterion];
}
const approvalFields = {
  scope: z.enum(["delivery", "selected"]),
  requirementIds: z.array(id),
  accepted: z.boolean(),
  actor: id,
  source: z.enum(["ui", "cli", "chat"]).default("ui"),
  sourceRef: z.string().min(1).nullable().default(null),
  rationale: z.string().default(""),
};
export const approvalSchema = z.strictObject({
  id,
  taskId: id,
  specVersion: z.number().int(),
  fingerprint: id,
  ...approvalFields,
  createdAt: z.number(),
});
export const deliverySchema = z.strictObject({
  id,
  taskId: id,
  specVersion: z.number().int(),
  content: contentSchema,
  mergeUrl: z.string().url().nullable(),
  status: z.literal("delivered"),
  verificationStatus: z.enum(["accepted", "failed", "unverified", "stale"]),
  createdAt: z.number(),
});
export const specBundleSchema = z.strictObject({
  format: z.literal("factory-spec"),
  formatVersion: z.literal(1),
  source: z
    .strictObject({
      taskId: id,
      specVersion: z.number().int().positive(),
      exportedAt: z.number().int().nonnegative(),
    })
    .optional(),
  spec: specSchema,
});
export const taskDetailSchema = z.strictObject({
  observedContent: contentSchema.nullable().default(null),
  invalidatedEvidenceIds: z.array(id).default([]),
  approvals: z.array(approvalSchema).default([]),
  deliveries: z.array(deliverySchema).default([]),
  task: taskViewSchema,
  assignments: z.array(assignmentSchema),
  evidence: z.array(evidenceSchema),
  findings: z.array(findingSchema),
  judgments: z.array(judgmentSchema),
  reviews: z.array(reviewSchema).default([]),
  notes: z.array(noteSchema).default([]),
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
  factoryApproveDelivery: {
    input: z.strictObject({
      taskId: id,
      expectedVersion: z.number().int().positive(),
      expectedFingerprint: id,
      humanConfirmed: z.literal(true),
      ...approvalFields,
    }),
    output: taskDetailSchema,
  },
  factoryRecordDelivery: {
    input: z.strictObject({
      taskId: id,
      expectedVersion: z.number().int().positive(),
      expectedFingerprint: id,
      mergeUrl: z.string().url().nullable().default(null),
    }),
    output: taskDetailSchema,
  },
  factoryResumeTask: {
    input: z.strictObject({
      taskId: id,
      expectedVersion: z.number().int().positive(),
    }),
    output: taskDetailSchema,
  },
  factoryExportSpec: { input: taskIdInput, output: specBundleSchema },
  factoryImportSpec: {
    input: z.strictObject({ threadId: id, bundle: specBundleSchema }),
    output: z.strictObject({
      task: taskViewSchema,
      previewDirective: z.string(),
    }),
  },
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
  factoryStartTask: {
    input: z.strictObject({
      taskId: id,
      expectedVersion: z.number().int().positive(),
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
      rationale: z.string(),
      humanConfirmed: z.literal(true),
      expectedVersion: z.number().int().positive(),
      expectedFingerprint: id,
    }),
    output: taskDetailSchema,
  },
  factoryRecordJudgments: {
    input: z.strictObject({
      taskId: id,
      requirementIds: z.array(id).min(1),
      accepted: z.boolean(),
      actor: z.string().min(1),
      rationale: z.string(),
      humanConfirmed: z.literal(true),
      expectedVersion: z.number().int().positive(),
      expectedFingerprint: id,
    }),
    output: taskDetailSchema,
  },
  factoryRecordAgentReview: {
    input: z.strictObject({
      taskId: id,
      requirementIds: z.array(id).min(1),
      expectedVersion: z.number().int().positive(),
      expectedFingerprint: id,
      reviewer: z.string().min(1),
      summary: z.string().min(1),
      limitations: z.string(),
      artifactRefs: z.array(z.string().min(1)).min(1),
      accepted: z.boolean(),
    }),
    output: taskDetailSchema,
  },
  factoryRecordNote: {
    input: z.strictObject({
      taskId: id,
      kind: z.enum(["note", "decision", "blocker", "conclusion"]),
      text: z.string().min(1),
      artifactRefs: z.array(z.string()),
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
