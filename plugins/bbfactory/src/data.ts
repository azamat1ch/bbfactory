import type Database from "better-sqlite3";
import {
  assignmentSchema,
  taskDetailSchema,
  type FactoryTaskDetail,
} from "./shared.js";

export const migrations = [
  `CREATE TABLE factory_tasks (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, value TEXT NOT NULL);
   CREATE INDEX factory_tasks_thread ON factory_tasks(thread_id);
   CREATE TABLE factory_verifications (task_id TEXT PRIMARY KEY);
   CREATE TABLE factory_stop_intents (task_id TEXT PRIMARY KEY, archived INTEGER NOT NULL);
   CREATE TABLE factory_artifacts (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL);
   CREATE INDEX factory_artifacts_task ON factory_artifacts(task_id);
   CREATE TRIGGER factory_artifacts_immutable_update BEFORE UPDATE ON factory_artifacts BEGIN SELECT RAISE(ABORT, 'Acceptance artifacts are immutable'); END;
   CREATE TRIGGER factory_artifacts_immutable_delete BEFORE DELETE ON factory_artifacts BEGIN SELECT RAISE(ABORT, 'Acceptance artifacts are immutable'); END;`,
];
export function createStore(db: Database.Database) {
  return {
    get(id: string): FactoryTaskDetail {
      const value = db
        .prepare("SELECT value FROM factory_tasks WHERE id = ?")
        .pluck()
        .get(id);
      if (typeof value !== "string")
        throw new Error(`Unknown Factory task ${id}`);
      return taskDetailSchema.parse(JSON.parse(value));
    },
    list(threadId: string): FactoryTaskDetail[] {
      return db
        .prepare(
          "SELECT value FROM factory_tasks WHERE thread_id = ? ORDER BY rowid DESC",
        )
        .pluck()
        .all(threadId)
        .map((value) => taskDetailSchema.parse(JSON.parse(String(value))));
    },
    unresolvedAssociations(hostId: string, workspacePath: string) {
      return db
        .prepare(
          "SELECT a.value FROM factory_tasks t, json_each(t.value, '$.assignments') a WHERE json_extract(a.value, '$.hostId') = ? AND json_extract(a.value, '$.workspacePath') = ? AND json_extract(a.value, '$.nativeStatus') NOT IN ('succeeded', 'failed')",
        )
        .pluck()
        .all(hostId, workspacePath)
        .map((value) => assignmentSchema.parse(JSON.parse(String(value))));
    },
    all(): FactoryTaskDetail[] {
      return db
        .prepare("SELECT value FROM factory_tasks")
        .pluck()
        .all()
        .map((value) => taskDetailSchema.parse(JSON.parse(String(value))));
    },
    beginVerification(taskId: string) {
      db.prepare(
        "INSERT OR IGNORE INTO factory_verifications(task_id) VALUES (?)",
      ).run(taskId);
    },
    finishVerification(taskId: string) {
      db.prepare("DELETE FROM factory_verifications WHERE task_id = ?").run(
        taskId,
      );
    },
    verifying(taskId: string) {
      return (
        db
          .prepare(
            "SELECT task_id FROM factory_verifications WHERE task_id = ?",
          )
          .get(taskId) !== undefined
      );
    },
    requestStop(taskId: string, archived: boolean) {
      db.prepare(
        "INSERT INTO factory_stop_intents(task_id, archived) VALUES (?, ?) ON CONFLICT(task_id) DO UPDATE SET archived = MAX(archived, excluded.archived)",
      ).run(taskId, archived ? 1 : 0);
    },
    stopped(taskId: string) {
      return db
        .prepare("SELECT archived FROM factory_stop_intents WHERE task_id = ?")
        .pluck()
        .get(taskId);
    },
    save(detail: FactoryTaskDetail) {
      const parsed = taskDetailSchema.parse(detail);
      db.prepare(
        "INSERT INTO factory_tasks(id, thread_id, value) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value",
      ).run(parsed.task.id, parsed.task.originThreadId, JSON.stringify(parsed));
    },
    artifactValue(id: string, taskId: string, kind: string): unknown {
      const value = db
        .prepare(
          "SELECT value FROM factory_artifacts WHERE id = ? AND task_id = ? AND kind = ?",
        )
        .pluck()
        .get(id, taskId, kind);
      return typeof value === "string" ? JSON.parse(value) : null;
    },
    artifact(id: string, taskId: string, kind: string, value: unknown) {
      db.prepare(
        "INSERT INTO factory_artifacts(id, task_id, kind, value) VALUES (?, ?, ?, ?)",
      ).run(id, taskId, kind, JSON.stringify(value));
    },
  };
}
