// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as commands from "./commands.mjs";
import { runDatabaseChecks } from "./commands.mjs";
import { failingExitCode, PracticeRefusal, runnerEndedAsFailed, troubleNobodyNamed, troubleRaisedOutside, troublesInFile } from "./lib.mjs";

const CHECK_NOT_PROVEN =
  "With the practice copy up, the database command fails when the test runner reports something that went wrong outside the checks, though every check that ran passed: a database file that cannot load; a step that runs before a file's checks and fails or runs out of time, so that those checks do not run; a step that runs after a file's checks and fails; an error raised outside any check. The command names the file where the test runner names one, says what went wrong, and does not say that every check passed";

type ToolAnswer = { code: number; text: string };
type CheckReport = { name: string; file: string; passed: boolean; tries: number };
type Trouble = { file: string; what: string };
type RunReport = { checks: CheckReport[]; troubles: Trouble[] };
type Where = { address: string; publicKey: string; inbox: string };
type RunTests = (where: Where, options: { secondTry: boolean }) => Promise<RunReport | CheckReport[]>;
type Reported = { passed: boolean; ran: number; failed: string[]; secondTry: string[]; notProven: string[] };

type Around = ReturnType<typeof surroundings>["around"];

const runDatabaseChecks = commands.runDatabaseChecks as unknown as (
  around: Around,
  migrationFiles: string[],
  runTests: RunTests,
  options?: { secondTry: boolean },
) => Promise<Reported>;

const SETTINGS = {
  name: "compass-practice",
  address: "http://127.0.0.1:55321",
  inbox: "http://127.0.0.1:55324",
  app: "http://localhost:5183",
};

const PUBLIC_KEY = "sb_publishable_made_up_for_the_test";
const COMMITTED = ["0001_init.sql", "0002_save_interview.sql"];

function statusAnswer(): ToolAnswer {
  const values = {
    API_URL: SETTINGS.address,
    DB_URL: "postgresql://postgres:a-made-up-password@127.0.0.1:55322/postgres",
    INBUCKET_URL: SETTINGS.inbox,
    MAILPIT_URL: SETTINGS.inbox,
    PUBLISHABLE_KEY: PUBLIC_KEY,
    ANON_KEY: "eyJ.made-up-public.key",
    SECRET_KEY: "sb_secret_made_up_for_the_test",
    SERVICE_ROLE_KEY: "eyJ.made-up-admin.key",
    JWT_SECRET: "made-up-jwt-secret-with-at-least-32-characters",
  };
  return { code: 0, text: `Stopped services: supabase_imgproxy_compass-practice\n${JSON.stringify(values, null, 2)}\n` };
}

function tableAnswer(marked: string): ToolAnswer {
  return { code: 0, text: `Connecting to local database...\n answer\n--------\n ${marked}\n(1 row)\n` };
}

const ROWS_AS_MADE = "rows:2,0,0,0,0,0,0,0";

function callKind(args: string[]): string {
  if (args[0] === "status") return "status";
  if (args[0] === "db" && args[1] === "query") {
    if (args.includes("-f")) return "check";
    const sql = String(args[args.length - 1] ?? "");
    if (sql.includes("applied:")) return "applied";
    if (sql.includes("rows:")) return "rows";
  }
  return "other";
}

