import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readSettings } from "./lib.mjs";

const CHECK_SUBFOLDER =
  "Started from a subfolder of the repository and pointed at its main folder, as the folder to run from or by naming the main folder's settings file, the test runner runs the existing suite and the database checks as it does from the main folder, with the same counts. Started from a subfolder, the npm commands still do so";
const CHECK_TAKEN =
  "With another program holding port 5183 on either of the machine's two loopback addresses, on that address alone or on every address of the machine, the practice app refuses to start, says that its address is taken, and moves to no other port";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNNER = path.join(ROOT, "node_modules", ".bin", "vitest");
const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const SUBFOLDER = path.join(ROOT, "scripts", "practice", `ch-033-started-here-${RUN_ID}`);
const TO_THE_MAIN_FOLDER = path.relative(SUBFOLDER, ROOT);
const THE_SETTINGS_FILE = path.join(TO_THE_MAIN_FOLDER, "vitest.config.ts");
const THE_SEAMS_DATABASE_CHECKS = "src/";

const PRACTICE_APP = readSettings(fs.readFileSync(path.join(ROOT, "supabase", "config.toml"), "utf8")).app;
const PORT = 5183;
const LOOPBACKS = ["127.0.0.1", "::1"];
const THE_PORTS_AFTER = [5184, 5185, 5186];

const A_WHOLE_SUITE_AT_MOST = 600_000;
const A_DATABASE_RUN_AT_MOST = 300_000;
const A_SUBFOLDER_TEST_AT_MOST = 1_500_000;
const THE_PRACTICE_APP_AT_MOST = 45_000;
const A_PRACTICE_APP_TEST_AT_MOST = 120_000;

const INSIDE_A_RUN = "COMPASS_CH033_INSIDE_A_RUN";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function plain(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "");
}

function tail(text: string, lines = 30): string {
  return `printed, at its end:\n${text.split("\n").slice(-lines).join("\n")}`;
}

function surroundingsOfARun(cwd: string): NodeJS.ProcessEnv {
  const kept: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (/^(VITEST|VITE_|PRACTICE_)/.test(key)) continue;
    if (/^npm_/.test(key) && key !== "npm_config_cache") continue;
    if (["NODE_ENV", "TEST", "INIT_CWD", "PWD"].includes(key)) continue;
    kept[key] = value;
  }
  return { ...kept, PWD: cwd, NO_COLOR: "1", FORCE_COLOR: "0", [INSIDE_A_RUN]: "1" };
}

type Ended = { code: number | null; text: string; overTime: boolean; failedToStart: string };

function runOnce(command: string, args: string[], cwd: string, atMost: number): Promise<Ended> {
  return new Promise((resolve) => {
    let text = "";
    let overTime = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (code: number | null, failedToStart = "") => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ code, text: plain(text), overTime, failedToStart });
    };
    const child = spawn(command, args, { cwd, env: surroundingsOfARun(cwd), stdio: ["ignore", "pipe", "pipe"] });
    child.stdout?.on("data", (chunk: Buffer) => {
      text += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      text += chunk.toString();
    });
    timer = setTimeout(() => {
      overTime = true;
      child.kill("SIGKILL");
    }, atMost);
    child.on("error", (error) => finish(null, String(error)));
    child.on("close", (code) => finish(code));
  });
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

type Count = { files: number; checks: number; states: Record<string, number> };

const A_THROWAWAY_FILE = /(^|\/)ch-033-throwaway-[^/]*\//;

function countIn(report: unknown): { count: Count; checks: string[] } {
  const count: Count = { files: 0, checks: 0, states: {} };
  const checks: string[] = [];
  const files = (report as { testResults?: unknown } | undefined)?.testResults;
  if (!Array.isArray(files)) return { count, checks };
  for (const file of files) {
    const name = String((file as { name?: unknown }).name ?? "");
    const shown = path.isAbsolute(name) ? path.relative(ROOT, name).split(path.sep).join("/") : name;
    if (A_THROWAWAY_FILE.test(shown)) continue;
    count.files += 1;
    const results = (file as { assertionResults?: unknown }).assertionResults;
    if (!Array.isArray(results)) continue;
    for (const result of results) {
      const one = result as { fullName?: unknown; title?: unknown; status?: unknown };
      const status = String(one.status ?? "");
      count.checks += 1;
      count.states[status] = (count.states[status] ?? 0) + 1;
      checks.push(`${shown} › ${String(one.fullName ?? one.title ?? "")}: ${status}`);
    }
  }
  checks.sort();
  return { count, checks };
}

