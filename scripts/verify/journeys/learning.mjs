import { card, exactly } from "../screens.mjs";

function rows(page) {
  return card(page, "learning").locator("li.row");
}

function row(page, name) {
  return rows(page).filter({ has: page.locator(".row-name", { hasText: exactly(name) }) });
}

async function names(page) {
  return (await card(page, "learning").locator("li.row .row-name").allTextContents()).map((name) => name.trim());
}

async function stored(j) {
  return j.rows("learning_items", "select=name,progress_pct,is_focus,sort_order&order=sort_order");
}

async function focusIs(j, name) {
  await j.expect.poll(async () => (await stored(j)).filter((one) => one.is_focus).map((one) => one.name)).toEqual([name]);
  await j.expect(row(j.page, name).locator(".focus-tag")).toHaveText("focus");
  await j.expect(rows(j.page).locator(".focus-tag")).toHaveCount(1);
}

async function progressOf(j, name) {
  return (await stored(j)).find((one) => one.name === name)?.progress_pct;
}

async function inDepth(page) {
  return page.locator("main.dashboard").evaluate((el) => el.classList.contains("depth"));
}

async function toggleDone(j, name, to) {
  await row(j.page, name).getByRole("button", { name: to ? "Mark learning item done" : "Mark learning item not done", exact: true }).click();
  await j.expect(row(j.page, name).getByRole("button", { name: to ? "Mark learning item not done" : "Mark learning item done", exact: true })).toBeVisible();
}

