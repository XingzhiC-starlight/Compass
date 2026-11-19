// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeAccounts, prepareDatabaseRun, runDatabaseChecks, runRolledBackChecks } from "./commands.mjs";
import { forgetNetworkAttempts, judgeAddress, judgeRolledBackCheck, pickPublicValues, PracticeRefusal, readSettings } from "./lib.mjs";

const CHECK_DOWN =
  "With the practice copy down, the database command stops at once with a message saying what to start: it asks nothing further, sends nothing and runs no check";
const CHECK_ADDRESS =
  "Pointed at any address that is not the practice copy on this machine — the live project's included — the database command refuses before sending anything";

const SETTINGS = {
  name: "compass-practice",
  address: "http://127.0.0.1:55321",
  inbox: "http://127.0.0.1:55324",
  app: "http://localhost:5183",
};

const LIVE = "https://your-project-ref.supabase.co";

const PUBLIC_KEY = "sb_publishable_made_up_for_the_test";

const ACCOUNTS = [
  { email: "practice-one@compass.test", password: "Practice-one-1!" },
  { email: "practice-two@compass.test", password: "Practice-two-2!" },
];

const COMMITTED = ["0001_init.sql", "0002_save_interview.sql"];
const CHECK_FILE = "supabase/checks/0002_save_interview.sql";

type ToolAnswer = { code: number; text: string };

