import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LEAVE_OUT_SUBFOLDER_CHECKS, SUBFOLDER_CHECKS, nameFilterFor } from "./lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const STARTING_THE_RUNNER_AND_THE_APP = "scripts/practice/starting-the-test-runner-and-the-practice-app.database.practice-copy.test.ts";

const SUBFOLDER_GROUP = "the test runner, started from a subfolder and pointed at the main folder, really run";
const PORT_GROUP = "the practice app, started while another program holds port 5183, really run";
const CHECK_SUBFOLDER =
  "Started from a subfolder of the repository and pointed at its main folder, as the folder to run from or by naming the main folder's settings file, the test runner runs the existing suite and the database checks as it does from the main folder, with the same counts. Started from a subfolder, the npm commands still do so";
const CHECK_TAKEN =
  "With another program holding port 5183 on either of the machine's two loopback addresses, on that address alone or on every address of the machine, the practice app refuses to start, says that its address is taken, and moves to no other port";

const SUBFOLDER_CHECK_NAMES = [
  `${CHECK_SUBFOLDER} — the existing suite, the main folder named as the folder to run from (--root): the same files, checks and counts as from the main folder`,
  `${CHECK_SUBFOLDER} — the existing suite, the main folder's settings file named (--config): the same files, checks and counts as from the main folder`,
  `${CHECK_SUBFOLDER} — the database checks of the seam, the main folder named as the folder to run from (--root): the same files, checks and counts as from the main folder`,
  `${CHECK_SUBFOLDER} — the database checks of the seam, the main folder's settings file named (--config): the same files, checks and counts as from the main folder`,
  `${CHECK_SUBFOLDER} — npm test, started from the subfolder after the test runner was: the same files, checks and counts as the test runner from the main folder`,
  `${CHECK_SUBFOLDER} — npm run test:db, started from the subfolder after the test runner was: the same closing line and exit code as from the main folder`,
].map((name) => `${SUBFOLDER_GROUP} ${name}`);

const PORT_CHECK_NAMES = [
  `${CHECK_TAKEN} — the other program holds it on 127.0.0.1 alone`,
  `${CHECK_TAKEN} — the other program holds it on ::1 alone`,
  `${CHECK_TAKEN} — the other program holds it on every IPv4 address of the machine (0.0.0.0)`,
  `${CHECK_TAKEN} — the other program holds it on every address of the machine, IPv6 and IPv4 (::)`,
].map((name) => `${PORT_GROUP} ${name}`);

const OTHER_CHECK_NAMES = [
  "the owner is stamped by the database: a project saved through the seam belongs to the account that saved it",
  "kept sound, beside a file that goes wrong sound on purpose: the first of two",
  "a check of a subfolder of its own, named in other words",
];

function runs(filter: RegExp, name: string): boolean {
  return name.match(filter) !== null;
}

function bothShapes(names: string[]): string[] {
  return names.flatMap((name) => [name, `${STARTING_THE_RUNNER_AND_THE_APP} ${name}`]);
}

describe("the filter main's run hands the test runner", () => {
  it("told to leave out the subfolder checks, it leaves out each of the six checks that start the runner from a subfolder or beside a held port", () => {
    const filter = nameFilterFor(["--second-try", LEAVE_OUT_SUBFOLDER_CHECKS]);
    expect(filter, "told so, the command hands the test runner a filter").toBeInstanceOf(RegExp);
    for (const name of bothShapes(SUBFOLDER_CHECK_NAMES)) {
      expect(runs(filter as RegExp, name), `left out: ${name}`).toBe(false);
    }
  });

  it("told to leave out the subfolder checks, it keeps the four checks of the practice app's port that share their file, and the checks of every other group", () => {
    const filter = nameFilterFor(["--second-try", LEAVE_OUT_SUBFOLDER_CHECKS]) as RegExp;
    for (const name of bothShapes([...PORT_CHECK_NAMES, ...OTHER_CHECK_NAMES])) {
      expect(runs(filter, name), `kept: ${name}`).toBe(true);
    }
  });

  it("the word may stand anywhere among the command's words, before or after the names of files", () => {
    for (const words of [
      [LEAVE_OUT_SUBFOLDER_CHECKS],
      [LEAVE_OUT_SUBFOLDER_CHECKS, STARTING_THE_RUNNER_AND_THE_APP],
      [STARTING_THE_RUNNER_AND_THE_APP, "--second-try", LEAVE_OUT_SUBFOLDER_CHECKS],
    ]) {
      const filter = nameFilterFor(words);
      expect(filter, `a filter for ${JSON.stringify(words)}`).toBeInstanceOf(RegExp);
      expect(runs(filter as RegExp, SUBFOLDER_CHECK_NAMES[0]), `and it leaves them out, for ${JSON.stringify(words)}`).toBe(false);
    }
  });

  it("told nothing, only to try a failed check once more, or given the names of files, it hands the test runner no filter, so nothing is left out", () => {
    for (const words of [[], ["--second-try"], [STARTING_THE_RUNNER_AND_THE_APP], ["--second-try", STARTING_THE_RUNNER_AND_THE_APP, "src/"]]) {
      expect(nameFilterFor(words), `no filter for ${JSON.stringify(words)}`).toBeUndefined();
    }
  });

  it("no npm command of the project says the word, so the developer's machine never leaves a check out", () => {
    const scripts: Record<string, string> = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;
    expect(Object.keys(scripts), "harness: the database command is among the project's commands").toContain("test:db");
    const saying = Object.entries(scripts)
      .filter(([, command]) => command.includes(LEAVE_OUT_SUBFOLDER_CHECKS))
      .map(([name]) => name);
    expect(saying, `the npm commands that say "${LEAVE_OUT_SUBFOLDER_CHECKS}"`).toEqual([]);
  });

  it("of the database check files, the one that starts the runner and the app alone holds the words that mark the checks left out, so main's run leaves out nothing else", () => {
    const databaseFiles = ["scripts", "src"].flatMap((folder) =>
      (fs.readdirSync(path.join(ROOT, folder), { recursive: true }) as string[])
        .map((name) => path.join(folder, name).split(path.sep).join("/"))
        .filter((name) => /\.database\.[^/]*\.test\.tsx?$/.test(name) && !name.includes("node_modules")),
    );
    expect(databaseFiles.length, "harness: the database check files were found").toBeGreaterThan(10);
    const holding = databaseFiles.filter((name) => fs.readFileSync(path.join(ROOT, name), "utf8").includes(SUBFOLDER_CHECKS));
    expect(holding, `the files that hold "${SUBFOLDER_CHECKS}"`).toEqual([STARTING_THE_RUNNER_AND_THE_APP]);
  });
});
