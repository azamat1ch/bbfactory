import { cliCommand, defineCli, type BbPluginApi } from "@get-bb/plugin-sdk";
import { collectReview, reviewInputSchema, reviewOutputSchema } from "./review.js";

export function registerFactoryGuidance(bb: BbPluginApi) {
  bb.rpc.register({ collectReview: { input: reviewInputSchema, output: reviewOutputSchema } }, { collectReview }, {
    experimental_discoverable: true,
    experimental_description: "Collect independent review passes with attributed failures, quote checks on supplied snapshots, and validated judge verdicts.",
  });
  bb.agents.registerTool({
    name: "bb_review_collect",
    description: "Union completed reviewer XML outputs, preserve failures, check quotes against supplied source snapshots, and validate optional judge JSON. Does not launch workers or establish Factory acceptance. Missing/invalid judge preserves the complete raw union.",
    parameters: reviewInputSchema,
    execute: async (input) => JSON.stringify(collectReview(input)),
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
