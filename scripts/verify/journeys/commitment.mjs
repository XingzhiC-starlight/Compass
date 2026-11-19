import { card, daysAgo, localDay, projectPill, savedNote } from "../screens.mjs";

function hero(page) {
  return card(page, "time").locator(".glance-hero");
}

function loggedHalf(page) {
  return card(page, "time").locator(".glance-hero > span").first();
}

function goalHalf(page) {
  return card(page, "time").locator(".glance-hero > span").filter({ hasText: /h$/ });
}

async function edit(j, half, text, key = "Enter") {
  await half.click();
  const field = card(j.page, "time").locator("input.glance-hero-input");
  await j.expect(field).toBeFocused();
  await field.fill(text);
  await field.press(key);
  await j.expect(field).toHaveCount(0);
}

/** Runs `work` and returns how many writes (anything but a read) it sent to `table`. */
async function writesTo(page, table, work) {
  const writes = [];
  const listen = (request) => {
    if (request.url().includes(`/rest/v1/${table}`) && request.method() !== "GET") writes.push(`${request.method()} ${table}`);
  };
  page.on("request", listen);
  try {
    await work();
    await page.waitForTimeout(400);
  } finally {
    page.off("request", listen);
  }
  return writes.length;
}

async function projectId(j, name) {
  const [found] = await j.rows("projects", `select=id&name=eq.${encodeURIComponent(name)}`);
  return found.id;
}

async function sessions(j, name) {
  return j.rows("time_sessions", `select=started_at,ended_at,duration_seconds,session_date&project_id=eq.${await projectId(j, name)}&order=started_at`);
}

function midnightBefore(day) {
  const at = new Date(day);
  at.setHours(24, 0, 0, 0);
  return at;
}

