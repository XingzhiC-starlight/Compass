import { landingLogIn, loginShown } from "../screens.mjs";

const FRAME = (depth, thoughts) => `/landing/demo/frame-${depth ? "depth" : "summary"}-${thoughts ? "thoughts" : "task"}.png`;

async function shownFrame(j, depth, thoughts) {
  const { page, expect } = j;
  await expect(page.locator(".landing-demo-frame.visible")).toHaveAttribute("src", FRAME(depth, thoughts));
  await expect(page.locator(".landing-demo-frame.visible")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator(".landing-demo-frame")).toHaveCount(4);
  const summaryOrDepth = page.getByRole("group", { name: "Summary or depth view" });
  await expect(summaryOrDepth.getByRole("button", { name: "Depth" })).toHaveAttribute("aria-pressed", String(depth));
  await expect(summaryOrDepth.getByRole("button", { name: "Summary" })).toHaveAttribute("aria-pressed", String(!depth));
  const taskOrThoughts = page.getByRole("group", { name: "Task or Thoughts panel" });
  await expect(taskOrThoughts.getByRole("button", { name: "Thoughts" })).toHaveAttribute("aria-pressed", String(thoughts));
  await expect(taskOrThoughts.getByRole("button", { name: "Task" })).toHaveAttribute("aria-pressed", String(!thoughts));
}

