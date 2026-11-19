import { expect, test, type Page } from "@playwright/test";
import {
  dashboardShown, emailsInTheInbox, forgetTheSignIn, landingLogIn, oneJourneyPage, openResetLink, practiceAccount,
  resetLinkFor, setupShown, signIn, type Account,
} from "./helpers";

const page = oneJourneyPage(test);
const recorded = practiceAccount("b");
const renewed: Account = { email: recorded.email, password: `Renewed-${Date.now().toString(36)}-b7!` };

let before = new Set<string>();

let mayHoldTheNewPassword = false;

async function requestAResetLink(on: Page, email: string): Promise<void> {
  await on.goto("/");
  await landingLogIn(on).click();
  await on.getByRole("button", { name: "Forgot password?" }).click();
  await on.getByPlaceholder("you@example.com").fill(email);
  before = await emailsInTheInbox();
  await on.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(on.getByRole("heading", { name: "Check your email" })).toBeVisible();
}

async function followTheLink(on: Page, email: string): Promise<void> {
  const link = await resetLinkFor(email, before);
  await openResetLink(on, link);
  await expect(on.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await on.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(on.getByRole("heading", { name: "Set a new password" })).toBeVisible();
}

async function saveANewPassword(on: Page, password: string): Promise<void> {
  await on.getByPlaceholder("New password", { exact: true }).fill(password);
  await on.getByPlaceholder("Confirm new password").fill(password);
  await on.getByRole("button", { name: "Save password" }).click();
  await expect(dashboardShown(on).or(setupShown(on))).toBeVisible();
}

async function signsInWith(on: Page, account: Account): Promise<boolean> {
  await on.goto("/");
  await landingLogIn(on).click();
  await on.getByPlaceholder("you@example.com").fill(account.email);
  await on.getByPlaceholder("Password", { exact: true }).fill(account.password);
  await on.getByRole("button", { name: "Sign in", exact: true }).click();
  const refused = on.getByText("That email and password don't match. Try again.");
  await expect(dashboardShown(on).or(setupShown(on)).or(refused)).toBeVisible();
  return !(await refused.isVisible());
}

test.afterAll(async ({ browser }, testInfo) => {
  if (!mayHoldTheNewPassword) return;
  testInfo.setTimeout(150_000);
  const { baseURL, viewport } = testInfo.project.use;
  const context = await browser.newContext({ baseURL, viewport });
  try {
    const own = await context.newPage();
    if (!(await signsInWith(own, recorded))) {
      await requestAResetLink(own, recorded.email);
      await followTheLink(own, recorded.email);
      await saveANewPassword(own, recorded.password);
    }
    mayHoldTheNewPassword = false;
  } finally {
    await context.close();
  }
});

test.describe("a reset link", () => {
  test("requests a reset link", async () => {
    await requestAResetLink(page(), recorded.email);
  });

  test('follows it from the practice inbox to "Reset your password", and continues', async () => {
    await followTheLink(page(), recorded.email);
  });

  test('sets a new password on "Set a new password"', async () => {
    mayHoldTheNewPassword = true;
    await saveANewPassword(page(), renewed.password);
  });

  test("signs in with the new password", async () => {
    await forgetTheSignIn(page());
    await signIn(page(), renewed);
  });

  test("puts the recorded password back the same way, and signs in with it", async () => {
    await forgetTheSignIn(page());
    await requestAResetLink(page(), recorded.email);
    await followTheLink(page(), recorded.email);
    await saveANewPassword(page(), recorded.password);
    mayHoldTheNewPassword = false;
    await forgetTheSignIn(page());
    await signIn(page(), recorded);
  });
});
