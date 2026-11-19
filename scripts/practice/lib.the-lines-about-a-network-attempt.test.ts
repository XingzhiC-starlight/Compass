// @vitest-environment node

import { describe, expect, it } from "vitest";
import { addressesSaid, cutName, leftovers, NETWORK_NOTE, networkMessage, networkTroubles, switchedOffInFile, troublesInFile } from "./lib.mjs";

const CHECK_OUTSIDE =
  "With the practice copy up, a database run over a file whose checks pass and which tries to reach another address as it loads fails, and says, on a line of its own: `not proven  <file>: a network attempt outside any check, nothing sent: <address>`, with the whole address. An attempt in a step that runs once before or after the file's checks is said on that same line";
const CHECK_LATE =
  'An attempt that a check left running, arriving after that check had ended, is said as `not proven  <file>: a network attempt left running by "<name>", nothing sent: <address>`, where <name> is the check\'s whole name, its groups included, cut to its first 120 characters and followed by … when longer, as on the lines about a check';
const CHECK_ADDRESSES =
  'On such a line, each different address appears once, in the order first tried, separated by ", ", and one tried more than once is followed by ` (N times)`';
const CHECK_THREE_LINES =
  'A file with attempts outside any check, and two checks that each left attempts running, gets three such lines, in the order of each one\'s first attempt, and the closing line reads "The run did not pass: 3 not proven, and …"';
const CHECK_SWITCHED_OFF =
  'A file whose checks are all switched off, and which tries another address as it loads, gets the line for an attempt outside any check, and never "a step after the checks went wrong"; its checks are still said as switched off';

type CheckAtWork = { id: string; name: string };
type NetworkAttempt = { address: string; check: CheckAtWork | null };
type Leftover = { check: string | null; addresses: string[] };
type NetworkNote = { errorAt: number; left: Leftover[] };
type RunnerCheck = { result: () => { state: string }; options: { mode: string }; fullName?: string; location?: { line: number } };
type RunnerGroup = {
  errors: () => unknown[];
  meta?: () => Record<string, unknown>;
  children: { allTests: () => Iterable<RunnerCheck>; allSuites: () => Iterable<RunnerGroup> };
};

const NETWORK_NOTE_KEY = "compass.network";

const FILE = "scripts/practice/made-up.database.practice-copy.test.ts";
const LIMIT = 120;

const AT = "http://127.0.0.1:54321";
const LOADED = `${AT}/rest/v1/rows-tried-as-the-file-loaded?select=a-path-long-enough-to-matter`;
const BEFORE = `${AT}/tried-in-a-step-before-the-checks`;
const AFTER = `${AT}/tried-in-a-step-after-the-checks`;
const LATE_A_1 = `${AT}/left-running-by-a-first`;
const LATE_A_2 = `${AT}/left-running-by-a-second`;
const LATE_B = `${AT}/left-running-by-b`;

function outsideWhat(addresses: string): string {
  return `a network attempt outside any check, nothing sent: ${addresses}`;
}

function lateWhat(name: string, addresses: string): string {
  return `a network attempt left running by "${name}", nothing sent: ${addresses}`;
}

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

describe("what the summary says of a file failed for attempts outside any check", () => {
  it(`${CHECK_OUTSIDE} — from the note the test runner left on the file, one thing not proven, in that file, whose words are "a network attempt outside any check, nothing sent: " and the three addresses whole, as the file loaded, before its checks and after them`, () => {
    const note: NetworkNote = { errorAt: 0, left: [{ check: null, addresses: [LOADED, BEFORE, AFTER] }] };

    const outcome = trying(() => networkTroubles(FILE, note));

    expect(outcome.threw, `the note was read (${told(outcome)})`).toBe(false);
    expect(outcome.value, "one line, in the file, with the whole addresses in the order first tried").toEqual([
      { file: FILE, what: outsideWhat(`${LOADED}, ${BEFORE}, ${AFTER}`) },
    ]);
  });
});