export default {
  name: "landing",
  section: "§15",
  title: "Landing page",
  account: false,
  steps: [
    {
      id: "ld-sections",
      what: "Signed out, the landing page shows its top bar, hero, five categories, product intro, demo, closing call and footer, in that order, with their final copy",
      async run(j) {
        const { page, expect } = j;
        await j.open("/");
        const banner = page.getByRole("banner");
        await expect(banner.getByText("Compass", { exact: true })).toBeVisible();
        await expect(landingLogIn(page)).toBeVisible();
        const hero = page.getByRole("heading", { level: 1 });
        await expect(hero.locator(".zig")).toHaveText("From scattered tasks");
        await expect(hero.locator(".zag")).toHaveText("to structured projects");
        await expect(page.getByText("A workspace for complex self-directed projects.", { exact: true })).toBeVisible();
        const picture = page.getByRole("img", { name: "Scattered notes and lists on the left; a person walks into a clean structured band of five labeled panels on the right." });
        await expect(picture).toHaveAttribute("src", "/landing/theme-pic.png");
        for (const [label, copy] of [
          ["Commitment", "Know how much time you can realistically put into your work."],
          ["Timeline", "Have a phase-to-phase plan for complex projects."],
          ["Learning", "Discover the knowledge gaps before success."],
          ["Task", "What to do now lives under the structure."],
          ["Thought", "Thoughts, personal reflections, and learned knowledge."],
        ]) {
          await expect(page.locator(".landing-card-label", { hasText: new RegExp(`^${label}$`) })).toBeVisible();
          await expect(page.getByText(copy, { exact: true })).toBeVisible();
        }
        await expect(page.getByText("A second view of Task", { exact: true })).toBeVisible();
        await expect(page.getByText("Where am I", { exact: true })).toBeVisible();
        await expect(page.getByText("What now", { exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { level: 2, name: "A simple workspace for personal project management" })).toBeVisible();
        await expect(page.getByText("Clear architecture, flexible adjustment, continuous improvement", { exact: true })).toBeVisible();
        await expect(page.getByText("Click any card to open its detail.", { exact: true })).toBeVisible();
        await expect(page.getByText("Start your first project.", { exact: true })).toBeVisible();
        await expect(page.locator(".landing-cta").getByRole("button", { name: "Log in", exact: true })).toBeVisible();
        const shapes = page.locator(".landing-shapes");
        await expect(shapes).toHaveAttribute("aria-hidden", "true");
        await expect(shapes.locator(":scope > div")).toHaveCount(5);
        const footer = page.getByRole("contentinfo");
        await expect(footer).toHaveText("Compass");
        const order = [banner, hero, page.getByText("Where am I", { exact: true }), page.getByRole("heading", { level: 2 }),
          page.getByText("Click any card to open its detail.", { exact: true }), page.getByText("Start your first project.", { exact: true }), footer];
        const tops = [];
        for (const part of order) tops.push((await part.boundingBox()).y + (await page.evaluate(() => globalThis.scrollY)));
        if (tops.some((top, at) => at > 0 && top <= tops[at - 1])) throw new Error(`The sections are not in order from the top: ${tops.map(Math.round).join(", ")}.`);
        j.note(`Section tops (px): ${tops.map(Math.round).join(", ")}`);
      },
    },
    {
      id: "ld-demo-controls",
      what: "The demo's two segmented controls pick one of the four mounted frames, Summary/Depth and Task/Thoughts, each carrying its state in aria-pressed",
      async run(j) {
        const { page } = j;
        await page.locator(".landing-demo").scrollIntoViewIfNeeded();
        await shownFrame(j, false, false);
        await page.getByRole("group", { name: "Summary or depth view" }).getByRole("button", { name: "Depth" }).click();
        await shownFrame(j, true, false);
        await page.getByRole("group", { name: "Task or Thoughts panel" }).getByRole("button", { name: "Thoughts" }).click();
        await shownFrame(j, true, true);
        await page.getByRole("group", { name: "Summary or depth view" }).getByRole("button", { name: "Summary" }).click();
        await shownFrame(j, false, true);
        await page.getByRole("group", { name: "Task or Thoughts panel" }).getByRole("button", { name: "Task" }).click();
        await shownFrame(j, false, false);
      },
    },
    {
      id: "ld-demo-hotspots",
      what: "Wider than 768 px, the hotspots over the three upper cards flip summary and depth, and the one over the panel header flips Task and Thoughts",
      async run(j) {
        const { page, expect } = j;
        const cards = page.getByRole("button", { name: "Toggle summary or depth view" });
        const panel = page.getByRole("button", { name: "Switch between Task and Thoughts panel" });
        await expect(cards).toHaveCount(3);
        await expect(panel).toHaveCount(1);
        await cards.nth(1).click();
        await shownFrame(j, true, false);
        await panel.click();
        await shownFrame(j, true, true);
        await cards.nth(2).click();
        await shownFrame(j, false, true);
        await panel.click();
        await shownFrame(j, false, false);
      },
    },
    {
      id: "ld-demo-narrow",
      what: "At 768 px and below the hotspots are absent, a note says to use the controls, and the controls still work; at 769 px the hotspots are back",
      async run(j) {
        const { page, expect } = j;
        await page.setViewportSize({ width: 768, height: 900 });
        await expect(page.getByRole("button", { name: "Toggle summary or depth view" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Switch between Task and Thoughts panel" })).toHaveCount(0);
        await expect(page.getByText("Compass is built for desktop — use the controls above to explore.", { exact: true })).toBeVisible();
        await page.getByRole("group", { name: "Summary or depth view" }).getByRole("button", { name: "Depth" }).click();
        await shownFrame(j, true, false);
        await page.getByRole("group", { name: "Summary or depth view" }).getByRole("button", { name: "Summary" }).click();
        await j.snap("768px");
        await page.setViewportSize({ width: 769, height: 900 });
        await expect(page.getByRole("button", { name: "Toggle summary or depth view" })).toHaveCount(3);
        await expect(page.getByText("Compass is built for desktop — use the controls above to explore.", { exact: true })).toHaveCount(0);
        await page.setViewportSize({ width: 1440, height: 900 });
      },
    },
    {
      id: "ld-reduced-motion",
      what: "Frames cross-fade over 300 ms, and under prefers-reduced-motion they swap with no fade",
      async run(j) {
        const { page, expect } = j;
        const frame = page.locator(".landing-demo-frame").first();
        const fade = () => frame.evaluate((el) => {
          const style = el.ownerDocument.defaultView.getComputedStyle(el);
          return `${style.transitionProperty} ${style.transitionDuration}`;
        });
        await expect.poll(fade).toBe("opacity 0.3s");
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect.poll(fade).toMatch(/ 0s$/);
        j.note(`With reduced motion: ${await fade()}`);
        await page.emulateMedia({ reducedMotion: "no-preference" });
      },
    },
    {
      id: "ld-log-in-pills",
      what: "Both Log in pills open the login screen, and the login screen's Compass wordmark returns to the landing page",
      async run(j) {
        const { page, expect } = j;
        await landingLogIn(page).click();
        await expect(loginShown(page)).toBeVisible();
        await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
        await loginShown(page).click();
        await expect(landingLogIn(page)).toBeVisible();
        await page.locator(".landing-cta").getByRole("button", { name: "Log in", exact: true }).click();
        await expect(loginShown(page)).toBeVisible();
        await loginShown(page).click();
        await expect(landingLogIn(page)).toBeVisible();
      },
    },
  ],
};
