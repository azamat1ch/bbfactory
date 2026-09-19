import { existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { inspectExecution } from "./execution.js";
import { createWorkflowService } from "./service.js";
import {
  workflowExecutionRpcContract,
  type ExecutionIdentity,
} from "./execution-contract.js";

export function inspectLegacyExecution(
  bb: BbPluginApi,
  identity: ExecutionIdentity,
) {
  const path = join(
    bb.server.experimental_dataDir,
    "plugins",
    "workflows",
    "data.db",
  );
  if (!existsSync(path))
    throw new Error(
      "Legacy execution belongs to Workflows, but its database is unavailable. Restore its data before reconciling; do not relaunch this identity.",
    );
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    return inspectExecution(db, createWorkflowService(bb, db), identity);
  } finally {
    db.close();
  }
}

export async function cancelLegacyExecution(
  bb: BbPluginApi,
  identity: ExecutionIdentity,
) {
  const snapshot = inspectLegacyExecution(bb, identity);
  if (snapshot.nativeSettlement === "confirmed")
    return { ...snapshot, stopConfirmed: true };
  return bb.sdk.plugins.callRpc({
    pluginId: "workflows",
    method: "experimental_executionCancel",
    input: identity,
    outputSchema:
      workflowExecutionRpcContract.experimental_executionCancel.output,
  });
}