function statusAnswer(over: Record<string, string> = {}): ToolAnswer {
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
    ...over,
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

const STARTED: ToolAnswer = {
  code: 0,
  text: [
    "Starting database...",
    "Initialising schema...",
    "Applying migration 0001_init.sql...",
    "Applying migration 0002_save_interview.sql...",
    "Starting containers...",
    "Started supabase local development setup.",
    "",
  ].join("\n"),
};

const REMADE: ToolAnswer = {
  code: 0,
  text: [
    "Resetting local database...",
    "Recreating database...",
    "Initialising schema...",
    "Applying migration 0001_init.sql...",
    "Applying migration 0002_save_interview.sql...",
    "Restarting containers...",
    "Finished supabase db reset on branch main.",
    "",
  ].join("\n"),
};

const STOPPED: ToolAnswer = { code: 0, text: "Stopped supabase local development setup.\n" };

const ALL_HELD = "0002_save_interview check: all checks passed — everything above is rolled back";

function checkEnded(closingMessage: string): ToolAnswer {
  return { code: 1, text: `Connecting to local database...\nfailed to execute query: error: ${closingMessage}\n` };
}

function tableAnswer(marked: string): ToolAnswer {
  return { code: 0, text: `Connecting to local database...\n answer\n--------\n ${marked}\n(1 row)\n` };
}

const APPLIED_ALL = "applied:0001_init,0002_save_interview";
const ROWS_AS_MADE = "rows:2,0,0,0,0,0,0,0";

type Script = {
  down?: boolean;
  linked?: boolean;
  status?: ToolAnswer;
  start?: ToolAnswer;
  reset?: ToolAnswer;
  check?: ToolAnswer;
  applied?: string;
  rows?: string[];
};

type Sent = { address: string; method: string; headers: Record<string, string>; body: string };

function callKind(args: string[]): string {
  if (args[0] === "status") return "status";
  if (args[0] === "start") return "start";
  if (args[0] === "stop") return "stop";
  if (args[0] === "db" && args[1] === "reset") return "reset";
  if (args[0] === "db" && args[1] === "query") {
    if (args.includes("-f")) return "check";
    const sql = String(args[args.length - 1] ?? "");
    if (sql.includes("applied:")) return "applied";
    if (sql.includes("rows:")) return "rows";
    return "question";
  }
  return "other";
}

function surroundings(script: Script = {}) {
  const asked: string[][] = [];
  const said: string[] = [];
  const sent: Sent[] = [];
  const rows = [...(script.rows ?? [ROWS_AS_MADE])];

  const tool = async (args: string[]): Promise<ToolAnswer> => {
    asked.push([...args]);
    const kind = callKind(args);
    if (script.down) {
      if (kind === "status") return DOWN;
      if (kind === "stop") return STOPPED;
      return CANNOT_CONNECT;
    }
    switch (kind) {
      case "status":
        return script.status ?? statusAnswer();
      case "start":
        return script.start ?? STARTED;
      case "reset":
        return script.reset ?? REMADE;
      case "stop":
        return STOPPED;
      case "check":
        return script.check ?? checkEnded(ALL_HELD);
      case "applied":
        return tableAnswer(script.applied ?? APPLIED_ALL);
      case "rows":
        return tableAnswer(rows.length > 1 ? (rows.shift() as string) : rows[0]);
      default:
        return { code: 1, text: "unknown command\n" };
    }
  };

  const request = async (input: unknown, init?: RequestInit): Promise<Response> => {
    const given = input instanceof Request ? input : null;
    const address = given ? given.url : input instanceof URL ? input.href : String(input);
    const headers: Record<string, string> = {};
    new Headers(init?.headers ?? given?.headers).forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const body = typeof init?.body === "string" ? init.body : given ? await given.clone().text() : "";
    sent.push({ address, method: String(init?.method ?? given?.method ?? "GET").toUpperCase(), headers, body });
    return new Response(JSON.stringify({ user: { id: "made-up" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const around = {
    tool,
    say: (line: string) => {
      said.push(String(line));
    },
    settings: SETTINGS,
    linked: script.linked ?? false,
    request: request as unknown as typeof fetch,
  };

  return { around, asked, said, sent };
}

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
  return `it answered: ${JSON.stringify(outcome.value)}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function expectRefusal(outcome: Outcome<unknown>, kind: string, why: string): void {
  expect(outcome.threw, `the command refused to go on (${told(outcome)})`).toBe(true);
  expect(outcome.error, `it refused as a practice command does (${told(outcome)})`).toBeInstanceOf(PracticeRefusal);
  expect((outcome.error as { kind?: unknown }).kind, why).toBe(kind);
}

function kinds(asked: string[][]): string[] {
  return asked.map(callKind);
}

describe("the database command, with the practice copy down", () => {
  it(`${CHECK_DOWN} — it stops with a message that names the command that starts the practice copy`, async () => {
    const { around } = surroundings({ down: true });

    const outcome = await trying(() => prepareDatabaseRun(around, COMMITTED));

    expectRefusal(outcome, "down", "the reason is that the practice copy is down");
    expect(messageOf(outcome.error), "the message says what to start").toContain("npm run practice:up");
  });

  it(`${CHECK_DOWN} — at once: after learning the copy is down it asks nothing further and sends nothing`, async () => {
    const { around, asked, sent } = surroundings({ down: true });

    const outcome = await trying(() => prepareDatabaseRun(around, COMMITTED));

    expectRefusal(outcome, "down", "the reason is that the practice copy is down");
    expect(asked, "the tool was asked where the practice copy is, once, and nothing else").toEqual([["status", "-o", "json"]]);
    expect(sent, "nothing was sent").toEqual([]);
  });

  it(`${CHECK_DOWN} — the rolled-back check is not run, and nothing is reported about it`, async () => {
    const { around, asked, said, sent } = surroundings({ down: true });

    const outcome = await trying(() => runRolledBackChecks(around, [CHECK_FILE]));

    expectRefusal(outcome, "down", "the reason is that the practice copy is down");
    expect(messageOf(outcome.error), "the message says what to start").toContain("npm run practice:up");
    expect(
      kinds(asked).filter((kind) => kind !== "status"),
      "the check was not run and the database was asked nothing",
    ).toEqual([]);
    expect(
      said.filter((line) => line.includes(CHECK_FILE)),
      "no line shown to the person reports the check",
    ).toEqual([]);
    expect(sent, "nothing was sent").toEqual([]);
  });
});

describe("the database command, pointed somewhere that is not the practice copy", () => {
  it.each([
    [
      "another local copy, on the tool's default port",
      { API_URL: "http://127.0.0.1:54321", INBUCKET_URL: "http://127.0.0.1:54324", MAILPIT_URL: "http://127.0.0.1:54324" },
    ],
    ["the live project", { API_URL: LIVE }],
  ])(`${CHECK_ADDRESS} — the tool answers about %s`, async (_what, over) => {
    const { around, asked, sent } = surroundings({ status: statusAnswer(over) });

    const outcome = await trying(() => prepareDatabaseRun(around, COMMITTED));

    expect(sent, "nothing was sent").toEqual([]);
    expect(
      kinds(asked).filter((kind) => kind !== "status"),
      "the database was asked nothing",
    ).toEqual([]);
    expectRefusal(outcome, "not-ours", "the reason is that the copy is not ours");
  });

  it(`${CHECK_ADDRESS} — the folder is linked to a hosted project, so a command could reach the live project: not even the tool is asked`, async () => {
    const { around, asked, sent } = surroundings({ linked: true });

    const outcome = await trying(() => prepareDatabaseRun(around, COMMITTED));

    expect(asked, "the tool was asked nothing").toEqual([]);
    expect(sent, "nothing was sent").toEqual([]);
    expectRefusal(outcome, "linked", "the reason is that the folder is linked to a hosted project");
  });

  it.each([
    ["the live project's address", LIVE],
    ["another local copy's address", "http://127.0.0.1:54321"],
    ["a lookalike of the practice copy's address", "http://127.0.0.1:55321.example.com"],
  ])(`${CHECK_ADDRESS} — handed %s to make the practice accounts at`, async (_what, address) => {
    const { around, sent } = surroundings();

    const outcome = await trying(() => makeAccounts(around, { address, publicKey: PUBLIC_KEY }, ACCOUNTS));

    expect(
      sent.map((one) => one.address),
      "requests sent",
    ).toEqual([]);
    expectRefusal(outcome, "address", "the reason is that the address is not exactly the practice copy's");
  });
});

{
  const CHECK_DOWN =
    "With the practice copy down, the database command stops at once with a message saying what to start: it asks nothing further, sends nothing and runs no check";
  const CHECK_ADDRESS =
    "Pointed at any address that is not the practice copy on this machine — the live project's included — the database command refuses before sending anything";

  const SETTINGS = {
    name: "compass-practice",
    address: "http://127.0.0.1:55321",
    inbox: "http://127.0.0.1:55324",
    app: "http://localhost:5183",
  };

  const LIVE = "https://your-project-ref.supabase.co";

  const PUBLIC_KEY = "sb_publishable_made_up_for_the_test";
  const OLDER_PUBLIC_KEY = "eyJ.made-up-public.key";

  type ToolAnswer = { code: number; text: string };

  function statusAnswer(over: Record<string, string | undefined> = {}): ToolAnswer {
    const values: Record<string, string | undefined> = {
      API_URL: SETTINGS.address,
      DB_URL: "postgresql://postgres:a-made-up-password@127.0.0.1:55322/postgres",
      INBUCKET_URL: SETTINGS.inbox,
      MAILPIT_URL: SETTINGS.inbox,
      PUBLISHABLE_KEY: PUBLIC_KEY,
      ANON_KEY: OLDER_PUBLIC_KEY,
      SECRET_KEY: "sb_secret_made_up_for_the_test",
      SERVICE_ROLE_KEY: "eyJ.made-up-admin.key",
      JWT_SECRET: "made-up-jwt-secret-with-at-least-32-characters",
      ...over,
    };
    return { code: 0, text: `Stopped services: supabase_imgproxy_compass-practice\n${JSON.stringify(values, null, 2)}\n` };
  }

  const DOWN: ToolAnswer = {
    code: 1,
    text: "failed to inspect container health: Error response from daemon: No such container: supabase_db_compass-practice\n",
  };

  type Outcome<T> = { threw: boolean; value?: T; error?: unknown };

  function trying<T>(run: () => T): Outcome<T> {
    try {
      return { threw: false, value: run() };
    } catch (error) {
      return { threw: true, error };
    }
  }

  function told(outcome: Outcome<unknown>): string {
    if (outcome.threw) return `it threw: ${String(outcome.error)}`;
    return `it answered: ${JSON.stringify(outcome.value)}`;
  }

  function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function kindOf(error: unknown): unknown {
    return (error as { kind?: unknown } | null | undefined)?.kind;
  }

  describe("reading the tool's answer when the practice copy is down", () => {
    it(`${CHECK_DOWN} — the tool's "no such container" is read as down, and the message names the command that starts the practice copy`, () => {
      const outcome = trying(() => pickPublicValues(DOWN, SETTINGS));

      expect(outcome.threw, `nothing is handed back for a copy that is down (${told(outcome)})`).toBe(true);
      expect(outcome.error, `it refuses as a practice command does (${told(outcome)})`).toBeInstanceOf(PracticeRefusal);
      expect(kindOf(outcome.error), "the reason is that the practice copy is down").toBe("down");
      expect(messageOf(outcome.error), "the message says what to start").toContain("npm run practice:up");
    });
  });

  const NOT_THE_PRACTICE_COPY: [string, unknown][] = [
    ["the live project's address", LIVE],
    ["https on the practice copy's host and port", "https://127.0.0.1:55321"],
    ["another local copy's address, on the tool's default port", "http://127.0.0.1:54321"],
    ["the practice copy's host with no port", "http://127.0.0.1"],
    ['"localhost" in place of 127.0.0.1', "http://localhost:55321"],
    ["a lookalike that runs the port on into another host", "http://127.0.0.1:55321.example.com"],
    ["a lookalike that uses the address as a sign-in name", "http://127.0.0.1:55321@example.com"],
    ["a lookalike that carries the address in its query", "http://example.com/?http://127.0.0.1:55321"],
    ["a lookalike host that begins with 127.0.0.1", "http://127.0.0.1.example.com:55321"],
    ["the practice copy's address followed by a path", "http://127.0.0.1:55321/rest/v1/projects"],
    ["the practice copy's address followed by a query", "http://127.0.0.1:55321/?select=*"],
    ["the practice copy's address followed by a fragment", "http://127.0.0.1:55321/#top"],
    ["the practice inbox's address", "http://127.0.0.1:55324"],
    ["nothing: undefined", undefined],
    ["nothing: null", null],
    ["nothing: empty text", ""],
    ["text that is not an address", "the practice copy"],
  ];

  describe("judging an address", () => {
    it.each(NOT_THE_PRACTICE_COPY)(`${CHECK_ADDRESS} — %s is judged not ours`, (_what, candidate) => {
      const outcome = trying(() => judgeAddress(candidate, SETTINGS));

      expect(outcome.threw, `it answers whatever it is handed (${told(outcome)})`).toBe(false);
      expect(outcome.value?.ok, `the address is not the practice copy's (${told(outcome)})`).toBe(false);
      expect(
        typeof outcome.value?.reason === "string" && outcome.value.reason.trim().length > 0,
        `and the verdict says why, in words (${told(outcome)})`,
      ).toBe(true);
    });

    it(`${CHECK_ADDRESS} — the live project's address is judged not ours even when the settings themselves name it`, () => {
      const settings = { ...SETTINGS, address: LIVE };
      const outcome = trying(() => judgeAddress(LIVE, settings));

      expect(outcome.threw, `it answers whatever it is handed (${told(outcome)})`).toBe(false);
      expect(outcome.value?.ok, "an address that is not on this machine is never the practice copy's").toBe(false);
    });

    it(`${CHECK_ADDRESS} — and the practice copy's own address, with or without a closing "/", is let through`, () => {
      const bare = trying(() => judgeAddress("http://127.0.0.1:55321", SETTINGS));
      const slashed = trying(() => judgeAddress("http://127.0.0.1:55321/", SETTINGS));

      expect(bare.threw, `it answers (${told(bare)})`).toBe(false);
      expect(bare.value, "the practice copy's address is ours").toEqual({ ok: true, reason: "" });
      expect(slashed.value, 'so is the same address with one closing "/"').toEqual({ ok: true, reason: "" });
    });

    it(`${CHECK_ADDRESS} — which address is the practice copy's is read from its own settings: its own section's port, never another's`, () => {
      const text = [
        "# A string used to distinguish different Supabase projects on the same host.",
        'project_id = "compass-practice"',
        "",
        "[db]",
        "# Port to use for the local database URL.",
        "port = 55322",
        "shadow_port = 55320",
        "",
        "[db.pooler]",
        "enabled = false",
        "port = 55329",
        "",
        "[api]",
        "enabled = true",
        "# port = 54321",
        "port = 55321",
        'schemas = ["public", "graphql_public"]',
        "",
        "[studio]",
        "enabled = false",
        "port = 55323",
        "",
        "[local_smtp]",
        "enabled = true",
        "port = 55324",
        "",
        "[auth]",
        "enabled = true",
        '# site_url = "http://localhost:5173"',
        'site_url = "http://localhost:5183"',
        'additional_redirect_urls = ["http://localhost:5183/**"]',
        "",
      ].join("\n");

      const outcome = trying(() => readSettings(text));

      expect(outcome.threw, `the settings are read (${told(outcome)})`).toBe(false);
      expect(outcome.value, "the practice copy's name, address, inbox and app").toEqual(SETTINGS);
    });
  });

  describe("reading the tool's answer about a copy that is not ours", () => {
    it.each([
      ["another local copy, on the tool's default port", "http://127.0.0.1:54321"],
      ["the live project", LIVE],
    ])(`${CHECK_ADDRESS} — the tool answering about %s is refused, and nothing of its answer is handed back`, (_what, address) => {
      const outcome = trying(() => pickPublicValues(statusAnswer({ API_URL: address }), SETTINGS));

      expect(outcome.threw, `nothing is handed back to connect with (${told(outcome)})`).toBe(true);
      expect(outcome.error, `it refuses as a practice command does (${told(outcome)})`).toBeInstanceOf(PracticeRefusal);
      expect(kindOf(outcome.error), "the reason is that the copy is not ours").toBe("not-ours");
    });

    it(`${CHECK_ADDRESS} — and the practice copy's own answer is let through: its address, its public key and its inbox, nothing else`, () => {
      const outcome = trying(() => pickPublicValues(statusAnswer(), SETTINGS));

      expect(outcome.threw, `the practice copy's answer is accepted (${told(outcome)})`).toBe(false);
      expect(outcome.value, "the three values kept").toEqual({
        address: SETTINGS.address,
        publicKey: PUBLIC_KEY,
        inbox: SETTINGS.inbox,
      });
    });
  });
}

{
  const CHECK_DOWN =
    "With the practice copy down, the database command stops at once with a message saying what to start: it asks nothing further, sends nothing and runs no check";

  const SETTINGS = {
    name: "compass-practice",
    address: "http://127.0.0.1:55321",
    inbox: "http://127.0.0.1:55324",
    app: "http://localhost:5183",
  };

  const PUBLIC_KEY = "sb_publishable_made_up_for_the_test";
  const COMMITTED = ["0001_init.sql", "0002_save_interview.sql"];

  type Outcome<T> = { threw: boolean; value?: T; error?: unknown };

  async function tryingAsync<T>(run: () => Promise<T> | T): Promise<Outcome<T>> {
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
    expect(outcome.threw, `it refused to go on (${told(outcome)})`).toBe(true);
    expect(outcome.error, `it refused as a practice command does (${told(outcome)})`).toBeInstanceOf(PracticeRefusal);
    expect((outcome.error as { kind?: unknown }).kind, why).toBe(kind);
  }

  function forget(): void {
    try {
      forgetNetworkAttempts();
    } catch {
      /* not built yet: nothing to clear */
    }
  }

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

  function tableAnswer(marked: string): ToolAnswer {
    return { code: 0, text: `Connecting to local database...\n answer\n--------\n ${marked}\n(1 row)\n` };
  }

  function surroundings(script: { down?: boolean } = {}) {
    const asked: string[][] = [];
    const said: string[] = [];
    const sent: string[] = [];

    const tool = async (args: string[]): Promise<ToolAnswer> => {
      asked.push([...args]);
      const question = String(args[args.length - 1] ?? "");
      if (args[0] === "status") return script.down ? DOWN : statusAnswer();
      if (script.down) return CANNOT_CONNECT;
      if (args[0] === "db" && args[1] === "query" && question.includes("applied:")) {
        return tableAnswer("applied:0001_init,0002_save_interview");
      }
      if (args[0] === "db" && args[1] === "query" && question.includes("rows:")) {
        return tableAnswer("rows:2,0,0,0,0,0,0,0");
      }
      return { code: 1, text: "unknown command\n" };
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

  type CheckReport = { name: string; file: string; passed: boolean; tries: number };
  type Where = { address: string; publicKey: string; inbox: string };

  function runner(reports: CheckReport[]) {
    const calls: { where: unknown; options: unknown }[] = [];
    const runTests = async (where: Where, options: { secondTry: boolean }): Promise<CheckReport[]> => {
      calls.push({ where, options });
      return reports.map((report) => ({ ...report }));
    };
    return { runTests, calls };
  }

  const FILE = "src/lib/db.database.practice-copy.test.ts";

  function check(name: string, passed: boolean, tries = 1): CheckReport {
    return { name, file: FILE, passed, tries };
  }

  const OWNER = "the owner stamp > the saved row names its account";
  const CASCADE = "a deleted project > every row it owned is gone";

  describe("the command that runs the database checks, with the practice copy down", () => {
    afterEach(() => {
      forget();
    });

    it(`${CHECK_DOWN} — the runner is never called, nothing is sent, and no check is reported`, async () => {
      const { around, asked, said, sent } = surroundings({ down: true });
      const { runTests, calls } = runner([check(OWNER, true), check(CASCADE, true)]);

      const outcome = await tryingAsync(() => runDatabaseChecks(around, COMMITTED, runTests));

      expectRefusal(outcome, "down", "the reason is that the practice copy is down");
      expect(messageOf(outcome.error), "the message says what to start").toContain("npm run practice:up");
      expect(asked, "the tool was asked where the practice copy is, once, and nothing further").toEqual([["status", "-o", "json"]]);
      expect(sent, "nothing was sent").toEqual([]);
      expect(calls, "no check was run: the runner was never called").toEqual([]);
      expect(
        said.filter((line) => /pass/i.test(line) || line.includes(OWNER) || line.includes(CASCADE)),
        "no line shown to the person reports a check",
      ).toEqual([]);
    });
  });
}

{
  const SETTINGS = {
    name: "compass-practice",
    address: "http://127.0.0.1:55321",
    inbox: "http://127.0.0.1:55324",
    app: "http://localhost:5183",
  };

  describe("the settings reader", () => {
    it("reads the committed settings file: its own name, its own ports, and the practice app's address — never the usual one", () => {
      const text = fs.readFileSync(path.resolve("supabase/config.toml"), "utf8");
      const settings = readSettings(text);

      expect(settings).toEqual(SETTINGS);
      expect(settings.address, "not the tool's default address").not.toContain(":54321");
      expect(settings.app, "not the usual address (I18)").not.toContain(":5173");
    });

    it("names the value that is missing", () => {
      expect(() => readSettings('project_id = "x"\n[api]\nport = 1\n[auth]\nsite_url = "http://localhost:5183"\n')).toThrow(
        /local_smtp\.port/,
      );
      expect(() => readSettings("[api]\nport = 1\n")).toThrow(/project_id/);
    });

    it("drops a comment that follows a value, and keeps the first value when a key is written twice", () => {
      const text = [
        'project_id = "compass-practice" # the name',
        "[api]",
        "port = 55321 # ours",
        "port = 54321",
        "[local_smtp]",
        "port = 55324",
        "[auth]",
        'site_url = "http://localhost:5183"',
      ].join("\n");

      expect(readSettings(text)).toEqual(SETTINGS);
    });
  });

  describe("what the tool prints when it thinks an agent is calling", () => {
    it("a rolled-back check's closing message is read out of the tool's JSON wrapping", () => {
      const wrapped =
        '{"_tag":"Error","error":{"code":"LegacyDbQueryExecError","message":"failed to execute query: error: 0002_save_interview check: all checks passed — everything above is rolled back"}}\n';

      expect(judgeRolledBackCheck({ code: 1, text: `Connecting to local database...\n${wrapped}` })).toEqual({
        held: true,
        message: "0002_save_interview check: all checks passed — everything above is rolled back",
      });
    });

    it("a refusal never repeats an admin value from the tool's answer", () => {
      const answer = {
        code: 0,
        text: JSON.stringify({
          API_URL: "http://127.0.0.1:54321",
          INBUCKET_URL: "http://127.0.0.1:54324",
          PUBLISHABLE_KEY: "sb_publishable_made_up",
          SERVICE_ROLE_KEY: "ADMIN-VALUE-ONE",
          SECRET_KEY: "ADMIN-VALUE-TWO",
          JWT_SECRET: "ADMIN-VALUE-THREE",
          DB_URL: "postgresql://postgres:ADMIN-VALUE-FOUR@127.0.0.1:54322/postgres",
        }),
      };

      let message = "";
      try {
        pickPublicValues(answer, SETTINGS);
      } catch (error) {
        message = String((error as Error).message);
      }

      expect(message).not.toBe("");
      expect(message).not.toMatch(/ADMIN-VALUE/);
    });
  });

  describe("the tool's answer, compared with our settings", () => {
    it("our address with another copy's inbox is refused as not ours", () => {
      const answer = {
        code: 0,
        text: JSON.stringify({
          API_URL: SETTINGS.address,
          INBUCKET_URL: "http://127.0.0.1:54324",
          MAILPIT_URL: "http://127.0.0.1:54324",
          PUBLISHABLE_KEY: "sb_publishable_made_up",
        }),
      };

      let refusal: unknown;
      try {
        pickPublicValues(answer, SETTINGS);
      } catch (error) {
        refusal = error;
      }

      expect(refusal).toBeInstanceOf(PracticeRefusal);
      expect((refusal as PracticeRefusal).kind).toBe("not-ours");
    });
  });
}
