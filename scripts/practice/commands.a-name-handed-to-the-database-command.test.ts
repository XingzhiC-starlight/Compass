// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refuseNamesWithoutAFile, runDatabaseChecks } from "./commands.mjs";
import { PracticeRefusal } from "./lib.mjs";

const CHECK_NO_MATCH =
  "Given the name of a file that matches no database check, alone or beside a name that does, the database command stops before any check runs, says which name matched nothing, and fails";

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

describe("a name handed to the database command that matches no database check file", () => {
  const RIGHT = "src/lib/db.database.practice-copy.test.ts";
  const TYPO = "src/lib/typo.database.test.ts";
  const SECOND_TYPO = "scripts/practice/no-such-file.database.test.ts";

  const filesNamed = async (name: string): Promise<string[]> => (RIGHT.includes(name) ? [RIGHT] : []);

  function expectNoMatch(outcome: Outcome<unknown>): void {
    expect(outcome.threw, `the command refused to go on (${told(outcome)})`).toBe(true);
    expect(outcome.error, `it refused as a practice command does (${told(outcome)})`).toBeInstanceOf(PracticeRefusal);
    expect((outcome.error as { kind?: unknown }).kind, "the reason is that a name matched no file").toBe("no-match");
  }

  it(`${CHECK_NO_MATCH} — alone: the command refuses, and its message says which name matched nothing`, async () => {
    const outcome = await trying(() => refuseNamesWithoutAFile([TYPO], filesNamed));

    expectNoMatch(outcome);
    expect(messageOf(outcome.error), "the message holds the name that matched nothing").toContain(TYPO);
  });

  it(`${CHECK_NO_MATCH} — beside a name that does: the command refuses all the same, and its message holds the name that matched nothing and not the one that matched`, async () => {
    const alone = await trying(() => refuseNamesWithoutAFile([RIGHT], filesNamed));
    const beside = await trying(() => refuseNamesWithoutAFile([RIGHT, TYPO], filesNamed));

    expect(alone.threw, `a name that matches a file, alone, is not refused (${told(alone)})`).toBe(false);
    expectNoMatch(beside);
    expect(messageOf(beside.error), "the message holds the name that matched nothing").toContain(TYPO);
    expect(messageOf(beside.error), "and not the name that matched a file").not.toContain(RIGHT);
  });

  it(`${CHECK_NO_MATCH} — two names that match nothing, beside one that does: the message holds both, in the order they were given`, async () => {
    const outcome = await trying(() => refuseNamesWithoutAFile([TYPO, RIGHT, SECOND_TYPO], filesNamed));

    expectNoMatch(outcome);
    const message = messageOf(outcome.error);
    expect(message, "the message holds the first name that matched nothing").toContain(TYPO);
    expect(message, "and the second").toContain(SECOND_TYPO);
    expect(message.indexOf(TYPO), "in the order they were given").toBeLessThan(message.indexOf(SECOND_TYPO));
    expect(message, "and not the name that matched a file").not.toContain(RIGHT);
  });
});

