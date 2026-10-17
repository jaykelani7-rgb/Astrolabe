import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

const snapshotId = 'zustand-0ea8be27db13';
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('complementary', { name: 'Main navigation' }).getByRole('button', { name: name === 'Notebook' ? 'Saved notebook' : name, exact: true }).click();
}
async function ask(page: Page, question: string) {
  await page.getByRole('textbox', { name: 'Ask a question about this code' }).fill(question);
  const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/questions' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
  const body = await (await response).json();
  await expect(page.locator('.mentor-answer h3')).toHaveText(question);
  return body;
}

test('bookmarked real answer retains context, supports conflict recovery, export and deletion', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Explore');
  await expect(page.getByRole('radio', { name: 'Current file', exact: true })).toBeEnabled();
  await page.getByRole('radio', { name: 'Repository', exact: true }).check();
  const answer = await ask(page, 'How does setState update state?');
  expect(answer.answerId).toBeTruthy();
  await page.getByRole('button', { name: 'Bookmark this answer', exact: true }).click();
  await page.getByLabel('Bookmark title', { exact: true }).fill('Identity notes');
  await page.getByLabel('Bookmark note', { exact: true }).fill('Read the guard again.');
  await page.getByRole('button', { name: 'Save answer to notebook', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Answer saved to your notebook' })).toBeVisible();
  await navigate(page, 'Notebook');
  await page.getByRole('complementary', { name: 'Saved bookmarks' }).getByRole('button', { name: /Identity notes/ }).click();
  const details = page.getByRole('article', { name: 'Saved bookmark details' });
  await expect(details.getByLabel('Saved bookmark note', { exact: true })).toHaveValue('Read the guard again.');
  await expect(details.getByRole('region', { name: 'Bookmarked answer' })).toContainText('Repository · whole repository');
  await expect(details.getByRole('region', { name: 'Bookmarked answer' })).toContainText('Authored prepared content · independent human review pending.');
  await expect(details.getByRole('region', { name: 'Pinned source references' }).getByRole('button')).toHaveCount(answer.citations.length);
  const list = await (await page.request.get(`/api/notebook/bookmarks?snapshotId=${snapshotId}`)).json();
  const bookmark = list.bookmarks.find((item: { payload: { title: string } }) => item.payload.title === 'Identity notes');
  await page.getByLabel('Saved bookmark note', { exact: true }).fill('My local draft must survive.');
  const competing = await page.request.patch(`/api/notebook/bookmarks/${bookmark.id}`, { data: { snapshotId, revision: bookmark.payload.revision, note: 'A second tab changed this note.' } });
  expect(competing.ok()).toBeTruthy();
  await page.getByRole('button', { name: 'Save bookmark changes', exact: true }).click();
  await expect(details.getByRole('alert')).toContainText('Another edit was saved. Your draft is preserved.');
  await expect(page.getByLabel('Saved bookmark note', { exact: true })).toHaveValue('My local draft must survive.');
  await expect(details.getByRole('alert')).toContainText('A second tab changed this note.');
  await expect(page.getByRole('button', { name: 'Save bookmark changes', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Reload latest revision, keep my draft', exact: true }).click();
  await expect(page.getByLabel('Saved bookmark note', { exact: true })).toHaveValue('My local draft must survive.');
  await page.getByRole('button', { name: 'Save my reviewed draft', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Bookmark updated.' })).toBeVisible();
  const record = await (await page.request.get(`/api/notebook/bookmarks/${bookmark.id}?snapshotId=${snapshotId}`)).json();
  expect(record.payload).toMatchObject({ revision: 3, note: 'My local draft must survive.' });
  expect(record.payload.savedAnswer.context).toMatchObject({ snapshotId, scope: 'repository', depth: 'beginner' });
  expect(record.payload.savedAnswer.response.citations).toEqual(answer.citations);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Markdown', exact: true }).click();
  const file = await (await download).path();
  expect(file).toBeTruthy();
  const markdown = await fs.readFile(file!, 'utf8');
  expect(markdown).toContain('My local draft must survive.');
  expect(markdown).toContain('/blob/0ea8be27db13019819fc1c0492e5b672dd7b6f4b/');
  expect(markdown).toContain('Original context:');
  await page.getByRole('region', { name: 'Pinned source references' }).getByRole('button').first().click();
  await expect(page.locator('.source-selection-label')).toHaveText(/Lines \d+–\d+/);
  await navigate(page, 'Notebook');
  await page.getByRole('complementary', { name: 'Saved bookmarks' }).getByRole('button', { name: /Identity notes/ }).click();
  await page.getByRole('button', { name: 'Delete bookmark', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete bookmark', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Saved bookmarks' }).getByRole('button', { name: /Identity notes/ })).toHaveCount(0);
  const history = await (await page.request.get(`/api/questions/history?snapshotId=${snapshotId}`)).json();
  expect(history.answers.some((item: { id: string }) => item.id === answer.answerId)).toBeTruthy();
});

test('signed-session history restores more than twelve answers after browser cache removal', async ({ page }) => {
  for (let index = 0; index < 14; index++) {
    const response = await page.request.post('/api/questions', { data: { snapshotId, question: `Saved source question ${index}: setState identity?`, scope: 'repository', depth: index % 2 ? 'developer' : 'beginner' } });
    expect(response.ok()).toBeTruthy();
  }
  await page.goto('/');
  await navigate(page, 'Explore');
  await expect(page.locator('.mentor-history-heading')).toContainText('14 questions');
  await page.locator('.mentor-history summary').click();
  await expect(page.locator('.mentor-history li')).toHaveCount(14);
  await page.locator('.mentor-history li').last().getByRole('button').click();
  await expect(page.locator('.mentor-answer h3')).toHaveText('Saved source question 0: setState identity?');
  await expect(page.locator('.mentor-answer-context')).toContainText('Repository · Beginner answer');
  await page.reload();
  await expect(page.locator('.mentor-history-heading')).toContainText('14 questions');
  await expect(page.locator('.mentor-answer h3')).toHaveText('Saved source question 0: setState identity?');
  await expect(page.locator('.mentor-answer-context')).toContainText('Repository · Beginner answer');
  await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.startsWith('astrolabe:mentor-history:')) localStorage.removeItem(key); });
  await page.reload();
  await expect(page.locator('.mentor-history-heading')).toContainText('14 questions');
  await expect(page.locator('.mentor-answer h3')).toHaveText('Saved source question 13: setState identity?');
  await expect(page.locator('.mentor-answer-context')).toContainText('Repository · Developer answer');
  await expect(page.locator('.mentor-answer')).not.toContainText('Use Repository scope');
});

test('notebook pagination and personal-note drafts use the real signed-session endpoints', async ({ page }) => {
  for (let index = 0; index < 21; index++) {
    const response = await page.request.post('/api/notebook/bookmarks', { data: { snapshotId, title: `Notebook page item ${String(index).padStart(2, '0')}`, note: `Note ${index}` } });
    expect(response.ok()).toBeTruthy();
  }
  await page.goto('/'); await navigate(page, 'Notebook');
  await expect(page.locator('.notebook-list li')).toHaveCount(20);
  await page.getByRole('button', { name: 'Load more bookmarks', exact: true }).click();
  await expect(page.locator('.notebook-list li')).toHaveCount(21);
  await expect(page.getByRole('button', { name: 'Load more bookmarks', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Notebook page item 20/ }).click();
  await expect(page.getByRole('region', { name: 'Pinned source references' })).toContainText('No cited source.');
  await page.getByLabel('Saved bookmark note', { exact: true }).fill('An unsaved draft survives navigation.');
  await navigate(page, 'Overview'); await navigate(page, 'Notebook');
  await page.getByRole('button', { name: 'Load more bookmarks', exact: true }).click();
  await page.getByRole('button', { name: /Notebook page item 20/ }).click();
  await expect(page.getByLabel('Saved bookmark note', { exact: true })).toHaveValue('An unsaved draft survives navigation.');
});

test('a newer server answer keeps its real chronology beside an older browser cache', async ({ page }) => {
  await page.goto('/'); await navigate(page, 'Explore');
  await page.getByRole('radio', { name: 'Repository', exact: true }).check();
  await ask(page, 'How does setState update state?');
  const newer = await page.request.post('/api/questions', { data: { snapshotId, question: 'A newer saved question about subscriber identity', scope: 'repository', depth: 'developer' } });
  expect(newer.ok()).toBeTruthy();
  await page.reload();
  await expect(page.locator('.mentor-history-heading')).toContainText('2 questions');
  // The selected older answer is intentional; the Latest action must still use server chronology.
  await page.getByRole('button', { name: 'Return to latest answer', exact: true }).click();
  await expect(page.locator('.mentor-answer h3')).toHaveText('A newer saved question about subscriber identity');
  await page.locator('.mentor-history summary').click();
  await expect(page.locator('.mentor-history li').first()).toContainText('A newer saved question about subscriber identity');
});

test('mobile notebook pins original mitt source and exports conservative same-repository freshness', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const catalog = await (await page.request.get('/api/snapshots')).json();
  const original = catalog.snapshots.find((item: { snapshotId: string }) => item.snapshotId === 'mitt-f9a0b5397edf');
  const against = catalog.snapshots.find((item: { snapshotId: string }) => item.snapshotId === 'mitt-05f4ce67e8f1');
  expect(original).toBeTruthy(); expect(against).toBeTruthy();
  const guides = await (await page.request.get(`/api/guides?snapshotId=${original.snapshotId}`)).json();
  const ids = guides.guides[0].steps.find((step: { evidenceIds: string[] }) => step.evidenceIds.length).evidenceIds;
  const bookmark = await page.request.post('/api/notebook/bookmarks', { data: { snapshotId: original.snapshotId, title: 'Pinned mitt source', note: 'Keep the original callback evidence.', evidenceIds: ids } });
  expect(bookmark.ok()).toBeTruthy();
  await page.request.post('/api/notebook/bookmarks', { data: { snapshotId: original.snapshotId, title: 'Uncited mitt note', note: 'No source claims.' } });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Repository snapshot', exact: true }).selectOption(original.snapshotId);
  await expect(page.locator('.header-commit')).toContainText(original.commitSha.slice(0, 7));
  await navigate(page, 'Notebook');
  await page.getByRole('button', { name: /Pinned mitt source/ }).click();
  await expect(page.locator('.notebook-freshness')).toContainText('Original snapshot');
  const comparison = page.getByRole('combobox', { name: 'Check source freshness against', exact: true });
  await expect(comparison.locator('option')).toHaveCount(2);
  await comparison.selectOption(against.snapshotId);
  await expect(page.locator('.notebook-freshness')).toContainText('Needs review');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Markdown', exact: true }).click();
  const markdown = await fs.readFile((await (await download).path())!, 'utf8');
  expect(markdown).toContain(`needs review against ${against.commitSha}`);
  expect(markdown).toContain(`/blob/${original.commitSha}/`);
  await page.getByRole('button', { name: /Uncited mitt note/ }).click();
  await expect(page.locator('.notebook-freshness')).toContainText('Unassessed · no cited source.');
  await page.getByRole('button', { name: 'New bookmark', exact: true }).click();
  await page.getByLabel('New bookmark title', { exact: true }).fill('Source saved from the interface');
  await page.getByLabel('New bookmark note', { exact: true }).fill('A note about the first walkthrough.');
  await page.getByRole('combobox', { name: 'Pin walkthrough source' }).selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Save bookmark', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Saved bookmark details' }).getByRole('heading', { name: 'Source saved from the interface', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Pinned source references' }).getByRole('button')).toHaveCount(ids.length);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  await page.request.post('/api/session/reset');
  const preserved = await (await page.request.get(`/api/notebook/bookmarks?snapshotId=${original.snapshotId}`)).json();
  expect(preserved.total).toBe(3);
});

test('late signed-session history from an old snapshot cannot replace the new snapshot answers', async ({ page }) => {
  const mitt = 'mitt-f9a0b5397edf';
  await page.request.post('/api/questions', { data: { snapshotId, question: 'Old snapshot saved question', scope: 'repository' } });
  await page.request.post('/api/questions', { data: { snapshotId: mitt, question: 'New mitt saved question', scope: 'repository' } });
  let release!: () => void; let markStarted!: () => void; let markFinished!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  const finished = new Promise<void>(resolve => { markFinished = resolve; });
  await page.route('**/api/questions/history?**', async route => {
    if (new URL(route.request().url()).searchParams.get('snapshotId') !== snapshotId) return route.continue();
    const response = await route.fetch(); markStarted();
    await gate;
    try { await route.fulfill({ response }); } finally { markFinished(); }
  });
  try {
    await page.goto('/?view=explore'); await started;
    await page.getByRole('combobox', { name: 'Repository snapshot', exact: true }).selectOption(mitt);
    await navigate(page, 'Explore');
    await expect(page.locator('.mentor-answer h3')).toHaveText('New mitt saved question');
  } finally { release(); }
  await finished;
  await expect(page.locator('.mentor-answer h3')).toHaveText('New mitt saved question');
  await expect(page.locator('.mentor-history')).not.toContainText('Old snapshot saved question');
  await expect(page.locator('.mentor-history-heading')).toContainText('1 question');
});
