import { expect, test, type Page } from '@playwright/test';

async function openCheckpoint(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start learning', exact: true }).click();
  if (page.viewportSize()!.width <= 1100) {
    const mentorTab = page.getByRole('tab', { name: 'Mentor', exact: true });
    await expect(mentorTab).toBeVisible();
    await mentorTab.click();
  }
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
  // Verify stored data separately from which responsive panel is currently shown.
  const guides = await (await page.request.get('/api/guides')).json();
  const task = guides.tasks.find((entry: { id: string }) => entry.id === 'same-reference');
  const saved = await (await page.request.get(`/api/teach-back?${new URLSearchParams({ taskId: task.id, snapshotId: task.snapshotId, contentVersion: task.contentVersion })}`)).json();
  expect(saved.submission.text).toBe(explanation);
  expect(saved.submission.concepts.map((concept: { state: string }) => concept.state)).toEqual(['understood', 'uncertain']);
  await panel.getByRole('button', { name: 'Check concept source 1 ↗', exact: true }).click();
  await expect(page.locator('.source-context')).toContainText('Lines 66–81');
  if (width === 390) await page.getByRole('tab', { name: 'Checkpoint & mentor', exact: true }).click();
  await page.reload();
  if (width === 390) {
    const checkpointTab = page.getByRole('tab', { name: 'Checkpoint & mentor', exact: true });
    await expect(checkpointTab).toBeVisible();
    await expect(checkpointTab).toHaveAttribute('aria-selected', 'true');
    await checkpointTab.click();
    await expect(checkpointTab).toHaveAttribute('aria-selected', 'true');
  }
  await expect(page.locator('.mission-panel')).toHaveAttribute('data-checkpoint-state', 'ready');
  await expect(panel).toHaveAttribute('data-teach-back-state', 'saved');
  await expect(panel.locator('.teach-back-saved')).toHaveText(`Your saved explanation${explanation}`);
  await expect(panel.getByRole('group').nth(0).getByLabel('I can explain this', { exact: true })).toBeChecked();
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
  // Keep this simulated outage active through restoration, including aborted development mounts.
  await page.route('**/api/teach-back?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Cannot load explanation yet.' } }) }));
  await openCheckpoint(page);
  const panel = page.getByRole('region', { name: 'Explain in your own words' });
  await expect(panel.getByRole('alert')).toContainText('Cannot load explanation yet');
  await page.unroute('**/api/teach-back?*');
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

test('range bounds use returned source metadata and mitt practice sends the returned content version', async ({ page }) => {
  const repo = await (await page.request.get('/api/repository')).json();
  const snapshotId = repo.snapshot.snapshotId;
  const learning = await (await page.request.get(`/api/guides?snapshotId=${snapshotId}`)).json();
  const rangeTask = learning.tasks.find((entry: { type: string }) => entry.type === 'range');
  const evidence = await (await page.request.get(`/api/evidence/${rangeTask.contextEvidenceIds[0]}?snapshotId=${snapshotId}`)).json();
  const source = repo.files.find((file: { fileId: string }) => file.fileId === evidence.fileId);
  await page.goto(`/?snapshot=${snapshotId}&view=learn`);
  await page.locator('.checkpoint-index summary').click();
  await page.locator('.checkpoint-index').getByRole('button', { name: new RegExp(rangeTask.title) }).click();
  await expect(page.locator('.mission-panel h3')).toHaveText(rangeTask.title);
  await expect(page.locator('.mission-range')).toContainText(`${source.path} (1–${source.lineCount})`);
  await expect(page.getByRole('spinbutton', { name: 'Start line', exact: true })).toHaveAttribute('max', String(source.lineCount));
  await expect(page.getByRole('spinbutton', { name: 'End line', exact: true })).toHaveAttribute('max', String(source.lineCount));
  await page.getByRole('spinbutton', { name: 'Start line', exact: true }).fill('1');
  await page.getByRole('spinbutton', { name: 'End line', exact: true }).fill(String(source.lineCount + 1));
  await expect(page.getByRole('button', { name: 'Submit prediction', exact: true })).toBeDisabled();
  await page.getByRole('spinbutton', { name: 'End line', exact: true }).fill(String(source.lineCount));
  await expect(page.getByRole('button', { name: 'Submit prediction', exact: true })).toBeEnabled();

  const snapshots = (await (await page.request.get('/api/snapshots')).json()).snapshots;
  const mitt = snapshots.find((entry: { snapshotId: string }) => entry.snapshotId === 'mitt-f9a0b5397edf');
  const otherMitt = snapshots.find((entry: { snapshotId: string }) => entry.snapshotId === 'mitt-05f4ce67e8f1');
  const mittLearning = await (await page.request.get(`/api/guides?snapshotId=${mitt.snapshotId}`)).json();
  const task = mittLearning.tasks[0];
  await page.getByRole('combobox', { name: 'Repository snapshot', exact: true }).selectOption(mitt.snapshotId);
  await page.getByRole('button', { name: 'Start learning', exact: true }).click();
  await page.locator('.checkpoint-index summary').click();
  const progressRequest = page.waitForRequest(request => request.url().includes(`/api/tasks/${task.id}/progress?`));
  await page.locator('.checkpoint-index').getByRole('button', { name: new RegExp(task.title) }).click();
  const progressUrl = new URL((await progressRequest).url());
  expect(progressUrl.searchParams.get('snapshotId')).toBe(mitt.snapshotId);
  expect(progressUrl.searchParams.get('contentVersion')).toBe(task.contentVersion);
  await expect(page.locator('.mission-panel h3')).toHaveText(task.title);
  const hintRequest = page.waitForRequest(request => request.url().includes(`/api/tasks/${task.id}/hint?`));
  await page.getByRole('button', { name: 'Get a hint', exact: true }).click();
  const hintUrl = new URL((await hintRequest).url());
  expect(hintUrl.searchParams.get('snapshotId')).toBe(mitt.snapshotId);
  expect(hintUrl.searchParams.get('contentVersion')).toBe(task.contentVersion);
  await page.getByLabel(task.choices[0].label, { exact: true }).check();
  const attemptRequest = page.waitForRequest(request => request.url().endsWith(`/api/tasks/${task.id}/attempt`));
  await page.getByRole('button', { name: 'Submit prediction', exact: true }).click();
  expect((await attemptRequest).postDataJSON()).toEqual({ snapshotId: mitt.snapshotId, contentVersion: task.contentVersion, answer: task.choices[0].id });
  await expect(page.locator('.mission-feedback')).toContainText('Your prediction matches the source');
  const versioned = new URLSearchParams({ snapshotId: mitt.snapshotId, contentVersion: task.contentVersion });
  const restored = await (await page.request.get(`/api/tasks/${task.id}/progress?${versioned}`)).json();
  expect(restored).toMatchObject({ snapshotId: mitt.snapshotId, contentVersion: task.contentVersion, feedback: { submittedAnswer: task.choices[0].id }, hintsUsed: 1 });
  const otherProgress = await (await page.request.get(`/api/tasks/${task.id}/progress?snapshotId=${otherMitt.snapshotId}`)).json();
  expect(otherProgress).toMatchObject({ feedback: null, hintsUsed: 0 });
});

