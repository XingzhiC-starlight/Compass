// @vitest-environment node

import { describe, expect, it } from "vitest";
import { runBrowserChecks } from "./commands.mjs";
import { PracticeRefusal } from "./lib.mjs";

const CHECK_JOURNEY =
  "With the practice copy up, the browser command runs the journey — landing page, sign-in, setup, one write on each of the five cards, archive, restore, sign-out — and passes; a deliberately false check makes it fail, name the check, and leave a picture and a recording of the moment";
const CHECK_RESET =
  'With the practice copy up, the browser command requests a reset link, follows it from the practice inbox through "Reset your password" and "Set a new password", and signs in with the new password';

const SETTINGS = {
  name: "compass-practice",
  address: "http://127.0.0.1:55321",
  inbox: "http://127.0.0.1:55324",
  app: "http://localhost:5183",
};

const PUBLIC_KEY = "sb_publishable_made_up_for_the_test";

type ToolAnswer = { code: number; text: string };

function statusAnswer(): ToolAnswer {
  const values = {
    API_URL: SETTINGS.address,
    DB_URL: "postgresql://postgres:a-made-up-password@127.0.0.1:55322/postgres",
    INBUCKET_URL: SETTINGS.inbox,
    MAILPIT_URL: SETTINGS.inbox,
    PUBLISHABLE_KEY: PUBLIC_KEY,
    ANON_KEY: "eyJ.made-up-public.key",
    SECRET_KEY: "sb_secret_made_up_for_the_test",
    SERVICE_ROLE_KEY: "eyJ.made-up-admin.key",
    JWT_SECRET: "made-up-jwt-secret-with-at-least-32-characters",
  };
  return { code: 0, text: `${JSON.stringify(values, null, 2)}\n` };
}

const DOWN: ToolAnswer = {
  code: 1,
  text: "failed to inspect container health: Error response from daemon: No such container: supabase_db_compass-practice\n",
};

