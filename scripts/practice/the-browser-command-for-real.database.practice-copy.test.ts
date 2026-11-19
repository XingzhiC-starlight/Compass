import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { realSurroundings } from "./cli.mjs";
import { MAIN_FOLDER } from "./lib.mjs";

const CHECK_JOURNEY =
  "With the practice copy up, the browser command runs the journey — landing page, sign-in, setup, one write on each of the five cards, archive, restore, sign-out — and passes; a deliberately false check makes it fail, name the check, and leave a picture and a recording of the moment";
const CHECK_RESET =
  'With the practice copy up, the browser command requests a reset link, follows it from the practice inbox through "Reset your password" and "Set a new password", and signs in with the new password';
const CHECK_RELOAD =
  "After choosing a second project and reloading the page, the browser command sees that project still open (spec §18) — a check the pretend page could not make";
const CHECK_TAKEN =
  "With something else already at the practice app's address, the browser command refuses to run and says so, rather than driving whatever is there";

const FALSE_FILE = "browser/false-on-purpose.browser.ts";

const RUN_LIMIT_MS = 6 * 60_000;

type Ran = { code: number | null; text: string; lines: string[] };

function runBrowserCommand(names: string[] = [], extraEnv: Record<string, string> = {}): Promise<Ran> {
  const env: Record<string, string | undefined> = { ...process.env, ...extraEnv };
  delete env.VITE_SUPABASE_URL;
  delete env.VITE_SUPABASE_ANON_KEY;
  delete env.VITE_TURNSTILE_SITE_KEY;
  if (!("BROWSER_FALSE_CHECK" in extraEnv)) delete env.BROWSER_FALSE_CHECK;
  if (!("BROWSER_SECOND_TRY_CHECK" in extraEnv)) delete env.BROWSER_SECOND_TRY_CHECK;

  return new Promise((resolve) => {
    let text = "";
    const child = spawn(process.execPath, [path.join(MAIN_FOLDER, "scripts", "practice", "cli.mjs"), "browser", ...names], {
      cwd: MAIN_FOLDER,
      env: env as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      text += "\n[this test stopped the command: it ran past its time limit]\n";
      child.kill("SIGTERM");
    }, RUN_LIMIT_MS - 30_000);
    child.stdout.on("data", (chunk) => {
      text += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      text += String(chunk);
    });
    child.on("error", (error) => {
      text += `\n[could not start the command: ${error.message}]\n`;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      resolve({ code, text, lines });
    });
  });
}

function tail(ran: Ran): string {
  return ran.lines.slice(-15).join("\n");
}

const CLOSING_PASSED = /^Every browser check passed \((\d+) of (\d+)\)\.$/;

/* The runner's second try (retry) calls `beforeEach` again but never `beforeAll`, so the run is
   made in `beforeEach`. */
function sharedRun<T>(make: () => Promise<T>, limitMs: number): () => T {
  let current: T | undefined;
  let made = 0;
  const readBy = new Map<string, number>();
  beforeEach(async ({ task }) => {
    if (current === undefined || readBy.get(task.id) === made) {
      current = await make();
      made += 1;
    }
    readBy.set(task.id, made);
  }, limitMs);
  return () => current as T;
}

describe("the browser command, run for real with the practice copy up", () => {
  const journeyRun = sharedRun(() => runBrowserCommand(), RUN_LIMIT_MS);

  function expectGreen(ran: Ran): void {
    const closing = ran.lines.filter((line) => CLOSING_PASSED.test(line));
    expect(closing, `the command's closing line says every browser check passed; it printed, last:\n${tail(ran)}`).toHaveLength(1);
    const [, passed, of] = CLOSING_PASSED.exec(closing[0] ?? "") ?? [];
    expect(Number(passed), "as many passed as ran").toBe(Number(of));
    expect(Number(of), "at least one browser check ran").toBeGreaterThan(0);
    expect(ran.lines.filter((line) => line.startsWith("failed")), "no line reports a check that failed").toEqual([]);
    expect(ran.lines.filter((line) => line.startsWith("not proven")), "nothing went wrong outside the checks").toEqual([]);
    expect(ran.code, `the command ended green; it printed, last:\n${tail(ran)}`).toBe(0);
  }

  it(`${CHECK_JOURNEY} — the journey runs and passes`, () => {
    expectGreen(journeyRun());
  });

  it(`${CHECK_RESET} — the run that holds the reset link followed from the practice inbox passes`, () => {
    expectGreen(journeyRun());
  });

  it(`${CHECK_RELOAD} — the run that holds the second project still open after a reload passes`, () => {
    expectGreen(journeyRun());
  });
});

