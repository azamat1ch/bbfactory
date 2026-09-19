import type { BbPluginApi, PluginAgentToolResult } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { registerFactoryCli } from "./cli.js";
import { createFactoryService } from "./service.js";
import {
  checkSpecSchema,
  factoryRpcContract,
  permissionModeInputSchema,
  reasoningLevelInputSchema,
} from "./shared.js";

const toolInputSchema = z
  .object({
    action: z
      .enum(["create", "status", "start", "complete", "verify", "cancel"])
      .describe(
        "create: define a task. status: read durable task state. start: run directly or delegate to a provider. complete: report the current attempt done (direct mode). verify: run declared checks independently. cancel: request cancellation.",
      ),
    taskId: z
      .string()
      .min(1)
      .describe("Task id (bft_…). Required except for create/status-list.")
      .optional(),
    goal: z.string().min(1).describe("Task goal (create).").optional(),
    scope: z.string().describe("Boundaries of what may change (create).").optional(),
    requirementIds: z
      .array(z.string().min(1))
      .describe("Requirement identifiers the task must satisfy (create).")
      .optional(),
    checks: z
      .array(checkSpecSchema)
      .describe(
        "Declared checks, each {argv: [program, ...args]} run independently on the workspace after the writer finishes (create).",
      )
      .optional(),
    mode: z
      .enum(["direct", "delegate"])
      .describe("direct: you execute in this thread; delegate: a native worker thread runs the task (start).")
      .optional(),
    providerId: z.string().min(1).describe("Delegate provider id (start).").optional(),
    model: z.string().min(1).optional(),
    reasoningLevel: reasoningLevelInputSchema.optional(),
    permissionMode: permissionModeInputSchema.optional(),
  })
  .strict();

function jsonResult(value: unknown): PluginAgentToolResult {
  return JSON.stringify(value, null, 2);
}

function errorResult(error: string): PluginAgentToolResult {
  return { content: [{ type: "text", text: error }], isError: true };
}

export default async function plugin(bb: BbPluginApi) {
  const service = createFactoryService(bb);
  registerFactoryCli(bb, service);

  bb.rpc.register(factoryRpcContract, {
    factoryListTasks(input) {
      return { tasks: service.listTasks(input) };
    },
    factoryGetTask(input) {
      return service.getTaskDetail(input.taskId);
    },
    async factoryCreateTask(input) {
      return service.createTask(input);
    },
    async factoryUpdateTask(input) {
      return { task: await service.updateTaskSpec(input) };
    },
    async factoryStartAttempt(input) {
      return service.startAttempt(input);
    },
    async factoryCompleteAttempt(input) {
      return { task: await service.completeAttempt(input.taskId) };
    },
    async factoryVerifyTask(input) {
      return { task: await service.verifyTask(input.taskId) };
    },
    async factoryCancelTask(input) {
      return { task: await service.cancelTask(input.taskId) };
    },
  });

  bb.agents.registerTool({
    name: "bb_factory",
    presentation: {
      label: { pending: "Coordinating task", completed: "Task coordinated" },
      icon: { glyph: "ListTodo" },
    },
    description:
      "Coordinate one bounded task with independent verification. `create` returns a task and a `previewDirective` — emit that directive exactly once on its own line so BB renders a live task card. A worker finishing never accepts the task: declared checks run independently on the workspace and only a pass on unchanged content accepts it. `bb factory task show <id>` prints the durable record.",
    parameters: toolInputSchema,
    async execute(input, ctx) {
      try {
        switch (input.action) {
          case "create": {
            if (input.goal === undefined) {
              return errorResult("create requires `goal`");
            }
            const result = await service.createTask({
              threadId: ctx.threadId,
              goal: input.goal,
              scope: input.scope,
              requirementIds: input.requirementIds,
              checks: input.checks,
            });
            return jsonResult(result);
          }
          case "status": {
            if (input.taskId !== undefined) {
              return jsonResult(service.getTaskDetail(input.taskId));
            }
            return jsonResult({
              tasks: service.listTasks({ threadId: ctx.threadId }),
            });
          }
          case "start": {
            if (input.taskId === undefined || input.mode === undefined) {
              return errorResult("start requires `taskId` and `mode`");
            }
            return jsonResult(
              await service.startAttempt({
                taskId: input.taskId,
                mode: input.mode,
                providerId: input.providerId,
                model: input.model,
                reasoningLevel: input.reasoningLevel,
                permissionMode: input.permissionMode,
              }),
            );
          }
          case "complete": {
            if (input.taskId === undefined) {
              return errorResult("complete requires `taskId`");
            }
            return jsonResult({
              task: await service.completeAttempt(input.taskId),
            });
          }
          case "verify": {
            if (input.taskId === undefined) {
              return errorResult("verify requires `taskId`");
            }
            return jsonResult({ task: await service.verifyTask(input.taskId) });
          }
          case "cancel": {
            if (input.taskId === undefined) {
              return errorResult("cancel requires `taskId`");
            }
            return jsonResult({
              task: await service.cancelTask(input.taskId),
            });
          }
        }
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  });

  bb.agents.configure((context) => {
    if (context.pluginMetadata.factoryWorker === 1) {
      return {
        tools: [],
        skills: [],
        instructions:
          "You are running as a bbfactory worker. Complete the bounded task in the workspace, then end your turn. Independent checks decide acceptance — your claim alone does not.",
      };
    }
    return {
      tools: ["bb_factory"],
      skills: ["bbfactory"],
      instructions:
        "bbfactory coordinates bounded tasks: create a task with goal/scope/requirements/checks, run it directly or delegate to a provider, then let independent checks decide acceptance. When bb_factory returns previewDirective, copy it exactly once as a standalone line so the task card renders in chat.",
    };
  });

  bb.events.on("thread.idle", ({ thread }) => {
    void service.onThreadIdle(thread.id);
  });
  bb.events.on("thread.failed", ({ thread, error }) => {
    void service.onThreadFailed(thread.id, error);
  });
  bb.events.on("thread.archived", ({ thread }) => {
    void service.onThreadArchived(thread.id);
  });
  bb.events.on("thread.deleted", ({ thread }) => {
    void service.onThreadDeleted(thread.id);
  });

  bb.background.service("factory-reconcile", {
    start(signal) {
      return service.run(signal);
    },
  });

  void service.recoverAfterRestart().catch((error) => {
    bb.log.warn(
      `factory restart recovery failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });
}
