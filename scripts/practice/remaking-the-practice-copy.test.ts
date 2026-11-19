// @vitest-environment node

import { describe, expect, it } from "vitest";
import { bringUp, prepareDatabaseRun, remake, throwAway } from "./commands.mjs";
import { judgeApplied, judgeReplay, PracticeRefusal } from "./lib.mjs";

const CHECK_REMADE =
  "The practice copy is torn down and remade, and the migrations replay cleanly onto the empty database; a migration that cannot replay is reported before any check runs";

const SETTINGS = {
  name: "compass-practice",
  address: "http://127.0.0.1:55321",
  inbox: "http://127.0.0.1:55324",
  app: "http://localhost:5183",
};

const PUBLIC_KEY = "sb_publishable_made_up_for_the_test";
const SIGN_UP = `${SETTINGS.address}/auth/v1/signup`;

const ACCOUNTS = [
  { email: "practice-one@compass.test", password: "Practice-one-1!" },
  { email: "practice-two@compass.test", password: "Practice-two-2!" },
];

const COMMITTED = ["0001_init.sql", "0002_save_interview.sql"];

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

const BROKEN_MIGRATION = "0003_broken.sql";
const CANNOT_REPLAY: ToolAnswer = {
  code: 1,
  text: [
    "Recreating database...",
    "Initialising schema...",
    "Applying migration 0001_init.sql...",
    "Applying migration 0002_save_interview.sql...",
    `Applying migration ${BROKEN_MIGRATION}...`,
    'ERROR: syntax error at or near ";" (SQLSTATE 42601)',
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

function emails(sent: Sent[]): string[] {
  return sent.map((one) => {
    try {
      return String((JSON.parse(one.body) as { email?: unknown }).email);
    } catch {
      return "(a body that is not JSON)";
    }
  });
}

describe("the practice copy, torn down and remade", () => {
  it(`${CHECK_REMADE} — thrown away and brought up again: every migration replays, and the practice copy answers at its own address with its accounts made`, async () => {
    const { around, asked, said, sent } = surroundings({ start: STARTED });

    const away = await trying(() => throwAway(around));
    const up = await trying(() => bringUp(around, ACCOUNTS));

    expect(away.threw, `the practice copy was thrown away (${told(away)})`).toBe(false);
    expect(asked[0], "the tool was asked to throw it away, data included").toEqual(["stop", "--no-backup"]);
    expect(up.threw, `the practice copy was brought up (${told(up)})`).toBe(false);
    expect(kinds(asked), "the tool was asked to start it, which replays the migrations").toContain("start");
    expect(up.value?.address, "it answers at the practice copy's own address").toBe(SETTINGS.address);
    expect(typeof up.value?.seconds, "and says how long it took").toBe("number");
    expect(
      sent.map((one) => `${one.method} ${one.address}`),
      "each practice account was made the way a person registers",
    ).toEqual([`POST ${SIGN_UP}`, `POST ${SIGN_UP}`]);
    expect(emails(sent), "both accounts, in order").toEqual(ACCOUNTS.map((account) => account.email));
    expect(
      said.some((line) => line.includes(SETTINGS.address)),
      `a line shown to the person names the practice copy's address (shown: ${JSON.stringify(said)})`,
    ).toBe(true);
  });

  it(`${CHECK_REMADE} — remade in place: the database is emptied, every migration replays, and the accounts are made again`, async () => {
    const { around, asked, said, sent } = surroundings({ reset: REMADE });

    const outcome = await trying(() => remake(around, ACCOUNTS));

    expect(outcome.threw, `the practice copy was remade (${told(outcome)})`).toBe(false);
    expect(asked, "the tool was asked to remake the database").toContainEqual(["db", "reset"]);
    expect(
      kinds(asked).indexOf("status"),
      "the practice copy was found before anything was undone",
    ).toBeLessThan(kinds(asked).indexOf("reset"));
    expect(kinds(asked).indexOf("status"), "the practice copy was looked for").toBeGreaterThanOrEqual(0);
    expect(typeof outcome.value?.seconds, "it says how long it took").toBe("number");
    expect(emails(sent), "both accounts were made again, in order").toEqual(ACCOUNTS.map((account) => account.email));
    expect(said.length, "one line is shown to the person").toBe(1);
  });

  it(`${CHECK_REMADE} — bringing it up with a migration that cannot replay: the migration is named, the copy is not looked for and no account is made`, async () => {
    const { around, asked, sent } = surroundings({ start: CANNOT_REPLAY });

    const outcome = await trying(() => bringUp(around, ACCOUNTS));

    expectRefusal(outcome, "replay", "the reason is that a migration could not replay");
    expect(messageOf(outcome.error), "the message names the migration that could not replay").toContain(BROKEN_MIGRATION);
    expect(kinds(asked), "the tool was asked to start, and nothing after it").toEqual(["start"]);
    expect(sent, "no account was made: nothing was sent").toEqual([]);
  });

  it(`${CHECK_REMADE} — remaking it with a migration that cannot replay: the migration is named and no account is made`, async () => {
    const { around, asked, sent } = surroundings({ reset: CANNOT_REPLAY });

    const outcome = await trying(() => remake(around, ACCOUNTS));

    expectRefusal(outcome, "replay", "the reason is that a migration could not replay");
    expect(messageOf(outcome.error), "the message names the migration that could not replay").toContain(BROKEN_MIGRATION);
    expect(asked[asked.length - 1], "the last thing asked of the tool was the remake that failed").toEqual(["db", "reset"]);
    expect(sent, "no account was made: nothing was sent").toEqual([]);
  });

  it(`${CHECK_REMADE} — a copy that did not replay every committed migration stops the database command before its first check, with a message saying how to remake it`, async () => {
    const { around, sent } = surroundings({ applied: "applied:0001_init" });

    const outcome = await trying(() => prepareDatabaseRun(around, COMMITTED));

    expectRefusal(outcome, "stale", "the reason is that the copy does not hold the committed migrations");
    expect(messageOf(outcome.error), "the message says how to remake the practice copy").toContain("npm run practice:reset");
    expect(sent, "nothing was sent").toEqual([]);
  });

  it(`${CHECK_REMADE} — a copy that replayed no migration at all stops the database command before its first check`, async () => {
    const { around, sent } = surroundings({ applied: "applied:" });

    const outcome = await trying(() => prepareDatabaseRun(around, COMMITTED));

    expectRefusal(outcome, "stale", "the reason is that the copy does not hold the committed migrations");
    expect(sent, "nothing was sent").toEqual([]);
  });

  it(`${CHECK_REMADE} — with every committed migration replayed, the database command goes on to its checks, holding the practice copy's address, public key and inbox`, async () => {
    const { around, asked } = surroundings({ applied: APPLIED_ALL });

    const outcome = await trying(() => prepareDatabaseRun(around, COMMITTED));

    expect(outcome.threw, `the database command may begin (${told(outcome)})`).toBe(false);
    expect(outcome.value, "what the checks are handed to connect with").toEqual({
      address: SETTINGS.address,
      publicKey: PUBLIC_KEY,
      inbox: SETTINGS.inbox,
    });
    expect(kinds(asked), "the copy was found, then asked which migrations it replayed").toEqual(["status", "applied"]);
  });
});

{
  const CHECK_REMADE =
    "The practice copy is torn down and remade, and the migrations replay cleanly onto the empty database; a migration that cannot replay is reported before any check runs";

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

  const COMMITTED = ["0002_save_interview.sql", "0001_init.sql"];

  describe("reading whether the migrations replayed", () => {
    it(`${CHECK_REMADE} — every migration replayed onto the empty database`, () => {
      const outcome = trying(() =>
        judgeReplay({
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
        }),
      );

      expect(outcome.threw, `the replay is read (${told(outcome)})`).toBe(false);
      expect(outcome.value, "they replayed, and none is named as failed").toEqual({ replayed: true, failed: null });
    });

    it(`${CHECK_REMADE} — a migration that cannot replay is named: the last one the tool began`, () => {
      const outcome = trying(() =>
        judgeReplay({
          code: 1,
          text: [
            "Resetting local database...",
            "Recreating database...",
            "Initialising schema...",
            "Applying migration 0001_init.sql...",
            "Applying migration 0002_save_interview.sql...",
            "Applying migration 0003_broken.sql...",
            'ERROR: syntax error at or near ";" (SQLSTATE 42601)',
            "",
          ].join("\n"),
        }),
      );

      expect(outcome.threw, `the replay is read (${told(outcome)})`).toBe(false);
      expect(outcome.value, "they did not replay, and the one that could not is named").toEqual({
        replayed: false,
        failed: "0003_broken.sql",
      });
    });

    it(`${CHECK_REMADE} — a tool that failed before replaying any migration is read as not replayed, naming none`, () => {
      const outcome = trying(() =>
        judgeReplay({
          code: 1,
          text: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?\n",
        }),
      );

      expect(outcome.threw, `the replay is read (${told(outcome)})`).toBe(false);
      expect(outcome.value, "they did not replay, and no migration is blamed").toEqual({ replayed: false, failed: null });
    });

    it(`${CHECK_REMADE} — a copy that replayed exactly the committed files agrees with them`, () => {
      const outcome = trying(() => judgeApplied(["0001_init", "0002_save_interview"], COMMITTED));

      expect(outcome.threw, `the two lists are compared (${told(outcome)})`).toBe(false);
      expect(outcome.value, "the copy holds the committed migrations").toEqual({ ok: true, reason: "" });
    });

    it.each([
      ["one fewer than the committed files (the last could not replay)", ["0001_init"], "0002_save_interview"],
      ["none at all", [], "0001_init"],
      ["one more than the committed files", ["0001_init", "0002_save_interview", "0003_tried_by_hand"], "0003_tried_by_hand"],
      ["another migration in place of a committed one", ["0001_init", "0002_something_else"], "0002_"],
    ])(`${CHECK_REMADE} — a copy that replayed %s is stale, and the reason names the difference`, (_what, applied, named) => {
      const outcome = trying(() => judgeApplied(applied, COMMITTED));

      expect(outcome.threw, `the two lists are compared (${told(outcome)})`).toBe(false);
      expect(outcome.value?.ok, `the copy does not hold the committed migrations (${told(outcome)})`).toBe(false);
      expect(String(outcome.value?.reason), "the reason names the first difference").toContain(named);
    });
  });
}
