// @vitest-environment node

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExecFileSyncOptions } from "node:child_process";

type Call = { command: string; args: string[]; options: ExecFileSyncOptions | undefined };
type Real = (command: string, args: string[], options?: ExecFileSyncOptions) => string | Buffer;

const seen = vi.hoisted(() => ({
  calls: [] as Call[],
  real: null as Real | null,
  answer: (command: string, args: string[], _options: ExecFileSyncOptions | undefined): string | Buffer => {
    throw new Error(`no call was expected: ${command} ${args.join(" ")}`);
  },
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  seen.real = actual.execFileSync as Real;
  return {
    ...actual,
    execFileSync: (command: string, args: string[], options?: ExecFileSyncOptions) => {
      seen.calls.push({ command, args, options });
      return seen.answer(command, args, options);
    },
  };
});

import { CALL_LIMIT_MS, DATABASE_JOB, DECIDE_JOB, main, recordLine } from "./documents-only.mjs";

const MERGE = "1111111111111111111111111111111111111111";
const BASE = "8957dc4aa0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5";
const HEAD = "2222222222222222222222222222222222222222";
const TREE = "3333333333333333333333333333333333333333";
const OLD_HEAD = "4444444444444444444444444444444444444444";
const OLD_BASE = "5555555555555555555555555555555555555555";
const OLD_TREE = "6666666666666666666666666666666666666666";

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "compass-call-limit-"));
afterAll(() => fs.rmSync(folder, { recursive: true, force: true }));
let printed: string[] = [];

beforeEach(() => {
  seen.calls.length = 0;
  printed = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => { printed.push(String(line)); });
});
afterEach(() => {
  vi.restoreAllMocks();
  seen.answer = (command, args) => {
    throw new Error(`no call was expected: ${command} ${args.join(" ")}`);
  };
});

function envFor(action: string) {
  const eventPath = path.join(folder, `event-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(eventPath, JSON.stringify({
    action, pull_request: { number: 65, base: { ref: "main" }, head: { ref: "ch-999-something" } },
  }));
  return { GITHUB_EVENT_PATH: eventPath, GITHUB_SHA: MERGE, GITHUB_REPOSITORY: "owner/repo", GITHUB_RUN_ID: "99" };
}

function answerFrom(replies: Record<string, unknown>) {
  seen.answer = (command, args) => {
    const line = [command, ...args].join(" ");
    if (!(line in replies)) throw new Error(`unexpected call ${line}`);
    const reply = replies[line];
    return typeof reply === "string" ? reply : JSON.stringify(reply);
  };
}

function firstCalls(brought: string) {
  return {
    [`git rev-list --parents -n 1 ${MERGE}`]: `${MERGE} ${BASE} ${HEAD}\n`,
    [`git rev-parse ${MERGE}^{tree}`]: `${TREE}\n`,
    [`git diff -z --no-renames --name-only ${BASE} ${MERGE}`]: brought,
    "gh api repos/owner/repo/actions/runs/99": { id: 99, workflow_id: 7, run_number: 300 },
  };
}

describe("every call of git and gh the decision makes is handed the 90-second limit", () => {
  it("the limit is 90 seconds, as spec §19 says", () => {
    expect(CALL_LIMIT_MS).toBe(90_000);
  });

  it("under the against-main rule: the record, what the pull request brings, main's run and its jobs", () => {
    answerFrom({
      ...firstCalls("README.md\0docs/notes.md\0"),
      [`gh api repos/owner/repo/actions/workflows/7/runs?event=push&branch=main&head_sha=${BASE}&per_page=20`]: {
        workflow_runs: [{
          id: 273, run_number: 273, html_url: "https://github.com/owner/repo/actions/runs/273",
          head_sha: BASE, event: "push", head_branch: "main", status: "completed",
        }],
      },
      "gh api repos/owner/repo/actions/runs/273/jobs?filter=latest&per_page=100": {
        jobs: [{ id: 1, name: "checks", conclusion: "success" }, { id: 2, name: DATABASE_JOB, conclusion: "success" }],
      },
    });
    main(envFor("opened"));
    expect(printed).toContain("database=skip");
    expect(seen.calls.map((c) => `${c.command} ${c.args[0]}`)).toEqual([
      "git rev-list", "git rev-parse", "git diff", "gh api", "gh api", "gh api",
    ]);
    for (const call of seen.calls) expect(call.options?.timeout, `${call.command} ${call.args.join(" ")}`).toBe(CALL_LIMIT_MS);
  });

  it("under the earlier-run rule: the earlier runs, their jobs, a job's log and the earlier merge rebuilt", () => {
    answerFrom({
      ...firstCalls("src/lib/transforms.ts\0"),
      "gh api repos/owner/repo/actions/workflows/7/runs?event=pull_request&per_page=50&branch=ch-999-something": {
        workflow_runs: [{
          id: 500, run_number: 299, html_url: "https://github.com/owner/repo/actions/runs/500",
          head_sha: OLD_HEAD, pull_requests: [{ number: 65 }],
        }],
      },
      "gh api repos/owner/repo/actions/runs/500/jobs?filter=latest&per_page=100": {
        jobs: [{ id: 5, name: DECIDE_JOB, conclusion: "success" }, { id: 6, name: DATABASE_JOB, conclusion: "success" }],
      },
      "gh api repos/owner/repo/actions/jobs/5/logs --allow-escape-sequences":
        `2026-10-19T00:00:00.0000000Z ${recordLine({ base: OLD_BASE, tree: OLD_TREE })}\n`,
      [`git cat-file -e ${OLD_HEAD}^{commit}`]: "",
      [`git cat-file -e ${OLD_BASE}^{commit}`]: "",
      [`git merge-tree --write-tree --no-messages ${OLD_BASE} ${OLD_HEAD}`]: `${OLD_TREE}\n`,
      [`git diff -z --no-renames --name-only ${OLD_TREE} ${MERGE}`]: "docs/notes.md\0",
    });
    main(envFor("synchronize"));
    expect(printed).toContain("database=skip");
    expect(seen.calls.map((c) => `${c.command} ${c.args[0]}`)).toEqual([
      "git rev-list", "git rev-parse", "git diff", "gh api", "gh api", "gh api", "gh api",
      "git cat-file", "git cat-file", "git merge-tree", "git diff",
    ]);
    for (const call of seen.calls) expect(call.options?.timeout, `${call.command} ${call.args.join(" ")}`).toBe(CALL_LIMIT_MS);
  });
});

describe("a call that runs past its limit is stopped there, and the database checks run in full", () => {
  it("a read of GitHub that hangs ends at its limit, and the notice names it", () => {
    const replies = firstCalls("README.md\0");
    seen.answer = (command, args, options) => {
      const line = [command, ...args].join(" ");
      if (command === "git" && line in replies) return String(replies[line as keyof typeof replies]);
      const limit = options?.timeout === undefined ? undefined : options.timeout / 300;
      return seen.real!(process.execPath, ["-e", "setTimeout(() => {}, 8000)"], { ...options, timeout: limit });
    };
    const started = Date.now();
    main(envFor("opened"));
    const tookMs = Date.now() - started;

    expect(tookMs).toBeLessThan(4000);
    expect(printed).toContain("database=run");
    const notice = printed.find((line) => line.startsWith("::notice"));
    expect(notice).toContain("Database checks run in full");
    expect(notice).toContain("gh api failed");
  }, 20_000);
});
