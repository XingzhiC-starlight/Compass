import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

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
const CHECK_REPORT =
  'In each of these runs, the test runner\'s report above the summary holds the network rule\'s whole message, word for word, and the line about any other kind of "not proven" reads as today';

const LIMIT = 120;

function notProvenLine(file: string, what: string): string {
  return `not proven  ${file}: ${what}`;
}

function outsideWhat(addresses: string): string {
  return `a network attempt outside any check, nothing sent: ${addresses}`;
}

function lateWhat(name: string, addresses: string): string {
  return `a network attempt left running by "${name}", nothing sent: ${addresses}`;
}

const PRACTICE_ONLY = "A database check reaches the practice copy alone; stand in for any other request inside the check.";

function outsideMessage(addresses: string[]): string {
  return `Something in this file tried to reach something other than the practice copy outside any check, in a step before or after its checks or as the file loaded: ${addresses.join(", ")}. Nothing was sent. ${PRACTICE_ONLY}`;
}

function lateMessage(name: string, addresses: string[]): string {
  return `The check "${name}" left something running that tried to reach something other than the practice copy after it had ended: ${addresses.join(", ")}. Nothing was sent. ${PRACTICE_ONLY}`;
}

const TRIED = {
  loaded: "/tried-as-the-file-loaded/with-a-path-long-enough-to-have-been-cut-before",
  before: "/tried-in-a-step-before-the-checks",
  after: "/tried-in-a-step-after-the-checks",
  first: "/tried-three-times-as-the-file-loaded",
  second: "/tried-once-as-the-file-loaded-second",
  third: "/tried-once-as-the-file-loaded-third",
  lateFirst: "/left-running-by-the-first-check",
  lateSecond: "/left-running-by-the-second-check",
};

const OUTSIDE_GROUP = "throwaway: attempts outside any check";
const OUTSIDE_FIRST = "the first check makes no attempt";
const OUTSIDE_SECOND = "the second check makes no attempt";

const STEP_AFTER_GROUP = "throwaway: a step after the checks fails";
const STEP_AFTER_RAISES = "the step after the checks fails on purpose";

const REPEATS_GROUP = "throwaway: one address tried three times as the file loads";
const REPEATS_CHECK = "the one check makes no attempt";

const MIXED_GROUP = "throwaway";
const MIXED_INNER = "late attempts";
const SHORT_CHECK = "leaves one attempt running";
const LONG_CHECK =
  "leaves another attempt running, under a name as long as the title of a blind test, so that the line about it must cut the name to its first 120 characters and follow them with the three dots, while the report above keeps it whole to its end";
const WAITS = "makes no attempt, while the two left running arrive";
const SHORT_WHOLE = `${MIXED_GROUP} > ${MIXED_INNER} > ${SHORT_CHECK}`;
const LONG_WHOLE = `${MIXED_GROUP} > ${MIXED_INNER} > ${LONG_CHECK}`;

const SWITCHED_OFF_GROUP = "throwaway: every check switched off";
const OFF_FIRST = "the first check is switched off";
const OFF_SECOND = "the second check is switched off";

type Scenario = "outside" | "repeats" | "mixed" | "switched-off";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const THROWAWAY = `ch-035-throwaway-${RUN_ID}`;
const THROWAWAY_FOLDER = path.join(ROOT, "scripts", "practice", THROWAWAY);

function fromTheRoot(name: string): string {
  return `scripts/practice/${THROWAWAY}/${name}`;
}

const OUTSIDE_FILE = fromTheRoot("outside.database.throwaway.test.ts");
const STEP_AFTER_FILE = fromTheRoot("a-step-after-fails.database.throwaway.test.ts");
const REPEATS_FILE = fromTheRoot("repeats.database.throwaway.test.ts");
const MIXED_FILE = fromTheRoot("mixed.database.throwaway.test.ts");
const SWITCHED_OFF_FILE = fromTheRoot("switched-off.database.throwaway.test.ts");

