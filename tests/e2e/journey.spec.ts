import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const docs = (filename: string) => path.join(process.cwd(), 'docs', filename);
const source = (page: Page) => page.locator('.source-context');
const answer = (page: Page) => page.locator('.mentor-answer');
const navigation = (page: Page) => page.getByRole('complementary', { name: 'Main navigation' });

async function openOverview(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find your bearings in Zustand.' })).toBeVisible();
  await expect(page.locator('.header-commit')).toContainText('0ea8be2');
}
async function go(page: Page, label: string) {
  if (await page.getByRole('button', { name: 'Open navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await navigation(page).getByRole('button', { name: label, exact: true }).click();
}
async function ask(page: Page, question: string) {
  await page.getByRole('textbox', { name: 'Ask a question about this code' }).fill(question);
  const request = page.waitForRequest(request => request.url().endsWith('/api/questions') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
  const submitted = (await request).postDataJSON();
  await expect(answer(page).getByRole('heading', { name: question, exact: true })).toBeVisible();
  return submitted;
}
async function noPageOverflow(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
}
async function checkpoint(page: Page, title: string) {
  const index = page.locator('.checkpoint-index');
  if ((await index.getAttribute('open')) === null) await index.getByText('All prediction checkpoints', { exact: true }).click();
  await index.getByRole('button', { name: new RegExp(title) }).click();
  await expect(page.locator('.mission-panel h3')).toHaveText(title);
}

test('continuous walkthrough, four predictions, restored feedback, progress and reset', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openOverview(page);
  await page.screenshot({ path: docs('preview.png'), fullPage: true, animations: 'disabled' });
  for (const label of ['Overview', 'Explore', 'Learn', 'My progress']) await expect(navigation(page).getByRole('button', { name: label, exact: true })).toBeAttached();
  await page.getByRole('button', { name: 'Start learning', exact: true }).click();
  await expect(page.locator('.guide-panel h2')).toHaveText('A small store, held in a closure');
  await expect(source(page)).toContainText('Lines 60–64');
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await expect(page.locator('.guide-panel h2')).toHaveText('Predict an unchanged reference');
  await page.getByRole('button', { name: /Make a prediction/ }).click();
  await expect(page.locator('.mission-feedback')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Submit prediction', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Get a hint', exact: true }).click();
  await expect(page.locator('.mission-hint')).toContainText('saved in your session');
  await page.getByLabel('Every subscriber is called with the same object twice.').check();
  await page.getByRole('button', { name: 'Submit prediction', exact: true }).click();
  await expect(page.locator('.mission-feedback')).toContainText('Compare your prediction with the source');
  await page.getByRole('button', { name: /Verify explanation/ }).first().click();
  await expect(source(page)).toContainText('Lines 66–81');
  await page.getByRole('button', { name: 'Make another attempt', exact: true }).click();
  await page.getByLabel('No subscriber is called for this update.').check();
  await page.getByRole('button', { name: 'Submit prediction', exact: true }).click();
  await expect(page.locator('.mission-feedback')).toContainText('Your prediction matches the source');
  await expect(page.locator('.mission-feedback')).toContainText('Attempt 2 · 1 hint request');
  await page.screenshot({ path: docs('preview-prediction.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: /Continue walkthrough/ }).click();
  await expect(page.locator('.guide-panel h2')).toHaveText('Trace the successful update');
  await expect(page.locator('.workspace-flow-context')).toContainText('Step 3 of 5');
  // A solved checkpoint reopens its saved feedback instead of looking unattempted.
  await checkpoint(page, 'Will subscribers hear this?');
  await expect(page.locator('.mission-feedback')).toContainText('Attempt 2 · 1 hint request');
  await expect(page.locator('.mission-feedback')).toContainText('Your prediction matches the source');

  await checkpoint(page, 'Put the update in order');
  for (const index of [3, 2, 4, 3, 4]) await page.getByRole('button', { name: `Move step ${index} up`, exact: true }).click();
  await page.getByRole('button', { name: 'Submit prediction', exact: true }).click();
  await expect(page.locator('.mission-feedback')).toContainText('Your prediction matches the source');
  await checkpoint(page, 'Find the merge decision');
  await page.getByLabel('Start line', { exact: true }).fill('75');
  await page.getByLabel('End line', { exact: true }).fill('78');
  await page.getByRole('button', { name: 'Submit prediction', exact: true }).click();
  await expect(page.locator('.mission-feedback')).toContainText('Your prediction matches the source');
  await checkpoint(page, 'Which snapshot reaches React?');
  await expect(source(page)).toContainText('src/react.ts');
  await page.getByLabel('selector(api.getInitialState())', { exact: true }).check();
  await page.getByRole('button', { name: 'Submit prediction', exact: true }).click();
  await expect(page.locator('.mission-feedback')).toContainText('Your prediction matches the source');
  await go(page, 'My progress');
  await expect(page.locator('.visit-summary')).toContainText('steps visited');
  const stats = page.locator('.results-stats');
  await expect(stats).toContainText('4 / 4');
  await expect(stats.locator('> div').nth(1)).toContainText('3');
  await expect(stats.locator('> div').nth(2)).toContainText('5');
  await expect(stats.locator('> div').nth(3)).toContainText('1');
  await expect(page.getByRole('heading', { name: 'Prepared contribution briefs' })).toBeVisible();
  await expect(page.locator('.contribution-brief')).toHaveCount(2);
  await page.locator('.contribution-brief').first().getByText('Review scope and verification steps', { exact: true }).click();
  await expect(page.locator('.contribution-brief').first()).toContainText('How your results relate to this brief');
  await expect(page.locator('.contribution-brief').first()).toContainText('Hints or retries are recorded here');
  await page.screenshot({ path: docs('preview-results.png'), fullPage: true, animations: 'disabled' });
  const visitsBeforeReset = await page.locator('.visit-summary').textContent();
  await page.getByRole('button', { name: 'Reset this learning session', exact: true }).click();
  await expect(page.locator('.results-reset-copy')).toContainText('Other sessions are unaffected');
  await page.getByRole('button', { name: 'Keep my progress', exact: true }).click();
  await expect(stats).toContainText('4 / 4');
  await page.getByRole('button', { name: 'Reset this learning session', exact: true }).click();
  await page.getByRole('button', { name: 'Clear my session', exact: true }).click();
  await expect(stats).toContainText('0 / 4');
  await expect(page.locator('.visit-summary')).toHaveText(visitsBeforeReset!);
  await go(page, 'Learn');
  await checkpoint(page, 'Will subscribers hear this?');
  await expect(page.locator('.mission-panel h3')).toHaveText('Will subscribers hear this?');
  await expect(page.locator('.mission-feedback')).toHaveCount(0);
  expect(errors).toEqual([]);
  const video = page.video();
  await page.close();
  if (video) await video.saveAs(docs('demo.webm'));
});

test('explicit question scopes preserve answers, original context and history while inspecting citations', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openOverview(page);
  await page.getByRole('button', { name: 'Explore source', exact: true }).click();
  await expect(source(page)).toContainText('src/vanilla.ts');
  await page.getByRole('radio', { name: 'Repository', exact: true }).check();
  const repository = await ask(page, 'How does setState work?');
  expect(repository).toEqual({ question: 'How does setState work?', snapshotId: expect.any(String), depth: 'beginner' });
  await expect(answer(page).locator('.response-label')).toHaveText('Prepared answer');
  await expect(answer(page).locator('.mentor-answer-context')).toContainText('Zustand · whole repository');
  const firstAnswer = await answer(page).locator('.mentor-answer-text').textContent();
  await answer(page).getByRole('button', { name: 'src/vanilla.ts · lines 66–81', exact: true }).click();
  await expect(source(page)).toContainText('Lines 66–81');
  await expect(answer(page).locator('.mentor-answer-text')).toHaveText(firstAnswer!);
  await expect(answer(page).locator('.mentor-answer-context')).toContainText('whole repository');

  await page.getByRole('radio', { name: 'Current file', exact: true }).check();
  const file = await ask(page, 'How do I unsubscribe?');
  expect(file.fileId).toMatch(/^file_/); expect(file).not.toHaveProperty('startLine'); expect(file).not.toHaveProperty('endLine');
  await expect(answer(page).locator('.mentor-answer-context')).toContainText('src/vanilla.ts · whole file');
  // A narrow selection must not borrow the Set declaration from lines60–64.
  await answer(page).getByRole('button', { name: 'src/vanilla.ts · lines 88–92', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Selected lines', exact: true })).toBeEnabled();
  await page.getByRole('radio', { name: 'Selected lines', exact: true }).check();
  await ask(page, 'How do I unsubscribe?');
  await expect(answer(page).locator('.response-label')).toHaveText('Live AI unavailable');
  await expect(answer(page).locator('.mentor-citation')).toHaveCount(0);
  // Use an exactly contained prepared answer to exercise successful line scope.
  await page.getByRole('radio', { name: 'Repository', exact: true }).check();
  await ask(page, 'What happens when I call setState?');
  await answer(page).getByRole('button', { name: 'src/vanilla.ts · lines 66–81', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Selected lines', exact: true })).toBeEnabled();
  await page.getByRole('radio', { name: 'Selected lines', exact: true }).check();
  const selected = await ask(page, 'How does setState update state?');
  expect(selected).toMatchObject({ fileId: file.fileId, startLine: 66, endLine: 81 });
  expect(Object.keys(selected).sort()).toEqual(['depth', 'endLine', 'fileId', 'question', 'snapshotId', 'startLine']);
  await expect(answer(page).locator('.mentor-answer-context')).toContainText('src/vanilla.ts · lines 66–81');
  const selectedAnswer = await answer(page).locator('.mentor-answer-text').textContent();
  await page.locator('.file-list').getByRole('button', { name: 'TS react.ts', exact: true }).click();
  await expect(source(page)).toContainText('src/react.ts');
  await expect(answer(page).locator('.mentor-answer-text')).toHaveText(selectedAnswer!);
  await expect(answer(page).locator('.mentor-answer-context')).toContainText('src/vanilla.ts · lines 66–81');
  await page.getByRole('button', { name: 'Developer', exact: true }).click();
  await expect(answer(page).locator('.mentor-answer-context')).toContainText('Beginner answer');
  await expect(answer(page).getByRole('button', { name: 'Ask again at Developer depth', exact: true })).toBeVisible();
  await page.locator('.mentor-history').getByText('Question history', { exact: true }).click();
  await page.locator('.mentor-history').getByRole('button', { name: /How does setState work/ }).click();
  await expect(answer(page).locator('.mentor-answer-context')).toContainText('whole repository');
  await page.getByRole('button', { name: 'Return to latest answer', exact: true }).click();
  await expect(answer(page).locator('.mentor-answer-context')).toContainText('src/vanilla.ts · lines 66–81');
  await go(page, 'Overview'); await go(page, 'Explore');
  await expect(answer(page).locator('.mentor-answer-text')).toHaveText(selectedAnswer!);
  expect(await page.locator('.mentor-slot').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect(page.locator('.source-panel')).toBeInViewport({ ratio: 0.6 });
  // Close the history list for a readable evidence-inspection preview.
  const historyDetails = page.locator('.mentor-history details');
  if ((await historyDetails.getAttribute('open')) !== null) await page.locator('.mentor-history').getByText('Question history', { exact: true }).click();
  await answer(page).getByRole('button', { name: 'src/vanilla.ts · lines 66–81', exact: true }).click();
  await expect(source(page)).toContainText('Lines 66–81');
  await expect(answer(page).locator('.mentor-answer-text')).toHaveText(selectedAnswer!);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: docs('preview-desktop.png'), fullPage: false, animations: 'disabled' });
  // A clear selection disables its scope and names the actual fallback.
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Selected lines', exact: true })).toBeDisabled();
  await page.getByRole('radio', { name: 'Repository', exact: true }).check();
  await ask(page, 'Explain Kubernetes deployment authentication security.');
  await expect(answer(page).locator('.response-label')).toHaveText('Evidence gap');
  await expect(answer(page).locator('.mentor-citation')).toHaveCount(0);
  await page.route('**/api/questions', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'TEST_UNAVAILABLE', message: 'Temporary test failure.' } }) }), { times: 1 });
  await page.getByRole('textbox', { name: 'Ask a question about this code' }).fill('Keep my draft after a failure');
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
  await expect(page.locator('.mentor-error')).toContainText('Temporary test failure');
  await expect(page.getByRole('textbox', { name: 'Ask a question about this code' })).toHaveValue('Keep my draft after a failure');
  expect(errors).toEqual([]);
});

test('source context, keyboard panel controls and snapshot preferences survive navigation and reload', async ({ page }) => {
  await openOverview(page);
  await page.getByRole('button', { name: 'Explore source', exact: true }).click();
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await page.getByRole('button', { name: 'Module map', exact: true }).click();
  await expect(page.locator('.map-note')).toContainText('static imports, not runtime execution');
  await page.locator('.react-flow__node').filter({ hasText: /^src\/react\.ts$/ }).click();
  await expect(source(page)).toContainText('src/react.ts');
  await page.getByRole('radio', { name: 'Current file', exact: true }).check();
  await ask(page, 'How does useStore use a selector?');
  await answer(page).getByRole('button', { name: 'src/react.ts · lines 16–37', exact: true }).click();
  await expect(source(page)).toContainText('Lines 16–37');
  const divider = page.getByRole('separator', { name: 'Resize files panel', exact: true });
  const before = Number(await divider.getAttribute('aria-valuenow'));
  await divider.focus(); await page.keyboard.press('ArrowRight');
  await expect(divider).toHaveAttribute('aria-valuenow', String(before + 20));
  const mentorDivider = page.getByRole('separator', { name: 'Resize mentor panel', exact: true });
  await mentorDivider.focus(); await page.keyboard.press('Home');
  await expect(mentorDivider).toHaveAttribute('aria-valuenow', '300');
  await page.getByRole('button', { name: 'Focus editor', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exit focus', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('separator')).toHaveCount(0);
  await expect(page.locator('.mentor-slot')).toBeHidden();
  await expect(source(page)).toContainText('Lines 16–37');
  await page.getByRole('button', { name: 'Exit focus', exact: true }).click();
  await page.getByRole('button', { name: 'Focus editor', exact: true }).click();
  await page.getByRole('button', { name: 'Show mentor panel', exact: true }).click();
  await expect(page.locator('.mentor-slot')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Focus editor', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Focus editor', exact: true }).click();
  await page.getByRole('button', { name: 'Show files panel', exact: true }).click();
  await expect(page.locator('.files-slot')).toBeVisible();
  await page.getByRole('button', { name: 'Hide files panel', exact: true }).click();
  await expect(page.locator('.files-slot')).toBeHidden();
  await page.getByRole('button', { name: 'Show files panel', exact: true }).click();
  await page.getByRole('button', { name: 'Hide mentor panel', exact: true }).click();
  await expect(page.locator('.mentor-slot')).toBeHidden();
  await page.getByRole('button', { name: 'Show mentor panel', exact: true }).click();
  await go(page, 'Overview'); await go(page, 'Explore');
  await expect(source(page)).toContainText('src/react.ts'); await expect(source(page)).toContainText('Lines 16–37');
  await page.reload();
  await expect(source(page)).toContainText('src/react.ts'); await expect(source(page)).toContainText('Lines 16–37');
  await expect(answer(page).locator('.mentor-answer-context')).toContainText('src/react.ts · whole file');
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await expect(source(page)).toContainText('64 lines');
  await expect(page.getByRole('radio', { name: 'Selected lines', exact: true })).toBeDisabled();
  await noPageOverflow(page, 1440);
  // Invalid/stale browser state is discarded rather than indexing absent files/steps.
  const repo = await (await page.request.get('/api/repository')).json();
  await page.evaluate(snapshotId => {
    localStorage.setItem('astrolabe:workspace:' + snapshotId, JSON.stringify({ view: 'learn', fileId: 'removed', guideId: 'removed', stepIndex: 999, range: { startLine: -5, endLine: 9999 }, visited: ['removed:step'] }));
    localStorage.setItem('astrolabe:preferences', '{broken');
  }, repo.snapshot.snapshotId);
  await page.goto('/');
  await expect(page.locator('.guide-panel h2')).toHaveText('A small store, held in a closure');
  await expect(source(page)).toContainText('src/vanilla.ts');
  await expect(source(page)).toContainText('100 lines');
});

test('1280px laptop workspace keeps three readable panels and keyboard navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openOverview(page);
  await page.getByRole('button', { name: 'Explore source', exact: true }).click();
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await expect(page.locator('.files-slot')).toBeVisible(); await expect(page.locator('.mentor-slot')).toBeVisible();
  const code = await page.locator('.source-panel').boundingBox(); expect(code!.width).toBeGreaterThanOrEqual(350);
  await page.getByRole('button', { name: 'Expand navigation', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Collapse navigation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse navigation', exact: true }).click();
  await expect.poll(async () => Math.round((await navigation(page).boundingBox())!.width)).toBe(68);
  const rail = await navigation(page).boundingBox();
  const files = await page.locator('.files-slot').boundingBox();
  const mentor = await page.locator('.mentor-slot').boundingBox();
  const editor = await page.locator('.source-panel').boundingBox();
  expect(files!.x).toBeGreaterThanOrEqual(rail!.x + rail!.width);
  expect(editor!.x + editor!.width).toBeLessThanOrEqual(mentor!.x + 1);
  await noPageOverflow(page, 1280);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: docs('preview-laptop.png'), fullPage: false, animations: 'disabled' });
});

test('390px Files, Code and Mentor tabs preserve source, answers and checkpoint continuity', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openOverview(page); await noPageOverflow(page, 390);
  await page.screenshot({ path: docs('preview-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Explore source', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Code', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Code', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Mentor', exact: true })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Mentor', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'Files', exact: true })).toBeFocused();
  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  await page.locator('.file-list').getByRole('button', { name: 'TS react.ts', exact: true }).click();
  await page.getByRole('tab', { name: 'Code', exact: true }).click();
  await expect(source(page)).toContainText('src/react.ts');
  await page.getByRole('tab', { name: 'Mentor', exact: true }).click();
  await page.getByRole('radio', { name: 'Current file', exact: true }).check();
  await ask(page, 'How does useStore use a selector?');
  await answer(page).getByRole('button', { name: 'src/react.ts · lines 16–37', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Code', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(source(page)).toContainText('Lines 16–37');
  await page.getByRole('tab', { name: 'Mentor', exact: true }).click();
  await expect(answer(page).locator('.response-label')).toHaveText('Prepared answer');
  await noPageOverflow(page, 390);
  await page.screenshot({ path: docs('preview-mobile-workspace.png'), fullPage: true, animations: 'disabled' });
  await go(page, 'Learn');
  await page.getByRole('tab', { name: 'Mentor', exact: true }).click();
  await expect(page.locator('.guide-panel h2')).toHaveText('A small store, held in a closure');
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await page.getByRole('button', { name: /Make a prediction/ }).click();
  await page.getByLabel('No subscriber is called for this update.').check();
  await page.getByRole('button', { name: 'Submit prediction', exact: true }).click();
  await expect(page.locator('.mission-feedback')).toContainText('Your prediction matches the source');
  await page.getByRole('button', { name: /Verify explanation/ }).first().click();
  await expect(source(page)).toContainText('Lines 66–81');
  await page.getByRole('tab', { name: 'Checkpoint & mentor', exact: true }).click();
  await expect(page.locator('.mission-feedback')).toContainText('Attempt 1');
  await page.screenshot({ path: docs('preview-mobile-prediction.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: /Continue walkthrough/ }).click();
  await expect(page.locator('.guide-panel h2')).toHaveText('Trace the successful update');
  await noPageOverflow(page, 390);
});

test('prepared learning and local Monaco work when all external requests are blocked', async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort('blockedbyclient');
  });
  await openOverview(page);
  await page.getByRole('button', { name: 'Start learning', exact: true }).click();
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await expect(source(page)).toContainText('Lines 60–64');
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await page.getByRole('button', { name: /Make a prediction/ }).click();
  await page.getByLabel('No subscriber is called for this update.').check();
  await page.getByRole('button', { name: 'Submit prediction', exact: true }).click();
  await expect(page.locator('.mission-feedback')).toContainText('Your prediction matches the source');
  await page.getByRole('radio', { name: 'Repository', exact: true }).check();
  await ask(page, 'How does setState work?');
  await expect(answer(page).locator('.response-label')).toHaveText('Prepared answer');
  await answer(page).getByRole('button', { name: 'src/vanilla.ts · lines 66–81', exact: true }).click();
  await expect(answer(page).locator('.response-label')).toHaveText('Prepared answer');
});

test('fresh browser sessions cannot see or reset one another’s attempts', async ({ browser }) => {
  const a = await browser.newContext(); const b = await browser.newContext();
  try {
    const data = await (await a.request.get('/api/guides')).json(); const task = data.tasks[0];
    await a.request.get('/api/results'); await b.request.get('/api/results');
    await a.request.post(`/api/tasks/${task.id}/attempt`, { data: { snapshotId: task.snapshotId, answer: 'skip' } });
    expect(await (await a.request.get('/api/results')).json()).toMatchObject({ totalAttempts: 1, completed: 1 });
    expect(await (await b.request.get('/api/results')).json()).toMatchObject({ totalAttempts: 0, completed: 0 });
    await b.request.post('/api/session/reset');
    expect(await (await a.request.get('/api/tasks/same-reference/progress')).json()).toMatchObject({ feedback: { correct: true }, hintsUsed: 0 });
    expect(await (await a.request.get('/api/results')).json()).toMatchObject({ totalAttempts: 1 });
    expect((await a.request.post(`/api/tasks/${task.id}/attempt`, { data: { snapshotId: 'wrong', answer: 'skip' } })).status()).toBe(409);
  } finally { await a.close(); await b.close(); }
});