type Counted = { ran: boolean; why: string; code: number | null; text: string; count: Count; checks: string[] };

async function countedRun(command: string, args: string[], cwd: string, atMost: number): Promise<Counted> {
  const reports = fs.mkdtempSync(path.join(os.tmpdir(), "compass-ch-033-"));
  const report = path.join(reports, "report.json");
  try {
    const ended = await runOnce(
      command,
      [...args, "--reporter=default", "--reporter=json", `--outputFile.json=${report}`],
      cwd,
      atMost,
    );
    const { count, checks } = countIn(readJson(report));
    const why = ended.failedToStart
      ? `it could not be started: ${ended.failedToStart}`
      : ended.overTime
        ? `it was stopped after ${atMost / 1000} seconds`
        : `it ended with the exit code ${String(ended.code)}, and its report holds ${count.files} files and ${count.checks} checks`;
    return { ran: count.checks > 0, why, code: ended.code, text: ended.text, count, checks };
  } finally {
    fs.rmSync(reports, { recursive: true, force: true });
  }
}

function differences(fromTheMainFolder: string[], fromTheSubfolder: string[]): string[] {
  const main = new Set(fromTheMainFolder);
  const sub = new Set(fromTheSubfolder);
  return [
    ...fromTheMainFolder.filter((one) => !sub.has(one)).map((one) => `only from the main folder: ${one}`),
    ...fromTheSubfolder.filter((one) => !main.has(one)).map((one) => `only from the subfolder: ${one}`),
  ].slice(0, 12);
}

function whatTheSubfolderHolds(): string {
  try {
    const held = fs.readdirSync(SUBFOLDER);
    return held.length === 0 ? "the subfolder holds nothing" : `the subfolder holds: ${held.join(", ")}`;
  } catch {
    return "the subfolder could not be read";
  }
}

type SuiteRun = "from the main folder" | "with --root" | "with --config" | "by npm test";
type DatabaseRun = "from the main folder" | "with --root" | "with --config";
type CommandRun = "from the main folder" | "from the subfolder";

const suiteRuns = new Map<SuiteRun, Promise<Counted>>();
const databaseRuns = new Map<DatabaseRun, Promise<Counted>>();
const commandRuns = new Map<CommandRun, Promise<Ended>>();

function theSuiteRun(how: SuiteRun): Promise<Counted> {
  let run = suiteRuns.get(how);
  if (!run) {
    run = (async () => {
      switch (how) {
        case "from the main folder":
          return countedRun(process.execPath, [RUNNER, "run", "--project", "suite"], ROOT, A_WHOLE_SUITE_AT_MOST);
        case "with --root":
          return countedRun(process.execPath, [RUNNER, "run", "--root", TO_THE_MAIN_FOLDER, "--project", "suite"], SUBFOLDER, A_WHOLE_SUITE_AT_MOST);
        case "with --config":
          return countedRun(process.execPath, [RUNNER, "run", "--config", THE_SETTINGS_FILE, "--project", "suite"], SUBFOLDER, A_WHOLE_SUITE_AT_MOST);
        case "by npm test":
          await theSuiteRun("with --root");
          await theSuiteRun("with --config");
          return countedRun("npm", ["test", "--"], SUBFOLDER, A_WHOLE_SUITE_AT_MOST);
      }
    })();
    suiteRuns.set(how, run);
  }
  return run;
}