const FILES: Record<Scenario, string[]> = {
  outside: [OUTSIDE_FILE, STEP_AFTER_FILE],
  repeats: [REPEATS_FILE],
  mixed: [MIXED_FILE],
  "switched-off": [SWITCHED_OFF_FILE],
};

const A_RUN_AT_MOST = 120_000;
const A_TEST_AT_MOST = 180_000;

function head(port: number): string[] {
  return [
    "/* Written by the network report's tests (scripts/practice/the-lines-about-a-network-attempt.database.practice-copy.test.ts)",
    "   for one run of the database command, and deleted after it. Every attempt goes to a",
    "   pretend database on this machine, at an address that is not the practice copy's, and",
    "   every one is caught here, so that only the network rule can fail this file for it. */",
    "",
    'import { afterAll, beforeAll, describe, expect, it } from "vitest";',
    "",
    `const AT = ["http://127.0.0.1", "${port}"].join(":");`,
    "async function tryTheNetwork(where: string): Promise<string> {",
    "  try {",
    "    await fetch(AT + where);",
    '    return "answered";',
    "  } catch {",
    '    return "refused";',
    "  }",
    "}",
    "",
  ];
}

function sourceOf(file: string, port: number): string {
  const bodies: Record<string, string[]> = {
    [OUTSIDE_FILE]: [
      `void tryTheNetwork("${TRIED.loaded}");`,
      "",
      "beforeAll(async () => {",
      `  await tryTheNetwork("${TRIED.before}");`,
      "});",
      "",
      "afterAll(async () => {",
      `  await tryTheNetwork("${TRIED.after}");`,
      "});",
      "",
      `describe("${OUTSIDE_GROUP}", () => {`,
      `  it("${OUTSIDE_FIRST}", () => {`,
      "    expect(2 + 2).toBe(4);",
      "  });",
      "",
      `  it("${OUTSIDE_SECOND}", () => {`,
      "    expect(2 + 2).toBe(4);",
      "  });",
      "});",
    ],
    [STEP_AFTER_FILE]: [
      "afterAll(() => {",
      `  throw new Error("${STEP_AFTER_RAISES}");`,
      "});",
      "",
      `describe("${STEP_AFTER_GROUP}", () => {`,
      '  it("passes, before the step after it fails", () => {',
      "    expect(2 + 2).toBe(4);",
      "  });",
      "",
      '  it("passes too", () => {',
      "    expect(2 + 2).toBe(4);",
      "  });",
      "});",
    ],
    [REPEATS_FILE]: [
      `void tryTheNetwork("${TRIED.first}");`,
      `void tryTheNetwork("${TRIED.second}");`,
      `void tryTheNetwork("${TRIED.first}");`,
      `void tryTheNetwork("${TRIED.third}");`,
      `void tryTheNetwork("${TRIED.first}");`,
      "",
      `describe("${REPEATS_GROUP}", () => {`,
      `  it("${REPEATS_CHECK}", () => {`,
      "    expect(2 + 2).toBe(4);",
      "  });",
      "});",
    ],
    [MIXED_FILE]: [
      "afterAll(async () => {",
      `  await tryTheNetwork("${TRIED.after}");`,
      "});",
      "",
      `describe("${MIXED_GROUP}", () => {`,
      `  describe("${MIXED_INNER}", () => {`,
      `    it("${SHORT_CHECK}", () => {`,
      `      setTimeout(() => void tryTheNetwork("${TRIED.lateFirst}"), 100);`,
      "      expect(2 + 2).toBe(4);",
      "    });",
      "",
      `    it("${LONG_CHECK}", () => {`,
      `      setTimeout(() => void tryTheNetwork("${TRIED.lateSecond}"), 100);`,
      "      expect(2 + 2).toBe(4);",
      "    });",
      "",
      `    it("${WAITS}", async () => {`,
      "      await new Promise((resolve) => setTimeout(resolve, 700));",
      "      expect(2 + 2).toBe(4);",
      "    });",
      "  });",
      "});",
    ],
    [SWITCHED_OFF_FILE]: [
      `void tryTheNetwork("${TRIED.loaded}");`,
      "",
      `describe("${SWITCHED_OFF_GROUP}", () => {`,
      `  it.skip("${OFF_FIRST}", () => {`,
      "    expect(2 + 2).toBe(4);",
      "  });",
      "",
      `  it.skip("${OFF_SECOND}", () => {`,
      "    expect(2 + 2).toBe(4);",
      "  });",
      "});",
    ],
  };
  return [...head(port), ...bodies[file], ""].join("\n");
}

