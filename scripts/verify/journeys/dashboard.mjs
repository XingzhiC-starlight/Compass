import { card, projectPill, savedNote } from "../screens.mjs";

const FAILED_SAVE = [/^\[compass\] a save failed: /, /^Failed to load resource: net::ERR_/];

async function inDepth(page) {
  return page.locator("main.dashboard").evaluate((el) => el.classList.contains("depth"));
}

async function cues(page) {
  return (await page.locator(".upper-row .glance-cue").allTextContents()).join("");
}

async function projectId(j, name) {
  const [found] = await j.rows("projects", `select=id&name=eq.${encodeURIComponent(name)}`);
  return found.id;
}

async function holdPosts(page, table) {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const pattern = `**/rest/v1/${table}**`;
  await page.route(pattern, async (route) => {
    if (route.request().method() === "POST") await held;
    await route.fallback();
  });
  return async () => {
    release();
    await page.unroute(pattern);
  };
}

export default {
  name: "dashboard",
  section: "§7",
  title: "Dashboard shell",
  steps: [
    {
      id: "ds-layout",
      what: "The dashboard is the sidebar and a main area with no header bar: Commitment, Timeline and Learning in one row above the full-width Daily Task panel",
      async run(j) {
        const { page, expect } = j;
        await j.signIn();
        await j.setUp("Shell A");
        await j.setUp("Shell B", { phases: [["B one", "2"], ["B two", "3"]], learning: [["B skill", "30"]] });
        await projectPill(page, "Shell A").click();
        await expect(card(page, "timeline").locator(".glance-hero")).toHaveText("Sketch the screens");
        await expect(page.getByRole("banner")).toHaveCount(0);
        const boxes = [];
        for (const [which, title] of [["time", "Commitment"], ["timeline", "Timeline"], ["learning", "Learning"]]) {
          await expect(card(page, which).getByRole("heading", { level: 2, name: title, exact: true })).toBeVisible();
          boxes.push(await card(page, which).boundingBox());
        }
        const panel = await card(page, "task").boundingBox();
        if (!(boxes[0].x < boxes[1].x && boxes[1].x < boxes[2].x)) throw new Error("The three bubbles are not left to right.");
        if (Math.abs(boxes[0].y - boxes[2].y) > 2) throw new Error("The three bubbles are not in one row.");
        if (!(panel.y > boxes[0].y + boxes[0].height)) throw new Error("The Daily Task panel is not below the bubbles.");
        const rowWidth = boxes[2].x + boxes[2].width - boxes[0].x;
        if (Math.abs(panel.width - rowWidth) > 4) throw new Error(`The panel is ${Math.round(panel.width)} px wide, the row ${Math.round(rowWidth)} px.`);
      },
    },
    {
      id: "ds-summary-depth",
      what: "Clicking the negative space of any upper bubble flips all three together, summary ▸ ⇄ depth ▾, with each bubble's depth content in place; the Daily Task panel stays as it is",
      async run(j) {
        const { page, expect } = j;
        if (await inDepth(page)) await j.summary();
        await expect.poll(() => cues(page)).toBe("▸▸▸");
        await card(page, "time").getByRole("heading", { name: "Commitment" }).click();
        await expect.poll(() => cues(page)).toBe("▾▾▾");
        await expect(card(page, "time").getByRole("button", { name: /^Days ⇄$/ })).toBeVisible();
        await expect(card(page, "timeline").locator(".col-head")).toContainText("Phases");
        await expect(card(page, "learning").locator(".col-head")).toContainText("Skill");
        await expect(card(page, "task").getByRole("button", { name: "+ Add a task" })).toBeVisible();
        await j.snap("depth");
        const learning = card(page, "learning");
        const box = await learning.boundingBox();
        await learning.click({ position: { x: box.width - 24, y: box.height - 16 } });
        await expect.poll(() => cues(page)).toBe("▸▸▸");
        const timeline = card(page, "timeline");
        const tbox = await timeline.boundingBox();
        await timeline.click({ position: { x: tbox.width - 24, y: tbox.height - 12 } });
        await expect.poll(() => cues(page)).toBe("▾▾▾");
        await j.summary();
      },
    },
    {
      id: "ds-controls-keep-view",
      what: "A click on a control never flips the view (the clock button, the slider, a row in depth), and neither does a click that ends a text-selection drag",
      async run(j) {
        const { page, expect } = j;
        await card(page, "time").getByRole("button", { name: "Start work session" }).click();
        await card(page, "time").getByRole("button", { name: "Stop work session" }).click();
        await page.getByRole("slider").click();
        await expect.poll(() => inDepth(page)).toBe(false);
        await j.depth();
        await card(page, "timeline").locator("li.row").first().click({ position: { x: 4, y: 4 } });
        await expect.poll(() => inDepth(page)).toBe(true);
        await j.summary();
        const eyebrow = card(page, "time").locator(".glance-eyebrow");
        const text = await eyebrow.boundingBox();
        const bubble = await card(page, "time").boundingBox();
        await page.mouse.move(text.x + 1, text.y + text.height / 2);
        await page.mouse.down();
        await page.mouse.move(text.x + text.width - 1, text.y + text.height / 2, { steps: 4 });
        await page.mouse.move(bubble.x + bubble.width - 20, bubble.y + bubble.height - 10, { steps: 4 });
        await page.mouse.up();
        const selected = await page.evaluate(() => String(globalThis.getSelection()));
        if (selected.trim() === "") throw new Error("The drag selected no text.");
        j.note(`Selected by the drag: "${selected.trim()}"`);
        await expect.poll(() => inDepth(page)).toBe(false);
        const aside = await page.locator("aside.sidebar").boundingBox();
        await page.mouse.click(aside.x + aside.width / 2, aside.y + aside.height - 120);
      },
    },
    {
      id: "ds-stale-load",
      what: "Switching to Shell B and straight back to Shell A while B's read is still on its way keeps A on screen: the late payload for B is dropped",
      async run(j) {
        const { page, expect } = j;
        const b = await projectId(j, "Shell B");
        let release;
        const held = new Promise((resolve) => { release = resolve; });
        await page.route("**/rest/v1/**", async (route) => {
          if (route.request().url().includes(b)) await held;
          await route.fallback();
        });
        await projectPill(page, "Shell B").click();
        await expect(page.locator("main.dashboard")).toHaveText("Loading…");
        await projectPill(page, "Shell A").click();
        await expect(card(page, "timeline").locator(".glance-hero")).toHaveText("Sketch the screens");
        release();
        await page.waitForTimeout(800);
        await page.unroute("**/rest/v1/**");
        await expect(card(page, "timeline").locator(".glance-hero")).toHaveText("Sketch the screens");
        await expect(projectPill(page, "Shell A")).toHaveClass(/\bactive\b/);
      },
    },
    {
      id: "ds-load-failed",
      what: "When the project cannot be read, the cards read \"Couldn't load this project just now.\" with Try again, which loads it once the connection is back",
      console: FAILED_SAVE,
      async run(j) {
        const { page, expect } = j;
        await page.route("**/rest/v1/**", (route) => route.abort("internetdisconnected"));
        await projectPill(page, "Shell B").click();
        await expect(page.getByText("Couldn't load this project just now.", { exact: true })).toBeVisible();
        await expect(page.locator("aside.sidebar")).toBeVisible();
        await j.snap("failed");
        await page.unroute("**/rest/v1/**");
        await page.getByRole("button", { name: "Try again" }).click();
        await expect(card(page, "timeline").locator(".glance-hero")).toHaveText("B one");
      },
    },
    {
      id: "ds-failed-save",
      what: "A save that fails shows the calm note \"Couldn't save just now — try again in a moment.\" for about four seconds while the cards quietly re-read: nothing blanks, the add box keeps its words, nothing unsaved is shown, and the note echoes nothing typed",
      console: FAILED_SAVE,
      async run(j) {
        const { page, expect } = j;
        await card(page, "task").getByRole("button", { name: "+ Add a task" }).click();
        const box = card(page, "task").getByPlaceholder("Type a task, press Enter…");
        await page.route("**/rest/v1/daily_tasks**", (route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.fallback()));
        await box.fill("Will not be saved");
        await box.press("Enter");
        await expect(savedNote(page)).toBeVisible();
        await expect(savedNote(page)).not.toContainText("Will not be saved");
        await expect(box).toHaveValue("Will not be saved");
        await expect(card(page, "task").locator(".task-text", { hasText: "Will not be saved" })).toHaveCount(0);
        await expect(page.locator("main.dashboard")).not.toContainText("Loading…");
        await j.snap("note");
        await expect(savedNote(page)).toHaveCount(0, { timeout: 7_000 });
        const stored = await j.rows("daily_tasks", "select=text");
        if (stored.length !== 0) throw new Error("A refused task was stored.");
        await page.unroute("**/rest/v1/daily_tasks**");
        await box.press("Enter");
        await expect(card(page, "task").locator(".task-text", { hasText: "Will not be saved" })).toBeVisible();
        await expect(box).toHaveValue("");
      },
    },
    {
      id: "ds-add-box-waits",
      what: "An add box waits for its save: after Enter the words stay and take no typing (read-only, aria-busy), after half a second the box fades; on success it clears and stays open for the next entry",
      async run(j) {
        const { page, expect } = j;
        const box = card(page, "task").getByPlaceholder("Type a task, press Enter…");
        const release = await holdPosts(page, "daily_tasks");
        await box.fill("A slow task");
        await box.press("Enter");
        await expect(box).toHaveValue("A slow task");
        await expect(box).toHaveAttribute("readonly", "");
        await expect(box).toHaveAttribute("aria-busy", "true");
        await expect(box).toHaveClass(/\bsaving-slow\b/);
        await box.pressSequentially("xyz");
        await expect(box).toHaveValue("A slow task");
        await j.snap("waiting");
        await release();
        await expect(card(page, "task").locator(".task-text", { hasText: "A slow task" })).toBeVisible();
        await expect(box).toHaveValue("");
        await expect(box).toBeFocused();
        await expect(box).not.toHaveAttribute("aria-busy", "true");
        await box.press("Escape");
      },
    },
    {
      id: "ds-text-limits",
      what: "Every typed box stops at its column's limit, keeping the first part of a longer paste: 4,000 characters for a task or a thought, 200 for a phase or a skill",
      async run(j) {
        const { page, expect } = j;
        const long = (n) => Array.from({ length: n }, (_, i) => String.fromCharCode(97 + (i % 26))).join("");
        await card(page, "task").getByRole("button", { name: "+ Add a task" }).click();
        const task = card(page, "task").getByPlaceholder("Type a task, press Enter…");
        await task.fill(long(4100));
        await expect(task).toHaveValue(long(4000));
        await task.press("Escape");
        await j.depth();
        await card(page, "timeline").getByRole("button", { name: "+ Add a phase" }).click();
        const phase = card(page, "timeline").getByPlaceholder("Name a phase, press Enter…");
        await phase.fill(long(250));
        await expect(phase).toHaveValue(long(200));
        await phase.press("Escape");
        await card(page, "learning").getByRole("button", { name: "+ Add something to learn" }).click();
        const skill = card(page, "learning").getByPlaceholder("Name a skill, press Enter…");
        await skill.fill(long(250));
        await expect(skill).toHaveValue(long(200));
        await skill.press("Escape");
        await card(page, "task").getByRole("button", { name: "Thought log" }).click();
        await card(page, "task").getByRole("button", { name: "+ Add a thought" }).click();
        const thought = card(page, "task").getByPlaceholder("What's on your mind? Press Enter to add…");
        await thought.fill(long(4100));
        await expect(thought).toHaveValue(long(4000));
        await thought.press("Escape");
        await card(page, "task").getByRole("button", { name: "Task list" }).click();
        await j.summary();
      },
    },
    {
      id: "ds-semantics",
      what: "The panel's segmented control carries aria-pressed and the Learning slider role=slider with its name and value; the bubbles' summary/depth toggle is a click only, with no keyboard stop",
      async run(j) {
        const { page, expect } = j;
        const group = page.getByRole("group", { name: "Switch panel view" });
        await expect(group.getByRole("button", { name: "Task list" })).toHaveAttribute("aria-pressed", "true");
        await expect(group.getByRole("button", { name: "Thought log" })).toHaveAttribute("aria-pressed", "false");
        const slider = page.getByRole("slider", { name: "Progress for B skill" });
        await expect(slider).toHaveAttribute("aria-valuemin", "0");
        await expect(slider).toHaveAttribute("aria-valuemax", "100");
        await expect(slider).toHaveAttribute("aria-valuenow", /^\d+$/);
        for (const which of ["time", "timeline", "learning"]) {
          if ((await card(page, which).getAttribute("tabindex")) !== null) throw new Error(`The ${which} bubble can take keyboard focus.`);
        }
      },
    },
    {
      id: "ds-derived",
      what: "The cards share what the dashboard derives: remaining days (unfinished phases' days, 4 + 6), Day n from the current phase start (1 again once a phase is ticked) and all phases done",
      async run(j) {
        const { page, expect } = j;
        await projectPill(page, "Shell A").click();
        const eyebrow = card(page, "time").locator(".glance-eyebrow");
        await expect(eyebrow).toHaveText(/^Day 1 \/ 10 · Goal \d+(\.\d)?h$/);
        await j.depth();
        const notDone = card(page, "timeline").getByRole("button", { name: "Mark phase done", exact: true });
        await notDone.first().click();
        await expect(eyebrow).toHaveText(/^Day 1 \/ 6 · Goal /);
        await notDone.first().click();
        await expect(eyebrow).toHaveText(/^Done · Goal /);
        await card(page, "timeline").getByRole("button", { name: "Mark phase not done", exact: true }).last().click();
        await expect(eyebrow).toHaveText(/^Day 1 \/ 6 · Goal /);
      },
    },
  ],
};
