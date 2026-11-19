import fs from "node:fs";
import path from "node:path";
import { chromium, expect as baseExpect } from "@playwright/test";
import { ALLOWED_ORIGINS, APP, ROOT, makeAccount, practiceCopy, readRows, signInAtThePracticeCopy, withoutColour } from "./lib.mjs";
import { STANDARD_ANSWERS, card, dashboardShown, landingLogIn, projectPill, setupShown } from "./screens.mjs";
import auth from "./journeys/auth.mjs";
import sidebar from "./journeys/sidebar.mjs";
import dashboard from "./journeys/dashboard.mjs";
import commitment from "./journeys/commitment.mjs";
import timeline from "./journeys/timeline.mjs";
import learning from "./journeys/learning.mjs";
import tasks from "./journeys/tasks.mjs";
import thoughts from "./journeys/thoughts.mjs";
import interview from "./journeys/interview.mjs";
import settings from "./journeys/settings.mjs";
import landing from "./journeys/landing.mjs";

export const JOURNEYS = [auth, sidebar, dashboard, commitment, timeline, learning, tasks, thoughts, interview, settings, landing];

const VIEWPORT = { width: 1440, height: 900 };
const STEP_LIMIT = 60_000;

export const expect = baseExpect.configure({ timeout: 10_000 });

export function journeysNamed(names) {
  if (names.length === 0 || names.includes("all")) return JOURNEYS;
  const found = [];
  const unknown = [];
  for (const name of names) {
    const journey = JOURNEYS.find((one) => one.name === name || one.section === name || one.section === `§${name}`);
    if (journey) found.push(journey);
    else unknown.push(name);
  }
  if (unknown.length > 0) {
    throw new Error(`No journey is named ${unknown.map((name) => `"${name}"`).join(", ")}. The journeys: ${JOURNEYS.map((one) => one.name).join(", ")}.`);
  }
  return found;
}

/** A page context that can reach only the practice app and the practice copy. Anything else is
 *  refused and recorded, so no step can quietly reach the live project or the open internet. */
export async function guardedContext(browser, refused, options = {}) {
  const context = await browser.newContext({ baseURL: APP, viewport: VIEWPORT, ...options });
  await context.route("**/*", (route) => {
    const address = route.request().url();
    let origin = "";
    try {
      origin = new URL(address).origin;
    } catch {
      /* not an address with an origin */
    }
    if (ALLOWED_ORIGINS.has(origin)) return route.continue().catch(() => {});
    refused.push(origin || address.slice(0, 80));
    return route.abort("blockedbyclient").catch(() => {});
  });
  return context;
}

