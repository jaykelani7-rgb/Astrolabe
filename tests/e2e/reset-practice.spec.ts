import { expect, test } from '@playwright/test';

test('practice reset preserves signed-session answers, bookmarks, goals and walkthrough position', async ({ page }) => {
  const repositoryResponse = await page.request.get('/api/repository');
  expect(repositoryResponse.ok()).toBe(true);
  const { snapshot } = await repositoryResponse.json();
  const snapshotId: string = snapshot.snapshotId;
  const query = new URLSearchParams({ snapshotId });
  const learning = await (await page.request.get(`/api/guides?${query}`)).json();
  const task = learning.tasks.find((entry: { id: string }) => entry.id === 'same-reference');
  expect(task.contentVersion).toBeTruthy();
  const taskQuery = new URLSearchParams({ snapshotId, contentVersion: task.contentVersion });
  expect((await page.request.post(`/api/tasks/${task.id}/hint?${taskQuery}`)).ok()).toBe(true);
  expect((await page.request.post(`/api/tasks/${task.id}/attempt`, { data: { snapshotId, contentVersion: task.contentVersion, answer: 'skip' } })).ok()).toBe(true);
  expect((await page.request.post('/api/teach-back', { data: {
    snapshotId, taskId: task.id, contentVersion: task.contentVersion,
    text: 'The identity guard prevents notification when the returned state reference is unchanged.',
  } })).ok()).toBe(true);
  const answerResponse = await page.request.post('/api/questions', { data: {
    snapshotId, question: 'How does setState work?', scope: 'repository', depth: 'developer',
  } });
  expect(answerResponse.ok()).toBe(true);
  const answer = await answerResponse.json();
  expect(answer.status).toBe('answered');
  const savedAnswer = (await (await page.request.get(`/api/questions/history?${query}`)).json()).answers.find((entry: { id: string }) => entry.id === answer.answerId);
  const bookmarkResponse = await page.request.post('/api/notebook/bookmarks', { data: {
    snapshotId, title: 'Keep this explanation', note: 'This source note survives practice reset.', answerId: answer.answerId,
    evidenceIds: answer.citations.map((citation: { evidenceId: string }) => citation.evidenceId),
  } });
  expect(bookmarkResponse.ok()).toBe(true);
  const bookmark = await bookmarkResponse.json();
  expect((await page.request.post('/api/learning/goal', { data: { snapshotId, goal: 'debug' } })).ok()).toBe(true);
  const guide = learning.guides.find((entry: { id: string }) => entry.id === task.guideId);
  const step = guide.steps.find((entry: { taskId?: string }) => entry.taskId === task.id);
  expect((await page.request.post('/api/progress', { data: { snapshotId, guideId: guide.id, stepId: step.id } })).ok()).toBe(true);

  await page.goto(`/?snapshot=${encodeURIComponent(snapshotId)}&view=progress`);
  await expect(page.locator('.results-stats')).toContainText('1 / 4');
  await page.getByRole('button', { name: 'Reset this learning session', exact: true }).click();
  await expect(page.locator('.results-reset-copy')).toContainText('Saved answers');
  await expect(page.locator('.results-reset-copy')).toContainText('walkthrough position remain');
  await page.getByRole('button', { name: 'Clear my session', exact: true }).click();
  await expect(page.locator('.results-stats')).toContainText('0 / 4');

  const progress = await (await page.request.get(`/api/tasks/${task.id}/progress?${taskQuery}`)).json();
  expect(progress).toMatchObject({ feedback: null, hintsUsed: 0 });
  const teachBack = await (await page.request.get(`/api/teach-back?${new URLSearchParams({ snapshotId, taskId: task.id, contentVersion: task.contentVersion })}`)).json();
  expect(teachBack.submission).toBeNull();
  expect((await (await page.request.get(`/api/learning/goal?${query}`)).json()).goal).toBe('debug');
  expect((await (await page.request.get(`/api/progress?${query}`)).json()).progress.payload).toEqual({ snapshotId, guideId: guide.id, stepId: step.id });
  const history = await (await page.request.get(`/api/questions/history?${query}`)).json();
  expect(history.answers.find((entry: { id: string }) => entry.id === answer.answerId)).toEqual(savedAnswer);
  const keptBookmark = await (await page.request.get(`/api/notebook/bookmarks/${bookmark.id}?${query}`)).json();
  expect(keptBookmark).toMatchObject({ id: bookmark.id, payload: { title: 'Keep this explanation', note: 'This source note survives practice reset.', answerId: answer.answerId } });
  const markdown = await (await page.request.get(`/api/notebook?${query}`)).text();
  expect(markdown).toContain('Keep this explanation');
  expect(markdown).toContain(snapshot.commitSha);
});