describe("what the summary says of a check that left an attempt running", () => {
  const SHORT = "the timeline > shows the day";
  const EXACT = `${"the timeline > a name that is exactly as long as the limit, and not one character longer, is held whole".padEnd(LIMIT - 1, "x")}x`;
  const ONE_PAST = `${EXACT}y`;
  const LONG = `the timeline > ${"the saved row names its account, and no other account can read it or write it; ".repeat(4)}`;

  it(`${CHECK_LATE} — the name is quoted whole, its groups included, for a short name and for one of exactly 120 characters; cut to 120 and "…" for one of 121 and for one far longer`, () => {
    expect([EXACT.length, ONE_PAST.length, LONG.length > 240], "harness: a name exactly at the limit, one a character past it, one far past it").toEqual([
      LIMIT,
      LIMIT + 1,
      true,
    ]);
    const note: NetworkNote = {
      errorAt: 0,
      left: [
        { check: SHORT, addresses: [LATE_A_1] },
        { check: EXACT, addresses: [LATE_A_1] },
        { check: ONE_PAST, addresses: [LATE_A_1] },
        { check: LONG, addresses: [LATE_A_1, LATE_A_2] },
      ],
    };

    const outcome = trying(() => networkTroubles(FILE, note));

    expect(outcome.threw, `the note was read (${told(outcome)})`).toBe(false);
    expect(outcome.value?.map((one) => one.what), "one line for each check, its name quoted whole or cut, then the addresses").toEqual([
      lateWhat(SHORT, LATE_A_1),
      lateWhat(EXACT, LATE_A_1),
      lateWhat(`${EXACT}…`, LATE_A_1),
      lateWhat(`${LONG.slice(0, LIMIT)}…`, `${LATE_A_1}, ${LATE_A_2}`),
    ]);
    expect(outcome.value?.map((one) => one.file), "each in the file").toEqual([FILE, FILE, FILE, FILE]);
  });
});

describe("the addresses on such a line", () => {
  it(`${CHECK_ADDRESSES} — three addresses each tried once read in the order tried; one tried twice among them is said once, where it was first tried, with " (2 times)"; one tried three times with " (3 times)"`, () => {
    const outcome = trying(() => [
      addressesSaid([LOADED, BEFORE, AFTER]),
      addressesSaid([LOADED, BEFORE, LOADED]),
      addressesSaid([BEFORE, LOADED, BEFORE, AFTER, BEFORE]),
      addressesSaid([LOADED, LOADED, BEFORE, BEFORE]),
    ]);

    expect(outcome.threw, `the addresses were said (${told(outcome)})`).toBe(false);
    expect(outcome.value, "each different address once, in the order first tried, with how many times when more than once").toEqual([
      `${LOADED}, ${BEFORE}, ${AFTER}`,
      `${LOADED} (2 times), ${BEFORE}`,
      `${BEFORE} (3 times), ${LOADED}, ${AFTER}`,
      `${LOADED} (2 times), ${BEFORE} (2 times)`,
    ]);
  });

  it(`${CHECK_ADDRESSES} — and so on the line itself: a file that tried one address three times and another once as it loaded gets "<first> (3 times), <second>"`, () => {
    const note: NetworkNote = { errorAt: 0, left: [{ check: null, addresses: [LOADED, BEFORE, LOADED, LOADED] }] };

    const outcome = trying(() => networkTroubles(FILE, note));

    expect(outcome.threw, `the note was read (${told(outcome)})`).toBe(false);
    expect(outcome.value?.map((one) => one.what), "the one line").toEqual([outsideWhat(`${LOADED} (3 times), ${BEFORE}`)]);
  });
});

