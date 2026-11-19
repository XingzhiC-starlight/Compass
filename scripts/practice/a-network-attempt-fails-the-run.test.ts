// @vitest-environment node

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asCheck, blockNetwork, forgetNetworkAttempts, leftoverMessages, NETWORK_NOTE, networkAttempts, networkMessage, takeNetworkAttempts } from "./lib.mjs";
import NetworkHeldRunner, { failForWhatIsLeft } from "./network.runner.mjs";

const CHECK_OUTSIDE =
  "In the existing suite, an attempt to reach the network made in a step that runs once before or after a file's checks, or as the file loads, is refused, fails the run and names the address, with nothing arriving there; no check is marked failed for it. A step that runs around each check counts as part of that check";
const CHECK_LATE =
  "In the existing suite, an attempt to reach the network that a check leaves running, and that arrives after the check has ended, is refused, fails the run, and names the address and that check, with nothing arriving there; the check running when it arrives, which made no attempt, is not marked failed";
const CHECK_MESSAGES =
  "In the existing suite, the message reads as follows, with every address tried, in the order tried and separated by commas, in place of <address>, and the check's whole name, its groups included, in place of <name>";

const WAYS_ON =
  "Two ways on: stand in for the request inside the check, as the seam's checks do with their in-memory stand-in; or, when the check needs a real database, name its file <module>.database.<topic>.test.ts and run it with npm run test:db (spec §19).";

function duringACheck(addresses: string[]): string {
  return `This check tried to reach the network, which a check in the suite may not do: ${addresses.join(", ")}. Nothing was sent. ${WAYS_ON}`;
}

function outsideAnyCheck(addresses: string[]): string {
  return `Something in this file tried to reach the network outside any check, in a step before or after its checks or as the file loaded: ${addresses.join(", ")}. Nothing was sent. ${WAYS_ON}`;
}

function arrivedLate(name: string, addresses: string[]): string {
  return `The check "${name}" left something running that tried to reach the network after it had ended: ${addresses.join(", ")}. Nothing was sent. ${WAYS_ON}`;
}

const TRIED = {
  asTheFileLoads: "/tried-as-the-file-loaded",
  beforeTheChecks: "/tried-in-a-step-before-the-checks",
  afterTheChecks: "/tried-in-a-step-after-the-checks",
  beforeEachCheck: "/tried-in-a-step-before-each-check",
  afterEachCheck: "/tried-in-a-step-after-each-check",
  byTheCheckFirst: "/tried-by-the-check-itself-first",
  byTheCheckSecond: "/tried-by-the-check-itself-second",
  lateFirst: "/tried-late-first",
  lateSecond: "/tried-late-second",
};

const OUTSIDE_GROUP = "kept for the network rule: tries the network outside any check";
const OUTSIDE_FIRST = "the first check makes no attempt";
const OUTSIDE_SECOND = "the second check makes no attempt";

const AROUND_GROUP = "kept for the network rule: tries the network during a check";
const BEFORE_EACH_TRIES = "a step before it tries the network";
const AFTER_EACH_TRIES = "a step after it tries the network";
const TRIES_TWICE = "tries the network twice itself";
const NO_ATTEMPT = "makes no attempt, and nothing around it does";

const LATE_GROUP = "kept for the network rule";
const LATE_INNER_GROUP = "a late attempt";
const LEAVES_THEM_RUNNING = "leaves two attempts running";
const RUNNING_WHEN_THEY_ARRIVE = "makes no attempt, while the two left running arrive";
const LATE_NAME = `${LATE_GROUP} > ${LATE_INNER_GROUP} > ${LEAVES_THEM_RUNNING}`;

type Scenario = "outside" | "around" | "late";

