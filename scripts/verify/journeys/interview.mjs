import { card, dashboardShown, localDay, projectPill, savedNote, setupShown } from "../screens.mjs";

const SAVE = "**/rest/v1/rpc/save_interview**";
const FAILED_SAVE = [/^\[compass\] a save failed: /, /^Failed to load resource: net::ERR_/];

function rail(page, label) {
  return page.getByRole("complementary", { name: "Setup progress" }).getByRole("listitem", { name: new RegExp(`^${label}: `) });
}

async function railReads(j, statuses) {
  for (const [label, status] of Object.entries(statuses)) {
    await j.expect(rail(j.page, label)).toHaveAttribute("aria-label", `${label}: ${status}`);
    if (status === "active") await j.expect(rail(j.page, label)).toHaveAttribute("aria-current", "step");
    else await j.expect(rail(j.page, label)).not.toHaveAttribute("aria-current", "step");
  }
}

async function hint(j, missing) {
  const cta = j.page.getByRole("button", { name: "Open my dashboard →" });
  if (missing) {
    await j.expect(cta).toBeDisabled();
    await j.expect(j.page.getByText(`Just a little more — ${missing}.`, { exact: true })).toBeVisible();
  } else {
    await j.expect(cta).toBeEnabled();
    await j.expect(j.page.getByText(/^Just a little more/)).toHaveCount(0);
  }
}

async function answer(j, name) {
  const { page } = j;
  await page.getByPlaceholder("Name this project").fill(name);
  await page.getByLabel("How many hours would you like to spend on it each day?").fill("2");
  await page.getByLabel("How much time do you actually have available each day?").fill("3");
  await page.getByLabel(/How long do you think this project will take/).fill("10");
  const phases = page.locator(".phase-row");
  await phases.nth(0).getByPlaceholder("e.g. create the design mockup").fill("Plan");
  await phases.nth(0).getByPlaceholder("0").fill("2");
  await phases.nth(1).getByPlaceholder("e.g. create the design mockup").fill("Build");
  await phases.nth(1).getByPlaceholder("0").fill("3");
  const learning = page.locator(".learn-row");
  await learning.nth(0).getByPlaceholder("e.g. learning UI design principles").fill("Testing");
  await learning.nth(0).getByLabel("Starting level of understanding").selectOption("50");
  await learning.nth(1).getByPlaceholder("e.g. learning UI design principles").fill("Writing");
  await learning.nth(1).getByLabel("Starting level of understanding").selectOption("65");
}

