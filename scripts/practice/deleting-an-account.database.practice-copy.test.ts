import { beforeAll, describe, expect, it } from "vitest";
import { migrationFiles, practiceAccounts, realSurroundings, rolledBackChecks } from "./cli.mjs";
import { remake, runRolledBackChecks } from "./commands.mjs";

const CHECK_ACCOUNT_DELETE =
  "The rolled-back check for the schema's first migration, run by the same command as the setup's, shows that deleting an account removes every row it owned in all seven tables while the other account's rows remain; it reports that it held and leaves nothing behind; a deliberately wrong expectation in it is reported as the check that did not hold";

const HELD_WORDS = ": all checks passed — everything above is rolled back";
const WRONG_EXPECTATION = "scripts/practice/fixtures/wrong-expectation.sql";
const WRONG_MESSAGE_BEGINS = "wrong-expectation check 1";

const firstMigration = (): string => migrationFiles()[0];
const firstCheck = (): string => `supabase/checks/${firstMigration()}`;

const TWO_RUNS_AND_A_REMAKE = 360_000;

type Outcome<T> = { threw: boolean; value?: T; error?: unknown };

async function trying<T>(run: () => Promise<T> | T): Promise<Outcome<T>> {
  try {
    return { threw: false, value: await run() };
  } catch (error) {
    return { threw: true, error };
  }
}

const COUNTED = ["auth.users", "projects", "phases", "learning_items", "daily_tasks", "thoughts", "thought_groups", "time_sessions"];

const HOW_MANY_ROWS = [
  "select 'counted:' || concat_ws(',',",
  COUNTED.map((table) => `(select count(*) from ${table.includes(".") ? table : `public.${table}`})`).join(", "),
  ") as answer",
].join(" ");

async function counted(): Promise<Record<string, number> | string> {
  const outcome = await trying(() => realSurroundings().tool(["db", "query", "--local", HOW_MANY_ROWS]));
  if (outcome.threw) return `(the rows could not be counted: ${String(outcome.error)})`;
  const found = /counted:(\d+(?:,\d+)*)/.exec(String(outcome.value?.text));
  const numbers = found ? found[1].split(",").map(Number) : [];
  if (numbers.length !== COUNTED.length) return `(the rows could not be counted: the tool ended with code ${String(outcome.value?.code)})`;
  return Object.fromEntries(COUNTED.map((name, index) => [name, numbers[index]]));
}

type Ran = { held: boolean; checks: { file: string; held: boolean; message: string }[] };
type Run = { outcome: Outcome<Ran>; said: string[]; before: Record<string, number> | string; after: Record<string, number> | string };

async function runForReal(files: string[]): Promise<Run> {
  const said: string[] = [];
  const before = await counted();
  const outcome = await trying(() => runRolledBackChecks({ ...realSurroundings(), say: (line: string) => said.push(String(line)) }, files));
  const after = await counted();
  return { outcome, said, before, after };
}

let asTheSetupsAre: Run | undefined;
let besideAWrongOne: Run | undefined;
let checksRun: string[] = [];

beforeAll(async () => {
  checksRun = rolledBackChecks();
  try {
    asTheSetupsAre = await runForReal(checksRun);
    besideAWrongOne = await runForReal([firstCheck(), WRONG_EXPECTATION]);
  } finally {
    const leftBehind = [asTheSetupsAre, besideAWrongOne].some((run) => !run || JSON.stringify(run.before) !== JSON.stringify(run.after));
    if (leftBehind) await trying(() => remake({ ...realSurroundings(), say: () => {} }, practiceAccounts()));
  }
}, TWO_RUNS_AND_A_REMAKE);

function verdictOn(run: Run | undefined, file: string) {
  return run?.outcome.value?.checks.find((check) => check.file === file);
}

function shown(run: Run | undefined): string {
  if (!run) return "the command was never run";
  if (run.outcome.threw) return `it threw: ${String(run.outcome.error)}`;
  return `it answered ${JSON.stringify(run.outcome.value)}; shown: ${JSON.stringify(run.said)}`;
}

describe("the first migration's rolled-back check, run by the practice command", () => {
  it(`${CHECK_ACCOUNT_DELETE} — the first migration has a rolled-back check of its own, run by the same command as the setup's`, () => {
    expect(firstMigration(), "harness: the schema's first migration").toBe("0001_init.sql");
    expect(checksRun, "the rolled-back checks the command runs").toContain(firstCheck());
    expect(checksRun, "beside the setup's own").toContain("supabase/checks/0002_save_interview.sql");
  });

  it(`${CHECK_ACCOUNT_DELETE} — run with the setup's, it reports that it held: deleting an account removed every row it owned while the other's remained`, () => {
    expect(asTheSetupsAre?.outcome.threw, `the command ran, for real (${shown(asTheSetupsAre)})`).toBe(false);
    const verdict = verdictOn(asTheSetupsAre, firstCheck());
    expect(verdict, `the first migration's check was run and reported (${shown(asTheSetupsAre)})`).toBeDefined();
    expect(verdict?.held, `it is reported as held (${shown(asTheSetupsAre)})`).toBe(true);
    expect(verdict?.message.endsWith(HELD_WORDS), `its closing message ends with the words of a check that held: ${String(verdict?.message)}`).toBe(true);
    expect(asTheSetupsAre?.outcome.value?.held, "and the run as a whole held").toBe(true);
    expect(asTheSetupsAre?.said.length, `one line about each check and one closing line are shown (${shown(asTheSetupsAre)})`).toBe(checksRun.length + 1);
  });

  it(`${CHECK_ACCOUNT_DELETE} — run with the setup's, it leaves nothing behind`, () => {
    expect(typeof asTheSetupsAre?.before, `harness: the rows could be counted before the run (${String(asTheSetupsAre?.before)})`).toBe("object");
    expect(verdictOn(asTheSetupsAre, firstCheck()), `harness: the first migration's check was run (${shown(asTheSetupsAre)})`).toBeDefined();
    expect(asTheSetupsAre?.after, "the practice copy holds the same accounts and rows after the run as before").toEqual(asTheSetupsAre?.before);
  });

  it(`${CHECK_ACCOUNT_DELETE} — a deliberately wrong expectation beside it is reported as the check that did not hold`, () => {
    expect(besideAWrongOne?.outcome.threw, `the command ran, for real (${shown(besideAWrongOne)})`).toBe(false);
    const first = verdictOn(besideAWrongOne, firstCheck());
    const wrong = verdictOn(besideAWrongOne, WRONG_EXPECTATION);
    expect(first?.held, `the first migration's check is still reported as held (${shown(besideAWrongOne)})`).toBe(true);
    expect(wrong?.held, `the wrong expectation is reported as not held (${shown(besideAWrongOne)})`).toBe(false);
    expect(wrong?.message.startsWith(WRONG_MESSAGE_BEGINS), `with its own closing message: ${String(wrong?.message)}`).toBe(true);
    expect(besideAWrongOne?.outcome.value?.held, "and the run as a whole did not hold").toBe(false);
    expect(besideAWrongOne?.after, "and nothing was left behind").toEqual(besideAWrongOne?.before);
  });
});