{
  const CHECK_NO_MATCH =
    "Given the name of a file that matches no database check, alone or beside a name that does, the database command stops before any check runs, says which name matched nothing, and fails. A name that ends with a line number is refused in the same way, though its file exists, and the message says to leave the number out";

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

  describe("a name handed to the database command that ends with a line number", () => {
    const RIGHT = "src/lib/db.database.practice-copy.test.ts";
    const OTHER = "src/lib/phases.database.test.ts";
    const TYPO = "src/lib/typo.database.test.ts";
    const WITH_NUMBER = `${RIGHT}:214`;
    const PART_WITH_NUMBER = "db.database.practice-copy:57";

    const FILES = [RIGHT, OTHER];

    const filesNamed = async (name: string): Promise<string[]> => {
      const fileAlone = name.replace(/:\d+$/, "");
      return FILES.filter((file) => file.includes(fileAlone));
    };

    const LEAVE_THE_NUMBER_OUT = /leave out the (?:line )?number|leave the (?:line )?number out/i;

    function expectNoMatch(outcome: Outcome<unknown>): void {
      expect(outcome.threw, `the command refused to go on, though the file of that name exists (${told(outcome)})`).toBe(true);
      expect(outcome.error, `it refused as a practice command does (${told(outcome)})`).toBeInstanceOf(PracticeRefusal);
      expect((outcome.error as { kind?: unknown }).kind, "in the same way as a name that matches no file").toBe("no-match");
    }

    it.each([
      ["the file's whole path and a line number", WITH_NUMBER],
      ["a part of the file's path and a line number", PART_WITH_NUMBER],
    ])(`${CHECK_NO_MATCH} — alone, as %s: the command refuses, though the same name without the number matches a file and is not refused, and its message holds the name as it was typed`, async (_what, name) => {
      const withoutNumber = await trying(() => refuseNamesWithoutAFile([name.replace(/:\d+$/, "")], filesNamed));
      const outcome = await trying(() => refuseNamesWithoutAFile([name], filesNamed));

      expect(await filesNamed(name), "harness: its file exists, and asking about the name finds it").toEqual([RIGHT]);
      expect(withoutNumber.threw, `harness: the same name without the number is not refused (${told(withoutNumber)})`).toBe(false);
      expectNoMatch(outcome);
      expect(messageOf(outcome.error), "the message holds the name, with its number, as it was typed").toContain(name);
    });

    it(`${CHECK_NO_MATCH} — alone: the message says to leave the number out`, async () => {
      const outcome = await trying(() => refuseNamesWithoutAFile([WITH_NUMBER], filesNamed));

      expectNoMatch(outcome);
      expect(messageOf(outcome.error), "the message says to leave the number out").toMatch(LEAVE_THE_NUMBER_OUT);
    });

    it(`${CHECK_NO_MATCH} — beside a name that does match a file: the command refuses all the same, and its message holds the name that ends with a line number, not the name that matched, and says to leave the number out`, async () => {
      const outcome = await trying(() => refuseNamesWithoutAFile([OTHER, WITH_NUMBER], filesNamed));

      expectNoMatch(outcome);
      const message = messageOf(outcome.error);
      expect(message, "the message holds the name that ends with a line number").toContain(WITH_NUMBER);
      expect(message, "and not the name that matched a file").not.toContain(OTHER);
      expect(message, "and it says to leave the number out").toMatch(LEAVE_THE_NUMBER_OUT);
    });

    it(`${CHECK_NO_MATCH} — beside a name that matches no file: the message holds both names, in the order they were given, and says to leave the number out`, async () => {
      const outcome = await trying(() => refuseNamesWithoutAFile([TYPO, WITH_NUMBER], filesNamed));

      expectNoMatch(outcome);
      const message = messageOf(outcome.error);
      expect(message, "the message holds the name that matched no file").toContain(TYPO);
      expect(message, "and the name that ends with a line number").toContain(WITH_NUMBER);
      expect(message.indexOf(TYPO), "in the order they were given").toBeLessThan(message.indexOf(WITH_NUMBER));
      expect(message, "and it says to leave the number out").toMatch(LEAVE_THE_NUMBER_OUT);
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
  const PUBLIC_KEY = "sb_publishable_made_up_for_the_test";

  function surroundings(answer: () => Promise<Response> = async () => new Response("[]")) {
    const asked: { address: string; headers: unknown }[] = [];
    const said: string[] = [];
    const around = {
      tool: async () => ({ code: 1, text: "the tool is never asked" }),
      say: (line: string) => {
        said.push(line);
      },
      settings: SETTINGS,
      linked: false,
      request: (async (address: unknown, init?: { headers?: unknown }) => {
        asked.push({ address: String(address), headers: init?.headers });
        return answer();
      }) as unknown as typeof fetch,
    };
    return { around, asked, said };
  }

  function surroundingsUp() {
    const made = surroundings();
    const tool = async (args: string[]) => {
      if (args[0] === "status") {
        return {
          code: 0,
          text: JSON.stringify({ API_URL: SETTINGS.address, INBUCKET_URL: SETTINGS.inbox, PUBLISHABLE_KEY: PUBLIC_KEY }),
        };
      }
      if (String(args[args.length - 1]).includes("applied:")) {
        return { code: 0, text: " answer\n--------\n applied:0001_init,0002_save_interview\n(1 row)\n" };
      }
      return { code: 1, text: "unknown command\n" };
    };
    return { ...made, around: { ...made.around, tool } };
  }

  const COMMITTED = ["0001_init.sql", "0002_save_interview.sql"];

  describe("what a refusal passes on of an error: its first line alone", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const twoLines = new Error("the runner could not start\n    at a line of its own stack, with a path on this machine");

    it("when the test runner cannot run, and when it cannot list the files", async () => {
      const { around } = surroundingsUp();
      const run = await runDatabaseChecks(around, COMMITTED, async () => {
        throw twoLines;
      }).catch((error: unknown) => error);
      const list = await refuseNamesWithoutAFile(["db.database"], async () => {
        throw twoLines;
      }).catch((error: unknown) => error);
      const silent = await refuseNamesWithoutAFile(["db.database"], async () => {
        throw "not an error at all";
      }).catch((error: unknown) => error);

      expect((run as PracticeRefusal).message).toBe("The database checks could not be run: the runner could not start");
      expect((list as PracticeRefusal).message).toBe("The database check files could not be listed: the runner could not start");
      expect((silent as PracticeRefusal).message).toBe("The database check files could not be listed: the test runner gave no reason");
    });
  });

  describe("the refusal of a name that matches no database check file, at its edges", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const files: Record<string, string[]> = {
      "db.database": ["src/lib/db.database.practice-copy.test.ts"],
      "practice/": ["scripts/practice/one.database.test.ts", "scripts/practice/two.database.test.ts"],
    };

    it("asks once for each name, in the order given, and never when no name was typed", async () => {
      const asked: string[] = [];
      const filesNamed = (name: string) => {
        asked.push(name);
        return files[name] ?? [];
      };

      await refuseNamesWithoutAFile([], filesNamed);
      expect(asked).toEqual([]);

      await refuseNamesWithoutAFile(["practice/", "db.database"], filesNamed);
      expect(asked).toEqual(["practice/", "db.database"]);
    });

    it("says its message word for word, for one name and for several", async () => {
      const filesNamed = async (name: string) => files[name] ?? [];
      const one = await refuseNamesWithoutAFile(["db.database", "typo.database"], filesNamed).catch((error: unknown) => error);
      const several = await refuseNamesWithoutAFile(["first typo", "practice/", "second typo"], filesNamed).catch((error: unknown) => error);

      expect((one as PracticeRefusal).kind).toBe("no-match");
      expect((one as PracticeRefusal).message).toBe('No database check file matches the name "typo.database". No check was run.');
      expect((several as PracticeRefusal).message).toBe('No database check file matches these names: "first typo", "second typo". No check was run.');
    });

    it("never asks about a name that ends with a line number, whatever its shape, and asks about a colon that ends nothing", async () => {
      const asked: string[] = [];
      const filesNamed = (name: string) => {
        asked.push(name);
        return ["src/lib/db.database.practice-copy.test.ts"];
      };

      const refused = await refuseNamesWithoutAFile(["db.database:214", "db.database:10-20", "db.database:10:5", "db:2x"], filesNamed).catch(
        (error: unknown) => error,
      );

      expect(asked, "only the name whose colon and digits are not its end").toEqual(["db:2x"]);
      expect((refused as PracticeRefusal).message).toBe(
        'No database check file matches these names: "db.database:214", "db.database:10-20", "db.database:10:5". A name is a file\'s name: leave out the line number. No check was run.',
      );
    });

    it("says nothing of a line number to a name that has none, and reads an answer that is no list as no file", async () => {
      const plain = await refuseNamesWithoutAFile(["typo.database"], async () => []).catch((error: unknown) => error);
      const noList = await refuseNamesWithoutAFile(["db.database"], (() => undefined) as never).catch((error: unknown) => error);

      expect((plain as PracticeRefusal).message).toBe('No database check file matches the name "typo.database". No check was run.');
      expect((noList as PracticeRefusal).kind).toBe("no-match");
    });

    it("turns a test runner that cannot list the files into a refusal, and passes a refusal on as it is", async () => {
      const broke = await refuseNamesWithoutAFile(["db.database"], async () => {
        throw new Error("the runner could not start");
      }).catch((error: unknown) => error);
      const refused = await refuseNamesWithoutAFile(["db.database"], async () => {
        throw new PracticeRefusal("stale", "made up for the test");
      }).catch((error: unknown) => error);

      expect(broke).toBeInstanceOf(PracticeRefusal);
      expect((broke as PracticeRefusal).kind).toBe("tool");
      expect((broke as PracticeRefusal).message).toBe("The database check files could not be listed: the runner could not start");
      expect((refused as PracticeRefusal).kind).toBe("stale");
    });
  });
}
