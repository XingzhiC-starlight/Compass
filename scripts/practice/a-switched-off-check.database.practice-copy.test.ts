import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { runDatabaseCommand } from "./cli.mjs";

const CHECK_SWITCHED_OFF =
  'With the practice copy up, a database run in which a check is switched off in its file, or marked there as not yet written, passes, names that check on a line of its own that begins "switched off", and says in its closing line how many were switched off; a run with none switched off closes as it does today, with "Every database check passed" and the count';

const SWITCHED_OFF_GROUP = "kept for proving that a switched-off check is said";
const SWITCHED_OFF_BEGINS = "switched off on purpose:";
const NOT_YET_WRITTEN = "not yet written on purpose: a check that someone means to write";

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

describe("the database command, really run with a check switched off and one not yet written", () => {
  it(
    `${CHECK_SWITCHED_OFF} — really run: the command passes, and names each of the two on a line of its own that begins "switched off"`,
    async () => {
      const run = await theRun("switched-off");

      expect(run.ran, `the database command was run (${run.why})`).toBe(true);
      const lines = beginning(run, "switched off");
      expect(lines.length, `two lines begin "switched off" (${printed(run)})`).toBe(2);
      expect(
        lines.filter((line) => line.includes(`${SWITCHED_OFF_GROUP} > ${SWITCHED_OFF_BEGINS}`)).length,
        `one names the check that is switched off in its file (${printed(run)})`,
      ).toBe(1);
      expect(
        lines.filter((line) => line.includes(NOT_YET_WRITTEN)).length,
        `the other names the check that is marked as not yet written (${printed(run)})`,
      ).toBe(1);
      expect(beginning(run, "failed"), "no check is reported as failed").toEqual([]);
      expect(beginning(run, "not proven"), "and nothing as not proven").toEqual([]);
      expect(run.code, "the command passes").toBe(0);
    },
    A_RUN,
  );

  it(
    `${CHECK_SWITCHED_OFF} — really run: the closing line says that the one check that ran passed, and that 2 were switched off`,
    async () => {
      const run = await theRun("switched-off");

      expect(run.ran, `the database command was run (${run.why})`).toBe(true);
      const closing = closingLine(run);
      expect(closing, `the closing line says how many were switched off (${printed(run)})`).toContain("2 switched off");
      expect(closing, "and that every check that ran passed").toContain("passed");
      expect(closing, "counting the one check that ran, and not the two that did not").toContain("(1 of 1)");
    },
    A_RUN,
  );

  it(
    `${CHECK_SWITCHED_OFF} — really run with none switched off: the command passes and closes as it does today, with "Every database check passed (2 of 2)."`,
    async () => {
      const run = await theRun("sound");

      expect(run.ran, `the database command was run (${run.why})`).toBe(true);
      expect(closingLine(run), `the closing line is today's (${printed(run)})`).toBe("Every database check passed (2 of 2).");
      expect(beginning(run, "switched off"), "no line is about a switched-off check").toEqual([]);
      expect(run.text, "and nothing printed says a word of one").not.toMatch(/switched off/i);
      expect(run.code, "the command passes").toBe(0);
    },
    A_RUN,
  );
});

