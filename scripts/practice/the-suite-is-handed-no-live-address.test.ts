// @vitest-environment node

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CHECK =
  "In the existing suite no check opens a connection to any database: none is handed the live project's address, loading the seam makes no database client, and a check that tries to reach any network address is refused and fails, with nothing arriving there";

const IN_THE_ENV_FILE = {
  address: "https://madeupenvfileaddress.supabase.co",
  key: "sb_publishable_made_up_for_the_env_file",
};
const IN_THE_SHELL = {
  address: "https://madeupshelladdressxx.supabase.co",
  key: "sb_publishable_made_up_for_the_shell",
};

const ADDRESS_NAME = "VITE_SUPABASE_URL";
const KEY_NAME = "VITE_SUPABASE_ANON_KEY";
const APP_READS = [ADDRESS_NAME, KEY_NAME, "VITE_TURNSTILE_SITE_KEY"];

const COMPARISON_NAME = "VITE_COMPASS_PROBE_COMPARISON";
const COMPARISON_VALUE = "made-up-and-set-in-the-shell";

const REPORT_NAME = "COMPASS_PROBE_REPORT";

const REPOSITORY = process.cwd();
const RUNNER = path.join(REPOSITORY, "node_modules", "vitest", "vitest.mjs");
const CONFIGURATION = path.join(REPOSITORY, "vitest.config.ts");
const LINKED = ["scripts", "node_modules"];

const PROBE_FILE = "handed.probe.test.ts";
const BARE_CONFIGURATION = "nothing-stops-it.config.mjs";
const ENV_FILE = ".env.local";

const PROBE = `
import fs from "node:fs";
import { it } from "vitest";

const IN_THE_ENV_FILE = ${JSON.stringify(IN_THE_ENV_FILE)};
const IN_THE_SHELL = ${JSON.stringify(IN_THE_SHELL)};
const MADE_UP = [IN_THE_ENV_FILE.address, IN_THE_ENV_FILE.key, IN_THE_SHELL.address, IN_THE_SHELL.key];

function which(value) {
  const text = String(value ?? "");
  if (text === "") return "nothing";
  if (text === IN_THE_ENV_FILE.address || text === IN_THE_ENV_FILE.key) return "what the env file holds";
  if (text === IN_THE_SHELL.address || text === IN_THE_SHELL.key) return "what the shell holds";
  return "something else";
}

function holders(where, values) {
  const found = [];
  for (const name of Object.keys(values)) {
    const text = String(values[name] ?? "");
    if (MADE_UP.some((madeUp) => text.includes(madeUp))) found.push(where + "." + name);
  }
  return found;
}

it("a check of the suite says what it was handed", () => {
  const app = import.meta.env;
  const report = {
    address: { app: which(app.${ADDRESS_NAME}), process: which(process.env.${ADDRESS_NAME}) },
    key: { app: which(app.${KEY_NAME}), process: which(process.env.${KEY_NAME}) },
    comparison: { app: String(app.${COMPARISON_NAME} ?? ""), process: String(process.env.${COMPARISON_NAME} ?? "") },
    holders: [...holders("import.meta.env", { ...app }), ...holders("process.env", { ...process.env })],
  };
  fs.writeFileSync(process.env.${REPORT_NAME}, JSON.stringify(report));
});
`;

const BARE = `export default { test: { environment: "node", include: [${JSON.stringify(PROBE_FILE)}] } };\n`;

const ENV_FILE_TEXT = [
  "# Made up for a test: a live-looking address and key that belong to nobody.",
  `${ADDRESS_NAME}=${IN_THE_ENV_FILE.address}`,
  `${KEY_NAME}=${IN_THE_ENV_FILE.key}`,
  "",
].join("\n");

type Handed = {
  address: { app: string; process: string };
  key: { app: string; process: string };
  comparison: { app: string; process: string };
  holders: string[];
};

type Run = { code: number | null; printed: string; handed: Handed | null };

function surroundings(set: Record<string, string>): NodeJS.ProcessEnv {
  const around: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (APP_READS.includes(name) || name === COMPARISON_NAME || name === REPORT_NAME) continue;
    if (name.startsWith("VITEST")) continue;
    around[name] = value;
  }
  return { ...around, ...set };
}

function run(scratch: string, name: string, words: string[], set: Record<string, string>): Promise<Run> {
  const report = path.join(scratch, `${name}.report.json`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [RUNNER, "run", ...words, "--root", scratch, PROBE_FILE], {
      cwd: REPOSITORY,
      env: surroundings({ ...set, [REPORT_NAME]: report }),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let printed = "";
    child.stdout.on("data", (chunk) => {
      printed += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      printed += String(chunk);
    });
    child.on("error", (error) => {
      resolve({ code: null, printed: `${printed}\n(the runner could not be started: ${String(error)})`, handed: null });
    });
    child.on("close", (code) => {
      let handed: Handed | null = null;
      try {
        handed = JSON.parse(fs.readFileSync(report, "utf8")) as Handed;
      } catch {
        /* the probe never ran, or wrote nothing */
      }
      resolve({ code, printed, handed });
    });
  });
}

