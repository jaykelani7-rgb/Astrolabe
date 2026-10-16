import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { GET as guidesGet } from '@/app/api/guides/route';
import { GET as taskGet } from '@/app/api/tasks/[id]/route';
import { POST as attemptPost } from '@/app/api/tasks/[id]/attempt/route';
import { POST as hintPost } from '@/app/api/tasks/[id]/hint/route';
import { GET as progressGet } from '@/app/api/tasks/[id]/progress/route';
import { GET as resultsGet } from '@/app/api/results/route';
import { POST as resetPost } from '@/app/api/session/reset/route';
import { getTask, publicLearning, requestHint, sessionResults, submitAttempt, taskSessionProgress } from '@/lib/learning';
import { getEvidence } from '@/lib/repository';
import { saveAttempt } from '@/lib/db';

beforeAll(() => {
  process.env.MENTOR_DB_PATH = ':memory:';
  process.env.MENTOR_SESSION_SECRET = 'learning-test-session-secret-long-enough-for-hmac';
});
const context = (id: string) => ({ params: Promise.resolve({ id }) });
function request(path: string, body?: unknown, cookie?: string) {
  return new Request(`http://localhost${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

describe('prepared learning content', () => {
  it('serves two guides, four public tasks, and source ranges from the pinned snapshot', async () => {
    const response = guidesGet();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.guides).toHaveLength(2); expect(data.tasks).toHaveLength(4);
    const forbidden = /"(?:answer|correct|rubric|hint|explanation)"\s*:/;
    expect(JSON.stringify(data)).not.toMatch(forbidden);
    const allReferences = [...data.guides.flatMap((guide: { steps: { evidenceIds: string[] }[] }) => guide.steps.flatMap((step) => step.evidenceIds)), ...data.tasks.flatMap((task: { contextEvidenceIds: string[] }) => task.contextEvidenceIds)];
    for (const id of allReferences) {
      const evidence = getEvidence(id);
      expect(evidence.snapshotId).toBe(data.guides[0].snapshotId);
      expect(evidence.startLine).toBeGreaterThan(0); expect(evidence.endLine).toBeGreaterThanOrEqual(evidence.startLine); expect(evidence.text).not.toBe('');
    }
    const individual = await taskGet(request('/api/tasks/same-reference'), context('same-reference'));
    expect(await individual.json()).toEqual(data.tasks[0]);
  });

  it('scores all four known correct and incorrect answers against the real source', () => {
    const snapshotId = publicLearning().tasks[0].snapshotId;
    const fixtures = [
      { id: 'same-reference', wrong: 'notify', right: 'skip' },
      { id: 'update-order', wrong: ['notify', 'write', 'compute', 'compare'], right: ['compute', 'compare', 'write', 'notify'] },
      { id: 'merge-change-point', wrong: { startLine: 74, endLine: 79 }, right: { endLine: 78, startLine: 75 } },
      { id: 'react-initial-snapshot', wrong: 'current', right: 'initial' },
    ];
    for (const item of fixtures) {
      const session = randomUUID();
      expect(submitAttempt(session, item.id, { snapshotId, answer: item.wrong }).correct).toBe(false);
      const feedback = submitAttempt(session, item.id, { snapshotId, answer: item.right });
      expect(feedback.correct).toBe(true); expect(feedback.attemptNumber).toBe(2);
      expect(feedback.explanation.beginner).toBeTruthy(); expect(feedback.explanation.developer).toBeTruthy();
    }
  });

  it('preserves retries and cumulative hint counts without counting hints per attempt twice', () => {
    const session = randomUUID(); const task = getTask('same-reference');
    requestHint(session, task.id);
    submitAttempt(session, task.id, { snapshotId: task.snapshotId, answer: 'notify' });
    submitAttempt(session, task.id, { snapshotId: task.snapshotId, answer: 'skip' });
    const results = sessionResults(session);
    expect(results).toMatchObject({ completed: 1, totalTasks: 4, firstAttemptCorrect: 0, totalAttempts: 2, hintsUsed: 1 });
    expect(results.tasks[0]).toMatchObject({ completed: true, attempts: 2, firstAttemptCorrect: false, hintsUsed: 1, lastCorrect: true });
    expect(results.topicsToRevisit).toEqual(['Identity and notifications']);
    expect(results.briefs).toHaveLength(2);
    for (const brief of results.briefs) { expect(brief.verificationSteps.length).toBeGreaterThan(1); expect(brief.evidenceIds.length).toBeGreaterThan(0); for (const id of brief.evidenceIds) expect(getEvidence(id).snapshotId).toBe(task.snapshotId); }
  });
});

describe('learning API validation and anonymous session isolation', () => {
  it('rejects malformed, wrong-snapshot, unknown-choice, repeated-order, and invalid-range attempts', async () => {
    const snapshotId = getTask('same-reference').snapshotId;
    const fixtures = [
      { id: 'same-reference', data: { snapshotId, answer: 'not-an-option' }, status: 400 },
      { id: 'same-reference', data: { snapshotId: 'another-snapshot', answer: 'skip' }, status: 409 },
      { id: 'same-reference', data: { snapshotId, answer: 'skip', correct: true }, status: 400 },
      { id: 'same-reference', data: { snapshotId, answer: ['skip'] }, status: 400 },
      { id: 'update-order', data: { snapshotId, answer: ['compute', 'compute', 'write', 'notify'] }, status: 400 },
      { id: 'merge-change-point', data: { snapshotId, answer: { startLine: 79, endLine: 75 } }, status: 400 },
      { id: 'merge-change-point', data: { snapshotId, answer: { startLine: 101, endLine: 102 } }, status: 400 },
      { id: 'missing', data: { snapshotId, answer: 'skip' }, status: 404 },
    ];
    for (const item of fixtures) {
      const response = await attemptPost(request(`/api/tasks/${item.id}/attempt`, item.data), context(item.id));
      expect(response.status).toBe(item.status); expect((await response.json()).error.code).toBeTruthy();
    }
    const badJson = new Request('http://localhost/api/tasks/same-reference/attempt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    expect((await attemptPost(badJson, context('same-reference'))).status).toBe(400);
    const tooLarge = new Request('http://localhost/api/tasks/same-reference/attempt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(9000) }) });
    expect((await attemptPost(tooLarge, context('same-reference'))).status).toBe(413);
  });

  it('issues signed HttpOnly sessions, rejects forged ids, and resets only the caller', async () => {
    const a = resultsGet(request('/api/results')); const b = resultsGet(request('/api/results'));
    const aSetCookie = a.headers.get('set-cookie')!; const bSetCookie = b.headers.get('set-cookie')!;
    expect(aSetCookie).toContain('HttpOnly'); expect(aSetCookie).toContain('SameSite=Lax');
    const cookieA = aSetCookie.split(';')[0]; const cookieB = bSetCookie.split(';')[0];
    expect(cookieA).not.toBe(cookieB);
    const task = getTask('same-reference');
    const input = { snapshotId: task.snapshotId, answer: 'skip' };
    expect((await attemptPost(request('/api/tasks/same-reference/attempt', input, cookieA), context(task.id))).status).toBe(200);
    await attemptPost(request('/api/tasks/same-reference/attempt', input, cookieB), context(task.id));
    const hintResponse = await hintPost(new Request('http://localhost/api/tasks/same-reference/hint', { method: 'POST', headers: { cookie: cookieA } }), context(task.id));
    expect((await hintResponse.json()).hintsUsed).toBe(1);
    const forged = cookieA.replace(/\.[^.;]+$/, '.forged');
    const forgedResults = resultsGet(request('/api/results', undefined, forged));
    expect((await forgedResults.json()).totalAttempts).toBe(0); expect(forgedResults.headers.get('set-cookie')).toBeTruthy();
    const reset = resetPost(new Request('http://localhost/api/session/reset', { method: 'POST', headers: { cookie: cookieA } }));
    expect(await reset.json()).toEqual({ ok: true });
    expect(await resultsGet(request('/api/results', undefined, cookieA)).json()).toMatchObject({ totalAttempts: 0, hintsUsed: 0 });
    expect(await resultsGet(request('/api/results', undefined, cookieB)).json()).toMatchObject({ totalAttempts: 1, completed: 1 });
  });
});


describe('saved checkpoint continuity', () => {
  it('keeps feedback and hint text locked until this session has earned access', () => {
    const session = randomUUID();
    expect(taskSessionProgress(session, 'same-reference')).toEqual({ feedback: null, hintsUsed: 0 });
    expect(JSON.stringify(taskSessionProgress(session, 'same-reference'))).not.toMatch(/explanation|submittedAnswer/);
    const hint = requestHint(session, 'same-reference');
    expect(taskSessionProgress(session, 'same-reference')).toEqual({ feedback: null, hintsUsed: 1, hint: hint.hint });
    const invalidSession = randomUUID();
    saveAttempt(invalidSession, 'same-reference', 'not-an-offered-choice', true, 0);
    expect(taskSessionProgress(invalidSession, 'same-reference').feedback).toBeNull();
  });

  it('restores the latest valid feedback, submitted answer and historical hint count', () => {
    const session = randomUUID(); const task = getTask('same-reference');
    requestHint(session, task.id);
    const wrong = submitAttempt(session, task.id, { snapshotId: task.snapshotId, answer: 'notify' });
    expect(taskSessionProgress(session, task.id).feedback).toEqual(wrong);
    requestHint(session, task.id);
    expect(taskSessionProgress(session, task.id)).toMatchObject({ hintsUsed: 2, feedback: { hintsUsed: 1, correct: false, attemptNumber: 1 } });
    const right = submitAttempt(session, task.id, { snapshotId: task.snapshotId, answer: 'skip' });
    const restored = taskSessionProgress(session, task.id);
    expect(restored.feedback).toEqual(right);
    expect(restored).toMatchObject({ hintsUsed: 2, hint: expect.any(String), feedback: { correct: true, attemptNumber: 2, submittedAnswer: 'skip' } });
    expect(taskSessionProgress(randomUUID(), task.id)).toEqual({ feedback: null, hintsUsed: 0 });
    expect(getEvidence(restored.feedback!.evidenceIds[0]).snapshotId).toBe(task.snapshotId);
  });

  it('serves saved progress only to the signed session and clears it on reset', async () => {
    const session = resultsGet(request('/api/results'));
    const cookie = session.headers.get('set-cookie')!.split(';')[0];
    const id = 'same-reference'; const task = getTask(id);
    const empty = await progressGet(request(`/api/tasks/${id}/progress`, undefined, cookie), context(id));
    expect(empty.headers.get('cache-control')).toBe('no-store');
    expect(await empty.json()).toEqual({ feedback: null, hintsUsed: 0 });
    await hintPost(new Request(`http://localhost/api/tasks/${id}/hint`, { method: 'POST', headers: { cookie } }), context(id));
    await attemptPost(request(`/api/tasks/${id}/attempt`, { snapshotId: task.snapshotId, answer: 'skip' }, cookie), context(id));
    const saved = await progressGet(request(`/api/tasks/${id}/progress`, undefined, cookie), context(id));
    expect(saved.headers.get('set-cookie')).toBeNull();
    expect(await saved.json()).toMatchObject({ hintsUsed: 1, feedback: { correct: true, attemptNumber: 1, submittedAnswer: 'skip' } });
    const other = await progressGet(request(`/api/tasks/${id}/progress`), context(id));
    expect(await other.json()).toEqual({ feedback: null, hintsUsed: 0 });
    resetPost(new Request('http://localhost/api/session/reset', { method: 'POST', headers: { cookie } }));
    expect(await (await progressGet(request(`/api/tasks/${id}/progress`, undefined, cookie), context(id))).json()).toEqual({ feedback: null, hintsUsed: 0 });
    expect((await progressGet(request('/api/tasks/missing/progress', undefined, cookie), context('missing'))).status).toBe(404);
  });
});
