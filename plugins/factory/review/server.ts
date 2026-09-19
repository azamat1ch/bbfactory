import { cliCommand, defineCli, type BbPluginApi } from "@get-bb/plugin-sdk";
import { collectReview, reviewInputSchema, reviewOutputSchema } from "./review.js";

export function registerFactoryGuidance(bb: BbPluginApi) {
  bb.rpc.register({ collectReview: { input: reviewInputSchema, output: reviewOutputSchema } }, { collectReview }, {
    experimental_discoverable: true,
    experimental_description: "Collect independent review passes with attributed failures, quote checks on supplied snapshots, and validated judge verdicts.",
  });
  bb.cli.register(defineCli({
    name: "review",
    summary: "Collect results from native reviewer threads",
    commands: {
      collect: cliCommand({
        summary: "Validate reviewer outputs and optional judge JSON; never starts agents",
        options: {
          input: { type: "string", required: true, description: "JSON containing passes, optional sources, and optional judge text" },
        },
        async run(input) {
          const result = collectReview(reviewInputSchema.parse(JSON.parse(input.options.input)));
          return { exitCode: result.complete && result.state !== "degraded" ? 0 : 2, stdout: JSON.stringify(result) };
        },
      }),
    },
  }));
}

export default registerFactoryGuidance;