function shown(one: Run | undefined): string {
  if (!one) return "the run was never started";
  // eslint-disable-next-line no-control-regex
  const printed = one.printed.replace(/\u001b\[[0-9;]*m/g, "").trim().split("\n").slice(-25).join("\n");
  return `exit code ${String(one.code)}; it printed:\n${printed}`;
}

let scratch = "";
const RUNS = ["from-the-env-file", "from-the-shell", "nothing-stops-the-env-file", "nothing-stops-the-shell"];
let fromTheEnvFile: Run | undefined;
let fromTheShell: Run | undefined;
let nothingStopsTheEnvFile: Run | undefined;
let nothingStopsTheShell: Run | undefined;

beforeAll(async () => {
  scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "compass-surroundings-")));
  fs.writeFileSync(path.join(scratch, ENV_FILE), ENV_FILE_TEXT);
  fs.writeFileSync(path.join(scratch, PROBE_FILE), PROBE);
  fs.writeFileSync(path.join(scratch, BARE_CONFIGURATION), BARE);
  for (const folder of LINKED) {
    fs.symlinkSync(path.join(REPOSITORY, folder), path.join(scratch, folder), "dir");
  }

  const asTheSuite = ["--config", CONFIGURATION, "--project", "suite"];
  const stoppingNothing = ["--config", path.join(scratch, BARE_CONFIGURATION)];
  const setInTheShell = {
    [ADDRESS_NAME]: IN_THE_SHELL.address,
    [KEY_NAME]: IN_THE_SHELL.key,
    [COMPARISON_NAME]: COMPARISON_VALUE,
  };
  [fromTheEnvFile, fromTheShell, nothingStopsTheEnvFile, nothingStopsTheShell] = await Promise.all([
    run(scratch, RUNS[0], asTheSuite, { [COMPARISON_NAME]: COMPARISON_VALUE }),
    run(scratch, RUNS[1], asTheSuite, setInTheShell),
    run(scratch, RUNS[2], stoppingNothing, {}),
    run(scratch, RUNS[3], stoppingNothing, setInTheShell),
  ]);
}, 120_000);

afterAll(() => {
  if (scratch === "" || !scratch.includes("compass-surroundings-")) return;
  const unmake = (name: string, asLink: boolean): void => {
    const entry = path.join(scratch, name);
    try {
      const found = fs.lstatSync(entry);
      if (asLink ? found.isSymbolicLink() : found.isFile()) fs.unlinkSync(entry);
    } catch {
      /* it was never made */
    }
  };
  for (const folder of LINKED) unmake(folder, true);
  for (const name of [ENV_FILE, PROBE_FILE, BARE_CONFIGURATION]) unmake(name, false);
  for (const name of RUNS) unmake(`${name}.report.json`, false);
  try {
    fs.rmdirSync(scratch);
  } catch {
    /* something else was left in it: the folder stays, in the machine's own temporary place */
  }
});

const NOTHING = { app: "nothing", process: "nothing" };

describe("what a check of the existing suite is handed, whatever the machine holds", () => {
  it(`${CHECK} — a live-looking address written in an env file beside the suite is handed to no check`, () => {
    expect(
      nothingStopsTheEnvFile?.handed?.address.app,
      `harness: the env file is where a runner looks — read by a runner that nothing stops, it does reach a check (${shown(nothingStopsTheEnvFile)})`,
    ).toBe("what the env file holds");

    expect(fromTheEnvFile?.handed, `a check of the suite ran and said what it was handed (${shown(fromTheEnvFile)})`).not.toBeNull();
    expect(fromTheEnvFile?.code, `and the run ended well (${shown(fromTheEnvFile)})`).toBe(0);
    expect(fromTheEnvFile?.handed?.address, "the address the check was handed").toEqual(NOTHING);
    expect(fromTheEnvFile?.handed?.key, "the key the check was handed").toEqual(NOTHING);
    expect(fromTheEnvFile?.handed?.holders, "nothing around the check holds the made-up address or key, under any name").toEqual([]);
  });

  it(`${CHECK} — a live-looking address set in the shell, or for a whole job, is handed to no check`, () => {
    expect(
      [nothingStopsTheShell?.handed?.address.app, nothingStopsTheShell?.handed?.address.process],
      `harness: set in the shell and met by a runner that nothing stops, the address does reach a check (${shown(nothingStopsTheShell)})`,
    ).toContain("what the shell holds");

    expect(fromTheShell?.handed, `a check of the suite ran and said what it was handed (${shown(fromTheShell)})`).not.toBeNull();
    expect(fromTheShell?.code, `and the run ended well (${shown(fromTheShell)})`).toBe(0);
    expect(
      [fromTheShell?.handed?.comparison.app, fromTheShell?.handed?.comparison.process],
      "harness: what is set in the shell does arrive at a check — a value of another name did",
    ).toContain(COMPARISON_VALUE);

    expect(fromTheShell?.handed?.address, "the address the check was handed").toEqual(NOTHING);
    expect(fromTheShell?.handed?.key, "the key the check was handed").toEqual(NOTHING);
    expect(fromTheShell?.handed?.holders, "nothing around the check holds the made-up address or key, under any name").toEqual([]);
  });
});

