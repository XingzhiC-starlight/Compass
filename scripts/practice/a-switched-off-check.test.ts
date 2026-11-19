// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDatabaseChecks } from "./commands.mjs";
import { switchedOffInFile, troublesInFile } from "./lib.mjs";

const CHECK_SWITCHED_OFF =
  'With the practice copy up, a database run in which a check is switched off in its file, or marked there as not yet written, passes, names that check on a line of its own that begins "switched off", and says in its closing line how many were switched off; a run with none switched off closes as it does today, with "Every database check passed" and the count';

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

describe("a check that is switched off, or not yet written", () => {
  const OFF = { name: "the phases > a phase past its limit is refused", file: OTHER_FILE, line: 61 };
  const NOT_YET_WRITTEN = { name: "the phases > a phase with no name is refused", file: OTHER_FILE, line: 74 };

  it(`${CHECK_SWITCHED_OFF} — one check passes beside one switched off and one not yet written: the run passes, and each of the two is named on a line of its own that begins "switched off"`, async () => {
    const { outcome, said } = await reported({ checks: [passedCheck(1)], troubles: [], switchedOff: [OFF, NOT_YET_WRITTEN] });

    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    const lines = beginning(said, "switched off");
    expect(lines.length, `one line for each of the two, each beginning "switched off" (${shown(said)})`).toBe(2);
    expect(lines.filter((line) => line.includes(OFF.name)).length, `one of them names the check that is switched off (${shown(said)})`).toBe(1);
    expect(
      lines.filter((line) => line.includes(NOT_YET_WRITTEN.name)).length,
      `the other names the check that is not yet written (${shown(said)})`,
    ).toBe(1);
    expect(outcome.value?.passed, "the run passes: a switched-off check does not keep it from passing").toBe(true);
    expect(outcome.value?.ran, "and the one check that ran is the one counted as having run").toBe(1);
  });

  it(`${CHECK_SWITCHED_OFF} — the closing line says that the check that ran passed, and that 2 were switched off`, async () => {
    const { outcome, said } = await reported({ checks: [passedCheck(1)], troubles: [], switchedOff: [OFF, NOT_YET_WRITTEN] });

    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    const closing = String(said[said.length - 1]);
    expect(closing, `the closing line says how many were switched off (${shown(said)})`).toContain("2 switched off");
    expect(closing, "and still that every check that ran passed").toContain("passed");
    expect(closing, "counting the one check that ran, and not the two that did not").toContain("(1 of 1)");
  });

  it(`${CHECK_SWITCHED_OFF} — beside a check that failed, the switched-off checks are still named, and still counted in the closing line`, async () => {
    const failedCheck = { name: SHORT_NAME, file: FILE, passed: false, tries: 1, line: 214 };
    const { outcome, said } = await reported({
      checks: [passedCheck(1), failedCheck],
      troubles: [],
      switchedOff: [OFF, NOT_YET_WRITTEN],
    });

    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    expect(outcome.value?.passed, "harness: a run with a failed check has not passed").toBe(false);
    expect(beginning(said, "switched off").length, `each switched-off check has its line (${shown(said)})`).toBe(2);
    const closing = String(said[said.length - 1]);
    expect(closing, "the closing line still says how many failed").toContain("1 of 2");
    expect(closing, `and how many were switched off (${shown(said)})`).toContain("2 switched off");
  });

  it(`${CHECK_SWITCHED_OFF} — a run with none switched off closes as it does today: one line, "Every database check passed (38 of 38)."`, async () => {
    const checks = Array.from({ length: 38 }, (_unused, index) => passedCheck(index + 1));
    const { outcome, said } = await reported({ checks, troubles: [], switchedOff: [] });

    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    expect(outcome.value?.passed, "the run passes").toBe(true);
    expect(said, "it says its closing line and nothing else, with no word of anything switched off").toEqual([
      "Every database check passed (38 of 38).",
    ]);
  });
});

