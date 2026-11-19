import { beforeAll, describe, expect, it } from "vitest";
import * as cli from "./cli.mjs";
import { runDatabaseCommand } from "./cli.mjs";

const CHECK_NOT_PROVEN =
  "With the practice copy up, the database command fails when the test runner reports something that went wrong outside the checks, though every check that ran passed: a database file that cannot load; a step that runs before a file's checks and fails or runs out of time, so that those checks do not run; a step that runs after a file's checks and fails; an error raised outside any check. The command names the file where the test runner names one, says what went wrong, and does not say that every check passed";

type Kept = "cannot-load" | "setup-fails" | "teardown-fails" | "raises-outside";
type Printed = { code: number; text: string };

const runDatabaseCommand = cli.runDatabaseCommand as unknown as (options?: { secondTry?: boolean; kept?: Kept }) => Promise<Printed>;

const SOUND_FILE = "scripts/practice/sound-on-purpose.database.fixture.test.ts";
const CANNOT_LOAD_FILE = "scripts/practice/cannot-load-on-purpose.database.fixture.test.ts";
const SETUP_FILE = "scripts/practice/setup-fails-on-purpose.database.fixture.test.ts";
const TEARDOWN_FILE = "scripts/practice/teardown-fails-on-purpose.database.fixture.test.ts";

const CANNOT_LOAD = "cannot load on purpose";
const SETUP_FAILS = "the setup fails on purpose";
const TEARDOWN_FAILS = "the teardown fails on purpose";
const RAISED_OUTSIDE = "raised outside any check, on purpose";

const GROUPS = [
  "kept sound, beside a file that goes wrong",
  "kept for proving that a file which cannot load is reported",
  "kept for proving that a failed setup is reported: the step before the checks fails",
  "kept for proving that a failed setup is reported: the step before the checks runs out of time",
  "kept for proving that a failed setup is reported: no step before the check",
  "kept for proving that a failed teardown is reported",
  "kept for proving that an error raised outside any check is reported",
];

const CHECKS = [
  "sound on purpose: the practice copy shows a visitor no project",
  "sound on purpose: two and two make four",
  "sound on purpose: runs, in the same file as the checks that do not",
  "sound on purpose: passes, before the step after it fails",
  "sound on purpose: passes, and leaves behind something that goes wrong later",
  "sound on purpose: passes, while what the first check left behind goes wrong",
  "never found: the file raised an error before the test runner read this far",
  "never run, one: the step before it failed",
  "never run, two: the step before it failed",
  "never run, three: the step before it ran out of time",
];

const FALSE_ON_PURPOSE = "false on purpose: expects a project that was never saved";
const UNSTEADY = "unsteady on purpose: fails at its first try and passes at its second";

const ONE_RUN = 120_000;

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

