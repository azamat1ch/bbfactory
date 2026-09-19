import type { ExecutionHandlers } from "../execution/execution.js";
import { cliCommand, defineCli, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { createFactoryService } from "./service.js";
import { factoryRpcContract } from "./shared.js";

export function registerFactoryTasks(
  bb: BbPluginApi,
  initializeStorage = true,
  execution?: ExecutionHandlers,
) {
  const service = createFactoryService(bb, initializeStorage, execution);
  const handlers = {
    factoryListTasks: async (
      input: z.infer<typeof factoryRpcContract.factoryListTasks.input>,
    ) => ({ tasks: await service.listTasks(input.threadId) }),
    factoryGetTask: (
      input: z.infer<typeof factoryRpcContract.factoryGetTask.input>,
    ) => service.getTaskDetail(input.taskId),
    factoryCreateTask: service.createTask,
    factoryApproveDelivery: service.approveDelivery,
    factoryRecordDelivery: service.recordDelivery,
    factoryResumeTask: service.resumeTask,
    factoryExportSpec: service.exportSpec,
    factoryImportSpec: service.importSpec,
    factoryUpdateTask: service.updateTask,
    factoryStartTask: service.startTask,
    factoryVerifyTask: (
      input: z.infer<typeof factoryRpcContract.factoryVerifyTask.input>,
    ) => service.verifyTask(input.taskId),
    factoryAssign: service.assign,
    factoryCancelTask: service.cancelTask,
    factoryRecordFinding: service.finding,
    factoryResolveFinding: service.resolve,
    factoryRecordJudgment: service.judge,
    factoryRecordJudgments: service.judgeMany,
    factoryRecordAgentReview: service.review,
    factoryRecordNote: service.note,
  };
  bb.rpc.register(factoryRpcContract, handlers, {
    experimental_discoverable: true,
    experimental_description:
      "Versioned Factory tasks, native assignments and requirement-linked acceptance evidence.",
  });
  const actions = {
    create: (input: unknown) =>
      handlers.factoryCreateTask(
        factoryRpcContract.factoryCreateTask.input.parse(input),
      ),
    update: (input: unknown) =>
      handlers.factoryUpdateTask(
        factoryRpcContract.factoryUpdateTask.input.parse(input),
      ),
    start: (input: unknown) =>
      handlers.factoryStartTask(
        factoryRpcContract.factoryStartTask.input.parse(input),
      ),
    status: (input: unknown) =>
      handlers.factoryGetTask(
        factoryRpcContract.factoryGetTask.input.parse(input),
      ),
    list: (input: unknown) =>
      handlers.factoryListTasks(
        factoryRpcContract.factoryListTasks.input.parse(input),
      ),
    verify: (input: unknown) =>
      handlers.factoryVerifyTask(
        factoryRpcContract.factoryVerifyTask.input.parse(input),
      ),
    assign: (input: unknown) =>
      handlers.factoryAssign(
        factoryRpcContract.factoryAssign.input.parse(input),
      ),
    cancel: (input: unknown) =>
      handlers.factoryCancelTask(
        factoryRpcContract.factoryCancelTask.input.parse(input),
      ),
    finding: (input: unknown) =>
      handlers.factoryRecordFinding(
        factoryRpcContract.factoryRecordFinding.input.parse(input),
      ),
    resolve: (input: unknown) =>
      handlers.factoryResolveFinding(
        factoryRpcContract.factoryResolveFinding.input.parse(input),
      ),
    "agent-review": (input: unknown) =>
      handlers.factoryRecordAgentReview(
        factoryRpcContract.factoryRecordAgentReview.input.parse(input),
      ),
    note: (input: unknown) =>
      handlers.factoryRecordNote(
        factoryRpcContract.factoryRecordNote.input.parse(input),
      ),
  };
  bb.agents.registerTool({
    name: "bb_factory",
    description:
      "Persist requirements, optional scenarios, actual check links, native worker assignments and review evidence. Direct work needs create, start, then verify. Completion is not acceptance. Emit previewDirective once. Human criteria require the user's explicit UI/CLI attestation; never impersonate human approval.",
    parameters: z.discriminatedUnion("action", [
      z.strictObject({
        action: z.literal("create"),
        input: factoryRpcContract.factoryCreateTask.input,
      }),
      z.strictObject({
        action: z.literal("update"),
        input: factoryRpcContract.factoryUpdateTask.input,
      }),
      z.strictObject({
        action: z.literal("start"),
        input: factoryRpcContract.factoryStartTask.input,
      }),
      z.strictObject({
        action: z.literal("status"),
        input: factoryRpcContract.factoryGetTask.input,
      }),
      z.strictObject({
        action: z.literal("list"),
        input: factoryRpcContract.factoryListTasks.input,
      }),
      z.strictObject({
        action: z.literal("verify"),
        input: factoryRpcContract.factoryVerifyTask.input,
      }),
      z.strictObject({
        action: z.literal("assign"),
        input: factoryRpcContract.factoryAssign.input,
      }),
      z.strictObject({
        action: z.literal("cancel"),
        input: factoryRpcContract.factoryCancelTask.input,
      }),
      z.strictObject({
        action: z.literal("finding"),
        input: factoryRpcContract.factoryRecordFinding.input,
      }),
      z.strictObject({
        action: z.literal("resolve"),
        input: factoryRpcContract.factoryResolveFinding.input,
      }),
      z.strictObject({
        action: z.literal("agent-review"),
        input: factoryRpcContract.factoryRecordAgentReview.input,
      }),
      z.strictObject({
        action: z.literal("note"),
        input: factoryRpcContract.factoryRecordNote.input,
      }),
    ]),
    async execute(input) {
      return JSON.stringify(await actions[input.action](input.input));
    },
  });
  const cliActions = {
    ...actions,
    approve: (input: unknown) => {
      const parsed =
        factoryRpcContract.factoryApproveDelivery.input.parse(input);
      return service.approveDelivery({
        ...parsed,
        source: parsed.source === "chat" ? "chat" : "cli",
      });
    },
    deliver: (input: unknown) =>
      service.recordDelivery(
        factoryRpcContract.factoryRecordDelivery.input.parse(input),
      ),
    resume: (input: unknown) =>
      service.resumeTask(
        factoryRpcContract.factoryResumeTask.input.parse(input),
      ),
    export: (input: unknown) =>
      service.exportSpec(
        factoryRpcContract.factoryExportSpec.input.parse(input),
      ),
    import: (input: unknown) =>
      service.importSpec(
        factoryRpcContract.factoryImportSpec.input.parse(input),
      ),
    judge: (input: unknown) =>
      handlers.factoryRecordJudgment(
        factoryRpcContract.factoryRecordJudgment.input.parse(input),
      ),
    "judge-many": (input: unknown) =>
      handlers.factoryRecordJudgments(
        factoryRpcContract.factoryRecordJudgments.input.parse(input),
      ),
  };
  bb.cli.register(
    defineCli({
      name: "factory",
      summary: "Requirements, native assignments and acceptance evidence",
      commands: Object.fromEntries(
        Object.entries(cliActions).map(([name, action]) => [
          name,
          cliCommand({
            summary:
              name === "judge" || name === "judge-many"
                ? "Record explicitly authorized human judgment (requires humanConfirmed:true)"
                : `${name} Factory task`,
            options: {
              input: {
                type: "string",
                required: true,
                description: "JSON matching the Factory RPC input",
              },
            },
            async run(input) {
              return {
                exitCode: 0,
                stdout: JSON.stringify(
                  await action(JSON.parse(input.options.input)),
                  null,
                  2,
                ),
              };
            },
          }),
        ]),
      ),
    }),
  );
  bb.events.on("thread.archived", ({ thread }) => {
    void service
      .archiveThread(thread.id)
      .catch((error) => bb.log.warn(String(error)));
  });
  bb.events.on("thread.deleted", ({ thread }) => {
    void service
      .archiveThread(thread.id)
      .catch((error) => bb.log.warn(String(error)));
  });
  bb.background.service("factory-freshness", {
    async start(signal) {
      while (!signal.aborted) {
        await service.reconcile().catch((error) => bb.log.warn(String(error)));
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", done);
            resolve();
          };
          const timer = setTimeout(done, 10000);
          signal.addEventListener("abort", done, { once: true });
          if (signal.aborted) done();
        });
      }
    },
  });
  bb.agents.contributeInstructions(
    () =>
      "Factory owns requirements and acceptance evidence. Work directly or assign ordinary native workers through bb_factory. Requirement-linked checks run on final content. Human judgments require explicit human authorization, never a worker's assertion.",
  );
}

export default registerFactoryTasks;
