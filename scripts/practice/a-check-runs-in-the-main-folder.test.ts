// @vitest-environment node

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPOSITORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNNER = path.join(REPOSITORY, "node_modules", "vitest", "vitest.mjs");
const SETTINGS = path.join(REPOSITORY, "vitest.config.ts");

const PROBE = `
import { expect, it } from "vitest";

it("runs in the repository's main folder", () => {
  expect(process.cwd()).toBe(${JSON.stringify(fs.realpathSync(REPOSITORY))});
});

const reach = (address) => void fetch(address).catch(() => {});

it("leaves a timer running", () => {
  setTimeout(() => reach("http://compass-ch033.invalid/by-a-timer"), 40);
});

it("leaves an interval running", () => {
  const interval = setInterval(() => {
    clearInterval(interval);
    reach("http://compass-ch033.invalid/by-an-interval");
  }, 40);
});

it("leaves a promise chain running", () => {
  void Promise.resolve()
    .then(() => new Promise((resolve) => setTimeout(resolve, 40)))
    .then(() => reach("http://compass-ch033.invalid/by-a-promise-chain"));
});

it("makes no attempt, and waits while the three arrive", async () => {
  await new Promise((resolve) => setTimeout(resolve, 300));
});
`;

const AT_THE_END: Record<string, string> = {
  "clean-up.probe.test.ts": `
import { beforeAll, it } from "vitest";

beforeAll(() => async () => {
  await fetch("http://compass-ch033.invalid/by-a-clean-up-handed-back").catch(() => {});
});

it("passes beside a clean-up that reaches out", () => {});
`,
  "switched-off.probe.test.ts": `
import { it } from "vitest";

void fetch("http://compass-ch033.invalid/as-a-switched-off-file-loaded").catch(() => {});

it.skip("is switched off, as every check of its file is", () => {});
`,
  "closing-fails.probe.test.ts": `
import { afterAll, it } from "vitest";

it("leaves a timer running before a closing step that goes wrong", () => {
  setTimeout(() => void fetch("http://compass-ch033.invalid/before-a-closing-step-goes-wrong").catch(() => {}), 20);
});

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
  throw new Error("a closing step that goes wrong on purpose");
});
`,
  "fake-timers.probe.test.ts": `
import { it, vi } from "vitest";

it("leaves fake timers on, with something queued", () => {
  vi.useFakeTimers();
  setTimeout(() => void fetch("http://compass-ch033.invalid/queued-on-a-fake-timer").catch(() => {}), 1000);
});

it("runs whatever fake timers hold, and makes no attempt of its own", () => {
  if (vi.isFakeTimers()) vi.runAllTimers();
});
`,
  "fake-timers-for-the-file.probe.test.ts": `
import { afterAll, beforeAll, expect, it, vi } from "vitest";

beforeAll(() => {
  vi.useFakeTimers();
});
afterAll(() => {
  vi.useRealTimers();
});

it("has the fake timers its file turned on", () => {
  expect(vi.isFakeTimers()).toBe(true);
});

it("still has them after the check before it ended", () => {
  expect(vi.isFakeTimers()).toBe(true);
});
`,
  "cannot-load.probe.test.ts": `
void fetch("http://compass-ch033.invalid/as-a-file-that-cannot-load-loaded").catch(() => {});

throw new Error("a file that cannot load, on purpose");
`,
};

type Run = {
  code: number | null;
  printed: string;
  states: Record<string, string>;
  files: Record<string, string>;
};

let scratch = "";
let run: Run;

function filesIn(report: unknown): Record<string, string> {
  const results = (report as { testResults?: { name: string; status: string }[] }).testResults ?? [];
  return Object.fromEntries(results.map((file) => [path.basename(file.name), file.status]));
}

function statesIn(report: unknown): Record<string, string> {
  const states: Record<string, string> = {};
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value === null || typeof value !== "object") return;
    const one = value as Record<string, unknown>;
    if (typeof one.title === "string" && typeof one.status === "string") states[one.title] = one.status;
    Object.values(one).forEach(walk);
  };
  walk(report);
  return states;
}

function runTheProbe(): Promise<Run> {
  const report = path.join(scratch, "report.json");
  const words = [
    RUNNER, "run", "--config", SETTINGS, "--project", "suite", "--root", scratch,
    "--reporter=default", "--reporter=json", `--outputFile.json=${report}`, ".probe.test.ts",
  ];
  const around = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("VITEST")));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, words, { cwd: scratch, env: around, stdio: ["ignore", "pipe", "pipe"] });
    let printed = "";
    child.stdout.on("data", (chunk) => (printed += String(chunk)));
    child.stderr.on("data", (chunk) => (printed += String(chunk)));
    const stop = setTimeout(() => {
      printed += "\n(stopped after 50 seconds)";
      child.kill("SIGKILL");
    }, 50_000);
    child.on("close", (code) => {
      clearTimeout(stop);
      let states: Record<string, string> = {};
      let files: Record<string, string> = {};
      try {
        const json = JSON.parse(fs.readFileSync(report, "utf8"));
        states = statesIn(json);
        files = filesIn(json);
      } catch {
        /* no report: the states stay empty, and the test says so */
      }
      // eslint-disable-next-line no-control-regex
      resolve({ code, printed: printed.replace(/\x1b\[[0-9;]*m/g, ""), states, files });
    });
  });
}

beforeAll(async () => {
  scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "compass-ch033-carriers-")));
  for (const linked of ["scripts", "node_modules"]) fs.symlinkSync(path.join(REPOSITORY, linked), path.join(scratch, linked));
  fs.writeFileSync(path.join(scratch, "late.probe.test.ts"), PROBE);
  for (const [name, probe] of Object.entries(AT_THE_END)) fs.writeFileSync(path.join(scratch, name), probe);
  run = await runTheProbe();
}, 60_000);

afterAll(() => {
  if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
});

describe("the working folder of a check", () => {
  it("is the repository's main folder, though the run was started in another folder and reached the setup through a link", () => {
    expect(run.states["runs in the repository's main folder"], run.printed.slice(-1500)).toBe("passed");
  });
});
