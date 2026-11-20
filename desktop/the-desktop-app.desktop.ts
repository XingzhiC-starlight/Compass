import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";

const CHECK =
  "The desktop app opens with no sign-in, keeps what is saved in a file of its own and not in the page, shows it again when opened again, and gives the page no way to the computer but its bridge (spec §22)";

const COMPANION =
  "The companion is a small window above the others that the dashboard draws into: its clock, its tasks and a thought typed there are the dashboard's own, each window follows the other, and it brings the main window back (spec §23)";

const CAPTURE =
  "A thought is asked for from anywhere: the app holds the capture keys, and when it tells the page, the companion opens with its summary open and the cursor in the thought box, and what is typed goes to the file (spec §22, §23)";

const GOAL =
  "One quiet note: when the running clock is seen to cross the project's daily goal the app says so once, named for the project, and with the note turned off it says nothing (spec §22)";

const NARROW =
  "At the smallest size its window takes, the dashboard's three cards are equal thirds inside the window, in summary and in depth, with names far too long for them (spec §7, §22)";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAIN = path.join(HERE, "out", "main.js");

let dataFolder: string;
let running: ElectronApplication | null = null;

/**
 * How the app is started. With `COMPASS_DESKTOP_APP` naming a packaged app's program
 * (`npm run desktop:package`), that program is the one driven; otherwise Electron is handed
 * the build in desktop/out, as `npm run desktop` does.
 */
function launching() {
  const packaged = process.env.COMPASS_DESKTOP_APP;
  // Chromium's own sandbox needs a setting most Linux test machines lack; the Mac keeps it.
  const flags = process.platform === "linux" ? ["--no-sandbox"] : [];
  return {
    ...(packaged ? { executablePath: packaged, args: flags } : { args: [MAIN, ...flags] }),
    env: { ...process.env, COMPASS_DATA_FOLDER: dataFolder } as Record<string, string>,
  };
}

async function open(): Promise<Page> {
  running = await electron.launch(launching());
  const page = await running.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return page;
}

async function close(): Promise<void> {
  await running?.close();
  running = null;
}

type KeptRow = {
  name?: string;
  text?: string;
  is_done?: boolean;
  started_at?: string;
  ended_at?: string | null;
  duration_seconds?: number;
};

