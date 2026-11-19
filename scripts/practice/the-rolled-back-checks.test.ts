// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as cli from "./cli.mjs";
import { realSurroundings, withAssertionsOff } from "./cli.mjs";
import * as commands from "./commands.mjs";
import { runDatabaseChecks, runRolledBackChecks } from "./commands.mjs";
import * as lib from "./lib.mjs";
import { CATCH_MESSAGE, judgeCatches, judgeRolledBackCheck } from "./lib.mjs";

const SAYS_MARKER =
  "The line about such a check begins with the marker ROWS-LEFT-BEHIND, which is what a person or an agent searches for";
const SAYS_NO_OTHER = "No other line a practice command says begins with it, whatever a check's name or closing message holds";
const SAYS_WHAT_IS_KNOWN =
  "Of a check that ended without raising while the row totals are the same before and after it, the command says what is known, that nothing was undone and that the totals are the same, and does not guess at rows";
const SAYS_HOW_TO_REMAKE = "Of that check, and of one that left rows behind, it says how to remake the practice copy";

const MARKER = "ROWS-LEFT-BEHIND";
const HOW_TO_REMAKE = "npm run practice:reset";

const SETTINGS = {
  name: "compass-practice",
  address: "http://127.0.0.1:55321",
  inbox: "http://127.0.0.1:55324",
  app: "http://localhost:5183",
};

const PUBLIC_KEY = "sb_publishable_made_up_for_the_test";
const COMMITTED = ["0001_init.sql", "0002_save_interview.sql"];

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

function tableAnswer(marked: string): ToolAnswer {
  return { code: 0, text: `Connecting to local database...\n answer\n--------\n ${marked}\n(1 row)\n` };
}

function raised(closingMessage: string): ToolAnswer {
  return { code: 1, text: `Connecting to local database...\nfailed to execute query: error: ${closingMessage}\n` };
}

function endedWithoutRaising(answered = "1"): ToolAnswer {
  return { code: 0, text: `Connecting to local database...\n answer\n--------\n ${answered}\n(1 row)\n` };
}

const ALL_HELD = "0002_save_interview check: all checks passed — everything above is rolled back";
const DID_NOT_HOLD = "fixture check 1: expected one project, found none";

const ROWS_AS_MADE = "rows:2,0,0,0,0,0,0,0";
const ROWS_WITH_ONE_MORE = "rows:2,1,0,0,0,0,0,0";

type Ending = { ends: ToolAnswer; rowsAfter?: string };

const HELD_FILE = "supabase/checks/0002_save_interview.sql";
const WRONG_FILE = "scripts/practice/fixtures/wrong-expectation.sql";
const SILENT_FILE = "scripts/practice/fixtures/ends-without-raising.sql";
const LEAVING_FILE = "scripts/practice/fixtures/leaves-a-row.sql";
const NAMED_AS_THE_MARKER = `${MARKER}-is-only-the-name-of-this-file.sql`;

const LEAVES_A_ROW: Ending = { ends: endedWithoutRaising(), rowsAfter: ROWS_WITH_ONE_MORE };

function callKind(args: string[]): string {
  if (args[0] === "status") return "status";
  if (args[0] === "db" && args[1] === "query") {
    if (args.includes("-f")) return "check";
    const sql = String(args[args.length - 1] ?? "");
    if (sql.includes("applied:")) return "applied";
    if (sql.includes("rows:")) return "rows";
  }
  return "other";
}

