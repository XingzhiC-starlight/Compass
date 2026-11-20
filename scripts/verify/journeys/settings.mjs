import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib.mjs";
import { dashboardShown, landingLogIn, loginShown } from "../screens.mjs";

const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;

function settingsDialog(page) {
  return page.getByRole("dialog", { name: "Settings" });
}

function themeButton(page, name) {
  return settingsDialog(page).getByRole("group", { name: "Theme" }).getByRole("button", { name, exact: true });
}

const CARDS = [".bubble-time", ".bubble-timeline", ".bubble-learning", ".bubble-task"];

function background(page, selector) {
  return page.locator(selector).first().evaluate((el) => el.ownerDocument.defaultView.getComputedStyle(el).backgroundColor);
}

async function cardBackgrounds(page) {
  const found = [];
  for (const selector of CARDS) found.push(await background(page, selector));
  return found;
}

export default {
  name: "settings",
  section: "§14",
  title: "Settings and privacy",
  steps: [
    {
      id: "set-open",
      what: `Settings at the bottom of the sidebar opens a non-modal dialog "Settings", focus on its close ×; the trigger carries aria-haspopup, aria-expanded and, while open, aria-controls; the rows are Theme with Classic pressed and Sand not, Privacy Notice, Log out and "Version ${VERSION}"`,
      async run(j) {
        const { page, expect } = j;
        await j.signIn();
        await j.setUp("Settled");
        const trigger = dashboardShown(page);
        await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
        await expect(trigger).not.toHaveAttribute("aria-controls", /.+/);
        await trigger.click();
        const dialog = settingsDialog(page);
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAttribute("aria-modal", "false");
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        await expect(trigger).toHaveAttribute("aria-controls", (await dialog.getAttribute("id")) ?? "missing");
        await expect(dialog.getByRole("button", { name: "Close settings" })).toBeFocused();
        await expect(themeButton(page, "Classic")).toHaveAttribute("aria-pressed", "true");
        await expect(themeButton(page, "Sand")).toHaveAttribute("aria-pressed", "false");
        const privacy = dialog.getByRole("link", { name: "Privacy Notice, read our privacy policy" });
        await expect(privacy).toHaveAttribute("href", "/privacy.html");
        await expect(privacy).not.toHaveAttribute("target", /.+/);
        await expect(dialog.getByRole("button", { name: "Log out, sign out from your account" })).toBeVisible();
        await expect(dialog.getByText(`Version ${VERSION}`, { exact: true })).toBeVisible();
      },
    },
    {
      id: "set-dismiss",
      what: "Escape closes the dialog and returns focus to Settings; a click outside closes it; the close × closes it",
      async run(j) {
        const { page, expect } = j;
        await page.keyboard.press("Escape");
        await expect(settingsDialog(page)).toHaveCount(0);
        await expect(dashboardShown(page)).toBeFocused();
        await dashboardShown(page).click();
        const aside = await page.locator("aside.sidebar").boundingBox();
        await page.mouse.click(aside.x + aside.width / 2, aside.y + aside.height / 2);
        await expect(settingsDialog(page)).toHaveCount(0);
        await dashboardShown(page).click();
        await settingsDialog(page).getByRole("button", { name: "Close settings" }).click();
        await expect(settingsDialog(page)).toHaveCount(0);
        await expect(dashboardShown(page)).toBeFocused();
      },
    },
    {
      id: "set-theme",
      what: "Sand marks the page data-theme=\"sand\", puts the four cards on the sidebar's one sand surface, leaves the dialog open, is stored in this browser and shows again after a reload; Classic takes the mark off and gives each card its own wash again",
      async run(j) {
        const { page, expect } = j;
        const html = page.locator("html");
        await expect(html).not.toHaveAttribute("data-theme", /.+/);
        const classic = await cardBackgrounds(page);
        if (new Set(classic).size !== CARDS.length) throw new Error(`In Classic each card has its own wash, and these were shown: ${classic.join(", ")}.`);
        await dashboardShown(page).click();
        await themeButton(page, "Sand").click();
        await expect(themeButton(page, "Sand")).toHaveAttribute("aria-pressed", "true");
        await expect(themeButton(page, "Classic")).toHaveAttribute("aria-pressed", "false");
        await expect(settingsDialog(page)).toBeVisible();
        await expect(html).toHaveAttribute("data-theme", "sand");
        const sidebar = await background(page, "aside.sidebar");
        const sand = await cardBackgrounds(page);
        if (sand.some((one) => one !== sidebar)) throw new Error(`In Sand every card is on the sidebar's surface, ${sidebar}, and these were shown: ${sand.join(", ")}.`);
        const stored = await page.evaluate(() => globalThis.localStorage.getItem("compass.theme"));
        if (stored !== "sand") throw new Error(`The browser holds the theme "${stored}", not "sand".`);
        await j.snap("sand");
        await page.reload();
        await expect(dashboardShown(page)).toBeVisible();
        await expect(html).toHaveAttribute("data-theme", "sand");
        await dashboardShown(page).click();
        await expect(themeButton(page, "Sand")).toHaveAttribute("aria-pressed", "true");
        await themeButton(page, "Classic").click();
        await expect(html).not.toHaveAttribute("data-theme", /.+/);
        const again = await cardBackgrounds(page);
        if (again.join() !== classic.join()) throw new Error(`Back in Classic the cards showed ${again.join(", ")}, not ${classic.join(", ")}.`);
        await page.keyboard.press("Escape");
        await expect(settingsDialog(page)).toHaveCount(0);
      },
    },
    {
      id: "set-privacy",
      what: "Privacy Notice opens /privacy.html in the same tab: \"Compass Privacy Notice\" with Back to Compass, which returns to the app, still signed in",
      async run(j) {
        const { page, expect } = j;
        await dashboardShown(page).click();
        await settingsDialog(page).getByRole("link", { name: "Privacy Notice, read our privacy policy" }).click();
        await expect(page).toHaveURL(/\/privacy\.html$/);
        await expect(page).toHaveTitle("Compass Privacy Notice");
        await expect(page.getByRole("heading", { level: 1, name: "Compass Privacy Notice" })).toBeVisible();
        await j.snap("notice");
        await page.getByRole("link", { name: "Back to Compass" }).click();
        await expect(dashboardShown(page)).toBeVisible();
      },
    },
    {
      id: "privacy-notice",
      what: "The notice states what Compass stores, that it is used only to run and sync the app and never sold, that no AI, analytics or error logging runs over the user's text, the five providers, RLS and HTTPS, and that the beta has no data export, account deletion or support mailbox",
      async run(j) {
        const { page } = j;
        await j.open("/privacy.html");
        const text = (await page.locator("article").innerText()).replace(/\s+/g, " ");
        const missing = [
          /What Compass Stores/, /phases, learning items, tasks, time sessions, and thoughts/, /interview answers/,
          /show your dashboard, keep it synced/, /do not sell your data/, /does not currently use AI features, third-party analytics, or error logging/,
          /Supabase/, /Vercel/, /Resend/, /Cloudflare Turnstile/, /Google OAuth/, /row-level security/, /HTTPS/,
          /does not offer data export, account deletion, or a public support mailbox/,
        ].filter((phrase) => !phrase.test(text));
        if (missing.length > 0) throw new Error(`The notice does not say: ${missing.map(String).join(", ")}.`);
        await j.open("/");
        await j.expect(dashboardShown(page)).toBeVisible();
      },
    },
    {
      id: "set-log-out",
      what: "Log out closes the panel, ends the session and shows the landing page; a reload stays signed out",
      async run(j) {
        const { page, expect } = j;
        await dashboardShown(page).click();
        await settingsDialog(page).getByRole("button", { name: "Log out, sign out from your account" }).click();
        await expect(landingLogIn(page)).toBeVisible();
        await expect(settingsDialog(page)).toHaveCount(0);
        await page.reload();
        await expect(landingLogIn(page)).toBeVisible();
      },
    },
    {
      id: "privacy-links",
      what: "The landing page links no privacy notice; the login form links it in a new tab (the inbox state's link and the recovery screen's lack of one are walked by the auth journey)",
      async run(j) {
        const { page, expect } = j;
        await expect(page.locator('a[href="/privacy.html"]')).toHaveCount(0);
        await landingLogIn(page).click();
        await expect(loginShown(page)).toBeVisible();
        const link = page.getByRole("link", { name: "read how Compass handles privacy" });
        await expect(link).toHaveAttribute("href", "/privacy.html");
        await expect(link).toHaveAttribute("target", "_blank");
        const opened = page.context().waitForEvent("page");
        await link.click();
        const tab = await opened;
        await tab.waitForLoadState();
        await expect(tab).toHaveTitle("Compass Privacy Notice");
        await tab.close();
      },
    },
    {
      id: "index-head",
      what: "The page is titled \"Compass\" with the description \"Compass — a quiet place to see where you are, in time, in plan, in learning.\", a theme color equal to the primary-100 background, and marked notranslate throughout",
      async run(j) {
        const { page, expect } = j;
        await j.open("/");
        await expect(page).toHaveTitle("Compass");
        await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", "Compass — a quiet place to see where you are, in time, in plan, in learning.");
        const theme = await page.locator('meta[name="theme-color"]').getAttribute("content");
        const token = await page.locator("html").evaluate((html) => html.ownerDocument.defaultView.getComputedStyle(html).getPropertyValue("--primary-100").trim());
        if (theme?.toLowerCase() !== token.toLowerCase()) throw new Error(`The theme color is ${theme}, primary-100 is ${token}.`);
        await expect(page.locator("html")).toHaveClass(/\bnotranslate\b/);
        await expect(page.locator("html")).toHaveAttribute("translate", "no");
        await expect(page.locator('meta[name="google"]')).toHaveAttribute("content", "notranslate");
        await expect(page.locator("body")).toHaveAttribute("translate", "no");
        await expect(page.locator("#root")).toHaveClass(/\bnotranslate\b/);
      },
    },
  ],
};
