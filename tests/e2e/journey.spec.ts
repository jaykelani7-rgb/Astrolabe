import { expect, test } from '@playwright/test';

test('prepared source-to-prediction journey, four rubrics, evidence, Q&A, results, and reset', async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Big codebase/ })).toBeVisible();
  await expect(page.locator('.repo-meta')).toContainText('0ea8be2');
  await page.screenshot({ path: testInfo.outputPath('overview.png'), fullPage: true });
  await page.getByRole('button', { name: 'Explore repository', exact: true }).last().click();
  await expect(page.getByTestId('source-viewer')).toBeVisible();
  await expect(page.locator('.source-breadcrumb')).toContainText('src/vanilla.ts');
  await page.getByRole('button', { name: 'Module map', exact: true }).click();
  await expect(page.getByText('Static imports only; this map does not show runtime execution.')).toBeVisible();
  await page.locator('.react-flow__node').filter({ hasText: /^src\/react\.ts$/ }).click();
  await expect(page.locator('.source-breadcrumb')).toContainText('src/react.ts');

  // Every first evidence target is exercised through both walkthroughs and both depths.
  const learning = await (await page.request.get('/api/guides')).json();
  await page.getByRole('button', { name: 'Walkthroughs', exact: true }).click();
  for (const guide of learning.guides) {
    await page.locator('.guide-selector').getByRole('button', { name: new RegExp(guide.title) }).click();
    for (const step of guide.steps) {
      await page.locator('.guide-step-list').getByRole('button', { name: new RegExp(step.title) }).click();
      await expect(page.locator('.guide-panel h2')).toHaveText(step.title);
      const evidence = await (await page.request.get(`/api/evidence/${step.evidenceIds[0]}`)).json();
      await expect(page.locator('.source-breadcrumb')).toContainText(`Lines ${evidence.startLine}–${evidence.endLine}`);
      await page.getByRole('button', { name: 'Developer', exact: true }).click();
      await expect(page.locator('.guide-explanation')).toHaveText(step.developer);
      await expect(page.locator('.source-breadcrumb')).toContainText(`Lines ${evidence.startLine}–${evidence.endLine}`);
      await page.getByRole('button', { name: 'Beginner', exact: true }).click();
      await expect(page.locator('.guide-explanation')).toHaveText(step.beginner);
    }
  }

  await page.getByRole('button', { name: /Prediction tasks/, exact: false }).click();
  await expect(page.locator('.mission-panel h3')).toHaveText('Will subscribers hear this?');
  await expect(page.locator('.mission-feedback')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Submit prediction', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Get a hint', exact: true }).click();
  await expect(page.locator('.mission-hint')).toContainText('recorded in your results');
  await page.getByLabel('Every subscriber is called with the same object twice.').check();
  await page.getByRole('button', { name: 'Submit prediction', exact: true }).click();
  await expect(page.locator('.mission-feedback')).toContainText('A useful place to look again');
  await page.getByRole('button', { name: 'Verify explanation', exact: false }).first().click();
  await expect(page.locator('.source-breadcrumb')).toContainText('Lines 66–81');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByLabel('No subscriber is called for this update.').check();
  await page.getByRole('button', { name: 'Submit prediction', exact: true }).click();
  await expect(page.locator('.mission-feedback')).toContainText('Prediction confirmed');

  await page.screenshot({ path: testInfo.outputPath('prediction.png'), fullPage: true });
  await expect(page.locator('.mission-feedback')).toContainText('Attempt 2 · 1 hint request');

  await page.locator('.task-selector').getByRole('button', { name: /Put the update in order/ }).click();
  for (const index of [3, 2, 4, 3, 4]) await page.getByRole('button', { name: `Move step ${index} up`, exact: true }).click();
  await page.getByRole('button', { name: 'Submit prediction', exact: true }).click();
  await expect(page.locator('.mission-feedback')).toContainText('Prediction confirmed');

  await page.locator('.task-selector').getByRole('button', { name: /Find the merge decision/ }).click();
  await page.getByLabel('Start line', { exact: true }).fill('75');
  await page.getByLabel('End line', { exact: true }).fill('78');
  await page.getByRole('button', { name: 'Submit prediction', exact: true }).click();
  await expect(page.locator('.mission-feedback')).toContainText('Prediction confirmed');

  await page.locator('.task-selector').getByRole('button', { name: /Which snapshot reaches React/ }).click();
  await page.getByLabel('selector(api.getInitialState())', { exact: true }).check();
  await page.getByRole('button', { name: 'Submit prediction', exact: true }).click();
  await expect(page.locator('.mission-feedback')).toContainText('Prediction confirmed');

  // Prepared answers are explicitly labeled; a domain with no source support produces a gap.
  await page.locator('.file-list').getByRole('button', { name: 'TS vanilla.ts', exact: true }).click();
  await page.getByRole('textbox', { name: 'Ask a question about this code' }).fill('How does setState work?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.locator('.response-label')).toHaveText('Reviewed answer');
  await page.locator('.qa-response').getByRole('button', { name: /View source/ }).click();
  await expect(page.locator('.source-breadcrumb')).toContainText('Lines 66–81');
  // Regression: evidence metadata must never be spread into the strict question body.
  await page.getByRole('textbox', { name: 'Ask a question about this code' }).fill('How does setState work?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.locator('.response-label')).toHaveText('Reviewed answer');
  // Remove the selected range so unsupported retrieval is assessed without a forced context chunk.
  await page.locator('.file-list').getByRole('button', { name: 'TS vanilla.ts', exact: true }).click();
  await expect(page.locator('.source-breadcrumb')).toContainText('100 lines');
  await page.getByRole('textbox', { name: 'Ask a question about this code' }).fill('How does this repository implement a PostgreSQL migration engine?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.locator('.response-label')).toHaveText('Evidence gap');
  await expect(page.locator('.qa-response .evidence-link')).toHaveCount(0);

  await page.getByRole('button', { name: 'Your progress', exact: true }).click();
  const stats = page.locator('.results-stats');
  await expect(stats).toContainText('4 / 4');
  await expect(stats.locator('> div').nth(1)).toContainText('3');
  await expect(stats.locator('> div').nth(2)).toContainText('5');
  await expect(stats.locator('> div').nth(3)).toContainText('1');
  await expect(page.locator('.results-topics')).toContainText('Identity and notifications');
  await expect(page.locator('.contribution-brief')).toHaveCount(2);
  await page.locator('.contribution-brief').first().getByText('Read the scoped brief').click();
  await expect(page.locator('.contribution-brief').first()).toContainText('Verify your explanation');
  await page.screenshot({ path: testInfo.outputPath('results.png'), fullPage: true });
  await page.getByRole('button', { name: 'Reset this learning session', exact: true }).click();
  await page.getByRole('button', { name: 'Clear my session', exact: true }).click();
  await expect(stats).toContainText('0 / 4');
  await expect(stats.locator('> div').nth(2)).toContainText('0');
  expect(browserErrors).toEqual([]);
});

test('prepared content and the local Monaco editor work with external network blocked', async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    return route.abort('blockedbyclient');
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Big codebase/ })).toBeVisible();
  await page.getByRole('button', { name: 'Explore repository', exact: true }).last().click();
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await page.getByRole('button', { name: 'Walkthroughs', exact: true }).click();
  await page.locator('.guide-selector').getByRole('button').first().click();
  await expect(page.locator('.guide-panel h2')).toHaveText('A small store, held in a closure');
  await expect(page.locator('.source-breadcrumb')).toContainText('Lines 60–64');
  await page.getByRole('button', { name: /Prediction tasks/ }).click();
  await page.getByLabel('No subscriber is called for this update.').check();
  await page.getByRole('button', { name: 'Submit prediction', exact: true }).click();
  await expect(page.locator('.mission-feedback')).toContainText('Prediction confirmed');
  await page.getByRole('button', { name: 'Verify explanation', exact: false }).first().click();
  await expect(page.locator('.source-breadcrumb')).toContainText('Lines 66–81');
});

