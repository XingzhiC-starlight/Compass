// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDatabaseChecks } from "./commands.mjs";
import { cutName, forgetNetworkAttempts, switchedOffInFile, turnsAtOneLine } from "./lib.mjs";

const CHECK_FAILED_LINE =
  'The line about a database check that failed names first the file and the number of the line where the check begins in it, as "<file>:<line>", then the first 120 characters of the check\'s name — its group\'s title, then its own — followed by "…" when the name is longer; the test runner\'s own report above it keeps the whole name. Two checks of one file that failed, whose names begin with the same 120 characters, get lines that differ by that number';
const CHECK_SAME_SHAPE =
  "The line about a check that needed a second try, and the line about a check that is switched off, have that same shape: the file and the line number first, then the first 120 characters of the name";

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

const LIMIT = 120;

const GROUP = "the owner stamp, proved against the practice copy";
const LONG_NAME = `${GROUP} > The owner of a saved row is stamped by the database and never sent by the app, so that one practice account cannot write a row in the other's name — the saved row names its account`;
const SHORT_NAME = "the owner stamp > the saved row names its account";
const EXACT_NAME = `${`${GROUP} > a name that is exactly as long as the limit, and not one character longer than that, is held whole`.padEnd(LIMIT, "x").slice(0, LIMIT - 1)}x`;
const ONE_PAST_NAME = `${EXACT_NAME}y`;
const TWIN_ONE = `${LONG_NAME} — the first`;
const TWIN_TWO = `${LONG_NAME} — the second`;

function cut(name: string): string {
  return name.length > LIMIT ? `${name.slice(0, LIMIT)}…` : name;
}

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

function shapeOf(line: string | undefined, firstWords: string): { place: string; name: string } {
  if (line === undefined || !line.startsWith(firstWords)) return { place: "(no such line)", name: "(no such line)" };
  const rest = line.slice(firstWords.length).replace(/^[\s:—–-]+/, "");
  const gap = rest.search(/\s/);
  if (gap === -1) return { place: rest, name: "" };
  return { place: rest.slice(0, gap), name: rest.slice(gap).trim() };
}

describe("the line about a database check that failed", () => {
  it(`${CHECK_FAILED_LINE} — a name far past 120 characters: the line names the place first, as "<file>:<line>", then the first 120 characters of the name and "…", and nothing more`, async () => {
    const { outcome, said } = await reported({
      checks: [passedCheck(1), { name: LONG_NAME, file: FILE, passed: false, tries: 1, line: 214 }],
      troubles: [],
    });

    expect(LONG_NAME.slice(0, LIMIT).startsWith(`${GROUP} > `), "harness: the first 120 characters hold the group's title, then the check's own").toBe(
      true,
    );
    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    const lines = beginning(said, "failed");
    expect(lines.length, `one line begins "failed" (${shown(said)})`).toBe(1);
    const shape = shapeOf(lines[0], "failed");
    expect(shape.place, `the first thing the line names is the check's place (the line: ${String(lines[0])})`).toBe(`${FILE}:214`);
    expect(shape.name, "then the first 120 characters of the name, and “…”, and nothing more").toBe(`${LONG_NAME.slice(0, LIMIT)}…`);
  });

  it(`${CHECK_FAILED_LINE} — "…" follows only when the name is longer: a name of 120 characters or fewer is held whole, and one of 121 is cut`, async () => {
    const { outcome, said } = await reported({
      checks: [
        { name: SHORT_NAME, file: FILE, passed: false, tries: 1, line: 12 },
        { name: EXACT_NAME, file: FILE, passed: false, tries: 1, line: 40 },
        { name: ONE_PAST_NAME, file: FILE, passed: false, tries: 1, line: 77 },
      ],
      troubles: [],
    });

    expect([EXACT_NAME.length, ONE_PAST_NAME.length], "harness: one name is exactly at the limit, and one is a character past it").toEqual([
      LIMIT,
      LIMIT + 1,
    ]);
    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    const lines = beginning(said, "failed");
    expect(lines.length, `one line for each check that failed (${shown(said)})`).toBe(3);
    expect(
      lines.map((line) => shapeOf(line, "failed")),
      "each names its place, then its name: whole for the short one and for the one of exactly 120 characters, cut for the one of 121",
    ).toEqual([
      { place: `${FILE}:12`, name: SHORT_NAME },
      { place: `${FILE}:40`, name: EXACT_NAME },
      { place: `${FILE}:77`, name: `${EXACT_NAME}…` },
    ]);
  });

  it(`${CHECK_FAILED_LINE} — two checks of one file whose names begin with the same 120 characters: their lines differ by the line number, and by nothing else`, async () => {
    const { outcome, said } = await reported({
      checks: [
        { name: TWIN_ONE, file: FILE, passed: false, tries: 1, line: 31 },
        { name: TWIN_TWO, file: FILE, passed: false, tries: 1, line: 57 },
      ],
      troubles: [],
    });

    expect(TWIN_ONE.slice(0, LIMIT), "harness: the two names begin with the same 120 characters").toBe(TWIN_TWO.slice(0, LIMIT));
    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    const lines = beginning(said, "failed");
    expect(lines.length, `one line for each check that failed (${shown(said)})`).toBe(2);
    expect(lines[0], "the two lines are not the same line").not.toBe(lines[1]);
    expect(
      lines.map((line) => shapeOf(line, "failed")),
      "each line points at its own check by the line number, and holds the same cut name",
    ).toEqual([
      { place: `${FILE}:31`, name: cut(TWIN_ONE) },
      { place: `${FILE}:57`, name: cut(TWIN_TWO) },
    ]);
  });
});