function surroundings(script: { checks?: Record<string, ToolAnswer> } = {}) {
  const asked: string[][] = [];
  const said: string[] = [];
  const sent: string[] = [];

  const tool = async (args: string[]): Promise<ToolAnswer> => {
    asked.push([...args]);
    switch (callKind(args)) {
      case "status":
        return statusAnswer();
      case "applied":
        return tableAnswer("applied:0001_init,0002_save_interview");
      case "rows":
        return tableAnswer(ROWS_AS_MADE);
      case "check": {
        const file = String(args[args.indexOf("-f") + 1]);
        return script.checks?.[file] ?? { code: 1, text: `open ${file}: no such file or directory\n` };
      }
      default:
        return { code: 1, text: "unknown command\n" };
    }
  };

  const request = async (input: unknown): Promise<Response> => {
    sent.push(input instanceof Request ? input.url : String(input));
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const around = {
    tool,
    say: (line: string) => {
      said.push(String(line));
    },
    settings: SETTINGS,
    linked: false,
    request: request as unknown as typeof fetch,
  };

  return { around, asked, said, sent };
}

function runner(report: RunReport) {
  const calls: { where: unknown; options: unknown }[] = [];
  const runTests: RunTests = async (where, options) => {
    calls.push({ where, options });
    return {
      checks: report.checks.map((one) => ({ ...one })),
      troubles: report.troubles.map((one) => ({ ...one })),
    };
  };
  return { runTests, calls };
}

type Outcome<T> = { threw: boolean; value?: T; error?: unknown };

async function trying<T>(run: () => Promise<T> | T): Promise<Outcome<T>> {
  try {
    return { threw: false, value: await run() };
  } catch (error) {
    return { threw: true, error };
  }
}

function told(outcome: Outcome<unknown>): string {
  if (outcome.threw) return `it threw: ${String(outcome.error)}`;
  try {
    return `it answered: ${JSON.stringify(outcome.value)}`;
  } catch {
    return `it answered: ${String(outcome.value)}`;
  }
}

function shown(said: string[]): string {
  return `shown: ${JSON.stringify(said)}`;
}

function closingLine(said: string[]): string {
  return said[said.length - 1] ?? "(nothing was said)";
}

function linesAboutTrouble(said: string[]): string[] {
  return said.slice(0, -1).filter((line) => /^\s*not proven\b/i.test(line));
}

function sayingEveryCheckPassed(said: string[]): string[] {
  return said.filter((line) => /\b(every|all|both)\b(?:\s+\S+){0,3}?\s+checks?\s+(?:have\s+|has\s+)?passed\b/i.test(line));
}

function countsOf(closing: string): { failedOfRan: string | null; others: number[] } {
  const ofPattern = /\b(\d+)\s+of\s+(\d+)\b/;
  const found = closing.match(ofPattern);
  const others = [...closing.replace(ofPattern, " ").matchAll(/\b\d+\b/g)].map((one) => Number(one[0]));
  return { failedOfRan: found ? `${found[1]} of ${found[2]}` : null, others };
}

function expectClosingLine(said: string[], notProven: number, failedOfRan: string): void {
  const closing = closingLine(said);
  expect(closing, `the closing line does not say that every check passed: it does not hold the word "passed" (${shown(said)})`).not.toMatch(
    /passed/i,
  );
  expect(closing, `it says that something is not proven (found: "${closing}")`).toMatch(/\bnot proven\b/i);
  expect(countsOf(closing).others, `and how many things, in digits (found: "${closing}")`).toContain(notProven);
  expect(countsOf(closing).failedOfRan, `and how many of how many checks failed (found: "${closing}")`).toBe(failedOfRan);
  expect(closing, `saying in words that the count is of checks that failed, and not of checks that passed (found: "${closing}")`).toMatch(
    /fail/i,
  );
}

const FILE = "src/lib/db.database.practice-copy.test.ts";
const OTHER_FILE = "src/lib/db.cascade.database.practice-copy.test.ts";

function check(name: string, passed: boolean, tries = 1): CheckReport {
  return { name, file: FILE, passed, tries };
}

const OWNER = "the owner stamp > the saved row names its account";
const CASCADE = "a deleted project > every row it owned is gone";
const FALSE_ON_PURPOSE = "kept for proving that a failure is reported > false on purpose: expects a project that was never saved";

const CANNOT_LOAD: Trouble = { file: OTHER_FILE, what: "the file could not load: cannot load on purpose" };
const SETUP_FAILED: Trouble = {
  file: OTHER_FILE,
  what: "2 checks did not run, since a step before them went wrong: the setup fails on purpose",
};
const SETUP_OUT_OF_TIME: Trouble = {
  file: OTHER_FILE,
  what: "1 check did not run, since a step before them went wrong: the step ran out of time after 200 milliseconds",
};
const TEARDOWN_FAILED: Trouble = { file: FILE, what: "a step after the checks went wrong: the teardown fails on purpose" };
const RAISED_OUTSIDE: Trouble = { file: "", what: "an error was raised outside any check: raised outside on purpose" };

const KINDS: [string, Trouble][] = [
  ["a database file that cannot load", CANNOT_LOAD],
  ["a step that runs before a file's checks and fails, so that those checks do not run", SETUP_FAILED],
  ["a step that runs before a file's checks and runs out of time, so that those checks do not run", SETUP_OUT_OF_TIME],
  ["a step that runs after a file's checks and fails", TEARDOWN_FAILED],
  ["an error raised outside any check, for which the test runner names no file", RAISED_OUTSIDE],
];

describe("the command that runs the database checks, when something went wrong outside the checks", () => {
  it.each(KINDS)(
    `${CHECK_NOT_PROVEN} — %s, while both checks that ran passed: the command fails, names the file where one is named, says what went wrong, and does not say that every check passed`,
    async (_kind, trouble) => {
      const { around, said, sent } = surroundings();
      const { runTests, calls } = runner({ checks: [check(OWNER, true), check(CASCADE, true)], troubles: [trouble] });

      const outcome = await trying(() => runDatabaseChecks(around, COMMITTED, runTests));

      expect(outcome.value?.passed, `the command failed, though every check that ran passed (${told(outcome)})`).toBe(false);
      expect(outcome.threw, `what went wrong outside the checks is an answer, not a refusal (${told(outcome)})`).toBe(false);
      expect(outcome.value?.ran, "both checks ran").toBe(2);
      expect(outcome.value?.failed, "and both passed: no check is named as failed").toEqual([]);
      expect(outcome.value?.notProven, "what went wrong is handed back by its file, or by nothing when the runner named none").toEqual([
        trouble.file,
      ]);

      const about = linesAboutTrouble(said);
      expect(about.length, `one line shown to the person is about what went wrong, and begins with "not proven" (${shown(said)})`).toBe(1);
      expect(about[0], "it says what went wrong").toContain(trouble.what);
      if (trouble.file) {
        expect(about[0], "and it names the file, since the test runner named one").toContain(trouble.file);
      } else {
        expect(about[0], "and it names no file, since the test runner named none").not.toMatch(/\.test\.tsx?\b/);
      }

      expect(said.length, `that line and one closing line are shown, and no line for a check that passed (${shown(said)})`).toBe(2);
      expectClosingLine(said, 1, "0 of 2");
      expect(sayingEveryCheckPassed(said), "lines that say every check passed").toEqual([]);
      expect(calls.length, "the checks were run once").toBe(1);
      expect(sent, "the command itself sent nothing").toEqual([]);
    },
  );

  it(`${CHECK_NOT_PROVEN} — and it is what went wrong outside the checks that makes it fail: the same two checks, with nothing gone wrong around them, pass`, async () => {
    const troubled = surroundings();
    const sound = surroundings();
    const checks = [check(OWNER, true), check(CASCADE, true)];

    const withTrouble = await trying(() =>
      runDatabaseChecks(troubled.around, COMMITTED, runner({ checks, troubles: [CANNOT_LOAD] }).runTests),
    );
    const without = await trying(() => runDatabaseChecks(sound.around, COMMITTED, runner({ checks, troubles: [] }).runTests));

    expect(withTrouble.value?.passed, `with a file that could not load, the command failed (${told(withTrouble)})`).toBe(false);
    expect(withTrouble.value?.notProven, "and that file is handed back as not proven").toEqual([OTHER_FILE]);
    expect(without.threw, `with nothing gone wrong, the command ran (${told(without)})`).toBe(false);
    expect(without.value?.passed, `and passed (${told(without)})`).toBe(true);
    expect(without.value?.ran, "both checks ran").toBe(2);
    expect(without.value?.notProven, "nothing is handed back as not proven").toEqual([]);
    expect(
      sound.said.filter((line) => /not proven/i.test(line)),
      "and no line shown to the person speaks of anything not proven",
    ).toEqual([]);
    expect(closingLine(sound.said), "its closing line says that every check passed").toMatch(/pass/i);
    expect(closingLine(sound.said), "and how many ran").toMatch(/\b(2|two)\b/i);
  });

  it(`${CHECK_NOT_PROVEN} — two things went wrong and one check failed besides: each has a line of its own, in the order reported, after the line about the check that failed, and the closing line counts both`, async () => {
    const { around, said } = surroundings();
    const { runTests } = runner({
      checks: [check(OWNER, true), check(FALSE_ON_PURPOSE, false), check(CASCADE, true)],
      troubles: [SETUP_FAILED, RAISED_OUTSIDE],
    });

    const outcome = await trying(() => runDatabaseChecks(around, COMMITTED, runTests));

    expect(outcome.value?.passed, `the command failed (${told(outcome)})`).toBe(false);
    expect(outcome.value?.ran, "three checks ran").toBe(3);
    expect(outcome.value?.failed, "the false check is named as the one that failed").toEqual([FALSE_ON_PURPOSE]);
    expect(outcome.value?.notProven, "both things that went wrong are handed back, in the order reported").toEqual([OTHER_FILE, ""]);

    expect(said.length, `a line for the check that failed, one for each thing that went wrong, and a closing line (${shown(said)})`).toBe(4);
    expect(said[0], "first, the check that failed").toContain(FALSE_ON_PURPOSE);
    expect(linesAboutTrouble(said), "then what went wrong outside the checks, in the order reported").toEqual([said[1], said[2]]);
    expect(said[1], "the step that failed before the checks: what went wrong").toContain(SETUP_FAILED.what);
    expect(said[1], "and the file it happened in").toContain(OTHER_FILE);
    expect(said[2], "the error raised outside any check: what went wrong").toContain(RAISED_OUTSIDE.what);
    expectClosingLine(said, 2, "1 of 3");
  });

  it(`${CHECK_NOT_PROVEN} — the one file could not load, so no check ran at all: the command fails, names the file, says what went wrong, and reports no check as passed`, async () => {
    const { around, said } = surroundings();
    const { runTests } = runner({ checks: [], troubles: [CANNOT_LOAD] });

    const outcome = await trying(() => runDatabaseChecks(around, COMMITTED, runTests));

    expect(outcome.value?.passed, `the command failed (${told(outcome)})`).toBe(false);
    expect(outcome.threw, `what went wrong outside the checks is an answer, not a refusal (${told(outcome)})`).toBe(false);
    expect(outcome.value?.ran, "no check ran").toBe(0);
    expect(outcome.value?.notProven, "the file that could not load is handed back as not proven").toEqual([OTHER_FILE]);

    const about = linesAboutTrouble(said);
    expect(about.length, `one line shown to the person is about what went wrong, and begins with "not proven" (${shown(said)})`).toBe(1);
    expect(about[0], "it says what went wrong").toContain(CANNOT_LOAD.what);
    expect(about[0], "and names the file").toContain(OTHER_FILE);

    const closing = closingLine(said);
    expect(closing, `the closing line does not hold the word "passed" (${shown(said)})`).not.toMatch(/passed/i);
    expect(closing, `it says that something is not proven (found: "${closing}")`).toMatch(/\bnot proven\b/i);
    expect(countsOf(closing).others, `and how many things, in digits (found: "${closing}")`).toContain(1);
    expect(closing, `and that no check ran (found: "${closing}")`).toMatch(/\bno\s+checks?\s+ran\b/i);
  });
});

{
  const CHECK_NEVER_GREENER =
    "Whenever the test runner ends a run of the database checks as failed, the database command fails too, whatever it heard of the checks: it is never greener than its test runner";

  const SETTINGS = {
    name: "compass-practice",
    address: "http://127.0.0.1:55321",
    inbox: "http://127.0.0.1:55324",
    app: "http://localhost:5183",
  };

  const COMMITTED = ["0001_init.sql", "0002_save_interview.sql"];

  type ToolAnswer = { code: number; text: string };

  function statusAnswer(): ToolAnswer {
    const values = {
      API_URL: SETTINGS.address,
      DB_URL: "postgresql://postgres:a-made-up-password@127.0.0.1:55322/postgres",
      INBUCKET_URL: SETTINGS.inbox,
      MAILPIT_URL: SETTINGS.inbox,
      PUBLISHABLE_KEY: "sb_publishable_made_up_for_the_test",
      ANON_KEY: "eyJ.made-up-public.key",
      SECRET_KEY: "sb_secret_made_up_for_the_test",
      SERVICE_ROLE_KEY: "eyJ.made-up-admin.key",
      JWT_SECRET: "made-up-jwt-secret-with-at-least-32-characters",
    };
    return { code: 0, text: `${JSON.stringify(values, null, 2)}\n` };
  }

  function tableAnswer(marked: string): ToolAnswer {
    return { code: 0, text: `Connecting to local database...\n answer\n--------\n ${marked}\n(1 row)\n` };
  }

  type CheckReport = { name: string; file: string; passed: boolean; tries: number; line?: number };
  type SwitchedOff = { name: string; file: string; line?: number };
  type Trouble = { file: string; what: string };
  type RunReport = { checks: CheckReport[]; troubles: Trouble[]; switchedOff?: SwitchedOff[]; runnerFailed?: boolean };

  const FILE = "src/lib/db.database.practice-copy.test.ts";
  const OTHER_FILE = "src/lib/phases.database.test.ts";

  function passedCheck(number: number): CheckReport {
    return { name: `the phases > phase ${number} is read with its own project alone`, file: OTHER_FILE, passed: true, tries: 1, line: 20 + number };
  }

  const SHORT_NAME = "the owner stamp > the saved row names its account";

  function surroundings() {
    const said: string[] = [];
    const sent: string[] = [];

    const tool = async (args: string[]): Promise<ToolAnswer> => {
      if (args[0] === "status") return statusAnswer();
      if (args[0] === "db" && args[1] === "query" && String(args[args.length - 1] ?? "").includes("applied:")) {
        return tableAnswer("applied:0001_init,0002_save_interview");
      }
      return { code: 1, text: "unknown command\n" };
    };

    const request = async (input: unknown): Promise<Response> => {
      sent.push(String(input));
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const around = {
      tool,
      say: (line: string) => {
        said.push(String(line));
      },
      settings: SETTINGS,
      linked: false,
      request: request as unknown as typeof fetch,
    };

    return { around, said, sent };
  }

  type Outcome<T> = { threw: boolean; value?: T; error?: unknown };

  async function trying<T>(run: () => Promise<T> | T): Promise<Outcome<T>> {
    try {
      return { threw: false, value: await run() };
    } catch (error) {
      return { threw: true, error };
    }
  }

  function told(outcome: Outcome<unknown>): string {
    if (outcome.threw) return `it threw: ${String(outcome.error)}`;
    return `it answered: ${JSON.stringify(outcome.value)}`;
  }

  async function reported(report: RunReport, options?: { secondTry: boolean }) {
    const { around, said } = surroundings();
    const handed: { secondTry: boolean }[] = [];
    const runTests = async (_where: { address: string; publicKey: string; inbox: string }, how: { secondTry: boolean }) => {
      handed.push(how);
      return report;
    };
    const outcome = await trying(() =>
      options ? runDatabaseChecks(around, COMMITTED, runTests, options) : runDatabaseChecks(around, COMMITTED, runTests),
    );
    return { outcome, said, handed };
  }

  function shown(said: string[]): string {
    return `shown: ${JSON.stringify(said, null, 1)}`;
  }

  function beginning(said: string[], words: string): string[] {
    return said.filter((line) => line.startsWith(words));
  }

  describe("the test runner ended the run as failed", () => {
    const secondTryThatPassed: CheckReport = { name: SHORT_NAME, file: FILE, passed: true, tries: 2, line: 214 };
    const oneSwitchedOff: SwitchedOff = { name: "the phases > a phase past its limit is refused", file: OTHER_FILE, line: 61 };

    const heard: [string, RunReport, { secondTry: boolean }][] = [
      ["every check passed at its first try", { checks: [passedCheck(1), passedCheck(2)], troubles: [] }, { secondTry: false }],
      ["a check passed at its second try", { checks: [passedCheck(1), secondTryThatPassed], troubles: [] }, { secondTry: true }],
      [
        "every check that ran passed, and one is switched off",
        { checks: [passedCheck(1), passedCheck(2)], troubles: [], switchedOff: [oneSwitchedOff] },
        { secondTry: false },
      ],
    ];

    it.each(heard)(`${CHECK_NEVER_GREENER} — it heard that %s, and nothing went wrong outside the checks: the run has not passed`, async (_what, report, options) => {
      const green = await reported(report, options);
      const red = await reported({ ...report, runnerFailed: true }, options);

      expect(green.outcome.threw, `the command ran (${told(green.outcome)})`).toBe(false);
      expect(red.outcome.threw, `the command ran (${told(red.outcome)})`).toBe(false);
      expect(green.outcome.value?.passed, "harness: the same report, from a test runner that did not end the run as failed, is a run that passed").toBe(
        true,
      );
      expect(
        red.outcome.value?.passed,
        `the test runner ended the run as failed, so the command has not passed (${shown(red.said)})`,
      ).toBe(false);
    });

    it(`${CHECK_NEVER_GREENER} — it says so: one line that begins "not proven" says that the test runner did not pass the run, and the closing line does not say that the checks passed`, async () => {
      const { outcome, said } = await reported({ checks: [passedCheck(1), passedCheck(2)], troubles: [], runnerFailed: true });

      expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
      const lines = beginning(said, "not proven");
      expect(lines.length, `one line begins "not proven" (${shown(said)})`).toBe(1);
      expect(String(lines[0]), "and it says that it was the test runner that did not pass the run").toMatch(/test runner/i);
      const closing = String(said[said.length - 1]);
      expect(closing, `the closing line does not hold the word "passed" (${shown(said)})`).not.toContain("passed");
      expect(closing, "it says that the run did not pass").toMatch(/did not pass/i);
      expect(closing, "counts the one thing that is not proven").toContain("1 not proven");
      expect(closing, "and says that none of the two checks that ran failed").toContain("0 of 2");
    });
  });
}

{
  const CHECK_NO_CHECK =
    'With the practice copy up, a database file that holds no check is reported on a line that begins "not proven" as holding no check, and not as a file that could not load';

  type RunnerCheck = { result: () => { state: string }; options: { mode: string }; fullName?: string; location?: { line: number } };
  type RunnerGroup = {
    errors: () => unknown[];
    children: { allTests: () => Iterable<RunnerCheck>; allSuites: () => Iterable<RunnerGroup> };
  };

  function fileOf(checks: RunnerCheck[], errors: unknown[] = []): RunnerGroup {
    const group: RunnerGroup = { errors: () => [], children: { allTests: () => checks, allSuites: () => [] } };
    return { errors: () => errors, children: { allTests: () => checks, allSuites: () => (checks.length > 0 ? [group] : []) } };
  }

  const FILE = "src/lib/phases.database.test.ts";

  type Outcome<T> = { threw: boolean; value?: T; error?: unknown };

  function trying<T>(run: () => T): Outcome<T> {
    try {
      return { threw: false, value: run() };
    } catch (error) {
      return { threw: true, error };
    }
  }

  function told(outcome: Outcome<unknown>): string {
    if (outcome.threw) return `it threw: ${String(outcome.error)}`;
    return `it answered: ${JSON.stringify(outcome.value)}`;
  }

  describe("a database file that holds no check", () => {
    it(`${CHECK_NO_CHECK} — the test runner's report of such a file is read as "holds no check", where a file that raised an error as it loaded is still one that could not load`, () => {
      const onThisMachine = "/Users/someone/compass/src/lib/phases.database.test.ts";
      const holdsNoCheck = fileOf([], [new Error(`No test suite found in file ${onThisMachine}`)]);
      const cannotLoad = fileOf([], [new Error("cannot load on purpose")]);

      const loaded = trying(() => troublesInFile(FILE, holdsNoCheck));
      const notLoaded = trying(() => troublesInFile(FILE, cannotLoad));

      expect(notLoaded.threw, `harness: the report of a file that could not load was read (${told(notLoaded)})`).toBe(false);
      expect(String(notLoaded.value?.[0]?.what), "harness: a file that raised an error as it loaded could not load").toMatch(/could not load/i);

      expect(loaded.threw, `the report of the file that holds no check was read (${told(loaded)})`).toBe(false);
      expect(loaded.value?.length, `one thing went wrong in it (${told(loaded)})`).toBe(1);
      expect(loaded.value?.[0]?.file, "in that file").toBe(FILE);
      expect(String(loaded.value?.[0]?.what), "it is reported as holding no check").toMatch(/holds no check/i);
      expect(String(loaded.value?.[0]?.what), "and not as a file that could not load").not.toMatch(/could not load/i);
    });
  });
}

{
  type Check = { result: () => { state: string }; options: { mode: string } };
  type Group = { errors: () => unknown[]; children: { allTests: () => Check[]; allSuites: () => Group[] } };

  const passed = (): Check => ({ result: () => ({ state: "passed" }), options: { mode: "run" } });
  const leftUnrun = (): Check => ({ result: () => ({ state: "skipped" }), options: { mode: "run" } });
  const switchedOff = (): Check => ({ result: () => ({ state: "skipped" }), options: { mode: "skip" } });

  function group(errors: unknown[], checks: Check[], inside: Group[] = []): Group {
    return {
      errors: () => errors,
      children: {
        allTests: () => [...checks, ...inside.flatMap((one) => one.children.allTests())],
        allSuites: () => [...inside, ...inside.flatMap((one) => one.children.allSuites())],
      },
    };
  }

  const A_FILE = "src/lib/made-up.database.practice-copy.test.ts";

  describe("what went wrong in a file outside its checks", () => {
    it("a file with nothing wrong answers with nothing, whatever its checks did", () => {
      const file = group([], [passed(), switchedOff()], [group([], [passed()])]);

      expect(troublesInFile(A_FILE, file)).toEqual([]);
    });

    it("a step before the whole file's checks: one answer, which counts every check under it, a group's included", () => {
      const file = group([new Error("signing in went wrong")], [leftUnrun()], [group([], [leftUnrun(), leftUnrun()])]);

      expect(troublesInFile(A_FILE, file)).toEqual([
        { file: A_FILE, what: "3 checks did not run, since a step before them went wrong: signing in went wrong" },
      ]);
    });

    it("a check switched off on purpose is not counted among the checks that did not run", () => {
      const inner = group([new Error("the step went wrong")], [leftUnrun(), switchedOff(), switchedOff()]);
      const file = group([], [passed()], [inner]);

      expect(troublesInFile(A_FILE, file)).toEqual([
        { file: A_FILE, what: "1 check did not run, since a step before them went wrong: the step went wrong" },
      ]);
    });

    it("two groups that went wrong in one file get an answer each, in the file's order", () => {
      const before = group([new Error("before")], [leftUnrun()]);
      const after = group([new Error("after")], [passed()]);

      expect(troublesInFile(A_FILE, group([], [], [before, after])).map((one) => one.what)).toEqual([
        "1 check did not run, since a step before them went wrong: before",
        "a step after the checks went wrong: after",
      ]);
    });

    it("of an error, the first line is kept, and no more than a line's worth", () => {
      const twoLines = group([new Error("Hook timed out in 200ms.\nIf this is a long-running hook, pass a timeout value")], [leftUnrun()]);
      const long = group([new Error("x".repeat(500))], []);
      const silent = group([{}], []);

      expect(troublesInFile(A_FILE, twoLines)[0].what).toBe("1 check did not run, since a step before them went wrong: Hook timed out in 200ms.");
      expect(troublesInFile(A_FILE, long)[0].what).toBe(`the file could not load: ${"x".repeat(200)}`);
      expect(troublesInFile(A_FILE, silent)[0].what).toBe("the file could not load: [object Object]");
      expect(troubleRaisedOutside(new Error(""), "").what).toBe("an error was raised outside any check: no reason was given");
    });
  });

  describe("a file, or a group, that holds no check", () => {
    it("is said to hold none, and any other error where no check was found still means that the file could not load", () => {
      const emptyFile = group([new Error("No test suite found in file /Users/someone/compass/src/lib/made-up.database.practice-copy.test.ts")], []);
      const emptyGroup = group([], [passed()], [group([new Error("No test found in suite the phases of one project")], [])]);
      const brokeAsItLoaded = group([new Error("Cannot find module './missing'")], []);

      expect(troublesInFile(A_FILE, emptyFile)).toEqual([{ file: A_FILE, what: "the file holds no check" }]);
      expect(troublesInFile(A_FILE, emptyGroup)).toEqual([{ file: A_FILE, what: 'the group "the phases of one project" holds no check' }]);
      expect(troublesInFile(A_FILE, brokeAsItLoaded)).toEqual([{ file: A_FILE, what: "the file could not load: Cannot find module './missing'" }]);
    });

    it("is not read from an error that only holds those words further on", () => {
      const file = group([new Error("it broke as it loaded: No test suite found in file x")], []);

      expect(troublesInFile(A_FILE, file)[0].what).toBe("the file could not load: it broke as it loaded: No test suite found in file x");
    });
  });

  describe("whether the test runner itself ended a run as failed", () => {
    it("is so by its verdict, by the exit code the run left, or by the exit code its closing left", () => {
      expect(runnerEndedAsFailed("passed", undefined, undefined)).toBe(false);
      expect(runnerEndedAsFailed("passed", 0, 0)).toBe(false);
      expect(runnerEndedAsFailed("failed", undefined, undefined)).toBe(true);
      expect(runnerEndedAsFailed("interrupted", 0, 0)).toBe(true);
      expect(runnerEndedAsFailed("", undefined, undefined), "a run that never came to its end").toBe(true);
      expect(runnerEndedAsFailed("passed", 1, undefined), "the run left a failing exit code").toBe(true);
      expect(runnerEndedAsFailed("passed", undefined, 1), "the closing left a failing exit code").toBe(true);
    });

    it("reads an exit code as failing for any code but 0, and but none at all", () => {
      expect([1, 2, 130, "1"].map(failingExitCode)).toEqual([true, true, true, true]);
      expect([0, "0", undefined, null].map(failingExitCode)).toEqual([false, false, false, false]);
    });
  });

  describe("a run the test runner did not pass, though nothing says why", () => {
    const twoPassed = [{ passed: true }, { passed: true }];

    it("is reported, so that it is never read as green", () => {
      const unnamed = troubleNobodyNamed("failed", twoPassed, []);

      expect(unnamed?.file).toBe("");
      expect(unnamed?.what).toMatch(/did not pass/);
      expect(troubleNobodyNamed("interrupted", twoPassed, [])).not.toBeNull();
      expect(troubleNobodyNamed("", twoPassed, [])).not.toBeNull();
    });

    it("adds nothing when the run passed, when a check failed, when no check ran, or when what went wrong is known", () => {
      expect(troubleNobodyNamed("passed", twoPassed, [])).toBeNull();
      expect(troubleNobodyNamed("failed", [{ passed: true }, { passed: false }], [])).toBeNull();
      expect(troubleNobodyNamed("failed", [], [])).toBeNull();
      expect(troubleNobodyNamed("failed", twoPassed, [{ file: A_FILE, what: "the file could not load: x" }])).toBeNull();
    });
  });
}

{
  const SETTINGS = {
    name: "compass-practice",
    address: "http://127.0.0.1:55321",
    inbox: "http://127.0.0.1:55324",
    app: "http://localhost:5183",
  };
  const PUBLIC_KEY = "sb_publishable_made_up_for_the_test";

  function surroundings(answer: () => Promise<Response> = async () => new Response("[]")) {
    const asked: { address: string; headers: unknown }[] = [];
    const said: string[] = [];
    const around = {
      tool: async () => ({ code: 1, text: "the tool is never asked" }),
      say: (line: string) => {
        said.push(line);
      },
      settings: SETTINGS,
      linked: false,
      request: (async (address: unknown, init?: { headers?: unknown }) => {
        asked.push({ address: String(address), headers: init?.headers });
        return answer();
      }) as unknown as typeof fetch,
    };
    return { around, asked, said };
  }

  function surroundingsUp() {
    const made = surroundings();
    const tool = async (args: string[]) => {
      if (args[0] === "status") {
        return {
          code: 0,
          text: JSON.stringify({ API_URL: SETTINGS.address, INBUCKET_URL: SETTINGS.inbox, PUBLISHABLE_KEY: PUBLIC_KEY }),
        };
      }
      if (String(args[args.length - 1]).includes("applied:")) {
        return { code: 0, text: " answer\n--------\n applied:0001_init,0002_save_interview\n(1 row)\n" };
      }
      return { code: 1, text: "unknown command\n" };
    };
    return { ...made, around: { ...made.around, tool } };
  }

  const COMMITTED = ["0001_init.sql", "0002_save_interview.sql"];

  describe("the command that runs the database checks, at its edges", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("fails when no check ran, and says so", async () => {
      const { around, said } = surroundingsUp();

      const answer = await runDatabaseChecks(around, COMMITTED, async () => []);

      expect(answer).toEqual({ passed: false, ran: 0, failed: [], secondTry: [], notProven: [] });
      expect(said.length).toBe(1);
      expect(said[0]).toMatch(/no database check ran/i);
      expect(said[0]).not.toMatch(/passed/i);
    });

    it("turns a test runner that cannot run into a refusal, and passes a refusal on as it is", async () => {
      const { around, said } = surroundingsUp();

      const broke = await runDatabaseChecks(around, COMMITTED, async () => {
        throw new Error("the runner could not start");
      }).catch((error: unknown) => error);
      const refused = await runDatabaseChecks(around, COMMITTED, async () => {
        throw new PracticeRefusal("stale", "made up for the test");
      }).catch((error: unknown) => error);

      expect(broke).toBeInstanceOf(PracticeRefusal);
      expect((broke as PracticeRefusal).kind).toBe("tool");
      expect((refused as PracticeRefusal).kind).toBe("stale");
      expect(said, "nothing is reported about a run that never was").toEqual([]);
    });

    it("closes a run in which something went wrong by saying first that it did not pass, and counts the checks that ran", async () => {
      const check = (name: string, passed: boolean) => ({ name, file: "src/lib/made-up.database.test.ts", passed, tries: 1 });
      const trouble = { file: "src/lib/other.database.test.ts", what: "the file could not load: made up for the test" };
      const closingOf = async (checks: ReturnType<typeof check>[], troubles: (typeof trouble)[]) => {
        const { around, said } = surroundingsUp();
        await runDatabaseChecks(around, COMMITTED, async () => ({ checks, troubles }));
        return said[said.length - 1];
      };

      expect(await closingOf([check("one", true), check("two", true)], [trouble])).toBe(
        "The run did not pass: 1 not proven, and 0 of 2 database checks that ran failed.",
      );
      expect(await closingOf([check("one", true), check("two", false)], [trouble, trouble])).toBe(
        "The run did not pass: 2 not proven, and 1 of 2 database checks that ran failed.",
      );
      expect(await closingOf([], [trouble])).toBe("The run did not pass: 1 not proven, and no check ran.");
      expect(await closingOf([check("one", true), check("two", true)], [])).toBe("Every database check passed (2 of 2).");
      expect(await closingOf([check("one", true), check("two", false)], [])).toBe("1 of 2 database checks failed.");
    });

  });

  describe("a run the test runner ended as failed, at its edges", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const FILE = "src/lib/made-up.database.test.ts";
    const check = (name: string, passed: boolean) => ({ name, file: FILE, passed, tries: 1, line: 5 });
    const trouble = { file: "src/lib/other.database.test.ts", what: "the file could not load: made up for the test" };
    const NOBODY_NAMED = /^not proven {2}the test runner reported that the run did not pass/;

    it("adds its own line only when nothing else says why: not beside a check that failed, nor beside something that went wrong", async () => {
      const withAFailedCheck = surroundingsUp();
      const failed = await runDatabaseChecks(withAFailedCheck.around, COMMITTED, async () => ({
        checks: [check("one", true), check("two", false)],
        troubles: [],
        runnerFailed: true,
      }));
      const withTrouble = surroundingsUp();
      const troubled = await runDatabaseChecks(withTrouble.around, COMMITTED, async () => ({
        checks: [check("one", true)],
        troubles: [trouble],
        runnerFailed: true,
      }));

      expect(failed).toEqual({ passed: false, ran: 2, failed: ["two"], secondTry: [], notProven: [] });
      expect(withAFailedCheck.said).toEqual([`failed      ${FILE}:5  two`, "1 of 2 database checks failed."]);
      expect(troubled.notProven).toEqual([trouble.file]);
      expect(withTrouble.said.filter((line) => NOBODY_NAMED.test(line))).toEqual([]);
    });

    it("hands its own line back as not proven with no file, and says nothing more than today when no check ran", async () => {
      const allPassed = surroundingsUp();
      const answer = await runDatabaseChecks(allPassed.around, COMMITTED, async () => ({
        checks: [check("one", true), check("two", true)],
        troubles: [],
        runnerFailed: true,
      }));
      const noneRan = surroundingsUp();
      const nothing = await runDatabaseChecks(noneRan.around, COMMITTED, async () => ({ checks: [], troubles: [], runnerFailed: true }));

      expect(answer).toEqual({ passed: false, ran: 2, failed: [], secondTry: [], notProven: [""] });
      expect(allPassed.said.length).toBe(2);
      expect(allPassed.said[0]).toMatch(NOBODY_NAMED);
      expect(allPassed.said[1]).toBe("The run did not pass: 1 not proven, and 0 of 2 database checks that ran failed.");
      expect(nothing.passed).toBe(false);
      expect(noneRan.said).toEqual(["No database check ran, so nothing was proven."]);
    });

    it("is not read from a report that leaves it out, says false, or is a list alone", async () => {
      for (const report of [
        { checks: [check("one", true)], troubles: [] },
        { checks: [check("one", true)], troubles: [], runnerFailed: false },
        [check("one", true)],
      ]) {
        const { around, said } = surroundingsUp();
        const answer = await runDatabaseChecks(around, COMMITTED, async () => report);

        expect(answer.passed).toBe(true);
        expect(said).toEqual(["Every database check passed (1 of 1)."]);
      }
    });
  });
}
