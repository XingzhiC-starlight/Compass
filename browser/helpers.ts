import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Browser, type BrowserContext, type Page, type TestInfo, type TestType } from "@playwright/test";
import { readSettings } from "../scripts/practice/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS = readSettings(fs.readFileSync(path.join(HERE, "..", "supabase", "config.toml"), "utf8"));

export const INBOX = process.env.BROWSER_INBOX || SETTINGS.inbox;

export type Account = { email: string; password: string };

const recorded: { name: string; email: string; password: string }[] = JSON.parse(
  fs.readFileSync(path.join(HERE, "..", "supabase", "practice", "accounts.json"), "utf8"),
).accounts;

export function practiceAccount(name: "a" | "b"): Account {
  const found = recorded.find((one) => one.name === name);
  if (!found) throw new Error(`No practice account is recorded under "${name}".`);
  return { email: found.email, password: found.password };
}

export function uniqueName(words: string): string {
  return `${words} ${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any journey file's `test`, whatever fixtures it adds
type Test = TestType<any, any>;

export function oneJourneyPage(test: Test): () => Page {
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ browser }, testInfo) => {
    const { baseURL, viewport, userAgent, deviceScaleFactor } = testInfo.project.use;
    const opened = await browser.newContext({
      baseURL,
      viewport,
      userAgent,
      deviceScaleFactor,
      recordVideo: { dir: path.join(testInfo.project.outputDir, ".journey-recordings"), size: viewport ?? undefined },
    });
    context = opened;
    page = await opened.newPage();
  });

  // eslint-disable-next-line no-empty-pattern -- Playwright reads a hook's first argument as an object pattern, and this hook needs none of it
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus || !page || !context) return;
    const video = page.video();
    await context.close();
    context = null;
    if (video) {
      const recording = testInfo.outputPath("video.webm");
      await video.saveAs(recording);
      await video.delete();
      await testInfo.attach("video", { path: recording, contentType: "video/webm" });
      const kept = testInfo.attachments.at(-1)?.path;
      if (kept && path.resolve(kept) !== path.resolve(recording)) fs.rmSync(recording, { force: true });
    }
  });

  test.afterAll(async () => {
    if (!context || !page) return;
    const video = page.video();
    await context.close();
    context = null;
    if (video) await video.delete();
  });

  return () => {
    if (!page) throw new Error("The journey's page was not opened.");
    return page;
  };
}

export function dashboardShown(page: Page) {
  return page.getByRole("button", { name: "Settings", exact: true });
}

export function landingLogIn(page: Page) {
  return page.getByRole("banner").getByRole("button", { name: "Log in", exact: true });
}

export function setupShown(page: Page) {
  return page.getByRole("button", { name: /Open my dashboard/ });
}

export async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto("/");
  await landingLogIn(page).click();
  await signInOnTheLoginScreen(page, account);
}

export async function signInOnTheLoginScreen(page: Page, account: Account): Promise<void> {
  await page.getByPlaceholder("you@example.com").fill(account.email);
  await page.getByPlaceholder("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dashboardShown(page).or(setupShown(page))).toBeVisible();
}

export async function makeProject(page: Page, name: string): Promise<void> {
  if (await dashboardShown(page).isVisible()) {
    await page.getByRole("button", { name: "New project" }).click();
  }
  await expect(setupShown(page)).toBeVisible();
  await page.getByPlaceholder("Name this project").fill(name);
  await page.locator("#plannedHours").fill("2");
  await page.locator("#actualHours").fill("3");
  await page.locator("#projectDays").fill("10");
  const phases = page.locator(".phase-row");
  await phases.nth(0).getByPlaceholder("e.g. create the design mockup").fill("Sketch the screens");
  await phases.nth(0).getByPlaceholder("0").fill("4");
  await phases.nth(1).getByPlaceholder("e.g. create the design mockup").fill("Build the first page");
  await phases.nth(1).getByPlaceholder("0").fill("6");
  const learning = page.locator(".learn-row");
  await learning.nth(0).getByPlaceholder("e.g. learning UI design principles").fill("Layout basics");
  await learning.nth(0).getByLabel("Starting level of understanding").selectOption("10");
  await learning.nth(1).getByPlaceholder("e.g. learning UI design principles").fill("Colour");
  await learning.nth(1).getByLabel("Starting level of understanding").selectOption("30");
  await setupShown(page).click();
  await expect(projectPill(page, name)).toHaveClass(/\bactive\b/);
}

export function projectPill(page: Page, name: string) {
  return page.locator(".project-pill").filter({ has: page.locator(".pill-name", { hasText: name }) });
}

export async function deleteProject(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: `Delete ${name}`, exact: true }).click();
  const confirm = page.getByRole("dialog", { name: `Delete "${name}"?` });
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("button", { name: `Delete ${name}`, exact: true })).toHaveCount(0);
}

export async function deleteProjectWherever(page: Page, name: string): Promise<void> {
  await page.goto("/");
  await expect(dashboardShown(page).or(setupShown(page))).toBeVisible();
  const remove = page.getByRole("button", { name: `Delete ${name}`, exact: true });
  if (await dashboardShown(page).isVisible()) {
    if (await remove.isVisible()) return deleteProject(page, name);
    await page.getByRole("button", { name: /^Projects/ }).click();
    await expect(page.getByRole("button", { name: /^Archive\s*⇄/ })).toBeVisible();
    if (await remove.isVisible()) await deleteProject(page, name);
    return;
  }
  const viewArchive = page.getByRole("button", { name: /^View archive/ });
  if (!(await viewArchive.isVisible())) return;
  await viewArchive.click();
  await expect(page.getByRole("heading", { name: "Archive", level: 1 })).toBeVisible();
  await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0);
  if (await remove.isVisible()) await deleteProject(page, name);
}

export async function removeWhatItMade(
  browser: Browser,
  testInfo: TestInfo,
  account: Account,
  names: string[],
): Promise<void> {
  testInfo.setTimeout(120_000);
  const { baseURL, viewport } = testInfo.project.use;
  const context = await browser.newContext({ baseURL, viewport });
  try {
    const own = await context.newPage();
    await signIn(own, account);
    for (const name of names) await deleteProjectWherever(own, name);
  } finally {
    await context.close();
  }
}

export async function signOut(page: Page): Promise<void> {
  await dashboardShown(page).click();
  await page.getByRole("button", { name: "Log out, sign out from your account" }).click();
  await expect(landingLogIn(page)).toBeVisible();
}

type InboxMessage = { ID: string; To?: { Address?: string }[] };

export async function emailsInTheInbox(): Promise<Set<string>> {
  const answer = await fetch(`${INBOX}/api/v1/messages?limit=200`);
  if (!answer.ok) throw new Error(`The practice inbox did not answer (${answer.status}).`);
  const { messages } = (await answer.json()) as { messages: InboxMessage[] };
  return new Set(messages.map((one) => one.ID));
}

export async function resetLinkFor(email: string, before: Set<string>): Promise<string> {
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    const answer = await fetch(`${INBOX}/api/v1/messages?limit=200`);
    if (answer.ok) {
      const { messages } = (await answer.json()) as { messages: InboxMessage[] };
      const newest = messages.find(
        (one) => !before.has(one.ID) && (one.To ?? []).some((to) => to.Address?.toLowerCase() === email.toLowerCase()),
      );
      if (newest) {
        const message = await fetch(`${INBOX}/api/v1/message/${encodeURIComponent(newest.ID)}`);
        const { HTML, Text } = (await message.json()) as { HTML?: string; Text?: string };
        const href = /href="([^"]*#token_hash=[^"]*)"/.exec(HTML ?? "")?.[1] ?? /(\S*#token_hash=\S*)/.exec(Text ?? "")?.[1];
        if (!href) throw new Error(`The newest reset email to ${email} holds no reset link.`);
        const link = href.replace(/&amp;/g, "&");
        if (!/[#&]type=recovery(&|$)/.test(link)) throw new Error(`The reset email to ${email} holds a link that is not a reset link.`);
        return link;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No reset email to ${email} reached the practice inbox within 30 seconds.`);
}

/** Opens a reset link in the page, as a fresh load — the way a link followed from an email
 *  opens: from an empty page, so that Compass starts with the link's address (a link that
 *  differs from the page's address only after its "#" would otherwise not load the page
 *  again). */
export async function openResetLink(page: Page, link: string): Promise<void> {
  try {
    await page.goto("about:blank");
    await page.goto(link);
  } catch {
    throw new Error("The browser could not open the reset link.");
  }
}

export async function forgetTheSignIn(page: Page): Promise<void> {
  await page.evaluate(() => window.localStorage.clear());
  await page.goto("/");
  await expect(landingLogIn(page)).toBeVisible();
}
