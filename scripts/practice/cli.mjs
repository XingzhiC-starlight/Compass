#!/usr/bin/env node
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  PracticeRefusal, failingExitCode, nameFilterFor, readBrowserReport, readSettings, refuseUnlessChecksFolderIsWhole, runnerEndedAsFailed,
  switchedOffInFile, troubleRaisedOutside, troublesInFile, turnsAtOneLine,
} from "./lib.mjs";
import {
  bringUp, keepAwake, refuseNamesWithoutAFile, remake, runBrowserChecks, runDatabaseChecks, runRolledBackChecks, startPracticeApp,
  throwAway,
} from "./commands.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function realTool(args) {
  return toolAt(ROOT)(args);
}

function toolAt(folder, added) {
  return (args) =>
    new Promise((resolve) => {
      let text = "";
      const env = added ? { ...process.env, ...added(process.env) } : undefined;
      const child = spawn("supabase", ["--agent", "no", "--workdir", folder, ...args], { cwd: folder, env });
      child.stdout.on("data", (chunk) => { text += chunk; });
      child.stderr.on("data", (chunk) => { text += chunk; });
      child.on("error", (error) => resolve({ code: 127, text: `the Supabase tool could not be run: ${error.message}` }));
      child.on("close", (code) => resolve({ code: code ?? 1, text }));
    });
}

export function realSurroundings() {
  return {
    tool: realTool,
    say: (line) => console.log(line),
    settings: readSettings(fs.readFileSync(path.join(ROOT, "supabase", "config.toml"), "utf8")),
    linked: fs.existsSync(path.join(ROOT, "supabase", ".temp", "project-ref")),
    request: fetch,
  };
}

const ASSERTIONS_OFF = "-c plpgsql.check_asserts=off";

function withAssertionsOffAdded(already) {
  const kept = (already ?? "").trim();
  return kept ? `${kept} ${ASSERTIONS_OFF}` : ASSERTIONS_OFF;
}

export function withAssertionsOff(around) {
  if (around.tool !== realTool) {
    throw new Error(
      "withAssertionsOff takes surroundings whose tool is the real Supabase tool (realTool), and was handed another: " +
        "a pretend tool would be replaced by the real one, and a wrap of the real one dropped. " +
        "Wrap the tool of the surroundings it answers instead.",
    );
  }
  return { ...around, tool: toolAt(ROOT, (env) => ({ PGOPTIONS: withAssertionsOffAdded(env.PGOPTIONS) })) };
}

export function practiceAccounts() {
  const file = path.join(ROOT, "supabase", "practice", "accounts.json");
  return JSON.parse(fs.readFileSync(file, "utf8")).accounts.map(({ email, password }) => ({ email, password }));
}

export function migrationFiles() {
  return fs.readdirSync(path.join(ROOT, "supabase", "migrations")).filter((name) => name.endsWith(".sql")).sort();
}

export function rolledBackChecks() {
  const folder = path.join(ROOT, "supabase", "checks");
  const migrations = new Set(migrationFiles());
  return fs.readdirSync(folder).filter((name) => migrations.has(name)).sort().map((name) => path.join("supabase", "checks", name));
}

export function checksFolder() {
  return { entries: fs.readdirSync(path.join(ROOT, "supabase", "checks")), migrations: migrationFiles() };
}

const CHECKS_FOLDER_JUDGED = Symbol.for("compass.practice.checksFolderJudged");

export function checksFolderUnlessJudged() {
  return globalThis[CHECKS_FOLDER_JUDGED] ? undefined : checksFolder();
}