type Pretend = { port: number; at: string; arrived: string[]; close: () => Promise<void> };

async function pretendDatabase(): Promise<Pretend> {
  const arrived: string[] = [];
  const server = http.createServer((request, response) => {
    arrived.push(`a request: ${String(request.method)} ${String(request.url)}`);
    response.setHeader("Content-Type", "application/json");
    response.end("[]");
  });
  server.on("connection", () => {
    arrived.push("a connection");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    at: `http://127.0.0.1:${port}`,
    arrived,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

function plain(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\[[0-9;?]*[A-Za-z]/g, "");
}

function surroundingsOfARun(cwd: string): NodeJS.ProcessEnv {
  const kept: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (/^(VITEST|VITE_|PRACTICE_)/.test(key)) continue;
    if (/^npm_/.test(key) && key !== "npm_config_cache") continue;
    if (["NODE_ENV", "TEST", "INIT_CWD", "PWD"].includes(key)) continue;
    kept[key] = value;
  }
  return { ...kept, PWD: cwd, NO_COLOR: "1", FORCE_COLOR: "0" };
}

type Ended = { code: number | null; text: string; overTime: boolean; failedToStart: string };

function runOnce(command: string, args: string[], cwd: string, atMost: number): Promise<Ended> {
  return new Promise((resolve) => {
    let text = "";
    let overTime = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (code: number | null, failedToStart = "") => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ code, text: plain(text), overTime, failedToStart });
    };
    const child = spawn(command, args, { cwd, env: surroundingsOfARun(cwd), stdio: ["ignore", "pipe", "pipe"] });
    child.stdout?.on("data", (chunk: Buffer) => {
      text += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      text += chunk.toString();
    });
    timer = setTimeout(() => {
      overTime = true;
      child.kill("SIGKILL");
    }, atMost);
    child.on("error", (error) => finish(null, String(error)));
    child.on("close", (code) => finish(code));
  });
}

type Seen = {
  started: boolean;
  why: string;
  code: number | null;
  text: string;
  lines: string[];
  at: string;
  arrived: string[];
};

async function reallyRun(scenario: Scenario): Promise<Seen> {
  const pretend = await pretendDatabase();
  const written: string[] = [];
  try {
    fs.mkdirSync(THROWAWAY_FOLDER, { recursive: true });
    for (const file of FILES[scenario]) {
      const where = path.join(ROOT, ...file.split("/"));
      fs.writeFileSync(where, sourceOf(file, pretend.port));
      written.push(where);
    }
    const ended = await runOnce("npm", ["run", "test:db", "--", ...FILES[scenario]], ROOT, A_RUN_AT_MOST);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const why = ended.failedToStart
      ? `the database command could not be started: ${ended.failedToStart}`
      : ended.overTime
        ? `the run was stopped after ${A_RUN_AT_MOST / 1000} seconds`
        : `it ended with the exit code ${String(ended.code)}`;
    return {
      started: ended.failedToStart === "" && !ended.overTime,
      why,
      code: ended.code,
      text: ended.text,
      lines: ended.text.split(/\r?\n/),
      at: pretend.at,
      arrived: [...pretend.arrived],
    };
  } finally {
    for (const where of written) fs.rmSync(where, { force: true });
    await pretend.close();
  }
}

const runs = new Map<Scenario, Promise<Seen>>();

function theRun(scenario: Scenario): Promise<Seen> {
  let run = runs.get(scenario);
  if (!run) {
    run = reallyRun(scenario);
    runs.set(scenario, run);
  }
  return run;
}

afterAll(() => {
  fs.rmSync(THROWAWAY_FOLDER, { recursive: true, force: true });
});

