import { card, dashboardShown, projectPill, projectPills, setupShown } from "../screens.mjs";

const LINE = "This removes its phases, tasks, learning, thoughts and time history.";

function header(page) {
  return page.locator("aside.sidebar").getByRole("button", { name: /^(Projects|Archive)\s*⇄$/ });
}

async function opacity(locator) {
  return locator.evaluate((el) => Number(el.ownerDocument.defaultView.getComputedStyle(el).opacity));
}

async function pillNames(page) {
  return (await projectPills(page).locator(".pill-name").allTextContents()).map((name) => name.trim());
}

async function project(j, name) {
  const [found] = await j.rows("projects", `select=id,name,sort_order,archived_at,accent_color&name=eq.${encodeURIComponent(name)}`);
  return found;
}

export default {
  name: "sidebar",
  section: "§6",
  title: "Projects, sidebar and archive",
  steps: [
    {
      id: "sb-pills",
      what: "With two projects the header reads Projects ⇄ (\"Show the archive\"); one pill per live project in order, each with a dot in its accent color; the newest is active; + New project comes last",
      async run(j) {
        const { page, expect } = j;
        await j.signIn();
        await j.setUp("Alpha");
        await j.setUp("Beta", { phases: [["Beta first", "2"], ["Beta second", "3"]] });
        await expect(header(page)).toHaveAttribute("title", "Show the archive");
        await expect(header(page)).toHaveText(/^Projects\s*⇄$/);
        if ((await pillNames(page)).join("|") !== "Alpha|Beta") throw new Error(`The pills read ${(await pillNames(page)).join(", ")}.`);
        await expect(projectPill(page, "Beta")).toHaveClass(/\bactive\b/);
        for (const name of ["Alpha", "Beta"]) {
          const accent = await projectPill(page, name).evaluate((el) => el.style.getPropertyValue("--pill-accent"));
          const stored = (await project(j, name)).accent_color;
          if (accent.trim() !== stored) throw new Error(`${name}'s dot is ${accent}, its stored accent ${stored}.`);
          await expect(projectPill(page, name).locator(".pill-dot")).toBeVisible();
        }
        await expect(page.locator(".project-pills > *").last()).toHaveText(/New project/);
      },
    },
    {
      id: "sb-switch",
      what: "Clicking another pill (\"Switch to Alpha\") opens it: the cards blank to \"Loading…\" and reload with Alpha's data while the sidebar stays",
      async run(j) {
        const { page, expect } = j;
        await expect(projectPill(page, "Alpha")).toHaveAttribute("title", "Switch to Alpha");
        let release;
        const held = new Promise((resolve) => { release = resolve; });
        await page.route("**/rest/v1/phases**", async (route) => {
          await held;
          await route.fallback();
        });
        await projectPill(page, "Alpha").click();
        await expect(page.locator("main.dashboard")).toHaveText("Loading…");
        await expect(projectPill(page, "Beta")).toBeVisible();
        await j.snap("loading");
        release();
        await expect(card(page, "timeline").locator(".glance-hero")).toHaveText("Sketch the screens");
        await page.unroute("**/rest/v1/phases**");
        await expect(projectPill(page, "Alpha")).toHaveClass(/\bactive\b/);
      },
    },
    {
      id: "sb-rename",
      what: "The active pill's name (\"Click to rename\") edits in place: Enter commits and is stored, Escape cancels, an empty name becomes \"My project\", and the field stops at 200 characters",
      async run(j) {
        const { page, expect } = j;
        const active = page.locator(".project-pill.active");
        const rename = async (text, key = "Enter") => {
          await active.locator(".pill-name").click();
          const field = active.locator("input.pill-rename");
          await expect(field).toBeFocused();
          await field.fill(text);
          await field.press(key);
        };
        await expect(active.locator(".pill-name")).toHaveAttribute("title", "Click to rename");
        await rename("Alpha renamed");
        await expect(active.locator(".pill-name")).toHaveText("Alpha renamed");
        await expect.poll(async () => (await project(j, "Alpha renamed"))?.name).toBe("Alpha renamed");
        await rename("Escaped", "Escape");
        await expect(active.locator(".pill-name")).toHaveText("Alpha renamed");
        await rename("");
        await expect(active.locator(".pill-name")).toHaveText("My project");
        await expect.poll(async () => (await project(j, "My project"))?.name).toBe("My project");
        await active.locator(".pill-name").click();
        await active.locator("input.pill-rename").fill("A".repeat(250));
        await expect(active.locator("input.pill-rename")).toHaveValue("A".repeat(200));
        await active.locator("input.pill-rename").press("Enter");
        await expect.poll(async () => (await project(j, "A".repeat(200)))?.name.length).toBe(200);
        await rename("Alpha");
        await expect.poll(async () => (await project(j, "Alpha"))?.name).toBe("Alpha");
      },
    },
    {
      id: "sb-reorder",
      what: "A pill drags by pressing on it (not its name field or buttons) to a new place; the order persists over a reload",
      async run(j) {
        const { page, expect } = j;
        const beta = projectPill(page, "Beta");
        const box = await beta.boundingBox();
        await beta.dragTo(projectPill(page, "Alpha"), { sourcePosition: { x: 10, y: box.height / 2 }, targetPosition: { x: 10, y: 3 } });
        await expect.poll(() => pillNames(page)).toEqual(["Beta", "Alpha"]);
        await page.reload();
        await expect(dashboardShown(page)).toBeVisible();
        await expect.poll(() => pillNames(page)).toEqual(["Beta", "Alpha"]);
        const stored = await j.rows("projects", "select=name,sort_order&archived_at=is.null&order=sort_order");
        if (stored.map((one) => one.name).join("|") !== "Beta|Alpha") throw new Error(`The stored order is ${stored.map((one) => one.name).join(", ")}.`);
      },
    },
    {
      id: "sb-delete-confirm",
      what: "Hovering a pill, or Tab onto its ×, reveals × (\"Delete Beta\"); it opens the small dialog \"Delete \\\"Beta\\\"?\" with its line, hiding the rest of the page from assistive tech, focus on Cancel, Tab and Shift+Tab going round its two buttons; Escape and Cancel close it with focus back on ×, a press outside closes it, and none deletes",
      async run(j) {
        const { page, expect } = j;
        const remove = page.getByRole("button", { name: "Delete Beta", exact: true });
        await expect.poll(() => opacity(remove)).toBe(0);
        await projectPill(page, "Beta").hover();
        await expect.poll(() => opacity(remove)).toBeGreaterThan(0);
        await header(page).focus();
        await page.keyboard.press("Tab");
        await expect(remove).toBeFocused();
        await expect.poll(() => opacity(remove)).toBe(1);
        await remove.click();
        const dialog = page.getByRole("dialog", { name: 'Delete "Beta"?' });
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAccessibleDescription(LINE);
        await expect(page.locator("#root")).toHaveAttribute("aria-hidden", "true");
        const cancel = dialog.getByRole("button", { name: "Cancel" });
        const confirm = dialog.getByRole("button", { name: "Delete", exact: true });
        await expect(cancel).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(confirm).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(cancel).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(confirm).toBeFocused();
        await j.snap("open");
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(remove).toBeFocused();
        await expect(page.locator("#root")).not.toHaveAttribute("aria-hidden", "true");
        await remove.click();
        await dialog.getByRole("button", { name: "Cancel" }).click();
        await expect(dialog).toHaveCount(0);
        await expect(remove).toBeFocused();
        await remove.click();
        const aside = await page.locator("aside.sidebar").boundingBox();
        await page.mouse.click(aside.x + aside.width / 2, aside.y + aside.height - 120);
        await expect(dialog).toHaveCount(0);
        if (!(await project(j, "Beta"))) throw new Error("Closing the confirmation deleted the project.");
      },
    },
    {
      id: "sb-delete",
      what: "Delete removes the project and everything in it; deleting the active project opens the first remaining live project",
      async run(j) {
        const { page, expect } = j;
        await projectPill(page, "Beta").click();
        await expect(projectPill(page, "Beta")).toHaveClass(/\bactive\b/);
        const beta = await project(j, "Beta");
        await page.getByRole("button", { name: "Delete Beta", exact: true }).click();
        await page.getByRole("dialog", { name: 'Delete "Beta"?' }).getByRole("button", { name: "Delete", exact: true }).click();
        await expect(projectPill(page, "Beta")).toHaveCount(0);
        await expect(projectPill(page, "Alpha")).toHaveClass(/\bactive\b/);
        if (await project(j, "Beta")) throw new Error("Beta is still stored.");
        const phases = await j.rows("phases", `select=id&project_id=eq.${beta.id}`);
        const learning = await j.rows("learning_items", `select=id&project_id=eq.${beta.id}`);
        if (phases.length + learning.length !== 0) throw new Error("Beta's phases or learning items are still stored.");
      },
    },
    {
      id: "sb-finished-archive",
      what: "Ticking a project's last phase shows its archive icon (\"Archive Alpha\", \"Archive (finished) — move to the archive\") without a reload; archiving stores it as archived and opens the first remaining live project",
      async run(j) {
        const { page, expect } = j;
        await j.setUp("Gamma");
        await j.setUp("Delta");
        await projectPill(page, "Alpha").click();
        await expect(projectPill(page, "Alpha")).toHaveClass(/\bactive\b/);
        const archive = page.getByRole("button", { name: "Archive Alpha", exact: true });
        await expect(archive).toHaveCount(0);
        await j.tickEveryPhase();
        await expect(archive).toHaveAttribute("title", "Archive (finished) — move to the archive");
        await archive.click();
        await expect(projectPill(page, "Alpha")).toHaveCount(0);
        await expect(projectPill(page, "Gamma")).toHaveClass(/\bactive\b/);
        if (!(await project(j, "Alpha")).archived_at) throw new Error("Alpha is not stored as archived.");
      },
    },
    {
      id: "sb-archive-view",
      what: "The header flips to Archive ⇄ (\"Back to your projects\"): archived projects, most recently archived first, each with its dot, name and \"archived {Mon d}\"; restore (\"Restore Alpha\") puts it back at the end of the live list and opens it",
      async run(j) {
        const { page, expect } = j;
        await j.tickEveryPhase();
        await page.getByRole("button", { name: "Archive Gamma", exact: true }).click();
        await expect(projectPill(page, "Delta")).toHaveClass(/\bactive\b/);
        await header(page).click();
        await expect(header(page)).toHaveText(/^Archive\s*⇄$/);
        await expect(header(page)).toHaveAttribute("title", "Back to your projects");
        const rows = page.locator(".project-pills .archived-pill");
        await expect(rows).toHaveCount(2);
        await expect(rows.nth(0).locator(".pill-name")).toContainText("Gamma");
        await expect(rows.nth(1).locator(".pill-name")).toContainText("Alpha");
        const today = await page.evaluate(() => new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }));
        await expect(rows.nth(0).locator(".pill-sub")).toHaveText(`archived ${today}`);
        await expect(rows.nth(0).locator(".pill-dot")).toBeVisible();
        await expect(page.getByRole("button", { name: "Restore Alpha", exact: true })).toHaveAttribute("title", "Restore — bring this project back");
        await page.getByRole("button", { name: "Restore Alpha", exact: true }).click();
        await expect(page.getByRole("button", { name: "Restore Alpha", exact: true })).toHaveCount(0);
        await header(page).click();
        await expect.poll(() => pillNames(page)).toEqual(["Delta", "Alpha"]);
        await expect(projectPill(page, "Alpha")).toHaveClass(/\bactive\b/);
        const alpha = await project(j, "Alpha");
        if (alpha.archived_at !== null) throw new Error("Alpha is still stored as archived.");
      },
    },
    {
      id: "sb-archive-delete",
      what: "In the Archive view × (\"Delete permanently\") asks through the same dialog and deletes for good; with nothing archived the view reads \"Nothing archived yet. Finish a project and you can tuck it away here.\"",
      async run(j) {
        const { page, expect } = j;
        await header(page).click();
        const remove = page.getByRole("button", { name: "Delete Gamma", exact: true });
        await expect(remove).toHaveAttribute("title", "Delete permanently");
        await remove.click();
        await page.getByRole("dialog", { name: 'Delete "Gamma"?' }).getByRole("button", { name: "Delete", exact: true }).click();
        await expect(page.getByText("Nothing archived yet. Finish a project and you can tuck it away here.", { exact: true })).toBeVisible();
        if (await project(j, "Gamma")) throw new Error("Gamma is still stored.");
        await header(page).click();
      },
    },
    {
      id: "sb-rename-flip",
      what: "Flipping the view while a rename is open commits the draft, since the field's blur comes first",
      async run(j) {
        const { page, expect } = j;
        await page.locator(".project-pill.active .pill-name").click();
        await page.locator(".project-pill.active input.pill-rename").fill("Flipped name");
        await header(page).click();
        await expect(header(page)).toHaveText(/^Archive\s*⇄$/);
        await header(page).click();
        await expect(page.locator(".project-pill.active .pill-name")).toHaveText("Flipped name");
        await expect.poll(async () => (await project(j, "Flipped name"))?.name).toBe("Flipped name");
      },
    },
    {
      id: "sb-one-panel",
      what: "Opening the delete confirmation from the sidebar closes an open Settings panel, so one panel is open at a time",
      async run(j) {
        const { page, expect } = j;
        await dashboardShown(page).click();
        await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
        await projectPill(page, "Delta").hover();
        await page.getByRole("button", { name: "Delete Delta", exact: true }).click();
        await expect(page.getByRole("dialog", { name: 'Delete "Delta"?' })).toBeVisible();
        await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog", { name: 'Delete "Delta"?' })).toHaveCount(0);
      },
    },
    {
      id: "archive-screen",
      what: "With every project archived the setup offers View archive (N); the archive screen (title, sub-line, ← Back) lists them with Restore and ×; Restore opens a project; deleting the last archived project re-runs the gate to the setup",
      async run(j) {
        const { page, expect } = j;
        await j.tickEveryPhase();
        await page.getByRole("button", { name: "Archive Flipped name", exact: true }).click();
        await expect(projectPill(page, "Delta")).toHaveClass(/\bactive\b/);
        await j.tickEveryPhase();
        await page.getByRole("button", { name: "Archive Delta", exact: true }).click();
        await expect(setupShown(page)).toBeVisible();
        await expect(page.getByRole("button", { name: "← Back" })).toHaveCount(0);
        await page.getByRole("button", { name: "View archive (2)" }).click();
        await expect(page.getByRole("heading", { level: 1, name: "Archive" })).toBeVisible();
        await expect(page.getByText("Projects you've finished and tucked away. Restore one to pick it back up, or remove it for good.", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "← Back" })).toBeVisible();
        const items = page.locator(".archive-item");
        await expect(items).toHaveCount(2);
        await expect(items.nth(0)).toContainText("Delta");
        await expect(items.nth(0).locator(".archive-item-sub")).toHaveText(/^archived [A-Z][a-z]{2} \d{1,2}$/);
        await j.snap("two-archived");
        await page.getByRole("button", { name: "Delete Flipped name", exact: true }).click();
        await page.getByRole("dialog", { name: 'Delete "Flipped name"?' }).getByRole("button", { name: "Delete", exact: true }).click();
        await expect(items).toHaveCount(1);
        await items.first().getByRole("button", { name: "Restore", exact: true }).click();
        await expect(projectPill(page, "Delta")).toHaveClass(/\bactive\b/);
        await j.tickEveryPhase();
        await page.getByRole("button", { name: "Archive Delta", exact: true }).click();
        await page.getByRole("button", { name: "View archive (1)" }).click();
        await page.getByRole("button", { name: "Delete Delta", exact: true }).click();
        await page.getByRole("dialog", { name: 'Delete "Delta"?' }).getByRole("button", { name: "Delete", exact: true }).click();
        await expect(setupShown(page)).toBeVisible();
        await expect(page.getByRole("button", { name: /^View archive/ })).toHaveCount(0);
        const left = await j.rows("projects", "select=id");
        if (left.length !== 0) throw new Error(`${left.length} projects are still stored.`);
      },
    },
  ],
};
