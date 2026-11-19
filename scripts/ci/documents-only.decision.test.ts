// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  DATABASE_JOB,
  databaseConclusion,
  isDocument,
  recordLine,
  recordedTest,
  reliedOnRun,
  verdict,
  workflowLines,
} from "./documents-only.mjs";

type Run = {
  id: number;
  number: number;
  url: string;
  headSha: string;
  databaseConclusion: string | null;
};

function run(number: number, databaseConclusion: string | null, headSha = `${number}`.repeat(40).slice(0, 40)): Run {
  return {
    id: 9000 + number,
    number,
    url: `https://github.com/owner/repo/actions/runs/${9000 + number}`,
    headSha,
    databaseConclusion,
  };
}

const PASSED = run(7, "success", "abcdef1234567890abcdef1234567890abcdef12");

const NOW = 100;

function facts(overrides: Record<string, unknown> = {}) {
  return {
    action: "synchronize",
    earlier: PASSED,
    changed: ["docs/sample/plan.md", "README.md"],
    problem: null,
    ...overrides,
  };
}

describe("what counts as a document", () => {
  it("a markdown file is a document wherever it sits", () => {
    for (const p of ["README.md", "docs/notes/plan.md", ".claude/skills/fold/SKILL.md", "AGENTS.md"]) {
      expect(isDocument(p), p).toBe(true);
    }
  });

  it("the ending is read in any letter case", () => {
    expect(isDocument("notes/OLD.MD")).toBe(true);
    expect(isDocument("notes/mixed.Md")).toBe(true);
  });

  it("anything else is not a document, even with md in its name", () => {
    for (const p of [
      "src/App.tsx",
      "scripts/ci/documents-only.mjs",
      ".github/workflows/ci.yml",
      "supabase/migrations/0001_init.sql",
      "package-lock.json",
      "src/md/thing.ts",
      "README.md.bak",
      "page.mdx",
      "md",
    ]) {
      expect(isDocument(p), p).toBe(false);
    }
  });
});

describe("how an earlier run's database job ended", () => {
  it("reads the database job's conclusion and ignores the other jobs", () => {
    const jobs = [
      { name: "checks", conclusion: "failure" },
      { name: "what changed", conclusion: "failure" },
      { name: DATABASE_JOB, conclusion: "success" },
    ];
    expect(databaseConclusion(jobs)).toBe("success");
  });

  it("says nothing when the run has no database job, or it has not ended", () => {
    expect(databaseConclusion([{ name: "checks", conclusion: "success" }])).toBeNull();
    expect(databaseConclusion([{ name: DATABASE_JOB, conclusion: null }])).toBeNull();
    expect(databaseConclusion([])).toBeNull();
  });
});

describe("which earlier run a skip may rely on", () => {
  it("relies on the newest other run whose database checks passed, in whatever order the runs come", () => {
    const runs = [run(3, "success"), run(5, "success"), run(4, "success")];
    expect(reliedOnRun(runs, NOW)?.number).toBe(5);
    expect(reliedOnRun([...runs].reverse(), NOW)?.number).toBe(5);
  });

  it("never relies on this run itself", () => {
    const current = run(6, "success");
    expect(reliedOnRun([run(5, "success"), current], current.number)?.number).toBe(5);
  });

  it("never relies on a run that started after this one, when an older run is run again", () => {
    const runs = [run(5, "success"), run(7, "success"), run(8, "success")];
    expect(reliedOnRun(runs, 6)?.number).toBe(5);
    expect(reliedOnRun(runs.slice(1), 6)).toBeNull();
  });

  it("never relies on a run that was stopped, failed, skipped or has not ended", () => {
    const runs = [run(2, "success"), run(3, "cancelled"), run(4, "failure"), run(5, "skipped"), run(6, null)];
    expect(reliedOnRun(runs, NOW)?.number).toBe(2);
  });

  it("relies on none when no other run passed", () => {
    expect(reliedOnRun([run(3, "cancelled"), run(4, "failure")], NOW)).toBeNull();
    expect(reliedOnRun([], NOW)).toBeNull();
  });
});

