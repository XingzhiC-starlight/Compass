import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runDatabaseCommand } from "./cli.mjs";

const CHECK_FAILED_LINE =
  'The line about a database check that failed names first the file and the number of the line where the check begins in it, as "<file>:<line>", then the first 120 characters of the check\'s name — its group\'s title, then its own — followed by "…" when the name is longer; the test runner\'s own report above it keeps the whole name. Two checks of one file that failed, whose names begin with the same 120 characters, get lines that differ by that number';
const CHECK_SAME_SHAPE =
  "The line about a check that needed a second try, and the line about a check that is switched off, have that same shape: the file and the line number first, then the first 120 characters of the name";

const SWITCHED_OFF_FILE = "scripts/practice/switched-off-on-purpose.database.fixture.test.ts";
const SWITCHED_OFF_GROUP = "kept for proving that a switched-off check is said";
const SWITCHED_OFF_BEGINS = "switched off on purpose:";
const NOT_YET_WRITTEN = "not yet written on purpose: a check that someone means to write";

const LONG_NAMES_FILE = "scripts/practice/long-names-on-purpose.database.fixture.test.ts";
const LONG_NAMES_GROUP = "kept for proving that a long name is cut and still points at one check";
const FIRST_ENDS = "— the first, false on purpose";
const SECOND_ENDS = "— the second, false on purpose";

const LIMIT = 120;

function cut(name: string): string {
  return name.length > LIMIT ? `${name.slice(0, LIMIT)}…` : name;
}

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

function above(run: Run, words: string): string {
  const first = run.lines.findIndex((line) => line.startsWith(words));
  return first === -1 ? "" : run.lines.slice(0, first).join("\n");
}

function shapeOf(line: string, firstWords: string): { place: string; name: string } {
  const rest = line.slice(firstWords.length).replace(/^[\s:—–-]+/, "");
  const gap = rest.search(/\s/);
  if (gap === -1) return { place: rest, name: "" };
  return { place: rest.slice(0, gap), name: rest.slice(gap).trim() };
}

function lineNumberIn(place: string, file: string): number | string {
  if (!place.startsWith(`${file}:`)) return `(not a place in ${file}: ${place})`;
  const number = place.slice(file.length + 1);
  return /^[1-9]\d*$/.test(number) ? Number(number) : `(not a line number: ${number})`;
}

function lineOfFile(file: string, number: number | string): string {
  if (typeof number !== "number") return String(number);
  try {
    return fs.readFileSync(path.resolve(file), "utf8").split("\n")[number - 1] ?? "(the file has no such line)";
  } catch {
    return "(the file could not be read)";
  }
}

