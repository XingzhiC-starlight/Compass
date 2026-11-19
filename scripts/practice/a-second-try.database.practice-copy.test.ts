import { beforeAll, describe, expect, it } from "vitest";
import { runDatabaseCommand } from "./cli.mjs";

const CONSTRAINT_SECOND_TRY =
  "On the checks that run on every push, a database check that fails is tried once more; if it then passes, the push is green, and the run lists every check that needed a second try, so an unsteady check stays visible";

const FALSE_ON_PURPOSE = "false on purpose: expects a project that was never saved";
const UNSTEADY = "unsteady on purpose: fails at its first try and passes at its second";

const TWO_RUNS = 240_000;

type Printed = { code: number; text: string };
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

function linesOf(outcome: Outcome<Printed> | undefined): string[] {
  if (!outcome || outcome.threw || typeof outcome.value?.text !== "string") return [];
  return outcome.value.text
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
}

function shown(outcome: Outcome<Printed> | undefined): string {
  if (!outcome || outcome.threw) return told(outcome);
  return `exit code ${String(outcome.value?.code)}; it printed:\n${linesOf(outcome).slice(-25).join("\n")}`;
}

function naming(lines: string[], check: string): string[] {
  return lines.filter((line) => line.includes(check));
}

const SAYS_FAILED = /failed/i;
const SAYS_SECOND_TRY = /second\s+try/i;

function sayingOneOfTwoFailed(lines: string[]): string[] {
  return lines.filter(
    (line) =>
      !line.includes(FALSE_ON_PURPOSE) &&
      !line.includes(UNSTEADY) &&
      /fail/i.test(line) &&
      /\b(1|one)\b/i.test(line) &&
      /\b(2|two)\b/i.test(line),
  );
}

let asOnEveryPush: Outcome<Printed> | undefined;
let asOnThisMachine: Outcome<Printed> | undefined;

beforeAll(async () => {
  asOnEveryPush = await trying(() => runDatabaseCommand({ secondTry: true }));
  asOnThisMachine = await trying(() => runDatabaseCommand({ secondTry: false }));
}, TWO_RUNS);

function expectReallyRun(outcome: Outcome<Printed> | undefined, how: string): void {
  expect(outcome?.threw, `the database command was really run, ${how} (${told(outcome)})`).toBe(false);
  expect(typeof outcome?.value?.code, `and ended with an exit code (${told(outcome)})`).toBe("number");
  expect(linesOf(outcome).length > 0, `and printed something (${told(outcome)})`).toBe(true);
  expect(
    linesOf(outcome).filter((line) => line.includes("npm run practice:up")),
    "harness: it did not stop for want of the practice copy",
  ).toEqual([]);
}

describe("the database command, really run, and a second try", () => {
  it(`${CONSTRAINT_SECOND_TRY} — run for real as on every push: the check that fails at its first try is tried once more, passes, and is listed among the checks that needed a second try`, () => {
    expectReallyRun(asOnEveryPush, "as the checks on every push run it");
    const lines = linesOf(asOnEveryPush);

    expect(
      naming(lines, UNSTEADY).filter((line) => SAYS_SECOND_TRY.test(line)).length > 0,
      `a line it printed lists the unsteady check as having needed a second try (${shown(asOnEveryPush)})`,
    ).toBe(true);
    expect(
      naming(lines, UNSTEADY).filter((line) => SAYS_FAILED.test(line)),
      "lines that report the unsteady check as failed, though it passed at its second try",
    ).toEqual([]);
  });

  it(`${CONSTRAINT_SECOND_TRY} — run for real as on every push: the check that passed at its second try is counted as passed — one check of the two failed, the one that fails at both tries, which was tried once more and is listed too`, () => {
    expectReallyRun(asOnEveryPush, "as the checks on every push run it");
    const lines = linesOf(asOnEveryPush);

    expect(
      naming(lines, FALSE_ON_PURPOSE).filter((line) => SAYS_FAILED.test(line)).length > 0,
      `a line it printed says that the check which is false on purpose failed (${shown(asOnEveryPush)})`,
    ).toBe(true);
    expect(
      naming(lines, FALSE_ON_PURPOSE).filter((line) => SAYS_SECOND_TRY.test(line)).length > 0,
      `it was tried once more as well, and a line lists it among the checks that needed a second try (${shown(asOnEveryPush)})`,
    ).toBe(true);
    expect(
      sayingOneOfTwoFailed(lines).length > 0,
      `a line says how many failed of how many: one of two, so the unsteady check is counted as passed (${shown(asOnEveryPush)})`,
    ).toBe(true);
    expect(asOnEveryPush?.value?.code, "the command failed, and owes it to the check that failed at both tries").not.toBe(0);
  });

  it(`${CONSTRAINT_SECOND_TRY} — run for real as on a developer's machine, where nothing is tried twice, the same check fails and none is listed: so it is the second try that let it pass`, () => {
    expectReallyRun(asOnThisMachine, "as a developer runs it");
    const lines = linesOf(asOnThisMachine);

    expect(
      naming(lines, UNSTEADY).filter((line) => SAYS_FAILED.test(line)).length > 0,
      `tried once, the unsteady check failed, and a line it printed says so (${shown(asOnThisMachine)})`,
    ).toBe(true);
    expect(
      naming(lines, FALSE_ON_PURPOSE).filter((line) => SAYS_FAILED.test(line)).length > 0,
      `so did the check that is false on purpose (${shown(asOnThisMachine)})`,
    ).toBe(true);
    expect(
      lines.filter((line) => SAYS_SECOND_TRY.test(line)),
      "lines that speak of a second try, though nothing was tried twice",
    ).toEqual([]);
    expect(asOnThisMachine?.value?.code, "the command failed").not.toBe(0);
  });
});