export function makeHelpers(j) {
  return {
    async open(pathname = "/") {
      const address = new URL(pathname, APP);
      if (address.origin !== APP) throw new Error(`Only the practice app is driven; ${address.origin} is not it.`);
      await j.page.goto(address.href);
    },

    async signIn(account = j.account) {
      const { page } = j;
      await j.open("/");
      await landingLogIn(page).click();
      await page.getByPlaceholder("you@example.com").fill(account.email);
      await page.getByPlaceholder("Password", { exact: true }).fill(account.password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(dashboardShown(page).or(setupShown(page))).toBeVisible();
    },

    /** Answers the setup from wherever the user is: the dashboard's "+ New project" first when
     *  the dashboard shows. Waits until the new project's pill is the active one. */
    async setUp(name, answers = {}) {
      const { page } = j;
      const given = { ...STANDARD_ANSWERS, ...answers };
      if (await dashboardShown(page).isVisible()) await page.getByRole("button", { name: "New project" }).click();
      await expect(setupShown(page)).toBeVisible();
      await page.getByPlaceholder("Name this project").fill(name);
      await page.getByLabel("How many hours would you like to spend on it each day?").fill(given.planned);
      await page.getByLabel("How much time do you actually have available each day?").fill(given.actual);
      await page.getByLabel(/How long do you think this project will take/).fill(given.days);
      for (let i = 2; i < given.phases.length; i += 1) await page.getByRole("button", { name: "+ Add a phase" }).click();
      for (let i = 2; i < given.learning.length; i += 1) await page.getByRole("button", { name: "+ Add something to learn" }).click();
      if (given.phases.length < 2) await page.locator(".phase-row").last().getByRole("button", { name: "Remove phase" }).click();
      if (given.learning.length < 2) await page.locator(".learn-row").last().getByRole("button", { name: "Remove item" }).click();
      const phases = page.locator(".phase-row");
      for (const [i, [phase, days]] of given.phases.entries()) {
        await phases.nth(i).getByPlaceholder("e.g. create the design mockup").fill(phase);
        await phases.nth(i).getByPlaceholder("0").fill(days);
      }
      const learning = page.locator(".learn-row");
      for (const [i, [item, level]] of given.learning.entries()) {
        await learning.nth(i).getByPlaceholder("e.g. learning UI design principles").fill(item);
        await learning.nth(i).getByLabel("Starting level of understanding").selectOption(level);
      }
      await page.getByRole("button", { name: "Open my dashboard →" }).click();
      await expect(projectPill(page, name)).toHaveClass(/\bactive\b/);
      await expect(card(page, "time").getByRole("heading", { name: "Commitment" })).toBeVisible();
    },

    async depth() {
      const { page } = j;
      if (!(await page.locator("main.dashboard").evaluate((el) => el.classList.contains("depth")))) {
        await card(page, "timeline").getByRole("heading", { name: "Timeline" }).click();
      }
      await expect(page.locator("main.dashboard")).toHaveClass(/\bdepth\b/);
    },

    async summary() {
      const { page } = j;
      if (await page.locator("main.dashboard").evaluate((el) => el.classList.contains("depth"))) {
        await card(page, "timeline").getByRole("heading", { name: "Timeline" }).click();
      }
      await expect(page.locator("main.dashboard")).not.toHaveClass(/\bdepth\b/);
    },

    /** Holds a drag's pointer at (x, y) for `ms`. A browser keeps sending dragover while the pointer
     *  rests; the driver sends one per move, and not every one reaches the page, so the pointer
     *  jitters by a pixel to keep them coming. */
    async holdDrag(x, y, ms) {
      for (let waited = 0, side = 1; waited < ms; waited += 50, side = -side) {
        await j.page.mouse.move(x + side, y);
        await j.page.waitForTimeout(50);
      }
    },

    /** Presses a drag handle and moves far enough at once that the driver takes it for a drag. */
    async startDrag(handle) {
      const grip = await handle.boundingBox();
      await j.page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await j.page.mouse.down();
      await j.page.mouse.move(grip.x + grip.width / 2, grip.y + 30, { steps: 4 });
    },

    /** Ticks every phase of the open project done, in the Timeline's depth view. */
    async tickEveryPhase() {
      await j.depth();
      const timeline = card(j.page, "timeline");
      await expect(timeline.locator(".col-head")).toContainText(/\d+\/\d+ done/);
      const notDone = timeline.getByRole("button", { name: "Mark phase done", exact: true });
      for (let left = await notDone.count(); left > 0; left -= 1) {
        await notDone.first().click();
        await expect(notDone).toHaveCount(left - 1);
      }
    },

    async signOut() {
      const { page } = j;
      await dashboardShown(page).click();
      await page.getByRole("button", { name: "Log out, sign out from your account" }).click();
      await expect(landingLogIn(page)).toBeVisible();
    },

    /** Rows of one table as the journey's account (or `as`) reads them; saved with the step. */
    async rows(table, query = "select=*", as = j.account) {
      const token = await signInAtThePracticeCopy(j.where, as);
      const rows = await readRows(j.where, token, table, query);
      j.current.rows.push({ table, query, as: as.email, rows });
      return rows;
    },

    note(line) {
      j.current.notes.push(String(line));
    },

    /** An outline and a picture now, mid-step, besides the pair every step ends with. */
    async snap(label) {
      const files = await capture(j.page, path.join(j.dir, `${j.current.prefix}-${label}`));
      j.current.evidence.push(...files);
    },

    async newPage(options = {}) {
      j.page = await j.context.newPage();
      watch(j, j.page);
      if (options.clock) await j.page.clock.install({ time: options.clock });
      return j.page;
    },

    /** A new visit from another device: fresh storage, nothing signed in. */
    async newVisit(options = {}) {
      await keepVideos(j);
      await j.context.close();
      j.context = await guardedContext(j.browser, j.refused, j.contextOptions);
      return j.newPage(options);
    },
  };
}

function watch(j, page) {
  j.pages.push(page);
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    j.console.push({ step: j.current?.id ?? "", kind: message.type(), text: message.text().slice(0, 500) });
  });
  page.on("pageerror", (error) => {
    j.console.push({ step: j.current?.id ?? "", kind: "uncaught", text: String(error?.message ?? error).slice(0, 500) });
  });
  page.on("response", async (response) => {
    if (response.status() < 400) return;
    const step = j.current?.id ?? "";
    let code = "";
    try {
      const body = await response.json();
      code = String(body?.error_code ?? body?.code ?? body?.error ?? "");
    } catch {
      /* not a JSON answer */
    }
    const at = new URL(response.url());
    j.network.push(`[${step}] ${response.status()} ${response.request().method()} ${at.pathname}${code ? ` (${code})` : ""}`);
  });
}

