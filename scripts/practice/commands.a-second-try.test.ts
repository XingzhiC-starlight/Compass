// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { runDatabaseChecks } from "./commands.mjs";
import { forgetNetworkAttempts } from "./lib.mjs";

const CONSTRAINT_SECOND_TRY =
  "On the checks that run on every push, a database check that fails is tried once more; if it then passes, the push is green, and the run lists every check that needed a second try, so an unsteady check stays visible";

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

function forget(): void {
  try {
    forgetNetworkAttempts();
  } catch {
    /* not built yet: nothing to clear */
  }
}

afterEach(() => {
  forget();
});

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
const FALSE_ON_PURPOSE = "kept for proving that a failure is reported > false on purpose: expects a project that was never saved";
const UNSTEADY = "kept for proving that a failure is reported > unsteady on purpose: fails at its first try and passes at its second";

function closingLine(said: string[]): string {
  return said[said.length - 1] ?? "(nothing was said)";
}

describe("the command that runs the database checks, and a second try", () => {
  it(`${CONSTRAINT_SECOND_TRY} — a check that failed once and passed at its second try leaves the run green and is listed`, async () => {
    const { around, said } = surroundings();
    const { runTests } = runner([check(OWNER, true), check(UNSTEADY, true, 2), check(CASCADE, true)]);

    const outcome = await tryingAsync(() => runDatabaseChecks(around, COMMITTED, runTests, { secondTry: true }));

    expect(outcome.threw, `the command ran (${told(outcome)})`).toBe(false);
    expect(outcome.value?.passed, "the run is green").toBe(true);
    expect(outcome.value?.failed, "no check failed in the end").toEqual([]);
    expect(outcome.value?.secondTry, "the unsteady check is listed among those that needed a second try").toEqual([UNSTEADY]);
    expect(
      said.filter((line) => line.includes(UNSTEADY) && /second try/i.test(line)).length,
      `one line shown to the person says the check needed a second try (shown: ${JSON.stringify(said)})`,
    ).toBe(1);
    expect(
      said.filter((line) => line.includes(OWNER) || line.includes(CASCADE)),
      "a check that passed at its first try is not listed",
    ).toEqual([]);
    expect(closingLine(said), "the closing line says that every check passed").toMatch(/pass/i);
  });

  it(`${CONSTRAINT_SECOND_TRY} — a check that failed at both tries is listed too, and the run is not green`, async () => {
    const { around, said } = surroundings();
    const { runTests } = runner([check(OWNER, true), check(FALSE_ON_PURPOSE, false, 2), check(UNSTEADY, true, 2)]);

    const outcome = await tryingAsync(() => runDatabaseChecks(around, COMMITTED, runTests, { secondTry: true }));

    expect(outcome.threw, `a check that fails is an answer, not a refusal (${told(outcome)})`).toBe(false);
    expect(outcome.value?.passed, "the run is not green").toBe(false);
    expect(outcome.value?.ran, "three checks ran").toBe(3);
    expect(outcome.value?.failed, "only the check that failed at both tries failed in the end").toEqual([FALSE_ON_PURPOSE]);
    expect(outcome.value?.secondTry, "every check that needed a second try is listed, in the order they ran").toEqual([
      FALSE_ON_PURPOSE,
      UNSTEADY,
    ]);
    expect(
      said.filter((line) => line.includes(FALSE_ON_PURPOSE) && /failed/i.test(line)).length > 0,
      `a line shown to the person says which check failed (shown: ${JSON.stringify(said)})`,
    ).toBe(true);
    expect(
      said.filter((line) => /second try/i.test(line) && (line.includes(FALSE_ON_PURPOSE) || line.includes(UNSTEADY))).length,
      `and a line for each check that needed a second try (shown: ${JSON.stringify(said)})`,
    ).toBe(2);
  });

  it(`${CONSTRAINT_SECOND_TRY} — the second try is asked for on the checks that run on every push, and not otherwise`, async () => {
    const onEveryPush = surroundings();
    const pushRunner = runner([check(OWNER, true)]);
    const onThisMachine = surroundings();
    const machineRunner = runner([check(OWNER, true)]);

    const push = await tryingAsync(() =>
      runDatabaseChecks(onEveryPush.around, COMMITTED, pushRunner.runTests, { secondTry: true }),
    );
    const machine = await tryingAsync(() => runDatabaseChecks(onThisMachine.around, COMMITTED, machineRunner.runTests));

    expect(push.threw, `the command ran (${told(push)})`).toBe(false);
    expect(machine.threw, `the command ran (${told(machine)})`).toBe(false);
    expect(
      pushRunner.calls.map((call) => call.options),
      "on every push, the checks are run once and told to try a failed check once more",
    ).toEqual([{ secondTry: true }]);
    expect(
      machineRunner.calls.map((call) => call.options),
      "on a developer's machine nothing is tried twice",
    ).toEqual([{ secondTry: false }]);
  });
});