export default {
  name: "commitment",
  section: "§8",
  title: "Commitment card",
  steps: [
    {
      id: "tm-glance",
      what: "A new project's glance: eyebrow \"Day 1 / 10 · Goal 2h\" (rendered uppercase), hero \"0/2h\", an empty bar and the clock off (\"Start work session\")",
      async run(j) {
        const { page, expect } = j;
        await j.signIn();
        await j.setUp("Hours");
        const eyebrow = card(page, "time").locator(".glance-eyebrow");
        await expect(eyebrow).toHaveText("Day 1 / 10 · Goal 2h");
        await expect(eyebrow).toHaveCSS("text-transform", "uppercase");
        await expect(hero(page)).toHaveText("0/2h");
        await expect(card(page, "time").locator(".glance-bar-fill")).toHaveAttribute("style", /width: 0%/);
        await expect(card(page, "time").getByRole("button", { name: "Start work session" })).toBeVisible();
      },
    },
    {
      id: "tm-edit-goal",
      what: "The goal half edits in place: \"3\" and Enter writes the daily goal (Goal 3h, stored 3); Escape cancels; \"2h\", \"1,5\" and \"-1\" write nothing",
      async run(j) {
        const { page, expect } = j;
        await edit(j, goalHalf(page), "3");
        await expect(hero(page)).toHaveText("0/3h");
        await expect(card(page, "time").locator(".glance-eyebrow")).toHaveText("Day 1 / 10 · Goal 3h");
        await expect.poll(async () => (await j.rows("projects", "select=hours_planned_per_day&name=eq.Hours"))[0].hours_planned_per_day).toBe(3);
        const written = await writesTo(page, "projects", async () => {
          for (const refused of ["2h", "1,5", "-1"]) await edit(j, goalHalf(page), refused);
          await edit(j, goalHalf(page), "5", "Escape");
        });
        await expect(hero(page)).toHaveText("0/3h");
        if (written !== 0) throw new Error(`Refused or cancelled entries sent ${written} writes.`);
      },
    },
    {
      id: "tm-edit-logged",
      what: "Today's half edits in place: \"1.5\" replaces today's hours with one session of 5,400 s (hero 1.5/3h, bar 50%); \" .5 \" counts as 0.5; opening and dismissing the editor writes nothing",
      async run(j) {
        const { page, expect } = j;
        await edit(j, loggedHalf(page), " .5 ");
        await expect(hero(page)).toHaveText("0.5/3h");
        await edit(j, loggedHalf(page), "1.5");
        await expect(hero(page)).toHaveText("1.5/3h");
        await expect(card(page, "time").locator(".glance-bar-fill")).toHaveAttribute("style", /width: 50%/);
        await expect.poll(async () => (await sessions(j, "Hours")).map((one) => one.duration_seconds)).toEqual([5400]);
        const [stored] = await sessions(j, "Hours");
        if (stored.session_date !== localDay() || stored.ended_at === null) throw new Error(`Today's session is stored as ${JSON.stringify(stored)}.`);
        const written = await writesTo(page, "time_sessions", async () => {
          await edit(j, loggedHalf(page), "4", "Escape");
          await loggedHalf(page).click();
          await card(page, "time").locator("input.glance-hero-input").blur();
        });
        await expect(hero(page)).toHaveText("1.5/3h");
        if (written !== 0) throw new Error(`Opening and dismissing the editor sent ${written} writes.`);
      },
    },
    {
      id: "tm-clock",
      what: "The round button starts a work session (\"Stop work session\", an open session stored) and the hero ticks up each second; stopping closes the session and re-syncs the exact total",
      async run(j) {
        const { page, expect } = j;
        await edit(j, loggedHalf(page), "0.049");
        await expect(hero(page)).toHaveText("0/3h");
        await card(page, "time").getByRole("button", { name: "Start work session" }).click();
        await expect(card(page, "time").getByRole("button", { name: "Stop work session" })).toBeVisible();
        await expect.poll(async () => (await sessions(j, "Hours")).filter((one) => one.ended_at === null).length).toBe(1);
        await expect(hero(page)).toHaveText("0.1/3h", { timeout: 15_000 });
        j.note("The hero passed from 0 to 0.1 as the clock ran from 176 s to 180 s.");
        await card(page, "time").getByRole("button", { name: "Stop work session" }).click();
        await expect(card(page, "time").getByRole("button", { name: "Start work session" })).toBeVisible();
        await expect.poll(async () => (await sessions(j, "Hours")).filter((one) => one.ended_at === null).length).toBe(0);
        const total = (await sessions(j, "Hours")).reduce((sum, one) => sum + one.duration_seconds, 0);
        if (total < 180) throw new Error(`Today's stored total is ${total} s, short of the 180 s shown.`);
        await expect(hero(page)).toHaveText("0.1/3h");
      },
    },
    {
      id: "tm-edit-while-running",
      what: "Editing today's hours while the clock runs keeps it running from the new total: still one open session, and stopping re-syncs from the entered hours",
      async run(j) {
        const { page, expect } = j;
        await card(page, "time").getByRole("button", { name: "Start work session" }).click();
        await expect(card(page, "time").getByRole("button", { name: "Stop work session" })).toBeVisible();
        await edit(j, loggedHalf(page), "2");
        await expect(hero(page)).toHaveText("2/3h");
        await expect(card(page, "time").getByRole("button", { name: "Stop work session" })).toBeVisible();
        await expect.poll(async () => (await sessions(j, "Hours")).filter((one) => one.ended_at === null).length).toBe(1);
        await card(page, "time").getByRole("button", { name: "Stop work session" }).click();
        await expect(card(page, "time").getByRole("button", { name: "Start work session" })).toBeVisible();
        await expect(hero(page)).toHaveText("2/3h");
        const total = (await sessions(j, "Hours")).reduce((sum, one) => sum + one.duration_seconds, 0);
        if (total < 7200 || total > 7200 + 60) throw new Error(`After the edit and the stop, today's stored total is ${total} s, not 2 h and the seconds since.`);
      },
    },
    {
      id: "tm-one-clock",
      what: "Starting the clock in another project closes the one running: one clock app-wide, and the first project shows its clock off when opened again",
      async run(j) {
        const { page, expect } = j;
        await card(page, "time").getByRole("button", { name: "Start work session" }).click();
        await expect.poll(async () => (await sessions(j, "Hours")).filter((one) => one.ended_at === null).length).toBe(1);
        await j.setUp("Other hours");
        await card(page, "time").getByRole("button", { name: "Start work session" }).click();
        await expect(card(page, "time").getByRole("button", { name: "Stop work session" })).toBeVisible();
        await expect.poll(async () => (await sessions(j, "Hours")).filter((one) => one.ended_at === null).length).toBe(0);
        const open = await j.rows("time_sessions", "select=project_id&ended_at=is.null");
        if (open.length !== 1 || open[0].project_id !== (await projectId(j, "Other hours"))) throw new Error(`Open sessions: ${JSON.stringify(open)}.`);
        await projectPill(page, "Hours").click();
        await expect(card(page, "time").getByRole("button", { name: "Start work session" })).toBeVisible();
        await projectPill(page, "Other hours").click();
        await card(page, "time").getByRole("button", { name: "Stop work session" }).click();
        await expect(card(page, "time").getByRole("button", { name: "Start work session" })).toBeVisible();
        await projectPill(page, "Hours").click();
        await expect(hero(page)).toHaveText("2/3h");
      },
    },
    {
      id: "tm-refused-start",
      what: "When the new session cannot be written nothing starts: the calm note shows once and the clock stays off, with no open session stored",
      console: [/^\[compass\] a save failed: /, /^Failed to load resource: net::ERR_/],
      async run(j) {
        const { page, expect } = j;
        await page.route("**/rest/v1/time_sessions**", (route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.fallback()));
        await card(page, "time").getByRole("button", { name: "Start work session" }).click();
        await expect(savedNote(page)).toHaveCount(1);
        await expect(card(page, "time").getByRole("button", { name: "Start work session" })).toBeVisible();
        await j.snap("refused");
        await page.unroute("**/rest/v1/time_sessions**");
        const open = await j.rows("time_sessions", "select=id&ended_at=is.null");
        if (open.length !== 0) throw new Error(`${open.length} sessions are open after a refused start.`);
        await expect(hero(page)).toHaveText("2/3h");
      },
    },
    {
      id: "tm-bar-sparkline",
      what: "The bar is logged ÷ goal capped at 100%; beside it the sparkline has one bar per day shown, today's marked",
      async run(j) {
        const { page, expect } = j;
        await edit(j, loggedHalf(page), "5");
        await expect(hero(page)).toHaveText("5/3h");
        await expect(card(page, "time").locator(".glance-bar-fill")).toHaveAttribute("style", /width: 100%/);
        const bars = card(page, "time").locator(".glance-spark .glance-bar");
        await expect(bars).toHaveCount(1);
        await expect(bars.last()).toHaveClass(/\btoday\b/);
      },
    },
    {
      id: "tm-depth-days",
      what: "Depth shows Days ⇄ (\"Switch between day and week history\") with \"/ 3h\", the rows that exist (a new project has only Today, read-only) and the footer \"1-day total 5h\", \"avg 5h/day\"",
      async run(j) {
        const { page, expect } = j;
        await j.depth();
        const time = card(page, "time");
        await expect(time.getByRole("button", { name: /^Days ⇄$/ })).toHaveAttribute("title", "Switch between day and week history");
        await expect(time.locator(".col-head")).toContainText("/ 3h");
        await expect(time.locator("li.row")).toHaveCount(1);
        await expect(time.locator("li.row .time-date")).toHaveText("Today");
        await expect(time.locator("li.row .time-hours")).toHaveText("5h");
        await expect(time.getByTitle("Click to edit hours")).toHaveCount(0);
        await expect(time.locator(".time-foot")).toHaveText(/1-day total 5h\s*avg 5h\/day/);
      },
    },
    {
      id: "tm-depth-weeks",
      what: "Weeks shows seven-day buckets ending today (\"This week\"), read-only, with \"/ 21h\", \"1-week total 5h\" and \"avg 5h/wk\"",
      async run(j) {
        const { page, expect } = j;
        const time = card(page, "time");
        await time.getByRole("button", { name: /^Days ⇄$/ }).click();
        await expect(time.getByRole("button", { name: /^Weeks ⇄$/ })).toBeVisible();
        await expect(time.locator(".col-head")).toContainText("/ 21h");
        await expect(time.locator("li.row .time-date")).toHaveText(["This week"]);
        await expect(time.locator("li.row .time-hours")).toHaveText(["5h"]);
        await expect(time.locator(".time-foot")).toHaveText(/1-week total 5h\s*avg 5h\/wk/);
        await time.getByRole("button", { name: /^Weeks ⇄$/ }).click();
        await j.summary();
      },
    },
    {
      id: "tm-past-days",
      what: "A project begun three days ago reads Day 4 and lists Day 1 … Today; a past day's hours (\"Click to edit hours\") edit in place and are stored for that day; opening and blurring one writes nothing; the average counts every row shown",
      limit: 90_000,
      async run(j) {
        const { expect } = j;
        await j.newVisit({ clock: daysAgo(3) });
        await j.signIn();
        await j.setUp("Three days old");
        await j.newVisit();
        await j.signIn();
        const { page } = j;
        await projectPill(page, "Three days old").click();
        await expect(card(page, "time").locator(".glance-eyebrow")).toHaveText("Day 4 / 10 · Goal 2h");
        await j.depth();
        const time = card(page, "time");
        await expect(time.locator("li.row .time-date")).toHaveText(["Day 1", "Day 2", "Day 3", "Today"]);
        await expect(time.getByTitle("Click to edit hours")).toHaveCount(3);
        await time.locator("li.row").nth(1).getByTitle("Click to edit hours").click();
        const field = time.locator("input.time-hours-input");
        await field.fill("2");
        await field.press("Enter");
        await expect(time.locator("li.row").nth(1).locator(".time-hours")).toHaveText("2h");
        await expect(time.locator(".time-foot")).toHaveText(/4-day total 2h\s*avg 0\.5h\/day/);
        const twoDaysAgo = localDay(daysAgo(2));
        await expect.poll(async () => (await sessions(j, "Three days old")).filter((one) => one.session_date === twoDaysAgo).reduce((sum, one) => sum + one.duration_seconds, 0)).toBe(7200);
        const written = await writesTo(page, "time_sessions", async () => {
          await time.locator("li.row").nth(2).getByTitle("Click to edit hours").click();
          await time.locator("input.time-hours-input").blur();
        });
        if (written !== 0) throw new Error(`Opening and blurring a past day sent ${written} writes.`);
        await j.summary();
      },
    },
    {
      id: "tm-day-rollover",
      what: "With the tab open across midnight, the running clock stops, its session closes at midnight, yesterday keeps its row with its hours, and today restarts at 0 with the clock off",
      limit: 90_000,
      async run(j) {
        const { expect } = j;
        const lateYesterday = daysAgo(1, 23, 58);
        lateYesterday.setSeconds(30);
        await j.newVisit({ clock: lateYesterday });
        await j.signIn();
        await j.setUp("Midnight");
        const { page } = j;
        await edit(j, loggedHalf(page), "1");
        await card(page, "time").getByRole("button", { name: "Start work session" }).click();
        await expect(card(page, "time").getByRole("button", { name: "Stop work session" })).toBeVisible();
        await expect.poll(async () => (await sessions(j, "Midnight")).filter((one) => one.ended_at === null).length).toBe(1);
        await page.clock.runFor(150_000);
        await expect(card(page, "time").getByRole("button", { name: "Start work session" })).toBeVisible();
        await expect(hero(page)).toHaveText("0/2h");
        await expect(card(page, "time").locator(".glance-eyebrow")).toHaveText("Day 2 / 10 · Goal 2h");
        const stored = await sessions(j, "Midnight");
        const midnight = midnightBefore(lateYesterday).getTime();
        const running = stored.at(-1);
        if (stored.some((one) => one.ended_at === null)) throw new Error("A session is still open after midnight.");
        if (new Date(running.ended_at).getTime() !== midnight) throw new Error(`The running session closed at ${running.ended_at}, not at midnight.`);
        if (stored.some((one) => one.session_date !== localDay(lateYesterday))) throw new Error("A session is stored for the wrong day.");
        await j.depth();
        await expect(card(page, "time").locator("li.row .time-date")).toHaveText(["Day 1", "Today"]);
        await expect(card(page, "time").locator("li.row .time-hours")).toHaveText(["1h", "0h"]);
        await j.summary();
      },
    },
    {
      id: "tm-midnight-cap",
      what: "A session left running across midnight with no tab open is capped at its own day's midnight the next time time data is read (a visit the next day), and the card shows the clock off",
      limit: 90_000,
      async run(j) {
        const { expect } = j;
        const lateYesterday = daysAgo(1, 23, 59);
        await j.newVisit({ clock: lateYesterday });
        await j.signIn();
        await j.setUp("Left open");
        await card(j.page, "time").getByRole("button", { name: "Start work session" }).click();
        await expect(card(j.page, "time").getByRole("button", { name: "Stop work session" })).toBeVisible();
        await expect.poll(async () => (await sessions(j, "Left open")).filter((one) => one.ended_at === null).length).toBe(1);
        await j.newVisit();
        await j.signIn();
        await projectPill(j.page, "Left open").click();
        await expect(projectPill(j.page, "Left open")).toHaveClass(/\bactive\b/);
        await expect(card(j.page, "time").getByRole("button", { name: "Start work session" })).toBeVisible();
        await expect(card(j.page, "time").locator(".glance-eyebrow")).toHaveText("Day 2 / 10 · Goal 2h");
        const [left] = await sessions(j, "Left open");
        if (left.ended_at === null) throw new Error("The session left open is still open.");
        if (new Date(left.ended_at).getTime() !== midnightBefore(lateYesterday).getTime()) throw new Error(`It was capped at ${left.ended_at}, not at its day's midnight.`);
        j.note(`Capped at its day's midnight after ${left.duration_seconds} s.`);
      },
    },
  ],
};
