import { expect, test } from "@playwright/test";
import {
  dashboardShown, deleteProject, landingLogIn, makeProject, oneJourneyPage, practiceAccount, projectPill, removeWhatItMade,
  setupShown, signIn, signOut, uniqueName,
} from "./helpers";

const page = oneJourneyPage(test);
const name = uniqueName("Journey");

let mayHoldTheProject = false;

test.afterAll(async ({ browser }, testInfo) => {
  if (!mayHoldTheProject) return;
  await removeWhatItMade(browser, testInfo, practiceAccount("a"), [name]);
  mayHoldTheProject = false;
});

test.describe("the journey", () => {
  test("opens the landing page", async () => {
    await page().goto("/");
    await expect(page().getByRole("heading", { level: 1 })).toBeVisible();
    await expect(landingLogIn(page())).toBeVisible();
  });

  test("signs in as a practice account", async () => {
    await signIn(page(), practiceAccount("a"));
  });

  test("sets up a project", async () => {
    mayHoldTheProject = true;
    await makeProject(page(), name);
    await expect(page().getByRole("heading", { name: "Commitment" })).toBeVisible();
  });

  test("writes on the Commitment card: the daily goal edited", async () => {
    const card = page().locator(".bubble-time");
    await expect(card.locator(".glance-eyebrow")).toContainText("Goal 2h");
    await card.locator(".glance-hero > span").filter({ hasText: /h$/ }).click();
    const goal = card.locator(".glance-hero-input");
    await goal.fill("3");
    await goal.press("Enter");
    await expect(card.locator(".glance-eyebrow")).toContainText("Goal 3h");
  });

  test("writes on the Timeline card: a phase added, then every phase ticked done", async () => {
    const card = page().locator(".bubble-timeline");
    await card.getByRole("heading", { name: "Timeline" }).click();
    await card.getByRole("button", { name: "+ Add a phase" }).click();
    const box = card.getByPlaceholder("Name a phase, press Enter…");
    await box.fill("Ship it");
    await box.press("Enter");
    await expect(card.locator(".row-name", { hasText: "Ship it" })).toBeVisible();
    await box.press("Escape");
    const notDone = card.getByRole("button", { name: "Mark phase done", exact: true });
    await expect(notDone).toHaveCount(3);
    for (let left = 3; left > 0; left -= 1) {
      await notDone.first().click();
      await expect(notDone).toHaveCount(left - 1);
    }
    await expect(card.getByRole("button", { name: "Mark phase not done", exact: true })).toHaveCount(3);
  });

  test("writes on the Learning card: an item added", async () => {
    const card = page().locator(".bubble-learning");
    await card.getByRole("button", { name: "+ Add something to learn" }).click();
    const box = card.getByPlaceholder("Name a skill, press Enter…");
    await box.fill("Typography");
    await box.press("Enter");
    await expect(card.getByText("Typography", { exact: true })).toBeVisible();
    await box.press("Escape");
  });

  test("writes on the Daily Task card: a task added", async () => {
    const card = page().locator(".bubble-task");
    await card.getByRole("button", { name: "Task list" }).click();
    await card.getByRole("button", { name: "+ Add a task" }).click();
    const box = card.getByPlaceholder("Type a task, press Enter…");
    await box.fill("Write the landing copy");
    await box.press("Enter");
    await expect(card.locator(".task-text", { hasText: "Write the landing copy" })).toBeVisible();
    await box.press("Escape");
  });

  test("writes on the Thoughts card: a thought added", async () => {
    const card = page().locator(".bubble-task");
    await card.getByRole("button", { name: "Thought log" }).click();
    await expect(card.getByRole("heading", { name: "Thoughts" })).toBeVisible();
    await card.getByRole("button", { name: "+ Add a thought" }).click();
    const box = card.getByPlaceholder("What's on your mind? Press Enter to add…");
    await box.fill("The pills could be rounder");
    await box.press("Enter");
    await expect(card.locator(".th-text", { hasText: "The pills could be rounder" })).toBeVisible();
    await box.press("Escape");
  });

  test("archives the finished project from the sidebar", async () => {
    await page().getByRole("button", { name: `Archive ${name}`, exact: true }).click();
    await expect(projectPill(page(), name)).toHaveCount(0);
  });

  test("restores the project from the archive", async () => {
    await expect(dashboardShown(page()).or(setupShown(page()))).toBeVisible();
    if (await dashboardShown(page()).isVisible()) {
      await page().getByRole("button", { name: /^Projects/ }).click();
      const restore = page().getByRole("button", { name: `Restore ${name}`, exact: true });
      await restore.click();
      await expect(restore).toHaveCount(0);
      await page().getByRole("button", { name: /^Archive\s*⇄/ }).click();
    } else {
      await page().getByRole("button", { name: /^View archive/ }).click();
      await expect(page().getByRole("heading", { name: "Archive", level: 1 })).toBeVisible();
      await page().locator(".archive-item").filter({ hasText: name }).getByRole("button", { name: "Restore" }).click();
    }
    await expect(projectPill(page(), name)).toHaveClass(/\bactive\b/);
  });

  test("signs out", async () => {
    await signOut(page());
  });

  test("signs back in and deletes the project, leaving the account as it was found", async () => {
    await signIn(page(), practiceAccount("a"));
    await deleteProject(page(), name);
    mayHoldTheProject = false;
  });
});