describe("the decision", () => {
  it("skips when only documents changed since a run that passed", () => {
    expect(verdict(facts()).database).toBe("skip");
  });

  it("skips when nothing at all changed since a run that passed", () => {
    expect(verdict(facts({ changed: [] })).database).toBe("skip");
  });

  it("a skip names the commit and the run it relies on", () => {
    const { reason } = verdict(facts());
    expect(reason).toContain("abcdef1");
    expect(reason).toContain("#7");
    expect(reason).toContain(PASSED.url);
    expect(reason.toLowerCase()).toContain("only documents");
  });

  it("an opened or reopened pull request runs in full, however clean the history", () => {
    for (const action of ["opened", "reopened"]) {
      const decided = verdict(facts({ action }));
      expect(decided.database, action).toBe("run");
      expect(decided.reason, action).toContain(action);
    }
  });

  it("any action but a push to the branch runs in full", () => {
    expect(verdict(facts({ action: "edited" })).database).toBe("run");
    expect(verdict(facts({ action: "" })).database).toBe("run");
  });

  it("no earlier passing run means a full run", () => {
    const decided = verdict(facts({ earlier: null }));
    expect(decided.database).toBe("run");
    expect(decided.reason.toLowerCase()).toContain("no earlier run");
  });

  it("an earlier run whose database checks did not pass is never relied on", () => {
    for (const ended of ["cancelled", "failure", "skipped", null]) {
      expect(verdict(facts({ earlier: run(7, ended) })).database, String(ended)).toBe("run");
    }
  });

  it("a code file changed on the pull request's side means a full run, and the reason names it", () => {
    const decided = verdict(facts({ changed: ["README.md", "src/lib/transforms.ts"] }));
    expect(decided.database).toBe("run");
    expect(decided.reason).toContain("src/lib/transforms.ts");
    expect(decided.reason).toContain("abcdef1");
  });

  it("a code file renamed to markdown still counts as code", () => {
    expect(verdict(facts({ changed: ["src/old.ts", "src/old.md"] })).database).toBe("run");
  });

  it("a file listed more than once is named once", () => {
    const { reason } = verdict(facts({ changed: ["src/x.ts", "src/x.ts", "src/x.ts"] }));
    expect(reason.split("src/x.ts").length - 1).toBe(1);
  });

  it("anything that could not be read means a full run, and the reason says what", () => {
    const decided = verdict(facts({ problem: "the earlier commit could not be fetched" }));
    expect(decided.database).toBe("run");
    expect(decided.reason).toContain("the earlier commit could not be fetched");
  });
});

describe("what the workflow reads", () => {
  it("hands the workflow the decision as the step's output", () => {
    expect(workflowLines({ database: "skip", reason: "x" }).output).toBe("database=skip");
    expect(workflowLines({ database: "run", reason: "x" }).output).toBe("database=run");
  });

  it("shows the reason as a notice on the run's page", () => {
    const { notice } = workflowLines({ database: "skip", reason: "Only documents changed." });
    expect(notice.startsWith("::notice title=")).toBe(true);
    expect(notice.endsWith("::Only documents changed.")).toBe(true);
  });

  it("keeps the notice on one line, whatever the reason holds", () => {
    const { notice } = workflowLines({ database: "run", reason: "100% of\nsrc/a b.ts\r" });
    expect(notice).not.toMatch(/[\r\n]/);
    expect(notice).toContain("100%25 of%0Asrc/a b.ts%0D");
  });
});

describe("the record of what a run tested", () => {
  const TESTED = { base: "0123456789abcdef0123456789abcdef01234567", tree: "89abcdef0123456789abcdef0123456789abcdef" };
  const OTHER = { base: "fedcba9876543210fedcba9876543210fedcba98", tree: "76543210fedcba9876543210fedcba9876543210" };
  const log = (...lines: string[]) =>
    lines.map((line, i) => `2026-10-08T21:21:1${i}.1234567Z ${line}`).join("\n") + "\n";

  it("a run's record is read back from its log, base and fingerprint", () => {
    const text = log("##[group]Run node scripts/ci/documents-only.mjs", recordLine(TESTED), "##[notice]Something.");
    expect(recordedTest(text)).toEqual(TESTED);
  });

  it("the record on the log's first line is read, after the mark GitHub's logs open with", () => {
    expect(recordedTest("\uFEFF" + log(recordLine(TESTED)))).toEqual(TESTED);
  });

  it("a log without a record has none", () => {
    expect(recordedTest(log("##[notice]This run is for the pull request being opened."))).toBeNull();
    expect(recordedTest("")).toBeNull();
  });

  it("a log with two records has none", () => {
    expect(recordedTest(log(recordLine(TESTED), recordLine(OTHER)))).toBeNull();
  });

  it("a record's words inside another line are not a record", () => {
    expect(recordedTest(log(`##[notice]Something other than documents changed: ${recordLine(TESTED)}`))).toBeNull();
  });

  it("only whole commit and tree names are a record", () => {
    expect(recordedTest(log(recordLine({ ...TESTED, base: TESTED.base.slice(0, 7) })))).toBeNull();
    expect(recordedTest(log(recordLine({ ...TESTED, tree: TESTED.tree.slice(0, 7) })))).toBeNull();
    expect(recordedTest(log(recordLine(TESTED) + " and more"))).toBeNull();
  });
});
