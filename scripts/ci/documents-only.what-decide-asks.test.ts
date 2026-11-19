// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  calls: [] as string[][],
  answer: (command: string, args: string[]): string => {
    throw new Error(`no call was expected: ${command} ${args.join(" ")}`);
  },
}));

vi.mock("node:child_process", () => ({
  execFileSync: (command: string, args: string[]) => {
    fake.calls.push([command, ...args]);
    return fake.answer(command, args);
  },
}));

import { decide } from "./documents-only.mjs";

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "compass-decide-"));
afterAll(() => fs.rmSync(folder, { recursive: true, force: true }));

function envFor(event: object, sha: string) {
  const eventPath = path.join(folder, `event-${fake.calls.length}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(eventPath, JSON.stringify(event));
  return { GITHUB_EVENT_PATH: eventPath, GITHUB_SHA: sha, GITHUB_REPOSITORY: "owner/repo", GITHUB_RUN_ID: "99" };
}

function pullRequest(action: string, baseRef: string) {
  return { action, pull_request: { number: 65, base: { ref: baseRef }, head: { ref: "ch-999-something" } } };
}

let clockMs = 0;
beforeEach(() => {
  fake.calls.length = 0;
  clockMs = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clockMs);
  vi.spyOn(Atomics, "wait").mockImplementation((_array, _index, _value, ms) => {
    clockMs += Number(ms);
    return "timed-out";
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  fake.answer = (command, args) => {
    throw new Error(`no call was expected: ${command} ${args.join(" ")}`);
  };
});

const MERGE = "1111111111111111111111111111111111111111";
const BASE = "8957dc4aa0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5";
const HEAD = "2222222222222222222222222222222222222222";

describe("a pull request into another branch goes to the earlier-run rule before anything is asked", () => {
  it.each(["ch-999-elsewhere", "release"])("opened into %s: the earlier-run rule's sentence, and no call of git or gh", (baseRef) => {
    const decided = decide(envFor(pullRequest("opened", baseRef), MERGE), [MERGE, BASE, HEAD]);
    expect(decided).toEqual({
      database: "run",
      reason: "This run is for the pull request being opened, not a push to its branch. The database checks run in full.",
    });
    expect(fake.calls).toEqual([]);
  });

  it("one whose files differ only in markdown still gets the earlier-run rule's sentence, never a list of what it brings", () => {
    fake.answer = (command, args) => {
      if (command === "git" && args[0] === "diff") return "README.md\0docs/notes.md\0";
      throw new Error(`unexpected call ${command} ${args.join(" ")}`);
    };
    const decided = decide(envFor(pullRequest("reopened", "ch-999-elsewhere"), MERGE), [MERGE, BASE, HEAD]);
    expect(decided.reason).toBe(
      "This run is for the pull request being reopened, not a push to its branch. The database checks run in full.",
    );
    expect(decided.reason).not.toContain("brings");
    expect(fake.calls).toEqual([]);
  });
});

describe("main's run is read on the commit the pull request is merged with, not on the merge", () => {
  const RUNS = (sha: string) => `repos/owner/repo/actions/workflows/7/runs?event=push&branch=main&head_sha=${sha}&per_page=20`;
  const JOBS = (id: number) => `repos/owner/repo/actions/runs/${id}/jobs?filter=latest&per_page=100`;

  function mainRunFor(sha: string) {
    const id = sha === BASE ? 39282167919 : 39282170004;
    return {
      id, run_number: sha === BASE ? 273 : 274, html_url: `https://github.com/owner/repo/actions/runs/${id}`,
      head_sha: sha, event: "push", head_branch: "main", status: "completed",
    };
  }

  function answerAsGitHubAndGit() {
    fake.answer = (command, args) => {
      if (command === "git" && args.join(" ") === `diff -z --no-renames --name-only ${BASE} ${MERGE}`) {
        return "README.md\0docs/notes.md\0";
      }
      if (command === "gh" && args[0] === "api") {
        const endpoint = args[1];
        if (endpoint === "repos/owner/repo/actions/runs/99") return JSON.stringify({ id: 99, workflow_id: 7, run_number: 300 });
        for (const sha of [BASE, MERGE, HEAD]) {
          if (endpoint === RUNS(sha)) return JSON.stringify({ workflow_runs: [mainRunFor(sha)] });
          const run = mainRunFor(sha);
          if (endpoint === JOBS(run.id)) {
            const database = sha === BASE ? "success" : "failure";
            return JSON.stringify({ jobs: [{ name: "checks", conclusion: "success" }, { name: "database checks (practice copy)", conclusion: database }] });
          }
        }
      }
      throw new Error(`unexpected call ${command} ${args.join(" ")}`);
    };
  }

  it("skips on main's passed check on the merge's first parent, and the notice names that commit and run", () => {
    answerAsGitHubAndGit();
    const decided = decide(envFor(pullRequest("opened", "main"), MERGE), [MERGE, BASE, HEAD]);
    expect(decided).toEqual({
      database: "skip",
      reason: "This pull request brings only documents: its files differ from main's 8957dc4 only in markdown. "
        + "On main, the database checks on 8957dc4 passed in run #273 (https://github.com/owner/repo/actions/runs/39282167919). "
        + "The database checks are skipped.",
    });
  });

  it("asks GitHub for main's runs on that commit alone, never on the merge the run tests", () => {
    answerAsGitHubAndGit();
    decide(envFor(pullRequest("synchronize", "main"), MERGE), [MERGE, BASE, HEAD]);
    const endpoints = fake.calls.filter(([command]) => command === "gh").map((call) => call[2]);
    expect(endpoints).toContain(RUNS(BASE));
    expect(endpoints.filter((e) => e.includes("head_sha="))).toEqual([RUNS(BASE)]);
  });
});
