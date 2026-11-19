// @vitest-environment node

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const MAIN_FOLDER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNNER = path.join(MAIN_FOLDER, "node_modules", "vitest", "vitest.mjs");

const made: string[] = [];
afterAll(() => {
  for (const folder of made) fs.rmSync(folder, { recursive: true, force: true });
});

describe("the database group's setup, in a run started in another folder", () => {
  it("makes the repository's main folder the working folder before a file of database checks loads", async () => {
    const throwaway = fs.mkdtempSync(path.join(MAIN_FOLDER, "scripts", "practice", "ch-033-folder-"));
    const elsewhere = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "compass-ch033-elsewhere-")));
    made.push(throwaway, elsewhere);
    const check = path.join(throwaway, "folder.database.probe.test.ts");
    fs.writeFileSync(
      check,
      `import { expect, it } from "vitest";\n\nit("runs in the repository's main folder", () => {\n  expect(process.cwd()).toBe(${JSON.stringify(fs.realpathSync(MAIN_FOLDER))});\n});\n`,
    );
    const report = path.join(elsewhere, "report.json");
    const around = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("VITEST")));

    let printed = "";
    const code = await new Promise<number | null>((resolve) => {
      const child = spawn(
        process.execPath,
        [RUNNER, "run", "--root", MAIN_FOLDER, "--project", "database", "--reporter=json", `--outputFile.json=${report}`, check],
        { cwd: elsewhere, env: around, stdio: ["ignore", "pipe", "pipe"] },
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

    expect(fs.existsSync(report), `the run handed back its report (exit code ${String(code)}; printed: ${printed.slice(-1500)})`).toBe(true);
    const states = JSON.parse(fs.readFileSync(report, "utf8")).testResults.flatMap(
      (file: { assertionResults: { title: string; status: string }[] }) => file.assertionResults.map((one) => `${one.title}: ${one.status}`),
    );
    expect(states, printed.slice(-1500)).toEqual(["runs in the repository's main folder: passed"]);
    expect(code, printed.slice(-1500)).toBe(0);
  }, 120_000);
});