function kept(): { tables: Record<string, KeptRow[]> } | null {
  const file = path.join(dataFolder, "compass-data.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

/**
 * With the app closed, move the running clock's start so that today's time reaches the
 * two-hour goal in `seconds` from now.
 */
function goalIn(seconds: number): void {
  const file = path.join(dataFolder, "compass-data.json");
  const data = kept()!;
  const sessions = data.tables.time_sessions;
  const finished = sessions.filter((row) => row.ended_at !== null).reduce((sum, row) => sum + (row.duration_seconds ?? 0), 0);
  const runningNow = sessions.filter((row) => row.ended_at === null);
  if (runningNow.length !== 1) throw new Error(`expected one running clock in the file, found ${runningNow.length}`);
  runningNow[0].started_at = new Date(Date.now() - (2 * 3600 - finished - seconds) * 1000).toISOString();
  fs.writeFileSync(file, JSON.stringify(data));
}

/** The next note the app says it sent, or null when none comes within `withinMs`. */
function nextNote(withinMs: number): Promise<{ title: string; body: string } | null> {
  return running!.evaluate(
    ({ app }, wait) =>
      new Promise<{ title: string; body: string } | null>((resolve) => {
        const none = setTimeout(() => resolve(null), wait);
        app.once("compass-goal-notice" as never, ((notice: { title: string; body: string }) => {
          clearTimeout(none);
          resolve({ title: notice.title, body: notice.body });
        }) as never);
      }),
    withinMs,
  );
}

const setup = (page: Page) => page.getByRole("button", { name: /Open my dashboard/ });
const dashboard = (page: Page) => page.getByRole("button", { name: "Settings", exact: true });

test.beforeAll(() => {
  if (!fs.existsSync(MAIN)) throw new Error("the desktop app is not built: run npm run test:desktop, which builds it first");
  dataFolder = fs.mkdtempSync(path.join(os.tmpdir(), "compass-desktop-check-"));
});
test.afterEach(close);
test.afterAll(() => {
  fs.rmSync(dataFolder, { recursive: true, force: true });
});

test.describe.configure({ mode: "serial" });

test(`${CHECK} — a first open shows the setup, at the app's own address, with no landing page and no login`, async () => {
  const page = await open();
  await expect(setup(page)).toBeVisible();
  expect(page.url()).toBe("compass://app/");
  await expect(page.getByText(/Log in|Sign in|Continue with Google/)).toHaveCount(0);
  expect(kept(), "nothing is written before anything is saved").toBeNull();
});

test(`${CHECK} — a project, a task and a running clock go to the file, and the page's own storage holds none of them`, async () => {
  const page = await open();
  await page.getByPlaceholder("Name this project").fill("Garden");
  await page.locator("#plannedHours").fill("2");
  await page.locator("#actualHours").fill("3");
  await page.locator("#projectDays").fill("10");
  const phases = page.locator(".phase-row");
  await phases.nth(0).getByPlaceholder("e.g. create the design mockup").fill("Dig the beds");
  await phases.nth(0).getByPlaceholder("0").fill("4");
  await phases.nth(1).getByPlaceholder("e.g. create the design mockup").fill("Plant");
  await phases.nth(1).getByPlaceholder("0").fill("6");
  const learning = page.locator(".learn-row");
  await learning.nth(0).getByPlaceholder("e.g. learning UI design principles").fill("Soil");
  await learning.nth(0).getByLabel("Starting level of understanding").selectOption("10");
  await learning.nth(1).getByPlaceholder("e.g. learning UI design principles").fill("Water");
  await learning.nth(1).getByLabel("Starting level of understanding").selectOption("30");
  await setup(page).click();
  await expect(dashboard(page)).toBeVisible();
  await expect(page.locator(".project-pill .pill-name", { hasText: "Garden" })).toBeVisible();

  await expect.poll(() => kept()?.tables.projects.map((row) => row.name)).toEqual(["Garden"]);
  expect(kept()?.tables.phases.map((row) => row.name)).toContain("Dig the beds");

  await page.getByText("+ Add a task").click();
  await page.getByPlaceholder("Type a task, press Enter…").fill("Buy seeds");
  await page.keyboard.press("Enter");
  await expect.poll(() => kept()?.tables.daily_tasks.map((row) => row.text)).toEqual(["Buy seeds"]);

  await page.getByRole("button", { name: "Start work session" }).click();
  await expect(page.getByRole("button", { name: "Stop work session" })).toBeVisible();
  await expect.poll(() => kept()?.tables.time_sessions.length).toBe(1);

  const inThePage = await page.evaluate(() => Object.keys(window.localStorage));
  expect(inThePage, "the tables are not in the page's storage").not.toContain("compass.localDatabase");

  await dashboard(page).click();
  await expect(page.locator(".settings-panel")).toContainText("Saved on this device");
  await page.screenshot({ path: path.join(HERE, "results", "the-desktop-app.png") });
});

test(`${CHECK} — opened again, it shows the same project on its dashboard`, async () => {
  const page = await open();
  await expect(dashboard(page)).toBeVisible();
  await expect(page.locator(".project-pill .pill-name", { hasText: "Garden" })).toBeVisible();
  await expect(page.getByText("Dig the beds").first()).toBeVisible();
  await expect(page.getByText("Buy seeds")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop work session" }), "the clock is still running").toBeVisible();
});

test(`${COMPANION}`, async () => {
  const page = await open();
  await expect(dashboard(page)).toBeVisible();
  const windows = () =>
    running!.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) => ({ onTop: w.isAlwaysOnTop(), shown: w.isVisible() })),
    );

  const [companion] = await Promise.all([
    running!.waitForEvent("window"),
    page.getByRole("button", { name: "Companion", exact: true }).click(),
  ]);
  await expect(companion.getByRole("heading", { name: "Garden" })).toBeVisible();
  expect(companion.url()).toBe("about:blank");
  await companion.screenshot({ path: path.join(HERE, "results", "the-companion-clock.png") });
  expect((await windows()).map((w) => w.onTop).sort(), "the companion alone stays on top").toEqual([false, true]);
  expect(
    await companion.evaluate(() => typeof (window as unknown as { compassDesktop?: unknown }).compassDesktop),
    "the companion's own document has no bridge",
  ).toBe("undefined");

  // The clock left running is running here too, and a press in either window moves both.
  await expect(companion.getByRole("button", { name: "Stop work session" })).toBeVisible();
  await companion.getByRole("button", { name: "Stop work session" }).click();
  await expect(page.getByRole("button", { name: "Start work session" })).toBeVisible();
  await page.getByRole("button", { name: "Start work session" }).click();
  await expect(companion.getByRole("button", { name: "Stop work session" })).toBeVisible();

  await companion.getByRole("button", { name: "Show the timeline, learning and tasks" }).click();
  await expect(companion.getByText("Phase 1 of 2")).toBeVisible();
  await expect(companion.getByText("Dig the beds")).toBeVisible();
  await expect(companion.getByText("Soil")).toBeVisible();

  await companion.getByRole("button", { name: "Mark task complete" }).click();
  await expect(page.locator(".task-item.checked", { hasText: "Buy seeds" })).toBeVisible();
  await expect.poll(() => kept()?.tables.daily_tasks.map((row) => row.is_done)).toEqual([true]);

  await companion.getByLabel("Add a thought").fill("Order mulch");
  await companion.getByLabel("Add a thought").press("Enter");
  await expect(page.getByText("Order mulch"), "it is in the dashboard's thought log").toBeAttached();
  await expect.poll(() => kept()?.tables.thoughts.map((row) => row.text)).toEqual(["Order mulch"]);
  await companion.screenshot({ path: path.join(HERE, "results", "the-companion.png") });

  // A task added on the dashboard reaches the companion without a press there.
  await page.getByText("+ Add a task").click();
  await page.getByPlaceholder("Type a task, press Enter…").fill("Water the beds");
  await page.keyboard.press("Enter");
  await expect(companion.getByText("Water the beds")).toBeVisible();

  // The Sand theme chosen in Settings is the companion's too, at once, and so is Classic again.
  await dashboard(page).click();
  await page.getByRole("button", { name: "Sand", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "sand");
  await expect(companion.locator("html")).toHaveAttribute("data-theme", "sand");
  expect(await page.evaluate(() => window.localStorage.getItem("compass.theme"))).toBe("sand");
  await page.screenshot({ path: path.join(HERE, "results", "the-desktop-app-in-sand.png") });
  await companion.screenshot({ path: path.join(HERE, "results", "the-companion-in-sand.png") });
  await page.getByRole("button", { name: "Classic", exact: true }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await expect(companion.locator("html")).not.toHaveAttribute("data-theme");
  await page.keyboard.press("Escape");

  // With the main window hidden, as closing it leaves it on a Mac, the companion brings it back.
  await running!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.isAlwaysOnTop())!.hide());
  expect((await windows()).filter((w) => !w.onTop)[0].shown).toBe(false);
  await companion.getByRole("button", { name: "Open Compass" }).click();
  await expect.poll(async () => (await windows()).filter((w) => !w.onTop)[0].shown).toBe(true);
});

