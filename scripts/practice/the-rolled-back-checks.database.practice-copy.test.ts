import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { practiceAccounts, realSurroundings, rolledBackChecks } from "./cli.mjs";
import { remake, runRolledBackChecks } from "./commands.mjs";
import * as cli from "./cli.mjs";
import * as lib from "./lib.mjs";

const SAYS_MARKER =
  "The line about such a check begins with the marker ROWS-LEFT-BEHIND, which is what a person or an agent searches for";
const SAYS_NO_OTHER = "No other line a practice command says begins with it, whatever a check's name or closing message holds";
const SAYS_WHAT_IS_KNOWN =
  "Of a check that ended without raising while the row totals are the same before and after it, the command says what is known, that nothing was undone and that the totals are the same, and does not guess at rows";
const SAYS_HOW_TO_REMAKE = "Of that check, and of one that left rows behind, it says how to remake the practice copy";

const MARKER = "ROWS-LEFT-BEHIND";
const HOW_TO_REMAKE = "npm run practice:reset";

const WRONG_EXPECTATION = "scripts/practice/fixtures/wrong-expectation.sql";
const ENDS_WITHOUT_RAISING = "scripts/practice/fixtures/ends-without-raising.sql";
const LEAVES_A_ROW = "scripts/practice/fixtures/leaves-a-row.sql";

const FILES = [WRONG_EXPECTATION, ENDS_WITHOUT_RAISING, LEAVES_A_ROW];
const PLACE = { wrongExpectation: 0, endsWithoutRaising: 1, leavesARow: 2 };

const A_RUN_AND_A_REMAKE = 360_000;

type Outcome<T> = { threw: boolean; value?: T; error?: unknown };

async function trying<T>(run: () => Promise<T> | T): Promise<Outcome<T>> {
  try {
    return { threw: false, value: await run() };
  } catch (error) {
    return { threw: true, error };
  }
}

function told(outcome: Outcome<unknown> | undefined): string {
  if (!outcome) return "the command was never run";
  if (outcome.threw) return `it threw: ${String(outcome.error)}`;
  try {
    return `it answered: ${JSON.stringify(outcome.value)}`;
  } catch {
    return `it answered: ${String(outcome.value)}`;
  }
}

type ToolAnswer = { code: number; text: string };
type Surroundings = ReturnType<typeof realSurroundings>;
type Asked = { args: string[]; answer: ToolAnswer };

function keepingARecord(surroundings: Surroundings) {
  const said: string[] = [];
  const asked: Asked[] = [];

  const around: Surroundings = {
    ...surroundings,
    say: (line: string) => {
      said.push(String(line));
    },
    tool: async (args: string[]) => {
      const answer = await surroundings.tool(args);
      asked.push({ args: [...args], answer });
      return answer;
    },
  };

  return { around, said, asked };
}

function answerToRunning(asked: Asked[], file: string): ToolAnswer | undefined {
  return asked.find((one) => JSON.stringify(one.args) === JSON.stringify(["db", "query", "--local", "-f", file]))?.answer;
}

function totalsAround(asked: Asked[], file: string): { before: string; after: string } {
  const totals = (one: Asked | undefined): string => /rows:(\d+(?:,\d+)*)/.exec(String(one?.answer.text))?.[1] ?? "(not counted)";
  const counts = (one: Asked): boolean => !one.args.includes("-f") && String(one.args[one.args.length - 1]).includes("rows:");
  const place = asked.findIndex((one) => JSON.stringify(one.args) === JSON.stringify(["db", "query", "--local", "-f", file]));
  if (place < 0) return { before: "(the file was not run)", after: "(the file was not run)" };
  return {
    before: totals(asked.slice(0, place).reverse().find(counts)),
    after: totals(asked.slice(place + 1).find(counts)),
  };
}

const COUNTED = ["auth.users", "projects", "phases", "learning_items", "daily_tasks", "thoughts", "thought_groups", "time_sessions"];

const HOW_MANY_ROWS = [
  "select 'counted:' || concat_ws(',',",
  [
    "(select count(*) from auth.users)",
    "(select count(*) from public.projects)",
    "(select count(*) from public.phases)",
    "(select count(*) from public.learning_items)",
    "(select count(*) from public.daily_tasks)",
    "(select count(*) from public.thoughts)",
    "(select count(*) from public.thought_groups)",
    "(select count(*) from public.time_sessions)",
  ].join(", "),
  ") as answer",
].join(" ");

type Counted = Record<string, number> | string;

async function counted(): Promise<Counted> {
  const outcome = await trying(() => realSurroundings().tool(["db", "query", "--local", HOW_MANY_ROWS]));
  if (outcome.threw) return `(the rows could not be counted: ${String(outcome.error)})`;
  const found = /counted:(\d+(?:,\d+)*)/.exec(String(outcome.value?.text));
  const numbers = found ? found[1].split(",").map(Number) : [];
  if (numbers.length !== COUNTED.length) return `(the rows could not be counted: the tool ended with code ${String(outcome.value?.code)})`;
  return Object.fromEntries(COUNTED.map((name, index) => [name, numbers[index]]));
}

function withOneProjectMore(rows: Counted): Counted {
  return typeof rows === "string" ? rows : { ...rows, projects: rows.projects + 1 };
}

function asJustRemade(): Record<string, number> {
  return Object.fromEntries(COUNTED.map((name) => [name, name === "auth.users" ? practiceAccounts().length : 0]));
}

function seen(said: string[]): string[] {
  return said.flatMap((line) => line.split(/\r?\n/));
}

function foundByTheMarker(said: string[]): string[] {
  return seen(said).filter((line) => line.startsWith(MARKER));
}

function lineAbout(said: string[], place: number): string {
  return String(said[place] ?? "(no line was said about this check)").split(/\r?\n/)[0];
}

function saidAbout(said: string[], place: number): string {
  return String(said[place] ?? "(no line was said about this check)");
}

