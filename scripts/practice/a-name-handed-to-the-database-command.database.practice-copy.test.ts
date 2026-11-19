import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { runDatabaseCommand } from "./cli.mjs";

const CHECK_NO_MATCH =
  "Given the name of a file that matches no database check, alone or beside a name that does, the database command stops before any check runs, says which name matched nothing, and fails";

const SOUND_FILE = "scripts/practice/sound-on-purpose.database.fixture.test.ts";
const NO_SUCH_FILE = "scripts/practice/no-such-file.database.test.ts";

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

describe("the database command, really run with a name that matches no database check file", () => {
  function sayingWhichName(run: Run): string[] {
    return run.lines.filter((line) => line.includes(NO_SUCH_FILE) && /match/i.test(line));
  }

  it(
    `${CHECK_NO_MATCH} — really run with that name alone: the command fails and says which name matched nothing`,
    async () => {
      const run = await theRun("no-match-alone");

      expect(run.ran, `the database command was run (${run.why})`).toBe(true);
      expect(sayingWhichName(run).length > 0, `a line says that this name matched nothing: ${NO_SUCH_FILE} (${printed(run)})`).toBe(true);
      expect(run.text, "no check ran: nothing printed says that anything passed").not.toMatch(/\bpassed\b/i);
      expect(run.code, "the command fails").not.toBe(0);
    },
    A_RUN,
  );

  it(
    `${CHECK_NO_MATCH} — really run with that name beside a name that does match: the command stops before any check runs, says which name matched nothing, and fails`,
    async () => {
      const run = await theRun("no-match-beside");

      expect(run.ran, `the database command was run (${run.why})`).toBe(true);
      expect(run.code, `the command fails (${printed(run)})`).not.toBe(0);
      expect(
        run.text,
        `it stopped before any check ran: the checks of the file that did match were not run, so nothing printed says that anything passed (${printed(run)})`,
      ).not.toMatch(/\bpassed\b/i);
      const lines = sayingWhichName(run);
      expect(lines.length > 0, `a line says that this name matched nothing: ${NO_SUCH_FILE} (${printed(run)})`).toBe(true);
      expect(
        lines.filter((line) => line.includes(SOUND_FILE)),
        "and that line does not hold the name that did match a file",
      ).toEqual([]);
    },
    A_RUN,
  );
});

{
  const CHECK_NO_MATCH =
    "Given the name of a file that matches no database check, alone or beside a name that does, the database command stops before any check runs, says which name matched nothing, and fails. A name that ends with a line number is refused in the same way, though its file exists, and the message says to leave the number out";

  const SOUND_FILE = "scripts/practice/sound-on-purpose.database.fixture.test.ts";
  const SOUND_LINE = 24;
  const LINE_NAME = `${SOUND_FILE}:${SOUND_LINE}`;

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

  function lineOfFile(file: string, number: number | string): string {
    if (typeof number !== "number") return String(number);
    try {
      return fs.readFileSync(path.resolve(file), "utf8").split("\n")[number - 1] ?? "(the file has no such line)";
    } catch {
      return "(the file could not be read)";
    }
  }

  const BEGINS_A_CHECK = /\b(?:it|test)\b[.\w]*\s*\(/;

  describe("the database command, really run with a name that ends with a line number", () => {
    function sayingWhichName(run: Run): string[] {
      return run.lines.filter((line) => line.includes(LINE_NAME) && /match/i.test(line));
    }

    const LEAVE_THE_NUMBER_OUT = /leave out the (?:line )?number|leave the (?:line )?number out/i;

    it(
      `${CHECK_NO_MATCH} — really run with the name of a file that exists, ending with the number of a line where a check begins in it: the command stops before any check runs, says which name matched nothing, and fails`,
      async () => {
        const run = await theRun("line-name");

        expect(run.ran, `the database command was run (${run.why})`).toBe(true);
        expect(lineOfFile(SOUND_FILE, SOUND_LINE), "harness: the file exists, and a check does begin at that line of it").toMatch(BEGINS_A_CHECK);
        expect(run.code, `the command fails (${printed(run)})`).not.toBe(0);
        expect(
          run.text,
          `it stopped before any check ran: the check at that line was not run, so nothing printed says that anything passed (${printed(run)})`,
        ).not.toMatch(/\bpassed\b/i);
        expect(beginning(run, "switched off"), "and no check of the file is listed as switched off").toEqual([]);
        expect(sayingWhichName(run).length > 0, `a line says that this name matched nothing: ${LINE_NAME} (${printed(run)})`).toBe(true);
      },
      A_RUN,
    );

    it(
      `${CHECK_NO_MATCH} — really run with the name of a file that exists, ending with the number of a line where a check begins in it: what the command says tells the person to leave the number out`,
      async () => {
        const run = await theRun("line-name");

        expect(run.ran, `the database command was run (${run.why})`).toBe(true);
        expect(run.text, `harness: the name handed to the command was this one: ${LINE_NAME} (${printed(run)})`).toContain(SOUND_FILE);
        expect(run.text.replace(/\s+/g, " "), `what it printed says to leave the number out (${printed(run)})`).toMatch(LEAVE_THE_NUMBER_OUT);
      },
      A_RUN,
    );
  });
}

{
  const ONE_RUN = 60_000;

  const OUTSIDE_THE_GROUP = "scripts/practice/finding-the-practice-copy.test.ts";
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

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

  describe("a name of a file that exists outside the database group, beside a name that matches a database check file", () => {
    const run = reallyRun("outside-the-group");

    it("is refused as a name that matches no database check file, and no check runs", () => {
      const { code, lines } = run();

      expect(fs.existsSync(path.join(ROOT, OUTSIDE_THE_GROUP)), "harness: the file named is there").toBe(true);
      expect(code, `the command failed (${shown(run())})`).toBe(1);
      expect(lines.filter((line) => line.startsWith("Refused (no-match)"))).toEqual([
        `Refused (no-match): No database check file matches the name "${OUTSIDE_THE_GROUP}". No check was run.`,
      ]);
      expect(lines.filter((line) => /^\s*Tests\s/.test(line)), `no check ran: the test runner gave no summary (${shown(run())})`).toEqual([]);
      expect(lines.filter((line) => /every database check/i.test(line)), "no line says that every check passed").toEqual([]);
    });
  });
}