describe("the lines about a second try and about a switched-off check", () => {
  it(`${CHECK_SAME_SHAPE} — a check that needed a second try, whether it then passed or failed: the place first, then the first 120 characters of the name`, async () => {
    const { outcome, said, handed } = await reported(
      {
        checks: [
          passedCheck(1),
          { name: LONG_NAME, file: FILE, passed: true, tries: 2, line: 88 },
          { name: SHORT_NAME, file: OTHER_FILE, passed: false, tries: 2, line: 140 },
        ],
        troubles: [],
      },
      { secondTry: true },
    );

    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    expect(handed, "harness: the test runner was told to try a failed check once more").toEqual([{ secondTry: true }]);
    const lines = beginning(said, "second try");
    expect(lines.length, `one line for each check that was tried a second time (${shown(said)})`).toBe(2);
    expect(
      lines.map((line) => shapeOf(line, "second try")),
      "each names the check's place first, then its name, cut when it is longer than 120 characters",
    ).toEqual([
      { place: `${FILE}:88`, name: `${LONG_NAME.slice(0, LIMIT)}…` },
      { place: `${OTHER_FILE}:140`, name: SHORT_NAME },
    ]);
  });

  it(`${CHECK_SAME_SHAPE} — a check that is switched off: the place first, then the first 120 characters of the name`, async () => {
    const { outcome, said } = await reported({
      checks: [passedCheck(1)],
      troubles: [],
      switchedOff: [
        { name: LONG_NAME, file: FILE, line: 301 },
        { name: SHORT_NAME, file: OTHER_FILE, line: 9 },
      ],
    });

    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    const lines = beginning(said, "switched off");
    expect(lines.length, `one line for each check that is switched off (${shown(said)})`).toBe(2);
    expect(
      lines.map((line) => shapeOf(line, "switched off")),
      "each names the check's place first, then its name, cut when it is longer than 120 characters",
    ).toEqual([
      { place: `${FILE}:301`, name: `${LONG_NAME.slice(0, LIMIT)}…` },
      { place: `${OTHER_FILE}:9`, name: SHORT_NAME },
    ]);
  });
});

