// @vitest-environment node

import { describe, expect, it } from "vitest";
import { runBrowserChecks } from "./commands.mjs";
import { PracticeRefusal } from "./lib.mjs";

const CHECK_JOURNEY =
  "With the practice copy up, the browser command runs the journey — landing page, sign-in, setup, one write on each of the five cards, archive, restore, sign-out — and passes; a deliberately false check makes it fail, name the check, and leave a picture and a recording of the moment";
const CHECK_DOWN =
  "With the practice copy down, the browser command stops at once with a message saying what to start, and reports no check as passed";
const CHECK_TAKEN =
  "With something else already at the practice app's address, the browser command refuses to run and says so, rather than driving whatever is there";

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
  return { code: 0, text: `Stopped services: supabase_imgproxy_compass-practice\n${JSON.stringify(values, null, 2)}\n` };
}

const DOWN: ToolAnswer = {
  code: 1,
  text: "failed to inspect container health: Error response from daemon: No such container: supabase_db_compass-practice\n",
};

const CANNOT_CONNECT: ToolAnswer = {
  code: 1,
  text: "Connecting to local database...\nfailed to connect to postgres: connection refused\n",
};

function surroundings(script: { down?: boolean } = {}) {
  const asked: string[][] = [];
  const said: string[] = [];
  const sent: string[] = [];

  const tool = async (args: string[]): Promise<ToolAnswer> => {
    asked.push([...args]);
    if (args[0] === "status") return script.down ? DOWN : statusAnswer();
    return CANNOT_CONNECT;
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

function server(script: { taken?: boolean } = {}) {
  const started: { told: Told; serveAt: string }[] = [];
  let closed = 0;
  const startServer = async (told: Told, serveAt: string) => {
    started.push({ told: { ...told }, serveAt });
    if (script.taken) {
      throw new Error(`the port ${new URL(serveAt).port} is already in use`);
    }
    return {
      close: async () => {
        closed += 1;
      },
    };
  };
  return { startServer, started, closedTimes: () => closed };
}

type BrowserCheck = {
  name: string;
  file: string;
  passed: boolean;
  tries: number;
  line?: number;
  picture?: string;
  recording?: string;
  firstFailurePicture?: string;
};

function browserRunner(checks: BrowserCheck[]) {
  const calls: { where: unknown; options: unknown }[] = [];
  const runJourneys = async (where: { app: string; inbox: string }, options: { secondTry: boolean }) => {
    calls.push({ where: { ...where }, options: { ...options } });
    return { checks: checks.map((one) => ({ ...one })), troubles: [] };
  };
  return { runJourneys, calls };
}

const JOURNEY = "browser/the-journey.browser.ts";
const FALSE_FILE = "browser/false-on-purpose.browser.ts";

const STOPS = [
  "opens the landing page",
  "signs in as a practice account",
  "sets up a project",
  "writes on the first card",
  "writes on the second card",
  "writes on the third card",
  "writes on the fourth card",
  "writes on the fifth card",
  "archives the project",
  "restores the project",
  "signs out",
].map((title, index): BrowserCheck => ({
  name: `the journey > ${title}`,
  file: JOURNEY,
  passed: true,
  tries: 1,
  line: 10 + index * 12,
}));

const FALSE_CHECK: BrowserCheck = {
  name: "kept for proving that a failure is reported > false on purpose: expects a heading that is never shown",
  file: FALSE_FILE,
  passed: false,
  tries: 1,
  line: 7,
  picture: "browser/results/false-on-purpose-expects-a-heading/test-failed-1.png",
  recording: "browser/results/false-on-purpose-expects-a-heading/video.webm",
};

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

function expectRefusal(outcome: Outcome<unknown>, kind: string, why: string): void {
  expect(outcome.threw, `the command refused to go on (${told(outcome)})`).toBe(true);
  expect(outcome.error, `it refused as a practice command does (${told(outcome)})`).toBeInstanceOf(PracticeRefusal);
  expect((outcome.error as { kind?: unknown }).kind, why).toBe(kind);
}

describe("the browser command, with the practice copy up", () => {
  it(`${CHECK_JOURNEY} — it starts its own copy of the app at the practice app's address, pointed at the practice copy, and hands the browser that address and the inbox`, async () => {
    const { around } = surroundings();
    const { startServer, started, closedTimes } = server();
    const { runJourneys, calls } = browserRunner(STOPS);

    const outcome = await trying(() => runBrowserChecks(around, startServer, runJourneys));

    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    expect(started, "one copy of the app was started, at the practice app's address, told the practice copy's address and public key and no CAPTCHA key").toEqual([
      { told: { supabaseUrl: SETTINGS.address, supabaseKey: PUBLIC_KEY, turnstileSiteKey: "" }, serveAt: SETTINGS.app },
    ]);
    const withoutNoNames = calls.map(({ where, options }) => {
      const { files, ...rest } = options as { files?: unknown };
      return { where, options: Array.isArray(files) && files.length === 0 ? rest : options };
    });
    expect(withoutNoNames, "the browser was run once, at the practice app's address, with the practice inbox, and nothing tried twice on this machine").toEqual([
      { where: { app: SETTINGS.app, inbox: SETTINGS.inbox }, options: { secondTry: false } },
    ]);
    expect(closedTimes(), "the app it started was closed afterwards").toBe(1);
  });

  it(`${CHECK_JOURNEY} — a journey whose every stop passed passes, and says so`, async () => {
    const { around, said } = surroundings();
    const { startServer } = server();
    const { runJourneys } = browserRunner(STOPS);

    const outcome = await trying(() => runBrowserChecks(around, startServer, runJourneys));

    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    expect(outcome.value, "the run passed, every stop ran and none failed").toEqual({
      passed: true,
      ran: STOPS.length,
      failed: [],
      secondTry: [],
      notProven: [],
    });
    expect(said.filter((line) => line.startsWith("failed")), "no check is reported as failed").toEqual([]);
    expect(said[said.length - 1], "the closing line says every browser check passed").toBe(
      `Every browser check passed (${STOPS.length} of ${STOPS.length}).`,
    );
  });

  it(`${CHECK_JOURNEY} — a deliberately false check makes the run fail, and the run names it and says where its picture and its recording are`, async () => {
    const { around, said } = surroundings();
    const { startServer, closedTimes } = server();
    const { runJourneys } = browserRunner([...STOPS, FALSE_CHECK]);
    const ran = STOPS.length + 1;

    const outcome = await trying(() => runBrowserChecks(around, startServer, runJourneys));

    expect(outcome.threw, `a check that failed is an answer, not a refusal (${told(outcome)})`).toBe(false);
    expect(outcome.value?.passed, "the run did not pass").toBe(false);
    expect(outcome.value?.failed, "the false check is named among the checks that failed").toEqual([FALSE_CHECK.name]);
    expect(outcome.value?.ran, "every check that ran is counted").toBe(ran);

    const failedLines = said.filter((line) => line.startsWith("failed"));
    expect(failedLines, "one line reports the check that failed").toHaveLength(1);
    const line = failedLines[0] ?? "";
    expect(line, "the line names the check's place").toContain(`${FALSE_FILE}:${FALSE_CHECK.line}`);
    expect(line, "the line names the check").toContain(FALSE_CHECK.name);
    expect(line, "the line says where its picture and its recording are").toContain(
      ` — picture ${FALSE_CHECK.picture}, recording ${FALSE_CHECK.recording}`,
    );
    expect(said[said.length - 1], "the closing line says how many failed").toBe(`1 of ${ran} browser checks failed.`);
    expect(closedTimes(), "the app it started was closed afterwards").toBe(1);
  });
});

describe("the browser command, with the practice copy down", () => {
  it(`${CHECK_DOWN} — it stops with a message that names the command that starts the practice copy`, async () => {
    const { around } = surroundings({ down: true });
    const { startServer } = server();
    const { runJourneys } = browserRunner(STOPS);

    const outcome = await trying(() => runBrowserChecks(around, startServer, runJourneys));

    expectRefusal(outcome, "down", "the reason is that the practice copy is down");
    expect(messageOf(outcome.error), "the message says what to start").toContain("npm run practice:up");
  });

  it(`${CHECK_DOWN} — at once: no app is started, the browser never runs, nothing is sent and no line reports a check`, async () => {
    const { around, asked, said, sent } = surroundings({ down: true });
    const { startServer, started } = server();
    const { runJourneys, calls } = browserRunner(STOPS);

    const outcome = await trying(() => runBrowserChecks(around, startServer, runJourneys));

    expectRefusal(outcome, "down", "the reason is that the practice copy is down");
    expect(asked, "the tool was asked where the practice copy is, once, and nothing further").toEqual([["status", "-o", "json"]]);
    expect(started, "no copy of the app was started").toEqual([]);
    expect(calls, "the browser never ran").toEqual([]);
    expect(sent, "nothing was sent").toEqual([]);
    expect(said, "nothing is said: no check is reported, as passed or otherwise").toEqual([]);
  });
});

describe("the browser command, with something else at the practice app's address", () => {
  it(`${CHECK_TAKEN} — it refuses, because the address is taken, and its message says so`, async () => {
    const { around } = surroundings();
    const { startServer, started } = server({ taken: true });
    const { runJourneys } = browserRunner(STOPS);

    const outcome = await trying(() => runBrowserChecks(around, startServer, runJourneys));

    expectRefusal(outcome, "taken", "the reason is that the practice app's address is taken");
    expect(messageOf(outcome.error), "the message says that the address is taken").toMatch(/taken|in use/i);
    expect(started.map((one) => one.serveAt), "it tried the practice app's address only, once, and no other").toEqual([SETTINGS.app]);
  });

  it(`${CHECK_TAKEN} — the browser never runs, so nothing there is driven, and no check is reported`, async () => {
    const { around, said } = surroundings();
    const { startServer } = server({ taken: true });
    const { runJourneys, calls } = browserRunner(STOPS);

    const outcome = await trying(() => runBrowserChecks(around, startServer, runJourneys));

    expectRefusal(outcome, "taken", "the reason is that the practice app's address is taken");
    expect(calls, "the browser never ran: whatever is at that address was not driven").toEqual([]);
    expect(said, "nothing is said: no check is reported").toEqual([]);
  });
});