export function placeStrayCheckFile(name, text) {
  if (typeof name !== "string" || name === "" || name === "." || name === ".." || /[\\/]/.test(name)) {
    throw new Error(`"${String(name)}" is not a plain file name: nothing was placed in supabase/checks/.`);
  }
  const where = path.join(ROOT, "supabase", "checks", name);
  try {
    fs.writeFileSync(where, text, { flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error(`supabase/checks/${name} is already there: nothing was placed, and it was left as it was.`, { cause: error });
    throw error;
  }
  return { file: path.join("supabase", "checks", name), remove: () => fs.rmSync(where, { force: true }) };
}

const LOOPBACK = ["127.0.0.1", "::1"];

function answersAt(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (answered) => {
      socket.destroy();
      resolve(answered);
    };
    socket.setTimeout(1000, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

export async function startPracticeServer(told, serveAt, { cacheDir = path.join(ROOT, "node_modules", ".vite-practice") } = {}) {
  const port = Number(new URL(serveAt).port);
  const answered = await Promise.all(LOOPBACK.map((host) => answersAt(host, port)));
  const taken = LOOPBACK.find((_host, at) => answered[at]);
  if (taken) {
    throw new Error(`Port ${port} is already in use: something answers at ${taken.includes(":") ? `[${taken}]` : taken}:${port}.`);
  }
  process.env.VITE_SUPABASE_URL = told.supabaseUrl;
  process.env.VITE_SUPABASE_ANON_KEY = told.supabaseKey;
  process.env.VITE_TURNSTILE_SITE_KEY = told.turnstileSiteKey;
  const { createServer } = await import("vite");
  const at = new URL(serveAt);
  const server = await createServer({
    root: ROOT,
    envDir: false,
    cacheDir,
    server: { host: at.hostname, port: Number(at.port), strictPort: true },
  });
  await server.listen();
  const awake = keepAwake(realSurroundings(), { address: told.supabaseUrl, publicKey: told.supabaseKey });
  return {
    close: async () => {
      awake.stop();
      await server.close();
    },
  };
}

const SOUND = "scripts/practice/sound-on-purpose.database.fixture.test.ts";
const SOUND_AT_A_LINE = `${SOUND}:24`;
const NO_SUCH_FILE = "scripts/practice/no-such-file.database.test.ts";
const OUTSIDE_THE_GROUP = "scripts/practice/finding-the-practice-copy.test.ts";
const KEPT = {
  failure: ["scripts/practice/false-on-purpose.database.fixture.test.ts"],
  "cannot-load": [SOUND, "scripts/practice/cannot-load-on-purpose.database.fixture.test.ts"],
  "setup-fails": [SOUND, "scripts/practice/setup-fails-on-purpose.database.fixture.test.ts"],
  "teardown-fails": [SOUND, "scripts/practice/teardown-fails-on-purpose.database.fixture.test.ts"],
  "raises-outside": [SOUND, "scripts/practice/raises-outside-on-purpose.database.fixture.test.ts"],
  "only-refused": [SOUND, "scripts/practice/only-refused-on-purpose.database.fixture.test.ts"],
  sound: [SOUND],
  "switched-off": ["scripts/practice/switched-off-on-purpose.database.fixture.test.ts"],
  "all-switched-off": ["scripts/practice/all-switched-off-on-purpose.database.fixture.test.ts"],
  "holds-no-check": [SOUND, "scripts/practice/holds-no-check-on-purpose.database.fixture.test.ts"],
  "long-names": ["scripts/practice/long-names-on-purpose.database.fixture.test.ts"],
  "refusal-passes": ["scripts/practice/refusal-passes-on-purpose.database.fixture.test.ts"],
  "refusal-fails": ["scripts/practice/refusal-fails-on-purpose.database.fixture.test.ts"],
  "closing-fails": [SOUND],
  "no-match-alone": [NO_SUCH_FILE],
  "no-match-beside": [SOUND, NO_SUCH_FILE],
  "skips-itself": ["scripts/practice/skips-itself-on-purpose.database.fixture.test.ts"],
  "skips-itself-then-fails": ["scripts/practice/skips-itself-before-a-failing-step-on-purpose.database.fixture.test.ts"],
  "same-line": ["scripts/practice/same-line-on-purpose.database.fixture.test.ts"],
  "empty-group": ["scripts/practice/holds-an-empty-group-on-purpose.database.fixture.test.ts"],
  "exit-code-fails": [SOUND],
  "first-step-fails": [SOUND],
  "line-name": [SOUND_AT_A_LINE],
  "outside-the-group": [SOUND, OUTSIDE_THE_GROUP],
};

function askTheRunner() {
  let runner;
  return {
    filesNamed: async (name) => {
      const { createVitest } = await import("vitest/node");
      runner ??= await createVitest({ root: ROOT, watch: false, project: ["database"] });
      const found = await runner.globTestSpecifications([name]);
      return found.map((file) => path.relative(ROOT, file.moduleId));
    },
    close: async () => {
      await runner?.close();
    },
  };
}

function runGroup(files, nameFilter) {
  return async (_where, options) => {
    if (globalThis[GROUP_RUNNING]) {
      throw new PracticeRefusal("tool", "The database checks are already running in this process.");
    }
    globalThis[GROUP_RUNNING] = true;
    try {
      const { startVitest } = await import("vitest/node");
      const checks = [];
      const troubles = [];
      const switchedOff = [];
      let verdict = "";
      let filesRun = 0;
      let leftByTheRun;
      const begun = new Set();
      const began = (check) => begun.has(check.id);
      const reportOf = new Map();
      const listener = {
        onTestCaseReady(testCase) {
          begun.add(testCase.id);
        },
        onTestCaseResult(testCase) {
          const state = testCase.result().state;
          if (state !== "passed" && state !== "failed") return;
          const report = {
            name: testCase.fullName,
            file: path.relative(ROOT, testCase.module.moduleId),
            passed: state === "passed",
            tries: 1 + (testCase.diagnostic()?.retryCount ?? 0),
            line: testCase.location?.line ?? 0,
          };
          reportOf.set(testCase.id, report);
          checks.push(report);
        },
        onTestRunEnd(modules, unhandledErrors, reason) {
          filesRun = modules.length;
          for (const module of modules) {
            const file = path.relative(ROOT, module.moduleId);
            troubles.push(...troublesInFile(file, module, began));
            switchedOff.push(...switchedOffInFile(file, module, began));
            for (const [check, turn] of turnsAtOneLine(module)) {
              const report = reportOf.get(check.id);
              if (report) report.turn = turn;
            }
          }
          for (const error of unhandledErrors) {
            const running = typeof error?.VITEST_TEST_PATH === "string" ? path.relative(ROOT, error.VITEST_TEST_PATH) : "";
            troubles.push(troubleRaisedOutside(error, running));
          }
          verdict = reason;
          leftByTheRun = process.exitCode;
          process.exitCode = undefined;
        },
      };
      await startVitest(files, {
        root: ROOT,
        watch: false,
        project: ["database"],
        retry: options.secondTry ? 1 : 0,
        ...(nameFilter ? { testNamePattern: nameFilter } : {}),
        reporters: ["default", listener],
        includeTaskLocation: true,
        silent: "passed-only",
      });

      // By now the runner has closed the group itself. The step that closes the group may
      // go wrong once every check has passed, and the runner says so only by the exit code
      // it leaves. The listener put aside what the RUN had left as it ended, so a failing
      // code found now was left after it. When files ran, that was the closing. When none
      // did, a step BEFORE the first check failed, which the runner reports the same way:
      // then no check ran, the command says so, and the closing is not blamed.
      const leftByTheClosing = process.exitCode;
      if (failingExitCode(leftByTheClosing) && filesRun > 0) {
        troubles.push({ file: "", what: "the step that closes the whole group of checks went wrong; the test runner's report above says how" });
      }

      const runnerFailed = runnerEndedAsFailed(verdict, leftByTheRun, leftByTheClosing);
      return { checks, troubles, switchedOff, runnerFailed };
    } finally {
      globalThis[GROUP_RUNNING] = false;
    }
  };
}

const GROUP_RUNNING = Symbol.for("compass.practice.groupRunning");

export async function runDatabaseCommand(options) {
  const kept = KEPT[options?.kept ?? "failure"];
  if (!kept) throw new Error(`No kept files are named "${String(options?.kept)}": one of ${Object.keys(KEPT).join(", ")}.`);
  const words = ["test-db", ...(options?.secondTry ? ["--second-try"] : []), ...kept];
  const around = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("VITEST")) around[name] = value;
  }
  around.PRACTICE_FALSE_CHECK = "1";
  // As on GitHub, where the test runner refuses a check marked as the only one to run.
  if (options?.kept === "only-refused") around.CI = "true";
  if (options?.kept === "closing-fails") around.PRACTICE_CLOSING_FAILS = "1";
  if (options?.kept === "exit-code-fails") around.PRACTICE_EXIT_CODE_FAILS = "1";
  if (options?.kept === "first-step-fails") around.PRACTICE_FIRST_STEP_FAILS = "1";

  return new Promise((resolve) => {
    let text = "";
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...words], { cwd: ROOT, env: around });
    child.stdout.on("data", (chunk) => { text += chunk; });
    child.stderr.on("data", (chunk) => { text += chunk; });
    child.on("error", (error) => resolve({ code: 127, text: `the database command could not be run: ${error.message}` }));
    child.on("close", (code) => resolve({ code: code ?? 1, text }));
  });
}