{
  const CHECK_FAILED_LINE =
    'The line about a database check that failed names first the file and the number of the line where the check begins in it, as "<file>:<line>", then the first 120 characters of the check\'s name — its group\'s title, then its own — followed by "…" when the name is longer; the test runner\'s own report above it keeps the whole name. Two checks of one file that failed, whose names begin with the same 120 characters, get lines that differ by that number. Checks that begin at one line of a file, and whose lines would otherwise read the same, each say which of them they are, as "(2 of 3 at this line)", counted in the file\'s order';

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

  type Turn = { nth: number; of: number };
  type CheckReport = { name: string; file: string; passed: boolean; tries: number; line?: number; turn?: Turn };
  type SwitchedOff = { name: string; file: string; line?: number; turn?: Turn };
  type Trouble = { file: string; what: string };
  type RunReport = { checks: CheckReport[]; troubles: Trouble[]; switchedOff?: SwitchedOff[]; runnerFailed?: boolean };

  const FILE = "src/lib/limits.database.test.ts";
  const OTHER_FILE = "src/lib/phases.database.test.ts";

  function passedCheck(number: number): CheckReport {
    return { name: `the phases > phase ${number} is read with its own project alone`, file: OTHER_FILE, passed: true, tries: 1, line: 20 + number };
  }

  const LIMIT = 120;

  const GROUP = "the limits, proved against the practice copy, one case for each kind of rule the database keeps";
  const TABLE_TITLE = "a value one step past its limit is refused by the database and nothing of it is kept, whatever the seam sent";
  const CASE_ONE = `${GROUP} > ${TABLE_TITLE} — a name past its limit`;
  const CASE_TWO = `${GROUP} > ${TABLE_TITLE} — a fraction of a day`;
  const CASE_THREE = `${GROUP} > ${TABLE_TITLE} — a progress of 101`;
  const TABLE_LINE = 8;

  const LOOP_NAME = "the limits > a value past its limit is refused";
  const LOOP_LINE = 31;

  function cut(name: string): string {
    return name.length > LIMIT ? `${name.slice(0, LIMIT)}…` : name;
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

  async function reported(report: RunReport, options?: { secondTry: boolean }) {
    const { around, said } = surroundings();
    const runTests = async () => report;
    const outcome = await trying(() =>
      options ? runDatabaseChecks(around, COMMITTED, runTests, options) : runDatabaseChecks(around, COMMITTED, runTests),
    );
    return { outcome, said };
  }

  function shown(said: string[]): string {
    return `shown: ${JSON.stringify(said, null, 1)}`;
  }

  function beginning(said: string[], words: string): string[] {
    return said.filter((line) => line.startsWith(words));
  }

  const SAYS_NOTHING_OF_IT = "(the line does not end by saying which of them it is)";

  function read(line: string | undefined, firstWords: string): { place: string; name: string; which: string } {
    if (line === undefined || !line.startsWith(firstWords)) return { place: "(no such line)", name: "(no such line)", which: "(no such line)" };
    const rest = line.slice(firstWords.length).replace(/^[\s:—–-]+/, "");
    const gap = rest.search(/\s/);
    const place = gap === -1 ? rest : rest.slice(0, gap);
    const afterPlace = gap === -1 ? "" : rest.slice(gap).trim();
    const ending = /^(.*?)\s+(\(\d+ of \d+ at this line\))$/.exec(afterPlace);
    if (!ending) return { place, name: afterPlace, which: SAYS_NOTHING_OF_IT };
    return { place, name: String(ending[1]), which: String(ending[2]) };
  }

  describe("the lines about checks that begin at one line of a file", () => {
    function caseAt(name: string, nth: number, passed: boolean, tries = 1): CheckReport {
      return { name, file: FILE, passed, tries, line: TABLE_LINE, turn: { nth, of: 3 } };
    }

    it(`${CHECK_FAILED_LINE} — three checks made by a table of cases, all three failed: their lines name one place and the same 120 characters of name, and each ends by saying which of the three it is — "(1 of 3 at this line)", "(2 of 3 at this line)", "(3 of 3 at this line)" — so that no two lines read the same`, async () => {
      const { outcome, said } = await reported({
        checks: [passedCheck(1), caseAt(CASE_ONE, 1, false), caseAt(CASE_TWO, 2, false), caseAt(CASE_THREE, 3, false)],
        troubles: [],
      });

      expect(
        [CASE_TWO.slice(0, LIMIT), CASE_THREE.slice(0, LIMIT)],
        "harness: the three names begin with the same 120 characters, and differ only past them",
      ).toEqual([CASE_ONE.slice(0, LIMIT), CASE_ONE.slice(0, LIMIT)]);
      expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
      const lines = beginning(said, "failed");
      expect(lines.length, `one line for each check that failed (${shown(said)})`).toBe(3);
      expect(
        lines.map((line) => read(line, "failed")),
        `each line names the place, then the cut name, and then says which of the three checks at that line it is (${shown(said)})`,
      ).toEqual([
        { place: `${FILE}:${TABLE_LINE}`, name: cut(CASE_ONE), which: "(1 of 3 at this line)" },
        { place: `${FILE}:${TABLE_LINE}`, name: cut(CASE_ONE), which: "(2 of 3 at this line)" },
        { place: `${FILE}:${TABLE_LINE}`, name: cut(CASE_ONE), which: "(3 of 3 at this line)" },
      ]);
      expect(new Set(lines).size, "and no two of the three lines read the same").toBe(3);
    });

    it(`${CHECK_FAILED_LINE} — counted in the file's order, and not among the lines that are said: when the first and the third of three such checks failed and the second passed, their lines end "(1 of 3 at this line)" and "(3 of 3 at this line)", and no line is said about the second`, async () => {
      const { outcome, said } = await reported({
        checks: [caseAt(CASE_ONE, 1, false), caseAt(CASE_TWO, 2, true), caseAt(CASE_THREE, 3, false)],
        troubles: [],
      });

      expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
      const lines = beginning(said, "failed");
      expect(lines.length, `one line for each of the two checks that failed (${shown(said)})`).toBe(2);
      expect(
        lines.map((line) => read(line, "failed").which),
        `the first check at that line and the third, as the file holds them (${shown(said)})`,
      ).toEqual(["(1 of 3 at this line)", "(3 of 3 at this line)"]);
      expect(
        said.filter((line) => line.includes("(2 of 3 at this line)")),
        "the second passed at its first try, and has no line of its own",
      ).toEqual([]);
    });

    it(`${CHECK_FAILED_LINE} — two checks made by a loop, with one short name and one line between them: the name is held whole, with no "…", and each line ends by saying which of the two it is`, async () => {
      const { outcome, said } = await reported({
        checks: [
          { name: LOOP_NAME, file: FILE, passed: false, tries: 1, line: LOOP_LINE, turn: { nth: 1, of: 2 } },
          { name: LOOP_NAME, file: FILE, passed: false, tries: 1, line: LOOP_LINE, turn: { nth: 2, of: 2 } },
        ],
        troubles: [],
      });

      expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
      const lines = beginning(said, "failed");
      expect(lines.length, `one line for each check that failed (${shown(said)})`).toBe(2);
      expect(
        lines.map((line) => read(line, "failed")),
        `each line names the place, then the whole name, and then says which of the two checks at that line it is (${shown(said)})`,
      ).toEqual([
        { place: `${FILE}:${LOOP_LINE}`, name: LOOP_NAME, which: "(1 of 2 at this line)" },
        { place: `${FILE}:${LOOP_LINE}`, name: LOOP_NAME, which: "(2 of 2 at this line)" },
      ]);
      expect(lines[0], "and the two lines do not read the same").not.toBe(lines[1]);
    });

    it(`${CHECK_FAILED_LINE} — the line about a second try and the line about a switched-off check, for checks that begin at one line and would otherwise read the same, end in the same way`, async () => {
      const { outcome, said } = await reported(
        {
          checks: [caseAt(CASE_ONE, 1, true, 2), caseAt(CASE_TWO, 2, true), caseAt(CASE_THREE, 3, true, 2)],
          troubles: [],
          switchedOff: [
            { name: LOOP_NAME, file: FILE, line: LOOP_LINE, turn: { nth: 1, of: 2 } },
            { name: LOOP_NAME, file: FILE, line: LOOP_LINE, turn: { nth: 2, of: 2 } },
          ],
        },
        { secondTry: true },
      );

      expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
      expect(outcome.value?.passed, "harness: every check passed in the end, and a switched-off check does not keep a run from passing").toBe(true);
      expect(
        beginning(said, "second try").map((line) => read(line, "second try")),
        `the two checks that needed a second try each say which of the three checks at that line they are (${shown(said)})`,
      ).toEqual([
        { place: `${FILE}:${TABLE_LINE}`, name: cut(CASE_ONE), which: "(1 of 3 at this line)" },
        { place: `${FILE}:${TABLE_LINE}`, name: cut(CASE_ONE), which: "(3 of 3 at this line)" },
      ]);
      expect(
        beginning(said, "switched off").map((line) => read(line, "switched off")),
        `the two switched-off checks each say which of the two checks at that line they are (${shown(said)})`,
      ).toEqual([
        { place: `${FILE}:${LOOP_LINE}`, name: LOOP_NAME, which: "(1 of 2 at this line)" },
        { place: `${FILE}:${LOOP_LINE}`, name: LOOP_NAME, which: "(2 of 2 at this line)" },
      ]);
    });
  });
}

{
  const CHECK_FALSE = "A deliberately false check makes the command fail and name that check";

  const SETTINGS = {
    name: "compass-practice",
    address: "http://127.0.0.1:55321",
    inbox: "http://127.0.0.1:55324",
    app: "http://localhost:5183",
  };

  const PUBLIC_KEY = "sb_publishable_made_up_for_the_test";
  const COMMITTED = ["0001_init.sql", "0002_save_interview.sql"];

  type Outcome<T> = { threw: boolean; value?: T; error?: unknown };

  async function tryingAsync<T>(run: () => Promise<T> | T): Promise<Outcome<T>> {
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

  function forget(): void {
    try {
      forgetNetworkAttempts();
    } catch {
      /* not built yet: nothing to clear */
    }
  }

  type ToolAnswer = { code: number; text: string };

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

  const DOWN: ToolAnswer = {
    code: 1,
    text: "failed to inspect container health: Error response from daemon: No such container: supabase_db_compass-practice\n",
  };

  const CANNOT_CONNECT: ToolAnswer = {
    code: 1,
    text: "Connecting to local database...\nfailed to connect to postgres: connection refused\n",
  };

  function tableAnswer(marked: string): ToolAnswer {
    return { code: 0, text: `Connecting to local database...\n answer\n--------\n ${marked}\n(1 row)\n` };
  }

  function surroundings(script: { down?: boolean } = {}) {
    const asked: string[][] = [];
    const said: string[] = [];
    const sent: string[] = [];

    const tool = async (args: string[]): Promise<ToolAnswer> => {
      asked.push([...args]);
      const question = String(args[args.length - 1] ?? "");
      if (args[0] === "status") return script.down ? DOWN : statusAnswer();
      if (script.down) return CANNOT_CONNECT;
      if (args[0] === "db" && args[1] === "query" && question.includes("applied:")) {
        return tableAnswer("applied:0001_init,0002_save_interview");
      }
      if (args[0] === "db" && args[1] === "query" && question.includes("rows:")) {
        return tableAnswer("rows:2,0,0,0,0,0,0,0");
      }
      return { code: 1, text: "unknown command\n" };
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

  type CheckReport = { name: string; file: string; passed: boolean; tries: number };
  type Where = { address: string; publicKey: string; inbox: string };

  function runner(reports: CheckReport[]) {
    const calls: { where: unknown; options: unknown }[] = [];
    const runTests = async (where: Where, options: { secondTry: boolean }): Promise<CheckReport[]> => {
      calls.push({ where, options });
      return reports.map((report) => ({ ...report }));
    };
    return { runTests, calls };
  }

  const FILE = "src/lib/db.database.practice-copy.test.ts";

  function check(name: string, passed: boolean, tries = 1): CheckReport {
    return { name, file: FILE, passed, tries };
  }

  const OWNER = "the owner stamp > the saved row names its account";
  const CASCADE = "a deleted project > every row it owned is gone";
  const FALSE_ON_PURPOSE = "kept for proving that a failure is reported > false on purpose: expects a project that was never saved";

  function closingLine(said: string[]): string {
    return said[said.length - 1] ?? "(nothing was said)";
  }

  describe("the command that runs the database checks, reporting them", () => {
    afterEach(() => {
      forget();
    });

    it(`${CHECK_FALSE} — one false check among three: the command fails, and a line shown to the person names that check`, async () => {
      const { around, said, sent } = surroundings();
      const { runTests, calls } = runner([check(OWNER, true), check(FALSE_ON_PURPOSE, false), check(CASCADE, true)]);

      const outcome = await tryingAsync(() => runDatabaseChecks(around, COMMITTED, runTests));

      expect(outcome.threw, `a check that fails is an answer, not a refusal (${told(outcome)})`).toBe(false);
      expect(outcome.value?.passed, "the command failed").toBe(false);
      expect(outcome.value?.ran, "three checks ran").toBe(3);
      expect(outcome.value?.failed, "the false check is named as the one that failed").toEqual([FALSE_ON_PURPOSE]);
      expect(
        said.filter((line) => line.includes(FALSE_ON_PURPOSE) && /failed/i.test(line)).length,
        `one line shown to the person says the false check failed (shown: ${JSON.stringify(said)})`,
      ).toBe(1);
      expect(
        said.filter((line) => line.includes(OWNER) || line.includes(CASCADE)),
        "a check that passed is not named among the failures",
      ).toEqual([]);
      expect(closingLine(said), "the closing line says how many failed").toMatch(/\b(1|one)\b/i);
      expect(closingLine(said), "of how many").toMatch(/\b(3|three)\b/i);
      expect(closingLine(said), "and that they failed").toMatch(/fail/i);
      expect(calls.length, "the checks were run once").toBe(1);
      expect(calls[0]?.where, "handed where the practice copy is: its address, its public key and its inbox, nothing else").toEqual({
        address: SETTINGS.address,
        publicKey: PUBLIC_KEY,
        inbox: SETTINGS.inbox,
      });
      expect(sent, "the command itself sent nothing").toEqual([]);
    });

    it(`${CHECK_FALSE} — and it is the false check that makes it fail: with the same three checks passing, the command passes and names none`, async () => {
      const { around, said } = surroundings();
      const { runTests } = runner([check(OWNER, true), check(FALSE_ON_PURPOSE, true), check(CASCADE, true)]);

      const outcome = await tryingAsync(() => runDatabaseChecks(around, COMMITTED, runTests));

      expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
      expect(outcome.value, "every check passed, none failed and none needed a second try").toEqual({
        passed: true,
        ran: 3,
        failed: [],
        secondTry: [],
        notProven: [],
      });
      expect(said.length, "one closing line is shown, and no line for a check that passed").toBe(1);
      expect(closingLine(said), "the closing line says that every check passed").toMatch(/pass/i);
      expect(closingLine(said), "and how many ran").toMatch(/\b(3|three)\b/i);
    });
  });
}

{
  const CHECK_FAILED_LINE =
    'The line about a database check that failed names first the file and the number of the line where the check begins in it, as "<file>:<line>", then the first 120 characters of the check\'s name — its group\'s title, then its own — followed by "…" when the name is longer; the test runner\'s own report above it keeps the whole name. Two checks of one file that failed, whose names begin with the same 120 characters, get lines that differ by that number';

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

  describe("a check's name, cut to its first 120 characters", () => {
    it(`${CHECK_FAILED_LINE} — the name is cut to its first 120 characters, followed by "…", only when it is longer: 120 characters or fewer come back whole`, () => {
      const exact = "the owner stamp > a name that is exactly as long as the limit is held whole ".padEnd(119, "x") + "x";
      const onePast = `${exact}y`;
      const long = `the owner stamp > ${"the saved row names its account, and no other account can read it or write it; ".repeat(5)}`;
      const short = "the owner stamp > the saved row names its account";

      const outcome = trying(() => [cutName(long), cutName(onePast), cutName(exact), cutName(short)]);

      expect([exact.length, onePast.length, long.length > 240], "harness: a name exactly at the limit, one a character past it, and one far past it").toEqual([
        120,
        121,
        true,
      ]);
      expect(outcome.threw, `each name was cut (${told(outcome)})`).toBe(false);
      expect(outcome.value, "the first 120 characters and “…” for the two that are longer; the whole name for the two that are not").toEqual([
        `${long.slice(0, 120)}…`,
        `${exact}…`,
        exact,
        short,
      ]);
    });
  });
}

{
  type Check = { result: () => { state: string }; options: { mode: string } };
  type Group = { errors: () => unknown[]; children: { allTests: () => Check[]; allSuites: () => Group[] } };

  const passed = (): Check => ({ result: () => ({ state: "passed" }), options: { mode: "run" } });

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

  describe("a check's name, cut for a line", () => {
    it("is never cut between the two halves of one character, and takes another limit when handed one", () => {
      const name = `${"x".repeat(119)}😀 and more`;

      expect(cutName(name)).toBe(`${"x".repeat(119)}…`);
      expect(cutName("abcdef", 3)).toBe("abc…");
      expect(cutName("abc", 3)).toBe("abc");
    });
  });

  describe("which of several checks at one line a check is", () => {
    type Placed = Check & { fullName: string; location?: { line: number } };
    const at = (line: number | undefined, fullName: string, check: Check = passed()): Placed => ({
      ...check,
      fullName,
      location: line === undefined ? undefined : { line },
    });
    const long = `a group > ${"a name that every case of the table shares ".repeat(4)}`;

    it("counts the checks that share a line and the first 120 characters of name, in the file's order, whatever became of each", () => {
      const first = at(8, `${long} — the first case`);
      const second = at(8, `${long} — the second case`, switchedOff());
      const third = at(8, `${long} — the third case`);
      const alone = at(20, `${long} — at a line of its own`);

      const turns = turnsAtOneLine(group([], [first, alone], [group([], [second, third])]));

      expect([first, second, third, alone].map((check) => turns.get(check))).toEqual([
        { nth: 1, of: 3 },
        { nth: 2, of: 3 },
        { nth: 3, of: 3 },
        undefined,
      ]);
    });

    it("gives no turn to checks at one line whose cut names differ, nor to checks whose line the runner did not note", () => {
      const named = [at(8, "a group > the first of two"), at(8, "a group > the second of two")];
      const unplaced = [at(undefined, long), at(undefined, long), at(0, long), at(0, long)];

      expect(turnsAtOneLine(group([], [...named, ...unplaced])).size).toBe(0);
    });

    it("is handed on with a switched-off check, and left out of every other", () => {
      const off = [at(8, long, switchedOff()), at(8, long, switchedOff()), at(30, "a group > off at a line of its own", switchedOff())];

      expect(switchedOffInFile(A_FILE, group([], off))).toEqual([
        { name: long, file: A_FILE, line: 8, turn: { nth: 1, of: 2 } },
        { name: long, file: A_FILE, line: 8, turn: { nth: 2, of: 2 } },
        { name: "a group > off at a line of its own", file: A_FILE, line: 30 },
      ]);
      expect("turn" in switchedOffInFile(A_FILE, group([], off))[2]).toBe(false);
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

    it("names a check's place as far as it is known: the file and the line, the file alone, or the name alone", async () => {
      const { around, said } = surroundingsUp();

      await runDatabaseChecks(around, COMMITTED, async () => ({
        checks: [
          { name: "with a line", file: FILE, passed: false, tries: 1, line: 12 },
          { name: "with no line", file: FILE, passed: false, tries: 1 },
          { name: "with a line of 0", file: FILE, passed: false, tries: 1, line: 0 },
          { name: "with no file", file: "", passed: false, tries: 1, line: 7 },
        ],
        troubles: [],
      }));

      expect(said.slice(0, 4)).toEqual([
        `failed      ${FILE}:12  with a line`,
        `failed      ${FILE}  with no line`,
        `failed      ${FILE}  with a line of 0`,
        "failed      with no file",
      ]);
    });

    it("says its lines in one order: failed, second try, switched off, not proven, and the closing line last", async () => {
      const { around, said } = surroundingsUp();

      await runDatabaseChecks(around, COMMITTED, async () => ({
        checks: [{ name: "one", file: FILE, passed: false, tries: 2, line: 3 }],
        troubles: [{ file: "src/lib/other.database.test.ts", what: "the file could not load: made up for the test" }],
        switchedOff: [{ name: "two", file: FILE, line: 9 }],
      }));

      expect(said).toEqual([
        `failed      ${FILE}:3  one`,
        `second try  ${FILE}:3  one`,
        `switched off  ${FILE}:9  two`,
        "not proven  src/lib/other.database.test.ts: the file could not load: made up for the test",
        "The run did not pass: 1 not proven, and 1 of 1 database checks that ran failed; 1 switched off.",
      ]);
    });

  });

  describe("the ending that says which check of several at one line a line is about, at its edges", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const FILE = "src/lib/made-up.database.test.ts";

    it("is said only for a turn that makes sense: whole numbers, the first at least 1 and no greater than the second", async () => {
      const { around, said } = surroundingsUp();
      const failed = (name: string, turn: unknown) => ({ name, file: FILE, passed: false, tries: 1, line: 8, turn });

      await runDatabaseChecks(around, COMMITTED, async () => ({
        checks: [
          failed("the last of two", { nth: 2, of: 2 }),
          failed("no first", { nth: 0, of: 2 }),
          failed("past the last", { nth: 3, of: 2 }),
          failed("not whole", { nth: 1.5, of: 2 }),
          failed("not numbers", { nth: "1", of: "2" }),
          failed("empty", {}),
        ] as never,
        troubles: [],
      }));

      expect(said.slice(0, 6)).toEqual([
        `failed      ${FILE}:8  the last of two (2 of 2 at this line)`,
        `failed      ${FILE}:8  no first`,
        `failed      ${FILE}:8  past the last`,
        `failed      ${FILE}:8  not whole`,
        `failed      ${FILE}:8  not numbers`,
        `failed      ${FILE}:8  empty`,
      ]);
    });
  });
}