test('late checkpoint progress and attempt responses cannot replace a newly opened task', async ({ page }) => {
  const snapshotId = 'mitt-f9a0b5397edf';
  const learning = await (await page.request.get(`/api/guides?snapshotId=${snapshotId}`)).json();
  const [firstTask, secondTask] = learning.tasks;
  await page.goto(`/?snapshot=${snapshotId}&view=learn`);
  await page.locator('.checkpoint-index summary').click();
  let releaseProgress!: () => void;
  let interceptedProgress!: () => void;
  let deliveredProgress!: () => void;
  const progressGate = new Promise<void>(resolve => { releaseProgress = resolve; });
  const progressStarted = new Promise<void>(resolve => { interceptedProgress = resolve; });
  const progressDelivered = new Promise<void>(resolve => { deliveredProgress = resolve; });
  await page.route(`**/api/tasks/${firstTask.id}/progress?*`, async route => {
    const response = await route.fetch();
    interceptedProgress(); await progressGate; await route.fulfill({ response }); deliveredProgress();
  });
  await page.locator('.checkpoint-index').getByRole('button', { name: new RegExp(firstTask.title) }).click();
  await progressStarted;
  await page.locator('.checkpoint-index').getByRole('button', { name: new RegExp(secondTask.title) }).click();
  await expect(page.locator('.mission-panel h3')).toHaveText(secondTask.title);
  releaseProgress();
  await progressDelivered;
  await page.unroute(`**/api/tasks/${firstTask.id}/progress?*`);
  await expect(page.locator('.mission-panel h3')).toHaveText(secondTask.title);
  await expect(page.locator('.mission-panel')).toHaveAttribute('data-content-version', secondTask.contentVersion);
  await page.getByLabel(secondTask.choices[0].label, { exact: true }).check();
  let releaseAttempt!: () => void;
  let interceptedAttempt!: () => void;
  let deliveredAttempt!: () => void;
  const attemptGate = new Promise<void>(resolve => { releaseAttempt = resolve; });
  const attemptStarted = new Promise<void>(resolve => { interceptedAttempt = resolve; });
  const attemptDelivered = new Promise<void>(resolve => { deliveredAttempt = resolve; });
  await page.route(`**/api/tasks/${secondTask.id}/attempt`, async route => {
    const response = await route.fetch();
    interceptedAttempt(); await attemptGate; await route.fulfill({ response }); deliveredAttempt();
  }, { times: 1 });
  await page.getByRole('button', { name: 'Submit prediction', exact: true }).click();
  await attemptStarted;
  await page.locator('.checkpoint-index').getByRole('button', { name: new RegExp(firstTask.title) }).click();
  await expect(page.locator('.mission-panel h3')).toHaveText(firstTask.title);
  releaseAttempt();
  await attemptDelivered;
  await expect(page.locator('.mission-panel h3')).toHaveText(firstTask.title);
  await expect(page.locator('.mission-feedback')).toHaveCount(0);
  await expect(page.getByLabel(firstTask.choices[0].label, { exact: true })).not.toBeChecked();
  const firstProgress = await (await page.request.get(`/api/tasks/${firstTask.id}/progress?${new URLSearchParams({ snapshotId, contentVersion: firstTask.contentVersion })}`)).json();
  expect(firstProgress.feedback).toBeNull();
  const secondProgress = await (await page.request.get(`/api/tasks/${secondTask.id}/progress?${new URLSearchParams({ snapshotId, contentVersion: secondTask.contentVersion })}`)).json();
  expect(secondProgress.feedback.submittedAnswer).toBe(secondTask.choices[0].id);
});