{
  const CHECK_SWITCHED_OFF =
    'With the practice copy up, a database run in which a check is switched off in its file, or marked there as not yet written, passes, names that check on a line of its own that begins "switched off", and says in its closing line how many were switched off; a run with none switched off closes as it does today, with "Every database check passed" and the count. A run in which every check is switched off, so that none ran, fails as it does today, and its closing line says how many were switched off';

  const NO_CHECK_RAN = "No database check ran, so nothing was proven";

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

  const FILE = "src/lib/phases.database.test.ts";

  function switchedOff(count: number): SwitchedOff[] {
    return Array.from({ length: count }, (_unused, index) => ({
      name: `the phases > phase ${index + 1} past its limit is refused`,
      file: FILE,
      line: 40 + index * 12,
    }));
  }

  function surroundings() {
    const said: string[] = [];

    const tool = async (args: string[]): Promise<ToolAnswer> => {
      if (args[0] === "status") return statusAnswer();
      if (args[0] === "db" && args[1] === "query" && String(args[args.length - 1] ?? "").includes("applied:")) {
        return tableAnswer("applied:0001_init,0002_save_interview");
      }
      return { code: 1, text: "unknown command\n" };
    };

    const request = async (): Promise<Response> =>
      new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });

    const around = {
      tool,
      say: (line: string) => {
        said.push(String(line));
      },
      settings: SETTINGS,
      linked: false,
      request: request as unknown as typeof fetch,
    };

    return { around, said };
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

  async function reported(report: RunReport) {
    const { around, said } = surroundings();
    const runTests = async () => report;
    const outcome = await trying(() => runDatabaseChecks(around, COMMITTED, runTests));
    return { outcome, said };
  }

  function shown(said: string[]): string {
    return `shown: ${JSON.stringify(said, null, 1)}`;
  }

  function closingLine(said: string[]): string {
    return String(said[said.length - 1] ?? "(nothing was said)");
  }

  describe("a run in which every check is switched off, so that none ran", () => {
    it(`${CHECK_SWITCHED_OFF} — two checks, both switched off, and none that ran: the run fails as it does today — it has not passed, no check is counted as having run, and the closing line says that no check ran and not that anything passed`, async () => {
      const today = await reported({ checks: [], troubles: [] });
      const { outcome, said } = await reported({ checks: [], troubles: [], switchedOff: switchedOff(2) });

      expect(today.outcome.threw, `harness: a run in which no check ran, and none is switched off, is answered (${told(today.outcome)})`).toBe(false);
      expect(today.outcome.value?.passed, "harness: such a run has not passed").toBe(false);
      expect(today.said, "harness: and it closes as it does today, with one line and no word of anything switched off").toEqual([`${NO_CHECK_RAN}.`]);

      expect(outcome.threw, `the command ran: every check being switched off is an answer, and not a refusal (${told(outcome)})`).toBe(false);
      expect(outcome.value?.passed, `the run has not passed: it proved nothing, though no check failed (${shown(said)})`).toBe(false);
      expect(outcome.value?.ran, "no check is counted as having run").toBe(0);
      expect(outcome.value?.failed, "and none as having failed").toEqual([]);
      const closing = closingLine(said);
      expect(closing, `the closing line says, as it does today, that no check ran (${shown(said)})`).toContain(NO_CHECK_RAN);
      expect(closing, "and does not say that anything passed: a group switched off as a whole does not read as green").not.toMatch(/passed/i);
    });

    it(`${CHECK_SWITCHED_OFF} — two checks, both switched off, and none that ran: the closing line says that 2 were switched off`, async () => {
      const { outcome, said } = await reported({ checks: [], troubles: [], switchedOff: switchedOff(2) });

      expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
      expect(outcome.value?.passed, "harness: the run has not passed").toBe(false);
      expect(closingLine(said), `the closing line says how many were switched off (${shown(said)})`).toMatch(/(?<!\d)2 switched off/);
    });

    it(`${CHECK_SWITCHED_OFF} — the number in the closing line is the number of checks that were switched off: 5 when five were, and 1 when it was the only check`, async () => {
      const five = await reported({ checks: [], troubles: [], switchedOff: switchedOff(5) });
      const one = await reported({ checks: [], troubles: [], switchedOff: switchedOff(1) });

      expect(five.outcome.threw, `the command ran (${told(five.outcome)})`).toBe(false);
      expect(one.outcome.threw, `the command ran (${told(one.outcome)})`).toBe(false);
      expect([five.outcome.value?.passed, one.outcome.value?.passed], "harness: neither run has passed").toEqual([false, false]);
      expect(closingLine(five.said), `five switched off, and the closing line says five (${shown(five.said)})`).toMatch(/(?<!\d)5 switched off/);
      expect(closingLine(one.said), `one switched off, and the closing line says one (${shown(one.said)})`).toMatch(/(?<!\d)1 switched off/);
    });
  });
}

