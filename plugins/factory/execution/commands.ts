import { cliCommand, defineCli, type BbPluginApi } from "@get-bb/plugin-sdk";
import { workflowExecutionRpcContract } from "./execution-contract.js";
import type { ExecutionHandlers } from "./execution.js";

export function registerExecutionCommands(
  bb: BbPluginApi,
  execution: ExecutionHandlers,
) {
  bb.cli.register(
    defineCli({
      name: "execution-control",
      summary: "Observe, steer and collect native Factory assignments",
      commands: {
        inspect: cliCommand({
          summary:
            "Inspect an execution by originThreadId, callerTaskId and launchId",
          options: {
            input: {
              type: "string",
              required: true,
              description: "JSON execution identity",
            },
          },
          async run(input) {
            return {
              stdout: JSON.stringify(
                await execution.experimental_executionInspect(
                  workflowExecutionRpcContract.experimental_executionInspect.input.parse(
                    JSON.parse(input.options.input),
                  ),
                ),
              ),
              exitCode: 0,
            };
          },
        }),
        guide: cliCommand({
          summary: "Steer or follow up an assignment with a durable guidanceId",
          options: {
            input: {
              type: "string",
              required: true,
              description:
                "JSON identity, assignmentId, guidanceId, message and mode (steer or followUp)",
            },
          },
          async run(input) {
            return {
              stdout: JSON.stringify(
                await execution.experimental_executionGuide(
                  workflowExecutionRpcContract.experimental_executionGuide.input.parse(
                    JSON.parse(input.options.input),
                  ),
                ),
              ),
              exitCode: 0,
            };
          },
        }),
        "guide-status": cliCommand({
          summary: "Read a durable guidance receipt",
          options: {
            input: {
              type: "string",
              required: true,
              description: "JSON execution identity and guidanceId",
            },
          },
          async run(input) {
            return {
              stdout: JSON.stringify(
                await execution.experimental_executionGuideStatus(
                  workflowExecutionRpcContract.experimental_executionGuideStatus.input.parse(
                    JSON.parse(input.options.input),
                  ),
                ),
              ),
              exitCode: 0,
            };
          },
        }),
        wait: cliCommand({
          summary:
            "Wait for bounded execution progress and collect worker output",
          options: {
            input: {
              type: "string",
              required: true,
              description:
                "JSON targets with afterCursor and bounded timeoutMs",
            },
          },
          async run(input) {
            return {
              stdout: JSON.stringify(
                await execution.experimental_executionWait(
                  workflowExecutionRpcContract.experimental_executionWait.input.parse(
                    JSON.parse(input.options.input),
                  ),
                ),
              ),
              exitCode: 0,
            };
          },
        }),
      },
    }),
  );
}
