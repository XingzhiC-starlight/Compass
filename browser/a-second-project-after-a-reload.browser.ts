import { expect, test } from "@playwright/test";
import {
  deleteProject, makeProject, oneJourneyPage, practiceAccount, projectPill, removeWhatItMade, signIn, uniqueName,
} from "./helpers";

const page = oneJourneyPage(test);
const first = uniqueName("Reload, first");
const second = uniqueName("Reload, second");

const pills = () => page().locator(".project-pills .project-pill:not(.new-pill)");

let chosen = "";

let mayHoldTheProjects = false;

test.afterAll(async ({ browser }, testInfo) => {
  if (!mayHoldTheProjects) return;
  await removeWhatItMade(browser, testInfo, practiceAccount("a"), [first, second]);
  mayHoldTheProjects = false;
});

test.describe("a second project after a reload", () => {
  test("signs in as a practice account and makes two projects", async () => {
    await signIn(page(), practiceAccount("a"));
    mayHoldTheProjects = true;
    await makeProject(page(), first);
    await makeProject(page(), second);
    await expect(projectPill(page(), first)).toHaveCount(1);
  });

  test("chooses the project in the sidebar's second place", async () => {
    chosen = (await pills().nth(1).locator(".pill-name").innerText()).trim();
    if (/\bactive\b/.test((await pills().nth(1).getAttribute("class")) ?? "")) {
      await pills().nth(0).click();
      await expect(pills().nth(0)).toHaveClass(/\bactive\b/);
    }
    await pills().nth(1).click();
    await expect(projectPill(page(), chosen)).toHaveClass(/\bactive\b/);
    await expect(pills().nth(0)).not.toHaveClass(/\bactive\b/);
  });

  test("reloads the page, and the project chosen is still open", async () => {
    await page().reload();
    await expect(page().getByRole("heading", { name: "Commitment" })).toBeVisible();
    await expect(projectPill(page(), chosen)).toHaveClass(/\bactive\b/);
    await expect(pills().nth(0)).not.toHaveClass(/\bactive\b/);
  });

  test("deletes both projects, leaving the account as it was found", async () => {
    await deleteProject(page(), first);
    await deleteProject(page(), second);
    mayHoldTheProjects = false;
  });
});
