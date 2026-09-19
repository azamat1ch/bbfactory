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
          description:
            'Use the origin thread, task and launch IDs from the Factory assignment. Replace example IDs with your actual IDs.\n\nExample:\nbb factory execution inspect --input \'{"originThreadId":"thr_origin","callerTaskId":"task_id","launchId":"launch_id"}\'',
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
          description:
            'Use the assignment ID from the task. Reuse guidanceId only to retry the same message; use a new ID for new guidance. mode is steer or queued followUp for a running assignment. For a settled worker, use bb factory assign with a new launchId and assignment id plus continuationThreadId; preserve profile, permissions and environment. Submitted delivery does not establish compliance. Replace example IDs with your actual IDs.\n\nExample:\nbb factory execution guide --input \'{"originThreadId":"thr_origin","callerTaskId":"task_id","launchId":"launch_id","assignmentId":"implementation","guidanceId":"correction-1","message":"Run the focused regression before returning.","mode":"steer"}\'',
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
          description:
            'Use the same execution identity and guidanceId passed to guide. Replace example IDs with your actual IDs.\n\nExample:\nbb factory execution guide-status --input \'{"originThreadId":"thr_origin","callerTaskId":"task_id","launchId":"launch_id","guidanceId":"correction-1"}\'',
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
          description:
            'Wait for 1\u201332 targets. Start afterCursor at 0; on later calls use the returned cursor for each target. timeoutMs is required, from 0 (poll) through 30000. A timeout is not failure or cancellation. Replace example IDs with your actual IDs.\n\nExample:\nbb factory execution wait --input \'{"targets":[{"originThreadId":"thr_origin","callerTaskId":"task_id","launchId":"launch_id","afterCursor":0}],"timeoutMs":30000}\'',
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
