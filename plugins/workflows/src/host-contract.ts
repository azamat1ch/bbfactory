import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const workflowHostContract = defineRpcContract({
  canonicalRoot: {
    input: z.object({ path: z.string().min(1) }).strict(),
    output: z.object({ path: z.string().min(1) }).strict(),
  },
});