{
  const REPOSITORY = process.cwd();
  const RUNNER = path.join(REPOSITORY, "node_modules", "vitest", "vitest.mjs");
  const CONFIGURATION = path.join(REPOSITORY, "vitest.config.ts");
  const LINKED = ["scripts", "node_modules"];

  const NAME = "VITE_COMPASS_ONLY_IN_THE_ENV_FILE";
  const VALUE = "made-up-and-written-in-the-env-file";
  const REPORT = "COMPASS_ENV_FILE_REPORT";

  const PROBE_FILE = "handed.probe.test.ts";
  const BARE_CONFIGURATION = "nothing-stops-it.config.mjs";
  const ENV_FILE = ".env.local";

  const PROBE = `
import fs from "node:fs";
import { it } from "vitest";

it("a check says what the env file handed it", () => {
  const handed = { app: String(import.meta.env.${NAME} ?? ""), process: String(process.env.${NAME} ?? "") };
  fs.writeFileSync(process.env.${REPORT}, JSON.stringify(handed));
});
`;

  type Handed = { app: string; process: string };
  type Run = { code: number | null; printed: string; handed: Handed | null };

  function run(scratch: string, name: string, words: string[]): Promise<Run> {
    const report = path.join(scratch, `${name}.report.json`);
    const around: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith("VITEST") && key !== NAME) around[key] = value;
    }
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [RUNNER, "run", ...words, "--root", scratch, PROBE_FILE], {
        cwd: REPOSITORY,
        env: { ...around, [REPORT]: report },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let printed = "";
      child.stdout.on("data", (chunk) => { printed += String(chunk); });
      child.stderr.on("data", (chunk) => { printed += String(chunk); });
      child.on("error", (error) => resolve({ code: null, printed: String(error), handed: null }));
      child.on("close", (code) => {
        let handed: Handed | null = null;
        try {
          handed = JSON.parse(fs.readFileSync(report, "utf8")) as Handed;
        } catch { /* the probe never ran */ }
        resolve({ code, printed, handed });
      });
    });
  }

  function shown(one: Run | undefined): string {
    if (!one) return "the run was never started";
    // eslint-disable-next-line no-control-regex
    return `exit code ${String(one.code)}; it printed:\n${one.printed.replace(/\u001b\[[0-9;]*m/g, "").trim().split("\n").slice(-15).join("\n")}`;
  }

  let scratch = "";
  const RUNS = ["as-the-suite", "nothing-stops-it"];
  let asTheSuite: Run | undefined;
  let nothingStopsIt: Run | undefined;

  beforeAll(async () => {
    scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "compass-env-file-")));
    fs.writeFileSync(path.join(scratch, ENV_FILE), `# Made up for a test.\n${NAME}=${VALUE}\n`);
    fs.writeFileSync(path.join(scratch, PROBE_FILE), PROBE);
    fs.writeFileSync(
      path.join(scratch, BARE_CONFIGURATION),
      `export default { test: { environment: "node", include: [${JSON.stringify(PROBE_FILE)}] } };\n`,
    );
    for (const folder of LINKED) fs.symlinkSync(path.join(REPOSITORY, folder), path.join(scratch, folder), "dir");

    [asTheSuite, nothingStopsIt] = await Promise.all([
      run(scratch, RUNS[0], ["--config", CONFIGURATION, "--project", "suite"]),
      run(scratch, RUNS[1], ["--config", path.join(scratch, BARE_CONFIGURATION)]),
    ]);
  }, 120_000);

  afterAll(() => {
    if (scratch === "" || !scratch.includes("compass-env-file-")) return;
    const unmake = (name: string, asLink: boolean): void => {
      const entry = path.join(scratch, name);
      try {
        const found = fs.lstatSync(entry);
        if (asLink ? found.isSymbolicLink() : found.isFile()) fs.unlinkSync(entry);
      } catch { /* it was never made */ }
    };
    for (const folder of LINKED) unmake(folder, true);
    for (const name of [ENV_FILE, PROBE_FILE, BARE_CONFIGURATION]) unmake(name, false);
    for (const name of RUNS) unmake(`${name}.report.json`, false);
    try {
      fs.rmdirSync(scratch);
    } catch { /* something else was left in it: the folder stays, in the machine's temporary place */ }
  });

  describe("the test runner and an env file beside the suite", () => {
    it("hands a check nothing of the env file, even a value of a name nothing blanks", () => {
      expect(
        nothingStopsIt?.handed?.app,
        `harness: read by a runner that nothing stops, the env file's value does reach a check (${shown(nothingStopsIt)})`,
      ).toBe(VALUE);

      expect(asTheSuite?.handed, `a check of the suite ran and said what it was handed (${shown(asTheSuite)})`).not.toBeNull();
      expect(asTheSuite?.code, `and the run ended well (${shown(asTheSuite)})`).toBe(0);
      expect(asTheSuite?.handed, "what the check was handed of the env file").toEqual({ app: "", process: "" });
    });
  });
}