test(`${CAPTURE}`, async () => {
  const page = await open();
  await expect(dashboard(page)).toBeVisible();
  expect(
    await running!.evaluate(({ globalShortcut }) => globalShortcut.isRegistered("Alt+Shift+T")),
    "the app holds the capture keys",
  ).toBe(true);

  // A check cannot press keys the whole computer hears, so it says to the page what the keys
  // and the menu's line say.
  const [companion] = await Promise.all([
    running!.waitForEvent("window"),
    running!.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => !w.isAlwaysOnTop())!
        .webContents.send("compass:capture"),
    ),
  ]);
  await expect(companion.getByRole("button", { name: "Show the clock alone" })).toBeVisible();
  await expect(companion.getByLabel("Add a thought")).toBeFocused();
  await companion.keyboard.type("Mulch first");
  await companion.keyboard.press("Enter");
  await expect.poll(() => kept()?.tables.thoughts.map((row) => row.text)).toContain("Mulch first");
  await companion.screenshot({ path: path.join(HERE, "results", "the-companion-for-a-thought.png") });

  // Asked again with the companion open, no second window opens and the cursor is in the box.
  await companion.getByRole("button", { name: "Open Compass" }).focus();
  await running!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => !w.isAlwaysOnTop())!
      .webContents.send("compass:capture"),
  );
  await expect(companion.getByLabel("Add a thought")).toBeFocused();
  expect(await running!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2);
});