describe("a file with attempts outside any check and two checks that each left attempts running", () => {
  const a: CheckAtWork = { id: "ch-035-a", name: "a group > the first check that left something running" };
  const b: CheckAtWork = { id: "ch-035-b", name: "a group > the second check that left something running" };
  const attempts: NetworkAttempt[] = [
    { address: LATE_A_1, check: a },
    { address: AFTER, check: null },
    { address: LATE_B, check: b },
    { address: LATE_A_2, check: a },
    { address: AFTER, check: null },
  ];

  it(`${CHECK_THREE_LINES} — the attempts left on the record are grouped by who made them, in the order of each one's first attempt, and the note's groups become three things not proven, one each, in that order`, () => {
    const grouped = trying(() => leftovers(attempts));
    expect(grouped.threw, `the attempts were grouped (${told(grouped)})`).toBe(false);
    expect(grouped.value, "three groups: the first check's, the attempts outside any check, the second check's").toEqual([
      { check: a.name, addresses: [LATE_A_1, LATE_A_2] },
      { check: null, addresses: [AFTER, AFTER] },
      { check: b.name, addresses: [LATE_B] },
    ]);

    const outcome = trying(() => networkTroubles(FILE, { errorAt: 0, left: grouped.value as Leftover[] }));

    expect(outcome.threw, `the note was read (${told(outcome)})`).toBe(false);
    expect(outcome.value, "three lines, in that order, each one thing not proven in the file").toEqual([
      { file: FILE, what: lateWhat(a.name, `${LATE_A_1}, ${LATE_A_2}`) },
      { file: FILE, what: outsideWhat(`${AFTER} (2 times)`) },
      { file: FILE, what: lateWhat(b.name, LATE_B) },
    ]);
  });
});

describe("the report of a file whose every check is switched off, failed for an attempt as it loaded", () => {
  const off = (fullName: string, line: number): RunnerCheck => ({ result: () => ({ state: "skipped" }), options: { mode: "skip" }, fullName, location: { line } });

  it(`${CHECK_SWITCHED_OFF} — the test runner's report of such a file, with the note it left beside the error, is read as the line for an attempt outside any check and nothing else; its two checks are still the switched-off ones`, () => {
    const one = off("every check switched off > the first check is switched off", 12);
    const two = off("every check switched off > the second check is switched off", 16);
    const group: RunnerGroup = { errors: () => [], children: { allTests: () => [one, two], allSuites: () => [] } };
    const file: RunnerGroup = {
      errors: () => [new Error(networkMessage("database", "outside", [LOADED]))],
      meta: () => ({ [NETWORK_NOTE_KEY]: { errorAt: 0, left: [{ check: null, addresses: [LOADED] }] } satisfies NetworkNote }),
      children: { allTests: () => [one, two], allSuites: () => [group] },
    };

    const troubles = trying(() => troublesInFile(FILE, file));
    const switchedOff = trying(() => switchedOffInFile(FILE, file));

    expect(troubles.threw, `the report was read (${told(troubles)})`).toBe(false);
    expect(troubles.value, "the line for an attempt outside any check, and never that a step after the checks went wrong").toEqual([
      { file: FILE, what: outsideWhat(LOADED) },
    ]);
    expect(switchedOff.threw, `the switched-off checks were read (${told(switchedOff)})`).toBe(false);
    expect(switchedOff.value, "its two checks are still said as switched off").toEqual([
      { name: "every check switched off > the first check is switched off", file: FILE, line: 12 },
      { name: "every check switched off > the second check is switched off", file: FILE, line: 16 },
    ]);
  });
});

