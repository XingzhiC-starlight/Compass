import fs from "node:fs";
import path from "node:path";
import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { LEAVE_OUT_SUBFOLDER_CHECKS, SUBFOLDER_CHECKS } from "./lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(ROOT, "scripts", "practice", "cli.mjs");
const STARTING_THE_RUNNER_AND_THE_APP = "scripts/practice/starting-the-test-runner-and-the-practice-app.database.practice-copy.test.ts";
const A_RUN_AT_MOST = 360_000;

const running = new Set<ChildProcess>();

function whereChecksBegin(): { leftOut: number[]; kept: number[] } {
  const leftOut: number[] = [];
  const kept: number[] = [];
  let group: number[] | undefined;
  fs.readFileSync(path.join(ROOT, STARTING_THE_RUNNER_AND_THE_APP), "utf8")
    .split("\n")
    .forEach((line, at) => {
      if (/^describe\(/.test(line)) group = line.includes(SUBFOLDER_CHECKS) ? leftOut : kept;
      if (/^\s+it\(/.test(line)) group?.push(at + 1);
    });
  return { leftOut, kept };
}

function runTheCommand(words: string[]): Promise<{ code: number; text: string }> {
  const around: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("VITEST")) around[name] = value;
  }
  return new Promise((resolve) => {
    let text = "";
    const child = spawn(process.execPath, [CLI, "test-db", ...words], { cwd: ROOT, env: around, detached: true });
    running.add(child);
    child.stdout?.on("data", (chunk) => (text += chunk));
    child.stderr?.on("data", (chunk) => (text += chunk));
    child.on("error", (error) => resolve({ code: 127, text: `the database command could not be run: ${error.message}` }));
    child.on("close", (code) => {
      running.delete(child);
      resolve({ code: code ?? 1, text });
    });
  });
}

function lineNamed(line: string): number {
  const found = /^switched off\s+(\S+):(\d+) /.exec(line);
  return found && found[1] === STARTING_THE_RUNNER_AND_THE_APP ? Number(found[2]) : Number.NaN;
}

function closingLineOf(text: string): string {
  return text.trim().split("\n").at(-1)?.trim() ?? "";
}

function tail(text: string, count = 20): string {
  return text.trim().split("\n").slice(-count).join("\n");
}

afterAll(() => {
  for (const child of running) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
    } catch {
      /* gone */
    }
  }
});

describe("main's run: the database command, told to leave the subfolder checks out, really run on the file that starts the runner and the app", () => {
  it(
    "names each of the six as switched off at the line where it begins, runs the four checks of the practice app's port, and passes",
    async () => {
      const { leftOut, kept } = whereChecksBegin();
      expect(leftOut, "harness: the file that starts the runner and the app holds six checks in the group left out").toHaveLength(6);
      expect(kept, "harness: and four in the other").toHaveLength(4);

      const run = await runTheCommand(["--second-try", LEAVE_OUT_SUBFOLDER_CHECKS, STARTING_THE_RUNNER_AND_THE_APP]);
      const lines = run.text.split("\n").map((line) => line.trim());
      const switchedOff = lines.filter((line) => line.startsWith("switched off"));

      expect(
        switchedOff.map(lineNamed),
        `a "switched off" line for each of the six, at the line where it begins (${tail(run.text)})`,
      ).toEqual(leftOut);
      for (const line of switchedOff) {
        expect(line, "each names a check of the group left out").toContain(SUBFOLDER_CHECKS);
      }
      expect(
        lines.filter((line) => /^(failed|second try)\b/.test(line)),
        `nothing failed or needed a second try (${tail(run.text)})`,
      ).toEqual([]);
      expect(closingLineOf(run.text), "the four ran and passed; the six are counted as switched off").toBe(
        "Every database check that ran passed (4 of 4); 6 switched off.",
      );
      expect(run.code, "and the command passes").toBe(0);
    },
    A_RUN_AT_MOST,
  );
});
