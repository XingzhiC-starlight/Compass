import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const CHECK_DATABASE =
  "In the database checks, an attempt to reach anything but the practice copy and its inbox is refused and fails the run in the same places and in the same way, with nothing arriving there, and its message reads, with <address> and <name> as above";

const PRACTICE_ONLY = "A database check reaches the practice copy alone; stand in for any other request inside the check.";

function duringACheck(addresses: string[]): string {
  return `This check tried to reach something other than the practice copy, which a database check may not do: ${addresses.join(", ")}. Nothing was sent. ${PRACTICE_ONLY}`;
}

function outsideAnyCheck(addresses: string[]): string {
  return `Something in this file tried to reach something other than the practice copy outside any check, in a step before or after its checks or as the file loaded: ${addresses.join(", ")}. Nothing was sent. ${PRACTICE_ONLY}`;
}

function arrivedLate(name: string, addresses: string[]): string {
  return `The check "${name}" left something running that tried to reach something other than the practice copy after it had ended: ${addresses.join(", ")}. Nothing was sent. ${PRACTICE_ONLY}`;
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

const OUTSIDE_GROUP = "kept for the network rule: a database file tries elsewhere outside any check";
const OUTSIDE_FIRST = "the first check makes no attempt";
const OUTSIDE_SECOND = "the second check makes no attempt";

const AROUND_GROUP = "kept for the network rule: a database file tries elsewhere during a check";
const BEFORE_EACH_TRIES = "a step before it tries elsewhere";
const AFTER_EACH_TRIES = "a step after it tries elsewhere";
const TRIES_TWICE = "tries elsewhere twice itself";
const NO_ATTEMPT = "makes no attempt, and nothing around it does";

const LATE_GROUP = "kept for the network rule in the database group";
const LATE_INNER_GROUP = "a late attempt";
const LEAVES_THEM_RUNNING = "leaves two attempts running";
const RUNNING_WHEN_THEY_ARRIVE = "makes no attempt, while the two left running arrive";
const LATE_NAME = `${LATE_GROUP} > ${LATE_INNER_GROUP} > ${LEAVES_THEM_RUNNING}`;

type Scenario = "outside" | "around" | "late";

function sourceOf(scenario: Scenario, port: number): string {
  const head = [
    "/* Kept for the network rule's tests (scripts/practice/a-network-attempt-fails-the-run.database.practice-copy.test.ts):",
    "   written for one run of the test runner and deleted after it. Every attempt goes to a",
    "   pretend database on this machine, which is not the practice copy, and every one is",
    "   caught here, so that only the network rule of the database checks can fail this",
    "   file for it. Nothing here reaches the practice copy. */",
    "",
    'import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";',
    "",
    `const AT = ["http://127.0.0.1", "${port}"].join(":");`,
    'const tryElsewhere = (where: string) => fetch(AT + where).then(() => "answered", () => "refused");',
    "",
  ];

  const bodies: Record<Scenario, string[]> = {
    outside: [
      `void tryElsewhere("${TRIED.asTheFileLoads}");`,
      "",
      "beforeAll(async () => {",
      `  await tryElsewhere("${TRIED.beforeTheChecks}");`,
      "});",
      "",
      "afterAll(async () => {",
      `  await tryElsewhere("${TRIED.afterTheChecks}");`,
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
      `    if (context.task.name === "${BEFORE_EACH_TRIES}") await tryElsewhere("${TRIED.beforeEachCheck}");`,
      "  });",
      "",
      "  afterEach(async (context) => {",
      `    if (context.task.name === "${AFTER_EACH_TRIES}") await tryElsewhere("${TRIED.afterEachCheck}");`,
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
      `    await tryElsewhere("${TRIED.byTheCheckFirst}");`,
      `    await tryElsewhere("${TRIED.byTheCheckSecond}");`,
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
      `      setTimeout(() => void tryElsewhere("${TRIED.lateFirst}"), 100);`,
      `      setTimeout(() => void tryElsewhere("${TRIED.lateSecond}"), 150);`,
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
const THROWAWAY_FOLDER = path.join(ROOT, "scripts", "practice", `ch-033-throwaway-database-${RUN_ID}`);

const A_RUN_AT_MOST = 180_000;
const A_TEST_AT_MOST = 240_000;

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
  const file = path.join(THROWAWAY_FOLDER, `${scenario}.database.throwaway.test.ts`);
  const named = path.relative(ROOT, file).split(path.sep).join("/");
  const reports = fs.mkdtempSync(path.join(os.tmpdir(), "compass-ch-033-"));
  const report = path.join(reports, "report.json");
  try {
    fs.mkdirSync(THROWAWAY_FOLDER, { recursive: true });
    fs.writeFileSync(file, sourceOf(scenario, pretend.port));
    const ended = await runOnce(
      process.execPath,
      [RUNNER, "run", "--project", "database", named, "--reporter=default", "--reporter=json", `--outputFile.json=${report}`],
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
  expect(run.ran, `harness: the test runner ran the throwaway database file and reported how its checks ended (${run.why}; ${printed(run)})`).toBe(
    true,
  );
  expect(
    run.checks.map((one) => one.title).sort(),
    "harness: the report holds the throwaway file's own checks, and no other",
  ).toEqual([...titles].sort());
  expect(
    run.said.includes("npm run practice:up"),
    `harness: the run was not stopped for want of the practice copy (${printed(run)})`,
  ).toBe(false);
}

describe("in the database checks, an attempt to reach something other than the practice copy outside any check, really run", () => {
  it.skipIf(startedInsideARun)(
    `${CHECK_DATABASE} — outside any check: tried as the file loads, in a step that runs once before its checks and in one that runs once after them, the run fails, nothing arrives at the address, and no check is marked failed for it`,
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
    `${CHECK_DATABASE} — outside any check: "Something in this file tried to reach something other than the practice copy outside any check, in a step before or after its checks or as the file loaded: <address>. Nothing was sent. A database check reaches the practice copy alone; stand in for any other request inside the check."`,
    async () => {
      const run = await theRun("outside");

      expectTheRun(run, [OUTSIDE_FIRST, OUTSIDE_SECOND]);
      expect(run.said, "the run says it, with the three addresses in the order tried, separated by commas").toContain(
        outsideAnyCheck([TRIED.asTheFileLoads, TRIED.beforeTheChecks, TRIED.afterTheChecks].map((where) => run.at + where)),
      );
    },
    A_TEST_AT_MOST,
  );
});

describe("in the database checks, an attempt to reach something other than the practice copy during a check, really run", () => {
  it.skipIf(startedInsideARun)(
    `${CHECK_DATABASE} — around each check: an attempt in a step that runs before each check, or after it, fails that check and is named in its failure, as one the check made itself does, and the check around which none was made passes`,
    async () => {
      const run = await theRun("around");

      expectTheRun(run, [BEFORE_EACH_TRIES, AFTER_EACH_TRIES, TRIES_TWICE, NO_ATTEMPT]);
      expect(run.arrived, "what arrived at the address: the attempts were refused, and nothing was sent").toEqual([]);
      expect(stateOf(run, NO_ATTEMPT), `the check around which no attempt was made (${printed(run)})`).toBe("passed");
      for (const [title, where] of [
        [BEFORE_EACH_TRIES, TRIED.beforeEachCheck],
        [AFTER_EACH_TRIES, TRIED.afterEachCheck],
        [TRIES_TWICE, TRIED.byTheCheckFirst],
      ]) {
        expect(stateOf(run, title), `the check "${title}" (${printed(run)})`).toBe("failed");
        expect(failuresOf(run, title), `and its failure names the address tried for it`).toContain(run.at + where);
      }
    },
    A_TEST_AT_MOST,
  );

  it.skipIf(startedInsideARun)(
    `${CHECK_DATABASE} — during a check: "This check tried to reach something other than the practice copy, which a database check may not do: <address>. Nothing was sent. A database check reaches the practice copy alone; stand in for any other request inside the check.", and so for an attempt in a step around the check`,
    async () => {
      const run = await theRun("around");

      expectTheRun(run, [BEFORE_EACH_TRIES, AFTER_EACH_TRIES, TRIES_TWICE, NO_ATTEMPT]);
      expect(failuresOf(run, TRIES_TWICE), "the check that tried twice: both addresses, in the order tried, separated by commas").toContain(
        duringACheck([run.at + TRIED.byTheCheckFirst, run.at + TRIED.byTheCheckSecond]),
      );
      expect(failuresOf(run, BEFORE_EACH_TRIES), "the check whose step before it tried elsewhere").toContain(
        duringACheck([run.at + TRIED.beforeEachCheck]),
      );
      expect(failuresOf(run, AFTER_EACH_TRIES), "the check whose step after it tried elsewhere").toContain(
        duringACheck([run.at + TRIED.afterEachCheck]),
      );
    },
    A_TEST_AT_MOST,
  );
});

describe("in the database checks, attempts to reach something other than the practice copy that a check leaves running, really run", () => {
  it.skipIf(startedInsideARun)(
    `${CHECK_DATABASE} — late: two attempts left running by one check arrive while the next check runs; the run fails, nothing arrives at the address, and the check running when they arrive, which made none, is not marked failed`,
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
    `${CHECK_DATABASE} — late: "The check "<name>" left something running that tried to reach something other than the practice copy after it had ended: <address>. Nothing was sent. A database check reaches the practice copy alone; stand in for any other request inside the check."`,
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