export async function runCheckCommand(options) {
  const words = ["check", ...(options?.files ?? [])];
  const around = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("VITEST")) around[name] = value;
  }
  const timeLimit = options?.timeLimit ?? 120_000;
  return new Promise((resolve) => {
    let text = "";
    let stopped = false;
    let answered = false;
    const timers = [];
    const answer = (code) => {
      if (answered) return;
      answered = true;
      for (const timer of timers) clearTimeout(timer);
      if (stopped) {
        const seconds = Math.round(timeLimit / 100) / 10;
        text += `${text === "" || text.endsWith("\n") ? "" : "\n"}The check command was stopped: it ran past its time limit of ${seconds} seconds.\n`;
        resolve({ code: 124, text });
      } else {
        resolve({ code, text });
      }
    };
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...words], { cwd: ROOT, env: around });
    child.stdout.on("data", (chunk) => { text += chunk; });
    child.stderr.on("data", (chunk) => { text += chunk; });
    timers.push(setTimeout(() => {
      stopped = true;
      child.kill("SIGTERM");
      timers.push(setTimeout(() => {
        child.kill("SIGKILL");
        timers.push(setTimeout(() => answer(124), 5_000));
      }, 5_000));
    }, timeLimit));
    child.on("error", (error) => {
      if (answered) return;
      answered = true;
      for (const timer of timers) clearTimeout(timer);
      resolve({ code: 127, text: `the check command could not be run: ${error.message}` });
    });
    child.on("close", (code) => answer(code ?? 1));
  });
}

