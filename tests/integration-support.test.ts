import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getDb, resetSession, saveRecord } from '@/lib/db';
import { getSnapshot, getEvidence, listFiles, evidenceForRange } from '@/lib/repository';
import { bookmark, readBookmark, listBookmarks, editBookmark, removeBookmark, storeAnswer, exportNotebook, answerHistory, setGoal, contributionPlan } from '@/lib/workspace';
import { searchSource } from '@/lib/search';
import { GET as searchRoute } from '@/app/api/search/route';
import { GET as bookmarkListRoute } from '@/app/api/notebook/bookmarks/route';
import { GET as bookmarkRoute, PATCH as editRoute, DELETE as deleteRoute } from '@/app/api/notebook/bookmarks/[id]/route';
import { getSession } from '@/lib/learning/session';
import { getTask, requestHint, taskSessionProgress } from '@/lib/learning';
import { POST as hintRoute } from '@/app/api/tasks/[id]/hint/route';
import { GET as progressRoute } from '@/app/api/tasks/[id]/progress/route';

const dir = mkdtempSync(path.join(tmpdir(), 'mentor-integration-support-'));
const oldDb = process.env.MENTOR_DB_PATH;
const oldSecret = process.env.MENTOR_SESSION_SECRET;
const snapshotId = 'zustand-0ea8be27db13';
const oldMitt = 'mitt-f9a0b5397edf', newMitt = 'mitt-05f4ce67e8f1';
beforeAll(() => { process.env.MENTOR_DB_PATH = path.join(dir, 'test.sqlite'); process.env.MENTOR_SESSION_SECRET = 'integration-support-test-session-secret-only'; });
afterAll(() => { getDb().close(); if (oldDb === undefined) delete process.env.MENTOR_DB_PATH; else process.env.MENTOR_DB_PATH = oldDb; if (oldSecret === undefined) delete process.env.MENTOR_SESSION_SECRET; else process.env.MENTOR_SESSION_SECRET = oldSecret; rmSync(dir, { recursive: true, force: true }); });