export default {
  name: "learning",
  section: "§10",
  title: "Learning card",
  steps: [
    {
      id: "lr-glance",
      what: "The glance shows the focus item: eyebrow \"10% · Focus\", its name as the hero, and a slider named \"Progress for Layout basics\" at 10",
      async run(j) {
        const { page, expect } = j;
        await j.signIn();
        await j.setUp("Skills");
        const learning = card(page, "learning");
        await expect(learning.locator(".glance-eyebrow")).toHaveText("10% · Focus");
        await expect(learning.locator(".glance-hero")).toHaveText("Layout basics");
        await expect(learning.getByRole("slider", { name: "Progress for Layout basics" })).toHaveAttribute("aria-valuenow", "10");
      },
    },
    {
      id: "lr-slider-drag",
      what: "Dragging along the slider sets the focus item's progress without leaving summary view, even when the release drifts off the track onto the card (the click it makes is swallowed)",
      async run(j) {
        const { page, expect } = j;
        const slider = card(page, "learning").getByRole("slider");
        const box = await slider.boundingBox();
        const y = box.y + box.height / 2;
        await page.mouse.move(box.x + box.width * 0.3, y);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.6, y, { steps: 6 });
        await page.mouse.move(box.x + box.width * 0.6, y + 18, { steps: 3 });
        await page.mouse.up();
        await expect(slider).toHaveAttribute("aria-valuenow", "60");
        await expect(card(page, "learning").locator(".glance-eyebrow")).toHaveText("60% · Focus");
        await page.waitForTimeout(300);
        if (await inDepth(page)) throw new Error("The drag's release flipped the view to depth.");
        await expect.poll(() => progressOf(j, "Layout basics")).toBe(60);
      },
    },
    {
      id: "lr-slider-keys",
      what: "With the keyboard the slider moves by 5 (→/↑ up, ←/↓ down), Home goes to 0 and End to 100; End completes the focus item, so the focus moves to the next open item",
      async run(j) {
        const { page, expect } = j;
        const slider = card(page, "learning").getByRole("slider");
        await slider.focus();
        for (const [key, value] of [["ArrowRight", "65"], ["ArrowUp", "70"], ["ArrowLeft", "65"], ["ArrowDown", "60"], ["Home", "0"]]) {
          await page.keyboard.press(key);
          await expect(slider).toHaveAttribute("aria-valuenow", value);
        }
        await expect(card(page, "learning").locator(".glance-eyebrow")).toHaveText("0% · Focus");
        await page.keyboard.press("End");
        await expect(card(page, "learning").locator(".glance-hero")).toHaveText("Colour");
        await expect(card(page, "learning").locator(".glance-eyebrow")).toHaveText("30% · Focus");
        await expect.poll(() => progressOf(j, "Layout basics")).toBe(100);
        await j.depth();
        await focusIs(j, "Colour");
        await j.summary();
      },
    },
    {
      id: "lr-glance-rename",
      what: "The hero renames the focus item in place, and the name is stored",
      async run(j) {
        const { page, expect } = j;
        const learning = card(page, "learning");
        await learning.locator(".glance-hero").click();
        await learning.locator("input.glance-hero-input").fill("Colour theory");
        await learning.locator("input.glance-hero-input").press("Enter");
        await expect(learning.locator(".glance-hero")).toHaveText("Colour theory");
        await expect.poll(async () => (await stored(j)).map((one) => one.name)).toEqual(["Layout basics", "Colour theory"]);
      },
    },
    {
      id: "lr-depth",
      what: "Depth shows \"Skill\" and \"Progress\" and the rows in the user's order, each with a grip, a completion circle, the name, \"focus\" on the focus item, × (\"Delete item\") and the percent (\"Click to edit progress\"); a done row is struck through",
      async run(j) {
        const { page, expect } = j;
        await j.depth();
        await expect(card(page, "learning").locator(".col-head")).toHaveText(/Skill\s*Progress/);
        await expect.poll(() => names(page)).toEqual(["Layout basics", "Colour theory"]);
        const done = row(page, "Layout basics");
        await expect(done).toHaveClass(/\bdone\b/);
        await expect(done.getByRole("button", { name: "Mark learning item not done", exact: true })).toHaveAttribute("aria-pressed", "true");
        await expect(done.locator(".row-name")).toHaveCSS("text-decoration-line", "line-through");
        await expect(done.getByTitle("Click to edit progress")).toHaveText("100%");
        const open = row(page, "Colour theory");
        await expect(open.locator(".row-handle")).toBeVisible();
        await expect(open.getByRole("button", { name: "Mark learning item done", exact: true })).toHaveAttribute("aria-pressed", "false");
        await expect(open.getByRole("button", { name: "Delete item" })).toBeVisible();
        await expect(open.getByTitle("Click to edit progress")).toHaveText("30%");
        await focusIs(j, "Colour theory");
      },
    },
    {
      id: "lr-add",
      what: "+ Add something to learn opens \"Name a skill, press Enter…\", which stays open after each Enter; new items start at 0% and go last, and the focus stays on the open focus item",
      async run(j) {
        const { page, expect } = j;
        await card(page, "learning").getByRole("button", { name: "+ Add something to learn" }).click();
        const box = card(page, "learning").getByPlaceholder("Name a skill, press Enter…");
        await box.fill("Typography");
        await box.press("Enter");
        await expect(row(page, "Typography")).toBeVisible();
        await expect(box).toBeFocused();
        await box.fill("Spacing");
        await box.press("Enter");
        await expect(row(page, "Spacing")).toBeVisible();
        await box.press("Escape");
        await expect.poll(() => names(page)).toEqual(["Layout basics", "Colour theory", "Typography", "Spacing"]);
        await expect(row(page, "Spacing").getByTitle("Click to edit progress")).toHaveText("0%");
        await focusIs(j, "Colour theory");
        const kept = await stored(j);
        if (kept.at(-1).name !== "Spacing" || kept.at(-1).progress_pct !== 0) throw new Error(`The new items are stored as ${JSON.stringify(kept.slice(2))}.`);
      },
    },
    {
      id: "lr-complete",
      what: "Completing the focus item sets 100% and moves the focus to the next open item; unmarking it restores the value it had and sends the focus to the first open item in list order",
      async run(j) {
        const { page, expect } = j;
        await toggleDone(j, "Colour theory", true);
        await expect(row(page, "Colour theory").getByTitle("Click to edit progress")).toHaveText("100%");
        await focusIs(j, "Typography");
        await toggleDone(j, "Colour theory", false);
        await expect(row(page, "Colour theory").getByTitle("Click to edit progress")).toHaveText("30%");
        await expect.poll(() => progressOf(j, "Colour theory")).toBe(30);
        await focusIs(j, "Colour theory");
      },
    },
    {
      id: "lr-percent",
      what: "The percent edits in a 0–100 number field: 45 and Enter stores 45; an empty entry writes nothing and Escape cancels",
      async run(j) {
        const { page, expect } = j;
        const typography = row(page, "Typography");
        await typography.getByTitle("Click to edit progress").click();
        await typography.getByRole("spinbutton").fill("45");
        await typography.getByRole("spinbutton").press("Enter");
        await expect(typography.getByTitle("Click to edit progress")).toHaveText("45%");
        await expect.poll(() => progressOf(j, "Typography")).toBe(45);
        await typography.getByTitle("Click to edit progress").click();
        await typography.getByRole("spinbutton").fill("");
        await typography.getByRole("spinbutton").press("Enter");
        await expect(typography.getByTitle("Click to edit progress")).toHaveText("45%");
        await typography.getByTitle("Click to edit progress").click();
        await typography.getByRole("spinbutton").fill("90");
        await typography.getByRole("spinbutton").press("Escape");
        await expect(typography.getByTitle("Click to edit progress")).toHaveText("45%");
        await page.waitForTimeout(300);
        if ((await progressOf(j, "Typography")) !== 45) throw new Error("A cancelled or empty entry was stored.");
      },
    },
    {
      id: "lr-reorder",
      what: "A row drags by its grip; nothing sorts by itself, and after a drag the first open row becomes the focus, passing over completed rows above it",
      async run(j) {
        const { page, expect } = j;
        await row(page, "Spacing").locator(".row-handle").dragTo(rows(page).first(), { targetPosition: { x: 30, y: 3 } });
        await expect.poll(() => names(page)).toEqual(["Spacing", "Layout basics", "Colour theory", "Typography"]);
        await focusIs(j, "Spacing");
        await row(page, "Layout basics").locator(".row-handle").dragTo(rows(page).first(), { targetPosition: { x: 30, y: 3 } });
        await expect.poll(() => names(page)).toEqual(["Layout basics", "Spacing", "Colour theory", "Typography"]);
        await focusIs(j, "Spacing");
        await expect.poll(async () => (await stored(j)).map((one) => one.name)).toEqual(["Layout basics", "Spacing", "Colour theory", "Typography"]);
      },
    },
    {
      id: "lr-unmark-after-reload",
      what: "The value a completed item had is remembered only while the card stays mounted: after a reload, unmarking it gives 0%",
      async run(j) {
        const { page, expect } = j;
        await toggleDone(j, "Typography", true);
        await expect.poll(() => progressOf(j, "Typography")).toBe(100);
        await page.reload();
        await j.depth();
        await toggleDone(j, "Typography", false);
        await expect(row(page, "Typography").getByTitle("Click to edit progress")).toHaveText("0%");
        await expect.poll(() => progressOf(j, "Typography")).toBe(0);
      },
    },
    {
      id: "lr-new-focus",
      what: "With every item complete the focus stays on a complete item, and a newly added item becomes the focus",
      async run(j) {
        const { page, expect } = j;
        for (const name of ["Spacing", "Colour theory", "Typography"]) await toggleDone(j, name, true);
        await expect(rows(page).getByRole("button", { name: "Mark learning item done", exact: true })).toHaveCount(0);
        await card(page, "learning").getByRole("button", { name: "+ Add something to learn" }).click();
        const box = card(page, "learning").getByPlaceholder("Name a skill, press Enter…");
        await box.fill("Fresh start");
        await box.press("Enter");
        await expect(row(page, "Fresh start")).toBeVisible();
        await box.press("Escape");
        await focusIs(j, "Fresh start");
        await expect(card(page, "learning").locator(".glance-eyebrow")).toHaveText("0% · Focus");
      },
    },
    {
      id: "lr-delete",
      what: "Deleting the focus item hands the focus on (to the first row when every remaining row is complete); deleting the last item leaves \"No focus set\", the hero \"Add something to learn\" and a plain bar instead of the slider",
      async run(j) {
        const { page, expect } = j;
        await row(page, "Fresh start").getByRole("button", { name: "Delete item" }).click();
        await expect(row(page, "Fresh start")).toHaveCount(0);
        await focusIs(j, "Layout basics");
        const remove = card(page, "learning").getByRole("button", { name: "Delete item" });
        for (let left = await remove.count(); left > 0; left -= 1) {
          await remove.first().click();
          await expect(remove).toHaveCount(left - 1);
        }
        const learning = card(page, "learning");
        await expect(learning.locator(".glance-eyebrow")).toHaveText("No focus set");
        await expect(learning.locator(".glance-hero")).toHaveText("Add something to learn");
        await expect(learning.getByRole("slider")).toHaveCount(0);
        await expect(learning.locator(".glance-bar-fill")).toHaveAttribute("style", /width: 0%/);
        await expect.poll(async () => (await stored(j)).length).toBe(0);
        await j.summary();
      },
    },
  ],
};