export function surroundingsWithBrokenMigration() {
  const committed = migrationFiles();
  const highest = committed.reduce((most, name) => Math.max(most, Number.parseInt(name, 10) || 0), 0);
  const migration = `${String(highest + 1).padStart(4, "0")}_cannot_replay.sql`;

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "compass-practice-broken-"));
  const ours = path.join(ROOT, "supabase");
  const theirs = path.join(scratch, "supabase");
  fs.mkdirSync(path.join(theirs, "migrations"), { recursive: true });
  fs.mkdirSync(path.join(theirs, "templates"), { recursive: true });
  fs.copyFileSync(path.join(ours, "config.toml"), path.join(theirs, "config.toml"));
  for (const name of fs.readdirSync(path.join(ours, "templates"))) {
    fs.copyFileSync(path.join(ours, "templates", name), path.join(theirs, "templates", name));
  }
  for (const name of committed) {
    fs.copyFileSync(path.join(ours, "migrations", name), path.join(theirs, "migrations", name));
  }
  fs.writeFileSync(
    path.join(theirs, "migrations", migration),
    "-- Made to fail, for a check: this migration cannot replay.\nselect from a table that was never made;\n",
  );

  return {
    around: { ...realSurroundings(), tool: toolAt(scratch), say: () => {}, linked: false },
    migration,
    discard: () => {
      if (path.basename(scratch).startsWith("compass-practice-broken-")) {
        fs.rmSync(scratch, { recursive: true, force: true });
      }
    },
  };
}

const BROWSER_CONFIG = path.join(ROOT, "browser", "playwright.config.ts");
const BROWSER_REPORT = path.join(ROOT, "browser", "results", "report.json");
const STOPPING_SIGNALS = ["SIGTERM", "SIGINT", "SIGHUP"];

