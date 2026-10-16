/** Production HTTP checks against a private database, including a process restart.
 * Run after npm run build. No provider calls or external application writes.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const directory = path.resolve('.data/verification', `http-${new Date().toISOString().replace(/[:.]/g, '-')}`);
mkdirSync(directory, { recursive: true });
const report = { recordedAt: new Date().toISOString(), mode: 'production', liveProviderRequests: 0, checks: [] };
const portProbe = net.createServer();
await new Promise((resolve, reject) => {
  portProbe.once('error', reject);
  portProbe.listen(0, '127.0.0.1', resolve);
});
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const base = `http://127.0.0.1:${port}`;
let server;
let serverError;
const log = createWriteStream(path.join(directory, 'server.log'));
async function start() {
  serverError = undefined;
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(), windowsHide: true,
    env: { ...process.env, NODE_ENV: 'production', AI_PROVIDER: 'disabled', GEMINI_API_KEY: '', MENTOR_SESSION_SECRET: '',
      MENTOR_DB_PATH: path.join(directory, 'mentor.sqlite'), MENTOR_DATA_DIR: directory },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.once('error', error => { serverError = error; });
  server.stdout.pipe(log, { end: false });
  server.stderr.pipe(log, { end: false });
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    if (serverError) throw serverError;
    if (server.exitCode !== null) throw Error(`Production server exited ${server.exitCode}; see server.log`);
    try {
      const response = await fetch(`${base}/api/questions/status`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch { /* Startup is asynchronous; retry until the readiness deadline. */ }
    await delay(200);
  }
  throw Error('Production server did not become ready within 40 seconds.');
}
async function stop() {
  if (!server || server.exitCode !== null || serverError) return;
  const exited = once(server, 'exit');
  server.kill();
  await Promise.race([exited, delay(8000, undefined, { ref: false }).then(() => { throw Error('Production server did not stop.'); })]);
}
async function check(name, execute) {
  try { await execute(); } catch (error) { throw new Error(`${name}: ${error.message}`, { cause: error }); }
  report.checks.push({ name, status: 'passed' });
  console.log(`PASS ${name}`);
}
function client(cookie = '') {
  return {
    cookie,
    async request(url, body, status = 200, privateResponse = false) {
      const response = await fetch(base + url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000),
      });
      assert.equal(response.status, status, `${url}: unexpected HTTP status`);
      if (privateResponse) assert.equal(response.headers.get('cache-control'), 'no-store', url);
      const cookie = response.headers.get('set-cookie');
      if (cookie) {
        assert.match(cookie, /HttpOnly/);
        assert.match(cookie, /SameSite=Lax/);
        this.cookie = cookie.split(';')[0];
      }
      const text = await response.text();
      return response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text;
    },
  };
}
const a = client(), b = client();
const oldMitt = 'mitt-f9a0b5397edf', newMitt = 'mitt-05f4ce67e8f1';
let snapshotId, task, evidenceId, answerId, submission;
try {
  await start();
  await check('production readiness and absent-provider state', async () => {
    const state = await a.request('/api/questions/status');
    assert.equal(state.liveConfigured, false);
    assert.equal(state.liveStatus, 'unverified');
  });
  await check('all bundled snapshots: source, map, architecture and public learning', async () => {
    const { snapshots } = await a.request('/api/snapshots');
    assert.equal(snapshots.length, 3);
    snapshotId = snapshots.find(snapshot => snapshot.name === 'Zustand').snapshotId;
    for (const snapshot of snapshots) {
      const query = `?snapshotId=${snapshot.snapshotId}`;
      const repository = await a.request('/api/repository' + query);
      assert.equal(repository.snapshot.commitSha, snapshot.commitSha);
      assert.ok(repository.files.length);
      const source = await a.request(`/api/repository/source${query}&fileId=${repository.files[0].fileId}`);
      assert.equal(source.file.snapshotId, snapshot.snapshotId);
      assert.ok((await a.request('/api/repository/map' + query)).nodes.length);
      const architecture = await a.request('/api/architecture' + query);
      assert.equal(architecture.humanReview, 'pending');
      const learning = await a.request('/api/guides' + query);
      assert.equal(learning.humanReview, 'pending');
      assert.ok(!JSON.stringify(learning).includes('"answer":'));
      for (const entry of learning.tasks) {
        const publicTask = await a.request(`/api/tasks/${entry.id}${query}`);
        assert.ok(!('answer' in publicTask));
        assert.ok(publicTask.contentVersion);
      }
      const id = architecture.modules[0].evidenceIds[0];
      assert.equal((await a.request(`/api/evidence/${id}${query}`)).snapshotId, snapshot.snapshotId);
    }
    task = await a.request(`/api/tasks/same-reference?snapshotId=${snapshotId}`);
    evidenceId = task.contextEvidenceIds[0];
  });
  await check('wrong/empty snapshots, foreign evidence and invalid source ranges fail', async () => {
    for (const id of ['', 'wrong', '../snapshot']) {
      const error = await a.request(`/api/repository?snapshotId=${encodeURIComponent(id)}`, undefined, 409);
      assert.equal(error.error.code, 'SNAPSHOT_MISMATCH');
    }
    const { files } = await a.request(`/api/repository?snapshotId=${snapshotId}`);
    await a.request(`/api/repository/source?fileId=${files[0].fileId}&startLine=0&endLine=1`, undefined, 400);
    await a.request(`/api/repository/source?fileId=${files[0].fileId}&snapshotId=${newMitt}`, undefined, 404);
    await a.request(`/api/evidence/${evidenceId}?snapshotId=${newMitt}`, undefined, 404);
  });
  await check('signed sessions and feedback stay private before an attempt', async () => {
    assert.equal((await a.request('/api/results', undefined, 200, true)).totalAttempts, 0);
    assert.equal((await b.request('/api/results', undefined, 200, true)).totalAttempts, 0);
    assert.notEqual(a.cookie, b.cookie);
    assert.equal((await a.request('/api/tasks/same-reference/progress', undefined, 200, true)).feedback, null);
  });
  await check('malformed answers and stale versions do not create attempts', async () => {
    assert.equal((await a.request('/api/tasks/same-reference/attempt', { snapshotId, answer: 'invalid-choice' }, 400)).error.code, 'INVALID_ANSWER');
    assert.equal((await a.request('/api/tasks/same-reference/attempt', { snapshotId, contentVersion: 'stale', answer: 'skip' }, 409)).error.code, 'CONTENT_VERSION_MISMATCH');
    assert.equal((await a.request('/api/results')).totalAttempts, 0);
  });
  await check('hints, incorrect/correct attempts and restored feedback', async () => {
    assert.equal((await a.request('/api/tasks/same-reference/hint', {}, 200, true)).hintsUsed, 1);
    const attempt = answer => a.request('/api/tasks/same-reference/attempt', { snapshotId, contentVersion: task.contentVersion, answer }, 200, true);
    assert.equal((await attempt('notify')).correct, false);
    const feedback = await attempt('skip');
    assert.equal(feedback.correct, true);
    assert.equal(feedback.attemptNumber, 2);
    assert.equal(feedback.hintsUsed, 1);
    const restored = await a.request('/api/tasks/same-reference/progress', undefined, 200, true);
    assert.equal(restored.feedback.submittedAnswer, 'skip');
    assert.equal(restored.feedback.contentVersion, task.contentVersion);
    assert.equal((await b.request('/api/tasks/same-reference/progress')).feedback, null);
  });
  await check('mitt attempts and hints remain isolated across pinned snapshots', async () => {
    const mittTask = await a.request(`/api/tasks/mitt-dispatch-order?snapshotId=${oldMitt}`);
    await a.request(`/api/tasks/mitt-dispatch-order/hint?snapshotId=${oldMitt}`, {}, 200, true);
    await a.request('/api/tasks/mitt-dispatch-order/attempt', { snapshotId: oldMitt, contentVersion: mittTask.contentVersion, answer: 'specific' }, 200, true);
    assert.equal((await a.request(`/api/results?snapshotId=${oldMitt}`)).totalAttempts, 1);
    assert.equal((await a.request(`/api/results?snapshotId=${newMitt}`)).totalAttempts, 0);
    assert.equal((await a.request(`/api/tasks/mitt-dispatch-order/progress?snapshotId=${newMitt}`)).hintsUsed, 0);
  });
  await check('prepared answers persist original context and exact citations', async () => {
    const input = { snapshotId, question: 'How does setState work?', scope: 'repository', depth: 'developer' };
    const answer = await a.request('/api/questions', input, 200, true);
    assert.equal(answer.status, 'answered');
    assert.equal(answer.mode, 'reviewed');
    assert.equal(answer.reviewState, 'authored');
    assert.ok(answer.citations.length);
    answerId = answer.answerId;
    const history = await a.request('/api/questions/history', undefined, 200, true);
    assert.deepEqual(history.answers[0].payload.context, input);
    assert.equal(history.answers[0].id, answerId);
    assert.equal((await b.request('/api/questions/history')).answers.length, 0);
    for (const citation of answer.citations) assert.deepEqual(await a.request(`/api/evidence/${citation.evidenceId}?snapshotId=${snapshotId}`), citation);
  });
  await check('unsupported questions and missing credentials return honest states', async () => {
    const gap = await a.request('/api/questions', { snapshotId, question: 'Explain Kubernetes deployment authentication security.' });
    assert.equal(gap.status, 'evidence_gap');
    assert.deepEqual(gap.citations, []);
    const evidence = await a.request(`/api/evidence/${evidenceId}?snapshotId=${snapshotId}`);
    const unavailable = await a.request('/api/questions', { snapshotId, question: 'How do I unsubscribe?', scope: 'selection', fileId: evidence.fileId, startLine: 88, endLine: 92 });
    assert.equal(unavailable.status, 'unavailable');
    assert.deepEqual(unavailable.citations, []);
    // "migration" overlaps Zustand's persist middleware. Lexical retrieval alone
    // cannot determine semantic support for PostgreSQL; preserve unavailable.
    const incidental = await a.request('/api/questions', { snapshotId, question: 'Where is the PostgreSQL migration engine implemented?' });
    assert.equal(incidental.status, 'unavailable');
    assert.deepEqual(incidental.citations, []);
    await a.request('/api/questions', { snapshotId, question: 'How does it work?', scope: 'selection' }, 400);
  });
  await check('goals, contribution remediation and walkthrough position', async () => {
    await a.request('/api/learning/goal', { snapshotId, goal: 'debug' }, 200, true);
    assert.equal((await a.request('/api/learning/goal', undefined, 200, true)).goal, 'debug');
    assert.equal((await b.request('/api/learning/goal')).goal, null);
    const plan = await a.request('/api/contributions', undefined, 200, true);
    assert.equal(plan.recommendations[0].status, 'review_prerequisites');
    await a.request('/api/progress', { snapshotId, guideId: 'state-to-subscribers', stepId: 'predict-identity' }, 200, true);
    assert.equal((await a.request('/api/progress', undefined, 200, true)).progress.payload.stepId, 'predict-identity');
  });
  await check('teach-back requires an attempt and records self-assessment only', async () => {
    const input = { snapshotId, taskId: task.id, contentVersion: task.contentVersion, text: 'The identity guard skips notification for the same object reference.' };
    await b.request('/api/teach-back', input, 409);
    submission = await a.request('/api/teach-back', input, 200, true);
    assert.equal(submission.status, 'needs_review');
    assert.ok(!('score' in submission));
    const review = { snapshotId, submissionId: submission.id, assessments: submission.concepts.map(concept => ({ conceptId: concept.id, state: 'uncertain' })) };
    await b.request('/api/teach-back/review', review, 404);
    const assessed = await a.request('/api/teach-back/review', review, 200, true);
    assert.equal(assessed.reviewMethod, 'learner_self_assessment');
    assert.ok(assessed.followUps.length);
  });
  await check('private notebook download preserves pinned references', async () => {
    const bookmark = { snapshotId, title: 'HTTP verification note', answerId, evidenceIds: [evidenceId] };
    await b.request('/api/notebook/bookmarks', bookmark, 404);
    await a.request('/api/notebook/bookmarks', bookmark, 200, true);
    const markdown = await a.request('/api/notebook', undefined, 200, true);
    assert.match(markdown, /HTTP verification note/);
    assert.match(markdown, /\/blob\/0ea8be27db13019819fc1c0492e5b672dd7b6f4b\//);
    assert.doesNotMatch(await b.request('/api/notebook'), /HTTP verification note/);
  });
  await check('snapshot comparison flags stale authored content', async () => {
    const comparison = await a.request('/api/snapshots/compare', { fromSnapshotId: oldMitt, toSnapshotId: newMitt });
    assert.ok(comparison.changes.some(change => change.path === 'src/index.ts'));
    assert.ok(comparison.content.some(content => content.state === 'needs_review'));
    await a.request('/api/snapshots/compare', { fromSnapshotId: oldMitt, toSnapshotId: snapshotId }, 409);
  });
  await check('tampered session cookie cannot retrieve another session history', async () => {
    const forged = client(a.cookie.slice(0, -1) + (a.cookie.endsWith('a') ? 'b' : 'a'));
    assert.equal((await forged.request('/api/questions/history', undefined, 200, true)).answers.length, 0);
  });
  await check('process restart preserves signed identity and durable records', async () => {
    await stop();
    await start();
    assert.equal((await a.request('/api/results')).totalAttempts, 2);
    assert.equal((await a.request('/api/tasks/same-reference/progress')).feedback.correct, true);
    assert.equal((await a.request('/api/learning/goal')).goal, 'debug');
    assert.equal((await a.request('/api/progress')).progress.payload.stepId, 'predict-identity');
    assert.ok((await a.request('/api/questions/history')).answers.some(answer => answer.id === answerId));
    assert.match(await a.request('/api/notebook'), /HTTP verification note/);
  });
  await check('reset clears this session practice but preserves saved notebook and preferences', async () => {
    await b.request('/api/tasks/same-reference/attempt', { snapshotId, answer: 'skip' });
    await a.request('/api/session/reset', {}, 200, true);
    assert.equal((await a.request('/api/results')).totalAttempts, 0);
    assert.equal((await a.request(`/api/results?snapshotId=${oldMitt}`)).totalAttempts, 0);
    assert.equal((await a.request('/api/tasks/same-reference/progress')).hintsUsed, 0);
    await a.request('/api/teach-back/review', { snapshotId, submissionId: submission.id, assessments: [{ conceptId: 'identity_guard', state: 'understood' }] }, 404);
    assert.equal((await b.request('/api/results')).totalAttempts, 1);
    assert.equal((await a.request('/api/learning/goal')).goal, 'debug');
    assert.match(await a.request('/api/notebook'), /HTTP verification note/);
    assert.ok((await a.request('/api/questions/history')).answers.length);
  });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
  console.error(report.error);
} finally {
  try { await stop(); } catch (error) { report.shutdownError = String(error); process.exitCode = 1; report.status = 'failed'; }
  log.end();
  writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, directory }));
}