{
  const CHECK_SWITCHED_OFF =
    'With the practice copy up, a database run in which a check is switched off in its file, or marked there as not yet written, passes, names that check on a line of its own that begins "switched off", and says in its closing line how many were switched off; a run with none switched off closes as it does today, with "Every database check passed" and the count';

  type RunnerCheck = { result: () => { state: string }; options: { mode: string }; fullName?: string; location?: { line: number } };
  type RunnerGroup = {
    errors: () => unknown[];
    children: { allTests: () => Iterable<RunnerCheck>; allSuites: () => Iterable<RunnerGroup> };
  };

  function check(fullName: string, state: string, mode: string, line: number): RunnerCheck {
    return { result: () => ({ state }), options: { mode }, fullName, location: { line } };
  }

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

  describe("the checks of a file that are switched off", () => {
    it(`${CHECK_SWITCHED_OFF} — from the test runner's report of a file: the check switched off and the one marked as not yet written are found, in the file's order, each with its name and its line; a check that passed, and one that was meant to run and was left unrun, are not`, () => {
      const report = fileOf([
        check("the phases > a phase is read with its own project alone", "passed", "run", 21),
        check("the phases > a phase past its limit is refused", "skipped", "skip", 40),
        check("the phases > a phase with no name is refused", "skipped", "todo", 58),
        check("the phases > a phase left unrun, since a step before it went wrong", "skipped", "run", 63),
      ]);

      const outcome = trying(() => switchedOffInFile(FILE, report));

      expect(outcome.threw, `the report was read (${told(outcome)})`).toBe(false);
      expect(outcome.value, "the two that are switched off, and nothing else").toEqual([
        { name: "the phases > a phase past its limit is refused", file: FILE, line: 40 },
        { name: "the phases > a phase with no name is refused", file: FILE, line: 58 },
      ]);
    });
  });
}