const NO_CLOSING_LINE = "(no closing line was printed)";
const A_CLOSING_LINE = /^(?:The run did not pass\b|Every database check\b|No database check ran\b|\d+ of \d+ database checks failed\b)/;
const A_SUMMARY_LINE = /^(?:failed|second try|switched off|not proven)\b/;

function printed(run: Seen): string {
  return `printed, at its end:\n${run.lines.slice(-40).join("\n")}`;
}

function linesBeginning(run: Seen, words: string): string[] {
  return run.lines.filter((line) => line.startsWith(words));
}

function notProvenAbout(run: Seen, file: string): string[] {
  return linesBeginning(run, "not proven").filter((line) => line.includes(file));
}

function closingLineOf(run: Seen): string {
  const found = run.lines.filter((line) => A_CLOSING_LINE.test(line));
  return found[found.length - 1] ?? NO_CLOSING_LINE;
}

function summaryStartOf(run: Seen): number {
  const first = run.lines.findIndex((line) => A_SUMMARY_LINE.test(line) || A_CLOSING_LINE.test(line));
  return first === -1 ? run.lines.length : first;
}

function reportAbove(run: Seen): string {
  return run.lines.slice(0, summaryStartOf(run)).join("\n");
}

function expectTheRun(run: Seen): void {
  expect(run.started, `harness: the database command was started and came to its end (${run.why}; ${printed(run)})`).toBe(true);
  expect(run.text.includes("npm run practice:up"), `harness: it did not stop for want of the practice copy (${printed(run)})`).toBe(false);
  expect(run.text.includes("No database check file matches"), `harness: every name handed to it matched a throwaway file (${printed(run)})`).toBe(
    false,
  );
  expect(closingLineOf(run), `harness: the command printed its closing line (${printed(run)})`).not.toBe(NO_CLOSING_LINE);
  expect(
    run.arrived,
    "harness: nothing reached the pretend database — every attempt was refused by the network rule, so the run has something to say of it (spec §19)",
  ).toEqual([]);
}

describe("the database command, really run over a file whose checks pass and which tries another address as it loads, in a step before its checks and in a step after them", () => {
  it(
    `${CHECK_OUTSIDE} — the run fails, no check is reported as failed, and one line of its own begins "not proven  <file>: a network attempt outside any check, nothing sent: " and holds the whole address tried as the file loaded`,
    async () => {
      const run = await theRun("outside");

      expectTheRun(run);
      expect(run.code, `the run fails (${printed(run)})`).not.toBe(0);
      expect(linesBeginning(run, "failed"), "no check is reported as failed: the file's checks pass").toEqual([]);
      const about = notProvenAbout(run, OUTSIDE_FILE);
      expect(about.length, `one line of its own is about the file's attempts (${printed(run)})`).toBe(1);
      expect(
        about[0].startsWith(`not proven  ${OUTSIDE_FILE}: a network attempt outside any check, nothing sent: `),
        `the line begins as the intent says (the line: ${about[0]})`,
      ).toBe(true);
      expect(about[0], "and holds the whole address tried as the file loaded").toContain(run.at + TRIED.loaded);
    },
    A_TEST_AT_MOST,
  );

  it(
    `${CHECK_OUTSIDE} — the attempt in the step before the checks and the one in the step after them are said on that same line, after the one made as the file loaded: the line reads whole as the intent quotes it`,
    async () => {
      const run = await theRun("outside");

      expectTheRun(run);
      expect(notProvenAbout(run, OUTSIDE_FILE), `the one line about the file, whole (${printed(run)})`).toEqual([
        notProvenLine(OUTSIDE_FILE, outsideWhat([TRIED.loaded, TRIED.before, TRIED.after].map((where) => run.at + where).join(", "))),
      ]);
    },
    A_TEST_AT_MOST,
  );
});

