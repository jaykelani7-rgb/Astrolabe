import { expect, test, type Page } from '@playwright/test';
import type { Guide, QaResponse } from '../../src/contracts';

const mentorAnswer = (page: Page) => page.locator('.mentor-answer');
const originalContext = (page: Page) => mentorAnswer(page).locator('.mentor-answer-context');

async function navigate(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('complementary', { name: 'Main navigation' }).getByRole('button', { name: label, exact: true }).click();
}

async function guides(page: Page) {
  const data = await (await page.request.get('/api/guides')).json() as { guides: Guide[] };
  return data.guides;
}

async function openReactWalkthrough(page: Page, mobile = false) {
  const available = await guides(page);
  const guide = available.find((item) => item.id === 'store-to-react')!;
  await page.goto('/');
  await page.getByRole('button', { name: 'Start learning', exact: true }).click();
  if (mobile) await page.getByRole('tab', { name: 'Files & flow', exact: true }).click();
  await page.getByLabel('Walkthrough', { exact: true }).selectOption(guide.id);
  if (mobile) await page.getByRole('tab', { name: 'Mentor', exact: true }).click();
  await expect(page.locator('.guide-panel h2')).toHaveText(guide.steps[0].title);
  return { guide, available };
}

async function submit(page: Page, question: string) {
  await page.getByRole('textbox', { name: 'Ask a question about this code' }).fill(question);
  const sent = page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/questions');
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
  const body = (await sent).postDataJSON();
  await expect(mentorAnswer(page).getByRole('heading', { name: question, exact: true })).toBeVisible();
  return body;
}

test('walkthrough questions retain their original flow and step through citations, navigation, history and depth replay', async ({ page }) => {
  const errors: string[] = [];
  const posted: unknown[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/questions') posted.push(request.postDataJSON());
  });
  const { guide, available } = await openReactWalkthrough(page);
  await page.getByRole('radio', { name: 'This walkthrough', exact: true }).check();
  await expect(page.locator('.mentor-current-context')).toContainText(guide.steps[0].title);
  const submitted = await submit(page, 'What is getInitialState?');
  expect(submitted).toEqual({ question: 'What is getInitialState?', snapshotId: guide.snapshotId, depth: 'beginner', guideId: guide.id, stepId: guide.steps[0].id });
  await expect(mentorAnswer(page).locator('.response-label')).toHaveText('Reviewed answer');
  await expect(mentorAnswer(page).locator('.mentor-citation')).toHaveCount(2);
  await expect(originalContext(page)).toContainText(guide.title);
  await expect(originalContext(page)).toContainText(guide.steps[0].title);
  const explanation = await mentorAnswer(page).locator('.mentor-answer-text').textContent();

  await mentorAnswer(page).getByRole('button', { name: 'src/vanilla.ts · lines 83–96', exact: true }).click();
  await expect(page.locator('.source-context')).toContainText('src/vanilla.ts');
  await expect(mentorAnswer(page).locator('.mentor-answer-text')).toHaveText(explanation!);
  await expect(originalContext(page)).toContainText(guide.steps[0].title);
  await mentorAnswer(page).getByRole('button', { name: 'src/react.ts · lines 30–34', exact: true }).click();
  await expect(page.locator('.source-context')).toContainText('src/react.ts');
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await expect(page.locator('.guide-panel h2')).toHaveText(guide.steps[1].title);
  await expect(page.locator('.mentor-current-context')).toContainText(guide.steps[1].title);
  await expect(originalContext(page)).toContainText(guide.steps[0].title);
  expect(posted).toHaveLength(1);

  const otherGuide = available.find((item) => item.id !== guide.id)!;
  await page.getByLabel('Walkthrough', { exact: true }).selectOption(otherGuide.id);
  await expect(page.locator('.mentor-current-context')).toContainText(otherGuide.title);
  await expect(originalContext(page)).toContainText(guide.title);
  await page.getByRole('radio', { name: 'Repository', exact: true }).check();
  await submit(page, 'How does setState update state?');
  await page.locator('.mentor-history summary').click();
  await page.locator('.mentor-history').getByRole('button', { name: /What is getInitialState/ }).click();
  await expect(originalContext(page)).toContainText(guide.steps[0].title);
  await expect(page.getByRole('button', { name: 'Return to latest answer', exact: true })).toBeVisible();

  // The active scope concerns future questions; the selected answer keeps its original flow.
  await page.getByRole('radio', { name: 'This walkthrough', exact: true }).check();
  await navigate(page, 'Explore');
  await expect(page.getByRole('radio', { name: 'This walkthrough', exact: true })).toBeDisabled();
  await expect(page.getByRole('radio', { name: 'Current file', exact: true })).toBeChecked();
  await expect(page.locator('.mentor-context-notice')).toContainText('The next question uses Current file');
  await expect(originalContext(page)).toContainText(guide.title);
  await navigate(page, 'Learn');
  await expect(page.getByRole('radio', { name: 'This walkthrough', exact: true })).toBeEnabled();
  await expect(originalContext(page)).toContainText(guide.steps[0].title);
  await page.getByRole('button', { name: 'Developer', exact: true }).click();
  await expect(originalContext(page)).toContainText('Beginner answer');
  expect(posted).toHaveLength(2);
  const replay = page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/questions');
  await mentorAnswer(page).getByRole('button', { name: 'Ask again at Developer depth', exact: true }).click();
  expect((await replay).postDataJSON()).toEqual({ ...submitted, depth: 'developer' });
  await expect(originalContext(page)).toContainText('Developer answer');
  await expect(originalContext(page)).toContainText(guide.title);
  await expect(originalContext(page)).toContainText(guide.steps[0].title);
  await page.reload();
  await expect(originalContext(page)).toContainText('This walkthrough · Developer answer');
  await expect(originalContext(page)).toContainText(guide.steps[0].title);
  expect(errors).toEqual([]);
});