{
  type Check = { result: () => { state: string }; options: { mode: string } };
  type Group = { errors: () => unknown[]; children: { allTests: () => Check[]; allSuites: () => Group[] } };

  const passed = (): Check => ({ result: () => ({ state: "passed" }), options: { mode: "run" } });
  const leftUnrun = (): Check => ({ result: () => ({ state: "skipped" }), options: { mode: "run" } });
  const switchedOff = (): Check => ({ result: () => ({ state: "skipped" }), options: { mode: "skip" } });

  function group(errors: unknown[], checks: Check[], inside: Group[] = []): Group {
    return {
      errors: () => errors,
      children: {
        allTests: () => [...checks, ...inside.flatMap((one) => one.children.allTests())],
        allSuites: () => [...inside, ...inside.flatMap((one) => one.children.allSuites())],
      },
    };
  }

  const A_FILE = "src/lib/made-up.database.practice-copy.test.ts";

  type Leftover = { check: string | null; addresses: string[] };
  type NetworkNote = { errorAt: number; left: Leftover[] };
  type Noted = Group & { meta: () => Record<string, unknown> };

  const OUTSIDE_AT = "http://127.0.0.1:54321/rest/v1/rows?select=id";
  const LATE_AT = "http://127.0.0.1:54321/auth/v1/user";
  const A_CHECK = "a group > a check";
  const outsideError = (addresses: string[]) => new Error(networkMessage("database", "outside", addresses));

  function noted(file: Group, notes: Record<string, unknown>): Noted {
    return { ...file, meta: () => notes };
  }

  describe("what is left at the end of a file, grouped by who made it", () => {
    it("one group for the attempts outside any check and one for each check, told apart by id and not by name, in the order of each one's first attempt", () => {
      const a = { id: "ch-035-a", name: "the check a" };
      const b = { id: "ch-035-b", name: "the check b" };
      const alikeB = { id: "ch-035-b2", name: "the check b" };

      expect(
        leftovers([
          { address: "http://compass.invalid/late-a-1", check: a },
          { address: "http://compass.invalid/outside-1", check: null },
          { address: "http://compass.invalid/late-b", check: b },
          { address: "http://compass.invalid/late-a-2", check: a },
          { address: "http://compass.invalid/outside-2", check: null },
          { address: "http://compass.invalid/late-alike-b", check: alikeB },
        ]),
      ).toEqual([
        { check: "the check a", addresses: ["http://compass.invalid/late-a-1", "http://compass.invalid/late-a-2"] },
        { check: null, addresses: ["http://compass.invalid/outside-1", "http://compass.invalid/outside-2"] },
        { check: "the check b", addresses: ["http://compass.invalid/late-b"] },
        { check: "the check b", addresses: ["http://compass.invalid/late-alike-b"] },
      ]);
      expect(leftovers([])).toEqual([]);
    });

    it("keeps an address one maker tried twice twice, in the order tried: the line counts it, the group does not", () => {
      expect(
        leftovers([
          { address: "http://compass.invalid/x", check: null },
          { address: "http://compass.invalid/y", check: null },
          { address: "http://compass.invalid/x", check: null },
        ]),
      ).toEqual([{ check: null, addresses: ["http://compass.invalid/x", "http://compass.invalid/y", "http://compass.invalid/x"] }]);
    });

    it("a check at work whose name is missing is grouped under an empty name, never under the word undefined (from the review)", () => {
      const nameless = { id: "ch-035-nameless" } as unknown as { id: string; name: string };

      expect(leftovers([{ address: "http://compass.invalid/x", check: nameless }])).toEqual([{ check: "", addresses: ["http://compass.invalid/x"] }]);
    });
  });

  describe("the addresses of one group, as a line says them", () => {
    it('is "" for none, the address alone for one, and counts in digits however many times', () => {
      expect(addressesSaid([])).toBe("");
      expect(addressesSaid([OUTSIDE_AT])).toBe(OUTSIDE_AT);
      expect(addressesSaid(Array.from({ length: 12 }, () => OUTSIDE_AT))).toBe(`${OUTSIDE_AT} (12 times)`);
    });

    it("tells two addresses apart by their whole text: a query or a fragment makes another address", () => {
      expect(addressesSaid(["http://compass.invalid/a", "http://compass.invalid/a?x=1", "http://compass.invalid/a#x", "http://compass.invalid/a"])).toBe(
        "http://compass.invalid/a (2 times), http://compass.invalid/a?x=1, http://compass.invalid/a#x",
      );
    });
  });

  describe("the summary's lines for a file the network rule failed", () => {
    it("one line for each group of the note, in the note's order, each in the file; none for a note with no group", () => {
      const note: NetworkNote = {
        errorAt: 0,
        left: [
          { check: null, addresses: [OUTSIDE_AT, LATE_AT, OUTSIDE_AT] },
          { check: A_CHECK, addresses: [LATE_AT] },
        ],
      };

      expect(networkTroubles(A_FILE, note)).toEqual([
        { file: A_FILE, what: `a network attempt outside any check, nothing sent: ${OUTSIDE_AT} (2 times), ${LATE_AT}` },
        { file: A_FILE, what: `a network attempt left running by "${A_CHECK}", nothing sent: ${LATE_AT}` },
      ]);
      expect(networkTroubles(A_FILE, { errorAt: 0, left: [] })).toEqual([]);
    });

    it("cuts the check's name as a line about a check does: at 120, and never between the two halves of one character", () => {
      const name = `${"x".repeat(119)}😀 and more`;

      expect(cutName(name), "harness: the cut keeps the 119 characters before the emoji").toBe(`${"x".repeat(119)}…`);
      expect(networkTroubles(A_FILE, { errorAt: 0, left: [{ check: name, addresses: [LATE_AT] }] })[0].what).toBe(
        `a network attempt left running by "${"x".repeat(119)}…", nothing sent: ${LATE_AT}`,
      );
    });
  });

  describe("the report of a file the network rule failed, read with the note the runner left on it", () => {
    const notes = (errorAt: number, left: Leftover[]): Record<string, unknown> => ({ [NETWORK_NOTE]: { errorAt, left } satisfies NetworkNote });
    const outsideLine = `a network attempt outside any check, nothing sent: ${OUTSIDE_AT}`;
    const lateLine = `a network attempt left running by "${A_CHECK}", nothing sent: ${LATE_AT}`;
    const outsideOnly: Leftover[] = [{ check: null, addresses: [OUTSIDE_AT] }];
    const lateOnly: Leftover[] = [{ check: A_CHECK, addresses: [LATE_AT] }];

    it("the note's lines, and the error it stands for read by no other kind: outside any check only, left running only, and both", () => {
      const outside = noted(group([outsideError([OUTSIDE_AT])], [passed()]), notes(0, outsideOnly));
      const late = noted(group([new Error(networkMessage("database", "late", [LATE_AT], A_CHECK))], [passed()]), notes(0, lateOnly));
      const bothSaid = [networkMessage("database", "outside", [OUTSIDE_AT]), networkMessage("database", "late", [LATE_AT], A_CHECK)].join("\n");
      const both = noted(group([new Error(bothSaid)], [passed()]), notes(0, [...outsideOnly, ...lateOnly]));

      expect(troublesInFile(A_FILE, outside)).toEqual([{ file: A_FILE, what: outsideLine }]);
      expect(troublesInFile(A_FILE, late)).toEqual([{ file: A_FILE, what: lateLine }]);
      expect(troublesInFile(A_FILE, both).map((one) => one.what)).toEqual([outsideLine, lateLine]);
    });

    it("beside another error of the file's, that error's line comes first, as today, and the note's lines after it, whichever of the two the note points at", () => {
      const after = new Error("the teardown fails on purpose");
      const noteSecond = noted(group([after, outsideError([OUTSIDE_AT])], [passed()]), notes(1, outsideOnly));
      const noteFirst = noted(group([outsideError([OUTSIDE_AT]), after], [passed()]), notes(0, outsideOnly));

      for (const file of [noteSecond, noteFirst]) {
        expect(troublesInFile(A_FILE, file).map((one) => one.what)).toEqual(["a step after the checks went wrong: the teardown fails on purpose", outsideLine]);
      }
    });

    it("a group's own error is said before the note's lines: they come after all of the file's other lines", () => {
      const inner = group([new Error("the step went wrong")], [leftUnrun()]);
      const file = noted(group([outsideError([OUTSIDE_AT])], [], [inner]), notes(0, outsideOnly));

      expect(troublesInFile(A_FILE, file).map((one) => one.what)).toEqual([
        "1 check did not run, since a step before them went wrong: the step went wrong",
        outsideLine,
      ]);
    });

    it("a file that could not load, and one that holds no check, which tried an address as they loaded, are said both ways", () => {
      const couldNotLoad = noted(group([new Error("Cannot find module './missing'"), outsideError([OUTSIDE_AT])], []), notes(1, outsideOnly));
      const holdsNone = noted(
        group([new Error("No test suite found in file /Users/someone/compass/src/lib/made-up.database.practice-copy.test.ts"), outsideError([OUTSIDE_AT])], []),
        notes(1, outsideOnly),
      );

      expect(troublesInFile(A_FILE, couldNotLoad).map((one) => one.what)).toEqual(["the file could not load: Cannot find module './missing'", outsideLine]);
      expect(troublesInFile(A_FILE, holdsNone).map((one) => one.what)).toEqual(["the file holds no check", outsideLine]);
    });

    it("a file whose every check is switched off is said as the attempt's line alone, and its checks stay the switched-off ones", () => {
      const file = noted(group([outsideError([OUTSIDE_AT])], [switchedOff(), switchedOff()]), notes(0, outsideOnly));

      expect(troublesInFile(A_FILE, file)).toEqual([{ file: A_FILE, what: outsideLine }]);
      expect(switchedOffInFile(A_FILE, file).length).toBe(2);
    });

    it("without the note — a report with no notes, one whose notes hold none, or a note out of shape — the error is read as today", () => {
      const error = outsideError([OUTSIDE_AT]);
      const asToday = `a step after the checks went wrong: ${error.message.slice(0, 200)}`;
      const noNotes = group([error], [passed()]);
      const noNote = noted(group([error], [passed()]), {});
      const outOfShape = noted(group([error], [passed()]), { [NETWORK_NOTE]: { errorAt: "0", left: "none" } });

      for (const file of [noNotes, noNote, outOfShape]) {
        expect(troublesInFile(A_FILE, file).map((one) => one.what)).toEqual([asToday]);
      }
    });

    it("a note whose place is right but whose groups are not a list is out of shape too: the error is read as today, and nothing is thrown (from the review)", () => {
      const error = outsideError([OUTSIDE_AT]);
      const file = noted(group([error], [passed()]), { [NETWORK_NOTE]: { errorAt: 0, left: "none" } });

      expect(troublesInFile(A_FILE, file).map((one) => one.what)).toEqual([`a step after the checks went wrong: ${error.message.slice(0, 200)}`]);
    });

    it("a note that points at an error which is not its attempts' messages is out of shape: no error of the file's is hidden (from the code review)", () => {
      const after = new Error("the teardown fails on purpose");
      const pointsAtTheOther = noted(group([after, outsideError([OUTSIDE_AT])], [passed()]), notes(0, outsideOnly));
      const pointsPastTheEnd = noted(group([after], [passed()]), notes(1, outsideOnly));
      const saysOtherAddresses = noted(group([outsideError([LATE_AT])], [passed()]), notes(0, outsideOnly));

      for (const file of [pointsAtTheOther, pointsPastTheEnd]) {
        expect(troublesInFile(A_FILE, file).map((one) => one.what)).toEqual(["a step after the checks went wrong: the teardown fails on purpose"]);
      }
      expect(troublesInFile(A_FILE, saysOtherAddresses).map((one) => one.what)).toEqual([
        `a step after the checks went wrong: ${outsideError([LATE_AT]).message.slice(0, 200)}`,
      ]);
    });

    it("the messages of either group are the note's error: the suite's are read as the note too (from the code review)", () => {
      const file = noted(group([new Error(networkMessage("suite", "outside", [OUTSIDE_AT]))], [passed()]), notes(0, outsideOnly));

      expect(troublesInFile(A_FILE, file)).toEqual([{ file: A_FILE, what: outsideLine }]);
    });

    it("a note whose groups are a list of the wrong shape is out of shape too: the error is read as today, and nothing is thrown (from the code review)", () => {
      const error = outsideError([OUTSIDE_AT]);
      const asToday = [`a step after the checks went wrong: ${error.message.slice(0, 200)}`];
      const wrongGroups = [[{ check: null }], [{ check: null, addresses: "none" }], [{ check: null, addresses: [1] }], [{ check: 5, addresses: [OUTSIDE_AT] }], [null]];

      for (const left of wrongGroups) {
        const file = noted(group([error], [passed()]), { [NETWORK_NOTE]: { errorAt: 0, left } });
        expect(troublesInFile(A_FILE, file).map((one) => one.what), JSON.stringify(left)).toEqual(asToday);
      }
    });
  });
}