function surroundings(script: { down?: boolean } = {}) {
  const asked: string[][] = [];
  const said: string[] = [];
  const sent: string[] = [];

  const tool = async (args: string[]): Promise<ToolAnswer> => {
    asked.push([...args]);
    if (args[0] === "status") return script.down ? DOWN : statusAnswer();
    return { code: 1, text: "failed to connect to postgres: connection refused\n" };
  };

  const request = async (input: unknown): Promise<Response> => {
    sent.push(input instanceof Request ? input.url : String(input));
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const around = {
    tool,
    say: (line: string) => {
      said.push(String(line));
    },
    settings: SETTINGS,
    linked: false,
    request: request as unknown as typeof fetch,
  };

  return { around, asked, said, sent };
}

type Told = { supabaseUrl: string; supabaseKey: string; turnstileSiteKey: "" };

function server() {
  const started: string[] = [];
  let closed = 0;
  const startServer = async (_told: Told, serveAt: string) => {
    started.push(serveAt);
    return {
      close: async () => {
        closed += 1;
      },
    };
  };
  return { startServer, started, closedTimes: () => closed };
}

type BrowserCheck = { name: string; file: string; passed: boolean; tries: number; line?: number };

function browserRunner(checks: BrowserCheck[]) {
  const calls: { where: unknown; options: unknown }[] = [];
  const runJourneys = async (where: { app: string; inbox: string }, options: { secondTry: boolean; files: string[] }) => {
    calls.push({ where: { ...where }, options: { ...options, files: [...(options?.files ?? [])] } });
    return { checks: checks.map((one) => ({ ...one })), troubles: [] };
  };
  return { runJourneys, calls };
}

const RESET = "browser/a-reset-link.browser.ts";

const RESET_STOPS: BrowserCheck[] = [
  "requests a reset link",
  'follows it from the practice inbox to "Reset your password"',
  'sets a new password on "Set a new password"',
  "signs in with the new password",
].map((title, index) => ({ name: `a reset link > ${title}`, file: RESET, passed: true, tries: 1, line: 12 + index * 10 }));

type Outcome<T> = { threw: boolean; value?: T; error?: unknown };

async function trying<T>(run: () => Promise<T> | T): Promise<Outcome<T>> {
  try {
    return { threw: false, value: await run() };
  } catch (error) {
    return { threw: true, error };
  }
}

function told(outcome: Outcome<unknown>): string {
  if (outcome.threw) return `it threw: ${String(outcome.error)}`;
  try {
    return `it answered: ${JSON.stringify(outcome.value)}`;
  } catch {
    return `it answered: ${String(outcome.value)}`;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function expectNoMatch(outcome: Outcome<unknown>): void {
  expect(outcome.threw, `the command refused to go on (${told(outcome)})`).toBe(true);
  expect(outcome.error, `it refused as a practice command does (${told(outcome)})`).toBeInstanceOf(PracticeRefusal);
  expect((outcome.error as { kind?: unknown }).kind, "the reason is that a name matches no journey file").toBe("no-match");
}

describe("the browser command, with no journey named", () => {
  it(`${CHECK_JOURNEY} — with no name given, the browser's runner is handed no names, so every journey runs`, async () => {
    const { around } = surroundings();
    const { startServer } = server();
    const { runJourneys, calls } = browserRunner(RESET_STOPS);

    const outcome = await trying(() => runBrowserChecks(around, startServer, runJourneys));

    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    expect(calls, "the browser was run once, at the practice app's address, with the inbox, nothing tried twice and no name: every journey").toEqual([
      { where: { app: SETTINGS.app, inbox: SETTINGS.inbox }, options: { secondTry: false, files: [] } },
    ]);
  });
});

describe("the browser command, with the reset link's journey named", () => {
  it(`${CHECK_RESET} — named after the command, the reset link's journey is handed to the browser alone, and its run is reported`, async () => {
    const { around, said } = surroundings();
    const { startServer, started, closedTimes } = server();
    const { runJourneys, calls } = browserRunner(RESET_STOPS);

    const outcome = await trying(() => runBrowserChecks(around, startServer, runJourneys, { files: [RESET] }));

    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    expect(started, "its own copy of the app was started, at the practice app's address").toEqual([SETTINGS.app]);
    expect(calls, "the browser was run once, with the reset link's journey alone, as it was typed").toEqual([
      { where: { app: SETTINGS.app, inbox: SETTINGS.inbox }, options: { secondTry: false, files: [RESET] } },
    ]);
    expect(outcome.value, "the run passed, every stop of the journey ran and none failed").toEqual({
      passed: true,
      ran: RESET_STOPS.length,
      failed: [],
      secondTry: [],
      notProven: [],
    });
    expect(said[said.length - 1], "the closing line says every browser check passed").toBe(
      `Every browser check passed (${RESET_STOPS.length} of ${RESET_STOPS.length}).`,
    );
    expect(closedTimes(), "the app it started was closed afterwards").toBe(1);
  });

  it(`${CHECK_RESET} — a name that matches no journey file is refused before anything runs, and the message holds the name and says no check was run`, async () => {
    const typo = "browser/a-reset-lnik.browser.ts";
    const { around, asked, said, sent } = surroundings();
    const { startServer, started } = server();
    const { runJourneys, calls } = browserRunner(RESET_STOPS);

    const outcome = await trying(() => runBrowserChecks(around, startServer, runJourneys, { files: [typo] }));

    expectNoMatch(outcome);
    expect(messageOf(outcome.error), "the message names the mistyped name and says no check was run").toBe(
      `No browser check file matches the name "${typo}". No check was run.`,
    );
    expect(asked, "the practice copy was not even looked for").toEqual([]);
    expect(started, "no copy of the app was started").toEqual([]);
    expect(calls, "the browser never ran").toEqual([]);
    expect(sent, "nothing was sent").toEqual([]);
    expect(said, "nothing is said: no check is reported, as passed or otherwise").toEqual([]);
  });

  it(`${CHECK_RESET} — beside the reset link's journey, a name that matches no file is refused, alone in the message, and nothing runs`, async () => {
    const typo = "browser/no-such-journey.browser.ts";
    const { around, said } = surroundings();
    const { startServer, started } = server();
    const { runJourneys, calls } = browserRunner(RESET_STOPS);

    const outcome = await trying(() => runBrowserChecks(around, startServer, runJourneys, { files: [RESET, typo] }));

    expectNoMatch(outcome);
    expect(messageOf(outcome.error), "the message names the one name that matches nothing, and not the one that does").toBe(
      `No browser check file matches the name "${typo}". No check was run.`,
    );
    expect(started, "no copy of the app was started").toEqual([]);
    expect(calls, "the browser never ran, not even for the journey that was named rightly").toEqual([]);
    expect(said, "nothing is said").toEqual([]);
  });

  it(`${CHECK_RESET} — several names that match no file are all refused at once, each between double quotes, in the order given`, async () => {
    const first = "browser/one-typo.browser.ts";
    const second = "browser/two-typo.browser.ts";
    const { around } = surroundings();
    const { startServer } = server();
    const { runJourneys, calls } = browserRunner(RESET_STOPS);

    const outcome = await trying(() => runBrowserChecks(around, startServer, runJourneys, { files: [first, second] }));

    expectNoMatch(outcome);
    expect(messageOf(outcome.error), "the message names both, in the order given, and says no check was run").toBe(
      `No browser check file matches these names: "${first}", "${second}". No check was run.`,
    );
    expect(calls, "the browser never ran").toEqual([]);
  });

  it(`${CHECK_RESET} — with the practice copy down, a name that matches no file is still told as such, before the practice copy is looked for`, async () => {
    const typo = "browser/a-reset-lnik.browser.ts";
    const { around, asked, said } = surroundings({ down: true });
    const { startServer, started } = server();
    const { runJourneys, calls } = browserRunner(RESET_STOPS);

    const outcome = await trying(() => runBrowserChecks(around, startServer, runJourneys, { files: [typo] }));

    expectNoMatch(outcome);
    expect(messageOf(outcome.error), "the message names the mistyped name").toContain(`"${typo}"`);
    expect(asked, "the practice copy was not looked for").toEqual([]);
    expect(started, "no copy of the app was started").toEqual([]);
    expect(calls, "the browser never ran").toEqual([]);
    expect(said, "nothing is said").toEqual([]);
  });
});