async function capture(page, base) {
  const files = [];
  try {
    if (page.isClosed()) return files;
    fs.writeFileSync(`${base}.aria.yml`, `${await page.locator("body").ariaSnapshot({ timeout: 5_000 })}\n`);
    files.push(`${base}.aria.yml`);
  } catch {
    /* the page had nothing to outline, or had gone */
  }
  try {
    await page.screenshot({ path: `${base}.png`, timeout: 10_000 });
    files.push(`${base}.png`);
  } catch {
    /* no picture could be taken */
  }
  return files;
}

async function keepVideos(j) {
  j.videos.push(...j.pages.map((page) => page.video()).filter(Boolean));
  j.pages = [];
}

function withLimit(promise, ms, what) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} ran past its limit of ${Math.round(ms / 1000)} seconds.`)), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

function firstLines(error) {
  const text = withoutColour(error?.message ?? error);
  return text.split("\n").map((line) => line.trimEnd()).filter((line) => line.trim() !== "").slice(0, 6).join("\n");
}

function expectedConsole(step, entry) {
  return (step.console ?? []).some((pattern) => pattern.test(entry.text));
}

async function runJourney(browser, run, journey, options = {}) {
  const dir = path.join(run.dir, "journeys", journey.name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const where = await practiceCopy();
  const contextOptions = { recordVideo: { dir: path.join(dir, ".video"), size: VIEWPORT } };
  const refused = [];
  const j = {
    run, dir, where, browser, refused, contextOptions, expect,
    account: journey.account === false ? null : await makeAccount(run, journey.name, where),
    state: {}, console: [], network: [], pages: [], videos: [], current: null,
  };
  Object.assign(j, makeHelpers(j));
  j.context = await guardedContext(browser, refused, contextOptions);
  j.page = await j.context.newPage();
  watch(j, j.page);

  const began = Date.now();
  const steps = [];
  let stopped = false;
  for (const [index, step] of journey.steps.entries()) {
    const prefix = String(index + 1).padStart(2, "0") + `-${step.id}`;
    const record = { id: step.id, what: step.what, result: "not run", ms: 0, error: "", evidence: [], notes: [], rows: [], prefix };
    steps.push(record);
    if (stopped) continue;
    j.current = record;
    const consoleBefore = j.console.length;
    const refusedBefore = refused.length;
    const stepBegan = Date.now();
    try {
      await withLimit(step.run(j), step.limit ?? STEP_LIMIT, `The step ${step.id}`);
      record.result = "passed";
    } catch (error) {
      record.result = "failed";
      record.error = firstLines(error);
    }
    record.ms = Date.now() - stepBegan;
    const unexpected = j.console.slice(consoleBefore).filter((entry) => !expectedConsole(step, entry));
    if (record.result === "passed" && unexpected.length > 0) {
      record.result = "failed";
      record.error = `The page printed what this step does not expect: ${unexpected.map((entry) => `${entry.kind}: ${entry.text}`).join(" | ").slice(0, 600)}`;
    }
    if (refused.length > refusedBefore) {
      record.result = "failed";
      record.error = `${record.error ? `${record.error}\n` : ""}The page tried to reach an address outside the practice app and the practice copy, and was refused: ${[...new Set(refused.slice(refusedBefore))].join(", ")}.`;
    }
    record.evidence.push(...(await capture(j.page, path.join(dir, prefix))));
    if (record.rows.length > 0) {
      fs.writeFileSync(path.join(dir, `${prefix}.rows.json`), `${JSON.stringify(record.rows, null, 2)}\n`);
      record.evidence.push(path.join(dir, `${prefix}.rows.json`));
    }
    if (record.result === "failed") stopped = true;
  }
  j.current = null;

  await keepVideos(j);
  await j.context.close().catch(() => {});
  const failed = steps.some((step) => step.result !== "passed");
  const kept = [];
  for (const [at, video] of j.videos.entries()) {
    const from = await video.path().catch(() => "");
    if (!from || !fs.existsSync(from)) continue;
    if (failed || options.keepVideo) {
      const to = path.join(dir, j.videos.length === 1 ? "journey.webm" : `journey-${at + 1}.webm`);
      fs.renameSync(from, to);
      kept.push(to);
    }
  }
  fs.rmSync(path.join(dir, ".video"), { recursive: true, force: true });

  const consoleLog = j.console.map((entry) => `[${entry.step}] ${entry.kind}: ${entry.text}`).join("\n");
  fs.writeFileSync(path.join(dir, "console.log"), consoleLog ? `${consoleLog}\n` : "");
  fs.writeFileSync(path.join(dir, "error-answers.log"), j.network.length > 0 ? `${j.network.join("\n")}\n` : "");
  const inRun = (file) => path.relative(run.dir, file);
  const result = {
    name: journey.name, section: journey.section, title: journey.title,
    passed: !failed, ms: Date.now() - began, account: j.account?.email ?? "",
    steps: steps.map(({ prefix: _prefix, rows: _rows, evidence, ...reported }) => ({ ...reported, evidence: evidence.map(inRun) })),
    videos: kept.map(inRun), refused: [...new Set(refused)],
  };
  fs.writeFileSync(path.join(dir, "journey.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export async function runJourneys(run, journeys, options = {}) {
  const browser = await chromium.launch({ headless: !options.headed });
  const results = [];
  try {
    for (const journey of journeys) {
      let result;
      try {
        result = await runJourney(browser, run, journey, options);
      } catch (error) {
        result = notStarted(run, journey, error);
      }
      results.push(result);
      options.say?.(sayJourney(result, run));
    }
  } finally {
    await browser.close().catch(() => {});
  }
  writeReport(run);
  return results;
}

/** A journey that could not begin (its account, its browser context): every step not run. */
function notStarted(run, journey, error) {
  const dir = path.join(run.dir, "journeys", journey.name);
  fs.mkdirSync(dir, { recursive: true });
  const result = {
    name: journey.name, section: journey.section, title: journey.title, passed: false, ms: 0, account: "",
    startError: firstLines(error),
    steps: journey.steps.map((step) => ({ id: step.id, what: step.what, result: "not run", ms: 0, error: "", evidence: [], notes: [] })),
    videos: [], refused: [],
  };
  fs.writeFileSync(path.join(dir, "journey.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

function sayJourney(result, run) {
  if (result.startError) return `FAILED  ${result.section} ${result.name} — could not start: ${result.startError.split("\n")[0]}`;
  const lines = [];
  const passedSteps = result.steps.filter((step) => step.result === "passed").length;
  lines.push(`${result.passed ? "passed" : "FAILED"}  ${result.section} ${result.name} — ${passedSteps} of ${result.steps.length} steps (${Math.round(result.ms / 1000)} s)`);
  for (const step of result.steps.filter((one) => one.result === "failed")) {
    lines.push(`        failed at ${step.id}: ${step.error.split("\n")[0]}`);
    const picture = step.evidence.find((file) => file.endsWith(".png"));
    if (picture) lines.push(`        picture: ${path.relative(ROOT, path.join(run.dir, picture))}`);
  }
  return lines.join("\n");
}

function writeReport(run) {
  const folder = path.join(run.dir, "journeys");
  const results = [];
  for (const journey of JOURNEYS) {
    const file = path.join(folder, journey.name, "journey.json");
    if (fs.existsSync(file)) results.push(JSON.parse(fs.readFileSync(file, "utf8")));
  }
  const lines = [
    `# Compass verification — ${run.id}`,
    "",
    `Checkout ${run.checkout} · branch ${run.branch} · commit ${run.commit}${run.dirty ? " with uncommitted changes" : ""}.`,
    `Driven at ${APP} against the practice copy. Every account and row shown is made up.`,
    "",
    "| Journey | § | Step | Result | Evidence |",
    "|---|---|---|---|---|",
  ];
  for (const result of results) {
    for (const step of result.steps) {
      const evidence = step.evidence.map((file) => `\`${file}\``).join(" ");
      lines.push(`| ${result.name} | ${result.section} | \`${step.id}\` | ${step.result} | ${evidence} |`);
    }
  }
  const failures = results.flatMap((result) => result.steps.filter((step) => step.result === "failed").map((step) => ({ result, step })));
  const unstarted = results.filter((result) => result.startError);
  lines.push("");
  if (failures.length === 0 && unstarted.length === 0) {
    lines.push(results.length === 0 ? "No journey ran." : `Every step of ${results.length} journeys passed.`);
  } else {
    lines.push("## Failed");
    for (const result of unstarted) lines.push("", `### ${result.name} · could not start`, "", "```", result.startError, "```");
    for (const { result, step } of failures) {
      lines.push("", `### ${result.name} · \`${step.id}\``, "", step.what, "", "```", step.error, "```");
      if (result.videos.length > 0) lines.push("", `Recording: ${result.videos.map((file) => `\`${file}\``).join(", ")}`);
    }
  }
  const notRun = results.flatMap((result) => result.steps.filter((step) => step.result === "not run").map((step) => `${result.name} · \`${step.id}\``));
  if (notRun.length > 0) lines.push("", "## Not run (an earlier step of the journey failed)", "", ...notRun.map((line) => `- ${line}`));
  fs.writeFileSync(path.join(run.dir, "report.md"), `${lines.join("\n")}\n`);
  fs.writeFileSync(path.join(run.dir, "report.json"), `${JSON.stringify({ run: run.id, results }, null, 2)}\n`);
}
