import { expect, test, type Page } from '@playwright/test';

async function explore(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore source', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Current file', exact: true })).toBeEnabled();
}
async function ask(page: Page, question: string) {
  await page.getByRole('textbox', { name: 'Ask a question about this code' }).fill(question);
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
  await expect(page.locator('.mentor-answer h3')).toHaveText(question);
}

test('source-scoped submission waits for delayed citation navigation and sends the new range', async ({ page }) => {
  await explore(page);
  await ask(page, 'How do I unsubscribe?');
  await page.locator('.mentor-citations').getByRole('button', { name: 'src/vanilla.ts · lines 88–92', exact: true }).click();
  await expect(page.locator('.source-selection-label')).toHaveText('Lines 88–92');
  await page.getByRole('radio', { name: 'Repository', exact: true }).check();
  await ask(page, 'How does setState update state?');
  await page.getByRole('radio', { name: 'Selected lines', exact: true }).check();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/evidence/*', async route => { await gate; await route.continue(); }, { times: 1 });
  try {
    await page.locator('.mentor-citations').getByRole('button', { name: 'src/vanilla.ts · lines 66–81', exact: true }).click();
    await expect(page.locator('.source-selection-label')).toHaveText('Loading source…');
    await expect(page.getByRole('radio', { name: 'Selected lines', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Send question', exact: true })).toBeDisabled();
    await expect(page.locator('.mentor-current-context')).toContainText('lines 88–92');
  } finally { release(); }
  await expect(page.locator('.source-selection-label')).toHaveText('Lines 66–81');
  const request = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/questions');
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
  expect((await request).postDataJSON()).toMatchObject({ startLine: 66, endLine: 81 });
  await expect(page.locator('.mentor-answer-context')).toContainText('lines 66–81');
  let resume!: () => void;
  const sourceGate = new Promise<void>(resolve => { resume = resolve; });
  await page.route('**/api/repository/source?**', async route => { await sourceGate; await route.continue(); }, { times: 1 });
  try {
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Selected lines', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Send question', exact: true })).toBeDisabled();
  } finally { resume(); }
  await expect(page.getByRole('radio', { name: 'Selected lines', exact: true })).toBeChecked();
  await expect(page.locator('.mentor-current-context')).toContainText('lines 66–81');
});

test('architecture reading order opens real pinned evidence and shows the review boundary', async ({ page }) => {
  await page.goto('/');
  const architecture = page.getByRole('region', { name: 'How this repository fits together' });
  await expect(architecture.locator('li')).toHaveCount(4);
  await expect(architecture).toContainText('independent human review pending');
  await architecture.getByRole('button', { name: 'Read React bindings source', exact: true }).click();
  await expect(page.locator('.source-context')).toContainText('src/react.ts');
  await expect(page.locator('.source-selection-label')).toHaveText(/Lines \d+–\d+/);
});

test('claim kinds and their own evidence survive browser history reload', async ({ page }) => {
  const prepared = await (await page.request.post('/api/questions', { data: {
    snapshotId: 'zustand-0ea8be27db13', question: 'How does setState update state?', depth: 'beginner',
  } })).json();
  expect(prepared.citations.length).toBeGreaterThan(0);
  const blocks = [
    { text: 'The identity guard checks the next value before notifying listeners.', kind: 'observed', evidenceIds: [prepared.citations[0].evidenceId] },
    { text: 'Avoiding redundant notifications is an interpretation of this guard.', kind: 'inferred', evidenceIds: [prepared.citations[0].evidenceId] },
    { text: 'The maintainer’s historical intent is not established here.', kind: 'unknown', evidenceIds: [] },
  ];
  await explore(page);
  await page.route('**/api/questions', route => route.fulfill({ json: {
    ...prepared, mode: 'live', reviewState: 'generated', blocks, answer: blocks.map(block => block.text).join('\n\n'),
  } }), { times: 1 });
  await ask(page, 'Explain the identity guard and its limits');
  for (const kind of ['From source', 'Interpretation', 'Not established']) await expect(page.locator('.mentor-claim-kind').getByText(kind, { exact: true })).toBeVisible();
  await expect(page.locator('.mentor-claim.unknown button')).toHaveCount(0);
  await expect(page.locator('.mentor-review-state')).toContainText('Citation checks do not establish correctness');
  await page.reload();
  await expect(page.locator('.mentor-claim')).toHaveCount(3);
  await page.getByRole('region', { name: 'Answer claim 1', exact: true }).getByRole('button').click();
  await expect(page.locator('.source-selection-label')).toHaveText('Lines 66–81');
  await expect(page.locator('.mentor-claim')).toHaveCount(3);
});