test('390px layout supports explorer and predictions without page overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Big codebase/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile-overview.png'), fullPage: true });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Explore repository', exact: true }).click();
  await expect(page.getByTestId('source-viewer')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: /Prediction tasks/ }).click();
  await expect(page.locator('.mission-panel h3')).toHaveText('Will subscribers hear this?');
  await page.getByLabel('No subscriber is called for this update.').check();
  await page.getByRole('button', { name: 'Submit prediction', exact: true }).click();
  await expect(page.locator('.mission-feedback')).toContainText('Prediction confirmed');
  await page.screenshot({ path: testInfo.outputPath('mobile-prediction.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test('fresh browser sessions cannot see or reset one another’s attempts', async ({ browser }) => {
  const a = await browser.newContext(); const b = await browser.newContext();
  try {
    const data = await (await a.request.get('/api/guides')).json();
    const task = data.tasks[0];
    await a.request.get('/api/results'); await b.request.get('/api/results');
    await a.request.post(`/api/tasks/${task.id}/attempt`, { data: { snapshotId: task.snapshotId, answer: 'skip' } });
    expect(await (await a.request.get('/api/results')).json()).toMatchObject({ totalAttempts: 1, completed: 1 });
    expect(await (await b.request.get('/api/results')).json()).toMatchObject({ totalAttempts: 0, completed: 0 });
    await b.request.post('/api/session/reset');
    expect(await (await a.request.get('/api/results')).json()).toMatchObject({ totalAttempts: 1 });
    const rejected = await a.request.post(`/api/tasks/${task.id}/attempt`, { data: { snapshotId: 'wrong', answer: 'skip' } });
    expect(rejected.status()).toBe(409);
  } finally { await a.close(); await b.close(); }
});