test(`${GOAL}`, async () => {
  // The clock is still running. Its start is moved so the two-hour goal comes ten seconds on.
  goalIn(10);
  await open();
  expect(await nextNote(30_000)).toEqual({ title: "Garden", body: "You've reached today's goal of 2h." });
  expect(fs.existsSync(path.join(dataFolder, "compass-preferences.json")), "nothing was changed, so nothing is kept").toBe(false);
  await close();

  // Turned off, as the menu's tick leaves it, the same crossing says nothing.
  fs.writeFileSync(
    path.join(dataFolder, "compass-preferences.json"),
    JSON.stringify({ format: "compass-preferences", version: 1, goalNotice: false }),
  );
  goalIn(4);
  await open();
  expect(await nextNote(12_000)).toBeNull();
  fs.rmSync(path.join(dataFolder, "compass-preferences.json"));
});

test(`${CHECK} — the page has its bridge and no Node, and a second copy of the app does not start`, async () => {
  const page = await open();
  await expect(dashboard(page)).toBeVisible();
  const reach = await page.evaluate(() => ({
    bridge: Object.keys((window as unknown as { compassDesktop: object }).compassDesktop),
    require: typeof (window as unknown as { require?: unknown }).require,
    process: typeof (window as unknown as { process?: unknown }).process,
  }));
  expect(reach).toEqual({ bridge: ["send", "show", "onCapture"], require: "undefined", process: "undefined" });

  const blocked = await page.evaluate(() =>
    fetch("https://example.com/").then(
      () => "sent",
      () => "refused",
    ),
  );
  expect(blocked, "the page connects to nothing").toBe("refused");

  const second = await electron
    .launch({ ...launching(), timeout: 15_000 })
    .then(
      async (app) => {
        const windows = app.windows().length;
        await app.close().catch(() => undefined);
        return windows;
      },
      () => 0,
    );
  expect(second, "the second copy opened no window").toBe(0);
  expect(await running!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
});

test(`${NARROW}`, async () => {
  // With the app closed, names no card has room for: before, a long name widened its card
  // until the row of cards reached past the window's edge.
  const file = path.join(dataFolder, "compass-data.json");
  const before = fs.readFileSync(file, "utf8");
  const data = kept()!;
  for (const row of [...data.tables.phases, ...data.tables.learning_items]) {
    row.name = `${row.name} and everything else that has to happen before the first frost comes`;
  }
  fs.writeFileSync(file, JSON.stringify(data));

  const page = await open();
  await expect(dashboard(page)).toBeVisible();
  const size = await running!.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows()[0];
    main.setContentSize(200, 200);
    return main.getMinimumSize();
  });
  expect(size, "the smallest window").toEqual([1120, 640]);
  await expect.poll(() => page.evaluate(() => window.innerWidth), "the window shrank to its smallest").toBeLessThanOrEqual(1120);

  const measured = () =>
    page.evaluate(() => {
      const edges = (selector: string) =>
        Array.from(document.querySelectorAll(selector), (card) => card.getBoundingClientRect());
      const upper = edges(".upper-row > .bubble");
      return {
        window: window.innerWidth,
        page: document.documentElement.scrollWidth,
        furthestRight: Math.max(...edges(".bubble").map((box) => Math.ceil(box.right))),
        widths: upper.map((box) => Math.round(box.width)),
      };
    });
  const fits = async (view: string) => {
    const now = await measured();
    expect(now.widths, `${view}: three cards`).toHaveLength(3);
    expect(new Set(now.widths).size, `${view}: the three cards are equal (${now.widths.join(", ")})`).toBe(1);
    expect(now.furthestRight, `${view}: no card reaches past the window's edge`).toBeLessThanOrEqual(now.window);
    expect(now.page, `${view}: the page does not scroll sideways`).toBeLessThanOrEqual(now.window);
  };

  await expect(page.locator(".dashboard:not(.depth)")).toBeVisible();
  await fits("summary");
  await page.locator(".bubble-timeline").click({ position: { x: 6, y: 40 } });
  await expect(page.locator(".dashboard.depth")).toBeVisible();
  await expect(page.locator(".bubble-learning .row").first()).toBeVisible();
  await fits("depth");
  await page.screenshot({ path: path.join(HERE, "results", "the-smallest-window.png") });

  await close();
  fs.writeFileSync(file, before);
});