describe("the browser command, run for real with a check that is false on purpose", () => {
  const theFalseRun = sharedRun(() => runBrowserCommand([FALSE_FILE], { BROWSER_FALSE_CHECK: "1" }), RUN_LIMIT_MS);

  it(`${CHECK_JOURNEY} — a deliberately false check makes it fail`, () => {
    const falseRun = theFalseRun();
    expect(falseRun.code, `the command failed; it printed, last:\n${tail(falseRun)}`).not.toBe(0);
    expect(falseRun.code, "it ended on its own, with an exit code").not.toBeNull();
    expect(
      falseRun.lines.filter((line) => CLOSING_PASSED.test(line)),
      "the closing line does not say every check passed",
    ).toEqual([]);
    expect(
      falseRun.lines.some((line) => /^\d+ of \d+ browser checks failed\.$/.test(line)),
      `the closing line says how many browser checks failed; it printed, last:\n${tail(falseRun)}`,
    ).toBe(true);
  });

  it(`${CHECK_JOURNEY} — the failure names the check that is false on purpose`, () => {
    const falseRun = theFalseRun();
    const named = falseRun.lines.filter((line) => line.startsWith("failed") && line.includes(FALSE_FILE));
    expect(named, `one line reports the false check as failed, at its place; it printed, last:\n${tail(falseRun)}`).toHaveLength(1);
    expect(named[0], "the line names the check's place, its file and the line it begins at").toMatch(
      new RegExp(`${FALSE_FILE.replace(/[.]/g, "\\.")}:\\d+`),
    );
  });

  it(`${CHECK_JOURNEY} — the failure leaves a picture and a recording of the moment, really there on disk`, () => {
    const falseRun = theFalseRun();
    const line = falseRun.lines.find((one) => one.startsWith("failed") && one.includes(FALSE_FILE)) ?? "";
    const picture = /picture (\S+?)(,|$)/.exec(line)?.[1];
    const recording = /recording (\S+?)(,|$)/.exec(line)?.[1];

    expect(picture, `the line says where the picture is: ${JSON.stringify(line)}`).toBeTruthy();
    expect(recording, `the line says where the recording is: ${JSON.stringify(line)}`).toBeTruthy();

    const pictureOnDisk = path.join(MAIN_FOLDER, picture ?? "missing-picture");
    const recordingOnDisk = path.join(MAIN_FOLDER, recording ?? "missing-recording");
    expect(fs.existsSync(pictureOnDisk) && fs.statSync(pictureOnDisk).size > 0, `a picture is kept at ${picture}`).toBe(true);
    expect(fs.existsSync(recordingOnDisk) && fs.statSync(recordingOnDisk).size > 0, `a recording is kept at ${recording}`).toBe(
      true,
    );
  });
});

describe("the browser command, run for real with the practice app's address taken", () => {
  const visits: string[] = [];
  let holder: http.Server | null = null;
  let heldByThisFile = false;

  beforeAll(async () => {
    const port = Number(new URL(realSurroundings().settings.app).port);
    holder = http.createServer((request, response) => {
      visits.push(String(request.url));
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<!doctype html><title>Something else</title><p>Not Compass.</p>");
    });
    heldByThisFile = await new Promise<boolean>((resolve) => {
      holder?.once("error", () => resolve(false));
      holder?.listen(port, () => resolve(true));
    });
  });

  const refusedRun = sharedRun(() => {
    visits.length = 0;
    return runBrowserCommand();
  }, RUN_LIMIT_MS);

  afterAll(async () => {
    if (holder && heldByThisFile) await new Promise<void>((resolve) => holder?.close(() => resolve()));
  });

  it(`${CHECK_TAKEN} — it refuses to run, and says that the address is taken`, () => {
    const refused = refusedRun();
    expect(heldByThisFile, "this file holds the practice app's address (nothing of the owner's was running there)").toBe(true);
    expect(refused.code, `the command refused; it printed, last:\n${tail(refused)}`).not.toBe(0);
    expect(refused.code, "it ended on its own, with an exit code").not.toBeNull();
    expect(refused.text, `it says that the address is taken; it printed, last:\n${tail(refused)}`).toMatch(/taken|in use/i);
    expect(refused.text, "it reports no check as passed").not.toMatch(/passed/i);
  });

  it(`${CHECK_TAKEN} — whatever is at that address is never driven: it is sent nothing`, () => {
    const refused = refusedRun();
    expect(heldByThisFile, "this file holds the practice app's address (nothing of the owner's was running there)").toBe(true);
    expect(refused.code, `the command refused; it printed, last:\n${tail(refused)}`).not.toBe(0);
    expect(refused.text, `it says that the address is taken; it printed, last:\n${tail(refused)}`).toMatch(/taken|in use/i);
    expect(visits, "nothing was asked of what holds the address").toEqual([]);
  });
});
