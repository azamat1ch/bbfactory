import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection, migrate } from "@bb/db";
import { expect, it } from "vitest";
import { createRun, migrations } from "./data.js";
import { assertExecutionOwnerSettled } from "./owner-guard.js";

it("does not transfer active or uncertain ownership and leaves the original database intact", async () => {
  const root = await mkdtemp(join(tmpdir(), "factory-owner-"));
  const directory = join(root, "plugins", "workflows");
  await mkdir(directory, { recursive: true });
  const connection = createConnection(join(directory, "data.db"));
  migrate(connection);
  const db = connection.$client;
  try {
    for (const sql of migrations) db.exec(sql);
    const run = createRun(db, {
      projectId: "project",
      originThreadId: "origin",
      environmentId: "environment",
      originProvider: "codex",
      originModel: "model",
      originReasoningLevel: "low",
      originPermissionMode: "full",
      name: "legacy",
      source: "return 1",
      sourceHash: "hash",
      argsJson: "null",
      settingsJson: "{}",
      resumedFromRunId: null,
    });
    expect(() => assertExecutionOwnerSettled(root, "workflows")).toThrow(
      "retains active",
    );
    db.prepare(
      "UPDATE workflow_runs SET status = 'cancelled' WHERE id = ?",
    ).run(run.id);
    db.prepare("INSERT INTO workflow_spawn_attempts VALUES (?, ?, ?, ?)").run(
      "call",
      run.id,
      "worker",
      "attached",
    );
    expect(() => assertExecutionOwnerSettled(root, "workflows")).toThrow(
      "unresolved",
    );
    db.prepare("UPDATE workflow_spawn_attempts SET state = 'stopped'").run();
    expect(() => assertExecutionOwnerSettled(root, "workflows")).not.toThrow();
    expect(db.prepare("SELECT COUNT(*) FROM workflow_runs").pluck().get()).toBe(
      1,
    );
  } finally {
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});