describe('private notebook management', () => {
  it('lists and reads only the signed session and selected snapshot, with bounded pagination', () => {
    const session = randomUUID();
    const a = bookmark(session, { snapshotId, title: 'First' });
    bookmark(session, { snapshotId, title: 'Second' });
    bookmark(session, { snapshotId: oldMitt, title: 'Other source' });
    const first = listBookmarks(session, { snapshotId, limit: 1 });
    expect(first.total).toBe(2); expect(first.nextOffset).toBe(1);
    expect(first.bookmarks[0].id).toBe(a.id);
    expect(listBookmarks(session, { snapshotId, limit: 1, offset: 1 }).nextOffset).toBeNull();
    expect(listBookmarks('stranger', { snapshotId }).bookmarks).toEqual([]);
    expect(() => readBookmark('stranger', snapshotId, a.id)).toThrow(/does not belong/);
    expect(() => readBookmark(session, oldMitt, a.id)).toThrow(/does not belong/);
    expect(() => listBookmarks(session, { snapshotId, limit: 101 })).toThrow();
    expect(() => listBookmarks(session, { snapshotId: '' })).toThrow();
  });
  it('edits only notes/title with optimistic revision checks and retains original source/provider context', () => {
    const session = randomUUID(), file = listFiles().find(f => f.path === 'src/vanilla.ts')!;
    const evidence = evidenceForRange(file.fileId, 66, 81);
    const context = { snapshotId, question: 'Inspect this guard', fileId: file.fileId, scope: 'file' as const };
    const answer = storeAnswer(session, context, { status: 'answered', mode: 'live', provider: 'lmstudio', model: 'original-local-model', reviewState: 'generated', answer: 'Inspect the supplied guard.', blocks: [{ text: 'Inspect the supplied guard.', kind: 'observed', evidenceIds: [evidence.evidenceId] }], citations: [evidence], limitations: ['Not independently reviewed.'] });
    const saved = bookmark(session, { snapshotId, title: 'Original', answerId: answer.answerId });
    const before = readBookmark(session, snapshotId, saved.id);
    const after = editBookmark(session, saved.id, { snapshotId, revision: 1, title: 'Edited', note: 'My own note' });
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.payload.revision).toBe(2);
    expect(after.payload.savedAnswer).toEqual(before.payload.savedAnswer);
    expect(after.payload.savedAnswer?.model).toBe('original-local-model');
    expect(after.payload.savedAnswer?.provider).toBe('lmstudio');
    expect(() => editBookmark(session, saved.id, { snapshotId, revision: 1, note: 'Lost edit' })).toThrow(/changed/);
    expect(() => editBookmark(session, saved.id, { snapshotId, revision: 2, evidenceIds: [] })).toThrow();
    const markdown = exportNotebook(session);
    expect(markdown).toContain('original-local-model'); expect(markdown).toContain('Original context:');
    expect(markdown).toContain(`/blob/${getSnapshot().commitSha}/`);
    resetSession(session);
    expect(readBookmark(session, snapshotId, saved.id).payload.note).toBe('My own note');
    expect(answerHistory(session)).toHaveLength(1);
    expect(() => removeBookmark('stranger', snapshotId, saved.id)).toThrow();
    removeBookmark(session, snapshotId, saved.id);
    expect(() => readBookmark(session, snapshotId, saved.id)).toThrow();
    expect(answerHistory(session)).toHaveLength(1);
  });
  it('retains legacy bookmarks and conservatively marks changed source while preserving old permalinks', () => {
    const session = randomUUID(), file = listFiles(oldMitt)[0];
    const e = evidenceForRange(file.fileId, 1, 5, oldMitt);
    const id = saveRecord(session, oldMitt, 'bookmark', { snapshotId: oldMitt, title: 'Legacy note', note: '', evidenceIds: [e.evidenceId] });
    expect(readBookmark(session, oldMitt, id).payload.revision).toBe(1);
    editBookmark(session, id, { snapshotId: oldMitt, revision: 1, note: 'Updated note' });
    const text = exportNotebook(session, oldMitt, newMitt);
    expect(text).toContain('needs review'); expect(text).toContain(`/blob/${getSnapshot(oldMitt).commitSha}/`);
  });
  it('enforces cookies, methods, errors and no-store through bookmark route handlers', async () => {
    const identity = getSession(new Request('http://localhost'));
    const cookie = identity.cookie!.split(';')[0];
    const saved = bookmark(identity.id, { snapshotId, title: 'HTTP note' });
    const context = { params: Promise.resolve({ id: saved.id }) };
    const request = (suffix = '', init: RequestInit = {}) => new Request(`http://localhost/api/notebook/bookmarks/${saved.id}${suffix}`, { ...init, headers: { cookie, 'content-type': 'application/json' } });
    const listed = bookmarkListRoute(new Request(`http://localhost/api/notebook/bookmarks?snapshotId=${snapshotId}`, { headers: { cookie } }));
    expect(listed.headers.get('cache-control')).toBe('no-store');
    expect((await listed.json()).bookmarks).toHaveLength(1);
    expect((await bookmarkRoute(request(`?snapshotId=${snapshotId}`), context)).status).toBe(200);
    const updated = await editRoute(request('', { method: 'PATCH', body: JSON.stringify({ snapshotId, revision: 1, note: 'Edited over HTTP' }) }), context);
    expect(updated.status).toBe(200); expect(updated.headers.get('cache-control')).toBe('no-store');
    const stale = await editRoute(request('', { method: 'PATCH', body: JSON.stringify({ snapshotId, revision: 1, note: 'Stale' }) }), context);
    expect(stale.status).toBe(409);
    expect((await deleteRoute(new Request(`http://localhost/api/notebook/bookmarks/${saved.id}?snapshotId=${snapshotId}`, { method: 'DELETE' }), context)).status).toBe(404);
    expect((await deleteRoute(request(`?snapshotId=${snapshotId}`, { method: 'DELETE' }), context)).status).toBe(200);
  });
  it('keeps goals and curated remediation isolated by snapshot and session', () => {
    const session = randomUUID(); setGoal(session, snapshotId, 'debug'); setGoal(session, newMitt, 'tests');
    expect(contributionPlan(session, snapshotId).goal).toBe('debug');
    expect(contributionPlan(session, newMitt).goal).toBe('tests');
    expect(contributionPlan('stranger', snapshotId).goal).toBe('documentation');
    expect(contributionPlan(session, snapshotId).recommendations[0].remediationTaskIds.length).toBeGreaterThan(0);
  });
});

