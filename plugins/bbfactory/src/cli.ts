import {
  PluginCliError,
  cliCommand,
  defineCli,
  type BbPluginApi,
  type PluginCliContext,
  type PluginCliResult,
} from "@get-bb/plugin-sdk";
import type { FactoryService } from "./service.js";
import type { FactoryCheckSpecInput } from "./shared.js";

function success(value: unknown): PluginCliResult {
  return { exitCode: 0, stdout: `${JSON.stringify(value, null, 2)}\n` };
}

async function guarded(
  run: () => Promise<PluginCliResult>,
): Promise<PluginCliResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof PluginCliError) throw error;
    throw new PluginCliError(
      error instanceof Error ? error.message : String(error),
    );
  }
}

function requireThreadId(ctx: PluginCliContext): string {
  if (ctx.threadId === undefined) {
    throw new PluginCliError(
      "This command must run inside a BB project thread",
    );
  }
  return ctx.threadId;
}

function parseCheckArg(value: string, index: number): FactoryCheckSpecInput {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((entry) => typeof entry === "string" && entry.length > 0)
    ) {
      return { argv: parsed as string[] };
    }
  } catch {}
  const argv = value.trim().split(/\s+/).filter((part) => part.length > 0);
  if (argv.length === 0) {
    throw new PluginCliError(`--check #${index + 1} is empty`);
  }
  return { argv };
}

function parseCheckOptions(values: string[] | undefined): FactoryCheckSpecInput[] {
  return (values ?? []).map(parseCheckArg);
}

const checkOption = {
  type: "string",
  repeatable: true,
  description:
    'Declared check, repeatable. Each value is either a JSON argv array (\'["pnpm","test"]\') or a whitespace-split command line.',
} as const;

const goalOption = {
  type: "string",
  required: true,
  description: "Task goal.",
} as const;

const scopeOption = {
  type: "string",
  description: "Boundaries of what the task may change.",
} as const;

const requirementOption = {
  type: "string",
  repeatable: true,
  description: "Requirement id the task must satisfy (repeatable).",
} as const;

export function registerFactoryCli(bb: BbPluginApi, service: FactoryService) {
  bb.cli.register(
    defineCli({
      name: "factory",
      summary:
        "Coordinate bounded tasks with independent verification across BB providers",
      description:
        "Tasks keep durable task/attempt/evidence records. A worker claiming done never accepts the task — declared checks run independently on the workspace first.",
      commands: {
        "task create": cliCommand({
          summary: "Create a proposed task bound to this thread",
          options: {
            goal: goalOption,
            scope: scopeOption,
            requirement: requirementOption,
            check: checkOption,
          },
          run(input, ctx) {
            return guarded(async () => {
              const result = await service.createTask({
                threadId: requireThreadId(ctx),
                goal: input.options.goal,
                scope: input.options.scope,
                requirementIds: input.options.requirement,
                checks: parseCheckOptions(input.options.check),
              });
              return success(result);
            });
          },
        }),
        "task list": cliCommand({
          summary: "List tasks for this thread or project",
          options: {
            project: {
              type: "boolean",
              description: "List tasks for the whole project, not only this thread.",
            },
          },
          run(input, ctx) {
            return guarded(async () => {
              const threadId = requireThreadId(ctx);
              return success({
                tasks: service.listTasks(
                  input.options.project
                    ? { projectId: ctx.projectId }
                    : { threadId },
                ),
              });
            });
          },
        }),
        "task show": cliCommand({
          summary: "Show a task with attempts and verification evidence",
          positionals: [
            { name: "taskId", description: "Task id (bft_…)", required: true },
          ],
          run(input) {
            return guarded(async () =>
              success(service.getTaskDetail(input.positionals.taskId)),
            );
          },
        }),
        "task update": cliCommand({
          summary: "Update task spec fields; bumps specVersion and stales old evidence",
          positionals: [
            { name: "taskId", description: "Task id (bft_…)", required: true },
          ],
          options: {
            goal: { type: "string", description: "New task goal." },
            scope: scopeOption,
            requirement: requirementOption,
            check: checkOption,
          },
          constraints: [
            {
              kind: "at-least-one",
              options: ["goal", "scope", "requirement", "check"],
            },
          ],
          run(input) {
            return guarded(async () =>
              success({
                task: await service.updateTaskSpec({
                  taskId: input.positionals.taskId,
                  ...(input.options.goal !== undefined
                    ? { goal: input.options.goal }
                    : {}),
                  ...(input.options.scope !== undefined
                    ? { scope: input.options.scope }
                    : {}),
                  ...(input.options.requirement !== undefined
                    ? { requirementIds: input.options.requirement }
                    : {}),
                  ...(input.options.check !== undefined
                    ? { checks: parseCheckOptions(input.options.check) }
                    : {}),
                }),
              }),
            );
          },
        }),
        start: cliCommand({
          summary: "Start an attempt: direct in this thread or delegated to a provider",
          positionals: [
            { name: "taskId", description: "Task id (bft_…)", required: true },
          ],
          options: {
            mode: {
              type: "enum",
              values: ["direct", "delegate"],
              required: true,
              description:
                "direct: the lead thread executes; delegate: a hidden native worker thread runs the task.",
            },
            provider: {
              type: "string",
              description: "Provider id for delegate mode (required).",
            },
            model: { type: "string", description: "Model for delegate mode." },
            reasoning: {
              type: "enum",
              values: [
                "none",
                "low",
                "medium",
                "high",
                "xhigh",
                "ultracode",
                "max",
                "ultra",
              ],
              description: "Reasoning level for delegate mode.",
            },
            permission: {
              type: "enum",
              values: ["accept-edits", "auto", "full", "workspace-write"],
              description: "Permission mode for delegate mode.",
            },
          },
          run(input) {
            return guarded(async () =>
              success(
                await service.startAttempt({
                  taskId: input.positionals.taskId,
                  mode: input.options.mode,
                  providerId: input.options.provider,
                  model: input.options.model,
                  reasoningLevel: input.options.reasoning,
                  permissionMode: input.options.permission,
                }),
              ),
            );
          },
        }),
        complete: cliCommand({
          summary: "Report the running attempt done; runs declared checks independently",
          positionals: [
            { name: "taskId", description: "Task id (bft_…)", required: true },
          ],
          run(input) {
            return guarded(async () =>
              success({
                task: await service.completeAttempt(input.positionals.taskId),
              }),
            );
          },
        }),
        verify: cliCommand({
          summary: "Re-run declared checks on the latest completed attempt",
          positionals: [
            { name: "taskId", description: "Task id (bft_…)", required: true },
          ],
          run(input) {
            return guarded(async () =>
              success({
                task: await service.verifyTask(input.positionals.taskId),
              }),
            );
          },
        }),
        cancel: cliCommand({
          summary:
            "Request cancellation; stays pending until the writer reaches a terminal state",
          positionals: [
            { name: "taskId", description: "Task id (bft_…)", required: true },
          ],
          run(input) {
            return guarded(async () =>
              success({
                task: await service.cancelTask(input.positionals.taskId),
              }),
            );
          },
        }),
      },
    }),
  );
}
