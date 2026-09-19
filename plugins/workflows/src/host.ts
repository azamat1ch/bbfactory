import { realpath, stat } from "node:fs/promises";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { workflowHostContract } from "./host-contract.js";

export async function canonicalRoot(path: string): Promise<{ path: string }> {
  const canonical = await realpath(path);
  if (!(await stat(canonical)).isDirectory())
    throw new Error("Execution root must be a directory");
  return {
    path:
      process.platform === "win32"
        ? canonical.replaceAll("\\", "/").toLowerCase()
        : canonical,
  };
}

export default experimental_defineHostEntry({
  contract: workflowHostContract,
  handlers: { canonicalRoot: ({ path }) => canonicalRoot(path) },
});
