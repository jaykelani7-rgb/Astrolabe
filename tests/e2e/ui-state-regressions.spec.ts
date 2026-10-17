import { expect, test, type Page } from "@playwright/test";
import type { Guide, Snapshot, SourceFile } from "../../src/contracts";

async function openMobileProgress(page: Page) {
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  await expect(menu).toBeVisible();
  await menu.click();
  await page.getByRole("complementary", { name: "Main navigation" }).getByRole("button", { name: "My progress", exact: true }).click();
}

test("mobile proposal citation reveals canonical Code after leaving a checkpoint in Mentor", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const repository: { snapshot: Snapshot; files: SourceFile[] } = await (await page.request.get("/api/repository")).json();
  const snapshotId = repository.snapshot.snapshotId;
  await page.goto("/");
  await page.getByRole("button", { name: "Start learning", exact: true }).click();
  await page.getByRole("tab", { name: "Mentor", exact: true }).click();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await page.getByRole("button", { name: /Make a prediction/ }).click();
  await expect(page.getByRole("tab", { name: "Checkpoint & mentor", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".mission-panel h3")).toHaveText("Will subscribers hear this?");
  await openMobileProgress(page);
  const proposals = page.getByRole("region", { name: "Prepared contribution briefs", exact: true });
  await expect(proposals.getByRole("combobox", { name: "My learning goal", exact: true })).toBeEnabled();
  const plan = await (await page.request.get(`/api/contributions?${new URLSearchParams({ snapshotId })}`)).json();
  const brief = plan.recommendations[0];
  const evidenceId: string = brief.evidenceIds[0];
  const evidence = await (await page.request.get(`/api/evidence/${evidenceId}?${new URLSearchParams({ snapshotId })}`)).json();
  const file = repository.files.find((entry) => entry.fileId === evidence.fileId)!;
  const navigation = page.waitForRequest((request) => new URL(request.url()).pathname === `/api/evidence/${evidenceId}`);
  await proposals.getByRole("article", { name: brief.title, exact: true }).getByRole("button", { name: "Inspect proposal source 1", exact: true }).click();
  expect(new URL((await navigation).url()).searchParams.get("snapshotId")).toBe(snapshotId);
  await expect(page.getByRole("tab", { name: "Code", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Source and module map", exact: true })).toBeVisible();
  await expect(page.locator(".source-context")).toContainText(file.path);
  await expect(page.locator(".source-selection-label")).toHaveText(`Lines ${evidence.startLine}–${evidence.endLine}`);
  await expect(page.getByRole("combobox", { name: "Repository snapshot", exact: true })).toHaveValue(snapshotId);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  expect(errors).toEqual([]);
});

test("queued old-snapshot positions cannot overwrite a later visit after switching away and back", async ({ page }) => {
  // Observe completion of real progress fetches, including their consumed JSON bodies.
  // This lets the assertion drain the serialized writes without an arbitrary delay.
  await page.addInitScript(() => {
    const observed = window as unknown as Window & { __positionChecks: Promise<void>[] };
    observed.__positionChecks = [];
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const address = input instanceof Request ? input.url : String(input);
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      if (new URL(address, window.location.href).pathname !== "/api/progress" || method.toUpperCase() !== "POST") return originalFetch(input, init);
      let complete!: () => void;
      observed.__positionChecks.push(new Promise<void>((resolve) => { complete = resolve; }));
      return originalFetch(input, init).then((response) => {
        const originalJson = response.json.bind(response);
        response.json = () => originalJson().finally(complete);
        return response;
      }, (failure) => { complete(); throw failure; });
    };
  });
  const inventory: { snapshots: Snapshot[] } = await (await page.request.get("/api/snapshots")).json();
  const first = inventory.snapshots.find((snapshot) => snapshot.name === "Zustand")!;
  const other = inventory.snapshots.find((snapshot) => snapshot.repositoryUrl !== first.repositoryUrl)!;
  const learning: { guides: Guide[] } = await (await page.request.get(`/api/guides?${new URLSearchParams({ snapshotId: first.snapshotId })}`)).json();
  const guide = learning.guides[0];
  const queuedStep = guide.steps[1];
  const laterStep = guide.steps[3];
  let release!: () => void;
  let started!: () => void;
  let delivered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const intercepted = new Promise<void>((resolve) => { started = resolve; });
  const deliveredResponse = new Promise<void>((resolve) => { delivered = resolve; });
  let initialBody: unknown;
  let released = false;
  const writesAfterRelease: { snapshotId: string; stepId: string }[] = [];
  page.on("request", (request) => {
    if (released && request.method() === "POST" && new URL(request.url()).pathname === "/api/progress") writesAfterRelease.push(request.postDataJSON());
  });
  await page.route("**/api/progress", async (route) => {
    initialBody = route.request().postDataJSON();
    const response = await route.fetch();
    started();
    await gate;
    await route.fulfill({ response });
    delivered();
  }, { times: 1 });
  await page.goto(`/?snapshot=${first.snapshotId}`);
  await page.getByRole("button", { name: "Start learning", exact: true }).click();
  await intercepted;
  expect(initialBody).toEqual({ snapshotId: first.snapshotId, guideId: guide.id, stepId: guide.steps[0].id });
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.locator(".guide-panel h2")).toHaveText(queuedStep.title);
  await expect.poll(() => page.evaluate((snapshotId) => JSON.parse(localStorage.getItem(`astrolabe:workspace:${snapshotId}`) || "{}").stepIndex, first.snapshotId)).toBe(1);
  const selected = page.getByRole("combobox", { name: "Repository snapshot", exact: true });
  await selected.selectOption(other.snapshotId);
  await expect(page.getByRole("heading", { name: `Find your bearings in ${other.name}.`, exact: true })).toBeVisible();
  await selected.selectOption(first.snapshotId);
  await expect(page.getByRole("heading", { name: `Find your bearings in ${first.name}.`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue learning", exact: true }).click();
  await expect(page.locator(".guide-panel h2")).toHaveText(queuedStep.title);
  const saved = page.waitForResponse((response) => {
    if (response.request().method() !== "POST" || new URL(response.url()).pathname !== "/api/progress") return false;
    const body = response.request().postDataJSON();
    return body.snapshotId === first.snapshotId && body.stepId === laterStep.id;
  });
  await page.locator(".flow-steps > li").nth(3).getByRole("button").click();
  expect((await saved).ok()).toBe(true);
  await expect(page.locator(".guide-panel h2")).toHaveText(laterStep.title);
  const beforeRelease = await (await page.request.get(`/api/progress?${new URLSearchParams({ snapshotId: first.snapshotId })}`)).json();
  expect(beforeRelease.progress.payload).toEqual({ snapshotId: first.snapshotId, guideId: guide.id, stepId: laterStep.id });
  released = true;
  release();
  await deliveredResponse;
  await page.evaluate(async () => {
    const observed = window as unknown as Window & { __positionChecks: Promise<void>[] };
    let consumed = 0;
    while (true) {
      const count = observed.__positionChecks.length;
      await Promise.all(observed.__positionChecks.slice(consumed, count));
      consumed = count;
      // A message event follows the promise jobs that can start another queued write.
      await new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
        channel.port2.postMessage(null);
      });
      if (observed.__positionChecks.length === consumed) break;
    }
  });
  expect(writesAfterRelease.filter((entry) => entry.snapshotId === first.snapshotId)).toEqual([]);
  const restored = await (await page.request.get(`/api/progress?${new URLSearchParams({ snapshotId: first.snapshotId })}`)).json();
  expect(restored.progress.payload).toEqual({ snapshotId: first.snapshotId, guideId: guide.id, stepId: laterStep.id });
  await expect(page.locator(".guide-panel h2")).toHaveText(laterStep.title);
});