{
  const CHECK_SWITCHED_OFF =
    'With the practice copy up, a database run in which a check is switched off in its file, or marked there as not yet written, passes, names that check on a line of its own that begins "switched off", and says in its closing line how many were switched off; a run with none switched off closes as it does today, with "Every database check passed" and the count. A run in which every check is switched off, so that none ran, fails as it does today, and its closing line says how many were switched off. A check that switches itself off as it runs is named and counted in the same way';

  type RunnerCheck = { result: () => { state: string }; options: { mode: string }; fullName?: string; location?: { line: number } };
  type RunnerGroup = {
    errors: () => unknown[];
    children: { allTests: () => Iterable<RunnerCheck>; allSuites: () => Iterable<RunnerGroup> };
  };

  function check(fullName: string, state: string, mode: string, line: number): RunnerCheck {
    return { result: () => ({ state }), options: { mode }, fullName, location: { line } };
  }

  function fileOf(checks: RunnerCheck[]): RunnerGroup {
    const group: RunnerGroup = { errors: () => [], children: { allTests: () => checks, allSuites: () => [] } };
    return { errors: () => [], children: { allTests: () => checks, allSuites: () => (checks.length > 0 ? [group] : []) } };
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

  describe("the checks of a file that are switched off, when one switched itself off as it ran", () => {
    const passed = check("the phases > a phase is read with its own project alone", "passed", "run", 21);
    const offInItsFile = check("the phases > a phase past its limit is refused", "skipped", "skip", 40);
    const failed = check("the phases > a phase is numbered after its own project's phases", "failed", "run", 52);
    const offAsItRan = check("the phases > a phase is emailed to its owner, where the practice copy has an inbox", "skipped", "run", 58);
    const neverBegan = check("the phases > a phase left unrun, since a step before it went wrong", "skipped", "run", 63);

    const everyCheck = [passed, offInItsFile, failed, offAsItRan, neverBegan];
    const thoseThatBegan = new Set<RunnerCheck>([passed, failed, offAsItRan]);
    const began = (one: RunnerCheck): boolean => thoseThatBegan.has(one);

    it(`${CHECK_SWITCHED_OFF} — from the test runner's report of a file: a check that was meant to run, began, and ended as skipped has switched itself off, and is found among the switched-off checks with its name and its line, in the file's order; a check that never began, since a step before it went wrong, is not found among them, nor is one that passed or failed`, () => {
      const outcome = trying(() => switchedOffInFile(FILE, fileOf(everyCheck), began));

      expect(outcome.threw, `the report was read (${told(outcome)})`).toBe(false);
      expect(
        outcome.value,
        "the check switched off in its file and the check that switched itself off as it ran, in the file's order, and nothing else",
      ).toEqual([
        { name: "the phases > a phase past its limit is refused", file: FILE, line: 40 },
        { name: "the phases > a phase is emailed to its owner, where the practice copy has an inbox", file: FILE, line: 58 },
      ]);
    });

    it(`${CHECK_SWITCHED_OFF} — a file in which no mark switches anything off: the one check that switched itself off as it ran is answered, so that it does not drop out without a word`, () => {
      const outcome = trying(() => switchedOffInFile(FILE, fileOf([passed, offAsItRan]), began));

      expect(outcome.threw, `the report was read (${told(outcome)})`).toBe(false);
      expect(outcome.value, "the check that switched itself off as it ran, with its whole name and the line where it begins").toEqual([
        { name: "the phases > a phase is emailed to its owner, where the practice copy has an inbox", file: FILE, line: 58 },
      ]);
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

  describe("the checks of a file that are switched off", () => {
    const off = (fullName?: string, line?: number): Check & { fullName?: string; location?: { line: number } } => ({
      ...switchedOff(),
      fullName,
      location: line === undefined ? undefined : { line },
    });

    it("are found in a group inside a group, and answer with line 0 when the runner noted none", () => {
      const file = group([], [passed()], [group([], [off("outer > one", 12)], [group([], [off("outer > inner > two"), leftUnrun()])])]);

      expect(switchedOffInFile(A_FILE, file)).toEqual([
        { name: "outer > one", file: A_FILE, line: 12 },
        { name: "outer > inner > two", file: A_FILE, line: 0 },
      ]);
    });

    it("answers with nothing for a file in which every check ran or was left unrun by a step before it", () => {
      expect(switchedOffInFile(A_FILE, group([new Error("signing in went wrong")], [passed(), leftUnrun()]))).toEqual([]);
    });
  });

  describe("a check that began and ended as skipped", () => {
    it("is not counted among the checks a failed step left unrun: with all the others run, the step went wrong after them", () => {
      const offAsItRan = leftUnrun();
      const file = group([new Error("signing out went wrong")], [passed(), offAsItRan]);

      expect(troublesInFile(A_FILE, file, (check) => check === offAsItRan)).toEqual([
        { file: A_FILE, what: "a step after the checks went wrong: signing out went wrong" },
      ]);
      expect(troublesInFile(A_FILE, file)).toEqual([
        { file: A_FILE, what: "1 check did not run, since a step before them went wrong: signing out went wrong" },
      ]);
    });

    it("is switched off only when the runner said that it began: anything but a plain yes leaves it unrun", () => {
      const one = leftUnrun();
      const file = group([], [one]);

      expect(switchedOffInFile(A_FILE, file, () => true).length).toBe(1);
      expect(switchedOffInFile(A_FILE, file, () => false)).toEqual([]);
      expect(switchedOffInFile(A_FILE, file, (() => "yes") as unknown as () => boolean)).toEqual([]);
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

    const FILE = "src/lib/made-up.database.test.ts";

    it("names every switched-off check though none ran, counts them at the end of each closing line, and hands back its five answers alone", async () => {
      const off = (name: string, line: number) => ({ name, file: FILE, line });
      const check = (name: string, passed: boolean) => ({ name, file: FILE, passed, tries: 1 });
      const trouble = { file: "src/lib/other.database.test.ts", what: "the file could not load: made up for the test" };

      const noneRan = surroundingsUp();
      const answer = await runDatabaseChecks(noneRan.around, COMMITTED, async () => ({
        checks: [],
        troubles: [],
        switchedOff: [off("one", 4), off("two", 8)],
      }));

      expect(answer).toEqual({ passed: false, ran: 0, failed: [], secondTry: [], notProven: [] });
      expect(noneRan.said).toEqual([
        `switched off  ${FILE}:4  one`,
        `switched off  ${FILE}:8  two`,
        "No database check ran, so nothing was proven; 2 switched off.",
      ]);

      const closingOf = async (checks: ReturnType<typeof check>[], troubles: (typeof trouble)[], switchedOff: ReturnType<typeof off>[]) => {
        const { around, said } = surroundingsUp();
        await runDatabaseChecks(around, COMMITTED, async () => ({ checks, troubles, switchedOff }));
        return said[said.length - 1];
      };
      expect(await closingOf([], [trouble], [off("one", 4)])).toBe("The run did not pass: 1 not proven, and no check ran; 1 switched off.");
      expect(await closingOf([check("a", true), check("b", false)], [], [off("one", 4), off("two", 8), off("three", 9)])).toBe(
        "1 of 2 database checks failed; 3 switched off.",
      );
      expect(await closingOf([check("a", true)], [], [off("one", 4)])).toBe("Every database check that ran passed (1 of 1); 1 switched off.");
    });
  });
}