describe("the database command, really run over a file in which two checks each leave an attempt running", () => {
  it(
    `${CHECK_LATE} — one check with a short name and one whose whole name is longer than 120 characters: the line about the first quotes its whole name, its two groups included; the line about the second quotes the first 120 characters and "…", and no line of the summary holds that name whole`,
    async () => {
      expect([SHORT_WHOLE.length <= LIMIT, LONG_WHOLE.length > LIMIT], "harness: one whole name is within 120 characters, the other past it").toEqual([
        true,
        true,
      ]);
      const run = await theRun("mixed");

      expectTheRun(run);
      const about = notProvenAbout(run, MIXED_FILE);
      expect(about, `a line quotes the short check's whole name, groups included, and the address it left running (${printed(run)})`).toContain(
        notProvenLine(MIXED_FILE, lateWhat(SHORT_WHOLE, run.at + TRIED.lateFirst)),
      );
      expect(about, `a line quotes the first 120 characters of the long check's name and "…", and the address it left running (${printed(run)})`).toContain(
        notProvenLine(MIXED_FILE, lateWhat(`${LONG_WHOLE.slice(0, LIMIT)}…`, run.at + TRIED.lateSecond)),
      );
      expect(
        about.filter((line) => line.includes(LONG_WHOLE)),
        "no line of the summary holds the long name whole",
      ).toEqual([]);
    },
    A_TEST_AT_MOST,
  );
});

describe("the database command, really run over a file that tries one address three times and two others once as it loads", () => {
  it(
    `${CHECK_ADDRESSES} — the address tried three times is said once, first, followed by " (3 times)"; the two tried once follow in the order first tried, each with no count`,
    async () => {
      const run = await theRun("repeats");

      expectTheRun(run);
      expect(notProvenAbout(run, REPEATS_FILE), `the one line about the file, whole (${printed(run)})`).toEqual([
        notProvenLine(REPEATS_FILE, outsideWhat(`${run.at + TRIED.first} (3 times), ${run.at + TRIED.second}, ${run.at + TRIED.third}`)),
      ]);
    },
    A_TEST_AT_MOST,
  );
});

describe("the database command, really run over a file with two checks that each left an attempt running and an attempt outside any check in the step after its checks", () => {
  it(
    `${CHECK_THREE_LINES} — three lines, and no other, are about the file: the first check's, then the second check's, then the one for the attempt made after the checks, each whole`,
    async () => {
      const run = await theRun("mixed");

      expectTheRun(run);
      expect(linesBeginning(run, "failed"), "harness: every check of the file passed, the one running when the late attempts arrived included").toEqual([]);
      expect(notProvenAbout(run, MIXED_FILE), `the three lines about the file, in the order of each one's first attempt (${printed(run)})`).toEqual([
        notProvenLine(MIXED_FILE, lateWhat(SHORT_WHOLE, run.at + TRIED.lateFirst)),
        notProvenLine(MIXED_FILE, lateWhat(`${LONG_WHOLE.slice(0, LIMIT)}…`, run.at + TRIED.lateSecond)),
        notProvenLine(MIXED_FILE, outsideWhat(run.at + TRIED.after)),
      ]);
    },
    A_TEST_AT_MOST,
  );

  it(
    `${CHECK_THREE_LINES} — the closing line counts each line as one thing not proven: "The run did not pass: 3 not proven, and 0 of 3 database checks that ran failed."`,
    async () => {
      const run = await theRun("mixed");

      expectTheRun(run);
      expect(closingLineOf(run), `the closing line (${printed(run)})`).toBe("The run did not pass: 3 not proven, and 0 of 3 database checks that ran failed.");
      expect(run.code, "and the run fails").not.toBe(0);
    },
    A_TEST_AT_MOST,
  );
});

