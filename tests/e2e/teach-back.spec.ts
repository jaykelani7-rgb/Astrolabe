import { expect, test, type Page } from '@playwright/test';

async function openCheckpoint(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start learning', exact: true }).click();
  if (await page.getByRole('tab', { name: 'Mentor', exact: true }).isVisible()) await page.getByRole('tab', { name: 'Mentor', exact: true }).click();
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await page.getByRole('button', { name: /Make a prediction/ }).click();
  await page.getByLabel('No subscriber is called for this update.').check();
  await page.getByRole('button', { name: 'Submit prediction', exact: true }).click();
  await expect(page.locator('.mission-feedback')).toContainText('Your prediction matches the source');
}

for (const width of [1440, 390]) test(`teach-back saves, reviews, follows source and resumes at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openCheckpoint(page);
  const panel = page.getByRole('region', { name: 'Explain in your own words' });
  const explanation = 'Returning the same state object makes Object.is true, so the guarded assignment and listener loop do not run.';
  const save = panel.getByRole('button', { name: 'Save explanation and review concepts' });
  await expect(save).toBeDisabled();
  await panel.getByRole('textbox', { name: 'Your explanation', exact: true }).fill(explanation);
  // A failed save keeps the draft so the learner can retry.
  await page.route('**/api/teach-back', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Temporary explanation failure.' } }) }), { times: 1 });
  await save.click();
  await expect(panel.getByRole('alert')).toContainText('Temporary explanation failure');
  await expect(panel.getByRole('textbox', { name: 'Your explanation', exact: true })).toHaveValue(explanation);
  await save.click();
  await expect(panel.locator('.teach-back-saved')).toContainText(explanation);
  await expect(panel.getByRole('button', { name: 'Save self-review', exact: true })).toBeDisabled();
  await panel.getByRole('group').nth(0).getByLabel('I can explain this', { exact: true }).check();
  await panel.getByRole('group').nth(1).getByLabel('I am unsure', { exact: true }).check();
  await panel.getByRole('button', { name: 'Save self-review', exact: true }).click();
  await expect(panel.locator('.teach-back-follow-ups')).toContainText('not independently verified mastery');
  await expect(panel.locator('.teach-back-follow-ups article')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Check concept source 1 ↗', exact: true }).click();
  await expect(page.locator('.source-context')).toContainText('Lines 66–81');
  if (width === 390) await page.getByRole('tab', { name: 'Checkpoint & mentor', exact: true }).click();
  await page.reload();
  if (width === 390 && await page.getByRole('tab', { name: 'Checkpoint & mentor', exact: true }).isVisible()) await page.getByRole('tab', { name: 'Checkpoint & mentor', exact: true }).click();
  await expect(panel.locator('.teach-back-saved')).toContainText(explanation);
  await expect(panel.getByRole('group').nth(1).getByLabel('I am unsure', { exact: true })).toBeChecked();
  await panel.getByRole('button', { name: 'Practice this concept', exact: false }).click();
  await expect(page.locator('.mission-panel h3')).toHaveText('Put the update in order');
  await page.getByRole('button', { name: 'Submit prediction', exact: true }).click();
  await expect(panel).toContainText('no prepared teach-back rubric yet');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  expect(errors).toEqual([]);
});

test('late teach-back save cannot replace another checkpoint; session reset removes explanations', async ({ page }) => {
  await openCheckpoint(page);
  const panel = page.getByRole('region', { name: 'Explain in your own words' });
  await panel.getByRole('textbox', { name: 'Your explanation', exact: true }).fill('The identity guard prevents listener notification for an unchanged reference.');
  let release!: () => void;
  let intercepted!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { intercepted = resolve; });
  await page.route('**/api/teach-back', async route => {
    const response = await route.fetch();
    intercepted();
    await gate;
    await route.fulfill({ response });
  }, { times: 1 });
  await panel.getByRole('button', { name: 'Save explanation and review concepts' }).click();
  await started;
  await page.getByRole('button', { name: /Continue walkthrough/ }).click();
  release();
  await expect(page.locator('.guide-panel h2')).toHaveText('Trace the successful update');
  await expect(panel).toHaveCount(0);
  await page.getByRole('complementary', { name: 'Main navigation' }).getByRole('button', { name: 'My progress', exact: true }).click();
  await page.getByRole('button', { name: 'Reset this learning session', exact: true }).click();
  await page.getByRole('button', { name: 'Clear my session', exact: true }).click();
  await expect(page.locator('.results-stats')).toContainText('0 / 4');
  const guides = await (await page.request.get('/api/guides')).json();
  const task = guides.tasks.find((entry: { id: string }) => entry.id === 'same-reference');
  const response = await page.request.get(`/api/teach-back?${new URLSearchParams({ taskId: task.id, snapshotId: task.snapshotId, contentVersion: task.contentVersion })}`);
  expect(await response.json()).toMatchObject({ submission: null });
});

test('load and review failures recover; revised explanations and same-task practice remain usable', async ({ page }) => {
  await page.route('**/api/teach-back?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Cannot load explanation yet.' } }) }), { times: 1 });
  await openCheckpoint(page);
  const panel = page.getByRole('region', { name: 'Explain in your own words' });
  await expect(panel.getByRole('alert')).toContainText('Cannot load explanation yet');
  await panel.getByRole('button', { name: 'Reload explanation' }).click();
  await panel.getByRole('textbox', { name: 'Your explanation', exact: true }).fill('The listener loop is guarded by the identity comparison.');
  await panel.getByRole('button', { name: 'Save explanation and review concepts' }).click();
  await panel.getByRole('group').nth(0).getByLabel('Missing from my explanation', { exact: true }).check();
  await panel.getByRole('group').nth(1).getByLabel('I can explain this', { exact: true }).check();
  await page.route('**/api/teach-back/review', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Review save failed.' } }) }), { times: 1 });
  await panel.getByRole('button', { name: 'Save self-review', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Review save failed');
  await expect(panel.getByRole('group').nth(0).getByLabel('Missing from my explanation', { exact: true })).toBeChecked();
  await panel.getByRole('button', { name: 'Save self-review', exact: true }).click();
  await panel.getByRole('button', { name: 'Practice this concept', exact: false }).click();
  await expect(page.locator('.mission-panel h3')).toHaveText('Will subscribers hear this?');
  await expect(page.getByRole('button', { name: 'Submit prediction', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Submit prediction', exact: true }).click();
  await expect(panel.locator('.teach-back-saved')).toContainText('listener loop');
  await panel.getByRole('button', { name: 'Revise my explanation', exact: true }).click();
  const revised = 'Object.is compares the returned object with the current state. An unchanged reference skips assignment and listener notification.';
  await panel.getByRole('textbox', { name: 'Your explanation', exact: true }).fill(revised);
  await panel.getByRole('button', { name: 'Save explanation and review concepts' }).click();
  await expect(panel.locator('.teach-back-saved')).toContainText(revised);
  await expect(panel.getByRole('group')).toHaveCount(2);
  await expect(panel.locator('.teach-back-follow-ups')).toHaveCount(0);
  for (const group of await panel.getByRole('group').all()) await group.getByLabel('I can explain this', { exact: true }).check();
  await panel.getByRole('button', { name: 'Save self-review', exact: true }).click();
  await expect(panel.locator('.teach-back-follow-ups')).toContainText('Ask a peer');
  await expect(panel.locator('.teach-back-follow-ups article')).toHaveCount(0);
  await page.reload();
  await expect(panel.locator('.teach-back-saved')).toHaveText(`Your saved explanation${revised}`);
});