function sourceOf(scenario: Scenario, port: number): string {
  const head = [
    "/* Kept for the network rule's tests (scripts/practice/a-network-attempt-fails-the-run.test.ts): written for",
    "   one run of the test runner and deleted after it. Every attempt goes to a pretend",
    "   database on this machine, and every one is caught here, so that only the network",
    "   rule of the suite can fail this file for it. */",
    "",
    'import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";',
    "",
    `const AT = ["http://127.0.0.1", "${port}"].join(":");`,
    'const tryTheNetwork = (where: string) => fetch(AT + where).then(() => "answered", () => "refused");',
    "",
  ];

  const bodies: Record<Scenario, string[]> = {
    outside: [
      `void tryTheNetwork("${TRIED.asTheFileLoads}");`,
      "",
      "beforeAll(async () => {",
      `  await tryTheNetwork("${TRIED.beforeTheChecks}");`,
      "});",
      "",
      "afterAll(async () => {",
      `  await tryTheNetwork("${TRIED.afterTheChecks}");`,
      "});",
      "",
      `describe("${OUTSIDE_GROUP}", () => {`,
      `  it("${OUTSIDE_FIRST}", () => {`,
      "    expect(2 + 2).toBe(4);",
      "  });",
      "",
      `  it("${OUTSIDE_SECOND}", () => {`,
      "    expect(2 + 2).toBe(4);",
      "  });",
      "});",
    ],
    around: [
      `describe("${AROUND_GROUP}", () => {`,
      "  beforeEach(async (context) => {",
      `    if (context.task.name === "${BEFORE_EACH_TRIES}") await tryTheNetwork("${TRIED.beforeEachCheck}");`,
      "  });",
      "",
      "  afterEach(async (context) => {",
      `    if (context.task.name === "${AFTER_EACH_TRIES}") await tryTheNetwork("${TRIED.afterEachCheck}");`,
      "  });",
      "",
      `  it("${BEFORE_EACH_TRIES}", () => {`,
      "    expect(2 + 2).toBe(4);",
      "  });",
      "",
      `  it("${AFTER_EACH_TRIES}", () => {`,
      "    expect(2 + 2).toBe(4);",
      "  });",
      "",
      `  it("${TRIES_TWICE}", async () => {`,
      `    await tryTheNetwork("${TRIED.byTheCheckFirst}");`,
      `    await tryTheNetwork("${TRIED.byTheCheckSecond}");`,
      "    expect(2 + 2).toBe(4);",
      "  });",
      "",
      `  it("${NO_ATTEMPT}", () => {`,
      "    expect(2 + 2).toBe(4);",
      "  });",
      "});",
    ],
    late: [
      `describe("${LATE_GROUP}", () => {`,
      `  describe("${LATE_INNER_GROUP}", () => {`,
      `    it("${LEAVES_THEM_RUNNING}", () => {`,
      `      setTimeout(() => void tryTheNetwork("${TRIED.lateFirst}"), 100);`,
      `      setTimeout(() => void tryTheNetwork("${TRIED.lateSecond}"), 150);`,
      "      expect(2 + 2).toBe(4);",
      "    });",
      "",
      `    it("${RUNNING_WHEN_THEY_ARRIVE}", async () => {`,
      "      await new Promise((resolve) => setTimeout(resolve, 600));",
      "      expect(2 + 2).toBe(4);",
      "    });",
      "  });",
      "});",
    ],
  };

  return [...head, ...bodies[scenario], ""].join("\n");
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNNER = path.join(ROOT, "node_modules", ".bin", "vitest");
const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const THROWAWAY_FOLDER = path.join(ROOT, "scripts", "practice", `ch-033-throwaway-${RUN_ID}`);

const A_RUN_AT_MOST = 120_000;
const A_TEST_AT_MOST = 180_000;

const INSIDE_A_RUN = "COMPASS_CH033_INSIDE_A_RUN";
const startedInsideARun = process.env[INSIDE_A_RUN] === "1";

type Pretend = { port: number; at: string; arrived: string[]; close: () => Promise<void> };

async function pretendDatabase(): Promise<Pretend> {
  const arrived: string[] = [];
  const server = http.createServer((request, response) => {
    arrived.push(`a request: ${String(request.method)} ${String(request.url)}`);
    response.setHeader("Content-Type", "application/json");
    response.end("[]");
  });
  server.on("connection", () => {
    arrived.push("a connection");
  });
  server.on("upgrade", (request, socket) => {
    arrived.push(`a socket: ${String(request.url)}`);
    socket.destroy();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    at: `http://127.0.0.1:${port}`,
    arrived,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

function plain(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "");
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

function textsIn(value: unknown, into: string[] = []): string[] {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const one of value) textsIn(one, into);
  else if (value && typeof value === "object") for (const one of Object.values(value)) textsIn(one, into);
  return into;
}

type CheckSeen = { title: string; status: string; failures: string };

function checksIn(report: unknown): CheckSeen[] {
  const files = (report as { testResults?: unknown } | undefined)?.testResults;
  if (!Array.isArray(files)) return [];
  return files.flatMap((file) => {
    const results = (file as { assertionResults?: unknown }).assertionResults;
    if (!Array.isArray(results)) return [];
    return results.map((result) => {
      const one = result as { title?: unknown; status?: unknown; failureMessages?: unknown };
      return {
        title: String(one.title ?? ""),
        status: String(one.status ?? ""),
        failures: Array.isArray(one.failureMessages) ? one.failureMessages.map(String).join("\n") : "",
      };
    });
  });
}

type Seen = {
  ran: boolean;
  why: string;
  code: number | null;
  text: string;
  said: string;
  checks: CheckSeen[];
  at: string;
  arrived: string[];
};

async function reallyRun(scenario: Scenario): Promise<Seen> {
  const pretend = await pretendDatabase();
  const file = path.join(THROWAWAY_FOLDER, `${scenario}.throwaway.test.ts`);
  const named = path.relative(ROOT, file).split(path.sep).join("/");
  const reports = fs.mkdtempSync(path.join(os.tmpdir(), "compass-ch-033-"));
  const report = path.join(reports, "report.json");
  try {
    fs.mkdirSync(THROWAWAY_FOLDER, { recursive: true });
    fs.writeFileSync(file, sourceOf(scenario, pretend.port));
    const ended = await runOnce(
      process.execPath,
      [RUNNER, "run", "--project", "suite", named, "--reporter=default", "--reporter=json", `--outputFile.json=${report}`],
      ROOT,
      A_RUN_AT_MOST,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    const json = readJson(report);
    const checks = checksIn(json);
    const why = ended.failedToStart
      ? `the test runner could not be started: ${ended.failedToStart}`
      : ended.overTime
        ? `the run was stopped after ${A_RUN_AT_MOST / 1000} seconds`
        : `it ended with the exit code ${String(ended.code)}, and its report holds ${checks.length} checks`;
    return {
      ran: checks.length > 0,
      why,
      code: ended.code,
      text: ended.text,
      said: [ended.text, ...textsIn(json)].join("\n"),
      checks,
      at: pretend.at,
      arrived: [...pretend.arrived],
    };
  } finally {
    fs.rmSync(file, { force: true });
    fs.rmSync(reports, { recursive: true, force: true });
    await pretend.close();
  }
}

const runs = new Map<Scenario, Promise<Seen>>();

function theRun(scenario: Scenario): Promise<Seen> {
  let run = runs.get(scenario);
  if (!run) {
    run = reallyRun(scenario);
    runs.set(scenario, run);
  }
  return run;
}

afterAll(() => {
  fs.rmSync(THROWAWAY_FOLDER, { recursive: true, force: true });
});

function printed(run: Seen): string {
  return `printed, at its end:\n${run.text.split("\n").slice(-40).join("\n")}`;
}

function stateOf(run: Seen, title: string): string {
  return run.checks.find((one) => one.title === title)?.status ?? "(not reported)";
}

function failuresOf(run: Seen, title: string): string {
  return run.checks.find((one) => one.title === title)?.failures ?? "";
}

function expectTheRun(run: Seen, titles: string[]): void {
  expect(run.ran, `harness: the test runner ran the throwaway file and reported how its checks ended (${run.why}; ${printed(run)})`).toBe(true);
  expect(
    run.checks.map((one) => one.title).sort(),
    "harness: the report holds the throwaway file's own checks, and no other",
  ).toEqual([...titles].sort());
}

describe("in the existing suite, an attempt to reach the network outside any check, really run", () => {
  it.skipIf(startedInsideARun)(
    `${CHECK_OUTSIDE} — tried as the file loads, in a step that runs once before its checks and in one that runs once after them: the run fails, nothing arrives at the address, and no check is marked failed for it`,
    async () => {
      const run = await theRun("outside");

      expectTheRun(run, [OUTSIDE_FIRST, OUTSIDE_SECOND]);
      expect(run.arrived, "what arrived at the address: the attempts were refused, and nothing was sent").toEqual([]);
      expect(
        run.checks.filter((one) => one.status !== "passed").map((one) => `${one.title}: ${one.status}`),
        "checks marked failed, or not passed, for attempts they did not make",
      ).toEqual([]);
      expect(run.code, `the run fails (${printed(run)})`).not.toBe(0);
    },
    A_TEST_AT_MOST,
  );

  it.skipIf(startedInsideARun)(
    `${CHECK_OUTSIDE} — tried as the file loads, in a step that runs once before its checks and in one that runs once after them: the run names each address`,
    async () => {
      const run = await theRun("outside");

      expectTheRun(run, [OUTSIDE_FIRST, OUTSIDE_SECOND]);
      const addresses = [TRIED.asTheFileLoads, TRIED.beforeTheChecks, TRIED.afterTheChecks].map((where) => run.at + where);
      expect(
        addresses.filter((address) => !run.said.includes(address)),
        `the addresses that nothing the run printed names (${printed(run)})`,
      ).toEqual([]);
    },
    A_TEST_AT_MOST,
  );

  it.skipIf(startedInsideARun)(
    `${CHECK_OUTSIDE} — a step that runs before each check, or after it, counts as part of that check: an attempt made there fails that check and is named in its failure, and the check around which none was made passes`,
    async () => {
      const run = await theRun("around");

      expectTheRun(run, [BEFORE_EACH_TRIES, AFTER_EACH_TRIES, TRIES_TWICE, NO_ATTEMPT]);
      expect(run.arrived, "what arrived at the address: the attempts were refused, and nothing was sent").toEqual([]);
      expect(stateOf(run, NO_ATTEMPT), `the check around which no attempt was made (${printed(run)})`).toBe("passed");
      expect(stateOf(run, BEFORE_EACH_TRIES), `the check whose step before it tried the network (${printed(run)})`).toBe("failed");
      expect(failuresOf(run, BEFORE_EACH_TRIES), "and its failure names the address that step tried").toContain(
        run.at + TRIED.beforeEachCheck,
      );
      expect(stateOf(run, AFTER_EACH_TRIES), `the check whose step after it tried the network (${printed(run)})`).toBe("failed");
      expect(failuresOf(run, AFTER_EACH_TRIES), "and its failure names the address that step tried").toContain(
        run.at + TRIED.afterEachCheck,
      );
    },
    A_TEST_AT_MOST,
  );
});

describe("in the existing suite, attempts that a check leaves running, arriving after it has ended, really run", () => {
  it.skipIf(startedInsideARun)(
    `${CHECK_LATE} — two attempts left running by one check arrive while the next check runs: the run fails, nothing arrives at the address, and the check running when they arrive is not marked failed`,
    async () => {
      const run = await theRun("late");

      expectTheRun(run, [LEAVES_THEM_RUNNING, RUNNING_WHEN_THEY_ARRIVE]);
      expect(run.arrived, "what arrived at the address: the attempts were refused, and nothing was sent").toEqual([]);
      expect(
        stateOf(run, RUNNING_WHEN_THEY_ARRIVE),
        `the check running when the attempts arrive, which made none (${printed(run)})`,
      ).toBe("passed");
      expect(run.code, `the run fails (${printed(run)})`).not.toBe(0);
    },
    A_TEST_AT_MOST,
  );

  it.skipIf(startedInsideARun)(
    `${CHECK_LATE} — two attempts left running by one check arrive while the next check runs: the run names each address, on a line that names the check that left it running`,
    async () => {
      const run = await theRun("late");

      expectTheRun(run, [LEAVES_THEM_RUNNING, RUNNING_WHEN_THEY_ARRIVE]);
      for (const address of [run.at + TRIED.lateFirst, run.at + TRIED.lateSecond]) {
        const naming = run.said.split("\n").filter((line) => line.includes(address));
        expect(
          naming.filter((line) => line.includes(LEAVES_THEM_RUNNING)).length > 0,
          `a line names ${address} and the check that left it running, "${LEAVES_THEM_RUNNING}" (the lines that name the address: ${JSON.stringify(naming)}; ${printed(run)})`,
        ).toBe(true);
      }
    },
    A_TEST_AT_MOST,
  );
});

describe("the messages of the existing suite's network rule, word for word, really run", () => {
  it.skipIf(startedInsideARun)(
    `${CHECK_MESSAGES} — for an attempt during a check: "This check tried to reach the network, which a check in the suite may not do: <address>. Nothing was sent. Two ways on: …", and so for an attempt in a step around the check`,
    async () => {
      const run = await theRun("around");

      expectTheRun(run, [BEFORE_EACH_TRIES, AFTER_EACH_TRIES, TRIES_TWICE, NO_ATTEMPT]);
      expect(failuresOf(run, TRIES_TWICE), "the check that tried twice: both addresses, in the order tried, separated by commas").toContain(
        duringACheck([run.at + TRIED.byTheCheckFirst, run.at + TRIED.byTheCheckSecond]),
      );
      expect(failuresOf(run, BEFORE_EACH_TRIES), "the check whose step before it tried the network").toContain(
        duringACheck([run.at + TRIED.beforeEachCheck]),
      );
      expect(failuresOf(run, AFTER_EACH_TRIES), "the check whose step after it tried the network").toContain(
        duringACheck([run.at + TRIED.afterEachCheck]),
      );
    },
    A_TEST_AT_MOST,
  );

  it.skipIf(startedInsideARun)(
    `${CHECK_MESSAGES} — for an attempt outside any check: "Something in this file tried to reach the network outside any check, in a step before or after its checks or as the file loaded: <address>. Nothing was sent." and the sentence that begins "Two ways on:"`,
    async () => {
      const run = await theRun("outside");

      expectTheRun(run, [OUTSIDE_FIRST, OUTSIDE_SECOND]);
      expect(run.said, "the run says it, with the three addresses in the order tried, separated by commas").toContain(
        outsideAnyCheck([TRIED.asTheFileLoads, TRIED.beforeTheChecks, TRIED.afterTheChecks].map((where) => run.at + where)),
      );
    },
    A_TEST_AT_MOST,
  );

  it.skipIf(startedInsideARun)(
    `${CHECK_MESSAGES} — for an attempt that arrived late: "The check "<name>" left something running that tried to reach the network after it had ended: <address>. Nothing was sent." and the sentence that begins "Two ways on:"`,
    async () => {
      const run = await theRun("late");

      expectTheRun(run, [LEAVES_THEM_RUNNING, RUNNING_WHEN_THEY_ARRIVE]);
      expect(run.said, "the run says it, with the check's whole name and both addresses, in the order tried").toContain(
        arrivedLate(LATE_NAME, [run.at + TRIED.lateFirst, run.at + TRIED.lateSecond]),
      );
    },
    A_TEST_AT_MOST,
  );
});

{
  const CHECK =
    "In the existing suite no check opens a connection to any database: none is handed the live project's address, loading the seam makes no database client, and a check that tries to reach any network address is refused and fails, with nothing arriving there";

  const MADE_UP = {
    read: "https://compass-made-up-for-a-test.invalid/rest/v1/projects?select=*",
    socket: "wss://compass-made-up-for-a-test.invalid/realtime/v1/websocket",
    signIn: "https://compass-made-up-for-a-test.invalid/auth/v1/token?grant_type=password",
  };

  const TITLES = {
    before: "a check that reaches for nothing, run before the attempts",
    fetchSwallowed: "fetch - the code under test swallowed the refusal",
    socketSwallowed: "a WebSocket - the code under test swallowed the refusal",
    requestSwallowed: "an XMLHttpRequest - the code under test swallowed the refusal",
    notSwallowed: "fetch - the refusal reaches the check",
    after: "a check that reaches for nothing, run after the attempts",
  };
  type Which = keyof typeof TITLES;

  const NOTES_NAME = "COMPASS_FAILS_PROBE_NOTES";

  const REPOSITORY = process.cwd();
  const RUNNER = path.join(REPOSITORY, "node_modules", "vitest", "vitest.mjs");
  const CONFIGURATION = path.join(REPOSITORY, "vitest.config.ts");
  const LINKED = ["scripts", "node_modules"];

  const PROBE_FILE = "attempt.probe.test.ts";
  const NOTES_FILE = "attempt.probe.notes.jsonl";
  const REPORT_FILE = "attempt.probe.report.json";

  const PROBE = `
import fs from "node:fs";
import { expect, it } from "vitest";

const MADE_UP = ${JSON.stringify(MADE_UP)};
const TITLES = ${JSON.stringify(TITLES)};

function note(check, seen) {
  fs.appendFileSync(process.env.${NOTES_NAME}, JSON.stringify({ check, ...seen }) + "\\n");
}

function addressNamedBy(error) {
  return String((error && error.address) ?? "");
}

/* ----- the code under test: it swallows whatever comes of reaching out ----- */
async function rowsOrNone() {
  try {
    const answer = await fetch(MADE_UP.read);
    return { rows: await answer.json(), swallowed: null };
  } catch (error) {
    return { rows: [], swallowed: addressNamedBy(error) };
  }
}

function liveUpdatesOrNone() {
  let socket;
  try {
    socket = new WebSocket(MADE_UP.socket);
  } catch (error) {
    return { listening: false, swallowed: addressNamedBy(error) };
  }
  try {
    socket.close();
  } catch {
    /* it never opened */
  }
  return { listening: true, swallowed: null };
}

function signInOrNot() {
  try {
    const request = new XMLHttpRequest();
    request.open("POST", MADE_UP.signIn);
    return { opened: true, swallowed: null };
  } catch (error) {
    return { opened: false, swallowed: addressNamedBy(error) };
  }
}

/* ----- the checks ----- */
it(TITLES.before, () => {
  expect([]).toEqual([]);
  note("before", { reachedItsLastLine: true });
});

it(TITLES.fetchSwallowed, async () => {
  const got = await rowsOrNone();
  expect(got.rows).toEqual([]);
  note("fetchSwallowed", { reachedItsLastLine: true, swallowed: got.swallowed });
});

it(TITLES.socketSwallowed, () => {
  const got = liveUpdatesOrNone();
  expect(got.listening).toBe(false);
  note("socketSwallowed", { reachedItsLastLine: true, swallowed: got.swallowed });
});

it(TITLES.requestSwallowed, () => {
  const got = signInOrNot();
  expect(got.opened).toBe(false);
  note("requestSwallowed", { reachedItsLastLine: true, swallowed: got.swallowed });
});

it(TITLES.notSwallowed, async () => {
  let answer;
  try {
    answer = await fetch(MADE_UP.read);
  } catch (error) {
    note("notSwallowed", { reachedItsLastLine: false, met: addressNamedBy(error) });
    throw error;
  }
  note("notSwallowed", { reachedItsLastLine: true, answered: String(answer && answer.status) });
});

it(TITLES.after, () => {
  expect([]).toEqual([]);
  note("after", { reachedItsLastLine: true });
});
`;

  type Note = { check: string; reachedItsLastLine?: boolean; swallowed?: string | null; met?: string; answered?: string };
  type Verdict = { title: string; status: string; failureMessages: string[] };
  type Run = { code: number | null; printed: string; verdicts: Verdict[]; notes: Note[] };

  function verdictsIn(report: unknown): Verdict[] {
    const found: Verdict[] = [];
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (value === null || typeof value !== "object") return;
      const one = value as Record<string, unknown>;
      if (typeof one.title === "string" && typeof one.status === "string") {
        found.push({
          title: one.title,
          status: one.status,
          failureMessages: Array.isArray(one.failureMessages) ? one.failureMessages.map(String) : [],
        });
      }
      Object.values(one).forEach(walk);
    };
    walk(report);
    return found;
  }

  function surroundings(set: Record<string, string>): NodeJS.ProcessEnv {
    const around: NodeJS.ProcessEnv = {};
    for (const [name, value] of Object.entries(process.env)) {
      if (name === NOTES_NAME) continue;
      if (name.startsWith("VITEST")) continue;
      around[name] = value;
    }
    return { ...around, ...set };
  }

  function runTheProbe(scratch: string): Promise<Run> {
    const notes = path.join(scratch, NOTES_FILE);
    const report = path.join(scratch, REPORT_FILE);
    const words = [
      RUNNER,
      "run",
      "--config",
      CONFIGURATION,
      "--project",
      "suite",
      "--root",
      scratch,
      "--reporter=default",
      "--reporter=json",
      `--outputFile.json=${report}`,
      PROBE_FILE,
    ];
    return new Promise((resolve) => {
      const child = spawn(process.execPath, words, {
        cwd: REPOSITORY,
        env: surroundings({ [NOTES_NAME]: notes }),
        stdio: ["ignore", "pipe", "pipe"],
      });
      let printed = "";
      child.stdout.on("data", (chunk) => {
        printed += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        printed += String(chunk);
      });
      child.on("error", (error) => {
        resolve({ code: null, printed: `${printed}\n(the runner could not be started: ${String(error)})`, verdicts: [], notes: [] });
      });
      child.on("close", (code) => {
        let verdicts: Verdict[] = [];
        try {
          verdicts = verdictsIn(JSON.parse(fs.readFileSync(report, "utf8")));
        } catch {
          /* the runner wrote no report */
        }
        let written: Note[] = [];
        try {
          written = fs
            .readFileSync(notes, "utf8")
            .split("\n")
            .filter((line) => line.trim().length > 0)
            .map((line) => JSON.parse(line) as Note);
        } catch {
          /* no check wrote a note */
        }
        resolve({ code, printed, verdicts, notes: written });
      });
    });
  }

  let scratch = "";
  let theRun: Run | undefined;

  beforeAll(async () => {
    scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "compass-fails-")));
    fs.writeFileSync(path.join(scratch, PROBE_FILE), PROBE);
    for (const folder of LINKED) {
      fs.symlinkSync(path.join(REPOSITORY, folder), path.join(scratch, folder), "dir");
    }
    theRun = await runTheProbe(scratch);
  }, 120_000);

  afterAll(() => {
    if (scratch === "" || !scratch.includes("compass-fails-")) return;
    const unmake = (name: string, asLink: boolean): void => {
      const entry = path.join(scratch, name);
      try {
        const found = fs.lstatSync(entry);
        if (asLink ? found.isSymbolicLink() : found.isFile()) fs.unlinkSync(entry);
      } catch {
        /* it was never made */
      }
    };
    for (const folder of LINKED) unmake(folder, true);
    for (const name of [PROBE_FILE, NOTES_FILE, REPORT_FILE]) unmake(name, false);
    try {
      fs.rmdirSync(scratch);
    } catch {
      /* something else was left in it: the folder stays, in the machine's own temporary place */
    }
  });

  function shown(): string {
    if (!theRun) return "the run was never started";
    // eslint-disable-next-line no-control-regex
    const printed = theRun.printed.replace(/\u001b\[[0-9;]*m/g, "").trim().split("\n").slice(-40).join("\n");
    return `exit code ${String(theRun.code)}; it printed:\n${printed}`;
  }

  function reportedAs(which: Which): string {
    const about = (theRun?.verdicts ?? []).filter((verdict) => verdict.title === TITLES[which]);
    if (about.length === 0) return "not reported on";
    return about.map((verdict) => verdict.status).join(", ");
  }

  function saidOf(which: Which): string {
    const said = (theRun?.verdicts ?? [])
      .filter((verdict) => verdict.title === TITLES[which])
      .flatMap((verdict) => verdict.failureMessages)
      .join("\n")
      // eslint-disable-next-line no-control-regex
      .replace(/\u001b\[[0-9;]*m/g, "")
      .split("\n")
      .slice(0, 6)
      .join("\n");
    return said === "" ? "the runner said nothing of a failure" : `the runner said of it:\n${said}`;
  }

  function lastLineNoteOf(which: Which): Note | undefined {
    return (theRun?.notes ?? []).find((one) => one.check === which && one.reachedItsLastLine === true);
  }

  function expectTheRunIsFitToRead(): void {
    expect(theRun, "harness: the test runner was started").toBeDefined();
    expect(
      (Object.keys(TITLES) as Which[]).filter((which) => reportedAs(which) === "not reported on"),
      `harness: checks of the probe the runner did not report on (${shown()})`,
    ).toEqual([]);
    expect(
      [reportedAs("before"), lastLineNoteOf("before") !== undefined],
      `harness: the check that reached for nothing, run before the attempts, passed (${shown()})`,
    ).toEqual(["passed", true]);
    expect(
      [reportedAs("after"), lastLineNoteOf("after") !== undefined],
      `harness: the check that reached for nothing, run after the attempts, passed — an attempt fails the check that made it, not the next one (${shown()})`,
    ).toEqual(["passed", true]);
  }

  const SWALLOWED: [string, Which, string][] = [
    ["fetch", "fetchSwallowed", MADE_UP.read],
    ["a WebSocket", "socketSwallowed", MADE_UP.socket],
    ["an XMLHttpRequest", "requestSwallowed", MADE_UP.signIn],
  ];

  describe("a check of the existing suite that tries to reach a network address fails", () => {
    it.each(SWALLOWED)(
      `${CHECK} — the check fails also when the code under test swallowed the refusal, so that the check itself saw no error: by %s`,
      (_way, which, address) => {
        expectTheRunIsFitToRead();

        const note = lastLineNoteOf(which);
        expect(
          note,
          `harness: the check itself saw no error — its own expectations held and it reached its last line (${shown()})`,
        ).toBeDefined();
        expect(
          note?.swallowed,
          "harness: the code under test did try the address, was refused, and swallowed the refusal — which names the address tried",
        ).toBe(address);

        expect(
          reportedAs(which),
          `the test runner reports the check that made the attempt as failed, though the check itself saw no error (${saidOf(which)})`,
        ).toBe("failed");
        expect(theRun?.code, "and the run as a whole did not end well").not.toBe(0);
      },
    );

    it(`${CHECK} — the check fails when the refusal reaches it`, () => {
      expectTheRunIsFitToRead();

      const met = (theRun?.notes ?? []).find((one) => one.check === "notSwallowed");
      expect(met, `harness: the check ran and wrote down what it met (${shown()})`).toBeDefined();
      expect(
        [met?.reachedItsLastLine, met?.met],
        `the attempt was refused, and the refusal reached the check: it was handed no answer to carry on with (${JSON.stringify(met)})`,
      ).toEqual([false, MADE_UP.read]);

      expect(
        reportedAs("notSwallowed"),
        `the test runner reports the check that made the attempt as failed (${saidOf("notSwallowed")})`,
      ).toBe("failed");
    });
  });
}

{
  const REPOSITORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const RUNNER = path.join(REPOSITORY, "node_modules", "vitest", "vitest.mjs");
  const SETTINGS = path.join(REPOSITORY, "vitest.config.ts");

  const PROBE = `
import { expect, it } from "vitest";

it("runs in the repository's main folder", () => {
  expect(process.cwd()).toBe(${JSON.stringify(fs.realpathSync(REPOSITORY))});
});

const reach = (address) => void fetch(address).catch(() => {});

it("leaves a timer running", () => {
  setTimeout(() => reach("http://compass-ch033.invalid/by-a-timer"), 40);
});

it("leaves an interval running", () => {
  const interval = setInterval(() => {
    clearInterval(interval);
    reach("http://compass-ch033.invalid/by-an-interval");
  }, 40);
});

it("leaves a promise chain running", () => {
  void Promise.resolve()
    .then(() => new Promise((resolve) => setTimeout(resolve, 40)))
    .then(() => reach("http://compass-ch033.invalid/by-a-promise-chain"));
});

it("makes no attempt, and waits while the three arrive", async () => {
  await new Promise((resolve) => setTimeout(resolve, 300));
});
`;

  const AT_THE_END: Record<string, string> = {
    "clean-up.probe.test.ts": `
import { beforeAll, it } from "vitest";

beforeAll(() => async () => {
  await fetch("http://compass-ch033.invalid/by-a-clean-up-handed-back").catch(() => {});
});

it("passes beside a clean-up that reaches out", () => {});
`,
    "switched-off.probe.test.ts": `
import { it } from "vitest";

void fetch("http://compass-ch033.invalid/as-a-switched-off-file-loaded").catch(() => {});

it.skip("is switched off, as every check of its file is", () => {});
`,
    "closing-fails.probe.test.ts": `
import { afterAll, it } from "vitest";

it("leaves a timer running before a closing step that goes wrong", () => {
  setTimeout(() => void fetch("http://compass-ch033.invalid/before-a-closing-step-goes-wrong").catch(() => {}), 20);
});

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
  throw new Error("a closing step that goes wrong on purpose");
});
`,
    "fake-timers.probe.test.ts": `
import { it, vi } from "vitest";

it("leaves fake timers on, with something queued", () => {
  vi.useFakeTimers();
  setTimeout(() => void fetch("http://compass-ch033.invalid/queued-on-a-fake-timer").catch(() => {}), 1000);
});

it("runs whatever fake timers hold, and makes no attempt of its own", () => {
  if (vi.isFakeTimers()) vi.runAllTimers();
});
`,
    "fake-timers-for-the-file.probe.test.ts": `
import { afterAll, beforeAll, expect, it, vi } from "vitest";

beforeAll(() => {
  vi.useFakeTimers();
});
afterAll(() => {
  vi.useRealTimers();
});

it("has the fake timers its file turned on", () => {
  expect(vi.isFakeTimers()).toBe(true);
});

it("still has them after the check before it ended", () => {
  expect(vi.isFakeTimers()).toBe(true);
});
`,
    "cannot-load.probe.test.ts": `
void fetch("http://compass-ch033.invalid/as-a-file-that-cannot-load-loaded").catch(() => {});

throw new Error("a file that cannot load, on purpose");
`,
  };

  type Run = {
    code: number | null;
    printed: string;
    states: Record<string, string>;
    files: Record<string, string>;
  };

  let scratch = "";
  let run: Run;

  function filesIn(report: unknown): Record<string, string> {
    const results = (report as { testResults?: { name: string; status: string }[] }).testResults ?? [];
    return Object.fromEntries(results.map((file) => [path.basename(file.name), file.status]));
  }

  function statesIn(report: unknown): Record<string, string> {
    const states: Record<string, string> = {};
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value === null || typeof value !== "object") return;
      const one = value as Record<string, unknown>;
      if (typeof one.title === "string" && typeof one.status === "string") states[one.title] = one.status;
      Object.values(one).forEach(walk);
    };
    walk(report);
    return states;
  }

  function runTheProbe(): Promise<Run> {
    const report = path.join(scratch, "report.json");
    const words = [
      RUNNER, "run", "--config", SETTINGS, "--project", "suite", "--root", scratch,
      "--reporter=default", "--reporter=json", `--outputFile.json=${report}`, ".probe.test.ts",
    ];
    const around = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("VITEST")));
    return new Promise((resolve) => {
      const child = spawn(process.execPath, words, { cwd: scratch, env: around, stdio: ["ignore", "pipe", "pipe"] });
      let printed = "";
      child.stdout.on("data", (chunk) => (printed += String(chunk)));
      child.stderr.on("data", (chunk) => (printed += String(chunk)));
      const stop = setTimeout(() => {
        printed += "\n(stopped after 50 seconds)";
        child.kill("SIGKILL");
      }, 50_000);
      child.on("close", (code) => {
        clearTimeout(stop);
        let states: Record<string, string> = {};
        let files: Record<string, string> = {};
        try {
          const json = JSON.parse(fs.readFileSync(report, "utf8"));
          states = statesIn(json);
          files = filesIn(json);
        } catch {
          /* no report: the states stay empty, and the test says so */
        }
        // eslint-disable-next-line no-control-regex
        resolve({ code, printed: printed.replace(/\x1b\[[0-9;]*m/g, ""), states, files });
      });
    });
  }

  beforeAll(async () => {
    scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "compass-ch033-carriers-")));
    for (const linked of ["scripts", "node_modules"]) fs.symlinkSync(path.join(REPOSITORY, linked), path.join(scratch, linked));
    fs.writeFileSync(path.join(scratch, "late.probe.test.ts"), PROBE);
    for (const [name, probe] of Object.entries(AT_THE_END)) fs.writeFileSync(path.join(scratch, name), probe);
    run = await runTheProbe();
  }, 60_000);

  afterAll(() => {
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
  });

  describe("a late attempt, carried by what a check left running", () => {
    it("fails the run, and leaves each check with the mark it ended with", () => {
      expect(run.code, run.printed.slice(-1500)).toBe(1);
      expect(run.files["late.probe.test.ts"], run.printed.slice(-1500)).toBe("failed");
      expect(run.states).toMatchObject({
        "runs in the repository's main folder": "passed",
        "leaves a timer running": "passed",
        "leaves an interval running": "passed",
        "leaves a promise chain running": "passed",
        "makes no attempt, and waits while the three arrive": "passed",
      });
    });

    it("names, for each of the three carriers, the check that left it running", () => {
      for (const [check, address] of [
        ["leaves a timer running", "http://compass-ch033.invalid/by-a-timer"],
        ["leaves an interval running", "http://compass-ch033.invalid/by-an-interval"],
        ["leaves a promise chain running", "http://compass-ch033.invalid/by-a-promise-chain"],
      ]) {
        expect(run.printed, `the late message for "${check}"`).toContain(
          `The check "${check}" left something running that tried to reach the network after it had ended: ${address}. Nothing was sent.`,
        );
      }
      expect(run.printed).not.toContain('The check "makes no attempt, and waits while the three arrive"');
      const saidOutside = run.printed.split("\n").filter((line) => line.includes("outside any check"));
      for (const carried of ["by-a-timer", "by-an-interval", "by-a-promise-chain"]) {
        expect(saidOutside.filter((line) => line.includes(`http://compass-ch033.invalid/${carried}`)), "a late attempt said to be made outside any check").toEqual([]);
      }
    });
  });

  describe("the end of a file, wherever its last work runs", () => {
    const outside = (address: string) =>
      `Something in this file tried to reach the network outside any check, in a step before or after its checks or as the file loaded: ${address}. Nothing was sent.`;

    it("fails the file for a clean-up an opening step handed back, which runs after every closing step", () => {
      expect(run.files["clean-up.probe.test.ts"], run.printed.slice(-1500)).toBe("failed");
      expect(run.states["passes beside a clean-up that reaches out"]).toBe("passed");
      expect(run.printed).toContain(outside("http://compass-ch033.invalid/by-a-clean-up-handed-back"));
    });

    it("fails a file whose checks are all switched off, for what was tried as it loaded", () => {
      expect(run.files["switched-off.probe.test.ts"], run.printed.slice(-1500)).toBe("failed");
      expect(run.printed).toContain(outside("http://compass-ch033.invalid/as-a-switched-off-file-loaded"));
    });

    it("names a late attempt though a closing step of the file's own went wrong first", () => {
      expect(run.printed).toContain("a closing step that goes wrong on purpose");
      expect(run.printed).toContain(
        'The check "leaves a timer running before a closing step that goes wrong" left something running that tried to reach the network after it had ended: http://compass-ch033.invalid/before-a-closing-step-goes-wrong. Nothing was sent.',
      );
    });

    it("drops what a check queued on fake timers it left on, so the next check neither runs it nor is blamed for it", () => {
      expect(run.files["fake-timers.probe.test.ts"], run.printed.slice(-1500)).toBe("passed");
      expect(run.states["leaves fake timers on, with something queued"]).toBe("passed");
      expect(run.states["runs whatever fake timers hold, and makes no attempt of its own"]).toBe("passed");
      expect(run.printed).not.toContain("http://compass-ch033.invalid/queued-on-a-fake-timer");
    });

    it("leaves on the fake timers a file turned on for all its checks", () => {
      expect(run.files["fake-timers-for-the-file.probe.test.ts"], run.printed.slice(-1500)).toBe("passed");
      expect(run.states["still has them after the check before it ended"]).toBe("passed");
    });

    it("names what a file tried as it loaded, though the file then could not load", () => {
      expect(run.files["cannot-load.probe.test.ts"], run.printed.slice(-1500)).toBe("failed");
      expect(run.printed).toContain("a file that cannot load, on purpose");
      expect(run.printed).toContain(outside("http://compass-ch033.invalid/as-a-file-that-cannot-load-loaded"));
    });
  });
}