{
  const CHECK_SWITCHED_OFF =
    'With the practice copy up, a database run in which a check is switched off in its file, or marked there as not yet written, passes, names that check on a line of its own that begins "switched off", and says in its closing line how many were switched off; a run with none switched off closes as it does today, with "Every database check passed" and the count. A run in which every check is switched off, so that none ran, fails as it does today, and its closing line says how many were switched off';

  const NO_CHECK_RAN = "No database check ran, so nothing was proven";

  const ALL_SWITCHED_OFF_FILE = "scripts/practice/all-switched-off-on-purpose.database.fixture.test.ts";

  const A_RUN = 120_000;

  type Run = { ran: boolean; why: string; code: number | undefined; text: string; lines: string[] };

  const INSIDE_A_RUN = "COMPASS_CH032_INSIDE_A_RUN";
  const startedInsideARun = process.env[INSIDE_A_RUN] === "1";

  function plain(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
  }

  async function reallyRun(): Promise<Run> {
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
      const answer = await runDatabaseCommand({ kept: "all-switched-off" });
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

  let shared: Promise<Run> | undefined;

  function theRun(): Promise<Run> {
    shared ??= reallyRun();
    return shared;
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

  describe("the database command, really run over a file whose every check is switched off", () => {
    it(
      `${CHECK_SWITCHED_OFF} — really run over a file of two checks, both switched off: none ran, and the command fails as it does today, closing with the line that says that no check ran and not that anything passed`,
      async () => {
        const run = await theRun();

        expect(run.ran, `the database command was run (${run.why})`).toBe(true);
        expect(run.text, `harness: the kept file whose every check is switched off was the file run (${printed(run)})`).toContain(ALL_SWITCHED_OFF_FILE);
        expect(run.text, "harness: the test runner's own report says that it skipped both checks, and that none passed").toMatch(
          /Tests\s+2 skipped \(2\)/,
        );
        expect(beginning(run, "failed"), `harness: no check is reported as failed, since none ran (${printed(run)})`).toEqual([]);
        expect(run.code, `the command fails (${printed(run)})`).not.toBe(0);
        const closing = closingLine(run);
        expect(closing, `the closing line says, as it does today, that no check ran (${printed(run)})`).toContain(NO_CHECK_RAN);
        expect(closing, "and does not say that anything passed: a group switched off as a whole does not read as green").not.toMatch(/passed/i);
      },
      A_RUN,
    );

    it(
      `${CHECK_SWITCHED_OFF} — really run over a file of two checks, both switched off: the closing line says that 2 were switched off`,
      async () => {
        const run = await theRun();

        expect(run.ran, `the database command was run (${run.why})`).toBe(true);
        expect(run.code, `harness: the command fails (${printed(run)})`).not.toBe(0);
        expect(closingLine(run), `the closing line says how many were switched off (${printed(run)})`).toMatch(/(?<!\d)2 switched off/);
      },
      A_RUN,
    );
  });
}

{
  const CHECK_SWITCHED_OFF =
    'With the practice copy up, a database run in which a check is switched off in its file, or marked there as not yet written, passes, names that check on a line of its own that begins "switched off", and says in its closing line how many were switched off; a run with none switched off closes as it does today, with "Every database check passed" and the count. A run in which every check is switched off, so that none ran, fails as it does today, and its closing line says how many were switched off. A check that switches itself off as it runs is named and counted in the same way';

  const SKIPS_ITSELF_FILE = "scripts/practice/skips-itself-on-purpose.database.fixture.test.ts";
  const SKIPS_ITSELF_GROUP = "kept for proving that a check which switches itself off is said";
  const SKIPS_ITSELF_BEGINS = "switches itself off on purpose:";

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

  function lineOfFile(file: string, number: number | string): string {
    if (typeof number !== "number") return String(number);
    try {
      return fs.readFileSync(path.resolve(file), "utf8").split("\n")[number - 1] ?? "(the file has no such line)";
    } catch {
      return "(the file could not be read)";
    }
  }

  const BEGINS_A_CHECK = /\b(?:it|test)\b[.\w]*\s*\(/;
  const A_MARK_IN_THE_FILE = /\b(?:it|test)\.(?:skip|todo|skipIf|runIf)\b|\bx(?:it|test)\b/;

  describe("the database command, really run with a check that switches itself off as it runs", () => {
    it(
      `${CHECK_SWITCHED_OFF} — really run over a file of two checks, one that passes and one that switches itself off as it runs: the command passes, and names that check on a line of its own that begins "switched off" — the file and the line where it begins, then its name`,
      async () => {
        const run = await theRun("skips-itself");

        expect(run.ran, `the database command was run (${run.why})`).toBe(true);
        expect(run.text, `harness: the kept file with the check that switches itself off was the file run (${printed(run)})`).toContain(SKIPS_ITSELF_FILE);
        const lines = beginning(run, "switched off");
        expect(lines.length, `one line begins "switched off" (${printed(run)})`).toBe(1);
        const shape = read(String(lines[0]), "switched off");
        expect(
          shape.name.startsWith(`${SKIPS_ITSELF_GROUP} > ${SKIPS_ITSELF_BEGINS}`),
          `it names the check that switched itself off: its group's title, then its own (the line: ${String(lines[0])})`,
        ).toBe(true);
        const number = lineNumberIn(shape.place, SKIPS_ITSELF_FILE);
        expect(typeof number, `the first thing the line names is the check's place, as "<file>:<line>" (the line: ${String(lines[0])})`).toBe("number");
        const where = lineOfFile(SKIPS_ITSELF_FILE, number);
        expect(where, `a check begins on that line of the file (the line: ${String(lines[0])})`).toMatch(BEGINS_A_CHECK);
        expect(where, "harness: no mark in the file switches that check off; it switches itself off as it runs").not.toMatch(A_MARK_IN_THE_FILE);
        expect(beginning(run, "failed"), "no check is reported as failed").toEqual([]);
        expect(beginning(run, "not proven"), "and nothing as not proven").toEqual([]);
        expect(run.code, "the command passes").toBe(0);
      },
      A_RUN,
    );

    it(
      `${CHECK_SWITCHED_OFF} — really run over a file of two checks, one that passes and one that switches itself off as it runs: the closing line says that the one check that ran passed, and that 1 was switched off`,
      async () => {
        const run = await theRun("skips-itself");

        expect(run.ran, `the database command was run (${run.why})`).toBe(true);
        expect(run.text, `harness: the test runner's own report says that one check passed and that it skipped the other (${printed(run)})`).toMatch(
          /1 passed \| 1 skipped/,
        );
        const closing = closingLine(run);
        expect(closing, `the closing line says how many were switched off (${printed(run)})`).toMatch(/(?<!\d)1 switched off/);
        expect(closing, "and that every check that ran passed").toContain("passed");
        expect(closing, "counting the one check that ran, and not the one that switched itself off").toContain("(1 of 1)");
      },
      A_RUN,
    );
  });
}

{
  const ONE_RUN = 60_000;

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

  describe("a check that switched itself off, in a group whose step after the checks fails", () => {
    const run = reallyRun("skips-itself-then-fails");
    const FILE = "scripts/practice/skips-itself-before-a-failing-step-on-purpose.database.fixture.test.ts";

    it("is said once, as switched off, and the step is said to have gone wrong after the checks: no check was left unrun", () => {
      const { code, lines } = run();

      expect(code, `the command failed (${shown(run())})`).toBe(1);
      expect(lines.filter((line) => /^switched off {2}/.test(line)).length, `one check is switched off (${shown(run())})`).toBe(1);
      expect(lines.filter((line) => /^not proven {2}/.test(line))).toEqual([
        `not proven  ${FILE}: a step after the checks went wrong: the step after fails on purpose`,
      ]);
      expect(lines[lines.length - 1]).toBe("The run did not pass: 1 not proven, and 0 of 1 database checks that ran failed; 1 switched off.");
    });
  });
}
