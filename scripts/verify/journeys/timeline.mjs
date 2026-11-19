import { card, daysAgo, exactly, localDay, projectPill } from "../screens.mjs";

function rows(page) {
  return card(page, "timeline").locator("li.row");
}

function row(page, name) {
  return rows(page).filter({ has: page.locator(".row-name", { hasText: exactly(name) }) });
}

async function names(page) {
  return (await card(page, "timeline").locator("li.row .row-name").allTextContents()).map((name) => name.trim());
}

async function stored(j, project) {
  const [found] = await j.rows("projects", `select=id&name=eq.${encodeURIComponent(project)}`);
  return j.rows("phases", `select=name,est_days,sort_order,is_done,completed_at&project_id=eq.${found.id}&order=sort_order`);
}

function bar(page) {
  return card(page, "timeline").locator(".glance-bar-fill");
}

export default {
  name: "timeline",
  section: "§9",
  title: "Timeline card",
  steps: [
    {
      id: "tl-glance",
      what: "A new project's glance: eyebrow \"Phase 1 of 2\", the current phase's name as the hero, and an empty bar on its first day",
      async run(j) {
        const { page, expect } = j;
        await j.signIn();
        await j.setUp("Path");
        const timeline = card(page, "timeline");
        await expect(timeline.locator(".glance-eyebrow")).toHaveText("Phase 1 of 2");
        await expect(timeline.locator(".glance-hero")).toHaveText("Sketch the screens");
        await expect(bar(page)).toHaveAttribute("style", /width: 0%/);
      },
    },
    {
      id: "tl-glance-rename",
      what: "The hero renames the current phase in place and the name is stored; an empty name keeps the old one",
      async run(j) {
        const { page, expect } = j;
        const timeline = card(page, "timeline");
        await timeline.locator(".glance-hero").click();
        await timeline.locator("input.glance-hero-input").fill("Sketch every screen");
        await timeline.locator("input.glance-hero-input").press("Enter");
        await expect(timeline.locator(".glance-hero")).toHaveText("Sketch every screen");
        await expect.poll(async () => (await stored(j, "Path"))[0].name).toBe("Sketch every screen");
        await timeline.locator(".glance-hero").click();
        await timeline.locator("input.glance-hero-input").fill("");
        await timeline.locator("input.glance-hero-input").press("Enter");
        await expect(timeline.locator(".glance-hero")).toHaveText("Sketch every screen");
        await page.waitForTimeout(300);
        if ((await stored(j, "Path"))[0].name !== "Sketch every screen") throw new Error("An empty name was stored.");
      },
    },
    {
      id: "tl-depth",
      what: "Depth shows \"Phases\" and \"0/2 done\"; each row has a grip, a done circle (\"Mark phase done\"), the name with \"now\" on the current phase (its row washed), × (\"Delete phase\") and the days (\"4d\", \"Click to edit days\")",
      async run(j) {
        const { page, expect } = j;
        await j.depth();
        const timeline = card(page, "timeline");
        await expect(timeline.locator(".col-head")).toHaveText(/Phases\s*0\/2 done/);
        const first = rows(page).first();
        await expect(first.locator(".row-handle")).toBeVisible();
        await expect(first.getByRole("button", { name: "Mark phase done", exact: true })).toHaveAttribute("aria-pressed", "false");
        await expect(first.locator(".now-tag")).toHaveText("now");
        await expect(first).toHaveClass(/\bcurrent\b/);
        await expect(first.getByRole("button", { name: "Delete phase" })).toBeVisible();
        await expect(first.getByTitle("Click to edit days")).toHaveText("4d");
        await expect(rows(page).nth(1).locator(".now-tag")).toHaveCount(0);
      },
    },
    {
      id: "tl-tick",
      what: "Ticking a phase stores today as its completion day and marks the row done (struck through); \"now\" moves on, the eyebrow reads Phase 2 of 2 and Commitment's Day count restarts; unticking clears the day",
      async run(j) {
        const { page, expect } = j;
        const first = rows(page).first();
        await first.getByRole("button", { name: "Mark phase done", exact: true }).click();
        await expect(first.getByRole("button", { name: "Mark phase not done", exact: true })).toHaveAttribute("aria-pressed", "true");
        await expect(first).toHaveClass(/\bdone\b/);
        await expect(first.locator(".row-name")).toHaveCSS("text-decoration-line", "line-through");
        await expect(rows(page).nth(1).locator(".now-tag")).toHaveText("now");
        await expect(card(page, "timeline").locator(".glance-eyebrow")).toHaveText("Phase 2 of 2");
        await expect(card(page, "timeline").locator(".col-head")).toContainText("1/2 done");
        await expect(card(page, "time").locator(".glance-eyebrow")).toHaveText("Day 1 / 6 · Goal 2h");
        await expect.poll(async () => (await stored(j, "Path"))[0].completed_at).toBe(localDay());
        await j.snap("ticked");
        await first.getByRole("button", { name: "Mark phase not done", exact: true }).click();
        await expect(first.locator(".now-tag")).toHaveText("now");
        await expect.poll(async () => (await stored(j, "Path"))[0].completed_at).toBe(null);
      },
    },
    {
      id: "tl-rename-row",
      what: "A row's name (\"Click to rename\") renames in place and is stored; an empty name keeps the old one",
      async run(j) {
        const { page, expect } = j;
        const second = rows(page).nth(1);
        await expect(second.locator(".row-name")).toHaveAttribute("title", "Click to rename");
        await second.locator(".row-name").click();
        await second.locator("input.row-name-input").fill("Build the pages");
        await second.locator("input.row-name-input").press("Enter");
        await expect(second.locator(".row-name")).toHaveText("Build the pages");
        await expect.poll(async () => (await stored(j, "Path"))[1].name).toBe("Build the pages");
        await second.locator(".row-name").click();
        await second.locator("input.row-name-input").fill("");
        await second.locator("input.row-name-input").press("Enter");
        await expect(second.locator(".row-name")).toHaveText("Build the pages");
      },
    },
    {
      id: "tl-days",
      what: "The days (\"4d\") edit in a number field named \"Days for …\" and are stored whole and non-negative: 5 → 5d, 2.7 → 2d, -3 → 0d",
      async run(j) {
        const { page, expect } = j;
        const first = rows(page).first();
        for (const [typed, shown, kept] of [["5", "5d", 5], ["2.7", "2d", 2], ["-3", "0d", 0], ["4", "4d", 4]]) {
          await first.getByTitle("Click to edit days").click();
          const field = first.getByRole("spinbutton", { name: "Days for Sketch every screen" });
          await field.fill(typed);
          await field.press("Enter");
          await expect(first.getByTitle("Click to edit days")).toHaveText(shown);
          await expect.poll(async () => (await stored(j, "Path"))[0].est_days).toBe(kept);
        }
      },
    },
    {
      id: "tl-add",
      what: "+ Add a phase opens \"Name a phase, press Enter…\", which stays open after each Enter; each new phase is stored last with 1 day",
      async run(j) {
        const { page, expect } = j;
        await card(page, "timeline").getByRole("button", { name: "+ Add a phase" }).click();
        const box = card(page, "timeline").getByPlaceholder("Name a phase, press Enter…");
        await box.fill("Polish");
        await box.press("Enter");
        await expect(row(page, "Polish")).toBeVisible();
        await expect(box).toHaveValue("");
        await expect(box).toBeFocused();
        await box.fill("Ship");
        await box.press("Enter");
        await expect(row(page, "Ship")).toBeVisible();
        await box.press("Escape");
        await expect(box).toHaveCount(0);
        await expect.poll(() => names(page)).toEqual(["Sketch every screen", "Build the pages", "Polish", "Ship"]);
        const kept = await stored(j, "Path");
        if (JSON.stringify(kept.slice(2).map((one) => [one.name, one.est_days])) !== JSON.stringify([["Polish", 1], ["Ship", 1]])) {
          throw new Error(`The new phases are stored as ${JSON.stringify(kept.slice(2))}.`);
        }
      },
    },
    {
      id: "tl-delete",
      what: "× (\"Delete phase\") removes the phase from the card and from storage",
      async run(j) {
        const { page, expect } = j;
        await row(page, "Ship").getByRole("button", { name: "Delete phase" }).click();
        await expect(row(page, "Ship")).toHaveCount(0);
        await expect.poll(async () => (await stored(j, "Path")).map((one) => one.name)).toEqual(["Sketch every screen", "Build the pages", "Polish"]);
      },
    },
    {
      id: "tl-reorder",
      what: "A row drags by its grip to a new place; the order is stored and survives a reload, and the first phase not done becomes the current one",
      async run(j) {
        const { page, expect } = j;
        await row(page, "Polish").locator(".row-handle").dragTo(rows(page).first(), { targetPosition: { x: 30, y: 3 } });
        await expect.poll(() => names(page)).toEqual(["Polish", "Sketch every screen", "Build the pages"]);
        await expect(card(page, "timeline").locator(".glance-hero")).toHaveText("Polish");
        await page.reload();
        await expect(card(page, "timeline").locator(".glance-hero")).toHaveText("Polish");
        await expect.poll(async () => (await stored(j, "Path")).map((one) => one.name)).toEqual(["Polish", "Sketch every screen", "Build the pages"]);
      },
    },
    {
      id: "tl-all-done",
      what: "With every phase done: no \"now\" tag, hero \"All phases done\", eyebrow \"Phase 3 of 3\", a full bar, Commitment reads \"Done\"",
      async run(j) {
        const { page, expect } = j;
        await j.tickEveryPhase();
        const timeline = card(page, "timeline");
        await expect(timeline.locator(".now-tag")).toHaveCount(0);
        await expect(timeline.locator(".glance-hero")).toHaveText("All phases done");
        await expect(timeline.locator(".glance-eyebrow")).toHaveText("Phase 3 of 3");
        await expect(timeline.locator(".col-head")).toContainText("3/3 done");
        await expect(bar(page)).toHaveAttribute("style", /width: 100%/);
        await expect(card(page, "time").locator(".glance-eyebrow")).toHaveText("Done · Goal 2h");
      },
    },
    {
      id: "tl-no-phases",
      what: "With no phases the eyebrow reads \"No phases yet\" and the hero \"—\"",
      async run(j) {
        const { page, expect } = j;
        const remove = card(page, "timeline").getByRole("button", { name: "Delete phase" });
        for (let left = await remove.count(); left > 0; left -= 1) {
          await remove.first().click();
          await expect(remove).toHaveCount(left - 1);
        }
        await expect(card(page, "timeline").locator(".glance-eyebrow")).toHaveText("No phases yet");
        await expect(card(page, "timeline").locator(".glance-hero")).toHaveText("—");
        await j.summary();
      },
    },
    {
      id: "tl-calendar-bar",
      what: "The bar runs on the planned calendar: three days into a 4-day first phase it is 75%; once that phase is ticked the second phase's planned start is a day ahead, so the bar reads 0% while Commitment's Day count restarts at 1",
      limit: 90_000,
      async run(j) {
        const { expect } = j;
        await j.newVisit({ clock: daysAgo(3) });
        await j.signIn();
        await j.setUp("Planned");
        await j.newVisit();
        await j.signIn();
        const { page } = j;
        await projectPill(page, "Planned").click();
        await expect(bar(page)).toHaveAttribute("style", /width: 75%/);
        await expect(card(page, "time").locator(".glance-eyebrow")).toHaveText("Day 4 / 10 · Goal 2h");
        await j.snap("three-days-in");
        await j.depth();
        await rows(page).first().getByRole("button", { name: "Mark phase done", exact: true }).click();
        await expect(bar(page)).toHaveAttribute("style", /width: 0%/);
        await expect(card(page, "time").locator(".glance-eyebrow")).toHaveText("Day 1 / 6 · Goal 2h");
        await j.summary();
      },
    },
    {
      id: "tl-midnight-advance",
      what: "With the tab open across midnight the bar advances by itself: a 2-day phase goes from 0% to 50% at midnight",
      limit: 90_000,
      async run(j) {
        const { expect } = j;
        const late = daysAgo(1, 23, 58);
        await j.newVisit({ clock: late });
        await j.signIn();
        await j.setUp("Overnight", { phases: [["Two days", "2"]] });
        const { page } = j;
        await expect(bar(page)).toHaveAttribute("style", /width: 0%/);
        await page.clock.runFor(180_000);
        await expect(bar(page)).toHaveAttribute("style", /width: 50%/);
      },
    },
  ],
};