test('four scope controls fit mobile, support keyboard selection and retain walkthrough answers after source inspection', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { guide } = await openReactWalkthrough(page, true);
  const scopes = page.locator('.mentor-scope-options');
  const repository = await scopes.getByRole('radio', { name: 'Repository', exact: true }).boundingBox();
  const walkthrough = await scopes.getByRole('radio', { name: 'This walkthrough', exact: true }).boundingBox();
  expect(walkthrough!.y).toBeGreaterThan(repository!.y);
  expect(walkthrough!.height).toBeGreaterThanOrEqual(44);
  await scopes.getByRole('radio', { name: 'Selected lines', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(scopes.getByRole('radio', { name: 'This walkthrough', exact: true })).toBeFocused();
  await expect(scopes.getByRole('radio', { name: 'This walkthrough', exact: true })).toBeChecked();
  const body = await submit(page, 'What is getInitialState?');
  expect(Object.keys(body).sort()).toEqual(['depth', 'guideId', 'question', 'snapshotId', 'stepId']);
  await mentorAnswer(page).getByRole('button', { name: 'src/vanilla.ts · lines 83–96', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Code', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.source-context')).toContainText('Lines 83–96');
  await page.getByRole('tab', { name: 'Mentor', exact: true }).click();
  await expect(mentorAnswer(page).locator('.response-label')).toHaveText('Reviewed answer');
  await expect(originalContext(page)).toContainText(guide.steps[0].title);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  await page.screenshot({ path: testInfo.outputPath('walkthrough-mentor-mobile.png'), fullPage: true, animations: 'disabled' });
});

test('legacy history remains readable and stale walkthrough IDs fail explicitly without losing the draft or answer', async ({ page }) => {
  const repository = await (await page.request.get('/api/repository')).json();
  const response = await (await page.request.post('/api/questions', { data: { question: 'How does setState update state?', snapshotId: repository.snapshot.snapshotId } })).json() as QaResponse;
  const compact = { ...response, citations: response.citations.map((citation) => ({ ...citation, text: '' })) };
  await page.addInitScript(({ snapshotId, compact }) => {
    localStorage.setItem(`astrolabe:mentor-history:v1:${snapshotId}`, JSON.stringify({
      version: 1, snapshotId, draft: 'Keep this existing draft', scope: 'walkthrough', selectedId: 'legacy',
      entries: [
        { id: 'legacy', context: { question: 'How does setState update state?', snapshotId, scope: 'repository', depth: 'beginner' }, response: compact },
        { id: 'stale', context: { question: 'How does setState update state?', snapshotId, scope: 'walkthrough', depth: 'beginner', guideId: 'removed-guide', guideTitle: 'Retired walkthrough', stepId: 'removed-step', stepTitle: 'Retired step' }, response: compact },
      ],
    }));
  }, { snapshotId: repository.snapshot.snapshotId, compact });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore source', exact: true }).click();
  await expect(originalContext(page)).toContainText('Repository · Beginner answer');
  await page.locator('.mentor-history summary').click();
  await page.locator('.mentor-history').getByRole('button', { name: /Retired walkthrough/ }).click();
  await expect(originalContext(page)).toContainText('Retired step');
  await page.getByRole('button', { name: 'Developer', exact: true }).click();
  const rejected = page.waitForResponse((result) => result.request().method() === 'POST' && new URL(result.url()).pathname === '/api/questions');
  await mentorAnswer(page).getByRole('button', { name: 'Ask again at Developer depth', exact: true }).click();
  const failure = await rejected;
  expect(failure.status()).toBe(404);
  expect(await failure.json()).toMatchObject({ error: { code: 'GUIDE_NOT_FOUND' } });
  await expect(page.locator('.mentor-error')).toContainText('This walkthrough does not exist');
  await expect(page.getByRole('textbox', { name: 'Ask a question about this code' })).toHaveValue('Keep this existing draft');
  await expect(originalContext(page)).toContainText('Retired step');
});
