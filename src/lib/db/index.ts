import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AttemptRecord } from "@/contracts";

const connectionStore = globalThis as typeof globalThis & {
  __mentorDatabases?: Map<string, DatabaseSync>;
};

/** One durable connection per configured database, shared across development reloads. */
export function getDb(): DatabaseSync {
  const filename =
    process.env.MENTOR_DB_PATH ||
    path.join(process.cwd(), "data", "mentor.sqlite");
  const connections = (connectionStore.__mentorDatabases ??= new Map());
  const existing = connections.get(filename);
  if (existing) return existing;
  if (filename !== ":memory:")
    mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS snapshots (
      snapshot_id TEXT PRIMARY KEY, metadata_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS source_files (
      file_id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id),
      path TEXT NOT NULL, language TEXT NOT NULL, line_count INTEGER NOT NULL,
      content_hash TEXT NOT NULL, content TEXT NOT NULL,
      UNIQUE(snapshot_id, path)
    );
    CREATE TABLE IF NOT EXISTS source_symbols (
      symbol_id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id),
      file_id TEXT NOT NULL REFERENCES source_files(file_id), name TEXT NOT NULL, kind TEXT NOT NULL,
      start_line INTEGER NOT NULL, end_line INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS evidence (
      evidence_id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id),
      file_id TEXT NOT NULL REFERENCES source_files(file_id), start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL, content_hash TEXT NOT NULL, text TEXT NOT NULL,
      CHECK(start_line > 0 AND end_line >= start_line)
    );
    CREATE INDEX IF NOT EXISTS evidence_file_range ON evidence(file_id, start_line, end_line);
    CREATE VIRTUAL TABLE IF NOT EXISTS evidence_fts USING fts5(
      evidence_id UNINDEXED, snapshot_id UNINDEXED, file_id UNINDEXED,
      path, text, tokenize='unicode61'
    );
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, task_id TEXT NOT NULL,
      answer_json TEXT NOT NULL, correct INTEGER NOT NULL CHECK(correct IN (0,1)),
      attempt_number INTEGER NOT NULL, hints_used INTEGER NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(session_id, task_id, attempt_number)
    );
    CREATE INDEX IF NOT EXISTS attempts_session ON attempts(session_id, created_at);
    CREATE TABLE IF NOT EXISTS hints (
      session_id TEXT NOT NULL, task_id TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(session_id, task_id)
    );
  `);
  migrateLearning(db);
  connections.set(filename, db);
  return db;
}

export interface LearningContext {
  snapshotId: string;
  contentVersion: string;
}
export const legacyContext: LearningContext = {
  snapshotId: "zustand-0ea8be27db13",
  contentVersion: "zustand-learning-v1",
};

function migrateLearning(db: DatabaseSync): void {
  if (
    (db.prepare("PRAGMA user_version").get() as { user_version: number })
      .user_version > 2
  )
    throw new Error("This database schema is newer than this application.");
  db.exec("BEGIN IMMEDIATE");
  try {
    const columns = db.prepare("PRAGMA table_info(attempts)").all() as {
      name: string;
    }[];
    if (!columns.some((column) => column.name === "snapshot_id")) {
      db.exec(`
        ALTER TABLE attempts RENAME TO attempts_legacy;
        ALTER TABLE hints RENAME TO hints_legacy;
        CREATE TABLE attempts (
          id TEXT PRIMARY KEY, session_id TEXT NOT NULL, task_id TEXT NOT NULL,
          snapshot_id TEXT NOT NULL, content_version TEXT NOT NULL,
          answer_json TEXT NOT NULL, correct INTEGER NOT NULL CHECK(correct IN (0,1)),
          attempt_number INTEGER NOT NULL, hints_used INTEGER NOT NULL, created_at TEXT NOT NULL,
          UNIQUE(session_id, snapshot_id, content_version, task_id, attempt_number)
        );
        INSERT INTO attempts SELECT id, session_id, task_id, 'zustand-0ea8be27db13', 'zustand-learning-v1', answer_json, correct, attempt_number, hints_used, created_at FROM attempts_legacy;
        CREATE TABLE hints (
          session_id TEXT NOT NULL, task_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, content_version TEXT NOT NULL, count INTEGER NOT NULL,
          PRIMARY KEY(session_id, snapshot_id, content_version, task_id)
        );
        INSERT INTO hints SELECT session_id, task_id, 'zustand-0ea8be27db13', 'zustand-learning-v1', count FROM hints_legacy;
        DROP TABLE attempts_legacy;
        DROP TABLE hints_legacy;
      `);
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS attempts_session ON attempts(session_id, snapshot_id, content_version, created_at);
      CREATE TABLE IF NOT EXISTS workspace_records (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, category TEXT NOT NULL,
        payload_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS records_session ON workspace_records(session_id, snapshot_id, category);
      CREATE TABLE IF NOT EXISTS content_dependencies (
        content_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, kind TEXT NOT NULL, evidence_ids_json TEXT NOT NULL, review_state TEXT NOT NULL,
        PRIMARY KEY(content_id, snapshot_id)
      );
      PRAGMA user_version = 2;
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

type AttemptRow = {
  id: string;
  session_id: string;
  task_id: string;
  snapshot_id: string;
  content_version: string;
  answer_json: string;
  correct: number;
  attempt_number: number;
  hints_used: number;
  created_at: string;
};
function toAttempt(row: AttemptRow): AttemptRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    taskId: row.task_id,
    snapshotId: row.snapshot_id,
    contentVersion: row.content_version,
    answer: JSON.parse(row.answer_json),
    correct: row.correct === 1,
    attemptNumber: row.attempt_number,
    hintsUsed: row.hints_used,
    createdAt: row.created_at,
  };
}
export function saveAttempt(
  sessionId: string,
  taskId: string,
  answer: unknown,
  correct: boolean,
  hintsUsed: number,
  context: LearningContext = legacyContext,
): AttemptRecord {
  const db = getDb();
  const record: AttemptRecord = {
    id: randomUUID(),
    sessionId,
    taskId,
    ...context,
    answer,
    correct,
    hintsUsed,
    attemptNumber: 0,
    createdAt: new Date().toISOString(),
  };
  db.exec("BEGIN IMMEDIATE");
  try {
    const count = db
      .prepare(
        "SELECT COUNT(*) AS count FROM attempts WHERE session_id = ? AND snapshot_id = ? AND content_version = ? AND task_id = ?",
      )
      .get(sessionId, context.snapshotId, context.contentVersion, taskId) as {
      count: number;
    };
    record.attemptNumber = count.count + 1;
    db.prepare(
      "INSERT INTO attempts (id, session_id, task_id, snapshot_id, content_version, answer_json, correct, attempt_number, hints_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      record.id,
      sessionId,
      taskId,
      context.snapshotId,
      context.contentVersion,
      JSON.stringify(answer ?? null),
      correct ? 1 : 0,
      record.attemptNumber,
      hintsUsed,
      record.createdAt,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return record;
}
export function getAttempts(
  sessionId: string,
  context?: LearningContext,
): AttemptRecord[] {
  const where = context ? " AND snapshot_id = ? AND content_version = ?" : "";
  return (
    getDb()
      .prepare(
        "SELECT * FROM attempts WHERE session_id = ?" +
          where +
          " ORDER BY created_at, rowid",
      )
      .all(
        ...(context
          ? [sessionId, context.snapshotId, context.contentVersion]
          : [sessionId]),
      ) as AttemptRow[]
  ).map(toAttempt);
}
export function recordHint(
  sessionId: string,
  taskId: string,
  context: LearningContext = legacyContext,
): number {
  getDb()
    .prepare(
      "INSERT INTO hints (session_id, task_id, snapshot_id, content_version, count) VALUES (?, ?, ?, ?, 1) ON CONFLICT(session_id, snapshot_id, content_version, task_id) DO UPDATE SET count = count + 1",
    )
    .run(sessionId, taskId, context.snapshotId, context.contentVersion);
  return getHintCount(sessionId, taskId, context);
}
export function getHintCount(
  sessionId: string,
  taskId: string,
  context: LearningContext = legacyContext,
): number {
  const row = getDb()
    .prepare(
      "SELECT count FROM hints WHERE session_id = ? AND snapshot_id = ? AND content_version = ? AND task_id = ?",
    )
    .get(sessionId, context.snapshotId, context.contentVersion, taskId) as
    | { count: number }
    | undefined;
  return row?.count ?? 0;
}
export type RecordCategory =
  | "answer"
  | "bookmark"
  | "teach_back"
  | "goal"
  | "progress";
export interface WorkspaceRecord<T = unknown> {
  id: string;
  snapshotId: string;
  category: RecordCategory;
  payload: T;
  createdAt: string;
}
export function saveRecord(
  sessionId: string,
  snapshotId: string,
  category: RecordCategory,
  payload: unknown,
  id: string = randomUUID(),
): string {
  const db = getDb();
  const existing = db
    .prepare(
      "SELECT session_id, snapshot_id, category FROM workspace_records WHERE id = ?",
    )
    .get(id) as
    | { session_id: string; snapshot_id: string; category: string }
    | undefined;
  if (
    existing &&
    (existing.session_id !== sessionId ||
      existing.snapshot_id !== snapshotId ||
      existing.category !== category)
  )
    throw new Error("Record identity is already in use.");
  db.prepare(
    "INSERT INTO workspace_records VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, created_at = excluded.created_at",
  ).run(
    id,
    sessionId,
    snapshotId,
    category,
    JSON.stringify(payload),
    new Date().toISOString(),
  );
  // Bound retained history per session/snapshot/category.
  db.prepare(
    "DELETE FROM workspace_records WHERE id IN (SELECT id FROM workspace_records WHERE session_id = ? AND snapshot_id = ? AND category = ? ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET 100)",
  ).run(sessionId, snapshotId, category);
  return id;
}
export function getRecords<T = unknown>(
  sessionId: string,
  snapshotId: string,
  category?: RecordCategory,
): WorkspaceRecord<T>[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM workspace_records WHERE session_id = ? AND snapshot_id = ?" +
        (category ? " AND category = ?" : "") +
        " ORDER BY created_at, rowid",
    )
    .all(
      ...(category
        ? [sessionId, snapshotId, category]
        : [sessionId, snapshotId]),
    ) as {
    id: string;
    snapshot_id: string;
    category: RecordCategory;
    payload_json: string;
    created_at: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    snapshotId: row.snapshot_id,
    category: row.category,
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at,
  }));
}
/** Compare-and-swap edits keep simultaneous notebook saves from silently overwriting. */
export function updateRecord(
  sessionId: string, snapshotId: string, category: RecordCategory, id: string,
  payload: unknown, expectedRevision: number,
): boolean {
  return getDb().prepare(
    "UPDATE workspace_records SET payload_json = ? WHERE id = ? AND session_id = ? AND snapshot_id = ? AND category = ? AND COALESCE(json_extract(payload_json, '$.revision'), 1) = ?",
  ).run(JSON.stringify(payload), id, sessionId, snapshotId, category, expectedRevision).changes === 1;
}
export function deleteRecord(sessionId: string, snapshotId: string, category: RecordCategory, id: string): boolean {
  return getDb().prepare("DELETE FROM workspace_records WHERE id = ? AND session_id = ? AND snapshot_id = ? AND category = ?")
    .run(id, sessionId, snapshotId, category).changes === 1;
}
export function registerContentDependency(
  contentId: string,
  snapshotId: string,
  kind: string,
  evidenceIds: string[],
  reviewState = "authored",
) {
  getDb()
    .prepare(
      "INSERT INTO content_dependencies VALUES (?, ?, ?, ?, ?) ON CONFLICT(content_id, snapshot_id) DO UPDATE SET evidence_ids_json=excluded.evidence_ids_json, review_state=excluded.review_state",
    )
    .run(contentId, snapshotId, kind, JSON.stringify(evidenceIds), reviewState);
}
export function contentDependencies(snapshotId: string): {
  contentId: string;
  kind: string;
  evidenceIds: string[];
  reviewState: string;
}[] {
  return (
    getDb()
      .prepare("SELECT * FROM content_dependencies WHERE snapshot_id = ?")
      .all(snapshotId) as {
      content_id: string;
      kind: string;
      evidence_ids_json: string;
      review_state: string;
    }[]
  ).map((row) => ({
    contentId: row.content_id,
    kind: row.kind,
    evidenceIds: JSON.parse(row.evidence_ids_json),
    reviewState: row.review_state,
  }));
}
export function resetSession(sessionId: string): void {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const table of ["attempts", "hints"])
      db.prepare("DELETE FROM " + table + " WHERE session_id = ?").run(
        sessionId,
      );
    db.prepare(
      "DELETE FROM workspace_records WHERE session_id = ? AND category = 'teach_back'",
    ).run(sessionId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
