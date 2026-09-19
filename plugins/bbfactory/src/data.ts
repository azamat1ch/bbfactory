import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  FactoryAttemptIntent,
  FactoryAttemptState,
  FactoryCheckSpec,
  FactoryEvidenceStatus,
  FactoryTaskStatus,
} from "./shared.js";

export type Db = Database.Database;

export interface FactoryTaskRow {
  id: string;
  projectId: string;
  originThreadId: string;
  goal: string;
  scope: string;
  requirementIdsJson: string;
  checksJson: string;
  specVersion: number;
  status: FactoryTaskStatus;
  statusDetail: string | null;
  acceptedAttemptId: string | null;
  acceptedFingerprint: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface FactoryAttemptRow {
  id: string;
  taskId: string;
  seq: number;
  intent: FactoryAttemptIntent;
  originThreadId: string;
  workerThreadId: string | null;
  environmentId: string | null;
  hostId: string | null;
  workspacePath: string | null;
  baseRevision: string | null;
  baseFingerprint: string | null;
  providerId: string | null;
  model: string | null;
  reasoningLevel: string | null;
  permissionMode: string | null;
  state: FactoryAttemptState;
  stateDetail: string | null;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
}

export interface FactoryEvidenceRow {
  id: string;
  taskId: string;
  attemptId: string;
  checkId: string;
  checkArgv: string;
  specVersion: number;
  contentFingerprint: string;
  hostId: string;
  workspacePath: string;
  status: FactoryEvidenceStatus;
  detail: string | null;
  exitCode: number | null;
  timedOut: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number | null;
  logRef: string | null;
  outputTail: string | null;
  createdAt: number;
}

interface RawEvidenceRow extends Omit<FactoryEvidenceRow, "timedOut"> {
  timedOut: 0 | 1;
}

export const ACTIVE_ATTEMPT_STATES: readonly FactoryAttemptState[] = [
  "spawning",
  "uncertain",
  "running",
  "completed",
  "verifying",
  "cancelling",
  "halted",
];

const TASK_SELECT = `
  SELECT id, project_id AS projectId, origin_thread_id AS originThreadId,
    goal, scope, requirement_ids AS requirementIdsJson,
    checks_json AS checksJson, spec_version AS specVersion, status,
    status_detail AS statusDetail,
    accepted_attempt_id AS acceptedAttemptId,
    accepted_fingerprint AS acceptedFingerprint,
    created_at AS createdAt, updated_at AS updatedAt
  FROM factory_tasks`;

const ATTEMPT_SELECT = `
  SELECT id, task_id AS taskId, seq, intent, origin_thread_id AS originThreadId,
    worker_thread_id AS workerThreadId, environment_id AS environmentId,
    host_id AS hostId, workspace_path AS workspacePath,
    base_revision AS baseRevision, base_fingerprint AS baseFingerprint,
    provider_id AS providerId, model, reasoning_level AS reasoningLevel,
    permission_mode AS permissionMode, state, state_detail AS stateDetail,
    created_at AS createdAt, updated_at AS updatedAt,
    finished_at AS finishedAt
  FROM factory_attempts`;

const EVIDENCE_SELECT = `
  SELECT id, task_id AS taskId, attempt_id AS attemptId, check_id AS checkId,
    check_argv AS checkArgv, spec_version AS specVersion,
    content_fingerprint AS contentFingerprint, host_id AS hostId,
    workspace_path AS workspacePath, status, detail, exit_code AS exitCode,
    timed_out AS timedOut, started_at AS startedAt, finished_at AS finishedAt,
    duration_ms AS durationMs, log_ref AS logRef, output_tail AS outputTail,
    created_at AS createdAt
  FROM factory_evidence`;

export const migrations = [
  `CREATE TABLE IF NOT EXISTS factory_tasks (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     origin_thread_id TEXT NOT NULL,
     goal TEXT NOT NULL,
     scope TEXT NOT NULL,
     requirement_ids TEXT NOT NULL,
     checks_json TEXT NOT NULL,
     spec_version INTEGER NOT NULL,
     status TEXT NOT NULL,
     status_detail TEXT,
     accepted_attempt_id TEXT,
     accepted_fingerprint TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS factory_tasks_origin_idx
     ON factory_tasks(origin_thread_id, created_at DESC);
   CREATE INDEX IF NOT EXISTS factory_tasks_project_idx
     ON factory_tasks(project_id, created_at DESC);
   CREATE INDEX IF NOT EXISTS factory_tasks_status_idx
     ON factory_tasks(status);
   CREATE TABLE IF NOT EXISTS factory_attempts (
     id TEXT PRIMARY KEY,
     task_id TEXT NOT NULL REFERENCES factory_tasks(id),
     seq INTEGER NOT NULL,
     intent TEXT NOT NULL,
     origin_thread_id TEXT NOT NULL,
     worker_thread_id TEXT,
     environment_id TEXT,
     host_id TEXT,
     workspace_path TEXT,
     base_revision TEXT,
     base_fingerprint TEXT,
     provider_id TEXT,
     model TEXT,
     reasoning_level TEXT,
     permission_mode TEXT,
     state TEXT NOT NULL,
     state_detail TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     finished_at INTEGER,
     UNIQUE(task_id, seq)
   );
   CREATE INDEX IF NOT EXISTS factory_attempts_task_idx
     ON factory_attempts(task_id, seq);
   CREATE INDEX IF NOT EXISTS factory_attempts_worker_idx
     ON factory_attempts(worker_thread_id);
   CREATE INDEX IF NOT EXISTS factory_attempts_state_idx
     ON factory_attempts(state);
   CREATE UNIQUE INDEX IF NOT EXISTS factory_attempts_workspace_owner_idx
     ON factory_attempts(host_id, workspace_path)
     WHERE state IN (
       'spawning', 'uncertain', 'running', 'completed', 'verifying',
       'cancelling', 'halted'
     );
   CREATE TABLE IF NOT EXISTS factory_evidence (
     id TEXT PRIMARY KEY,
     task_id TEXT NOT NULL REFERENCES factory_tasks(id),
     attempt_id TEXT NOT NULL REFERENCES factory_attempts(id),
     check_id TEXT NOT NULL,
     check_argv TEXT NOT NULL,
     spec_version INTEGER NOT NULL,
     content_fingerprint TEXT NOT NULL,
     host_id TEXT NOT NULL,
     workspace_path TEXT NOT NULL,
     status TEXT NOT NULL,
     detail TEXT,
     exit_code INTEGER,
     timed_out INTEGER NOT NULL DEFAULT 0,
     started_at INTEGER,
     finished_at INTEGER,
     duration_ms INTEGER,
     log_ref TEXT,
     output_tail TEXT,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS factory_evidence_task_idx
     ON factory_evidence(task_id, created_at);
   CREATE INDEX IF NOT EXISTS factory_evidence_attempt_idx
     ON factory_evidence(attempt_id, created_at);`,
];

function taskRow(value: unknown): FactoryTaskRow {
  return value as FactoryTaskRow;
}

function optionalTask(value: unknown): FactoryTaskRow | null {
  return value === undefined ? null : taskRow(value);
}

function attemptRow(value: unknown): FactoryAttemptRow {
  return value as FactoryAttemptRow;
}

function optionalAttempt(value: unknown): FactoryAttemptRow | null {
  return value === undefined ? null : attemptRow(value);
}

function evidenceRow(value: unknown): FactoryEvidenceRow {
  const row = value as RawEvidenceRow;
  return { ...row, timedOut: row.timedOut === 1 };
}

function optionalEvidence(value: unknown): FactoryEvidenceRow | null {
  return value === undefined ? null : evidenceRow(value);
}

export function createTask(
  db: Db,
  input: {
    projectId: string;
    originThreadId: string;
    goal: string;
    scope: string;
    requirementIds: string[];
    checks: FactoryCheckSpec[];
  },
): FactoryTaskRow {
  const id = `bft_${randomUUID()}`;
  const now = Date.now();
  db.prepare(
    `INSERT INTO factory_tasks (
       id, project_id, origin_thread_id, goal, scope, requirement_ids,
       checks_json, spec_version, status, created_at, updated_at
     ) VALUES (
       @id, @projectId, @originThreadId, @goal, @scope, @requirementIdsJson,
       @checksJson, 1, 'proposed', @now, @now
     )`,
  ).run({
    id,
    projectId: input.projectId,
    originThreadId: input.originThreadId,
    goal: input.goal,
    scope: input.scope,
    requirementIdsJson: JSON.stringify(input.requirementIds),
    checksJson: JSON.stringify(input.checks),
    now,
  });
  return getTaskRequired(db, id);
}

export function getTask(db: Db, id: string): FactoryTaskRow | null {
  return optionalTask(db.prepare(`${TASK_SELECT} WHERE id = ?`).get(id));
}

export function getTaskRequired(db: Db, id: string): FactoryTaskRow {
  const row = getTask(db, id);
  if (row === null) throw new Error(`Unknown factory task ${id}`);
  return row;
}

export function listTasksForThread(
  db: Db,
  originThreadId: string,
): FactoryTaskRow[] {
  return db
    .prepare(
      `${TASK_SELECT} WHERE origin_thread_id = ?
       ORDER BY created_at DESC, factory_tasks.rowid DESC`,
    )
    .all(originThreadId)
    .map(taskRow);
}

export function listTasksForProject(
  db: Db,
  projectId: string,
  limit: number,
): FactoryTaskRow[] {
  return db
    .prepare(
      `${TASK_SELECT} WHERE project_id = ?
       ORDER BY created_at DESC, factory_tasks.rowid DESC LIMIT ?`,
    )
    .all(projectId, limit)
    .map(taskRow);
}

export function listTasksByStatus(
  db: Db,
  statuses: readonly FactoryTaskStatus[],
): FactoryTaskRow[] {
  const placeholders = statuses.map(() => "?").join(", ");
  return db
    .prepare(`${TASK_SELECT} WHERE status IN (${placeholders})`)
    .all(...statuses)
    .map(taskRow);
}

export function updateTask(
  db: Db,
  id: string,
  patch: Partial<
    Pick<
      FactoryTaskRow,
      | "goal"
      | "scope"
      | "requirementIdsJson"
      | "checksJson"
      | "specVersion"
      | "status"
      | "statusDetail"
      | "acceptedAttemptId"
      | "acceptedFingerprint"
    >
  >,
): FactoryTaskRow {
  const sets: string[] = ["updated_at = @now"];
  const params: Record<string, unknown> = { id, now: Date.now() };
  const columnFor: Record<string, string> = {
    goal: "goal",
    scope: "scope",
    requirementIdsJson: "requirement_ids",
    checksJson: "checks_json",
    specVersion: "spec_version",
    status: "status",
    statusDetail: "status_detail",
    acceptedAttemptId: "accepted_attempt_id",
    acceptedFingerprint: "accepted_fingerprint",
  };
  for (const [key, column] of Object.entries(columnFor)) {
    if (key in patch) {
      sets.push(`${column} = @${key}`);
      params[key] = patch[key as keyof typeof patch];
    }
  }
  db.prepare(`UPDATE factory_tasks SET ${sets.join(", ")} WHERE id = @id`).run(
    params,
  );
  return getTaskRequired(db, id);
}

export function createAttempt(
  db: Db,
  input: {
    taskId: string;
    intent: FactoryAttemptIntent;
    originThreadId: string;
    workerThreadId: string | null;
    environmentId: string | null;
    hostId: string | null;
    workspacePath: string | null;
    providerId: string | null;
    model: string | null;
    reasoningLevel: string | null;
    permissionMode: string | null;
    state: FactoryAttemptState;
  },
): FactoryAttemptRow {
  return db.transaction(() => {
    const seqRow = db
      .prepare(
        `SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM factory_attempts WHERE task_id = ?`,
      )
      .get(input.taskId) as { next: number };
    const id = `bfa_${randomUUID()}`;
    const now = Date.now();
    db.prepare(
      `INSERT INTO factory_attempts (
         id, task_id, seq, intent, origin_thread_id, worker_thread_id,
         environment_id, host_id, workspace_path, provider_id, model,
         reasoning_level, permission_mode, state, created_at, updated_at
       ) VALUES (
         @id, @taskId, @seq, @intent, @originThreadId, @workerThreadId,
         @environmentId, @hostId, @workspacePath, @providerId, @model,
         @reasoningLevel, @permissionMode, @state, @now, @now
       )`,
    ).run({ id, seq: seqRow.next, now, ...input });
    return getAttemptRequired(db, id);
  })();
}

export function getAttempt(db: Db, id: string): FactoryAttemptRow | null {
  return optionalAttempt(
    db.prepare(`${ATTEMPT_SELECT} WHERE id = ?`).get(id),
  );
}

export function getAttemptRequired(db: Db, id: string): FactoryAttemptRow {
  const row = getAttempt(db, id);
  if (row === null) throw new Error(`Unknown factory attempt ${id}`);
  return row;
}

export function getActiveAttempt(
  db: Db,
  taskId: string,
): FactoryAttemptRow | null {
  const placeholders = ACTIVE_ATTEMPT_STATES.map(() => "?").join(", ");
  return optionalAttempt(
    db
      .prepare(
        `${ATTEMPT_SELECT} WHERE task_id = ? AND state IN (${placeholders})
         ORDER BY seq DESC LIMIT 1`,
      )
      .get(taskId, ...ACTIVE_ATTEMPT_STATES),
  );
}

export function getActiveAttemptForWorkspace(
  db: Db,
  hostId: string,
  workspacePath: string,
): FactoryAttemptRow | null {
  const placeholders = ACTIVE_ATTEMPT_STATES.map(() => "?").join(", ");
  return optionalAttempt(
    db
      .prepare(
        `${ATTEMPT_SELECT} WHERE host_id = ? AND workspace_path = ?
         AND state IN (${placeholders}) ORDER BY created_at DESC LIMIT 1`,
      )
      .get(hostId, workspacePath, ...ACTIVE_ATTEMPT_STATES),
  );
}

export function transitionAttemptState(
  db: Db,
  id: string,
  from: readonly FactoryAttemptState[],
  to: FactoryAttemptState,
  stateDetail: string | null,
): FactoryAttemptRow | null {
  const placeholders = from.map(() => "?").join(", ");
  const result = db
    .prepare(
      `UPDATE factory_attempts SET state = ?, state_detail = ?,
       updated_at = ? WHERE id = ? AND state IN (${placeholders})`,
    )
    .run(to, stateDetail, Date.now(), id, ...from);
  return result.changes === 1 ? getAttemptRequired(db, id) : null;
}

export function getLatestAttempt(
  db: Db,
  taskId: string,
): FactoryAttemptRow | null {
  return optionalAttempt(
    db
      .prepare(`${ATTEMPT_SELECT} WHERE task_id = ? ORDER BY seq DESC LIMIT 1`)
      .get(taskId),
  );
}

export function getLatestAttemptInStates(
  db: Db,
  taskId: string,
  states: readonly FactoryAttemptState[],
): FactoryAttemptRow | null {
  const placeholders = states.map(() => "?").join(", ");
  return optionalAttempt(
    db
      .prepare(
        `${ATTEMPT_SELECT} WHERE task_id = ? AND state IN (${placeholders})
         ORDER BY seq DESC LIMIT 1`,
      )
      .get(taskId, ...states),
  );
}

export function listAttempts(db: Db, taskId: string): FactoryAttemptRow[] {
  return db
    .prepare(`${ATTEMPT_SELECT} WHERE task_id = ? ORDER BY seq`)
    .all(taskId)
    .map(attemptRow);
}

export function listAttemptsByState(
  db: Db,
  states: readonly FactoryAttemptState[],
): FactoryAttemptRow[] {
  const placeholders = states.map(() => "?").join(", ");
  return db
    .prepare(`${ATTEMPT_SELECT} WHERE state IN (${placeholders})`)
    .all(...states)
    .map(attemptRow);
}

export function getAttemptByWorkerThread(
  db: Db,
  workerThreadId: string,
): FactoryAttemptRow | null {
  return optionalAttempt(
    db
      .prepare(`${ATTEMPT_SELECT} WHERE worker_thread_id = ?`)
      .get(workerThreadId),
  );
}

export function updateAttempt(
  db: Db,
  id: string,
  patch: Partial<
    Pick<
      FactoryAttemptRow,
      | "workerThreadId"
      | "environmentId"
      | "hostId"
      | "workspacePath"
      | "baseRevision"
      | "baseFingerprint"
      | "state"
      | "stateDetail"
      | "finishedAt"
    >
  >,
): FactoryAttemptRow {
  const sets: string[] = ["updated_at = @now"];
  const params: Record<string, unknown> = { id, now: Date.now() };
  const columnFor: Record<string, string> = {
    workerThreadId: "worker_thread_id",
    environmentId: "environment_id",
    hostId: "host_id",
    workspacePath: "workspace_path",
    baseRevision: "base_revision",
    baseFingerprint: "base_fingerprint",
    state: "state",
    stateDetail: "state_detail",
    finishedAt: "finished_at",
  };
  for (const [key, column] of Object.entries(columnFor)) {
    if (key in patch) {
      sets.push(`${column} = @${key}`);
      params[key] = patch[key as keyof typeof patch];
    }
  }
  db.prepare(
    `UPDATE factory_attempts SET ${sets.join(", ")} WHERE id = @id`,
  ).run(params);
  return getAttemptRequired(db, id);
}

export function insertEvidence(
  db: Db,
  input: {
    taskId: string;
    attemptId: string;
    checkId: string;
    checkArgv: string;
    specVersion: number;
    contentFingerprint: string;
    hostId: string;
    workspacePath: string;
    status: FactoryEvidenceStatus;
  },
): FactoryEvidenceRow {
  const id = `bfe_${randomUUID()}`;
  db.prepare(
    `INSERT INTO factory_evidence (
       id, task_id, attempt_id, check_id, check_argv, spec_version,
       content_fingerprint, host_id, workspace_path, status, created_at
     ) VALUES (
       @id, @taskId, @attemptId, @checkId, @checkArgv, @specVersion,
       @contentFingerprint, @hostId, @workspacePath, @status, @now
     )`,
  ).run({ id, now: Date.now(), ...input });
  return getEvidenceRequired(db, id);
}

export function getEvidenceRequired(
  db: Db,
  id: string,
): FactoryEvidenceRow {
  const row = optionalEvidence(
    db.prepare(`${EVIDENCE_SELECT} WHERE id = ?`).get(id),
  );
  if (row === null) throw new Error(`Unknown factory evidence ${id}`);
  return row;
}

export function updateEvidence(
  db: Db,
  id: string,
  patch: Partial<
    Pick<
      FactoryEvidenceRow,
      | "status"
      | "detail"
      | "exitCode"
      | "timedOut"
      | "startedAt"
      | "finishedAt"
      | "durationMs"
      | "logRef"
      | "outputTail"
    >
  >,
): FactoryEvidenceRow {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  const columnFor: Record<string, string> = {
    status: "status",
    detail: "detail",
    exitCode: "exit_code",
    timedOut: "timed_out",
    startedAt: "started_at",
    finishedAt: "finished_at",
    durationMs: "duration_ms",
    logRef: "log_ref",
    outputTail: "output_tail",
  };
  for (const [key, column] of Object.entries(columnFor)) {
    if (key in patch) {
      sets.push(`${column} = @${key}`);
      params[key] =
        key === "timedOut"
          ? patch[key] === true
            ? 1
            : 0
          : patch[key as keyof typeof patch];
    }
  }
  if (sets.length > 0) {
    db.prepare(
      `UPDATE factory_evidence SET ${sets.join(", ")} WHERE id = @id`,
    ).run(params);
  }
  return getEvidenceRequired(db, id);
}

export function listEvidenceForTask(
  db: Db,
  taskId: string,
): FactoryEvidenceRow[] {
  return db
    .prepare(
      `${EVIDENCE_SELECT} WHERE task_id = ?
       ORDER BY created_at, factory_evidence.rowid`,
    )
    .all(taskId)
    .map(evidenceRow);
}

export function markEvidenceStale(
  db: Db,
  taskId: string,
  detail: string,
): number {
  return db
    .prepare(
      `UPDATE factory_evidence SET status = 'stale', detail = ?
       WHERE task_id = ?
       AND status IN ('running', 'passed', 'failed', 'error', 'incomplete')`,
    )
    .run(detail, taskId).changes;
}

export function listInterruptedEvidence(db: Db): FactoryEvidenceRow[] {
  return db
    .prepare(`${EVIDENCE_SELECT} WHERE status = 'running'`)
    .all()
    .map(evidenceRow);
}