{
  type CheckAtWork = { id: string; name: string };
  type NetworkAttempt = { address: string; check: CheckAtWork | null };
  type FileTask = { result?: { state?: string; errors?: unknown[] }; meta?: Record<string, unknown> };

  function blockedPage(): typeof globalThis {
    const page = {
      fetch: async () => new Response("[]"),
      WebSocket: class {},
      XMLHttpRequest: class {},
    } as unknown as typeof globalThis;
    blockNetwork(page);
    return page;
  }

  function tryOn(page: typeof globalThis, address: string): Promise<unknown> {
    return page.fetch(address).catch((error: unknown) => error);
  }

  /* Work run from here runs outside any check's work: Node carries into a timer's callbacks
     the work that was running when the timer was made, and this one was made as the file
     loaded, when no check was running. */
  const outsideJobs: (() => void)[] = [];
  const outsideAnyCheck = setInterval(() => {
    for (const job of outsideJobs.splice(0)) job();
  }, 10);
  afterAll(() => clearInterval(outsideAnyCheck));

  function outside<T>(work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => outsideJobs.push(() => void work().then(resolve, reject)));
  }

  async function seed(page: typeof globalThis, attempts: NetworkAttempt[]): Promise<void> {
    for (const { address, check } of attempts) {
      if (check === null) await outside(() => tryOn(page, address));
      else await asCheck(check, () => tryOn(page, address));
    }
  }

  const A: CheckAtWork = { id: "ch-035-runner-a", name: "a group > the check a" };
  const B: CheckAtWork = { id: "ch-035-runner-b", name: "a group > the check b" };
  const OUTSIDE = "http://compass.invalid/outside";

  describe("the end of a file, after attempts were left on the record", () => {
    it("fails the file with the network rule's messages as its one error, as before, and leaves the note beside it: that error's place, and the attempts grouped by who made them", async () => {
      const page = blockedPage();
      const attempts: NetworkAttempt[] = [
        { address: "http://compass.invalid/late-a-1", check: A },
        { address: OUTSIDE, check: null },
        { address: "http://compass.invalid/late-b", check: B },
        { address: "http://compass.invalid/late-a-2", check: A },
        { address: OUTSIDE, check: null },
      ];
      await seed(page, attempts);
      const file: FileTask = { result: { state: "pass" }, meta: {} };

      await outside(async () => failForWhatIsLeft(file, "database"));

      expect(file.result?.state).toBe("fail");
      expect(file.result?.errors).toEqual([{ name: "Error", message: leftoverMessages("database", attempts).join("\n"), stack: expect.any(String) }]);
      expect(file.meta?.[NETWORK_NOTE]).toEqual({
        errorAt: 0,
        left: [
          { check: A.name, addresses: ["http://compass.invalid/late-a-1", "http://compass.invalid/late-a-2"] },
          { check: null, addresses: [OUTSIDE, OUTSIDE] },
          { check: B.name, addresses: ["http://compass.invalid/late-b"] },
        ],
      });
      expect(await outside(async () => takeNetworkAttempts()), "the record is left empty").toEqual([]);
    });

    it("beside an error the file already had, the note points at the new one, and the earlier one stays first", async () => {
      const page = blockedPage();
      await seed(page, [{ address: OUTSIDE, check: null }]);
      const earlier = { name: "Error", message: "the teardown fails on purpose", stack: "" };
      const file: FileTask = { result: { state: "fail", errors: [earlier] } };

      await outside(async () => failForWhatIsLeft(file, "suite"));

      expect(file.result?.errors?.length).toBe(2);
      expect(file.result?.errors?.[0]).toBe(earlier);
      expect(file.result?.errors?.[1]).toMatchObject({ name: "Error", message: networkMessage("suite", "outside", [OUTSIDE]) });
      expect(file.meta?.[NETWORK_NOTE]).toEqual({ errorAt: 1, left: [{ check: null, addresses: [OUTSIDE] }] });
    });

    it("a file the runner has given neither a result nor notes yet gets both", async () => {
      const page = blockedPage();
      await seed(page, [{ address: OUTSIDE, check: null }]);
      const file: FileTask = {};

      await outside(async () => failForWhatIsLeft(file, "database"));

      expect(file.result).toMatchObject({ state: "fail", errors: [{ message: networkMessage("database", "outside", [OUTSIDE]) }] });
      expect(file.meta?.[NETWORK_NOTE]).toEqual({ errorAt: 0, left: [{ check: null, addresses: [OUTSIDE] }] });
    });

    it("with nothing left, leaves the file as it is: no error, no note, its state untouched", async () => {
      const passing: FileTask = { result: { state: "pass" }, meta: {} };
      const bare: FileTask = {};

      await outside(async () => failForWhatIsLeft(passing, "database"));
      await outside(async () => failForWhatIsLeft(bare, "database"));

      expect(passing).toEqual({ result: { state: "pass" }, meta: {} });
      expect(bare).toEqual({});
    });

    it("the runner's own step hands the file over with the name of the group being run, which the messages are for", async () => {
      const page = blockedPage();
      await seed(page, [{ address: OUTSIDE, check: null }]);
      const file: FileTask = {};
      const runner = { config: { name: "suite" } } as unknown as NetworkHeldRunner;

      await outside(async () => NetworkHeldRunner.prototype.failForWhatIsLeft.call(runner, file));

      expect(file.result?.errors).toMatchObject([{ message: networkMessage("suite", "outside", [OUTSIDE]) }]);
      expect(file.meta?.[NETWORK_NOTE]).toEqual({ errorAt: 0, left: [{ check: null, addresses: [OUTSIDE] }] });
    });
  });
}