function theDatabaseRun(how: DatabaseRun): Promise<Counted> {
  let run = databaseRuns.get(how);
  if (!run) {
    const group = ["--project", "database", THE_SEAMS_DATABASE_CHECKS];
    run = (async () => {
      switch (how) {
        case "from the main folder":
          return countedRun(process.execPath, [RUNNER, "run", ...group], ROOT, A_DATABASE_RUN_AT_MOST);
        case "with --root":
          return countedRun(process.execPath, [RUNNER, "run", "--root", TO_THE_MAIN_FOLDER, ...group], SUBFOLDER, A_DATABASE_RUN_AT_MOST);
        case "with --config":
          return countedRun(process.execPath, [RUNNER, "run", "--config", THE_SETTINGS_FILE, ...group], SUBFOLDER, A_DATABASE_RUN_AT_MOST);
      }
    })();
    databaseRuns.set(how, run);
  }
  return run;
}

function theCommandRun(where: CommandRun): Promise<Ended> {
  let run = commandRuns.get(where);
  if (!run) {
    run = (async () => {
      if (where === "from the main folder") {
        return runOnce("npm", ["run", "test:db", "--", THE_SEAMS_DATABASE_CHECKS], ROOT, A_DATABASE_RUN_AT_MOST);
      }
      await theDatabaseRun("with --root");
      await theDatabaseRun("with --config");
      return runOnce("npm", ["run", "test:db", "--", THE_SEAMS_DATABASE_CHECKS], SUBFOLDER, A_DATABASE_RUN_AT_MOST);
    })();
    commandRuns.set(where, run);
  }
  return run;
}

function closingLineOf(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /database checks?\b|did not pass|no check ran/i.test(line));
  return lines[lines.length - 1] ?? "(no closing line was printed)";
}

function expectTheSameRun(main: Counted, sub: Counted, from: string): void {
  expect(main.ran, `harness: from the main folder, the test runner ran checks (${main.why}; ${tail(main.text)})`).toBe(true);
  expect(sub.ran, `${from}, the test runner ran checks (${sub.why}; ${whatTheSubfolderHolds()}; ${tail(sub.text)})`).toBe(true);
  expect(
    sub.count,
    `${from}: the same files, the same checks and the same counts as from the main folder (where they differ: ${JSON.stringify(differences(main.checks, sub.checks))})`,
  ).toEqual(main.count);
  expect(sub.code, `${from}: the same exit code as from the main folder (${tail(sub.text, 12)})`).toBe(main.code);
}

beforeAll(() => {
  fs.mkdirSync(SUBFOLDER, { recursive: true });
});

const MARK = "x-compass-ch-033-holds-the-port";

type Holder = { held: boolean; why: string; close: () => Promise<void> };