const BEGINS_A_CHECK = /\b(?:it|test)\b[.\w]*\s*\(/;

describe("the database command, really run with three false checks whose names begin with the same 120 characters", () => {
  it(
    `${CHECK_FAILED_LINE} — really run: each of the three lines names first the file and a line number, then the first 120 characters of the name — the group's title, then the check's own — and "…"`,
    async () => {
      const run = await theRun("long-names");

      expect(run.ran, `the database command was run (${run.why})`).toBe(true);
      const lines = beginning(run, "failed");
      expect(lines.length, `three lines begin "failed", one for each check (${printed(run)})`).toBe(3);
      for (const line of lines) {
        const shape = shapeOf(line, "failed");
        expect(typeof lineNumberIn(shape.place, LONG_NAMES_FILE), `the first thing the line names is "<file>:<line>" (the line: ${line})`).toBe(
          "number",
        );
        expect(shape.name.length, `then 120 characters of the name and "…", and nothing more (the line: ${line})`).toBe(LIMIT + 1);
        expect(shape.name.endsWith("…"), `the cut name ends with "…" (the line: ${line})`).toBe(true);
        expect(shape.name.startsWith(`${LONG_NAMES_GROUP} > `), `the name begins with its group's title, then its own (the line: ${line})`).toBe(
          true,
        );
      }
      expect(run.code, "the command fails").not.toBe(0);
    },
    A_RUN,
  );

  it(
    `${CHECK_FAILED_LINE} — really run: the number on each line is that of a line where a check begins in the file`,
    async () => {
      const run = await theRun("long-names");

      expect(run.ran, `the database command was run (${run.why})`).toBe(true);
      const lines = beginning(run, "failed");
      expect(lines.length, `three lines begin "failed", one for each check (${printed(run)})`).toBe(3);
      for (const line of lines) {
        const number = lineNumberIn(shapeOf(line, "failed").place, LONG_NAMES_FILE);
        expect(
          lineOfFile(LONG_NAMES_FILE, number),
          `a check begins on the line of the file that this line points at (the line: ${line})`,
        ).toMatch(BEGINS_A_CHECK);
      }
    },
    A_RUN,
  );

  it(
    `${CHECK_FAILED_LINE} — really run: the test runner's own report above keeps the whole name, to its end, and the command's lines do not`,
    async () => {
      const run = await theRun("long-names");

      expect(run.ran, `the database command was run (${run.why})`).toBe(true);
      const lines = beginning(run, "failed");
      expect(lines.length, `three lines begin "failed", one for each check (${printed(run)})`).toBe(3);
      expect(
        lines.filter((line) => line.includes(FIRST_ENDS) || line.includes(SECOND_ENDS)),
        "no line of the command's holds the end of a name: each is cut",
      ).toEqual([]);
      const report = above(run, "failed");
      expect(report, "the test runner's report, above the command's lines, holds the first check's name to its end").toContain(FIRST_ENDS);
      expect(report, "and the second's").toContain(SECOND_ENDS);
    },
    A_RUN,
  );

  it(
    `${CHECK_FAILED_LINE} — really run: the three lines hold the same 120 characters of name, and differ by the line number`,
    async () => {
      const run = await theRun("long-names");

      expect(run.ran, `the database command was run (${run.why})`).toBe(true);
      const shapes = beginning(run, "failed").map((line) => shapeOf(line, "failed"));
      expect(shapes.length, `three lines begin "failed", one for each check (${printed(run)})`).toBe(3);
      expect(new Set(shapes.map((shape) => shape.name)).size, "the three cut names read the same").toBe(1);
      const numbers = shapes.map((shape) => lineNumberIn(shape.place, LONG_NAMES_FILE));
      expect(
        numbers.every((number) => typeof number === "number"),
        `each line names a line of the file (${JSON.stringify(numbers)})`,
      ).toBe(true);
      expect(new Set(numbers).size, `and the three line numbers differ, so each line points at one check (${JSON.stringify(numbers)})`).toBe(3);
      expect(
        [...numbers].sort((one, other) => Number(one) - Number(other)),
        "in the order the file holds the checks, which is the order they ran in",
      ).toEqual(numbers);
    },
    A_RUN,
  );
});

describe("the database command, really run: the lines about a second try and about a switched-off check", () => {
  it(
    `${CHECK_SAME_SHAPE} — really run with a second try: each of the three checks that needed one has a line that names first the file and the line where the check begins, then the first 120 characters of its name`,
    async () => {
      const run = await theRun("long-names", true);

      expect(run.ran, `the database command was run (${run.why})`).toBe(true);
      const lines = beginning(run, "second try");
      expect(lines.length, `three lines begin "second try", one for each check that needed one (${printed(run)})`).toBe(3);
      const numbers: (number | string)[] = [];
      for (const line of lines) {
        const shape = shapeOf(line, "second try");
        const number = lineNumberIn(shape.place, LONG_NAMES_FILE);
        numbers.push(number);
        expect(typeof number, `the first thing the line names is "<file>:<line>" (the line: ${line})`).toBe("number");
        expect(lineOfFile(LONG_NAMES_FILE, number), `a check begins on that line of the file (the line: ${line})`).toMatch(BEGINS_A_CHECK);
        expect(shape.name.length, `then 120 characters of the name and "…", and nothing more (the line: ${line})`).toBe(LIMIT + 1);
        expect(shape.name.endsWith("…"), `the cut name ends with "…" (the line: ${line})`).toBe(true);
        expect(shape.name.startsWith(`${LONG_NAMES_GROUP} > `), `the name begins with its group's title, then its own (the line: ${line})`).toBe(
          true,
        );
      }
      expect(new Set(numbers).size, `the three lines point at three checks (${JSON.stringify(numbers)})`).toBe(3);
      expect(beginning(run, "failed").length, "harness: two of the three failed twice, and the third passed at its second try").toBe(2);
    },
    A_RUN,
  );

  it(
    `${CHECK_SAME_SHAPE} — really run with a check switched off and one not yet written: each line names first the file and the line where the check begins, then the first 120 characters of its name`,
    async () => {
      const run = await theRun("switched-off");

      expect(run.ran, `the database command was run (${run.why})`).toBe(true);
      const lines = beginning(run, "switched off");
      expect(lines.length, `two lines begin "switched off" (${printed(run)})`).toBe(2);
      const shapes = lines.map((line) => shapeOf(line, "switched off"));
      const numbers = shapes.map((shape) => lineNumberIn(shape.place, SWITCHED_OFF_FILE));
      for (const [index, line] of lines.entries()) {
        expect(typeof numbers[index], `the first thing the line names is "<file>:<line>" (the line: ${line})`).toBe("number");
        expect(lineOfFile(SWITCHED_OFF_FILE, numbers[index]), `a check begins on that line of the file (the line: ${line})`).toMatch(BEGINS_A_CHECK);
      }
      expect(new Set(numbers).size, `the two lines point at two checks (${JSON.stringify(numbers)})`).toBe(2);

      const off = shapes.find((shape) => shape.name.startsWith(`${SWITCHED_OFF_GROUP} > ${SWITCHED_OFF_BEGINS}`));
      expect(off?.name.length, `the switched-off check's name, longer than 120 characters, is cut to 120 and "…" (${printed(run)})`).toBe(LIMIT + 1);
      expect(off?.name.endsWith("…"), "and ends with “…”").toBe(true);
      expect(
        shapes.map((shape) => shape.name),
        "the name of the check that is not yet written follows its place: the group's title, then its own",
      ).toContain(cut(`${SWITCHED_OFF_GROUP} > ${NOT_YET_WRITTEN}`));
    },
    A_RUN,
  );
});

{
  const CHECK_FAILED_LINE =
    'The line about a database check that failed names first the file and the number of the line where the check begins in it, as "<file>:<line>", then the first 120 characters of the check\'s name — its group\'s title, then its own — followed by "…" when the name is longer; the test runner\'s own report above it keeps the whole name. Two checks of one file that failed, whose names begin with the same 120 characters, get lines that differ by that number. Checks that begin at one line of a file, and whose lines would otherwise read the same, each say which of them they are, as "(2 of 3 at this line)", counted in the file\'s order';

  const SAME_LINE_FILE = "scripts/practice/same-line-on-purpose.database.fixture.test.ts";
  const SAME_LINE_GROUP = "kept for proving that checks made from one line are told apart";
  const FIRST_CASE_ENDS = "— the first case";
  const THIRD_CASE_ENDS = "— the third case";
  const LOOP_FIRST = "short on purpose: the first of two made by a loop";
  const LOOP_SECOND = "short on purpose: the second of two made by a loop";

  const LIMIT = 120;

  const A_RUN = 120_000;

  type Kept = "skips-itself" | "same-line" | "line-name";

  type Run = { ran: boolean; why: string; code: number | undefined; text: string; lines: string[] };

  const INSIDE_A_RUN = "COMPASS_CH032_INSIDE_A_RUN";
  const startedInsideARun = process.env[INSIDE_A_RUN] === "1";

  function plain(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
  }

  async function reallyRun(kept: Kept): Promise<Run> {
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
      const answer = await runDatabaseCommand({ kept });
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

  const runs = new Map<Kept, Promise<Run>>();

  function theRun(kept: Kept): Promise<Run> {
    let run = runs.get(kept);
    if (!run) {
      run = reallyRun(kept);
      runs.set(kept, run);
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

  function above(run: Run, words: string): string {
    const first = run.lines.findIndex((line) => line.startsWith(words));
    return first === -1 ? "" : run.lines.slice(0, first).join("\n");
  }

  const SAYS_NOTHING_OF_IT = "(the line does not end by saying which of them it is)";

  function read(line: string, firstWords: string): { place: string; name: string; which: string } {
    const rest = line.slice(firstWords.length).replace(/^[\s:—–-]+/, "");
    const gap = rest.search(/\s/);
    const place = gap === -1 ? rest : rest.slice(0, gap);
    const afterPlace = gap === -1 ? "" : rest.slice(gap).trim();
    const ending = /^(.*?)\s+(\(\d+ of \d+ at this line\))$/.exec(afterPlace);
    if (!ending) return { place, name: afterPlace, which: SAYS_NOTHING_OF_IT };
    return { place, name: String(ending[1]), which: String(ending[2]) };
  }

  function lineNumberIn(place: string, file: string): number | string {
    if (!place.startsWith(`${file}:`)) return `(not a place in ${file}: ${place})`;
    const number = place.slice(file.length + 1);
    return /^[1-9]\d*$/.test(number) ? Number(number) : `(not a line number: ${number})`;
  }

  describe("the database command, really run with checks made from one line of a file", () => {
    function failedLines(run: Run) {
      const lines = beginning(run, "failed");
      return {
        all: lines,
        ofTheTable: lines.filter((line) => !line.includes("short on purpose")).map((line) => ({ line, ...read(line, "failed") })),
        ofTheLoop: lines.filter((line) => line.includes("short on purpose")).map((line) => ({ line, ...read(line, "failed") })),
      };
    }

    it(
      `${CHECK_FAILED_LINE} — really run with three checks made by a table of cases, of which the first and the third are false: their two lines name one place and hold the same 120 characters of name, and each ends by saying which of the checks at that line it is, so that the two lines differ`,
      async () => {
        const run = await theRun("same-line");

        expect(run.ran, `the database command was run (${run.why})`).toBe(true);
        const { all, ofTheTable } = failedLines(run);
        expect(all.length, `four lines begin "failed", one for each check that failed (${printed(run)})`).toBe(4);
        expect(closingLine(run), `harness: five checks ran, and four failed (${printed(run)})`).toContain("4 of 5");
        expect(ofTheTable.length, `two of them are about the checks made by the table of cases (${printed(run)})`).toBe(2);
        const [one, other] = ofTheTable;

        expect(typeof lineNumberIn(String(one?.place), SAME_LINE_FILE), `the first thing each line names is "<file>:<line>" (the line: ${String(one?.line)})`).toBe(
          "number",
        );
        expect(other?.place, "the two checks begin at one line of the file: both lines name the same place").toBe(one?.place);
        expect(one?.name.length, `then 120 characters of the name and "…" (the line: ${String(one?.line)})`).toBe(LIMIT + 1);
        expect(one?.name.startsWith(`${SAME_LINE_GROUP} > `), `the name begins with its group's title, then its own (the line: ${String(one?.line)})`).toBe(
          true,
        );
        expect(other?.name, "and the two cut names read the same: without more, the two lines would be one line").toBe(one?.name);

        expect(String(one?.which), `the first line ends by saying which of the checks at that line it is (the line: ${String(one?.line)})`).toMatch(
          /^\(\d+ of 3 at this line\)$/,
        );
        expect(String(other?.which), `and so does the second (the line: ${String(other?.line)})`).toMatch(/^\(\d+ of 3 at this line\)$/);
        expect(one?.line, "so the two lines do not read the same, and each points at one check").not.toBe(other?.line);
        expect(run.code, "the command fails").not.toBe(0);
      },
      A_RUN,
    );

    it(
      `${CHECK_FAILED_LINE} — really run: counted in the file's order, the first case says "(1 of 3 at this line)" and the third "(3 of 3 at this line)"; the second, which passed, has no line`,
      async () => {
        const run = await theRun("same-line");

        expect(run.ran, `the database command was run (${run.why})`).toBe(true);
        const { all, ofTheTable } = failedLines(run);
        expect(all.length, `four lines begin "failed", one for each check that failed (${printed(run)})`).toBe(4);
        const report = above(run, "failed");
        expect(report, "harness: the test runner's own report, above, keeps the whole name of the first case, which failed").toContain(FIRST_CASE_ENDS);
        expect(report, "harness: and of the third").toContain(THIRD_CASE_ENDS);
        expect(
          ofTheTable.map((line) => line.which).sort(),
          `the two lines say that they are the first and the third of the three checks at that line (${printed(run)})`,
        ).toEqual(["(1 of 3 at this line)", "(3 of 3 at this line)"]);
        expect(
          run.lines.filter((line) => line.includes("(2 of 3 at this line)")),
          "no line is about the second of the three: it passed",
        ).toEqual([]);
      },
      A_RUN,
    );

    it(
      `${CHECK_FAILED_LINE} — really run with two checks made by a loop, whose short names differ: they begin at one line, their lines already differ by the name, and neither says which of them it is`,
      async () => {
        const run = await theRun("same-line");

        expect(run.ran, `the database command was run (${run.why})`).toBe(true);
        const { all, ofTheTable, ofTheLoop } = failedLines(run);
        expect(all.length, `four lines begin "failed", one for each check that failed (${printed(run)})`).toBe(4);
        expect(ofTheLoop.length, `two of them are about the checks made by the loop (${printed(run)})`).toBe(2);
        expect(
          ofTheLoop.map((line) => ({ name: line.name, which: line.which })),
          "each holds its whole name — the group's title, then its own — and nothing after it",
        ).toEqual([
          { name: `${SAME_LINE_GROUP} > ${LOOP_FIRST}`, which: SAYS_NOTHING_OF_IT },
          { name: `${SAME_LINE_GROUP} > ${LOOP_SECOND}`, which: SAYS_NOTHING_OF_IT },
        ]);
        expect(typeof lineNumberIn(String(ofTheLoop[0]?.place), SAME_LINE_FILE), `each names its place, as "<file>:<line>" (${printed(run)})`).toBe("number");
        expect(ofTheLoop[1]?.place, "harness: the two begin at one line of the file").toBe(ofTheLoop[0]?.place);
        expect(ofTheLoop[0]?.place, "harness: and it is another line than the one the table of cases begins at").not.toBe(ofTheTable[0]?.place);
      },
      A_RUN,
    );
  });
}

{
  const CHECK_FALSE = "A deliberately false check makes the command fail and name that check";

  const FALSE_ON_PURPOSE = "false on purpose: expects a project that was never saved";

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

  describe("the database command, really run with a check that is false on purpose", () => {
    it(
      `${CHECK_FALSE} — the command ends in failure, and a line it printed names the check that failed`,
      async () => {
        const outcome = await trying(() => runDatabaseCommand());

        expect(outcome.threw, `the database command was run (${told(outcome)})`).toBe(false);
        expect(typeof outcome.value?.code, `and ended with an exit code (${told(outcome)})`).toBe("number");
        expect(outcome.value?.code, "the command failed").not.toBe(0);

        const printed = String(outcome.value?.text);
        expect(
          printed.split("\n").filter((line) => line.includes(FALSE_ON_PURPOSE) && /failed/i.test(line)).length > 0,
          `a line it printed says which check failed (printed:\n${printed.trim().split("\n").slice(-25).join("\n")})`,
        ).toBe(true);
        expect(printed, "and it did not stop for want of the practice copy").not.toContain("npm run practice:up");
      },
      A_FEW_CALLS,
    );
  });
}