function shown(said: string[]): string {
  return `shown: ${JSON.stringify(said)}`;
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\s+[—–-]\s+|\r?\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function clauses(text: string): string[] {
  return sentences(text)
    .flatMap((part) => part.split(/,\s+/))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function saysNothingWasUndone(text: string): boolean {
  return sentences(text).some(
    (part) =>
      /\b(undone|undo|undid|undoes|rolled\s+back|roll\s+back|rolled\s+\w+\s+back|rollback)\b/i.test(part) &&
      /\b(nothing|not|never|no|none)\b|n't\b/i.test(part),
  );
}

function saysTheTotalsAreTheSame(text: string): boolean {
  return sentences(text).some(
    (part) =>
      /\b(totals?|counts?|numbers?)\b/i.test(part) &&
      /\b(same|unchanged|equal|identical|no\s+change|did\s+not\s+change|not\s+changed|no\s+different)\b/i.test(part),
  );
}

function guessesAtRows(text: string): string[] {
  return clauses(text).filter(
    (part) =>
      /\brows?\b/i.test(part) && /\b(may|might|could|perhaps|possibly|probably|presumably|maybe|likely)\b/i.test(part),
  );
}

type Ran = { held: boolean; checks: { file: string; held: boolean; message: string }[] };

let outcome: Outcome<Ran> | undefined;
let said: string[] = [];
let asked: Asked[] = [];
let before: Counted = "(the rows were never counted)";
let after: Counted = "(the rows were never counted)";
let mended: Outcome<unknown> | undefined;
let afterMending: Counted = "(the rows were never counted)";

beforeAll(async () => {
  const record = keepingARecord(realSurroundings());
  said = record.said;
  asked = record.asked;
  try {
    before = await counted();
    outcome = await trying(() => runRolledBackChecks(record.around, FILES));
    after = await counted();
  } finally {
    mended = await trying(() => remake({ ...realSurroundings(), say: () => {} }, practiceAccounts()));
    afterMending = await counted();
  }
}, A_RUN_AND_A_REMAKE);

function expectReallyRun(): void {
  expect(outcome?.threw, `the command ran, for real (${told(outcome)})`).toBe(false);
  expect(said.length, `one line about each check and one closing line are shown (${shown(said)})`).toBe(FILES.length + 1);
}

function expectARowWasReallyLeft(): void {
  expect(answerToRunning(asked, LEAVES_A_ROW)?.code, "harness: the check that leaves a row was run for real, and ended without raising").toBe(
    0,
  );
  expect(typeof before, `harness: the rows could be counted before the run (${String(before)})`).toBe("object");
  expect(after, "harness: a row really was left — after the run the practice copy holds one project more than before").toEqual(
    withOneProjectMore(before),
  );
}

function expectEndedWithoutRaisingAndSameTotals(): void {
  const totals = totalsAround(asked, ENDS_WITHOUT_RAISING);
  expect(answerToRunning(asked, ENDS_WITHOUT_RAISING)?.code, "harness: the check was run for real, and ended without raising").toBe(0);
  expect(totals.before, "harness: the command counted the rows before it").toMatch(/^\d+(,\d+)*$/);
  expect(totals.after, "harness: and the totals it was told after the check are the same").toBe(totals.before);
}

function expectMended(): void {
  expect(mended?.threw, `harness: the practice copy was remade after the run — if not, run "${HOW_TO_REMAKE}" (${told(mended)})`).toBe(
    false,
  );
  expect(afterMending, "harness: remade that way, the practice copy holds its accounts and no row in any table").toEqual(asJustRemade());
}

describe("the marker, on the real practice copy", () => {
  it(`${SAYS_MARKER} — run for real, the line about the check that really left a row begins with the marker`, () => {
    expectReallyRun();
    expectARowWasReallyLeft();

    expect(
      lineAbout(said, PLACE.leavesARow).startsWith(MARKER),
      `the line about the check that left a row begins with the marker (${shown(said)})`,
    ).toBe(true);
    expect(lineAbout(said, PLACE.leavesARow), "and it is the line that says, in plain words, that rows were left behind").toMatch(
      /left behind/i,
    );
  });

  it(`${SAYS_NO_OTHER} — run for real beside it, neither the check with a wrong expectation, nor the check that ended without raising, nor the closing line`, () => {
    expectReallyRun();
    expect(answerToRunning(asked, WRONG_EXPECTATION), "harness: the check with a wrong expectation was run for real").toBeDefined();
    expect(answerToRunning(asked, WRONG_EXPECTATION)?.code, "harness: and it ended by raising").not.toBe(0);
    expectEndedWithoutRaisingAndSameTotals();
    expectARowWasReallyLeft();

    expect(
      foundByTheMarker(said),
      `a search for the marker finds the line about the check that left a row, and no other (${shown(said)})`,
    ).toEqual([lineAbout(said, PLACE.leavesARow)]);
  });
});

describe("a check that ended without raising, the row totals being the same, on the real practice copy", () => {
  it(`${SAYS_WHAT_IS_KNOWN} — run for real, the line about it says that nothing was undone, and that the totals are the same`, () => {
    expectReallyRun();
    expectEndedWithoutRaisingAndSameTotals();

    const line = saidAbout(said, PLACE.endsWithoutRaising);
    expect(saysNothingWasUndone(line), `the line about it says that nothing was undone (${shown(said)})`).toBe(true);
    expect(saysTheTotalsAreTheSame(line), `and that the row totals are the same (${shown(said)})`).toBe(true);
  });

  it(`${SAYS_WHAT_IS_KNOWN} — run for real, the line about it does not guess at rows: it says neither that rows were left behind nor that they may have been`, () => {
    expectReallyRun();
    expectEndedWithoutRaisingAndSameTotals();

    const line = saidAbout(said, PLACE.endsWithoutRaising);
    const message = String(outcome?.value?.checks[PLACE.endsWithoutRaising]?.message);
    expect(guessesAtRows(line), `the parts of the line that guess at rows (${shown(said)})`).toEqual([]);
    expect(line, "the line does not say that rows were left behind").not.toMatch(/left\s+behind/i);
    expect(message, "and the message handed back for the check does not say so either").not.toMatch(/left\s+behind/i);
    expect(guessesAtRows(message), "the parts of that message that guess at rows").toEqual([]);
  });
});

describe("how to remake the practice copy, on the real practice copy", () => {
  it(`${SAYS_HOW_TO_REMAKE} — run for real, of the check that ended without raising while the row totals are the same, the line names the command that remakes it`, () => {
    expectReallyRun();
    expectEndedWithoutRaisingAndSameTotals();

    expect(saidAbout(said, PLACE.endsWithoutRaising), "the line about the check says how to remake the practice copy").toContain(
      HOW_TO_REMAKE,
    );
  });

  it(`${SAYS_HOW_TO_REMAKE} — run for real, of the check that really left a row, the line names the command that remakes it; remade that way, the practice copy holds its accounts and no row`, () => {
    expectReallyRun();
    expectARowWasReallyLeft();
    expectMended();
    expect(
      rolledBackChecks().filter((file) => FILES.includes(file)),
      "harness: the files that are wrong on purpose are kept apart from the checks the command ordinarily runs",
    ).toEqual([]);

    expect(saidAbout(said, PLACE.leavesARow), "the line about the check says how to remake the practice copy").toContain(HOW_TO_REMAKE);
  });
});

{
  const CHECK_ROLLED_BACK =
    "The setup's rolled-back check, which today can run only against the live project, runs against the practice copy by one command and reports that every check held; a deliberately wrong expectation in it is reported as the check that did not hold, and nothing is left behind either way";

  const SETUP_CHECK = "supabase/checks/0002_save_interview.sql";
  const WRONG_EXPECTATION = "scripts/practice/fixtures/wrong-expectation.sql";
  const WRONG_EXPECTATION_BEGINS = "wrong-expectation check 1";

  const A_FEW_CALLS = 120_000;

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

  type ToolAnswer = { code: number; text: string };
  type Surroundings = ReturnType<typeof realSurroundings>;

  function keepingARecord(surroundings: Surroundings) {
    const said: string[] = [];
    const asked: { args: string[]; answer: ToolAnswer }[] = [];
    const sent: string[] = [];

    const around: Surroundings = {
      ...surroundings,
      say: (line: string) => {
        said.push(String(line));
      },
      tool: async (args: string[]) => {
        const answer = await surroundings.tool(args);
        asked.push({ args: [...args], answer });
        return answer;
      },
      request: (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        sent.push(input instanceof Request ? input.url : String(input));
        return surroundings.request(input, init);
      }) as typeof fetch,
    };

    return { around, said, asked, sent };
  }

  const COUNTED = ["auth.users", "projects", "phases", "learning_items", "daily_tasks", "thoughts", "thought_groups", "time_sessions"];

  const HOW_MANY_ROWS = [
    "select 'counted:' || concat_ws(',',",
    [
      "(select count(*) from auth.users)",
      "(select count(*) from public.projects)",
      "(select count(*) from public.phases)",
      "(select count(*) from public.learning_items)",
      "(select count(*) from public.daily_tasks)",
      "(select count(*) from public.thoughts)",
      "(select count(*) from public.thought_groups)",
      "(select count(*) from public.time_sessions)",
    ].join(", "),
    ") as answer",
  ].join(" ");

  async function counted(): Promise<Record<string, number> | string> {
    const outcome = await trying(() => realSurroundings().tool(["db", "query", "--local", HOW_MANY_ROWS]));
    if (outcome.threw) return `(the rows could not be counted: ${String(outcome.error)})`;
    const found = /counted:(\d+(?:,\d+)*)/.exec(String(outcome.value?.text));
    const numbers = found ? found[1].split(",").map(Number) : [];
    if (numbers.length !== COUNTED.length) return `(the rows could not be counted: the tool ended with code ${String(outcome.value?.code)})`;
    return Object.fromEntries(COUNTED.map((name, index) => [name, numbers[index]]));
  }

  function ranTheFile(asked: { args: string[] }[], file: string): boolean {
    return asked.some((one) => JSON.stringify(one.args) === JSON.stringify(["db", "query", "--local", "-f", file]));
  }

  describe("the rolled-back check, run against the real practice copy", () => {
    it(
      `${CHECK_ROLLED_BACK} — run for real, every check held, and the practice copy holds the same rows as before`,
      async () => {
        const { around, said, asked } = keepingARecord(realSurroundings());
        const files = rolledBackChecks();
        expect(files, "the setup's rolled-back check is among the checks the command runs").toContain(SETUP_CHECK);
        expect(files, "and the one that is wrong on purpose is not").not.toContain(WRONG_EXPECTATION);

        const before = await counted();
        const outcome = await trying(() => runRolledBackChecks(around, files));
        const after = await counted();

        expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
        expect(ranTheFile(asked, SETUP_CHECK), "the setup's check was run against the practice copy").toBe(true);
        expect(
          outcome.value?.checks.map((check) => ({ file: check.file, held: check.held })),
          `each check is reported as held (${told(outcome)})`,
        ).toEqual(files.map((file) => ({ file, held: true })));
        expect(outcome.value?.held, "every check held").toBe(true);
        expect(said.length, `one line for each check and one closing line are shown (shown: ${JSON.stringify(said)})`).toBe(files.length + 1);
        for (const line of said) expect(line, "each line says that it held").toMatch(/held/i);
        expect(
          outcome.value?.checks.filter((check) => /left behind/i.test(check.message)).map((check) => check.file),
          "checks reported as having left rows behind",
        ).toEqual([]);

        expect(typeof before, `harness: the rows could be counted before the command (${String(before)})`).toBe("object");
        expect(after, "nothing is left behind: the practice copy holds the same rows as before").toEqual(before);
      },
      A_FEW_CALLS,
    );

    it(
      `${CHECK_ROLLED_BACK} — a deliberately wrong expectation, run for real, is reported as the check that did not hold, and the practice copy holds the same rows as before`,
      async () => {
        const { around, said, asked } = keepingARecord(realSurroundings());
        const files = [...rolledBackChecks(), WRONG_EXPECTATION];

        const before = await counted();
        const outcome = await trying(() => runRolledBackChecks(around, files));
        const after = await counted();

        expect(outcome.threw, `a check that does not hold is an answer, not a refusal (${told(outcome)})`).toBe(false);
        expect(ranTheFile(asked, WRONG_EXPECTATION), "the check with the wrong expectation was run against the practice copy").toBe(true);

        const wrong = outcome.value?.checks.find((check) => check.file === WRONG_EXPECTATION);
        expect(wrong?.held, `the check with the wrong expectation did not hold (${told(outcome)})`).toBe(false);
        expect(
          String(wrong?.message).startsWith(WRONG_EXPECTATION_BEGINS),
          `and it is reported by the expectation that failed (reported: ${String(wrong?.message)})`,
        ).toBe(true);
        expect(
          outcome.value?.checks.filter((check) => check.file !== WRONG_EXPECTATION).map((check) => check.held),
          "the checks beside it held",
        ).toEqual(rolledBackChecks().map(() => true));
        expect(outcome.value?.held, "so not every check held").toBe(false);

        expect(
          said.filter((line) => line.includes(WRONG_EXPECTATION_BEGINS)).length,
          `one line shown to the person names the check that did not hold (shown: ${JSON.stringify(said)})`,
        ).toBe(1);
        expect(said[said.length - 1], "the closing line says how many did not hold").toMatch(/\b(1|one)\b/i);
        expect(
          outcome.value?.checks.filter((check) => /left behind/i.test(check.message)).map((check) => check.file),
          "checks reported as having left rows behind",
        ).toEqual([]);

        expect(typeof before, `harness: the rows could be counted before the command (${String(before)})`).toBe("object");
        expect(after, "nothing is left behind: the practice copy holds the same rows as before").toEqual(before);
      },
      A_FEW_CALLS,
    );
  });
}

{
  const CHECK_1 =
    'With assertions switched off for one run, every rolled-back check is reported as not held, each with exactly the message "the check cannot run: plpgsql.check_asserts is off, so no assertion would be read", and the closing line says that all of them did not hold';
  const CHECK_2 = "That run leaves the practice copy holding the same rows as before it";
  const CHECK_3 =
    "Straight after that run, an ordinary run reports every rolled-back check as held, and a new connection to the practice copy finds assertions on";
  const CHECK_4 = "A rolled-back check without the safety catch fails the database checks, which name that check";

  const CATCH = "the check cannot run: plpgsql.check_asserts is off, so no assertion would be read";

  const TODAYS_CHECKS = ["supabase/checks/0001_init.sql", "supabase/checks/0002_save_interview.sql"];

  const WITHOUT_THE_CATCH = "scripts/practice/fixtures/without-the-catch.sql";
  const WITHOUT_THE_CATCH_BEGINS = "without-the-catch check 1";

  const SEVERAL_RUNS = 360_000;

  type Surroundings = ReturnType<typeof realSurroundings>;
  type CheckRun = { file: string; held: boolean; message: string };
  type Ran = { held: boolean; checks: CheckRun[] };
  type Judged = { caught: boolean; uncaught: { file: string; said: string }[] };

  const withAssertionsOff = (cli as unknown as { withAssertionsOff: (around: Surroundings) => Surroundings }).withAssertionsOff;
  const judgeCatches = (lib as unknown as { judgeCatches: (checks: CheckRun[]) => Judged }).judgeCatches;

  type Outcome<T> = { threw: boolean; value?: T; error?: unknown };

  async function trying<T>(run: () => Promise<T> | T): Promise<Outcome<T>> {
    try {
      return { threw: false, value: await run() };
    } catch (error) {
      return { threw: true, error };
    }
  }

  function told(outcome: Outcome<unknown> | undefined): string {
    if (!outcome) return "it was never done";
    if (outcome.threw) return `it threw: ${String(outcome.error)}`;
    try {
      return `it answered: ${JSON.stringify(outcome.value)}`;
    } catch {
      return `it answered: ${String(outcome.value)}`;
    }
  }

  function keepingWhatIsSaid(surroundings: Surroundings): { around: Surroundings; said: string[] } {
    const said: string[] = [];
    return {
      around: {
        ...surroundings,
        say: (line: string) => {
          said.push(String(line));
        },
      },
      said,
    };
  }

  function assertionsOff(): { around?: Surroundings; said: string[]; made: Outcome<Surroundings> } {
    const said: string[] = [];
    let made: Outcome<Surroundings>;
    try {
      made = { threw: false, value: withAssertionsOff(realSurroundings()) };
    } catch (error) {
      made = { threw: true, error };
    }
    if (made.threw || !made.value) return { said, made };
    const around: Surroundings = {
      ...made.value,
      say: (line: string) => {
        said.push(String(line));
      },
    };
    return { around, said, made };
  }

  const ARE_ASSERTIONS_ON = "select 'asserts:' || coalesce(current_setting('plpgsql.check_asserts', true), '(not set)') as answer";

  async function assertionsAsked(tool: Surroundings["tool"] | undefined): Promise<string> {
    if (!tool) return "(no tool to ask)";
    const outcome = await trying(() => tool(["db", "query", "--local", ARE_ASSERTIONS_ON]));
    if (outcome.threw) return `(could not ask: ${String(outcome.error)})`;
    return /asserts:(\S+)/.exec(String(outcome.value?.text))?.[1] ?? `(no answer: the tool ended with code ${String(outcome.value?.code)})`;
  }

  const COUNTED = ["auth.users", "projects", "phases", "learning_items", "daily_tasks", "thoughts", "thought_groups", "time_sessions"];

  const HOW_MANY_ROWS = [
    "select 'counted:' || concat_ws(',',",
    [
      "(select count(*) from auth.users)",
      "(select count(*) from public.projects)",
      "(select count(*) from public.phases)",
      "(select count(*) from public.learning_items)",
      "(select count(*) from public.daily_tasks)",
      "(select count(*) from public.thoughts)",
      "(select count(*) from public.thought_groups)",
      "(select count(*) from public.time_sessions)",
    ].join(", "),
    ") as answer",
  ].join(" ");

  type Counted = Record<string, number> | string;

  async function counted(): Promise<Counted> {
    const outcome = await trying(() => realSurroundings().tool(["db", "query", "--local", HOW_MANY_ROWS]));
    if (outcome.threw) return `(the rows could not be counted: ${String(outcome.error)})`;
    const found = /counted:(\d+(?:,\d+)*)/.exec(String(outcome.value?.text));
    const numbers = found ? found[1].split(",").map(Number) : [];
    if (numbers.length !== COUNTED.length) return `(the rows could not be counted: the tool ended with code ${String(outcome.value?.code)})`;
    return Object.fromEntries(COUNTED.map((name, index) => [name, numbers[index]]));
  }

  function shown(said: string[]): string {
    return `shown: ${JSON.stringify(said)}`;
  }

  const NUMBER_WORDS: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };

  function countsIn(line: string): number[] {
    const found: number[] = [];
    for (const match of line.matchAll(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi)) {
      const word = match[1].toLowerCase();
      found.push(word in NUMBER_WORDS ? NUMBER_WORDS[word] : Number(word));
    }
    return found;
  }

  function saysDidNotHold(line: string): boolean {
    return /\b(did\s+not|didn['’]t|do\s+not|don['’]t)\s+hold\b|\bnot\s+held\b|\bfailed\s+to\s+hold\b/i.test(line);
  }

  let files: string[] = [];
  let before: Counted = "(the rows were never counted)";
  let assertionsDuringTheRun = "(never asked)";
  let offRun: Outcome<Ran> | undefined;
  let offMade: Outcome<Surroundings> | undefined;
  let offSaid: string[] = [];
  let after: Counted = "(the rows were never counted)";
  let assertionsAfterwards = "(never asked)";
  let ordinaryRun: Outcome<Ran> | undefined;
  let ordinarySaid: string[] = [];
  let withoutTheCatchOn: Outcome<Ran> | undefined;
  let withoutTheCatchOff: Outcome<Ran> | undefined;

  let theRunsMade: Promise<void> | undefined;

  function theRuns(): Promise<void> {
    theRunsMade ??= (async () => {
      files = rolledBackChecks();
      before = await counted();

      const off = assertionsOff();
      offMade = off.made;
      offSaid = off.said;
      assertionsDuringTheRun = await assertionsAsked(off.around?.tool);
      offRun = off.around ? await trying(() => runRolledBackChecks(off.around as Surroundings, files)) : undefined;
      after = await counted();

      assertionsAfterwards = await assertionsAsked(realSurroundings().tool);
      const ordinary = keepingWhatIsSaid(realSurroundings());
      ordinarySaid = ordinary.said;
      ordinaryRun = await trying(() => runRolledBackChecks(ordinary.around, files));

      withoutTheCatchOn = await trying(() => runRolledBackChecks(keepingWhatIsSaid(realSurroundings()).around, [WITHOUT_THE_CATCH]));
      const offAgain = assertionsOff();
      withoutTheCatchOff = offAgain.around
        ? await trying(() => runRolledBackChecks(offAgain.around as Surroundings, [...files, WITHOUT_THE_CATCH]))
        : undefined;
    })();
    return theRunsMade;
  }

  function expectARunWithAssertionsOff(): void {
    expect(offMade?.threw, `harness: surroundings with assertions off were made (${told(offMade)})`).toBe(false);
    expect(assertionsDuringTheRun, "harness: on the tool's connections for that run, assertions are off").toBe("off");
    expect(offRun?.threw, `harness: the command ran with them (${told(offRun)})`).toBe(false);
  }

  describe("every rolled-back check, run with assertions switched off, refuses", () => {
    beforeAll(() => theRuns(), SEVERAL_RUNS);

    it(`${CHECK_1} — every rolled-back check there is is run, today's two included`, () => {
      expectARunWithAssertionsOff();
      for (const today of TODAYS_CHECKS) expect(files, "harness: today's rolled-back checks are among those run").toContain(today);
      expect(files, "harness: the file kept without a catch is not among them").not.toContain(WITHOUT_THE_CATCH);

      expect(
        offRun?.value?.checks.map((check) => check.file),
        `one report per rolled-back check, in the order they ran (${told(offRun)})`,
      ).toEqual(files);
    });

    it(`${CHECK_1} — each is reported as not held, with exactly the catch's message`, () => {
      expectARunWithAssertionsOff();

      expect(
        offRun?.value?.checks.map((check) => ({ file: check.file, held: check.held, message: check.message })),
        `each check, named by its file, stopped at its catch (${told(offRun)})`,
      ).toEqual(files.map((file) => ({ file, held: false, message: CATCH })));
      expect(offRun?.value?.held, "so the run did not hold").toBe(false);
      expect(
        (lib as Record<string, unknown>).CATCH_MESSAGE,
        "and the catch's message the practice commands declare is the intent's, word for word",
      ).toBe(CATCH);
    });

    it(`${CHECK_1} — one line is said about each check, holding the catch's message, and the closing line says that all of them did not hold`, () => {
      expectARunWithAssertionsOff();

      expect(offSaid.length, `one line about each check and one closing line are shown (${shown(offSaid)})`).toBe(files.length + 1);
      for (const [place, file] of files.entries()) {
        expect(offSaid[place], `the line about ${file} holds the catch's message (${shown(offSaid)})`).toContain(CATCH);
      }
      const closing = String(offSaid[offSaid.length - 1] ?? "(nothing was said)");
      expect(saysDidNotHold(closing), `the closing line says that checks did not hold (closing: "${closing}")`).toBe(true);
      expect(countsIn(closing).length > 0, `and it says how many (closing: "${closing}")`).toBe(true);
      expect(
        countsIn(closing),
        `every count it says is the number of checks run, ${files.length}: all of them did not hold (closing: "${closing}")`,
      ).toEqual(countsIn(closing).map(() => files.length));
    });
  });

  describe("the run with assertions off leaves the practice copy as it was", () => {
    beforeAll(() => theRuns(), SEVERAL_RUNS);

    it(`${CHECK_2} — the accounts and the rows of each of the seven tables are counted the same before and after it`, () => {
      expectARunWithAssertionsOff();

      expect(typeof before, `harness: the rows could be counted before the run (${String(before)})`).toBe("object");
      expect(after, "the practice copy holds the same rows after the run as before it").toEqual(before);
    });
  });

  describe("straight after the run with assertions off, nothing has changed", () => {
    beforeAll(() => theRuns(), SEVERAL_RUNS);

    it(`${CHECK_3} — a new connection to the practice copy finds assertions on`, () => {
      expectARunWithAssertionsOff();

      expect(assertionsAfterwards, "a new connection, opened by the ordinary surroundings after that run, reads assertions on").toBe("on");
    });

    it(`${CHECK_3} — an ordinary run reports every rolled-back check as held`, () => {
      expectARunWithAssertionsOff();

      expect(ordinaryRun?.threw, `the ordinary run ran (${told(ordinaryRun)})`).toBe(false);
      expect(
        ordinaryRun?.value?.checks.map((check) => ({ file: check.file, held: check.held })),
        `each check is reported as held (${told(ordinaryRun)})`,
      ).toEqual(files.map((file) => ({ file, held: true })));
      expect(ordinaryRun?.value?.held, "every check held").toBe(true);
      expect(ordinarySaid.length, `one line about each check and one closing line are shown (${shown(ordinarySaid)})`).toBe(files.length + 1);
      expect(saysDidNotHold(String(ordinarySaid[ordinarySaid.length - 1])), "and the closing line does not say that any did not hold").toBe(false);
    });
  });

  describe("a rolled-back check without the safety catch is named", () => {
    beforeAll(() => theRuns(), SEVERAL_RUNS);

    it(`${CHECK_4} — run with assertions off beside the real checks, the check without the catch proves nothing and is reported held, and the run is not taken for one that proves every catch: that check, and only it, is named`, async () => {
      expect(withoutTheCatchOn?.threw, `harness: the file kept without a catch ran with assertions on (${told(withoutTheCatchOn)})`).toBe(false);
      expect(
        withoutTheCatchOn?.value?.checks.map((check) => ({ held: check.held, begins: check.message.startsWith(WITHOUT_THE_CATCH_BEGINS) })),
        `harness: with assertions on, its false assertion is read, so it does not hold (${told(withoutTheCatchOn)})`,
      ).toEqual([{ held: false, begins: true }]);
      expect(withoutTheCatchOff?.threw, `harness: it ran with assertions off, beside the real checks (${told(withoutTheCatchOff)})`).toBe(false);

      const checks = withoutTheCatchOff?.value?.checks ?? [];
      expect(
        checks.map((check) => ({ file: check.file, held: check.held })),
        `with assertions off the real checks did not hold, and the one without the catch was reported held, proving nothing (${told(withoutTheCatchOff)})`,
      ).toEqual([...files.map((file) => ({ file, held: false })), { file: WITHOUT_THE_CATCH, held: true }]);

      const outcome = await trying(() => judgeCatches(checks));

      expect(outcome.threw, `the run is read (${told(outcome)})`).toBe(false);
      expect(outcome.value?.caught, `the run does not prove every catch (${told(outcome)})`).toBe(false);
      expect(
        outcome.value?.uncaught.map((one) => one.file),
        `the check without the catch is named, and only it (${told(outcome)})`,
      ).toEqual([WITHOUT_THE_CATCH]);
      expect(String(outcome.value?.uncaught[0]?.said), "what is said of it says that it was reported held").toMatch(/\bheld\b/i);
    });

    it(`${CHECK_4} — the same reading of the run of the real checks alone, with assertions off, names none of them`, async () => {
      expectARunWithAssertionsOff();

      const outcome = await trying(() => judgeCatches(offRun?.value?.checks ?? []));

      expect(outcome.threw, `the run is read (${told(outcome)})`).toBe(false);
      expect(outcome.value, `every real check stopped at its catch, so none is named (${told(outcome)})`).toEqual({ caught: true, uncaught: [] });
    });
  });
}

