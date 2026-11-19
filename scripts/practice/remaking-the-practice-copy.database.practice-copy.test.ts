import { describe, expect, it } from "vitest";
import { migrationFiles, practiceAccounts, realSurroundings, surroundingsWithBrokenMigration } from "./cli.mjs";
import { findPracticeCopy, makeAccounts, prepareDatabaseRun, remake } from "./commands.mjs";
import { PracticeRefusal } from "./lib.mjs";

const CHECK_REMADE =
  "The practice copy is torn down and remade, and the migrations replay cleanly onto the empty database; a migration that cannot replay is reported before any check runs";

const A_REMAKE = 240_000;
const TWO_REMAKES = 360_000;

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

type ToolAnswer = { code: number; text: string };
type Surroundings = ReturnType<typeof realSurroundings>;

function keepingARecord(surroundings: Surroundings) {
  const said: string[] = [];
  const asked: { args: string[]; answer: ToolAnswer }[] = [];
  const sent: string[] = [];

  const around: Surroundings = {
    ...surroundings,
    say: (line: string) => {
      said.push(String(line));
    },
    tool: async (args: string[]) => {
      const answer = await surroundings.tool(args);
      asked.push({ args: [...args], answer });
      return answer;
    },
    request: (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      sent.push(input instanceof Request ? input.url : String(input));
      return surroundings.request(input, init);
    }) as typeof fetch,
  };

  return { around, said, asked, sent };
}

const COUNTED = ["auth.users", "projects", "phases", "learning_items", "daily_tasks", "thoughts", "thought_groups", "time_sessions"];

const HOW_MANY_ROWS = [
  "select 'counted:' || concat_ws(',',",
  [
    "(select count(*) from auth.users)",
    "(select count(*) from public.projects)",
    "(select count(*) from public.phases)",
    "(select count(*) from public.learning_items)",
    "(select count(*) from public.daily_tasks)",
    "(select count(*) from public.thoughts)",
    "(select count(*) from public.thought_groups)",
    "(select count(*) from public.time_sessions)",
  ].join(", "),
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

function accountsIn(rows: Record<string, number> | string): number | string {
  return typeof rows === "string" ? rows : rows["auth.users"];
}

function asJustRemade(): Record<string, number> {
  return Object.fromEntries(COUNTED.map((name) => [name, name === "auth.users" ? practiceAccounts().length : 0]));
}

describe("the practice copy's database, remade for real", () => {
  it(
    `${CHECK_REMADE} — remade for real: what was there before is gone, every committed migration replays, and the practice accounts are made again`,
    async () => {
      const { around, said, asked } = keepingARecord(realSurroundings());
      const committed = migrationFiles();

      const thrownAway = { email: `thrown-away-${Date.now().toString(36)}@compass.test`, password: "Thrown-away-1!" };
      const where = await trying(() => findPracticeCopy(around));
      expect(where.threw, `harness: the practice copy is up (${told(where)})`).toBe(false);
      const registered = await trying(() =>
        makeAccounts(around, where.value as { address: string; publicKey: string }, [thrownAway]),
      );
      expect(registered.threw, `harness: one more account was made before the remake (${told(registered)})`).toBe(false);
      const before = await counted();
      expect(
        Number(accountsIn(before)) > practiceAccounts().length,
        `harness: before the remake the practice copy holds more than its own accounts (${JSON.stringify(before)})`,
      ).toBe(true);

      asked.length = 0;
      said.length = 0;
      const outcome = await trying(() => remake(around, practiceAccounts()));
      const after = await counted();

      expect(outcome.threw, `the practice copy was remade (${told(outcome)})`).toBe(false);
      const remade = asked.find((one) => one.args[0] === "db" && one.args[1] === "reset");
      expect(remade?.answer.code, "the tool remade the database, and ended well").toBe(0);
      expect(
        committed.filter((file) => !String(remade?.answer.text).includes(`Applying migration ${file}`)),
        "committed migrations that were not replayed",
      ).toEqual([]);
      expect(committed.length > 0, "harness: there are committed migrations to replay").toBe(true);
      expect(after, "the database was emptied and the practice accounts made again: its accounts, and no row in any table").toEqual(
        asJustRemade(),
      );
      expect(said.length, `one line is shown to the person (shown: ${JSON.stringify(said)})`).toBe(1);

      const ready = await trying(() => prepareDatabaseRun(around, committed));
      expect(ready.threw, `the remade copy holds exactly the committed migrations: the database checks may begin (${told(ready)})`).toBe(
        false,
      );
    },
    A_REMAKE,
  );

  it(
    `${CHECK_REMADE} — a migration that cannot replay, met for real: it is reported by its file's name, and the command goes no further`,
    async () => {
      const made = await trying(() => surroundingsWithBrokenMigration());
      let outcome: Outcome<unknown> = { threw: false, value: "(the remake was never run)" };
      let said: string[] = [];
      let sent: string[] = [];
      let replayed: ToolAnswer | undefined;

      try {
        if (!made.threw && made.value) {
          const record = keepingARecord(made.value.around);
          outcome = await trying(() => remake(record.around, practiceAccounts()));
          said = record.said;
          sent = record.sent;
          replayed = record.asked.find((one) => one.args[0] === "db" && one.args[1] === "reset")?.answer;
        }
      } finally {
        try {
          made.value?.discard();
        } catch {
          /* there was nothing to discard */
        }
        const mended = await trying(() => remake({ ...realSurroundings(), say: () => {} }, practiceAccounts()));
        expect(
          mended.threw,
          `harness: the practice copy was mended after the check — if not, run "npm run practice:reset" (${told(mended)})`,
        ).toBe(false);
      }

      expect(made.threw, `a migration that cannot replay was put beside the committed ones (${told(made)})`).toBe(false);
      const broken = String(made.value?.migration);
      expect(broken.endsWith(".sql"), `it has a file name (${broken})`).toBe(true);
      expect(migrationFiles(), "harness: it is one more than the committed migrations").not.toContain(broken);

      expect(outcome.threw, `the command refused to go on (${told(outcome)})`).toBe(true);
      expect(outcome.error, `it refused as a practice command does (${told(outcome)})`).toBeInstanceOf(PracticeRefusal);
      expect((outcome.error as { kind?: unknown }).kind, "the reason is that a migration could not replay").toBe("replay");
      expect(messageOf(outcome.error), "the message names the migration that could not replay").toContain(broken);
      expect(
        String(replayed?.text).includes(`Applying migration ${broken}`),
        "harness: the tool did meet that migration, for real",
      ).toBe(true);
      expect(replayed?.code, "harness: and ended in failure there").not.toBe(0);
      expect(said, "it said nothing else to the person: nothing was reported as remade").toEqual([]);
      expect(sent, "and it went no further: no account was made, nothing was sent").toEqual([]);
    },
    TWO_REMAKES,
  );
});