function reallyRun(kept: Kept): () => Outcome<Printed> | undefined {
  let outcome: Outcome<Printed> | undefined;
  beforeAll(async () => {
    outcome = await trying(() => runDatabaseCommand({ kept }));
  }, ONE_RUN);
  return () => outcome;
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

function closingLineOf(outcome: Outcome<Printed> | undefined): string {
  const lines = linesOf(outcome);
  return lines[lines.length - 1] ?? "(nothing was printed)";
}

function linesAboutTrouble(outcome: Outcome<Printed> | undefined): string[] {
  return linesOf(outcome)
    .slice(0, -1)
    .filter((line) => /^\s*not proven\b/i.test(line));
}

const THE_RUNNERS_SUMMARY = /^\s*(Test Files|Tests|Errors|Start at|Duration)\s/;

function withoutTheTitles(line: string): string {
  return [...GROUPS, ...CHECKS]
    .sort((one, other) => other.length - one.length)
    .reduce((rest, title) => rest.split(title).join(" "), line);
}

function reportingACheckAsFailed(outcome: Outcome<Printed> | undefined): string[] {
  return linesOf(outcome).filter(
    (line) => CHECKS.some((title) => line.includes(title)) && /\bfailed\b/i.test(withoutTheTitles(line)),
  );
}

function sayingEveryCheckPassed(outcome: Outcome<Printed> | undefined): string[] {
  return linesOf(outcome).filter((line) =>
    /\b(every|all|both)\b(?:\s+\S+){0,3}?\s+checks?\s+(?:have\s+|has\s+)?passed\b/i.test(line),
  );
}

function countsOf(closing: string): { failedOfRan: string | null; others: number[] } {
  const ofPattern = /\b(\d+)\s+of\s+(\d+)\b/;
  const found = closing.match(ofPattern);
  const others = [...closing.replace(ofPattern, " ").matchAll(/\b\d+\b/g)].map((one) => Number(one[0]));
  return { failedOfRan: found ? `${found[1]} of ${found[2]}` : null, others };
}

const SAYS_DID_NOT_RUN =
  /\b(did\s+not|didn't|never|could\s+not|couldn't|were\s+not|weren't|was\s+not|wasn't|not)\s+(be\s+)?(run|ran)\b|\bskipped\b/i;
const SAYS_OUT_OF_TIME = /\btimed?[\s-]*out\b|\bout\s+of\s+time\b|\btoo\s+long\b/i;

function expectTheKeptRun(outcome: Outcome<Printed> | undefined, kept: Kept): void {
  expect(outcome?.threw, `harness: the database command was really run on the files kept as "${kept}" (${told(outcome)})`).toBe(false);
  expect(typeof outcome?.value?.code, `harness: and ended with an exit code (${told(outcome)})`).toBe("number");
  expect(linesOf(outcome).length > 0, `harness: and printed something (${told(outcome)})`).toBe(true);
  expect(
    linesOf(outcome).filter((line) => line.includes("npm run practice:up")),
    "harness: it did not stop for want of the practice copy",
  ).toEqual([]);
  expect(
    linesOf(outcome).filter((line) => line.includes(FALSE_ON_PURPOSE) || line.includes(UNSTEADY)),
    `harness: the run held the file that is sound on purpose and the file that goes wrong outside its checks — and not the two checks kept for proving that a failed check is reported, which fail by themselves (${shown(outcome)})`,
  ).toEqual([]);
  expect(
    THE_RUNNERS_SUMMARY.test(closingLineOf(outcome)),
    `harness: the last line printed is the command's closing line, and not the test runner's summary (found: "${closingLineOf(outcome)}")`,
  ).toBe(false);
}

function expectFailedThoughEveryCheckPassed(
  outcome: Outcome<Printed> | undefined,
  counted: { ran: number; notProven: number },
): void {
  const closing = closingLineOf(outcome);

  expect(outcome?.value?.code, `the command failed: its exit code is not 0 (${shown(outcome)})`).not.toBe(0);
  expect(closing, `its closing line does not say that every check passed: it does not hold the word "passed" (${shown(outcome)})`).not.toMatch(
    /passed/i,
  );
  expect(sayingEveryCheckPassed(outcome), "and no line it printed says that every check passed").toEqual([]);

  expect(
    reportingACheckAsFailed(outcome),
    `it did not fail for a check: every check that ran passed, and no line reports one as failed (${shown(outcome)})`,
  ).toEqual([]);
  expect(
    countsOf(closing).failedOfRan,
    `and the closing line counts it so: none of the ${counted.ran} checks that ran failed (found: "${closing}")`,
  ).toBe(`0 of ${counted.ran}`);
  expect(closing, `saying in words that the count is of checks that failed, and not of checks that passed (found: "${closing}")`).toMatch(
    /fail/i,
  );

  expect(closing, `the closing line says that something is not proven (found: "${closing}")`).toMatch(/\bnot proven\b/i);
  expect(countsOf(closing).others, `and how many things, in digits (found: "${closing}")`).toContain(counted.notProven);
}

describe("the database command, really run beside a file that cannot load", () => {
  const run = reallyRun("cannot-load");

  it(`${CHECK_NOT_PROVEN} — a database file that cannot load, really run beside two checks that pass: the command fails, and does not say that every check passed`, () => {
    expectTheKeptRun(run(), "cannot-load");
    expectFailedThoughEveryCheckPassed(run(), { ran: 2, notProven: 1 });
  });

  it(`${CHECK_NOT_PROVEN} — a database file that cannot load, really run beside two checks that pass: a line of the command's own names the file and says what went wrong`, () => {
    expectTheKeptRun(run(), "cannot-load");
    const about = linesAboutTrouble(run());

    expect(about.length, `one line of the command's own is about what went wrong, and begins with "not proven" (${shown(run())})`).toBe(1);
    expect(about[0], "it names the file that could not load").toContain(CANNOT_LOAD_FILE);
    expect(about[0], "and says what went wrong, in the words the file raised").toContain(CANNOT_LOAD);
  });
});

describe("the database command, really run beside a file whose steps before the checks go wrong", () => {
  const run = reallyRun("setup-fails");

  it(`${CHECK_NOT_PROVEN} — a step that runs before a file's checks fails and another runs out of time, really run beside three checks that pass: the command fails, and does not say that every check passed`, () => {
    expectTheKeptRun(run(), "setup-fails");
    expectFailedThoughEveryCheckPassed(run(), { ran: 3, notProven: 2 });
  });

  it(`${CHECK_NOT_PROVEN} — a step that runs before a file's checks and fails, so that those checks do not run, really run: a line of the command's own names the file and says what went wrong`, () => {
    expectTheKeptRun(run(), "setup-fails");
    const about = linesAboutTrouble(run());
    const aboutTheFailure = about.filter((line) => line.includes(SETUP_FAILS));

    expect(about.length, `two lines of the command's own are about what went wrong, one for each step (${shown(run())})`).toBe(2);
    expect(aboutTheFailure.length, `one of them says what went wrong, in the words the step raised (${shown(run())})`).toBe(1);
    expect(aboutTheFailure[0], "it names the file").toContain(SETUP_FILE);
    expect(aboutTheFailure[0], "and says that the checks after that step did not run").toMatch(SAYS_DID_NOT_RUN);
  });

  it(`${CHECK_NOT_PROVEN} — a step that runs before a file's checks and runs out of time, so that those checks do not run, really run: a line of the command's own names the file and says what went wrong`, () => {
    expectTheKeptRun(run(), "setup-fails");
    const about = linesAboutTrouble(run());
    const aboutTheTime = about.filter((line) => !line.includes(SETUP_FAILS));

    expect(about.length, `two lines of the command's own are about what went wrong, one for each step (${shown(run())})`).toBe(2);
    expect(aboutTheTime.length, `one of them is about the step that ran out of time (${shown(run())})`).toBe(1);
    expect(aboutTheTime[0], "it says what went wrong: the step ran out of time").toMatch(SAYS_OUT_OF_TIME);
    expect(aboutTheTime[0], "it names the file").toContain(SETUP_FILE);
    expect(aboutTheTime[0], "and says that the check after that step did not run").toMatch(SAYS_DID_NOT_RUN);
  });
});

describe("the database command, really run beside a file whose step after the checks fails", () => {
  const run = reallyRun("teardown-fails");

  it(`${CHECK_NOT_PROVEN} — a step that runs after a file's checks and fails, really run beside three checks that pass: the command fails, and does not say that every check passed`, () => {
    expectTheKeptRun(run(), "teardown-fails");
    expectFailedThoughEveryCheckPassed(run(), { ran: 3, notProven: 1 });
  });

  it(`${CHECK_NOT_PROVEN} — a step that runs after a file's checks and fails, really run: a line of the command's own names the file and says what went wrong`, () => {
    expectTheKeptRun(run(), "teardown-fails");
    const about = linesAboutTrouble(run());

    expect(about.length, `one line of the command's own is about what went wrong, and begins with "not proven" (${shown(run())})`).toBe(1);
    expect(about[0], "it names the file").toContain(TEARDOWN_FILE);
    expect(about[0], "and says what went wrong, in the words the step raised").toContain(TEARDOWN_FAILS);
  });
});

describe("the database command, really run beside a file that raises an error outside any check", () => {
  const run = reallyRun("raises-outside");

  it(`${CHECK_NOT_PROVEN} — an error raised outside any check, really run beside four checks that pass: the command fails, and does not say that every check passed`, () => {
    expectTheKeptRun(run(), "raises-outside");
    expectFailedThoughEveryCheckPassed(run(), { ran: 4, notProven: 1 });
  });

  it(`${CHECK_NOT_PROVEN} — an error raised outside any check, really run: a line of the command's own says what went wrong, and names no file it did not happen in`, () => {
    expectTheKeptRun(run(), "raises-outside");
    const about = linesAboutTrouble(run());

    expect(about.length, `one line of the command's own is about what went wrong, and begins with "not proven" (${shown(run())})`).toBe(1);
    expect(about[0], "it says what went wrong, in the words that were raised").toContain(RAISED_OUTSIDE);
    expect(
      [SOUND_FILE, CANNOT_LOAD_FILE, SETUP_FILE, TEARDOWN_FILE].filter((file) => String(about[0]).includes(file)),
      "files it names, in which the error was not raised",
    ).toEqual([]);
  });
});

{
  const ONLY_FILE = "scripts/practice/only-refused-on-purpose.database.fixture.test.ts";
  const ONE_RUN = 60_000;

  let code: number | undefined;
  let lines: string[] = [];

  function ownLines(): string[] {
    const from = lines.findIndex((line) => /^(failed|second try|not proven)\s{2}/.test(line));
    return from === -1 ? lines.slice(-1) : lines.slice(from);
  }

  function shown(): string {
    return `exit code ${String(code)}; the last lines it printed:\n${lines.slice(-10).join("\n")}`;
  }

  beforeAll(async () => {
    const run = await runDatabaseCommand({ kept: "only-refused" });
    code = run.code;
    lines = run.text
      // eslint-disable-next-line no-control-regex
      .replace(/\u001b\[[0-9;]*m/g, "")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
  }, ONE_RUN);

  describe("a run the test runner did not pass, of which the command heard no reason", () => {
    it("harness: the test runner refused the check marked as the only one, and both checks that ran passed", () => {
      expect(lines.some((line) => /Unexpected \.only modifier/.test(line)), `the runner refused the mark (${shown()})`).toBe(true);
      expect(lines.some((line) => /^\s*Tests\s.*\b2 passed\b/.test(line)), `two checks ran and passed (${shown()})`).toBe(true);
      expect(lines.filter((line) => /^failed\s{2}/.test(line)), "the command heard of no check that failed").toEqual([]);
    });

    it("is never reported as green: the command fails, says that something is not proven, and names no file for it", () => {
      const own = ownLines();
      const closing = lines[lines.length - 1] ?? "";

      expect(code, `the command failed (${shown()})`).toBe(1);
      expect(own.length, `one line about what is not proven, and the closing line (${shown()})`).toBe(2);
      expect(own[0]).toMatch(/^not proven {2}the test runner reported that the run did not pass/);
      expect(own[0], "it names no file, and not the kept file either").not.toContain(ONLY_FILE);
      expect(lines.filter((line) => /^switched off {2}/.test(line)).map((line) => line.includes(ONLY_FILE))).toEqual([true, true]);
      expect(closing).toBe("The run did not pass: 1 not proven, and 0 of 2 database checks that ran failed; 2 switched off.");
      expect(lines.filter((line) => /every database check passed/i.test(line)), "no line says that every check passed").toEqual([]);
    });
  });
}

{
  const ONE_RUN = 60_000;
  const EMPTY_GROUP_FILE = "scripts/practice/holds-an-empty-group-on-purpose.database.fixture.test.ts";

  type Run = { code: number; lines: string[] };

  function reallyRun(kept: "exit-code-fails" | "empty-group" | "first-step-fails" | "skips-itself-then-fails" | "outside-the-group"): () => Run {
    const run: Run = { code: -1, lines: [] };
    beforeAll(async () => {
      const { code, text } = await runDatabaseCommand({ kept });
      run.code = code;
      run.lines = text
        // eslint-disable-next-line no-control-regex
        .replace(/\u001b\[[0-9;]*m/g, "")
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);
    }, ONE_RUN);
    return () => run;
  }

  function shown(run: Run): string {
    return `exit code ${String(run.code)}; the last lines it printed:\n${run.lines.slice(-10).join("\n")}`;
  }

  describe("a run in which every check passed and the test runner left a failing exit code", () => {
    const run = reallyRun("exit-code-fails");

    it("harness: both checks ran and passed, and the runner's own summary says so", () => {
      expect(run().lines.some((line) => /^\s*Tests\s+2 passed \(2\)/.test(line)), `two checks ran and passed (${shown(run())})`).toBe(true);
      expect(run().lines.filter((line) => /^failed {2}/.test(line)), "the command heard of no check that failed").toEqual([]);
    });

    it("is never reported as green: the command fails, says that the test runner did not pass the run, and never that every check passed", () => {
      const { code, lines } = run();
      const notProven = lines.filter((line) => /^not proven {2}/.test(line));

      expect(code, `the command failed (${shown(run())})`).toBe(1);
      expect(notProven.length, `one thing is not proven (${shown(run())})`).toBe(1);
      expect(notProven[0]).toMatch(/^not proven {2}the test runner reported that the run did not pass/);
      expect(lines[lines.length - 1]).toBe("The run did not pass: 1 not proven, and 0 of 2 database checks that ran failed.");
      expect(lines.filter((line) => /every database check/i.test(line)), "no line says that every check passed").toEqual([]);
    });
  });

  describe("a file with a group that holds no check, beside a group whose check passes", () => {
    const run = reallyRun("empty-group");

    it("is reported as a group that holds no check, by its title, and the command fails", () => {
      const { code, lines } = run();

      expect(code, `the command failed (${shown(run())})`).toBe(1);
      expect(lines.filter((line) => /^not proven {2}/.test(line))).toEqual([
        `not proven  ${EMPTY_GROUP_FILE}: the group "kept empty on purpose" holds no check`,
      ]);
      expect(lines[lines.length - 1]).toBe("The run did not pass: 1 not proven, and 0 of 1 database checks that ran failed.");
    });
  });

  describe("a step before the group's first check that fails, so that no file runs", () => {
    const run = reallyRun("first-step-fails");

    it("is not taken for the closing step: the command fails, says that no check ran, and blames nothing else", () => {
      const { code, lines } = run();

      expect(lines.some((line) => line.includes("the first step fails on purpose")), `harness: the step failed, and the runner's report says so (${shown(run())})`).toBe(true);
      expect(code, `the command failed (${shown(run())})`).toBe(1);
      expect(lines.filter((line) => /^not proven {2}/.test(line)), "no line blames the closing step, or anything else").toEqual([]);
      expect(lines[lines.length - 1]).toBe("No database check ran, so nothing was proven.");
    });
  });
}

{
  const CHECK_CLOSING_STEP =
    'With the practice copy up, a step that closes the whole group of database checks and fails makes the database command fail, though every check passed, and say on a line that begins "not proven" that the closing step went wrong';
  const CHECK_NO_CHECK =
    'With the practice copy up, a database file that holds no check is reported on a line that begins "not proven" as holding no check, and not as a file that could not load';

  const HOLDS_NO_CHECK_FILE = "scripts/practice/holds-no-check-on-purpose.database.fixture.test.ts";

  const CLOSING_STEP_RAISES = "the closing step fails on purpose";

  const A_RUN = 120_000;

  type Kept =
    | "sound"
    | "switched-off"
    | "holds-no-check"
    | "long-names"
    | "refusal-passes"
    | "refusal-fails"
    | "closing-fails"
    | "no-match-alone"
    | "no-match-beside";

  type Run = { ran: boolean; why: string; code: number | undefined; text: string; lines: string[] };

  const INSIDE_A_RUN = "COMPASS_CH032_INSIDE_A_RUN";
  const startedInsideARun = process.env[INSIDE_A_RUN] === "1";

  function plain(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
  }

  async function reallyRun(kept: Kept, secondTry: boolean): Promise<Run> {
    if (startedInsideARun) {
      return {
        ran: false,
        why: "this file was run from inside a run of the database command, which runs kept files only and never the database group's own",
        code: undefined,
        text: "",
        lines: [],
      };
    }
    process.env[INSIDE_A_RUN] = "1";
    try {
      const answer = await runDatabaseCommand({ kept, secondTry });
      const text = plain(String(answer?.text ?? ""));
      return {
        ran: typeof answer?.code === "number",
        why: `it answered with the exit code ${String(answer?.code)}`,
        code: answer?.code,
        text,
        lines: text.split("\n").map((line) => line.replace(/\r$/, "")),
      };
    } catch (error) {
      return { ran: false, why: `it threw: ${String(error)}`, code: undefined, text: "", lines: [] };
    } finally {
      delete process.env[INSIDE_A_RUN];
    }
  }

  const runs = new Map<string, Promise<Run>>();

  function theRun(kept: Kept, secondTry = false): Promise<Run> {
    const key = `${kept} | second try: ${String(secondTry)}`;
    let run = runs.get(key);
    if (!run) {
      run = reallyRun(kept, secondTry);
      runs.set(key, run);
    }
    return run;
  }

  function printed(run: Run): string {
    return `printed, at its end:\n${run.lines.slice(-30).join("\n")}`;
  }

  function beginning(run: Run, words: string): string[] {
    return run.lines.filter((line) => line.startsWith(words));
  }

  function closingLine(run: Run): string {
    const filled = run.lines.filter((line) => line.trim() !== "");
    return filled[filled.length - 1] ?? "(nothing was printed)";
  }

  describe("the database command, really run with a closing step of the whole group that fails", () => {
    it(
      `${CHECK_CLOSING_STEP} — really run: both checks pass, the closing step raises, and the command fails and says so on one line that begins "not proven"`,
      async () => {
        const run = await theRun("closing-fails");

        expect(run.ran, `the database command was run (${run.why})`).toBe(true);
        expect(run.text, `harness: the closing step did fail, and the test runner's own report says how (${printed(run)})`).toContain(
          CLOSING_STEP_RAISES,
        );
        expect(beginning(run, "failed"), "harness: no check failed").toEqual([]);
        expect(run.code, `the command fails (${printed(run)})`).not.toBe(0);
        const lines = beginning(run, "not proven");
        expect(lines.length, `one line begins "not proven" (${printed(run)})`).toBe(1);
        expect(String(lines[0]), "and it says that the closing step went wrong").toMatch(/clos/i);
        const closing = closingLine(run);
        expect(closing, `the closing line does not say that the checks passed (${printed(run)})`).not.toContain("passed");
        expect(closing, "it says that none of the two checks that ran failed: every check passed").toContain("0 of 2");
      },
      A_RUN,
    );
  });

  describe("the database command, really run with a file that holds no check", () => {
    it(
      `${CHECK_NO_CHECK} — really run, beside a file whose checks pass: one line that begins "not proven" names the file and says that it holds no check, and no such line says that a file could not load`,
      async () => {
        const run = await theRun("holds-no-check");

        expect(run.ran, `the database command was run (${run.why})`).toBe(true);
        const lines = beginning(run, "not proven");
        expect(lines.length, `one line begins "not proven" (${printed(run)})`).toBe(1);
        expect(String(lines[0]), "it names the file that holds no check").toContain(HOLDS_NO_CHECK_FILE);
        expect(String(lines[0]), "it says that the file holds no check").toMatch(/holds no check/i);
        expect(
          lines.filter((line) => /could not load/i.test(line)),
          "and it does not say that the file could not load",
        ).toEqual([]);
        expect(run.code, "the command fails: one thing is not proven").not.toBe(0);
      },
      A_RUN,
    );
  });
}
