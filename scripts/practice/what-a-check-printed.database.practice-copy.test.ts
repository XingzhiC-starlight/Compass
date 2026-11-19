import { describe, expect, it } from "vitest";
import { runDatabaseCommand } from "./cli.mjs";

const CHECK_SAVE_FAILED =
  'With the practice copy up, a database run in which every check passed prints no line that holds "[compass] a save failed". When a check that provoked a refusal on purpose fails, the run shows that line for it';

const REFUSAL_FAILS_FILE = "scripts/practice/refusal-fails-on-purpose.database.fixture.test.ts";

const SAVE_FAILED = "[compass] a save failed";

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

describe("the database command, really run with a check that provokes a refusal on purpose", () => {
  it(
    `${CHECK_SAVE_FAILED} — really run with a check that provokes the refusal, expects it and passes: the command passes, and no line it printed holds "[compass] a save failed"`,
    async () => {
      const run = await theRun("refusal-passes");

      expect(run.ran, `the database command was run (${run.why})`).toBe(true);
      expect(closingLine(run), `harness: every check passed, and the run closes so (${printed(run)})`).toBe("Every database check passed (1 of 1).");
      expect(run.code, "harness: the command passes").toBe(0);
      expect(
        run.lines.filter((line) => line.includes(SAVE_FAILED)),
        "lines that hold “[compass] a save failed”",
      ).toEqual([]);
    },
    A_RUN,
  );

  it(
    `${CHECK_SAVE_FAILED} — really run with a check that provokes the refusal and then fails: the run shows the line that holds "[compass] a save failed"`,
    async () => {
      const run = await theRun("refusal-fails");

      expect(run.ran, `the database command was run (${run.why})`).toBe(true);
      expect(run.text, `harness: the file with the check that provokes the refusal was run (${printed(run)})`).toContain(REFUSAL_FAILS_FILE);
      expect(beginning(run, "failed").length, `harness: its one check failed, and has its line (${printed(run)})`).toBe(1);
      expect(run.code, "harness: the command fails").not.toBe(0);
      expect(
        run.lines.filter((line) => line.includes(SAVE_FAILED)).length > 0,
        `a line it printed holds “[compass] a save failed” (${printed(run)})`,
      ).toBe(true);
    },
    A_RUN,
  );
});