async function runJourneys(where, options) {
  const { chromium } = await import("@playwright/test");
  try {
    const browser = await chromium.launch();
    await browser.close();
  } catch (error) {
    const reason = String(error?.message ?? error ?? "")
      // eslint-disable-next-line no-control-regex
      .replace(/\u001b\[[0-9;]*m/g, "")
      .split("\n")
      .map((line) => line.replace(/[\u2500-\u257f]/g, "").replace(/^browserType\.launch:\s*/, "").trim())
      .find((line) => line !== "") ?? "no reason was given";
    throw new Error(`Chromium for the browser checks could not be started (${reason.slice(0, 300)}): if it was never downloaded, run npx playwright install chromium (once); otherwise fix what the reason names, then try again.`, { cause: error });
  }
  fs.rmSync(BROWSER_REPORT, { force: true });
  const runner = createRequire(import.meta.url).resolve("@playwright/test/cli");
  // The runner reads each name as a pattern on a file's path: so each is made to mean itself.
  const files = (options.files ?? []).map((file) => String(file).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const code = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [runner, "test", "--config", BROWSER_CONFIG, ...(options.secondTry ? ["--retries=1"] : []), ...files],
      { cwd: ROOT, env: { ...process.env, BROWSER_APP: where.app, BROWSER_INBOX: where.inbox }, stdio: ["ignore", "inherit", "inherit"] },
    );
    let stopping = false;
    const stopTheRunner = (signal) => {
      stopping = true;
      for (const name of STOPPING_SIGNALS) process.off(name, stopTheRunner);
      const kill = setTimeout(() => child.kill("SIGKILL"), 10_000);
      child.once("close", () => {
        clearTimeout(kill);
        process.kill(process.pid, signal);
      });
      child.kill("SIGINT");
    };
    for (const name of STOPPING_SIGNALS) process.on(name, stopTheRunner);
    const settle = (exit) => {
      for (const name of STOPPING_SIGNALS) process.off(name, stopTheRunner);
      if (!stopping) resolve(exit);
    };
    child.on("error", () => settle(127));
    child.on("close", (exit) => settle(exit ?? 1));
  });
  if (!fs.existsSync(BROWSER_REPORT)) {
    throw new Error(`the browser's runner ended (exit code ${code}) and left no report at ${path.relative(ROOT, BROWSER_REPORT)}.`);
  }
  return readBrowserReport(JSON.parse(fs.readFileSync(BROWSER_REPORT, "utf8")), ROOT, code);
}

const COMMANDS = {
  up: (around) => bringUp(around, practiceAccounts()),
  reset: (around) => remake(around, practiceAccounts()),
  down: (around) => throwAway(around),
  check: async (around) => {
    const named = process.argv.slice(3).filter((word) => !word.startsWith("--"));
    const folder = checksFolder();
    const files = named.length > 0 ? named : folder.migrations.map((name) => path.join("supabase", "checks", name));
    const { held } = await runRolledBackChecks(around, files, folder);
    if (!held) process.exitCode = 1;
  },
  "test-db": async (around) => {
    refuseUnlessChecksFolderIsWhole(checksFolder());
    globalThis[CHECKS_FOLDER_JUDGED] = true;
    const secondTry = process.argv.includes("--second-try");
    const nameFilter = nameFilterFor(process.argv.slice(3));
    const files = process.argv.slice(3).filter((word) => !word.startsWith("--"));
    if (files.length > 0) {
      const asking = askTheRunner();
      try {
        await refuseNamesWithoutAFile(files, asking.filesNamed);
      } finally {
        await asking.close();
      }
    }
    const { passed } = await runDatabaseChecks(around, migrationFiles(), runGroup(files, nameFilter), { secondTry });
    process.exitCode = passed ? 0 : 1;
  },
  browser: async (around) => {
    const secondTry = process.argv.includes("--second-try");
    const files = process.argv.slice(3).filter((word) => !word.startsWith("--"));
    const { passed } = await runBrowserChecks(around, startPracticeServer, runJourneys, { secondTry, files });
    process.exitCode = passed ? 0 : 1;
  },
  app: async (around) => {
    await startPracticeApp(around, startPracticeServer);
    around.say("Sign in with a practice account (supabase/practice/accounts.json). Stop it with Ctrl+C.");
  },
};

// Run once per process. The database command starts the test runner in this very process,
// and the runner loads this file again for its own setup (database.global-setup.mjs): that
// second loading must find the helpers above and must NOT start the command a second time.
const COMMAND_LINE_STARTED = Symbol.for("compass.practice.commandLineStarted");
const calledAsACommand = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (calledAsACommand && !globalThis[COMMAND_LINE_STARTED]) {
  globalThis[COMMAND_LINE_STARTED] = true;
  const name = process.argv[2];
  const command = COMMANDS[name];
  if (!command) {
    console.error(`Usage: node scripts/practice/cli.mjs <${Object.keys(COMMANDS).join(" | ")}>`);
    process.exit(2);
  }
  try {
    await command(realSurroundings());
  } catch (error) {
    if (error instanceof PracticeRefusal) {
      console.error(`Refused (${error.kind}): ${error.message}`);
    } else {
      console.error(`The practice command failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(1);
  }
}