function surroundings(script: { rows?: string; checks?: Record<string, Ending> } = {}) {
  const asked: string[][] = [];
  const said: string[] = [];
  const sent: string[] = [];
  let rows = script.rows ?? ROWS_AS_MADE;

  const tool = async (args: string[]): Promise<ToolAnswer> => {
    asked.push([...args]);
    switch (callKind(args)) {
      case "status":
        return statusAnswer();
      case "applied":
        return tableAnswer("applied:0001_init,0002_save_interview");
      case "rows":
        return tableAnswer(rows);
      case "check": {
        const file = String(args[args.indexOf("-f") + 1]);
        const ending = script.checks?.[file];
        if (!ending) return { code: 1, text: `open ${file}: no such file or directory\n` };
        if (ending.rowsAfter !== undefined) rows = ending.rowsAfter;
        return ending.ends;
      }
      default:
        return { code: 1, text: "unknown command\n" };
    }
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

function seen(said: string[]): string[] {
  return said.flatMap((line) => line.split(/\r?\n/));
}

function foundByTheMarker(said: string[]): string[] {
  return seen(said).filter((line) => line.startsWith(MARKER));
}

function lineAbout(said: string[], place: number): string {
  return String(said[place] ?? "(no line was said about this check)").split(/\r?\n/)[0];
}

function shown(said: string[]): string {
  return `shown: ${JSON.stringify(said)}`;
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\s+[—–-]\s+|\r?\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function clauses(text: string): string[] {
  return sentences(text)
    .flatMap((part) => part.split(/,\s+/))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function saysNothingWasUndone(text: string): boolean {
  return sentences(text).some(
    (part) =>
      /\b(undone|undo|undid|undoes|rolled\s+back|roll\s+back|rolled\s+\w+\s+back|rollback)\b/i.test(part) &&
      /\b(nothing|not|never|no|none)\b|n't\b/i.test(part),
  );
}

function saysTheTotalsAreTheSame(text: string): boolean {
  return sentences(text).some(
    (part) =>
      /\b(totals?|counts?|numbers?)\b/i.test(part) &&
      /\b(same|unchanged|equal|identical|no\s+change|did\s+not\s+change|not\s+changed|no\s+different)\b/i.test(part),
  );
}

function guessesAtRows(text: string): string[] {
  return clauses(text).filter(
    (part) =>
      /\brows?\b/i.test(part) && /\b(may|might|could|perhaps|possibly|probably|presumably|maybe|likely)\b/i.test(part),
  );
}

describe("what a practice command says of a check that left rows behind: the marker", () => {
  it.each<[string, string, Ending]>([
    [
      "a check that left a row though it said that all checks passed",
      ROWS_AS_MADE,
      { ends: raised(ALL_HELD), rowsAfter: ROWS_WITH_ONE_MORE },
    ],
    ["a check that ended without raising and left a row", ROWS_AS_MADE, LEAVES_A_ROW],
    [
      "a check that left a thought and took a task away, so the totals differ though their sum does not",
      "rows:2,1,1,0,1,0,0,0",
      { ends: endedWithoutRaising(), rowsAfter: "rows:2,1,1,0,0,1,0,0" },
    ],
  ])(`${SAYS_MARKER} — %s`, async (_what, rowsBefore, ending) => {
    const { around, said } = surroundings({ rows: rowsBefore, checks: { [LEAVING_FILE]: ending } });

    const outcome = await trying(() => runRolledBackChecks(around, [LEAVING_FILE]));

    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    expect(said.length, `one line about the check and one closing line are shown (${shown(said)})`).toBe(2);
    expect(
      lineAbout(said, 0).startsWith(MARKER),
      `the line about the check that left rows behind begins with the marker (${shown(said)})`,
    ).toBe(true);
    expect(lineAbout(said, 0), "and it is the line that says, in plain words, that rows were left behind").toMatch(/left behind/i);
    expect(foundByTheMarker(said), "a search for the marker finds that line, once").toEqual([lineAbout(said, 0)]);
    expect(
      (lib as Record<string, unknown>).LEFT_BEHIND_MARKER,
      "and the marker the practice commands declare, for an agent to search with, is that same word",
    ).toBe(MARKER);
  });
});

const OTHER_CHECKS: [string, string, Ending][] = [
  ["a check that held, in a file whose name begins with the marker", NAMED_AS_THE_MARKER, { ends: raised(ALL_HELD) }],
  [
    "a check that held, whose closing message begins with the marker",
    HELD_FILE,
    { ends: raised(`${MARKER} is what this check is called: all checks passed — everything above is rolled back`) },
  ],
  ["a check that did not hold, in a file whose name begins with the marker", NAMED_AS_THE_MARKER, { ends: raised(DID_NOT_HOLD) }],
  [
    "a check that did not hold, whose closing message begins with the marker",
    WRONG_FILE,
    { ends: raised(`${MARKER}: expected one project, found none`) },
  ],
  [
    "a check that did not hold, whose closing message goes on to a second line that begins with the marker",
    WRONG_FILE,
    { ends: raised(`${DID_NOT_HOLD}\n${MARKER}: the second line of this check's own message`) },
  ],
  [
    "a check that ended without raising and changed no total, in a file whose name begins with the marker",
    NAMED_AS_THE_MARKER,
    { ends: endedWithoutRaising() },
  ],
  [
    "a check that ended without raising and changed no total, whose last question answered with the marker",
    SILENT_FILE,
    { ends: endedWithoutRaising(`${MARKER}: what this check's own question answered`) },
  ],
];

describe("what a practice command says: no other line begins with the marker", () => {
  it.each(OTHER_CHECKS)(
    `${SAYS_NO_OTHER} — %s, run before a check that left rows behind`,
    async (_what, file, ending) => {
      const { around, said } = surroundings({ checks: { [file]: ending, [LEAVING_FILE]: LEAVES_A_ROW } });

      const outcome = await trying(() => runRolledBackChecks(around, [file, LEAVING_FILE]));

      expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
      expect(said.length, `one line about each check and one closing line are shown (${shown(said)})`).toBe(3);
      expect(
        foundByTheMarker(said),
        `a search for the marker finds the line about the check that left rows behind, and no other (${shown(said)})`,
      ).toEqual([lineAbout(said, 1)]);
    },
  );

  it(`${SAYS_NO_OTHER} — a check that held, run after the one that left rows behind, left nothing itself: the row is still there before and after it`, async () => {
    const { around, said } = surroundings({
      checks: { [LEAVING_FILE]: LEAVES_A_ROW, [HELD_FILE]: { ends: raised(ALL_HELD) }, [WRONG_FILE]: { ends: raised(DID_NOT_HOLD) } },
    });

    const outcome = await trying(() => runRolledBackChecks(around, [LEAVING_FILE, HELD_FILE, WRONG_FILE]));

    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    expect(said.length, `one line about each check and one closing line are shown (${shown(said)})`).toBe(4);
    expect(
      foundByTheMarker(said),
      `a search for the marker finds the line about the check that left rows behind, and no other (${shown(said)})`,
    ).toEqual([lineAbout(said, 0)]);
    expect(
      outcome.value?.checks.map((check) => check.held),
      "the check that left rows did not hold, the one after it held, the last did not",
    ).toEqual([false, true, false]);
  });

  it(`${SAYS_NO_OTHER} — a database check that failed, and one that needed a second try, each with a name that begins with the marker`, async () => {
    const { around, said } = surroundings();
    const failed = `${MARKER} is only the title of this group > a check that failed at both tries`;
    const unsteady = `${MARKER} is only the title of this group > a check that passed at its second try`;
    const file = "src/lib/db.database.practice-copy.test.ts";
    const runTests = async () => [
      { name: failed, file, passed: false, tries: 2 },
      { name: unsteady, file, passed: true, tries: 2 },
    ];

    const outcome = await trying(() => runDatabaseChecks(around, COMMITTED, runTests, { secondTry: true }));

    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    expect(
      said.filter((line) => line.includes(failed) || line.includes(unsteady)).length > 0,
      `harness: lines shown to the person do name these checks (${shown(said)})`,
    ).toBe(true);
    expect(foundByTheMarker(said), `no row was left by anything here: a search for the marker finds nothing (${shown(said)})`).toEqual(
      [],
    );
  });
});

describe("what a practice command says of a check that ended without raising, the row totals being the same", () => {
  it(`${SAYS_WHAT_IS_KNOWN} — the line about it says that nothing was undone, and that the totals are the same`, async () => {
    const { around, said } = surroundings({ checks: { [SILENT_FILE]: { ends: endedWithoutRaising() } } });

    const outcome = await trying(() => runRolledBackChecks(around, [SILENT_FILE]));

    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    expect(said.length, `one line about the check and one closing line are shown (${shown(said)})`).toBe(2);
    expect(saysNothingWasUndone(String(said[0])), `the line about it says that nothing was undone (${shown(said)})`).toBe(true);
    expect(saysTheTotalsAreTheSame(String(said[0])), `and that the row totals are the same (${shown(said)})`).toBe(true);
  });

  it(`${SAYS_WHAT_IS_KNOWN} — the line about it does not guess at rows: it says neither that rows were left behind nor that they may have been, and it does not begin with the marker`, async () => {
    const { around, said } = surroundings({ checks: { [SILENT_FILE]: { ends: endedWithoutRaising() } } });

    const outcome = await trying(() => runRolledBackChecks(around, [SILENT_FILE]));

    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    expect(said.length, `one line about the check and one closing line are shown (${shown(said)})`).toBe(2);
    expect(guessesAtRows(String(said[0])), `the parts of the line that guess at rows (${shown(said)})`).toEqual([]);
    expect(String(said[0]), "the line does not say that rows were left behind").not.toMatch(/left\s+behind/i);
    expect(
      String(outcome.value?.checks[0]?.message),
      "and the message handed back for the check does not say so either",
    ).not.toMatch(/left\s+behind/i);
    expect(guessesAtRows(String(outcome.value?.checks[0]?.message)), "the parts of that message that guess at rows").toEqual([]);
    expect(foundByTheMarker(said), "a search for the marker finds nothing").toEqual([]);
  });

  it(`${SAYS_WHAT_IS_KNOWN} — read on its own, before any row is counted, such an ending is told as what is known: nothing was undone, and no guess at rows`, () => {
    let read: { held?: unknown; message?: unknown } | undefined;
    let threw: unknown;
    try {
      read = lib.judgeRolledBackCheck(endedWithoutRaising());
    } catch (error) {
      threw = error;
    }

    expect(threw, "the ending is read").toBeUndefined();
    expect(saysNothingWasUndone(String(read?.message)), `its message says that nothing was undone (read: ${JSON.stringify(read)})`).toBe(
      true,
    );
    expect(guessesAtRows(String(read?.message)), "the parts of its message that guess at rows").toEqual([]);
    expect(String(read?.message), "and it does not say that rows were left behind").not.toMatch(/left\s+behind/i);
  });
});

describe("what a practice command says: how to remake the practice copy", () => {
  it(`${SAYS_HOW_TO_REMAKE} — of a check that ended without raising while the row totals are the same, the line names the command that remakes it`, async () => {
    const { around, said } = surroundings({ checks: { [SILENT_FILE]: { ends: endedWithoutRaising() } } });

    const outcome = await trying(() => runRolledBackChecks(around, [SILENT_FILE]));

    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    expect(said.length, `one line about the check and one closing line are shown (${shown(said)})`).toBe(2);
    expect(String(said[0]), "the line about the check says how to remake the practice copy").toContain(HOW_TO_REMAKE);
  });

  it(`${SAYS_HOW_TO_REMAKE} — of a check that left rows behind, the line names the command that remakes it`, async () => {
    const { around, said } = surroundings({ checks: { [LEAVING_FILE]: LEAVES_A_ROW } });

    const outcome = await trying(() => runRolledBackChecks(around, [LEAVING_FILE]));

    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    expect(said.length, `one line about the check and one closing line are shown (${shown(said)})`).toBe(2);
    expect(String(said[0]), "the line about the check says how to remake the practice copy").toContain(HOW_TO_REMAKE);
  });
});

{
  const CHECK_ROLLED_BACK =
    "The setup's rolled-back check, which today can run only against the live project, runs against the practice copy by one command and reports that every check held; a deliberately wrong expectation in it is reported as the check that did not hold, and nothing is left behind either way";

  const SETTINGS = {
    name: "compass-practice",
    address: "http://127.0.0.1:55321",
    inbox: "http://127.0.0.1:55324",
    app: "http://localhost:5183",
  };

  const PUBLIC_KEY = "sb_publishable_made_up_for_the_test";

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
  const DID_NOT_HOLD = "fixture check 1: expected one project, found none";

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

  function kinds(asked: string[][]): string[] {
    return asked.map(callKind);
  }

  describe("the rolled-back check, run against the practice copy", () => {
    it(`${CHECK_ROLLED_BACK} — the check runs against the practice copy and every check is reported as held`, async () => {
      const { around, asked, said } = surroundings({ check: checkEnded(ALL_HELD) });

      const outcome = await trying(() => runRolledBackChecks(around, [CHECK_FILE]));

      expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
      expect(asked, "the tool was asked to run the check's file against the practice copy").toContainEqual([
        "db",
        "query",
        "--local",
        "-f",
        CHECK_FILE,
      ]);
      expect(outcome.value?.held, "every check held").toBe(true);
      expect(outcome.value?.checks, "the one check is reported, with its own closing words").toMatchObject([
        { file: CHECK_FILE, held: true, message: ALL_HELD },
      ]);
      expect(outcome.value?.checks.length, "one check was run, one is reported").toBe(1);
      expect(said.length, "one line for the check and one closing line are shown").toBe(2);
      expect(said[said.length - 1], "the closing line says that every check held").toMatch(/held/i);
    });

    it(`${CHECK_ROLLED_BACK} — a deliberately wrong expectation is reported as the check that did not hold`, async () => {
      const { around, said } = surroundings({ check: checkEnded(DID_NOT_HOLD) });

      const outcome = await trying(() => runRolledBackChecks(around, [CHECK_FILE]));

      expect(outcome.threw, `a check that does not hold is an answer, not a refusal (${told(outcome)})`).toBe(false);
      expect(outcome.value?.held, "not every check held").toBe(false);
      expect(outcome.value?.checks, "the check is reported as not held, naming the expectation that failed").toMatchObject([
        { file: CHECK_FILE, held: false, message: DID_NOT_HOLD },
      ]);
      expect(
        said.some((line) => line.includes(DID_NOT_HOLD)),
        `a line shown to the person names the check that did not hold (shown: ${JSON.stringify(said)})`,
      ).toBe(true);
      expect(said[said.length - 1], "the closing line says how many did not hold").toMatch(/\b(1|one)\b/i);
    });

    it(`${CHECK_ROLLED_BACK} — the rows are counted before and after the check, whether it held or not`, async () => {
      const held = surroundings({ check: checkEnded(ALL_HELD) });
      const notHeld = surroundings({ check: checkEnded(DID_NOT_HOLD) });

      const first = await trying(() => runRolledBackChecks(held.around, [CHECK_FILE]));
      const second = await trying(() => runRolledBackChecks(notHeld.around, [CHECK_FILE]));

      expect(first.threw, `the command ran (${told(first)})`).toBe(false);
      expect(second.threw, `the command ran (${told(second)})`).toBe(false);
      expect(
        kinds(held.asked).filter((kind) => kind !== "status"),
        "a check that held: counted, run, counted again",
      ).toEqual(["rows", "check", "rows"]);
      expect(
        kinds(notHeld.asked).filter((kind) => kind !== "status"),
        "a check that did not hold: counted, run, counted again",
      ).toEqual(["rows", "check", "rows"]);
      expect(held.sent.length + notHeld.sent.length, "and nothing was sent besides").toBe(0);
    });

    it(`${CHECK_ROLLED_BACK} — a check that left rows behind did not hold, whatever it said`, async () => {
      const { around, said } = surroundings({
        check: checkEnded(ALL_HELD),
        rows: [ROWS_AS_MADE, "rows:2,1,1,1,0,0,0,0"],
      });

      const outcome = await trying(() => runRolledBackChecks(around, [CHECK_FILE]));

      expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
      expect(outcome.value?.held, "not every check held").toBe(false);
      expect(outcome.value?.checks[0]?.held, "the check that left rows behind did not hold").toBe(false);
      expect(String(outcome.value?.checks[0]?.message), "its message says rows were left behind").toMatch(/left behind/i);
      expect(
        said.some((line) => /left behind/i.test(line)),
        `a line shown to the person says rows were left behind (shown: ${JSON.stringify(said)})`,
      ).toBe(true);
    });

    it(`${CHECK_ROLLED_BACK} — a check that ended without raising was not rolled back, so it did not hold`, async () => {
      const { around } = surroundings({
        check: { code: 0, text: "Connecting to local database...\n(0 rows)\n" },
      });

      const outcome = await trying(() => runRolledBackChecks(around, [CHECK_FILE]));

      expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
      expect(outcome.value?.held, "not every check held").toBe(false);
      expect(outcome.value?.checks[0]?.held, "the check that did not raise did not hold").toBe(false);
    });
  });
}

{
  const CHECK_ROLLED_BACK =
    "The setup's rolled-back check, which today can run only against the live project, runs against the practice copy by one command and reports that every check held; a deliberately wrong expectation in it is reported as the check that did not hold, and nothing is left behind either way";

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

  const ALL_HELD = "0002_save_interview check: all checks passed — everything above is rolled back";
  const DID_NOT_HOLD = "fixture check 1: expected one project, found none";

  describe("reading how a rolled-back check ended", () => {
    it(`${CHECK_ROLLED_BACK} — a check that ends by saying all checks passed is read as held`, () => {
      const outcome = trying(() =>
        judgeRolledBackCheck({
          code: 1,
          text: `Connecting to local database...\nfailed to execute query: error: ${ALL_HELD}\n`,
        }),
      );

      expect(outcome.threw, `the ending is read (${told(outcome)})`).toBe(false);
      expect(outcome.value, "every check held, and the message is the check's own closing words").toEqual({
        held: true,
        message: ALL_HELD,
      });
    });

    it(`${CHECK_ROLLED_BACK} — a deliberately wrong expectation is read as not held, and the message is the check that did not hold, alone`, () => {
      const outcome = trying(() =>
        judgeRolledBackCheck({
          code: 1,
          text: `Connecting to local database...\nfailed to execute query: error: ${DID_NOT_HOLD}\nTry rerunning the command with --debug to troubleshoot the error.\n`,
        }),
      );

      expect(outcome.threw, `the ending is read (${told(outcome)})`).toBe(false);
      expect(outcome.value?.held, "the check did not hold").toBe(false);
      expect(outcome.value?.message, "the message names the check that did not hold, and nothing else the tool printed").toBe(
        DID_NOT_HOLD,
      );
    });

    it(`${CHECK_ROLLED_BACK} — a check that ended without raising may have left rows behind, so it is read as not held`, () => {
      const outcome = trying(() =>
        judgeRolledBackCheck({
          code: 0,
          text: "Connecting to local database...\nNOTICE: all checks passed\n(0 rows)\n",
        }),
      );

      expect(outcome.threw, `the ending is read (${told(outcome)})`).toBe(false);
      expect(outcome.value?.held, "nothing was rolled back, so the check did not hold").toBe(false);
      expect(
        typeof outcome.value?.message === "string" && outcome.value.message.trim().length > 0,
        `and the message says so (${told(outcome)})`,
      ).toBe(true);
    });

    it(`${CHECK_ROLLED_BACK} — a run that never reached the check's closing message is read as not held`, () => {
      const outcome = trying(() =>
        judgeRolledBackCheck({
          code: 1,
          text: "Connecting to local database...\nfailed to connect to postgres: connection refused\n",
        }),
      );

      expect(outcome.threw, `the ending is read (${told(outcome)})`).toBe(false);
      expect(outcome.value?.held, "no check was seen to hold").toBe(false);
      expect(
        typeof outcome.value?.message === "string" && outcome.value.message.trim().length > 0,
        `and the message says so (${told(outcome)})`,
      ).toBe(true);
    });
  });
}

{
  const CHECK_HELD_ONLY =
    'A rolled-back check is read as held only when its closing message ends with the words every such check closes with, ": all checks passed — everything above is rolled back"; a message that holds the words "all checks passed" elsewhere, as "not all checks passed" does, is reported as the check that did not hold';

  type ToolAnswer = { code: number; text: string };

  type RolledBack = { held: boolean; checks: { file: string; held: boolean; message: string }[] };
  type Read = { held: boolean; message: string };

  type Around = ReturnType<typeof surroundings>["around"];

  const runRolledBackChecks = commands.runRolledBackChecks as unknown as (around: Around, files: string[]) => Promise<RolledBack>;
  const judgeRolledBackCheck = lib.judgeRolledBackCheck as unknown as (answer: ToolAnswer) => Read;

  const SETTINGS = {
    name: "compass-practice",
    address: "http://127.0.0.1:55321",
    inbox: "http://127.0.0.1:55324",
    app: "http://localhost:5183",
  };

  const PUBLIC_KEY = "sb_publishable_made_up_for_the_test";

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

  function tableAnswer(marked: string): ToolAnswer {
    return { code: 0, text: `Connecting to local database...\n answer\n--------\n ${marked}\n(1 row)\n` };
  }

  function raised(closingMessage: string): ToolAnswer {
    return { code: 1, text: `Connecting to local database...\nfailed to execute query: error: ${closingMessage}\n` };
  }

  const ROWS_AS_MADE = "rows:2,0,0,0,0,0,0,0";

  function callKind(args: string[]): string {
    if (args[0] === "status") return "status";
    if (args[0] === "db" && args[1] === "query") {
      if (args.includes("-f")) return "check";
      const sql = String(args[args.length - 1] ?? "");
      if (sql.includes("applied:")) return "applied";
      if (sql.includes("rows:")) return "rows";
    }
    return "other";
  }

  function surroundings(script: { checks?: Record<string, ToolAnswer> } = {}) {
    const asked: string[][] = [];
    const said: string[] = [];
    const sent: string[] = [];

    const tool = async (args: string[]): Promise<ToolAnswer> => {
      asked.push([...args]);
      switch (callKind(args)) {
        case "status":
          return statusAnswer();
        case "applied":
          return tableAnswer("applied:0001_init,0002_save_interview");
        case "rows":
          return tableAnswer(ROWS_AS_MADE);
        case "check": {
          const file = String(args[args.indexOf("-f") + 1]);
          return script.checks?.[file] ?? { code: 1, text: `open ${file}: no such file or directory\n` };
        }
        default:
          return { code: 1, text: "unknown command\n" };
      }
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

  function shown(said: string[]): string {
    return `shown: ${JSON.stringify(said)}`;
  }

  function closingLine(said: string[]): string {
    return said[said.length - 1] ?? "(nothing was said)";
  }

  const CLOSING_WORDS = ": all checks passed — everything above is rolled back";
  const ALL_HELD = `0002_save_interview check${CLOSING_WORDS}`;

  const NOT_ALL = "check 3: not all checks passed for the phases";

  const HOLD_THE_WORDS_ELSEWHERE: [string, string][] = [
    ['"not all checks passed", and nothing after it', "check 3: not all checks passed"],
    ['"not all checks passed", with more after it', NOT_ALL],
    [
      'the closing words with "not" before them, so that the message ends with "all checks passed — everything above is rolled back" and not with the colon and those words',
      "check 3: not all checks passed — everything above is rolled back",
    ],
    [
      "the closing words whole, with more after them",
      `0002_save_interview check${CLOSING_WORDS}, but check 4 expected one project and found two`,
    ],
  ];

  const DID_NOT_HOLD = "wrong-expectation check 1: expected one project, found none";

  const HELD_FILE = "supabase/checks/0002_save_interview.sql";
  const WRONG_FILE = "scripts/practice/fixtures/wrong-expectation.sql";
  const NOT_ALL_FILE = "scripts/practice/fixtures/holds-the-words-elsewhere.sql";

  function ownWords(line: string | undefined, file: string, message: string): string {
    const name = file.split("/").pop() ?? file;
    return String(line ?? "(no line was said about this check)")
      .split(message)
      .join("<its message>")
      .split(file)
      .join("<its file>")
      .split(name)
      .join("<its file>")
      .split(name.replace(/\.sql$/, ""))
      .join("<its file>");
  }

  describe("how a rolled-back check is read", () => {
    it.each(HOLD_THE_WORDS_ELSEWHERE)(
      `${CHECK_HELD_ONLY} — a closing message that holds %s, is read as not held, while one that ends with the words is read as held`,
      async (_what, message) => {
        const read = await trying(() => judgeRolledBackCheck(raised(message)));
        const control = await trying(() => judgeRolledBackCheck(raised(ALL_HELD)));

        expect(read.threw, `the ending is read (${told(read)})`).toBe(false);
        expect(read.value?.held, `the check has not held: its closing message is "${message}" (${told(read)})`).toBe(false);
        expect(read.value?.message, "and its message is the check's own closing message, alone").toBe(message);
        expect(control.value?.held, `a closing message that ends with the words is read as held (${told(control)})`).toBe(true);
        expect(control.value?.message, "and its message is the check's own closing message, alone").toBe(ALL_HELD);
      },
    );

    it(`${CHECK_HELD_ONLY} — run by the command after a check that held and one that plainly did not, the check whose closing message is "not all checks passed" is reported as the check that did not hold, in the words the command says of any check that did not`, async () => {
      const { around, said } = surroundings({
        checks: { [HELD_FILE]: raised(ALL_HELD), [WRONG_FILE]: raised(DID_NOT_HOLD), [NOT_ALL_FILE]: raised(NOT_ALL) },
      });

      const outcome = await trying(() => runRolledBackChecks(around, [HELD_FILE, WRONG_FILE, NOT_ALL_FILE]));

      expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
      expect(
        outcome.value?.checks.map((one) => one.held),
        `the first check held, the second did not, and neither did the one that closed with "not all checks passed" (${told(outcome)})`,
      ).toEqual([true, false, false]);
      expect(outcome.value?.held, "so not every check held").toBe(false);
      expect(outcome.value?.checks[2]?.message, "the check that did not hold is reported with its own closing message").toBe(NOT_ALL);

      expect(said.length, `one line about each check and one closing line are shown (${shown(said)})`).toBe(4);
      expect(String(said[2]), "the line about it holds its closing message").toContain(NOT_ALL);
      expect(
        ownWords(said[2], NOT_ALL_FILE, NOT_ALL),
        `and says of it what the command says of the check that plainly did not hold (${shown(said)})`,
      ).toBe(ownWords(said[1], WRONG_FILE, DID_NOT_HOLD));
      expect(ownWords(said[2], NOT_ALL_FILE, NOT_ALL), "which is not what it says of the check that held").not.toBe(
        ownWords(said[0], HELD_FILE, ALL_HELD),
      );
      expect(closingLine(said), "the closing line says how many did not hold: two").toMatch(/\b(2|two)\b/i);
      expect(closingLine(said), "and does not say that every check held").not.toMatch(/\b(every|all|both)\b(?:\s+\S+){0,3}?\s+held\b/i);
    });
  });
}

{
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  let standIn = "";

  function standInFirst(): void {
    vi.stubEnv("PATH", `${standIn}${path.delimiter}${process.env.PATH ?? ""}`);
    vi.stubEnv("PGOPTIONS", undefined);
    vi.stubEnv("COMPASS_CH044_KEPT", "kept as it was");
  }

  function printed(answer: { code: number; text: string }, name: string): string {
    return new RegExp(`^${name}:(.*)$`, "m").exec(answer.text)?.[1] ?? `(nothing for ${name}; code ${answer.code}: ${answer.text})`;
  }

  describe("the tool with assertions off (cli withAssertionsOff), started as the real tool would be", () => {
    beforeAll(() => {
      standIn = fs.mkdtempSync(path.join(os.tmpdir(), "compass-ch044-"));
      const script = [
        "#!/bin/sh",
        'printf "words:%s\\n" "$*"',
        'printf "folder:%s\\n" "$(pwd -P)"',
        'printf "PGOPTIONS:%s\\n" "${PGOPTIONS-(unset)}"',
        'printf "KEPT:%s\\n" "${COMPASS_CH044_KEPT-(unset)}"',
        "",
      ].join("\n");
      fs.writeFileSync(path.join(standIn, "supabase"), script, { mode: 0o755 });
    });
    afterAll(() => {
      fs.rmSync(standIn, { recursive: true, force: true });
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("its tool is started with PGOPTIONS set to switch assertions off, with the same words and folder as the ordinary tool, and the rest of the environment as it was", async () => {
      standInFirst();

      const answer = await withAssertionsOff(realSurroundings()).tool(["db", "query", "--local", "-f", "a-check.sql"]);

      expect(answer.code, `the stand-in ran (${answer.text})`).toBe(0);
      expect(printed(answer, "PGOPTIONS"), "assertions are switched off for the connections it opens").toBe("-c plpgsql.check_asserts=off");
      expect(printed(answer, "words"), "it is told the same words the ordinary tool is").toBe(
        `--agent no --workdir ${ROOT} db query --local -f a-check.sql`,
      );
      expect(printed(answer, "folder"), "and started in the repository's folder").toBe(fs.realpathSync(ROOT));
      expect(printed(answer, "KEPT"), "and the rest of the environment reaches it as it was").toBe("kept as it was");
    });

    it("the ordinary tool, before and after surroundings with assertions off are made and used, is started without the setting: it belongs to that one tool", async () => {
      standInFirst();
      const ordinary = realSurroundings();

      const before = await ordinary.tool(["db", "query"]);
      const off = withAssertionsOff(ordinary);
      const during = await off.tool(["db", "query"]);
      const after = await ordinary.tool(["db", "query"]);
      const fresh = await realSurroundings().tool(["db", "query"]);

      expect(printed(during, "PGOPTIONS"), "harness: the tool with assertions off has the setting").toBe("-c plpgsql.check_asserts=off");
      expect(printed(before, "PGOPTIONS"), "the ordinary tool, before").toBe("(unset)");
      expect(printed(after, "PGOPTIONS"), "the same ordinary tool, after: the surroundings handed over were not changed").toBe("(unset)");
      expect(printed(fresh, "PGOPTIONS"), "a fresh ordinary tool, after").toBe("(unset)");
      expect(process.env.PGOPTIONS, "and this process's own environment was never given it").toBeUndefined();
      expect(printed(after, "KEPT"), "the ordinary tool keeps the rest of the environment").toBe("kept as it was");
    });

    it("a PGOPTIONS already set when its tool is started is kept, the setting added after it, and the ordinary tool still sees it as it was", async () => {
      standInFirst();
      vi.stubEnv("PGOPTIONS", "-c statement_timeout=60000");
      const ordinary = realSurroundings();

      const off = withAssertionsOff(ordinary);
      const during = await off.tool(["db", "query"]);
      const after = await ordinary.tool(["db", "query"]);

      expect(printed(during, "PGOPTIONS"), "what was set is kept, assertions switched off after it").toBe(
        "-c statement_timeout=60000 -c plpgsql.check_asserts=off",
      );
      expect(printed(after, "PGOPTIONS"), "the ordinary tool sees PGOPTIONS as it was").toBe("-c statement_timeout=60000");
      expect(process.env.PGOPTIONS, "and this process's own environment is unchanged").toBe("-c statement_timeout=60000");

      vi.stubEnv("PGOPTIONS", "-c search_path=public");
      const later = await off.tool(["db", "query"]);
      expect(printed(later, "PGOPTIONS"), "read as the tool is started, not when the surroundings were made").toBe(
        "-c search_path=public -c plpgsql.check_asserts=off",
      );
    });

    it("a PGOPTIONS of nothing but spaces counts as none, and spaces around what it holds are not carried into the setting", async () => {
      standInFirst();
      vi.stubEnv("PGOPTIONS", "   ");
      const off = withAssertionsOff(realSurroundings());

      const blank = await off.tool(["db", "query"]);
      expect(printed(blank, "PGOPTIONS"), "only spaces: the setting alone, with no space in front of it").toBe(
        "-c plpgsql.check_asserts=off",
      );

      vi.stubEnv("PGOPTIONS", "  -c statement_timeout=60000  ");
      const padded = await off.tool(["db", "query"]);
      expect(printed(padded, "PGOPTIONS"), "spaces around what was set: kept without them, one space before the setting").toBe(
        "-c statement_timeout=60000 -c plpgsql.check_asserts=off",
      );
    });

    it("everything else in the surroundings handed over is handed back untouched: say, settings, linked and request", () => {
      const said: string[] = [];
      const around = { ...realSurroundings(), say: (line: string) => { said.push(line); } };

      const off = withAssertionsOff(around);

      expect(off.say, "say").toBe(around.say);
      expect(off.settings, "settings").toBe(around.settings);
      expect(off.linked, "linked").toBe(around.linked);
      expect(off.request, "request").toBe(around.request);
      expect(off.tool, "only the tool is another").not.toBe(around.tool);
      expect(Object.keys(off).sort(), "and nothing is added or left out").toEqual(Object.keys(around).sort());
    });

    it("pretend surroundings, whose tool is not the real one, are refused: their tool is never called, and never replaced by the real Supabase tool", async () => {
      standInFirst();
      const asked: string[][] = [];
      const pretend = { ...realSurroundings(), tool: async (args: string[]) => { asked.push([...args]); return { code: 0, text: "pretend" }; } };

      let made: unknown;
      const refused = (() => { try { made = withAssertionsOff(pretend); return ""; } catch (error) { return String(error); } })();
      const reached = made ? await (made as typeof pretend).tool(["db", "query"]) : undefined;

      expect(refused, `it refused (it answered surroundings whose tool printed: ${reached?.text ?? "(nothing)"})`).toMatch(/real Supabase tool/);
      expect(asked, "and the pretend tool was never called").toEqual([]);
    });

    it("surroundings whose real tool is wrapped to keep a record of what was asked are refused, not stripped of the wrap: the record is kept by wrapping what it answers", async () => {
      standInFirst();
      const real = realSurroundings();
      const asked: string[][] = [];
      const recording = { ...real, tool: async (args: string[]) => { asked.push([...args]); return real.tool(args); } };

      let made: unknown;
      const refused = (() => { try { made = withAssertionsOff(recording); return ""; } catch (error) { return String(error); } })();
      if (made) await (made as typeof recording).tool(["db", "query"]);

      expect(refused, `it refused (a call through what it answered was recorded ${asked.length} time(s))`).toMatch(/real Supabase tool/);

      const off = withAssertionsOff(real);
      const recorded = { ...off, tool: async (args: string[]) => { asked.push([...args]); return off.tool(args); } };
      const answer = await recorded.tool(["db", "query"]);

      expect(asked, "wrapped the other way round, the call is recorded").toEqual([["db", "query"]]);
      expect(printed(answer, "PGOPTIONS"), "and the tool it reaches has assertions off").toBe("-c plpgsql.check_asserts=off");
    });
  });
}

{
  const CAUGHT = (file: string) => ({ file, held: false, message: CATCH_MESSAGE });

  describe("reading a run made with assertions off (lib judgeCatches), at its edges", () => {
    it("a check reported held is named even when its message is the catch's very words: held means no assertion stopped it", () => {
      const judged = judgeCatches([CAUGHT("a.sql"), { file: "b.sql", held: true, message: CATCH_MESSAGE }]);

      expect(judged.caught).toBe(false);
      expect(judged.uncaught).toEqual([{ file: "b.sql", said: `held — ${CATCH_MESSAGE}` }]);
    });

    it("one check, caught, is a run that proves its catch", () => {
      expect(judgeCatches([CAUGHT("supabase/checks/0001_init.sql")])).toEqual({ caught: true, uncaught: [] });
    });

    it("a check reported not held with no message at all is named, with that empty message", () => {
      expect(judgeCatches([{ file: "a.sql", held: false, message: "" }])).toEqual({ caught: false, uncaught: [{ file: "a.sql", said: "" }] });
    });

    it("the checks handed over are not changed, and each file is named as it was handed in", () => {
      const checks = [CAUGHT("./x/../a.sql"), { file: "/abs/b.sql", held: true, message: "b: all checks passed — everything above is rolled back" }];
      const copy = JSON.parse(JSON.stringify(checks));

      const judged = judgeCatches(checks);

      expect(checks).toEqual(copy);
      expect(judged.uncaught.map((one) => one.file)).toEqual(["/abs/b.sql"]);
    });
  });
}

{
  const CHECK_1 =
    'With assertions switched off for one run, every rolled-back check is reported as not held, each with exactly the message "the check cannot run: plpgsql.check_asserts is off, so no assertion would be read", and the closing line says that all of them did not hold';
  const CHECK_4 = "A rolled-back check without the safety catch fails the database checks, which name that check";

  const CATCH = "the check cannot run: plpgsql.check_asserts is off, so no assertion would be read";

  const ALL_PASSED = (name: string) => `${name}: all checks passed — everything above is rolled back`;

  const FIRST = "supabase/checks/0001_init.sql";
  const SECOND = "supabase/checks/0002_save_interview.sql";
  const LATER = "supabase/checks/0007_a-later-change.sql";

  type CheckRun = { file: string; held: boolean; message: string };
  type Judged = { caught: boolean; uncaught: { file: string; said: string }[] };

  const judgeCatches = (lib as unknown as { judgeCatches: (checks: CheckRun[]) => Judged }).judgeCatches;

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
    try {
      return `it answered: ${JSON.stringify(outcome.value)}`;
    } catch {
      return `it answered: ${String(outcome.value)}`;
    }
  }

  function stopped(file: string): CheckRun {
    return { file, held: false, message: CATCH };
  }

  describe("reading a run made with assertions switched off", () => {
    it(`${CHECK_1} — a run in which every check is reported as not held with exactly the catch's message proves the catch, and names nothing`, () => {
      const checks = [stopped(FIRST), stopped(SECOND), stopped(LATER)];

      const outcome = trying(() => judgeCatches(checks));

      expect(outcome.threw, `the run is read (${told(outcome)})`).toBe(false);
      expect(outcome.value, `every check stopped at its catch (${told(outcome)})`).toEqual({ caught: true, uncaught: [] });
    });

    it.each<[string, string]>([
      ["with the database's own words in front of it", `ERROR: ${CATCH}`],
      ["with more after it", `${CATCH} (SQLSTATE P0001)`],
      ["with a full stop after it", `${CATCH}.`],
      ["in other letters", CATCH.replace("the check cannot run", "The check cannot run")],
      ["cut short", "the check cannot run: plpgsql.check_asserts is off"],
    ])(`${CHECK_1} — a check reported as not held with the catch's message %s is not taken for one stopped by its catch, and is named`, (_how, message) => {
      const checks = [stopped(FIRST), { file: SECOND, held: false, message }];

      const outcome = trying(() => judgeCatches(checks));

      expect(outcome.threw, `the run is read (${told(outcome)})`).toBe(false);
      expect(outcome.value?.caught, `"${message}" is not exactly the catch's message (${told(outcome)})`).toBe(false);
      expect(outcome.value?.uncaught, `only that check is named, by its file, with what it was reported with (${told(outcome)})`).toEqual([
        { file: SECOND, said: message },
      ]);
    });

    it(`${CHECK_1} — a run in which no check ran proves nothing: it is not taken for one in which every check stopped at its catch`, () => {
      const outcome = trying(() => judgeCatches([]));

      expect(outcome.threw, `the run is read (${told(outcome)})`).toBe(false);
      expect(outcome.value?.caught, `no check ran, so no catch was proven (${told(outcome)})`).toBe(false);
    });

    it(`${CHECK_4} — a check reported as held with assertions off has no catch: it is named by its file, with that it was reported held and its closing message`, () => {
      const closing = ALL_PASSED("0002_save_interview check");
      const checks = [stopped(FIRST), { file: SECOND, held: true, message: closing }];

      const outcome = trying(() => judgeCatches(checks));

      expect(outcome.threw, `the run is read (${told(outcome)})`).toBe(false);
      expect(outcome.value?.caught, `the run does not prove every catch (${told(outcome)})`).toBe(false);
      expect(
        outcome.value?.uncaught.map((one) => one.file),
        `the check without the catch is named, and only it (${told(outcome)})`,
      ).toEqual([SECOND]);
      const said = String(outcome.value?.uncaught[0]?.said);
      expect(said, "what is said of it says that it was reported held").toMatch(/\bheld\b/i);
      expect(said, "and holds its closing message").toContain(closing);
    });

    it(`${CHECK_4} — every check without the catch is named, in the order they ran, whatever its name, a check a later change adds included`, () => {
      const checks = [
        { file: FIRST, held: true, message: ALL_PASSED("0001 check") },
        stopped(SECOND),
        { file: LATER, held: true, message: ALL_PASSED("a later check") },
      ];

      const outcome = trying(() => judgeCatches(checks));

      expect(outcome.threw, `the run is read (${told(outcome)})`).toBe(false);
      expect(outcome.value?.caught, `the run does not prove every catch (${told(outcome)})`).toBe(false);
      expect(
        outcome.value?.uncaught.map((one) => one.file),
        `both checks without the catch are named, in the order they ran, and the one with it is not (${told(outcome)})`,
      ).toEqual([FIRST, LATER]);
    });

    it(`${CHECK_4} — a check that stopped for another reason before its catch is named too, with the message it was reported with, alone`, () => {
      const other = "cannot insert multiple commands into a prepared statement";
      const checks = [{ file: FIRST, held: false, message: other }, stopped(SECOND)];

      const outcome = trying(() => judgeCatches(checks));

      expect(outcome.threw, `the run is read (${told(outcome)})`).toBe(false);
      expect(outcome.value?.caught, `another reason does not prove the catch (${told(outcome)})`).toBe(false);
      expect(outcome.value?.uncaught, `that check is named, with its message alone (${told(outcome)})`).toEqual([{ file: FIRST, said: other }]);
    });
  });
}

{
  const CHECKS_FOLDER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "checks");
  const ENTRIES = ["0001_init.sql", "0002_save_interview.sql", "schema-shape.sql"];

  const judge = (lib as unknown as { judgeChecksFolder: (entries: string[], migrations: string[]) => { ok: boolean; lines: string[] } })
    .judgeChecksFolder;
  const reader = cli as unknown as {
    checksFolder: () => { entries: string[]; migrations: string[] };
    migrationFiles: () => string[];
    placeStrayCheckFile: (name: string, text: string) => { file: string; remove: () => void };
  };

  const noSuchMigration = (tail: string) =>
    `The file supabase/checks/0007_save_profile.sql is named after a migration that does not exist; ${tail}.`;

  describe("the migrations a line names, however many there are", () => {
    it("one migration: the line ends \"the only migration is …\"", () => {
      expect(judge(["0001_init.sql", "0007_save_profile.sql"], ["0001_init.sql"]).lines).toEqual([
        noSuchMigration("the only migration is 0001_init.sql"),
      ]);
    });

    it("two migrations, handed in any order: \"A and B\", oldest first", () => {
      expect(judge([...ENTRIES, "0007_save_profile.sql"], ["0002_save_interview.sql", "0001_init.sql"]).lines).toEqual([
        noSuchMigration("the migrations are 0001_init.sql and 0002_save_interview.sql"),
      ]);
    });

    it("three migrations: \"A, B and C\"", () => {
      const three = ["0001_init.sql", "0002_save_interview.sql", "0003_add_notes.sql"];
      expect(judge([...ENTRIES, "0003_add_notes.sql", "0007_save_profile.sql"], three).lines).toEqual([
        noSuchMigration("the migrations are 0001_init.sql, 0002_save_interview.sql and 0003_add_notes.sql"),
      ]);
    });

    it("no migration at all: the line says there is none", () => {
      expect(judge(["0007_save_profile.sql"], []).lines).toEqual([noSuchMigration("there is no migration")]);
    });
  });

  describe("a check is any file named exactly after a migration, whatever its shape (the owner's decision at gate 2)", () => {
    const STAMPED = "20261013120000_add_notes.sql";

    it("a migration the Supabase tool named with a timestamp, with its check beside it: whole", () => {
      expect(judge([...ENTRIES, STAMPED], ["0001_init.sql", "0002_save_interview.sql", STAMPED])).toEqual({ ok: true, lines: [] });
    });

    it("the same migration without its check: the one line asks for the file that then passes", () => {
      expect(judge(ENTRIES, ["0001_init.sql", "0002_save_interview.sql", STAMPED]).lines).toEqual([
        `The migration ${STAMPED} has no rolled-back check; write one as supabase/checks/${STAMPED}.`,
      ]);
    });

    it("a timestamped file no migration has is still named as a stray", () => {
      const { lines } = judge([...ENTRIES, STAMPED], ["0001_init.sql", "0002_save_interview.sql"]);
      expect(lines.map((line) => line.split(" is neither")[0])).toEqual([`The file supabase/checks/${STAMPED}`]);
    });

    it("the checks run are the files named exactly after a migration, as committed one per migration", () => {
      expect(cli.rolledBackChecks()).toEqual(reader.migrationFiles().map((name) => path.join("supabase", "checks", name)));
    });

    it("the checks the database runs read are the migrations' own, a timestamped one's included, and no other numbered file", () => {
      const real = fs.readdirSync;
      const listed: Record<string, string[]> = {
        migrations: ["0001_init.sql", "0002_save_interview.sql", STAMPED],
        checks: [...ENTRIES, STAMPED, "0007_save_profile.sql"],
      };
      const spy = vi.spyOn(fs, "readdirSync").mockImplementation(((folder: fs.PathLike, ...rest: unknown[]) => {
        const names = listed[path.basename(String(folder))];
        return names ? [...names] : (real as (...args: unknown[]) => unknown)(folder, ...rest);
      }) as typeof fs.readdirSync);
      try {
        expect(cli.rolledBackChecks()).toEqual(
          ["0001_init.sql", "0002_save_interview.sql", STAMPED].map((name) => path.join("supabase", "checks", name)),
        );
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("only .DS_Store is passed over (the owner's decision at gate 1)", () => {
    it("an editor's hidden file, a swap file and a backup are each named like a stray, in name order, after nothing", () => {
      const { ok, lines } = judge([...ENTRIES, ".DS_Store", "save_profile.sql~", ".save_profile.sql.swp", ".hidden"], [
        "0001_init.sql",
        "0002_save_interview.sql",
      ]);
      expect(ok).toBe(false);
      expect(lines.map((line) => line.split(" is neither")[0])).toEqual([
        "The file supabase/checks/.hidden",
        "The file supabase/checks/.save_profile.sql.swp",
        "The file supabase/checks/save_profile.sql~",
      ]);
      expect(lines.join("\n"), ".DS_Store is never named").not.toContain(".DS_Store");
    });

    it("a stray is named before a migration without a check, whatever the order handed", () => {
      const { lines } = judge(["save_profile.sql", ...ENTRIES].reverse(), ["0003_add_notes.sql", "0001_init.sql", "0002_save_interview.sql"]);
      expect(lines.map((line) => line.slice(0, 40))).toEqual([
        "The file supabase/checks/save_profile.sq",
        "The migration 0003_add_notes.sql has no ",
      ]);
    });
  });

  describe("the reader hands the folder's names, nothing passed over", () => {
    it("the entries are every name the checks folder lists, as it lists them; the migrations are migrationFiles()", () => {
      const read = reader.checksFolder();
      expect(read.entries).toEqual(fs.readdirSync(CHECKS_FOLDER));
      expect(read.migrations).toEqual(reader.migrationFiles());
    });

    for (const name of [".DS_Store", ".ch-050-hidden.sql"]) {
      it(`a dot-name in the folder, ${name}, is among the entries the reader hands`, () => {
        const placed = fs.existsSync(path.join(CHECKS_FOLDER, name)) ? undefined : reader.placeStrayCheckFile(name, "");
        try {
          const read = reader.checksFolder();
          expect(read.entries).toContain(name);
          expect(read.entries).toEqual(fs.readdirSync(CHECKS_FOLDER));
        } finally {
          placed?.remove();
        }
      });
    }

    it("the folder and the migrations as committed are judged whole", () => {
      const read = reader.checksFolder();
      expect(judge(read.entries, read.migrations)).toEqual({ ok: true, lines: [] });
    });
  });

  describe("the helper that places a file in the checks folder never overwrites one", () => {
    for (const name of ["0001_init.sql", "0002_save_interview.sql", "schema-shape.sql"]) {
      it(`it refuses the committed name ${name}, and the file is left as it was`, () => {
        const before = fs.readFileSync(path.join(CHECKS_FOLDER, name), "utf8");
        expect(() => reader.placeStrayCheckFile(name, "overwritten")).toThrow();
        expect(fs.readFileSync(path.join(CHECKS_FOLDER, name), "utf8")).toBe(before);
      });
    }

    for (const name of ["../migrations/0001_init.sql", "sub/save_profile.sql", "..", ".", ""]) {
      it(`it refuses ${JSON.stringify(name)}, which is not a plain name, and places nothing`, () => {
        const before = fs.readdirSync(CHECKS_FOLDER).sort();
        expect(() => reader.placeStrayCheckFile(name, "-- not placed")).toThrow();
        expect(fs.readdirSync(CHECKS_FOLDER).sort()).toEqual(before);
      });
    }

    for (const name of ["../ch-050-not-placed.sql", "..\\ch-050-not-placed.sql"]) {
      it(`it refuses ${JSON.stringify(name)}, which the file system would take, and places nothing`, () => {
        const SUPABASE_FOLDER = path.dirname(CHECKS_FOLDER);
        const where = path.join(CHECKS_FOLDER, name);
        expect(fs.existsSync(where), "nothing of that name is there to begin with").toBe(false);
        const before = { checks: fs.readdirSync(CHECKS_FOLDER).sort(), supabase: fs.readdirSync(SUPABASE_FOLDER).sort() };
        try {
          expect(() => reader.placeStrayCheckFile(name, "-- not placed")).toThrow(/not a plain file name/);
          expect({ checks: fs.readdirSync(CHECKS_FOLDER).sort(), supabase: fs.readdirSync(SUPABASE_FOLDER).sort() }).toEqual(before);
        } finally {
          fs.rmSync(where, { force: true });
        }
      });
    }
  });

  describe("the helper that runs npm run practice:check has a time limit", () => {
    const runner = cli as unknown as {
      runCheckCommand: (options?: { files?: string[]; timeLimit?: number }) => Promise<{ code: number; text: string }>;
    };

    it("past its limit the command is stopped and the helper answers 124 with the line that says so, well before a test would give up", async () => {
      const started = Date.now();
      const ran = await runner.runCheckCommand({ timeLimit: 1 });
      expect(ran.code, ran.text).toBe(124);
      expect(ran.text.trimEnd().split("\n").at(-1)).toBe("The check command was stopped: it ran past its time limit of 0 seconds.");
      expect(Date.now() - started, "answered within the kill's grace, not left waiting").toBeLessThan(15_000);
    }, 30_000);
  });
}

{
const CHECK_1 =
  'With save_profile.sql added to the checks folder, npm run practice:check refuses before any check runs: it prints the line above naming that file, then "No check was run.", ends as failed, and prints no "held" or "did not hold" line';
const CHECK_4 =
  "A file numbered after a migration that does not exist (0007_save_profile.sql) is refused the same way, and its line names the migrations there are";
const CHECK_5 = "A file that is not SQL (notes.txt) in that folder is refused the same way";
const CHECK_6 =
  "With a migration 0003_add_notes.sql added and no check for it, both commands refuse the same way, and the line names the migration and the check file to write; with that check added, named after it, neither command prints the line";
const CHECK_7 =
  "With two stray files in the folder, each is named once, on a line of its own, before the one closing line; a stray file and a migration without a check are named the same way, each on its own line";
const CHECK_9 =
  'With the folder and the migrations as committed, npm run practice:check reports every check held and npm run test:db passes every check, and neither prints a line about the folder or the migrations';

const MIGRATIONS = ["0001_init.sql", "0002_save_interview.sql"];
const ENTRIES = ["0001_init.sql", "0002_save_interview.sql", "schema-shape.sql"];

const CLOSING = "No check was run.";

function strayLine(name: string): string {
  return `The file supabase/checks/${name} is neither a migration's rolled-back check, named after its migration as NNNN_<name>.sql, nor the read-only question schema-shape.sql. Name it after its migration, or move it out of the folder.`;
}

const NO_SUCH_MIGRATION_LINE =
  "The file supabase/checks/0007_save_profile.sql is named after a migration that does not exist; the migrations are 0001_init.sql and 0002_save_interview.sql.";

const NO_CHECK_LINE = "The migration 0003_add_notes.sql has no rolled-back check; write one as supabase/checks/0003_add_notes.sql.";

type Judged = { ok: boolean; lines: string[] };
type Folder = { entries: string[]; migrations: string[] };

const judgeChecksFolder = (lib as unknown as { judgeChecksFolder: (entries: string[], migrations: string[]) => Judged }).judgeChecksFolder;
const refuseUnlessChecksFolderIsWhole = (lib as unknown as { refuseUnlessChecksFolderIsWhole: (folder: Folder) => void })
  .refuseUnlessChecksFolderIsWhole;

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
  try {
    return `it answered: ${JSON.stringify(outcome.value)}`;
  } catch {
    return `it answered: ${String(outcome.value)}`;
  }
}

function judged(entries: string[], migrations: string[]): Outcome<Judged> {
  return trying(() => judgeChecksFolder(entries, migrations));
}

function times(lines: string[] | undefined, line: string): number {
  return (lines ?? []).filter((one) => one === line).length;
}

function refusalLines(outcome: Outcome<unknown>): string[] {
  if (!outcome.threw) return [];
  return String((outcome.error as { message?: unknown })?.message ?? "").split(/\r?\n/);
}

function refusalKind(outcome: Outcome<unknown>): unknown {
  return outcome.threw ? (outcome.error as { kind?: unknown })?.kind : "(nothing was refused)";
}

describe("the judge names a file that is neither a check nor the shape question", () => {
  it(`${CHECK_1} — the line above names save_profile.sql, word for word, and the refusal closes with "No check was run."`, () => {
    const outcome = judged([...ENTRIES, "save_profile.sql"], MIGRATIONS);
    expect(outcome.threw, `the folder is judged (${told(outcome)})`).toBe(false);
    expect(outcome.value, "the folder is not whole, and the one line names that file").toEqual({ ok: false, lines: [strayLine("save_profile.sql")] });

    const refused = trying(() => refuseUnlessChecksFolderIsWhole({ entries: [...ENTRIES, "save_profile.sql"], migrations: MIGRATIONS }));
    expect(refusalKind(refused), `it is refused, as the folder not being whole (${told(refused)})`).toBe("folder");
    expect(refusalLines(refused), "the refusal says the line, then the closing line").toEqual([strayLine("save_profile.sql"), CLOSING]);
  });

  it(`${CHECK_5} — notes.txt is named by the same line`, () => {
    const outcome = judged([...ENTRIES, "notes.txt"], MIGRATIONS);
    expect(outcome.threw, `the folder is judged (${told(outcome)})`).toBe(false);
    expect(outcome.value, "the folder is not whole, and the one line names notes.txt").toEqual({ ok: false, lines: [strayLine("notes.txt")] });

    const refused = trying(() => refuseUnlessChecksFolderIsWhole({ entries: [...ENTRIES, "notes.txt"], migrations: MIGRATIONS }));
    expect(refusalKind(refused), `it is refused the same way (${told(refused)})`).toBe("folder");
    expect(refusalLines(refused)).toEqual([strayLine("notes.txt"), CLOSING]);
  });
});

describe("the judge names a file numbered after a migration that does not exist", () => {
  it(`${CHECK_4} — 0007_save_profile.sql is named, and the line names the two migrations there are`, () => {
    const outcome = judged([...ENTRIES, "0007_save_profile.sql"], MIGRATIONS);
    expect(outcome.threw, `the folder is judged (${told(outcome)})`).toBe(false);
    expect(outcome.value, "the folder is not whole, and the one line names the file and the migrations").toEqual({
      ok: false,
      lines: [NO_SUCH_MIGRATION_LINE],
    });

    const refused = trying(() => refuseUnlessChecksFolderIsWhole({ entries: [...ENTRIES, "0007_save_profile.sql"], migrations: MIGRATIONS }));
    expect(refusalKind(refused), `it is refused the same way (${told(refused)})`).toBe("folder");
    expect(refusalLines(refused)).toEqual([NO_SUCH_MIGRATION_LINE, CLOSING]);
  });

  it(`${CHECK_4} — with three migrations, the line names every one of them`, () => {
    const three = [...MIGRATIONS, "0003_add_notes.sql"];
    const outcome = judged([...ENTRIES, "0003_add_notes.sql", "0007_save_profile.sql"], three);
    expect(outcome.threw, `the folder is judged (${told(outcome)})`).toBe(false);
    expect(outcome.value?.ok, "the folder is not whole").toBe(false);
    const lines = outcome.value?.lines ?? [];
    expect(lines.length, `one line, for the one file (${told(outcome)})`).toBe(1);
    expect(lines[0], "it names the file").toContain("supabase/checks/0007_save_profile.sql");
    expect(lines[0], "it says no such migration exists").toContain("is named after a migration that does not exist");
    for (const migration of three) expect(lines[0], `it names the migration ${migration}`).toContain(migration);
  });
});

describe("the judge names a migration without its check", () => {
  it(`${CHECK_6} — the line names the migration and the check file to write`, () => {
    const migrations = [...MIGRATIONS, "0003_add_notes.sql"];
    const outcome = judged(ENTRIES, migrations);
    expect(outcome.threw, `the folder is judged (${told(outcome)})`).toBe(false);
    expect(outcome.value, "the folder is not whole, and the one line names the migration and the check to write").toEqual({
      ok: false,
      lines: [NO_CHECK_LINE],
    });

    const refused = trying(() => refuseUnlessChecksFolderIsWhole({ entries: ENTRIES, migrations }));
    expect(refusalKind(refused), `it is refused the same way (${told(refused)})`).toBe("folder");
    expect(refusalLines(refused)).toEqual([NO_CHECK_LINE, CLOSING]);
  });

  it(`${CHECK_6} — with that check added, named after it, the line is not said`, () => {
    const migrations = [...MIGRATIONS, "0003_add_notes.sql"];
    const outcome = judged([...ENTRIES, "0003_add_notes.sql"], migrations);
    expect(outcome.threw, `the folder is judged (${told(outcome)})`).toBe(false);
    expect(outcome.value, "the folder is whole, and nothing is said").toEqual({ ok: true, lines: [] });

    const refused = trying(() => refuseUnlessChecksFolderIsWhole({ entries: [...ENTRIES, "0003_add_notes.sql"], migrations }));
    expect(refused.threw, `nothing is refused (${told(refused)})`).toBe(false);
  });
});

describe("several faults, each on a line of its own", () => {
  it(`${CHECK_7} — two stray files: each named once, on a line of its own, before the one closing line`, () => {
    const entries = [...ENTRIES, "save_profile.sql", "notes.txt"];
    const outcome = judged(entries, MIGRATIONS);
    expect(outcome.threw, `the folder is judged (${told(outcome)})`).toBe(false);
    expect(outcome.value?.ok, "the folder is not whole").toBe(false);
    expect(outcome.value?.lines.length, `two lines, one per file (${told(outcome)})`).toBe(2);
    expect(times(outcome.value?.lines, strayLine("save_profile.sql")), "save_profile.sql is named once").toBe(1);
    expect(times(outcome.value?.lines, strayLine("notes.txt")), "notes.txt is named once").toBe(1);

    const refused = trying(() => refuseUnlessChecksFolderIsWhole({ entries, migrations: MIGRATIONS }));
    expect(refusalKind(refused), `it is refused the same way (${told(refused)})`).toBe("folder");
    const lines = refusalLines(refused);
    expect(lines.length, `two lines, then the one closing line (${JSON.stringify(lines)})`).toBe(3);
    expect(times(lines, strayLine("save_profile.sql")), "save_profile.sql is named once").toBe(1);
    expect(times(lines, strayLine("notes.txt")), "notes.txt is named once").toBe(1);
    expect(lines[lines.length - 1], "the closing line comes last").toBe(CLOSING);
    expect(times(lines, CLOSING), "and only once").toBe(1);
  });

  it(`${CHECK_7} — a stray file and a migration without a check: each named, each on its own line, before the one closing line`, () => {
    const migrations = [...MIGRATIONS, "0003_add_notes.sql"];
    const entries = [...ENTRIES, "save_profile.sql"];
    const outcome = judged(entries, migrations);
    expect(outcome.threw, `the folder is judged (${told(outcome)})`).toBe(false);
    expect(outcome.value?.ok, "the folder is not whole").toBe(false);
    expect(outcome.value?.lines.length, `two lines (${told(outcome)})`).toBe(2);
    expect(times(outcome.value?.lines, strayLine("save_profile.sql")), "the stray file is named once").toBe(1);
    expect(times(outcome.value?.lines, NO_CHECK_LINE), "the migration without a check is named once").toBe(1);

    const refused = trying(() => refuseUnlessChecksFolderIsWhole({ entries, migrations }));
    expect(refusalKind(refused), `it is refused the same way (${told(refused)})`).toBe("folder");
    const lines = refusalLines(refused);
    expect(lines.length, `two lines, then the one closing line (${JSON.stringify(lines)})`).toBe(3);
    expect(times(lines, strayLine("save_profile.sql"))).toBe(1);
    expect(times(lines, NO_CHECK_LINE)).toBe(1);
    expect(lines[lines.length - 1], "the closing line comes last").toBe(CLOSING);
  });
});

describe("the folder and the migrations as committed are whole", () => {
  it(`${CHECK_9} — judged as committed, nothing is said about the folder or the migrations`, () => {
    const outcome = judged(ENTRIES, MIGRATIONS);
    expect(outcome.threw, `the folder is judged (${told(outcome)})`).toBe(false);
    expect(outcome.value, "whole: no line").toEqual({ ok: true, lines: [] });

    const refused = trying(() => refuseUnlessChecksFolderIsWhole({ entries: ENTRIES, migrations: MIGRATIONS }));
    expect(refused.threw, `nothing is refused (${told(refused)})`).toBe(false);
  });

  it(`${CHECK_9} — on a developer's own machine, with the operating system's hidden bookkeeping file in the folder, nothing is said either`, () => {
    const outcome = judged([".DS_Store", ...ENTRIES], MIGRATIONS);
    expect(outcome.threw, `the folder is judged (${told(outcome)})`).toBe(false);
    expect(outcome.value, "the hidden file is passed over: whole, no line").toEqual({ ok: true, lines: [] });
  });
});
}

{
const CHECK_1 =
  'With save_profile.sql added to the checks folder, npm run practice:check refuses before any check runs: it prints the line above naming that file, then "No check was run.", ends as failed, and prints no "held" or "did not hold" line';
const CHECK_2 = "With the same file in place, npm run test:db refuses the same way before its first check, and no database check runs";
const CHECK_3 = "Both refusals come with the practice copy down as with it up";
const CHECK_4 =
  "A file numbered after a migration that does not exist (0007_save_profile.sql) is refused the same way, and its line names the migrations there are";
const CHECK_5 = "A file that is not SQL (notes.txt) in that folder is refused the same way";
const CHECK_6 =
  "With a migration 0003_add_notes.sql added and no check for it, both commands refuse the same way, and the line names the migration and the check file to write; with that check added, named after it, neither command prints the line";
const CHECK_7 =
  "With two stray files in the folder, each is named once, on a line of its own, before the one closing line; a stray file and a migration without a check are named the same way, each on its own line";
const CHECK_8 =
  "With a stray file in the folder, naming a real check by hand on the practice command is refused the same way; with the folder as committed, naming it runs that check as today";
const CHECK_9 =
  "With the folder and the migrations as committed, npm run practice:check reports every check held and npm run test:db passes every check, and neither prints a line about the folder or the migrations";

const MIGRATIONS = ["0001_init.sql", "0002_save_interview.sql"];
const ENTRIES = ["0001_init.sql", "0002_save_interview.sql", "schema-shape.sql"];
const CHECKS = ["supabase/checks/0001_init.sql", "supabase/checks/0002_save_interview.sql"];

type Folder = { entries: string[]; migrations: string[] };
const AS_COMMITTED: Folder = { entries: ENTRIES, migrations: MIGRATIONS };

const CLOSING = "No check was run.";

function strayLine(name: string): string {
  return `The file supabase/checks/${name} is neither a migration's rolled-back check, named after its migration as NNNN_<name>.sql, nor the read-only question schema-shape.sql. Name it after its migration, or move it out of the folder.`;
}

const NO_SUCH_MIGRATION_LINE =
  "The file supabase/checks/0007_save_profile.sql is named after a migration that does not exist; the migrations are 0001_init.sql and 0002_save_interview.sql.";

const NO_CHECK_LINE = "The migration 0003_add_notes.sql has no rolled-back check; write one as supabase/checks/0003_add_notes.sql.";

const SETTINGS = {
  name: "compass-practice",
  address: "http://127.0.0.1:55321",
  inbox: "http://127.0.0.1:55324",
  app: "http://localhost:5183",
};

type ToolAnswer = { code: number; text: string };

function statusUp(): ToolAnswer {
  const values = {
    API_URL: SETTINGS.address,
    INBUCKET_URL: SETTINGS.inbox,
    PUBLISHABLE_KEY: "sb_publishable_made_up_for_the_test",
    ANON_KEY: "eyJ.made-up-public.key",
  };
  return { code: 0, text: `${JSON.stringify(values, null, 2)}\n` };
}

const STATUS_DOWN: ToolAnswer = {
  code: 1,
  text: "failed to inspect container health: Error response from daemon: No such container: supabase_db_compass-practice\n",
};

function tableAnswer(marked: string): ToolAnswer {
  return { code: 0, text: `Connecting to local database...\n answer\n--------\n ${marked}\n(1 row)\n` };
}

function held(file: string): ToolAnswer {
  const name = file.split("/").pop() ?? file;
  return { code: 1, text: `Connecting to local database...\nfailed to execute query: error: ${name} check: all checks passed — everything above is rolled back\n` };
}

type Surroundings = Parameters<typeof commands.runRolledBackChecks>[0];

function surroundings(copy: "up" | "down") {
  const asked: string[][] = [];
  const said: string[] = [];
  const sent: string[] = [];

  const tool = async (args: string[]): Promise<ToolAnswer> => {
    asked.push([...args]);
    if (args[0] === "status") return copy === "up" ? statusUp() : STATUS_DOWN;
    if (copy === "down") return STATUS_DOWN;
    if (args[0] === "db" && args[1] === "query") {
      if (args.includes("-f")) return held(String(args[args.indexOf("-f") + 1]));
      const sql = String(args[args.length - 1] ?? "");
      if (sql.includes("applied:")) return tableAnswer("applied:0001_init,0002_save_interview");
      if (sql.includes("rows:")) return tableAnswer("rows:2,0,0,0,0,0,0,0");
    }
    return { code: 1, text: "unknown command\n" };
  };

  const request = (async (input: unknown) => {
    sent.push(String(input));
    throw new Error("no request is expected here");
  }) as unknown as typeof fetch;

  const around: Surroundings = {
    tool,
    say: (line: string) => {
      said.push(String(line));
    },
    settings: SETTINGS,
    linked: false,
    request,
  };
  return { around, asked, said, sent };
}

type Folded = { entries: string[]; migrations: string[] };
const runRolledBackChecks = commands.runRolledBackChecks as unknown as (
  around: Surroundings,
  files: string[],
  folder?: Folded,
) => Promise<{ held: boolean; checks: { file: string; held: boolean; message: string }[] }>;
const prepareDatabaseRun = commands.prepareDatabaseRun as unknown as (
  around: Surroundings,
  migrationFiles: string[],
  folder?: Folded,
) => Promise<{ address: string; publicKey: string; inbox: string }>;

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

function refusalLines(outcome: Outcome<unknown>): string[] {
  if (!outcome.threw) return [];
  return String((outcome.error as { message?: unknown })?.message ?? "").split(/\r?\n/);
}

function refusalKind(outcome: Outcome<unknown>): unknown {
  return outcome.threw ? (outcome.error as { kind?: unknown })?.kind : "(nothing was refused)";
}

function times(lines: string[], line: string): number {
  return lines.filter((one) => one === line).length;
}

async function practiceCheck(copy: "up" | "down", folder: Folder, files: string[] = CHECKS) {
  const record = surroundings(copy);
  const outcome = await trying(() => runRolledBackChecks(record.around, files, folder));
  return { ...record, outcome };
}

async function databaseRun(copy: "up" | "down", folder: Folder) {
  const record = surroundings(copy);
  const outcome = await trying(() => prepareDatabaseRun(record.around, MIGRATIONS.slice(), folder));
  return { ...record, outcome };
}

function expectRefusedBeforeAnything(
  ran: { outcome: Outcome<unknown>; asked: string[][]; said: string[]; sent: string[] },
  lines: string[],
  what: string,
): void {
  expect(refusalKind(ran.outcome), `${what}: refused, as the folder not being whole (${told(ran.outcome)})`).toBe("folder");
  expect(refusalLines(ran.outcome), `${what}: each fault on a line of its own, then "${CLOSING}"`).toEqual([...lines, CLOSING]);
  expect(ran.asked, `${what}: the tool was asked nothing — the practice copy was not even looked for`).toEqual([]);
  expect(ran.said, `${what}: no line about a check was said`).toEqual([]);
  expect(ran.sent, `${what}: no request was sent`).toEqual([]);
}

describe("npm run practice:check refuses a stray file before any check runs", () => {
  it(`${CHECK_1} — refused with the line naming save_profile.sql, then "No check was run.", and no check run and no line said`, async () => {
    const ran = await practiceCheck("up", { entries: [...ENTRIES, "save_profile.sql"], migrations: MIGRATIONS });
    expectRefusedBeforeAnything(ran, [strayLine("save_profile.sql")], "practice:check");
    expect(ran.asked.some((args) => args.includes("-f")), "no check file was run").toBe(false);
  });
});

describe("npm run test:db refuses a stray file before its first check", () => {
  it(`${CHECK_2} — the step before the first check refuses the same way, and nothing is asked of the practice copy`, async () => {
    const ran = await databaseRun("up", { entries: [...ENTRIES, "save_profile.sql"], migrations: MIGRATIONS });
    expectRefusedBeforeAnything(ran, [strayLine("save_profile.sql")], "test:db");
  });
});

describe("the refusal comes whether the practice copy is up or down", () => {
  for (const copy of ["down", "up"] as const) {
    it(`${CHECK_3} — with the practice copy ${copy}, both commands refuse by the folder, not by the copy`, async () => {
      const folder = { entries: [...ENTRIES, "save_profile.sql"], migrations: MIGRATIONS };
      expectRefusedBeforeAnything(await practiceCheck(copy, folder), [strayLine("save_profile.sql")], `practice:check, copy ${copy}`);
      expectRefusedBeforeAnything(await databaseRun(copy, folder), [strayLine("save_profile.sql")], `test:db, copy ${copy}`);
    });
  }
});

describe("a file numbered after a migration that does not exist", () => {
  it(`${CHECK_4} — both commands refuse, the line naming the file and the migrations there are`, async () => {
    const folder = { entries: [...ENTRIES, "0007_save_profile.sql"], migrations: MIGRATIONS };
    expectRefusedBeforeAnything(await practiceCheck("up", folder), [NO_SUCH_MIGRATION_LINE], "practice:check");
    expectRefusedBeforeAnything(await databaseRun("up", folder), [NO_SUCH_MIGRATION_LINE], "test:db");
  });
});

describe("a file that is not SQL", () => {
  it(`${CHECK_5} — both commands refuse notes.txt by the same line`, async () => {
    const folder = { entries: [...ENTRIES, "notes.txt"], migrations: MIGRATIONS };
    expectRefusedBeforeAnything(await practiceCheck("up", folder), [strayLine("notes.txt")], "practice:check");
    expectRefusedBeforeAnything(await databaseRun("up", folder), [strayLine("notes.txt")], "test:db");
  });
});

describe("a migration without its rolled-back check", () => {
  it(`${CHECK_6} — both commands refuse, the line naming the migration and the check file to write`, async () => {
    const folder = { entries: ENTRIES, migrations: [...MIGRATIONS, "0003_add_notes.sql"] };
    expectRefusedBeforeAnything(await practiceCheck("up", folder), [NO_CHECK_LINE], "practice:check");
    expectRefusedBeforeAnything(await databaseRun("up", folder), [NO_CHECK_LINE], "test:db");
  });

  it(`${CHECK_6} — with that check added, named after it, neither command says the line`, async () => {
    const folder = { entries: [...ENTRIES, "0003_add_notes.sql"], migrations: [...MIGRATIONS, "0003_add_notes.sql"] };

    const check = await practiceCheck("up", folder, [...CHECKS, "supabase/checks/0003_add_notes.sql"]);
    expect(check.outcome.threw, `practice:check is not refused (${told(check.outcome)})`).toBe(false);
    expect(check.said.filter((line) => line.includes(NO_CHECK_LINE)), "practice:check does not say the line").toEqual([]);

    const database = await databaseRun("up", folder);
    expect(refusalKind(database.outcome), `test:db is not refused by the folder (${told(database.outcome)})`).not.toBe("folder");
    expect(refusalLines(database.outcome).filter((line) => line === NO_CHECK_LINE), "test:db does not say the line").toEqual([]);
    expect(database.said.filter((line) => line.includes(NO_CHECK_LINE)), "nor say it as a line").toEqual([]);
  });
});

describe("several faults, each named once on a line of its own", () => {
  it(`${CHECK_7} — two stray files: each named once, before the one closing line, by both commands`, async () => {
    const folder = { entries: [...ENTRIES, "save_profile.sql", "notes.txt"], migrations: MIGRATIONS };
    for (const [what, ran] of [
      ["practice:check", await practiceCheck("up", folder)],
      ["test:db", await databaseRun("up", folder)],
    ] as const) {
      expect(refusalKind(ran.outcome), `${what}: refused (${told(ran.outcome)})`).toBe("folder");
      const lines = refusalLines(ran.outcome);
      expect(lines.length, `${what}: two lines and the closing line (${JSON.stringify(lines)})`).toBe(3);
      expect(times(lines, strayLine("save_profile.sql")), `${what}: save_profile.sql named once`).toBe(1);
      expect(times(lines, strayLine("notes.txt")), `${what}: notes.txt named once`).toBe(1);
      expect(lines[lines.length - 1], `${what}: the closing line last`).toBe(CLOSING);
      expect(ran.asked, `${what}: nothing was asked of the tool`).toEqual([]);
    }
  });

  it(`${CHECK_7} — a stray file and a migration without a check: each on its own line, before the one closing line, by both commands`, async () => {
    const folder = { entries: [...ENTRIES, "save_profile.sql"], migrations: [...MIGRATIONS, "0003_add_notes.sql"] };
    for (const [what, ran] of [
      ["practice:check", await practiceCheck("up", folder)],
      ["test:db", await databaseRun("up", folder)],
    ] as const) {
      expect(refusalKind(ran.outcome), `${what}: refused (${told(ran.outcome)})`).toBe("folder");
      const lines = refusalLines(ran.outcome);
      expect(lines.length, `${what}: two lines and the closing line (${JSON.stringify(lines)})`).toBe(3);
      expect(times(lines, strayLine("save_profile.sql")), `${what}: the stray file named once`).toBe(1);
      expect(times(lines, NO_CHECK_LINE), `${what}: the migration without a check named once`).toBe(1);
      expect(lines[lines.length - 1], `${what}: the closing line last`).toBe(CLOSING);
      expect(ran.asked, `${what}: nothing was asked of the tool`).toEqual([]);
    }
  });
});

describe("naming a real check by hand does not get round the folder", () => {
  it(`${CHECK_8} — with a stray file in the folder, naming supabase/checks/0001_init.sql by hand is refused the same way`, async () => {
    const ran = await practiceCheck("up", { entries: [...ENTRIES, "save_profile.sql"], migrations: MIGRATIONS }, ["supabase/checks/0001_init.sql"]);
    expectRefusedBeforeAnything(ran, [strayLine("save_profile.sql")], "practice:check, one check named by hand");
  });

  it(`${CHECK_8} — with the folder as committed, naming it runs that check, and it held`, async () => {
    const ran = await practiceCheck("up", AS_COMMITTED, ["supabase/checks/0001_init.sql"]);
    expect(ran.outcome.threw, `the command ran (${told(ran.outcome)})`).toBe(false);
    expect(
      ran.asked.filter((args) => args.includes("-f")),
      "the tool was asked to run that check, and no other",
    ).toEqual([["db", "query", "--local", "-f", "supabase/checks/0001_init.sql"]]);
    expect(ran.outcome.value?.checks.map((check) => ({ file: check.file, held: check.held })), "that check held").toEqual([
      { file: "supabase/checks/0001_init.sql", held: true },
    ]);
  });
});

describe("with the folder and the migrations as committed, both commands run as today", () => {
  it(`${CHECK_9} — npm run practice:check reports every check held, and says no line about the folder or the migrations`, async () => {
    const ran = await practiceCheck("up", AS_COMMITTED);
    expect(ran.outcome.threw, `the command ran (${told(ran.outcome)})`).toBe(false);
    expect(ran.outcome.value?.held, "every check held").toBe(true);
    expect(ran.outcome.value?.checks.map((check) => check.file), "every check was run").toEqual(CHECKS);
    expect(ran.said.length, `one line about each check and one closing line (${JSON.stringify(ran.said)})`).toBe(CHECKS.length + 1);
    expect(
      ran.said.filter((line) => /supabase\/checks\/[^ ]* is (neither|named after a migration)|has no rolled-back check|No check was run/.test(line)),
      "no line about the folder or the migrations",
    ).toEqual([]);
  });

  it(`${CHECK_9} — the step before npm run test:db's first check goes on to the practice copy, refusing nothing`, async () => {
    const ran = await databaseRun("up", AS_COMMITTED);
    expect(ran.outcome.threw, `the step went on (${told(ran.outcome)})`).toBe(false);
    expect(ran.outcome.value?.address, "and found the practice copy").toBe(SETTINGS.address);
    expect(ran.said, "and said nothing about the folder or the migrations").toEqual([]);
  });
});
}
