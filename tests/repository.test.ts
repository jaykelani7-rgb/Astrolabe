import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appendFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { evidenceForRange, getEvidence, getMap, getSnapshot, getSource, listFiles, listSymbols, searchEvidence } from '@/lib/repository';
import { getAttempts, getDb, getHintCount, recordHint, resetSession, saveAttempt } from '@/lib/db';
import { GET as sourceRoute } from '@/app/api/repository/source/route';
import { GET as evidenceRoute } from '@/app/api/evidence/[id]/route';

const oldDatabase = process.env.MENTOR_DB_PATH;
const directory = mkdtempSync(path.join(tmpdir(), 'mentor-repository-test-'));
const filename = path.join(directory, 'mentor.sqlite');
const fileAt = (sourcePath: string) => listFiles().find(file => file.path === sourcePath)!;
beforeAll(() => { process.env.MENTOR_DB_PATH = filename; });
afterAll(() => {
  getDb().close();
  if (oldDatabase === undefined) delete process.env.MENTOR_DB_PATH; else process.env.MENTOR_DB_PATH = oldDatabase;
  rmSync(directory, { recursive: true, force: true });
});

describe('immutable source snapshot', () => {
  it('retains the exact commit and complete source inventory', () => {
    expect(getSnapshot().commitSha).toBe('0ea8be27db13019819fc1c0492e5b672dd7b6f4b');
    expect(getSnapshot().license).toBe('MIT');
    expect(listFiles()).toHaveLength(15);
    const source = getSource(fileAt('src/vanilla.ts').fileId);
    expect(source.file.lineCount).toBe(100);
    expect(source.lines[78]).toBe('      listeners.forEach((listener) => listener(state, previousState))');
    expect(createHash('sha256').update(source.content).digest('hex')).toBe(source.file.contentHash);
    // Callers cannot mutate the canonical source through returned arrays/metadata.
    source.lines[78] = 'changed'; source.file.path = 'changed';
    expect(getSource(fileAt('src/vanilla.ts').fileId).lines[78]).toContain('listeners.forEach');
  });

  it('refuses modified snapshot bytes when loading a fresh process', async () => {
    const fixture = path.join(directory, 'tampered');
    cpSync(path.join(process.cwd(), 'data', 'snapshot'), path.join(fixture, 'data', 'snapshot'), { recursive: true });
    appendFileSync(path.join(fixture, 'data', 'snapshot', 'src', 'vanilla.ts'), '// changed after preparation\n');
    const modulePath = JSON.stringify(path.join(process.cwd(), 'src/lib/repository/index.ts'));
    const script = `try { require(${modulePath}).getSnapshot(); process.exitCode=2; } catch(error) { console.log(error.message); }`;
    const result = await promisify(execFile)(process.execPath, ['--import', path.join(process.cwd(), 'node_modules/tsx/dist/loader.mjs'), '-e', script], { cwd: fixture, env: { ...process.env, TSX_TSCONFIG_PATH: path.join(process.cwd(), 'tsconfig.json') } });
    expect(result.stdout).toContain('Snapshot integrity check failed: src/vanilla.ts');
  });

  it('validates one-based ranges, paths, and snapshot scope', async () => {
    const id = fileAt('src/vanilla.ts').fileId;
    expect(() => evidenceForRange(id, 0, 2)).toThrow(/between 1 and 100/);
    expect(() => evidenceForRange(id, 5, 4)).toThrow();
    expect(() => evidenceForRange(id, 1, 101)).toThrow();
    expect(() => getSource('../../package.json')).toThrow(/not part/);
    expect(() => getSource(id, 'stale-snapshot')).toThrow(/different repository snapshot/);
    for (const query of [`fileId=${id}&startLine=66`, `fileId=${id}&startLine=0&endLine=2`, `fileId=${id}&startLine=1.5&endLine=2`, `fileId=${id}&startLine=1&endLine=101`]) {
      expect(sourceRoute(new Request('http://localhost/api/repository/source?' + query)).status).toBe(400);
    }
    expect(sourceRoute(new Request(`http://localhost/api/repository/source?fileId=${id}&startLine=66&endLine=81`)).status).toBe(200);
    for (const [query, status, code] of [
      ['', 400, 'INVALID_INPUT'],
      ['fileId=unknown', 404, 'FILE_NOT_FOUND'],
      ['fileId=..%2F..%2Fpackage.json', 404, 'FILE_NOT_FOUND'],
      [`fileId=${id}&snapshotId=stale`, 409, 'SNAPSHOT_MISMATCH'],
    ] as const) {
      const response = sourceRoute(new Request('http://localhost/api/repository/source?' + query));
      expect(response.status).toBe(status);
      expect((await response.json()).error.code).toBe(code);
    }
    const evidence = evidenceForRange(id, 75, 78);
    for (const [evidenceId, query, status, code] of [
      ['unknown', '', 404, 'EVIDENCE_NOT_FOUND'],
      ['../../package.json', '', 404, 'EVIDENCE_NOT_FOUND'],
      [evidence.evidenceId, '?snapshotId=stale', 409, 'SNAPSHOT_MISMATCH'],
    ] as const) {
      const response = await evidenceRoute(new Request('http://localhost/api/evidence/id' + query), { params: Promise.resolve({ id: evidenceId }) });
      expect(response.status).toBe(status);
      expect((await response.json()).error.code).toBe(code);
    }
  });

  it('stores stable canonical evidence and verifies persisted text before returning it', () => {
    const id = fileAt('src/vanilla.ts').fileId;
    const evidence = evidenceForRange(id, 75, 78);
    expect(evidenceForRange(id, 75, 78)).toEqual(evidence);
    expect(evidence.text).toBe(getSource(id).lines.slice(74, 78).join('\n'));
    expect(getEvidence(evidence.evidenceId, getSnapshot().snapshotId)).toEqual(evidence);
    expect(() => getEvidence(evidence.evidenceId, 'another-snapshot')).toThrow(/different repository snapshot/);
    expect(() => getEvidence('unknown-evidence')).toThrow(/not found/);
    getDb().prepare('UPDATE evidence SET text = ? WHERE evidence_id = ?').run('tampered', evidence.evidenceId);
    expect(() => getEvidence(evidence.evidenceId)).toThrow(/could not be verified/);
    getDb().prepare('UPDATE evidence SET text = ? WHERE evidence_id = ?').run(evidence.text, evidence.evidenceId);
  });

  it('builds a real AST import and re-export map with explicit external boundaries', () => {
    const map = getMap();
    const vanilla = fileAt('src/vanilla.ts').fileId;
    const react = fileAt('src/react.ts').fileId;
    const entry = fileAt('src/index.ts').fileId;
    expect(map.nodes).toHaveLength(15);
    expect(listSymbols(vanilla)).toContainEqual(expect.objectContaining({ name: 'createStoreImpl', startLine: 60, endLine: 97 }));
    expect(map.edges).toContainEqual(expect.objectContaining({ from: react, to: vanilla, typeOnly: false }));
    expect(map.edges).toContainEqual(expect.objectContaining({ from: react, to: vanilla, typeOnly: true }));
    expect(map.edges).toContainEqual(expect.objectContaining({ from: entry, to: react }));
    expect(map.unresolved).toContainEqual(expect.objectContaining({ from: react, specifier: 'react', reason: expect.stringContaining('External dependency') }));
    expect(map.unresolved.some(item => item.specifier.startsWith('.'))).toBe(false);
    expect(map.edges.every(edge => map.nodes.some(node => node.id === edge.from) && map.nodes.some(node => node.id === edge.to))).toBe(true);
  });

  it('retrieves real source text through FTS5 with optional file scope', () => {
    const react = fileAt('src/react.ts').fileId;
    const results = searchEvidence('useSyncExternalStore', { fileId: react, limit: 3 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(evidence => evidence.fileId === react)).toBe(true);
    expect(results.some(evidence => evidence.text.includes('React.useSyncExternalStore'))).toBe(true);
    expect(results.every(evidence => getEvidence(evidence.evidenceId).text === evidence.text)).toBe(true);
    expect(searchEvidence('!!!')).toEqual([]);
    expect(searchEvidence('" OR * NOT ( subscribe', { limit: 2 }).length).toBeLessThanOrEqual(2);
    expect(() => searchEvidence('subscribe', { limit: 21 })).toThrow(/between 1 and 20/);
  });
});

describe('durable, isolated learning records', () => {
  it('numbers attempts per task and session and preserves answers in SQLite', () => {
    const first = saveAttempt('session-a', 'task-a', ['first', 'second'], false, 0);
    const second = saveAttempt('session-a', 'task-a', { startLine: 75, endLine: 78 }, true, 1);
    const other = saveAttempt('session-b', 'task-a', 'choice', true, 0);
    expect([first.attemptNumber, second.attemptNumber, other.attemptNumber]).toEqual([1, 2, 1]);
    expect(getAttempts('session-a')).toEqual([first, second]);
    const reopened = new DatabaseSync(filename);
    const persisted = reopened.prepare('SELECT answer_json, correct, attempt_number FROM attempts WHERE id = ?').get(second.id) as { answer_json: string; correct: number; attempt_number: number };
    expect(JSON.parse(persisted.answer_json)).toEqual({ startLine: 75, endLine: 78 });
    expect(persisted.correct).toBe(1); expect(persisted.attempt_number).toBe(2);
    reopened.close();
  });

  it('serializes concurrent writers without duplicate or lost attempt numbers', async () => {
    const execute = promisify(execFile);
    const script = "const {saveAttempt}=require('./src/lib/db/index.ts'); for(let i=0;i<12;i++)saveAttempt('concurrent-session','concurrent-task',i,false,0);";
    await Promise.all([1, 2].map(() => execute(process.execPath, ['--import', 'tsx', '-e', script], { cwd: process.cwd(), env: { ...process.env, MENTOR_DB_PATH: filename } })));
    const attempts = getAttempts('concurrent-session');
    expect(attempts).toHaveLength(24);
    expect(attempts.map(attempt => attempt.attemptNumber).sort((a,b) => a-b)).toEqual(Array.from({length:24}, (_,index) => index+1));
  });

  it('persists hint counts and resets only the requested session', () => {
    expect(recordHint('session-a', 'task-a')).toBe(1);
    expect(recordHint('session-a', 'task-a')).toBe(2);
    expect(recordHint('session-b', 'task-a')).toBe(1);
    expect(getHintCount('session-a', 'task-a')).toBe(2);
    resetSession('session-a');
    expect(getHintCount('session-a', 'task-a')).toBe(0);
    expect(getAttempts('session-a')).toEqual([]);
    expect(getAttempts('session-b')).toHaveLength(1);
    expect(getHintCount('session-b', 'task-a')).toBe(1);
  });
});