async function holdThePort(host: string): Promise<Holder> {
  const server = http.createServer((_request, response) => {
    response.setHeader(MARK, "yes");
    response.end("held by the test of the practice app's port");
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen({ port: PORT, host }, () => resolve());
    });
  } catch (error) {
    return { held: false, why: `port ${PORT} could not be held on ${host}: ${String(error)}`, close: async () => {} };
  }
  return {
    held: true,
    why: `port ${PORT} is held on ${host}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

type Answer = "nothing" | "the holder" | "something else";

function ask(host: string, port: number): Promise<Answer> {
  return new Promise((resolve) => {
    let connected = false;
    let settled = false;
    const done = (answer: Answer) => {
      if (settled) return;
      settled = true;
      resolve(answer);
    };
    const request = http.get(
      { host, port, path: "/", agent: false, timeout: 2_000, headers: { host: `localhost:${port}` } },
      (response) => {
        const holder = response.headers[MARK] === "yes";
        response.resume();
        done(holder ? "the holder" : "something else");
        request.destroy();
      },
    );
    request.on("socket", (socket) => {
      socket.once("connect", () => {
        connected = true;
      });
    });
    request.on("timeout", () => {
      done(connected ? "something else" : "nothing");
      request.destroy();
    });
    request.on("error", () => done(connected ? "something else" : "nothing"));
  });
}

async function somethingElseAt5183(): Promise<string[]> {
  const found: string[] = [];
  for (const host of LOOPBACKS) if ((await ask(host, PORT)) === "something else") found.push(`${host} port ${PORT}`);
  return found;
}

async function anythingAt5183(): Promise<string[]> {
  const found: string[] = [];
  for (const host of LOOPBACKS) if ((await ask(host, PORT)) !== "nothing") found.push(`${host} port ${PORT}`);
  return found;
}

async function anythingAfter5183(): Promise<string[]> {
  const found: string[] = [];
  for (const port of THE_PORTS_AFTER) for (const host of LOOPBACKS) if ((await ask(host, port)) !== "nothing") found.push(`${host} port ${port}`);
  return found;
}

type AppRun = {
  before: string[];
  endedByItself: boolean;
  code: number | null;
  text: string;
  at5183: string[];
  after: string[];
};

const stillToStop = new Set<ChildProcess>();

async function stopTheGroup(child: ChildProcess, closed: Promise<void>): Promise<void> {
  const group = child.pid;
  if (group === undefined) return;
  try {
    process.kill(-group, "SIGTERM");
  } catch {
    /* the group is gone already */
  }
  await Promise.race([closed, sleep(5_000)]);
  try {
    process.kill(-group, "SIGKILL");
  } catch {
    /* the group is gone */
  }
  await Promise.race([closed, sleep(5_000)]);
}

async function startThePracticeApp(): Promise<AppRun> {
  const before = await anythingAfter5183();
  let text = "";
  let ended = false;
  let code: number | null = null;
  const child = spawn("npm", ["run", "practice:app"], {
    cwd: ROOT,
    env: surroundingsOfARun(ROOT),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  stillToStop.add(child);
  child.stdout?.on("data", (chunk: Buffer) => {
    text += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    text += chunk.toString();
  });
  const closed = new Promise<void>((resolve) => {
    child.on("close", (exitCode) => {
      ended = true;
      code = exitCode;
      resolve();
    });
    child.on("error", (error) => {
      text += `\n(npm run practice:app could not be started: ${String(error)})`;
      ended = true;
      resolve();
    });
  });

  let at5183: string[] = [];
  let after: string[] = [];
  const startedAt = Date.now();
  while (!ended && Date.now() - startedAt < THE_PRACTICE_APP_AT_MOST) {
    await Promise.race([closed, sleep(300)]);
    if (ended) break;
    at5183 = await somethingElseAt5183();
    after = await anythingAfter5183();
    if (at5183.length > 0 || after.length > 0) break;
  }
  const endedByItself = ended;
  at5183 = [...new Set([...at5183, ...(await somethingElseAt5183())])];
  after = [...new Set([...after, ...(await anythingAfter5183())])];
  await stopTheGroup(child, closed);
  stillToStop.delete(child);
  return { before, endedByItself, code, text: plain(text), at5183, after };
}

async function expectRefusedBeside(host: string): Promise<void> {
  expect(PRACTICE_APP, "harness: the practice app's address is at port 5183 (I18)").toMatch(new RegExp(`:${PORT}/?$`));
  expect(await anythingAt5183(), "harness: before the other program holds it, nothing answers at port 5183 on this machine").toEqual([]);
  const holder = await holdThePort(host);
  try {
    expect(holder.held, `harness: ${holder.why}`).toBe(true);
    const run = await startThePracticeApp();

    expect(run.before, "harness: before the practice app was started, nothing answered at the ports after 5183").toEqual([]);
    expect(
      run.text.includes("npm run practice:up"),
      `harness: the practice copy is up, so the practice app was not stopped for want of it (${tail(run.text)})`,
    ).toBe(false);
    expect(
      run.at5183,
      `it did not start: nothing but the other program answered at port ${PORT}, on either loopback address (${tail(run.text)})`,
    ).toEqual([]);
    expect(run.after, `it moved to no other port: nothing answered at ${THE_PORTS_AFTER.join(", ")} (${tail(run.text)})`).toEqual([]);
    expect(run.endedByItself, `it refused to start: it ended by itself, and did not keep running (${tail(run.text)})`).toBe(true);
    expect(run.code, `with an exit code that says it did not start (${tail(run.text)})`).not.toBe(0);
    expect(run.text, "it says that its address is taken: it names the port").toContain(String(PORT));
    expect(run.text, "and says that it is taken").toMatch(/taken|in use/i);
    expect(run.text, "and names no other port to serve at").not.toMatch(/(?:localhost|127\.0\.0\.1|\[::1\]):518[4-9]\b/);
  } finally {
    await holder.close();
  }
}

afterAll(async () => {
  for (const child of stillToStop) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
    } catch {
      /* gone */
    }
  }
  fs.rmSync(SUBFOLDER, { recursive: true, force: true });
});

describe("the test runner, started from a subfolder and pointed at the main folder, really run", () => {
  it(
    `${CHECK_SUBFOLDER} — the existing suite, the main folder named as the folder to run from (--root): the same files, checks and counts as from the main folder`,
    async () => {
      expectTheSameRun(await theSuiteRun("from the main folder"), await theSuiteRun("with --root"), "from the subfolder, with --root");
    },
    A_SUBFOLDER_TEST_AT_MOST,
  );

  it(
    `${CHECK_SUBFOLDER} — the existing suite, the main folder's settings file named (--config): the same files, checks and counts as from the main folder`,
    async () => {
      expectTheSameRun(await theSuiteRun("from the main folder"), await theSuiteRun("with --config"), "from the subfolder, with --config");
    },
    A_SUBFOLDER_TEST_AT_MOST,
  );

  it(
    `${CHECK_SUBFOLDER} — the database checks of the seam, the main folder named as the folder to run from (--root): the same files, checks and counts as from the main folder`,
    async () => {
      expectTheSameRun(await theDatabaseRun("from the main folder"), await theDatabaseRun("with --root"), "from the subfolder, with --root");
    },
    A_SUBFOLDER_TEST_AT_MOST,
  );

  it(
    `${CHECK_SUBFOLDER} — the database checks of the seam, the main folder's settings file named (--config): the same files, checks and counts as from the main folder`,
    async () => {
      expectTheSameRun(await theDatabaseRun("from the main folder"), await theDatabaseRun("with --config"), "from the subfolder, with --config");
    },
    A_SUBFOLDER_TEST_AT_MOST,
  );

  it(
    `${CHECK_SUBFOLDER} — npm test, started from the subfolder after the test runner was: the same files, checks and counts as the test runner from the main folder`,
    async () => {
      expectTheSameRun(await theSuiteRun("from the main folder"), await theSuiteRun("by npm test"), "from the subfolder, by npm test");
    },
    A_SUBFOLDER_TEST_AT_MOST,
  );

  it(
    `${CHECK_SUBFOLDER} — npm run test:db, started from the subfolder after the test runner was: the same closing line and exit code as from the main folder`,
    async () => {
      const main = await theCommandRun("from the main folder");
      const sub = await theCommandRun("from the subfolder");

      expect(closingLineOf(main.text), `harness: from the main folder, the database command ran checks and closed so (${tail(main.text)})`).toMatch(
        /\d+ of \d+/,
      );
      expect(closingLineOf(sub.text), `from the subfolder, the same closing line (${whatTheSubfolderHolds()}; ${tail(sub.text)})`).toBe(
        closingLineOf(main.text),
      );
      expect(sub.code, "and the same exit code").toBe(main.code);
    },
    A_SUBFOLDER_TEST_AT_MOST,
  );
});

describe("the practice app, started while another program holds port 5183, really run", () => {
  it(
    `${CHECK_TAKEN} — the other program holds it on 127.0.0.1 alone`,
    async () => {
      await expectRefusedBeside("127.0.0.1");
    },
    A_PRACTICE_APP_TEST_AT_MOST,
  );

  it(
    `${CHECK_TAKEN} — the other program holds it on ::1 alone`,
    async () => {
      await expectRefusedBeside("::1");
    },
    A_PRACTICE_APP_TEST_AT_MOST,
  );

  it(
    `${CHECK_TAKEN} — the other program holds it on every IPv4 address of the machine (0.0.0.0)`,
    async () => {
      await expectRefusedBeside("0.0.0.0");
    },
    A_PRACTICE_APP_TEST_AT_MOST,
  );

  it(
    `${CHECK_TAKEN} — the other program holds it on every address of the machine, IPv6 and IPv4 (::)`,
    async () => {
      await expectRefusedBeside("::");
    },
    A_PRACTICE_APP_TEST_AT_MOST,
  );
});