describe('bounded public code and nested-symbol search', () => {
  it('finds nested implementations and returns canonical source references', () => {
    const result = searchSource({ snapshotId, q: 'setState', mode: 'symbol' });
    const match = result.matches.find(m => m.path === 'src/vanilla.ts' && m.name === 'setState')!;
    expect(match.runtime).toBe(true);
    expect(getEvidence(match.evidenceId, snapshotId)).toMatchObject({ fileId: match.fileId, startLine: match.startLine, endLine: match.endLine, contentHash: match.contentHash });
    expect(match.preview.length).toBeLessThanOrEqual(300);
  });
  it('paginates without duplicates and rejects cursors for changed queries or snapshots', () => {
    const first = searchSource({ snapshotId, q: 'state', mode: 'code', limit: 2 });
    expect(first.nextCursor).toBeTruthy();
    const next = searchSource({ snapshotId, q: 'state', mode: 'code', limit: 2, cursor: first.nextCursor! });
    expect(next.matches.some(m => first.matches.some(a => a.evidenceId === m.evidenceId))).toBe(false);
    expect(() => searchSource({ snapshotId, q: 'subscribe', mode: 'code', cursor: first.nextCursor! })).toThrow(/cursor/);
    expect(() => searchSource({ snapshotId: newMitt, q: 'state', mode: 'code', cursor: first.nextCursor! })).toThrow(/cursor/);
    expect(() => searchSource({ snapshotId, q: 'state', cursor: 'not-json' })).toThrow(/cursor/);
  });
  it('keeps file and snapshot identities strict and treats query punctuation as inert', () => {
    const file = listFiles(newMitt)[0];
    const result = searchSource({ snapshotId: newMitt, q: 'emit', fileId: file.fileId });
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.every(m => m.snapshotId === newMitt && m.fileId === file.fileId)).toBe(true);
    expect(() => searchSource({ snapshotId, q: 'emit', fileId: file.fileId })).toThrow();
    expect(() => searchSource({ snapshotId, q: 'state', path: '../../.env.local' })).toThrow();
    const literal = searchSource({ snapshotId, q: '" OR * NOT (', mode: 'code' }).matches;
    expect(literal).toEqual(searchSource({ snapshotId, q: 'OR NOT', mode: 'code' }).matches);
    expect(literal.every(match => ['or', 'not'].every(term => match.preview.toLowerCase().includes(term)))).toBe(true);
    for (const bad of [{ q: 'a' }, { q: '!!!!' }, { q: 'state', limit: 26 }, { q: 'state', limit: 0 }, { q: 'state', cursor: '=' }]) expect(() => searchSource({ snapshotId, ...bad })).toThrow();
  });
  it('validates the HTTP query and returns a public no-store result', async () => {
    const response = searchRoute(new Request(`http://localhost/api/search?snapshotId=${snapshotId}&q=setState&mode=symbol&limit=1`));
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).matches).toHaveLength(1);
    expect(searchRoute(new Request('http://localhost/api/search?q=state')).status).toBe(400);
    expect(searchRoute(new Request('http://localhost/api/search?snapshotId=wrong&q=state')).status).toBe(409);
  });
});

describe('versioned hint and feedback restoration', () => {
  it('rejects stale content before changing hint counts and preserves other snapshots and sessions', async () => {
    const session = randomUUID(), task = getTask('mitt-dispatch-order', newMitt);
    expect(() => requestHint(session, task.id, newMitt, 'stale')).toThrow(/Reload/);
    expect(taskSessionProgress(session, task.id, newMitt, task.contentVersion).hintsUsed).toBe(0);
    expect(requestHint(session, task.id, newMitt, task.contentVersion)).toMatchObject({ snapshotId: newMitt, contentVersion: task.contentVersion, hintsUsed: 1 });
    expect(taskSessionProgress(session, task.id, oldMitt).hintsUsed).toBe(0);
    expect(taskSessionProgress('stranger', task.id, newMitt).hintsUsed).toBe(0);
    expect(() => taskSessionProgress(session, task.id, newMitt, 'stale')).toThrow(/Reload/);
    const context = { params: Promise.resolve({ id: task.id }) };
    const url = `http://localhost/api/tasks/${task.id}/hint?snapshotId=${newMitt}&contentVersion=stale`;
    expect((await hintRoute(new Request(url, { method: 'POST' }), context)).status).toBe(409);
    expect((await progressRoute(new Request(url.replace('/hint?', '/progress?')), context)).status).toBe(409);
  });
});
