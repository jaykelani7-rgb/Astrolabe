import { expect, test, type Page } from "@playwright/test";
import type { Snapshot, Results, ContributionBrief } from "../../src/contracts";

async function progress(page: Page) {
  const open = page.getByRole("button", { name: "Open navigation", exact: true });
  if ((page.viewportSize()?.width ?? 1440) <= 760) {
    await expect(open).toBeVisible();
    await open.click();
  }
  await page.getByRole("complementary", { name: "Main navigation" }).getByRole("button", { name: "My progress", exact: true }).click();
}

for (const width of [1440, 390]) test(`learning goal restores, ranks curated proposals and opens prerequisite practice at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const repository = await (await page.request.get("/api/repository")).json();
  const snapshotId: string = repository.snapshot.snapshotId;
  await page.goto("/");
  await progress(page);
  const panel = page.getByRole("region", { name: "Prepared contribution briefs", exact: true });
  const select = panel.getByRole("combobox", { name: "My learning goal", exact: true });
  await expect(select).toBeEnabled();
  await expect(panel).toContainText("No saved goal yet");
  await select.selectOption("architecture");
  await expect(panel).toContainText("Save your selection to update the recommendations");
  const save = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/learning/goal" && request.method() === "POST");
  await panel.getByRole("button", { name: "Save learning goal", exact: true }).click();
  expect((await save).postDataJSON()).toEqual({ snapshotId, goal: "architecture" });
  await expect(panel.getByRole("status")).toHaveText("Goal saved for this snapshot.");
  const goal = await (await page.request.get(`/api/learning/goal?${new URLSearchParams({ snapshotId })}`)).json();
  expect(goal).toEqual({ snapshotId, goal: "architecture" });
  const plan = await (await page.request.get(`/api/contributions?${new URLSearchParams({ snapshotId })}`)).json();
  const articles = panel.getByRole("article");
  await expect(articles).toHaveCount(plan.recommendations.length);
  expect(await articles.locator("h3").allTextContents()).toEqual(plan.recommendations.map((brief: ContributionBrief) => brief.title));
  await expect(articles.first()).toContainText("Curated documentation proposal");
  await expect(articles.first()).toContainText("Not attempted yet");
  await expect(panel).toContainText("not a mastery score");
  await expect(panel).toContainText("does not establish mastery or contribution readiness");
  await expect(panel.getByRole("list", { name: "Recommendation limitations" })).toContainText("documentation briefs only");

  await page.reload();
  await progress(page);
  await expect(select).toBeEnabled();
  await expect(select).toHaveValue("architecture");
  await expect(panel).toContainText("Saved goal: Understand the architecture");
  expect(await articles.locator("h3").allTextContents()).toEqual(plan.recommendations.map((brief: ContributionBrief) => brief.title));
  const taskId = plan.recommendations[0].remediationTaskIds[0];
  const results: Results = await (await page.request.get(`/api/results?${new URLSearchParams({ snapshotId })}`)).json();
  const task = results.tasks.find((entry) => entry.taskId === taskId)!;
  const publicTask = await (await page.request.get(`/api/tasks/${taskId}?${new URLSearchParams({ snapshotId })}`)).json();
  const request = page.waitForRequest((entry) => new URL(entry.url()).pathname === `/api/tasks/${taskId}/progress`);
  await articles.first().getByRole("button", { name: `Practice: ${task.title}`, exact: true }).click();
  await expect(page.locator(".mission-panel h3")).toHaveText(task.title);
  const context = new URL((await request).url()).searchParams;
  expect(context.get("snapshotId")).toBe(snapshotId);
  expect(context.get("contentVersion")).toBe(publicTask.contentVersion);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  expect(errors).toEqual([]);
});

test("contribution prerequisites disclose recorded hints and retries without claiming readiness", async ({ page }) => {
  const repository = await (await page.request.get("/api/repository")).json();
  const snapshotId: string = repository.snapshot.snapshotId;
  const content = await (await page.request.get(`/api/guides?${new URLSearchParams({ snapshotId })}`)).json();
  const task = content.tasks.find((entry: { id: string }) => entry.id === "same-reference");
  const query = new URLSearchParams({ snapshotId, contentVersion: task.contentVersion });
  const hint = await page.request.post(`/api/tasks/${task.id}/hint?${query}`);
  expect(hint.ok()).toBeTruthy();
  const wrong = await page.request.post(`/api/tasks/${task.id}/attempt`, { data: { snapshotId, contentVersion: task.contentVersion, answer: "notify" } });
  expect(wrong.ok()).toBeTruthy();
  const correct = await page.request.post(`/api/tasks/${task.id}/attempt`, { data: { snapshotId, contentVersion: task.contentVersion, answer: "skip" } });
  expect(correct.ok()).toBeTruthy();
  await page.goto("/");
  await progress(page);
  const panel = page.getByRole("region", { name: "Prepared contribution briefs", exact: true });
  const brief = panel.getByRole("article", { name: "Document two update edge cases", exact: true });
  await expect(brief).toContainText("the first prediction was incorrect");
  await expect(brief).toContainText("1 hint request was recorded");
  await expect(brief).toContainText("Hints or retries are recorded here");
  await expect(brief.getByRole("button", { name: `Practice: ${task.title}`, exact: true })).toBeEnabled();
  await expect(panel).toContainText("Practice completion does not establish mastery or contribution readiness");
});

test("goal restoration is snapshot-specific and a late real response cannot replace the selected snapshot", async ({ page }) => {
  const inventory: { snapshots: Snapshot[] } = await (await page.request.get("/api/snapshots")).json();
  const zustand = inventory.snapshots.find((snapshot) => snapshot.name === "Zustand")!;
  const mitt = inventory.snapshots.find((snapshot) => snapshot.name.toLowerCase().includes("mitt"))!;
  for (const [snapshot, goal] of [[zustand, "debug"], [mitt, "tests"]] as const) {
    const response = await page.request.post("/api/learning/goal", { data: { snapshotId: snapshot.snapshotId, goal } });
    expect(response.ok()).toBeTruthy();
  }
  await page.goto(`/?snapshot=${zustand.snapshotId}&view=progress`);
  const panel = page.getByRole("region", { name: "Prepared contribution briefs", exact: true });
  await expect(panel.getByRole("combobox", { name: "My learning goal", exact: true })).toHaveValue("debug");
  let release!: () => void;
  let started!: () => void;
  let delivered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const intercepted = new Promise<void>((resolve) => { started = resolve; });
  const lateResponseDelivered = new Promise<void>((resolve) => { delivered = resolve; });
  await page.route(`**/api/learning/goal?snapshotId=${zustand.snapshotId}`, async (route) => {
    const response = await route.fetch();
    started();
    await gate;
    await route.fulfill({ response });
    delivered();
  }, { times: 1 });
  // Re-entering progress remounts the goal panel and delays the actual saved-goal response.
  await page.getByRole("complementary", { name: "Main navigation" }).getByRole("button", { name: "Overview", exact: true }).click();
  await progress(page);
  await intercepted;
  await page.getByRole("combobox", { name: "Repository snapshot", exact: true }).selectOption(mitt.snapshotId);
  await progress(page);
  await expect(panel.getByRole("combobox", { name: "My learning goal", exact: true })).toHaveValue("tests");
  await expect(panel.getByRole("combobox", { name: "My learning goal", exact: true })).toBeEnabled();
  release();
  await lateResponseDelivered;
  await expect(panel).toContainText("Saved goal: Explore testing");
  await expect(panel.getByRole("article")).toHaveCount(1);
  await expect(panel.getByRole("article")).toContainText("Document a subscription lifecycle");
  const saved = await (await page.request.get(`/api/learning/goal?${new URLSearchParams({ snapshotId: mitt.snapshotId })}`)).json();
  expect(saved).toEqual({ snapshotId: mitt.snapshotId, goal: "tests" });
});