describe("the database command, really run over a file whose every check is switched off and which tries another address as it loads", () => {
  it(
    `${CHECK_SWITCHED_OFF} — the one line about the file is the line for an attempt outside any check, nothing printed says that a step after the checks went wrong, and each of the two checks has its line that begins "switched off"`,
    async () => {
      const run = await theRun("switched-off");

      expectTheRun(run);
      expect(notProvenAbout(run, SWITCHED_OFF_FILE), `the one line about the file, whole (${printed(run)})`).toEqual([
        notProvenLine(SWITCHED_OFF_FILE, outsideWhat(run.at + TRIED.loaded)),
      ]);
      expect(
        run.lines.filter((line) => line.includes("a step after the checks went wrong")),
        "nothing printed says that a step after the checks went wrong",
      ).toEqual([]);
      const off = linesBeginning(run, "switched off").filter((line) => line.includes(SWITCHED_OFF_FILE));
      expect(off.length, `two lines begin "switched off" and name the file (${printed(run)})`).toBe(2);
      expect(off.filter((line) => line.includes(`${SWITCHED_OFF_GROUP} > ${OFF_FIRST}`)).length, "one names the first check").toBe(1);
      expect(off.filter((line) => line.includes(`${SWITCHED_OFF_GROUP} > ${OFF_SECOND}`)).length, "the other names the second").toBe(1);
      expect(run.code, "and the run fails").not.toBe(0);
    },
    A_TEST_AT_MOST,
  );
});

describe("in each of these runs, the test runner's report above the summary, and the lines of another kind", () => {
  it(
    `${CHECK_REPORT} — the run over the file with attempts as it loaded, before and after its checks: the report above the summary holds the network rule's message for an attempt outside any check, with the three addresses in the order tried`,
    async () => {
      const run = await theRun("outside");

      expectTheRun(run);
      expect(reportAbove(run), `the report above the summary holds the message, word for word (${printed(run)})`).toContain(
        outsideMessage([TRIED.loaded, TRIED.before, TRIED.after].map((where) => run.at + where)),
      );
    },
    A_TEST_AT_MOST,
  );

  it(
    `${CHECK_REPORT} — the run over the file that tries one address three times: the report above the summary holds the network rule's message with every address as tried, five in all, in the order tried`,
    async () => {
      const run = await theRun("repeats");

      expectTheRun(run);
      expect(reportAbove(run), `the report above the summary holds the message, word for word (${printed(run)})`).toContain(
        outsideMessage([TRIED.first, TRIED.second, TRIED.first, TRIED.third, TRIED.first].map((where) => run.at + where)),
      );
    },
    A_TEST_AT_MOST,
  );

  it(
    `${CHECK_REPORT} — the run over the file with two late checks and an attempt after its checks: the report above the summary holds the network rule's three messages, the late ones quoting each check's whole name to its end`,
    async () => {
      const run = await theRun("mixed");

      expectTheRun(run);
      const report = reportAbove(run);
      expect(report, `the message for the first check's late attempt, with its whole name (${printed(run)})`).toContain(
        lateMessage(SHORT_WHOLE, [run.at + TRIED.lateFirst]),
      );
      expect(report, `the message for the second check's late attempt, with its whole name, uncut (${printed(run)})`).toContain(
        lateMessage(LONG_WHOLE, [run.at + TRIED.lateSecond]),
      );
      expect(report, `the message for the attempt outside any check (${printed(run)})`).toContain(outsideMessage([run.at + TRIED.after]));
    },
    A_TEST_AT_MOST,
  );

  it(
    `${CHECK_REPORT} — the run over the file whose every check is switched off: the report above the summary holds the network rule's message for an attempt outside any check`,
    async () => {
      const run = await theRun("switched-off");

      expectTheRun(run);
      expect(reportAbove(run), `the report above the summary holds the message, word for word (${printed(run)})`).toContain(
        outsideMessage([run.at + TRIED.loaded]),
      );
    },
    A_TEST_AT_MOST,
  );

  it(
    `${CHECK_REPORT} — beside the file with attempts outside any check runs a file whose step after the checks fails, with no attempt: its line reads as today, "not proven  <file>: a step after the checks went wrong: <reason>"`,
    async () => {
      const run = await theRun("outside");

      expectTheRun(run);
      expect(notProvenAbout(run, STEP_AFTER_FILE), `the one line about the file whose step after the checks failed (${printed(run)})`).toEqual([
        notProvenLine(STEP_AFTER_FILE, `a step after the checks went wrong: ${STEP_AFTER_RAISES}`),
      ]);
    },
    A_TEST_AT_MOST,
  );
});