{
  const CONSTRAINT_SECOND_TRY =
    "On the checks that run on every push, a database check that fails is tried once more; if it then passes, the push is green, and the run lists every check that needed a second try, so an unsteady check stays visible";

  const FALSE_ON_PURPOSE = "false on purpose: expects a project that was never saved";
  const UNSTEADY = "unsteady on purpose: fails at its first try and passes at its second";

  const GROUP = "kept for proving that a failure is reported";

  const TWO_RUNS = 240_000;

  type Printed = { code: number; text: string };
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

  function linesOf(outcome: Outcome<Printed> | undefined): string[] {
    if (!outcome || outcome.threw || typeof outcome.value?.text !== "string") return [];
    return outcome.value.text
      // eslint-disable-next-line no-control-regex
      .replace(/\u001b\[[0-9;]*m/g, "")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
  }

  function shown(outcome: Outcome<Printed> | undefined): string {
    if (!outcome || outcome.threw) return told(outcome);
    return `exit code ${String(outcome.value?.code)}; the last lines it printed:\n${linesOf(outcome).slice(-12).join("\n")}`;
  }

  function namesACheck(line: string): boolean {
    return line.includes(FALSE_ON_PURPOSE) || line.includes(UNSTEADY);
  }

  type OwnLines = { closing: string; aboutChecks: string[] };

  function ownLinesOf(outcome: Outcome<Printed> | undefined): OwnLines {
    const lines = linesOf(outcome);
    const closing = lines[lines.length - 1] ?? "";
    const aboutChecks: string[] = [];
    for (let at = lines.length - 2; at >= 0 && namesACheck(lines[at]); at -= 1) {
      aboutChecks.unshift(lines[at]);
    }
    return { closing, aboutChecks };
  }

  const THE_RUNNERS_SUMMARY = /^\s*(Test Files|Tests|Start at|Duration)\s/;

  const SAYS_FAILED = /fail/i;
  const THE_WORD_FAILED = /\bfailed\b/i;
  const SAYS_SECOND_TRY = /second\s+try/i;

  function withoutTheName(line: string): string {
    return line
      .replace(`${GROUP} > ${FALSE_ON_PURPOSE}`, "")
      .replace(`${GROUP} > ${UNSTEADY}`, "")
      .replace(FALSE_ON_PURPOSE, "")
      .replace(UNSTEADY, "");
  }

  const SAYS_ONE_OF_TWO = /\b(?:1|one)\b(?:\s+[a-z]+){0,3}?\s+(?:out\s+)?of\s+(?:the\s+)?(?:2|two)\b/i;
  const SAYS_TWO_OF_TWO = /\b(?:2|two)\b(?:\s+[a-z]+){0,3}?\s+(?:out\s+)?of\s+(?:the\s+)?(?:2|two)\b/i;

  function namedAsFailed(own: OwnLines): string[] {
    const failed = own.aboutChecks.filter((line) => THE_WORD_FAILED.test(withoutTheName(line)));
    return [FALSE_ON_PURPOSE, UNSTEADY].filter((check) => failed.some((line) => line.includes(check)));
  }

  let asOnEveryPush: Outcome<Printed> | undefined;
  let asOnThisMachine: Outcome<Printed> | undefined;

  beforeAll(async () => {
    asOnEveryPush = await trying(() => runDatabaseCommand({ secondTry: true }));
    asOnThisMachine = await trying(() => runDatabaseCommand({ secondTry: false }));
  }, TWO_RUNS);

  function expectReallyRun(outcome: Outcome<Printed> | undefined, how: string): void {
    expect(outcome?.threw, `harness: the database command was really run, ${how} (${told(outcome)})`).toBe(false);
    expect(typeof outcome?.value?.code, `harness: and ended with an exit code (${told(outcome)})`).toBe("number");
    expect(linesOf(outcome).length > 0, `harness: and printed something (${told(outcome)})`).toBe(true);
    expect(
      linesOf(outcome).filter((line) => line.includes("npm run practice:up")),
      "harness: it did not stop for want of the practice copy",
    ).toEqual([]);
  }

  function expectTheClosingLineIsTheCommandsOwn(own: OwnLines, outcome: Outcome<Printed> | undefined): void {
    expect(
      namesACheck(own.closing),
      `the last line the command printed is its closing line, which counts the checks and names none (${shown(outcome)})`,
    ).toBe(false);
    expect(
      own.aboutChecks.length > 0,
      `the closing line stands directly under the command's own lines that name a check (${shown(outcome)})`,
    ).toBe(true);
    expect(
      THE_RUNNERS_SUMMARY.test(own.closing),
      `the closing line is the command's own, and not the test runner's summary (found: "${own.closing}")`,
    ).toBe(false);
  }

  describe("the database command, really run, and its closing count", () => {
    it(`${CONSTRAINT_SECOND_TRY} — run for real as on every push, with one check that failed twice and another that passed at its second try: the command's own closing line, the last line it printed, says that one of the two checks failed`, () => {
      expectReallyRun(asOnEveryPush, "as the checks on every push run it");
      const own = ownLinesOf(asOnEveryPush);
      expectTheClosingLineIsTheCommandsOwn(own, asOnEveryPush);

      expect(
        own.aboutChecks.filter((line) => line.includes(UNSTEADY) && SAYS_SECOND_TRY.test(line)).length > 0,
        `harness: in this run a check did pass at its second try, and the command's own lines list it (${shown(asOnEveryPush)})`,
      ).toBe(true);

      expect(
        SAYS_FAILED.test(own.closing) && SAYS_ONE_OF_TWO.test(own.closing),
        `the closing line says how many of how many failed: one of two — the check that passed at its second try is counted as passed, and a second try is not counted as a check (found: "${own.closing}")`,
      ).toBe(true);
      expect(
        namedAsFailed(own),
        `and the count agrees with the command's own lines above it: they report one check as failed, the one that failed at both tries (${shown(asOnEveryPush)})`,
      ).toEqual([FALSE_ON_PURPOSE]);
    });

    it(`${CONSTRAINT_SECOND_TRY} — run for real as on a developer's machine, where nothing is tried twice, the command's own closing line says that two of the two checks failed: so the count of one is owed to the second try, and the line is counted anew by every run`, () => {
      expectReallyRun(asOnThisMachine, "as a developer runs it");
      const own = ownLinesOf(asOnThisMachine);
      expectTheClosingLineIsTheCommandsOwn(own, asOnThisMachine);

      expect(
        SAYS_FAILED.test(own.closing) && SAYS_TWO_OF_TWO.test(own.closing),
        `the closing line says how many of how many failed: two of two (found: "${own.closing}")`,
      ).toBe(true);
      expect(
        SAYS_ONE_OF_TWO.test(own.closing),
        `and it does not say one of two, as the run with a second try does (found: "${own.closing}")`,
      ).toBe(false);
      expect(
        namedAsFailed(own),
        `and the count agrees with the command's own lines above it: they report both checks as failed (${shown(asOnThisMachine)})`,
      ).toEqual([FALSE_ON_PURPOSE, UNSTEADY]);
    });
  });
}
