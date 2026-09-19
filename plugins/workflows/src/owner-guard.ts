import { existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

export function assertExecutionOwnerSettled(
  dataDir: string,
  pluginId: string,
): void {
  const path = join(dataDir, "plugins", pluginId, "data.db");
  if (!existsSync(path)) return;
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const table = (name: string) =>
      db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get(name) !== undefined;
    if (!table("workflow_runs")) return;
    const active = db
      .prepare(
        "SELECT 1 FROM workflow_runs WHERE status IN ('queued', 'running') LIMIT 1",
      )
      .get();
    const unsettled =
      table("workflow_spawn_attempts") &&
      db
        .prepare(
          "SELECT 1 FROM workflow_spawn_attempts WHERE state != 'stopped' LIMIT 1",
        )
        .get();
    if (active || unsettled)
      throw new Error(
        `${pluginId} retains active or unresolved execution ownership. Keep its plugin enabled and reconcile its runs before transferring ownership.`,
      );
  } finally {
    db.close();
  }
}
