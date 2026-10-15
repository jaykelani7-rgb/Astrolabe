import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AttemptRecord } from '@/contracts';

const connectionStore = globalThis as typeof globalThis & {
  __mentorDatabases?: Map<string, DatabaseSync>;
};

/** One durable connection per configured database, shared across development reloads. */
export function getDb(): DatabaseSync {
  const filename = process.env.MENTOR_DB_PATH || path.join(process.cwd(), 'data', 'mentor.sqlite');
  const connections = (connectionStore.__mentorDatabases ??= new Map());
  const existing = connections.get(filename);
  if (existing) return existing;
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
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
  connections.set(filename, db);
  return db;
}

type AttemptRow = { id: string; session_id: string; task_id: string; answer_json: string; correct: number; attempt_number: number; hints_used: number; created_at: string };
function toAttempt(row: AttemptRow): AttemptRecord {
  return { id: row.id, sessionId: row.session_id, taskId: row.task_id, answer: JSON.parse(row.answer_json), correct: row.correct === 1, attemptNumber: row.attempt_number, hintsUsed: row.hints_used, createdAt: row.created_at };
}

export function saveAttempt(sessionId: string, taskId: string, answer: unknown, correct: boolean, hintsUsed: number): AttemptRecord {
  const db = getDb();
  const record: AttemptRecord = { id: randomUUID(), sessionId, taskId, answer, correct, hintsUsed, attemptNumber: 0, createdAt: new Date().toISOString() };
  db.exec('BEGIN IMMEDIATE');
  try {
    const count = db.prepare('SELECT COUNT(*) AS count FROM attempts WHERE session_id = ? AND task_id = ?').get(sessionId, taskId) as { count: number };
    record.attemptNumber = count.count + 1;
    db.prepare('INSERT INTO attempts (id, session_id, task_id, answer_json, correct, attempt_number, hints_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(record.id, sessionId, taskId, JSON.stringify(answer ?? null), correct ? 1 : 0, record.attemptNumber, hintsUsed, record.createdAt);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return record;
}

export function getAttempts(sessionId: string): AttemptRecord[] {
  return (getDb().prepare('SELECT * FROM attempts WHERE session_id = ? ORDER BY created_at, rowid').all(sessionId) as AttemptRow[]).map(toAttempt);
}

export function recordHint(sessionId: string, taskId: string): number {
  getDb().prepare('INSERT INTO hints (session_id, task_id, count) VALUES (?, ?, 1) ON CONFLICT(session_id, task_id) DO UPDATE SET count = count + 1').run(sessionId, taskId);
  return getHintCount(sessionId, taskId);
}

export function getHintCount(sessionId: string, taskId: string): number {
  const row = getDb().prepare('SELECT count FROM hints WHERE session_id = ? AND task_id = ?').get(sessionId, taskId) as { count: number } | undefined;
  return row?.count ?? 0;
}

export function resetSession(sessionId: string): void {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM attempts WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM hints WHERE session_id = ?').run(sessionId);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
