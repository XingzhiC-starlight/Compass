import { spawn } from "node:child_process";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { MAIN_FOLDER } from "./lib.mjs";

const CHECK_RESET =
  'With the practice copy up, the browser command requests a reset link, follows it from the practice inbox through "Reset your password" and "Set a new password", and signs in with the new password';
const CHECK_RELOAD =
  "After choosing a second project and reloading the page, the browser command sees that project still open (spec §18) — a check the pretend page could not make";

const RESET = "browser/a-reset-link.browser.ts";
const RELOAD = "reload";

const RUN_LIMIT_MS = 6 * 60_000;

type Ran = { code: number | null; text: string; lines: string[] };

function runBrowserCommand(names: string[], extraEnv: Record<string, string> = {}): Promise<Ran> {
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

describe("the browser command, run for real with the reset link's journey named", () => {
  const theResetRuns = sharedRun(
    async () => ({
      resetAlone: await runBrowserCommand([RESET]),
      resetBesideFalse: await runBrowserCommand([RESET], { BROWSER_FALSE_CHECK: "1" }),
    }),
    2 * RUN_LIMIT_MS,
  );

  it(`${CHECK_RESET} — the reset link's journey, run alone by its name, passes`, () => {
    const { resetAlone } = theResetRuns();
    expectGreen(resetAlone);
  });

  it(`${CHECK_RESET} — the journey named runs alone: the check false on purpose, though asked for, does not join it, and the run passes`, () => {
    const { resetAlone, resetBesideFalse } = theResetRuns();
    expect(
      resetBesideFalse.lines.filter((line) => line.includes("false-on-purpose")),
      `no line names the check false on purpose; it printed, last:\n${tail(resetBesideFalse)}`,
    ).toEqual([]);
    expectGreen(resetBesideFalse);
    const [, , ofAlone] = CLOSING_PASSED.exec(resetAlone.lines.find((line) => CLOSING_PASSED.test(line)) ?? "") ?? [];
    const [, , ofBeside] = CLOSING_PASSED.exec(resetBesideFalse.lines.find((line) => CLOSING_PASSED.test(line)) ?? "") ?? [];
    expect(Number(ofBeside), "as many checks ran as when the reset journey ran by itself").toBe(Number(ofAlone));
  });
});

describe("the browser command, run for real with the second project's journey named", () => {
  const theReloadRun = sharedRun(() => runBrowserCommand([RELOAD]), RUN_LIMIT_MS);

  it(`${CHECK_RELOAD} — the journey that chooses a second project and reloads, run alone by its name, passes`, () => {
    expectGreen(theReloadRun());
  });
});

describe("the browser command, run for real with a name that matches no journey", () => {
  const typo = "browser/a-reset-lnik.browser.ts";
  const theRefusedRun = sharedRun(() => runBrowserCommand([typo]), RUN_LIMIT_MS);

  it(`${CHECK_RESET} — a mistyped journey name is refused, said in plain words, and no check is reported as passed`, () => {
    const refused = theRefusedRun();
    expect(refused.code, `the command refused; it printed, last:\n${tail(refused)}`).not.toBe(0);
    expect(refused.code, "it ended on its own, with an exit code").not.toBeNull();
    expect(refused.text, `it says that no journey file matches the name; it printed, last:\n${tail(refused)}`).toContain(
      `No browser check file matches the name "${typo}". No check was run.`,
    );
    expect(refused.lines.filter((line) => CLOSING_PASSED.test(line)), "it reports no check as passed").toEqual([]);
  });
});