{
  const ROOT_FOLDER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const NAME = "ch050-regression.txt";
  const STRAY_LINE = `The file supabase/checks/${NAME} is neither a migration's rolled-back check, named after its migration as NNNN_<name>.sql, nor the read-only question schema-shape.sql. Name it after its migration, or move it out of the folder.`;

  const helpers = cli as unknown as {
    placeStrayCheckFile: (name: string, text: string) => { file: string; remove: () => void };
    runDatabaseCommand: (options?: { kept?: string }) => Promise<{ code: number; text: string }>;
  };

  describe("the helper removes exactly what it placed", () => {
    it("the file is there once placed, with the text handed; after remove it is gone, the rest of the folder as before, and a second remove is harmless", () => {
      const folder = path.join(ROOT_FOLDER, "supabase", "checks");
      const before = fs.readdirSync(folder).sort();
      const placed = helpers.placeStrayCheckFile(NAME, "-- a stray file\n");
      try {
        expect(placed.file).toBe(`supabase/checks/${NAME}`);
        expect(fs.readFileSync(path.join(ROOT_FOLDER, placed.file), "utf8")).toBe("-- a stray file\n");
        expect(() => helpers.placeStrayCheckFile(NAME, "again"), "placing the same name twice is refused").toThrow();
      } finally {
        placed.remove();
      }
      expect(fs.readdirSync(folder).sort()).toEqual(before);
      expect(() => placed.remove()).not.toThrow();
      expect(fs.readdirSync(folder).sort()).toEqual(before);
    });
  });

  describe("npm run test:db judges the folder before a name handed to it", () => {
    it(
      "with a stray file placed, a name that matches no file is not what is refused: the folder is, naming the stray file",
      async () => {
        const placed = helpers.placeStrayCheckFile(NAME, "-- a stray file\n");
        let ran: { code: number; text: string };
        try {
          ran = await helpers.runDatabaseCommand({ kept: "no-match-alone" });
        } finally {
          placed.remove();
        }
        expect(ran.code, ran.text).not.toBe(0);
        expect(ran.text, ran.text).toContain(`Refused (folder): ${STRAY_LINE}`);
        expect(ran.text, ran.text).toContain("No check was run.");
        expect(ran.text, "the name was never looked up").not.toContain("Refused (no-match)");
      },
      180_000,
    );
  });

  describe("the test runner started by itself on one database file refuses a stray file", () => {
    it(
      "with a stray file placed, the group's one-time setup refuses, naming the file, and no check of the file named runs",
      async () => {
        const runner = path.join(ROOT_FOLDER, "node_modules", "vitest", "vitest.mjs");
        const kept = path.join(ROOT_FOLDER, "scripts", "practice", "sound-on-purpose.database.fixture.test.ts");
        const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "compass-ch050-runner-"));
        const report = path.join(scratch, "report.json");
        const around: Record<string, string | undefined> = Object.fromEntries(
          Object.entries(process.env).filter(([name]) => !name.startsWith("VITEST")),
        );
        around.PRACTICE_FALSE_CHECK = "1";

        const placed = helpers.placeStrayCheckFile(NAME, "-- a stray file\n");
        let printed = "";
        let code: number | null;
        try {
          code = await new Promise<number | null>((resolve) => {
            const child = spawn(
              process.execPath,
              [runner, "run", "--project", "database", "--reporter=json", `--outputFile.json=${report}`, kept],
              { cwd: ROOT_FOLDER, env: around, stdio: ["ignore", "pipe", "pipe"] },
            );
            child.stdout.on("data", (chunk) => (printed += String(chunk)));
            child.stderr.on("data", (chunk) => (printed += String(chunk)));
            const stop = setTimeout(() => {
              printed += "\n(stopped after 90 seconds)";
              child.kill("SIGKILL");
            }, 90_000);
            child.on("close", (ended) => {
              clearTimeout(stop);
              resolve(ended);
            });
          });
        } finally {
          placed.remove();
        }

        const passed = fs.existsSync(report)
          ? JSON.parse(fs.readFileSync(report, "utf8")).testResults.flatMap(
              (file: { assertionResults: { title: string; status: string }[] }) =>
                file.assertionResults.filter((one) => one.status === "passed").map((one) => one.title),
            )
          : [];
        fs.rmSync(scratch, { recursive: true, force: true });

        expect(code, printed.slice(-2000)).not.toBe(0);
        expect(printed, printed.slice(-2000)).toContain(STRAY_LINE);
        expect(printed, printed.slice(-2000)).toContain("No check was run.");
        expect(passed, `no check ran (${printed.slice(-2000)})`).toEqual([]);
      },
      120_000,
    );
  });
}