{
  function blockedPage(): typeof globalThis {
    const page = {
      fetch: async () => new Response("[]"),
      WebSocket: class {},
      XMLHttpRequest: class {},
    } as unknown as typeof globalThis;
    blockNetwork(page);
    return page;
  }

  function tryOn(page: typeof globalThis, address: string): Promise<unknown> {
    return page.fetch(address).catch((error: unknown) => error);
  }

  const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  /* Work run from here runs outside any check's work: Node carries into a timer's callbacks
     the work that was running when the timer was made, and this one was made as the file
     loaded, when no check was running. */
  const outsideJobs: (() => void)[] = [];
  const outsideAnyCheck = setInterval(() => {
    for (const job of outsideJobs.splice(0)) job();
  }, 10);
  afterAll(() => clearInterval(outsideAnyCheck));

  function outside<T>(work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => outsideJobs.push(() => void work().then(resolve, reject)));
  }

  describe("who made an attempt", () => {
    it("is the check whose work made it, also when a timer, an interval or a promise chain that work left running makes it after the work has ended", async () => {
      const page = blockedPage();
      const check = { id: "ch-033-carriers", name: "a group > the check that leaves three things running" };

      await asCheck(check, () => {
        setTimeout(() => void tryOn(page, "http://compass.invalid/by-a-timer"), 5);
        const interval = setInterval(() => {
          clearInterval(interval);
          void tryOn(page, "http://compass.invalid/by-an-interval");
        }, 5);
        void Promise.resolve()
          .then(() => pause(5))
          .then(() => tryOn(page, "http://compass.invalid/by-a-promise-chain"));
      });
      expect(takeNetworkAttempts(check), "nothing yet: the work has just ended").toEqual([]);
      await pause(60);

      const taken = takeNetworkAttempts(check);
      expect(taken.map((attempt) => attempt.address).sort()).toEqual([
        "http://compass.invalid/by-a-promise-chain",
        "http://compass.invalid/by-a-timer",
        "http://compass.invalid/by-an-interval",
      ]);
      expect(taken.every((attempt) => attempt.check?.id === check.id && attempt.check?.name === check.name)).toBe(true);
    });

    it("seen from a check's work, the record holds that check's own attempts, and clearing it keeps another check's", async () => {
      const page = blockedPage();
      const first = { id: "ch-033-first", name: "the first" };
      const second = { id: "ch-033-second", name: "the second" };

      await asCheck(first, () => tryOn(page, "http://compass.invalid/by-the-first"));
      const seen = await asCheck(second, async () => {
        await tryOn(page, "http://compass.invalid/by-the-second");
        const before = networkAttempts();
        forgetNetworkAttempts();
        return { before, after: networkAttempts() };
      });

      expect(seen.before).toEqual(["http://compass.invalid/by-the-second"]);
      expect(seen.after).toEqual([]);
      expect(takeNetworkAttempts(second)).toEqual([]);
      expect(takeNetworkAttempts(first)).toEqual([{ address: "http://compass.invalid/by-the-first", check: first }]);
    });

    it("tells two checks with the same name apart by their ids", async () => {
      const page = blockedPage();
      const one = { id: "ch-033-one", name: "alike" };
      const other = { id: "ch-033-other", name: "alike" };

      await asCheck(one, () => tryOn(page, "http://compass.invalid/by-one"));
      await asCheck(other, () => tryOn(page, "http://compass.invalid/by-the-other"));

      expect(takeNetworkAttempts(one).map((attempt) => attempt.address)).toEqual(["http://compass.invalid/by-one"]);
      expect(takeNetworkAttempts(other).map((attempt) => attempt.address)).toEqual(["http://compass.invalid/by-the-other"]);
    });

    it("outside any check, the record holds the attempts made outside any check, and clearing it clears those alone", async () => {
      const page = blockedPage();
      const check = { id: "ch-033-beside-the-outside", name: "a check beside the outside" };
      await asCheck(check, () => tryOn(page, "http://compass.invalid/by-a-check"));

      const seen = await outside(async () => {
        await tryOn(page, "http://compass.invalid/outside-any-check");
        const before = networkAttempts();
        forgetNetworkAttempts();
        return { before, after: networkAttempts() };
      });

      expect(seen.before).toEqual(["http://compass.invalid/outside-any-check"]);
      expect(seen.after).toEqual([]);
      expect(networkAttempts(), "seen from this check, neither is its own").toEqual([]);
      expect(takeNetworkAttempts(check)).toEqual([{ address: "http://compass.invalid/by-a-check", check }]);
    });

    it("given nothing, takes every attempt left, whoever made it, in the order tried, and leaves the record empty", async () => {
      const page = blockedPage();
      const a = { id: "ch-033-a", name: "a" };
      const b = { id: "ch-033-b", name: "b" };

      await asCheck(a, () => tryOn(page, "http://compass.invalid/1"));
      await asCheck(b, () => tryOn(page, "http://compass.invalid/2"));
      await asCheck(a, () => tryOn(page, "http://compass.invalid/3"));

      const taken = await outside(async () => ({ first: takeNetworkAttempts(), again: takeNetworkAttempts() }));
      expect(taken.first).toEqual([
        { address: "http://compass.invalid/1", check: a },
        { address: "http://compass.invalid/2", check: b },
        { address: "http://compass.invalid/3", check: a },
      ]);
      expect(taken.again).toEqual([]);
    });

    it("given nothing, from inside a check's work, throws and takes nothing, so a check cannot take another's attempts", async () => {
      const page = blockedPage();
      const other = { id: "ch-033-another", name: "another check" };
      await asCheck(other, () => tryOn(page, "http://compass.invalid/by-another-check"));

      expect(() => takeNetworkAttempts()).toThrow(/never from inside a check/);
      expect(takeNetworkAttempts(other)).toEqual([{ address: "http://compass.invalid/by-another-check", check: other }]);
    });
  });

  describe("the six messages", () => {
    const two = ["http://compass.invalid/a", "http://compass.invalid/b"];
    const waysOn =
      "Two ways on: stand in for the request inside the check, as the seam's checks do with their in-memory stand-in; or, when the check needs a real database, name its file <module>.database.<topic>.test.ts and run it with npm run test:db (spec §19).";
    const practiceOnly = "A database check reaches the practice copy alone; stand in for any other request inside the check.";

    it("reads, for the suite, word for word as the intent quotes it", () => {
      expect(networkMessage("suite", "during", two)).toBe(
        `This check tried to reach the network, which a check in the suite may not do: ${two.join(", ")}. Nothing was sent. ${waysOn}`,
      );
      expect(networkMessage("suite", "outside", two)).toBe(
        `Something in this file tried to reach the network outside any check, in a step before or after its checks or as the file loaded: ${two.join(", ")}. Nothing was sent. ${waysOn}`,
      );
      expect(networkMessage("suite", "late", two, "a group > a check")).toBe(
        `The check "a group > a check" left something running that tried to reach the network after it had ended: ${two.join(", ")}. Nothing was sent. ${waysOn}`,
      );
    });

    it("reads, for the database checks, word for word as the intent quotes it", () => {
      expect(networkMessage("database", "during", two)).toBe(
        `This check tried to reach something other than the practice copy, which a database check may not do: ${two.join(", ")}. Nothing was sent. ${practiceOnly}`,
      );
      expect(networkMessage("database", "outside", two)).toBe(
        `Something in this file tried to reach something other than the practice copy outside any check, in a step before or after its checks or as the file loaded: ${two.join(", ")}. Nothing was sent. ${practiceOnly}`,
      );
      expect(networkMessage("database", "late", two, "a group > a check")).toBe(
        `The check "a group > a check" left something running that tried to reach something other than the practice copy after it had ended: ${two.join(", ")}. Nothing was sent. ${practiceOnly}`,
      );
    });

    it("says what is left at the end of a file in one message for every attempt outside any check, and one for each check that left something running, in the order of their first attempt", () => {
      const a = { id: "ch-033-left-a", name: "the check a" };
      const b = { id: "ch-033-left-b", name: "the check b" };
      const alikeB = { id: "ch-033-left-b2", name: "the check b" };

      expect(
        leftoverMessages("suite", [
          { address: "http://compass.invalid/late-a-1", check: a },
          { address: "http://compass.invalid/outside-1", check: null },
          { address: "http://compass.invalid/late-b", check: b },
          { address: "http://compass.invalid/late-a-2", check: a },
          { address: "http://compass.invalid/outside-2", check: null },
          { address: "http://compass.invalid/late-alike-b", check: alikeB },
        ]),
      ).toEqual([
        networkMessage("suite", "late", ["http://compass.invalid/late-a-1", "http://compass.invalid/late-a-2"], "the check a"),
        networkMessage("suite", "outside", ["http://compass.invalid/outside-1", "http://compass.invalid/outside-2"]),
        networkMessage("suite", "late", ["http://compass.invalid/late-b"], "the check b"),
        networkMessage("suite", "late", ["http://compass.invalid/late-alike-b"], "the check b"),
      ]);
      expect(leftoverMessages("database", [])).toEqual([]);
    });
  });
}