export default {
  name: "interview",
  section: "§13",
  title: "Interview (setup)",
  steps: [
    {
      id: "iv-first-run",
      what: "An account with no project opens the setup on first run: no ← Back, no View archive, the Compass wordmark, the four sections with their questions, two phase rows and two learning rows, and the five starting levels",
      async run(j) {
        const { page, expect } = j;
        await j.signIn();
        await expect(setupShown(page)).toBeVisible();
        await expect(page.getByRole("button", { name: "← Back" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: /^View archive/ })).toHaveCount(0);
        await expect(page.locator(".setup-head .brand")).toHaveText("Compass");
        await expect(page.getByRole("textbox", { name: "Project", exact: true })).toHaveAttribute("placeholder", "Name this project");
        for (const [section, prompt] of [
          ["Time", "Estimate your schedule."],
          ["Timeline", "Sketch the path from here to done."],
          ["Learning", "List the things you need to learn to best move forward."],
        ]) {
          await expect(page.getByRole("heading", { level: 2, name: section, exact: true })).toBeVisible();
          await expect(page.getByText(prompt, { exact: true })).toBeVisible();
        }
        await expect(page.locator(".phase-row")).toHaveCount(2);
        await expect(page.locator(".learn-row")).toHaveCount(2);
        const levels = await page.locator(".learn-row").first().getByLabel("Starting level of understanding").locator("option").allTextContents();
        const expected = ["Starting level…", "Beginner · ~10%", "Some basics · ~30%", "Comfortable · ~50%", "Confident · ~65%", "Almost fluent · ~80%"];
        if (levels.join("|") !== expected.join("|")) throw new Error(`The starting levels read: ${levels.join(", ")}.`);
      },
    },
    {
      id: "iv-progress-rail",
      what: "The rail \"Setup progress\" labels each step with its status and marks the active one aria-current=step; the CTA stays disabled while the hint names the first missing answer, in order, until all four are given and Dashboard becomes active",
      async run(j) {
        const { page } = j;
        await railReads(j, { Project: "active", Time: "upcoming", Timeline: "upcoming", Learning: "upcoming", Dashboard: "upcoming" });
        await hint(j, "name your project");
        await page.getByPlaceholder("Name this project").fill("  First setup  ");
        await railReads(j, { Project: "completed", Time: "active" });
        await hint(j, "add your project length and daily hours");
        await page.getByLabel("How many hours would you like to spend on it each day?").fill("2");
        await page.getByLabel(/How long do you think this project will take/).fill("9.5");
        await hint(j, "note how many hours you actually have");
        await page.getByLabel("How much time do you actually have available each day?").fill("3");
        await railReads(j, { Time: "completed", Timeline: "active" });
        await hint(j, "complete every timeline phase");
        const phases = page.locator(".phase-row");
        await phases.nth(0).getByPlaceholder("e.g. create the design mockup").fill("Plan the pages");
        await phases.nth(0).getByPlaceholder("0").fill("2.5");
        await phases.nth(1).getByPlaceholder("e.g. create the design mockup").fill("Build the pages");
        await phases.nth(1).getByPlaceholder("0").fill("4");
        await railReads(j, { Timeline: "completed", Learning: "active" });
        await hint(j, "complete every learning item");
        const learning = page.locator(".learn-row");
        await learning.nth(0).getByPlaceholder("e.g. learning UI design principles").fill("Layout");
        await learning.nth(0).getByLabel("Starting level of understanding").selectOption("10");
        await learning.nth(1).getByPlaceholder("e.g. learning UI design principles").fill("Colour");
        await learning.nth(1).getByLabel("Starting level of understanding").selectOption("80");
        await railReads(j, { Project: "completed", Time: "completed", Timeline: "completed", Learning: "completed", Dashboard: "active" });
        await hint(j, null);
      },
    },
    {
      id: "iv-rows",
      what: "+ Add a phase and + Add something to learn add an empty row (the step it belongs to is no longer complete); × removes a row, and the last remaining row of a list cannot be removed",
      async run(j) {
        const { page, expect } = j;
        await page.getByRole("button", { name: "+ Add a phase" }).click();
        await expect(page.locator(".phase-row")).toHaveCount(3);
        await railReads(j, { Timeline: "active" });
        await hint(j, "complete every timeline phase");
        await page.locator(".phase-row").nth(2).getByRole("button", { name: "Remove phase" }).click();
        await expect(page.locator(".phase-row")).toHaveCount(2);
        await railReads(j, { Timeline: "completed" });
        await page.getByRole("button", { name: "+ Add something to learn" }).click();
        await expect(page.locator(".learn-row")).toHaveCount(3);
        await page.locator(".learn-row").nth(2).getByRole("button", { name: "Remove item" }).click();
        await page.locator(".learn-row").nth(1).getByRole("button", { name: "Remove item" }).click();
        await expect(page.locator(".learn-row")).toHaveCount(1);
        await expect(page.locator(".learn-row").first().getByRole("button", { name: "Remove item" })).toBeDisabled();
        await j.snap("last-row");
        await page.getByRole("button", { name: "+ Add something to learn" }).click();
        await page.locator(".learn-row").nth(1).getByPlaceholder("e.g. learning UI design principles").fill("Colour");
        await page.locator(".learn-row").nth(1).getByLabel("Starting level of understanding").selectOption("80");
        await hint(j, null);
      },
    },
    {
      id: "iv-drag-rows",
      what: "A repeat row drags to a new place within its own list, by its grip",
      async run(j) {
        const { page, expect } = j;
        const rows = page.locator(".phase-row");
        await rows.nth(1).locator(".grip").dragTo(rows.nth(0), { targetPosition: { x: 40, y: 4 } });
        await expect(rows.nth(0).getByPlaceholder("e.g. create the design mockup")).toHaveValue("Build the pages");
        await expect(rows.nth(1).getByPlaceholder("e.g. create the design mockup")).toHaveValue("Plan the pages");
        await rows.nth(1).locator(".grip").dragTo(rows.nth(0), { targetPosition: { x: 40, y: 4 } });
        await expect(rows.nth(0).getByPlaceholder("e.g. create the design mockup")).toHaveValue("Plan the pages");
      },
    },
    {
      id: "iv-open",
      what: "Open my dashboard → reads \"Opening…\" while it saves, then opens the new project; stored are the trimmed name, today's start day, the length and phase days rounded up to whole days (9.5 → 10, 2.5 → 3), the phases and learning items in order, progress from the levels, and the first item as the focus",
      async run(j) {
        const { page, expect } = j;
        let release;
        const held = new Promise((resolve) => { release = resolve; });
        await page.route(SAVE, async (route) => {
          await held;
          await route.fallback();
        });
        await page.getByRole("button", { name: "Open my dashboard →" }).click();
        await expect(page.getByRole("button", { name: "Opening…" })).toBeDisabled();
        await j.snap("opening");
        release();
        await expect(projectPill(page, "First setup")).toHaveClass(/\bactive\b/);
        await page.unroute(SAVE);
        await expect(card(page, "time").getByRole("heading", { name: "Commitment" })).toBeVisible();
        const [project] = await j.rows("projects", "select=id,name,started_at,total_days,hours_planned_per_day,hours_available_per_day,sort_order,accent_color,archived_at");
        const expected = { name: "First setup", started_at: localDay(), total_days: 10, hours_planned_per_day: 2, hours_available_per_day: 3, sort_order: 0, accent_color: "#9A7B4F", archived_at: null };
        for (const [key, value] of Object.entries(expected)) {
          if (project?.[key] !== value) throw new Error(`The stored project's ${key} is ${JSON.stringify(project?.[key])}, not ${JSON.stringify(value)}.`);
        }
        const phases = await j.rows("phases", `select=name,est_days,sort_order,is_done&project_id=eq.${project.id}&order=sort_order`);
        const learning = await j.rows("learning_items", `select=name,progress_pct,is_focus,sort_order&project_id=eq.${project.id}&order=sort_order`);
        const saw = JSON.stringify({ phases: phases.map((p) => [p.name, p.est_days, p.is_done]), learning: learning.map((l) => [l.name, l.progress_pct, l.is_focus]) });
        const want = JSON.stringify({ phases: [["Plan the pages", 3, false], ["Build the pages", 4, false]], learning: [["Layout", 10, true], ["Colour", 80, false]] });
        if (saw !== want) throw new Error(`Stored ${saw}, expected ${want}.`);
      },
    },
    {
      id: "iv-new-project",
      what: "From the dashboard, + New project opens the setup with ← Back, which returns to the dashboard with nothing saved",
      async run(j) {
        const { page, expect } = j;
        await page.getByRole("button", { name: "New project" }).click();
        await expect(setupShown(page)).toBeVisible();
        await page.getByPlaceholder("Name this project").fill("Not kept");
        await page.getByRole("button", { name: "← Back" }).click();
        await expect(projectPill(page, "First setup")).toHaveClass(/\bactive\b/);
        const projects = await j.rows("projects", "select=name");
        if (projects.length !== 1) throw new Error(`Going back saved something: ${projects.map((p) => p.name).join(", ")}.`);
      },
    },
    {
      id: "iv-second-project",
      what: "A second setup makes a second project, placed after the first with the first accent color no live project uses, and opens it",
      async run(j) {
        const { page, expect } = j;
        await page.getByRole("button", { name: "New project" }).click();
        await answer(j, "Second setup");
        await page.getByRole("button", { name: "Open my dashboard →" }).click();
        await expect(projectPill(page, "Second setup")).toHaveClass(/\bactive\b/);
        await expect(projectPill(page, "First setup")).not.toHaveClass(/\bactive\b/);
        const projects = await j.rows("projects", "select=name,sort_order,accent_color&order=sort_order");
        const saw = JSON.stringify(projects.map((p) => [p.name, p.sort_order, p.accent_color]));
        if (saw !== JSON.stringify([["First setup", 0, "#9A7B4F"], ["Second setup", 1, "#7BC8B2"]])) throw new Error(`Stored ${saw}.`);
      },
    },
    {
      id: "iv-view-archive",
      what: "With a project in the archive, the setup shows \"View archive (1)\", which opens the archive screen; its ← Back returns to the dashboard",
      async run(j) {
        const { page, expect } = j;
        await j.tickEveryPhase();
        await page.getByRole("button", { name: "Archive Second setup", exact: true }).click();
        await expect(projectPill(page, "Second setup")).toHaveCount(0);
        await page.getByRole("button", { name: "New project" }).click();
        await page.getByRole("button", { name: "View archive (1)" }).click();
        await expect(page.getByRole("heading", { level: 1, name: "Archive" })).toBeVisible();
        await expect(page.locator(".archive-item", { hasText: "Second setup" })).toBeVisible();
        await page.getByRole("button", { name: "← Back" }).click();
        await expect(dashboardShown(page)).toBeVisible();
        await expect(projectPill(page, "First setup")).toHaveClass(/\bactive\b/);
      },
    },
    {
      id: "iv-save-fails",
      what: "When the connection drops during the save, the CTA reads Open my dashboard → again, every answer stays as typed, the calm note shows and nothing is kept; pressing again once it is back saves the project once",
      console: FAILED_SAVE,
      async run(j) {
        const { page, expect } = j;
        await page.getByRole("button", { name: "New project" }).click();
        await answer(j, "Lost connection");
        await page.route(SAVE, (route) => route.abort("internetdisconnected"));
        await page.getByRole("button", { name: "Open my dashboard →" }).click();
        await expect(savedNote(page)).toBeVisible();
        await expect(page.getByRole("button", { name: "Open my dashboard →" })).toBeEnabled();
        await expect(page.getByPlaceholder("Name this project")).toHaveValue("Lost connection");
        await expect(page.locator(".learn-row").nth(1).getByPlaceholder("e.g. learning UI design principles")).toHaveValue("Writing");
        await j.snap("refused");
        if ((await j.rows("projects", "select=name&name=eq.Lost%20connection")).length !== 0) throw new Error("A refused save kept a project.");
        await page.unroute(SAVE);
        await page.getByRole("button", { name: "Open my dashboard →" }).click();
        await expect(projectPill(page, "Lost connection")).toHaveClass(/\bactive\b/);
        const kept = await j.rows("projects", "select=name&name=eq.Lost%20connection");
        if (kept.length !== 1) throw new Error(`The second press kept ${kept.length} projects.`);
      },
    },
    {
      id: "iv-reply-lost",
      what: "When the save lands but its reply is lost, the screen stays on the setup with the note; pressing again opens the project already saved, so the visit makes exactly one",
      console: FAILED_SAVE,
      async run(j) {
        const { page, expect } = j;
        await page.getByRole("button", { name: "New project" }).click();
        await answer(j, "Reply lost");
        await page.route(SAVE, async (route) => {
          await route.fetch();
          await route.abort("connectionreset");
        });
        await page.getByRole("button", { name: "Open my dashboard →" }).click();
        await expect(savedNote(page)).toBeVisible();
        await expect(page.getByRole("button", { name: "Open my dashboard →" })).toBeEnabled();
        const landed = await j.rows("projects", "select=id,name&name=eq.Reply%20lost");
        if (landed.length !== 1) throw new Error(`The save whose reply was lost kept ${landed.length} projects, not 1.`);
        await page.unroute(SAVE);
        await page.getByRole("button", { name: "Open my dashboard →" }).click();
        await expect(projectPill(page, "Reply lost")).toHaveClass(/\bactive\b/);
        const after = await j.rows("projects", "select=id,name&name=eq.Reply%20lost");
        if (after.length !== 1 || after[0].id !== landed[0].id) throw new Error(`Pressing again made another project: ${after.length} now.`);
      },
    },
  ],
};