{
const CHECK_1 =
  'With save_profile.sql added to the checks folder, npm run practice:check refuses before any check runs: it prints the line above naming that file, then "No check was run.", ends as failed, and prints no "held" or "did not hold" line';
const CHECK_2 = "With the same file in place, npm run test:db refuses the same way before its first check, and no database check runs";
const CHECK_4 =
  "A file numbered after a migration that does not exist (0007_save_profile.sql) is refused the same way, and its line names the migrations there are";
const CHECK_5 = "A file that is not SQL (notes.txt) in that folder is refused the same way";
const CHECK_8 =
  "With a stray file in the folder, naming a real check by hand on the practice command is refused the same way; with the folder as committed, naming it runs that check as today";
const CHECK_9 =
  "With the folder and the migrations as committed, npm run practice:check reports every check held and npm run test:db passes every check, and neither prints a line about the folder or the migrations";

const CLOSING = "No check was run.";
const PREFIX = "Refused (folder): ";

function strayLine(name: string): string {
  return `The file supabase/checks/${name} is neither a migration's rolled-back check, named after its migration as NNNN_<name>.sql, nor the read-only question schema-shape.sql. Name it after its migration, or move it out of the folder.`;
}

const NO_SUCH_MIGRATION_LINE =
  "The file supabase/checks/0007_save_profile.sql is named after a migration that does not exist; the migrations are 0001_init.sql and 0002_save_interview.sql.";

const ABOUT_THE_FOLDER = /is neither a migration's rolled-back check|is named after a migration that does not exist|has no rolled-back check|Refused \(folder\)/;

type Ran = { code: number; text: string };
type Placed = { file: string; remove: () => void };

const placeStrayCheckFile = (cli as unknown as { placeStrayCheckFile: (name: string, text: string) => Placed }).placeStrayCheckFile;
const runCheckCommand = (cli as unknown as { runCheckCommand: (options?: { files?: string[] }) => Promise<Ran> }).runCheckCommand;
const runDatabaseCommand = cli.runDatabaseCommand as unknown as (options?: { kept?: string }) => Promise<Ran>;

const A_COMMAND = 180_000;

type Outcome<T> = { threw: boolean; value?: T; error?: unknown };

async function trying<T>(run: () => Promise<T> | T): Promise<Outcome<T>> {
  try {
    return { threw: false, value: await run() };
  } catch (error) {
    return { threw: true, error };
  }
}

function told(outcome: Outcome<unknown> | undefined): string {
  if (!outcome) return "it was never done";
  if (outcome.threw) return `it threw: ${String(outcome.error)}`;
  try {
    return `it answered: ${JSON.stringify(outcome.value)}`;
  } catch {
    return `it answered: ${String(outcome.value)}`;
  }
}

async function withStrayFile<T>(name: string, work: () => Promise<T>): Promise<{ placed: Outcome<Placed>; ran?: Outcome<T> }> {
  const placed = await trying(() => placeStrayCheckFile(name, "-- placed by the rolled-back checks' tests; not a check\nselect 1;\n"));
  if (placed.threw) return { placed };
  try {
    const ran = await trying(work);
    return { placed, ran };
  } finally {
    placed.value?.remove();
  }
}

function linesOf(ran: Outcome<Ran> | undefined): string[] {
  return String(ran?.value?.text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim());
}

function shown(ran: Outcome<Ran> | undefined): string {
  return `printed: ${JSON.stringify(ran?.value?.text ?? told(ran))}`;
}

function heldLines(lines: string[]): string[] {
  return lines.filter((line) => /\bheld\b|did\s+not\s+hold/i.test(line));
}

function expectPlaced(placed: Outcome<Placed>, name: string): void {
  expect(placed.threw, `harness: ${name} was placed in the real checks folder (${told(placed)})`).toBe(false);
  expect(placed.value?.file, "harness: and its path is the one the line names").toBe(`supabase/checks/${name}`);
}

function expectCheckCommandRefused(ran: Outcome<Ran> | undefined, line: string): void {
  expect(ran?.threw, `the command was run (${told(ran)})`).toBe(false);
  const lines = linesOf(ran);
  expect(ran?.value?.code, `it ends as failed (${shown(ran)})`).not.toBe(0);
  const first = lines.indexOf(`${PREFIX}${line}`);
  expect(first, `it prints the line naming the file, as a refusal (${shown(ran)})`).toBeGreaterThanOrEqual(0);
  expect(lines.indexOf(CLOSING), `then "${CLOSING}" (${shown(ran)})`).toBeGreaterThan(first);
  expect(heldLines(lines), `and no "held" or "did not hold" line (${shown(ran)})`).toEqual([]);
}

describe("npm run practice:check, run for real, refuses a stray file", () => {
  it(
    `${CHECK_1} — with save_profile.sql placed in the real folder, the command prints the line and "No check was run.", ends as failed, and no line says held`,
    async () => {
      const { placed, ran } = await withStrayFile("save_profile.sql", () => runCheckCommand());
      expectPlaced(placed, "save_profile.sql");
      expectCheckCommandRefused(ran, strayLine("save_profile.sql"));
    },
    A_COMMAND,
  );

  it(
    `${CHECK_4} — with 0007_save_profile.sql placed in the real folder, the command refuses, its line naming the two migrations there are`,
    async () => {
      const { placed, ran } = await withStrayFile("0007_save_profile.sql", () => runCheckCommand());
      expectPlaced(placed, "0007_save_profile.sql");
      expectCheckCommandRefused(ran, NO_SUCH_MIGRATION_LINE);
    },
    A_COMMAND,
  );

  it(
    `${CHECK_5} — with notes.txt placed in the real folder, the command refuses by the same line`,
    async () => {
      const { placed, ran } = await withStrayFile("notes.txt", () => runCheckCommand());
      expectPlaced(placed, "notes.txt");
      expectCheckCommandRefused(ran, strayLine("notes.txt"));
    },
    A_COMMAND,
  );
});

describe("npm run test:db, run for real, refuses a stray file before its first check", () => {
  it(
    `${CHECK_2} — with save_profile.sql placed in the real folder, the command prints the line and "No check was run.", ends as failed, and no database check runs`,
    async () => {
      const { placed, ran } = await withStrayFile("save_profile.sql", () => runDatabaseCommand({ kept: "sound" }));
      expectPlaced(placed, "save_profile.sql");
      expect(ran?.threw, `the command was run (${told(ran)})`).toBe(false);
      const text = String(ran?.value?.text ?? "");
      expect(ran?.value?.code, `it ends as failed (${shown(ran)})`).not.toBe(0);
      expect(text, `it prints the line naming the file (${shown(ran)})`).toContain(strayLine("save_profile.sql"));
      expect(text.indexOf(CLOSING), `then "${CLOSING}" (${shown(ran)})`).toBeGreaterThan(text.indexOf(strayLine("save_profile.sql")));
      expect(text, "the command's own closing line about checks that ran is not printed: no database check ran").not.toMatch(
        /Every database check|database checks? (that ran )?failed|database checks that ran/,
      );
      expect(text, "and the test runner reports no check passed or failed").not.toMatch(/\bTests\s+\d+\s+(passed|failed)/);
    },
    A_COMMAND,
  );
});

describe("naming a real check by hand, for real", () => {
  it(
    `${CHECK_8} — with save_profile.sql in the real folder, naming supabase/checks/0001_init.sql by hand is refused the same way`,
    async () => {
      const { placed, ran } = await withStrayFile("save_profile.sql", () => runCheckCommand({ files: ["supabase/checks/0001_init.sql"] }));
      expectPlaced(placed, "save_profile.sql");
      expectCheckCommandRefused(ran, strayLine("save_profile.sql"));
    },
    A_COMMAND,
  );

  it(
    `${CHECK_8} — with the folder as committed, naming supabase/checks/0001_init.sql runs that check, which holds`,
    async () => {
      const ran = await trying(() => runCheckCommand({ files: ["supabase/checks/0001_init.sql"] }));
      expect(ran.threw, `the command was run (${told(ran)})`).toBe(false);
      const lines = linesOf(ran);
      expect(ran.value?.code, `it ends well (${shown(ran)})`).toBe(0);
      expect(
        lines.filter((line) => line.includes("0001_init") && /\bheld\b/i.test(line) && !/did\s+not\s+hold/i.test(line)).length,
        `one line says that check held (${shown(ran)})`,
      ).toBe(1);
      expect(lines.filter((line) => line.includes("0002_save_interview")), "the check not named is not run").toEqual([]);
      expect(lines.filter((line) => ABOUT_THE_FOLDER.test(line)), "no line about the folder").toEqual([]);
    },
    A_COMMAND,
  );
});

describe("with the folder and the migrations as committed, the real commands run as today", () => {
  it(
    `${CHECK_9} — npm run practice:check reports every check held, and prints no line about the folder or the migrations`,
    async () => {
      const ran = await trying(() => runCheckCommand());
      expect(ran.threw, `the command was run (${told(ran)})`).toBe(false);
      const lines = linesOf(ran);
      expect(ran.value?.code, `it ends well (${shown(ran)})`).toBe(0);
      for (const check of ["0001_init", "0002_save_interview"]) {
        expect(
          lines.filter((line) => line.includes(check) && /\bheld\b/i.test(line) && !/did\s+not\s+hold/i.test(line)).length,
          `a line says ${check}'s check held (${shown(ran)})`,
        ).toBe(1);
      }
      expect(lines.filter((line) => /did\s+not\s+hold/i.test(line)), "no line says a check did not hold").toEqual([]);
      expect(lines.filter((line) => ABOUT_THE_FOLDER.test(line) || line === CLOSING), "no line about the folder or the migrations").toEqual([]);
    },
    A_COMMAND,
  );

  it(
    `${CHECK_9} — npm run test:db, run on the file kept sound on purpose, passes every check, and prints no line about the folder or the migrations`,
    async () => {
      const ran = await trying(() => runDatabaseCommand({ kept: "sound" }));
      expect(ran.threw, `the command was run (${told(ran)})`).toBe(false);
      expect(ran.value?.code, `it ends well (${shown(ran)})`).toBe(0);
      expect(String(ran.value?.text), "its closing line says every database check passed").toContain("Every database check passed (2 of 2).");
      expect(linesOf(ran).filter((line) => ABOUT_THE_FOLDER.test(line) || line === CLOSING), "no line about the folder or the migrations").toEqual(
        [],
      );
    },
    A_COMMAND,
  );
});
}
