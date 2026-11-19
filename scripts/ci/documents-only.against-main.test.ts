// @vitest-environment node

import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CALL_LIMIT_MS,
  MAIN_READ_EVERY_MS,
  MAIN_READ_RETRIES,
  MAIN_WAIT_MS,
  againstMainVerdict,
  beyondDocuments,
  mainRunOn,
  mainState,
  ruleFor,
  runJobs,
  runSummary,
  waitForMain,
} from "./documents-only.mjs";

type MainRun = { id: number; number: number; url: string; completed: boolean; databaseConclusion: string | null };

function mainRun(databaseConclusion: string | null, completed = databaseConclusion !== null): MainRun {
  return { id: 39282167919, number: 273, url: "https://github.com/owner/repo/actions/runs/39282167919", completed, databaseConclusion };
}

const MAIN_SHA = "8957dc4aa0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5";

function clock(readTakesMs = 0) {
  let t = 1_000_000;
  const slept: number[] = [];
  return {
    now: () => t,
    sleep: (ms: number) => {
      slept.push(ms);
      t += ms;
    },
    reading: () => {
      t += readTakesMs;
    },
    slept,
    started: t,
  };
}

function reader(runs: (MainRun | null)[], c = clock()) {
  const at: number[] = [];
  return {
    at,
    read: () => {
      at.push(c.now());
      c.reading();
      return runs[Math.min(at.length - 1, runs.length - 1)];
    },
  };
}

describe("which rule decides a pull request", () => {
  it("a pull request into main that brings only markdown is decided against main", () => {
    expect(ruleFor("main", ["README.md", "docs/notes/plan.md", "notes/OLD.MD"])).toBe("against main");
  });

  it("a pull request into main that brings nothing at all is decided against main", () => {
    expect(ruleFor("main", [])).toBe("against main");
  });

  it("a pull request into main that brings any file besides markdown is left to the earlier-run rule", () => {
    expect(ruleFor("main", ["README.md", "src/lib/transforms.ts"])).toBe("earlier run");
    expect(ruleFor("main", ["README.md.bak"])).toBe("earlier run");
    expect(ruleFor("main", ["src/old.ts", "src/old.md"])).toBe("earlier run");
  });

  it("a pull request into another branch is left to the earlier-run rule, whatever it brings", () => {
    expect(ruleFor("ch-900-other", ["README.md"])).toBe("earlier run");
    expect(ruleFor("", ["README.md"])).toBe("earlier run");
    expect(ruleFor("Main", ["README.md"])).toBe("earlier run");
  });

  it("what it brings, when it could not be read, never sends it against main", () => {
    expect(ruleFor("main", null)).toBe("earlier run");
  });
});

describe("where main's check stands", () => {
  it("passed only when its database job ended in success", () => {
    expect(mainState(mainRun("success"))).toBe("passed");
  });

  it("failed when its database job failed", () => {
    expect(mainState(mainRun("failure"))).toBe("failed");
  });

  it("ended when its database job ended any other way, or the run ended without one", () => {
    for (const ended of ["cancelled", "skipped", "timed_out", "neutral"]) {
      expect(mainState(mainRun(ended)), ended).toBe("ended");
    }
    expect(mainState(mainRun(null, true))).toBe("ended");
  });

  it("going while its run has not ended and its database job has no end", () => {
    expect(mainState(mainRun(null, false))).toBe("going");
  });

  it("missing when no run of main on that commit was found", () => {
    expect(mainState(null)).toBe("missing");
  });
});

describe("waiting for main's check", () => {
  it("does not wait when main's check has already passed", () => {
    const c = clock();
    const r = reader([mainRun("success")], c);
    const outcome = waitForMain({ read: r.read, now: c.now, sleep: c.sleep });
    expect(outcome.state).toBe("passed");
    expect(outcome.waited).toBe(false);
    expect(outcome.run?.number).toBe(273);
    expect(r.at).toHaveLength(1);
    expect(c.slept).toEqual([]);
  });

  it("does not wait when main's check has already failed", () => {
    const c = clock();
    const r = reader([mainRun("failure")], c);
    const outcome = waitForMain({ read: r.read, now: c.now, sleep: c.sleep });
    expect(outcome.state).toBe("failed");
    expect(r.at).toHaveLength(1);
  });

  it("reads again every 30 seconds until the check ends, and says how long it waited", () => {
    const c = clock();
    const r = reader([mainRun(null, false), mainRun(null, false), mainRun("success")], c);
    const outcome = waitForMain({ read: r.read, now: c.now, sleep: c.sleep });
    expect(MAIN_READ_EVERY_MS).toBe(30_000);
    expect(outcome.state).toBe("passed");
    expect(outcome.waited).toBe(true);
    expect(outcome.waitedMs).toBe(60_000);
    expect(r.at.map((t) => t - c.started)).toEqual([0, 30_000, 60_000]);
  });

  it("waits for a run that has not appeared yet", () => {
    const c = clock();
    const r = reader([null, null, mainRun(null, false), mainRun("success")], c);
    const outcome = waitForMain({ read: r.read, now: c.now, sleep: c.sleep });
    expect(outcome.state).toBe("passed");
    expect(r.at).toHaveLength(4);
  });

  it("stops waiting as soon as the check fails", () => {
    const c = clock();
    const r = reader([mainRun(null, false), mainRun("failure")], c);
    const outcome = waitForMain({ read: r.read, now: c.now, sleep: c.sleep });
    expect(outcome.state).toBe("failed");
    expect(r.at).toHaveLength(2);
  });

  it("gives up 15 minutes after the wait began, reading one last time at the limit", () => {
    const c = clock();
    const r = reader([mainRun(null, false)], c);
    const outcome = waitForMain({ read: r.read, now: c.now, sleep: c.sleep });
    expect(MAIN_WAIT_MS).toBe(15 * 60_000);
    expect(outcome.state).toBe("going");
    expect(outcome.waitedMs).toBe(MAIN_WAIT_MS);
    expect(r.at[r.at.length - 1] - c.started).toBe(MAIN_WAIT_MS);
    expect(r.at.every((t) => t - c.started <= MAIN_WAIT_MS)).toBe(true);
    expect(c.slept.reduce((a, b) => a + b, 0)).toBe(MAIN_WAIT_MS);
  });

  it("gives up on a run that never appears", () => {
    const c = clock();
    const r = reader([null], c);
    const outcome = waitForMain({ read: r.read, now: c.now, sleep: c.sleep });
    expect(outcome.state).toBe("missing");
    expect(outcome.run).toBeNull();
    expect(outcome.waitedMs).toBe(MAIN_WAIT_MS);
  });

  it("never sleeps past the limit when each read takes time", () => {
    const c = clock(40_000);
    const r = reader([mainRun(null, false)], c);
    const outcome = waitForMain({ read: r.read, now: c.now, sleep: c.sleep });
    expect(outcome.state).toBe("going");
    expect(r.at.every((t) => t - c.started <= MAIN_WAIT_MS)).toBe(true);
    expect(c.now() - c.started).toBeLessThanOrEqual(MAIN_WAIT_MS + 40_000);
  });

  it("keeps to a limit and a pace it is handed", () => {
    const c = clock();
    const r = reader([mainRun(null, false)], c);
    const outcome = waitForMain({ read: r.read, now: c.now, sleep: c.sleep, limitMs: 100, everyMs: 30 });
    expect(outcome.state).toBe("going");
    expect(r.at.map((t) => t - c.started)).toEqual([0, 30, 60, 90, 100]);
  });

});

describe("a read of main's run that fails while waiting", () => {
  function flaky(answers: (MainRun | null | Error)[], c: ReturnType<typeof clock>) {
    const at: number[] = [];
    return {
      at,
      read: () => {
        at.push(c.now());
        const answer = answers[Math.min(at.length - 1, answers.length - 1)];
        if (answer instanceof Error) throw answer;
        return answer;
      },
    };
  }
  const hiccup = () => new Error("gh api failed (HTTP 502)");

  it("is tried again 30 seconds later, and the wait goes on", () => {
    const c = clock();
    const r = flaky([mainRun(null, false), hiccup(), mainRun("success")], c);
    const outcome = waitForMain({ read: r.read, now: c.now, sleep: c.sleep });
    expect(outcome.state).toBe("passed");
    expect(outcome.waited).toBe(true);
    expect(r.at.map((t) => t - c.started)).toEqual([0, 30_000, 60_000]);
  });

  it("a failed first read is tried again too, and a skip after it says it waited", () => {
    const c = clock();
    const r = flaky([hiccup(), mainRun("success")], c);
    const outcome = waitForMain({ read: r.read, now: c.now, sleep: c.sleep });
    expect(outcome.state).toBe("passed");
    expect(outcome.waited).toBe(true);
    expect(outcome.waitedMs).toBe(30_000);
  });

  it("is tried at most twice more: a third failure in a row runs the checks in full", () => {
    const c = clock();
    const r = flaky([mainRun(null, false), hiccup(), hiccup(), hiccup(), mainRun("success")], c);
    expect(() => waitForMain({ read: r.read, now: c.now, sleep: c.sleep })).toThrow(/HTTP 502.*3 reads in a row/);
    expect(r.at.map((t) => t - c.started)).toEqual([0, 30_000, 60_000, 90_000]);
  });

  it("failures that are not in a row do not add up", () => {
    const c = clock();
    const going = mainRun(null, false);
    const r = flaky([hiccup(), hiccup(), going, hiccup(), hiccup(), going, hiccup(), mainRun("success")], c);
    const outcome = waitForMain({ read: r.read, now: c.now, sleep: c.sleep });
    expect(outcome.state).toBe("passed");
    expect(r.at).toHaveLength(8);
  });

  it("a read that fails at the limit is still tried again before the wait gives up", () => {
    const c = clock();
    const going = mainRun(null, false);
    const reads = MAIN_WAIT_MS / MAIN_READ_EVERY_MS;
    const r = flaky([...Array(reads).fill(going), hiccup(), mainRun("success")], c);
    const outcome = waitForMain({ read: r.read, now: c.now, sleep: c.sleep });
    expect(outcome.state).toBe("passed");
    expect(r.at[reads] - c.started).toBe(MAIN_WAIT_MS);
    expect(r.at[reads + 1] - c.started).toBe(MAIN_WAIT_MS + MAIN_READ_EVERY_MS);
  });

  it("a read that keeps failing at the limit runs the checks in full", () => {
    const c = clock();
    const going = mainRun(null, false);
    const reads = MAIN_WAIT_MS / MAIN_READ_EVERY_MS;
    const r = flaky([...Array(reads).fill(going), hiccup()], c);
    expect(() => waitForMain({ read: r.read, now: c.now, sleep: c.sleep })).toThrow(/HTTP 502/);
    expect(r.at).toHaveLength(reads + 3);
  });
});

describe("the decision against main", () => {
  const outcome = (state: string, run: MainRun | null, waitedMs = 0) => ({
    mainSha: MAIN_SHA,
    run,
    state,
    waitedMs,
    waited: waitedMs > 0,
  });

  it("skips when main's check on the commit passed, naming that commit and that run", () => {
    const decided = againstMainVerdict(outcome("passed", mainRun("success")) as never);
    expect(decided.database).toBe("skip");
    expect(decided.reason).toContain("8957dc4");
    expect(decided.reason).not.toContain(MAIN_SHA);
    expect(decided.reason).toContain("#273");
    expect(decided.reason).toContain(mainRun("success").url);
    expect(decided.reason.toLowerCase()).toContain("only documents");
    expect(decided.reason.toLowerCase()).not.toContain("wait");
    expect(decided.reason).toMatch(/skipped\.$/);
  });

  it("a skip after waiting says it waited for that run, and how long", () => {
    const decided = againstMainVerdict(outcome("passed", mainRun("success"), 4 * 60_000) as never);
    expect(decided.database).toBe("skip");
    expect(decided.reason.toLowerCase()).toContain("waited");
    expect(decided.reason).toContain("4 minutes");
    expect(decided.reason).toContain("#273");
  });

  it("a short wait is told in seconds", () => {
    const decided = againstMainVerdict(outcome("passed", mainRun("success"), 30_000) as never);
    expect(decided.reason).toContain("30 seconds");
  });

  it("a failed check on main means a full run, and the notice says it failed", () => {
    const decided = againstMainVerdict(outcome("failed", mainRun("failure")) as never);
    expect(decided.database).toBe("run");
    expect(decided.reason).toContain("failed");
    expect(decided.reason).toContain("8957dc4");
    expect(decided.reason).toContain("#273");
    expect(decided.reason).toMatch(/run in full\.$/);
  });

  it("a check on main that ended any other way means a full run, and the notice says how", () => {
    const decided = againstMainVerdict(outcome("ended", mainRun("cancelled")) as never);
    expect(decided.database).toBe("run");
    expect(decided.reason).toContain("cancelled");
    expect(decided.reason).toContain("#273");
    const without = againstMainVerdict(outcome("ended", mainRun(null, true)) as never);
    expect(without.database).toBe("run");
    expect(without.reason).toContain("#273");
  });

  it("a check on main still going after 15 minutes means a full run, and the notice says so", () => {
    const decided = againstMainVerdict(outcome("going", mainRun(null, false), MAIN_WAIT_MS) as never);
    expect(decided.database).toBe("run");
    expect(decided.reason).toContain("still going");
    expect(decided.reason).toContain("15 minutes");
    expect(decided.reason).toContain("#273");
  });

  it("no run of main found after 15 minutes means a full run, and the notice says so", () => {
    const decided = againstMainVerdict(outcome("missing", null, MAIN_WAIT_MS) as never);
    expect(decided.database).toBe("run");
    expect(decided.reason.toLowerCase()).toContain("no run");
    expect(decided.reason).toContain("8957dc4");
    expect(decided.reason).toContain("15 minutes");
  });

  it("only a passed check on main ever skips", () => {
    const states: [string, MainRun | null][] = [
      ["failed", mainRun("failure")],
      ["ended", mainRun("skipped")],
      ["going", mainRun(null, false)],
      ["missing", null],
    ];
    for (const [state, run] of states) {
      expect(againstMainVerdict(outcome(state, run, MAIN_WAIT_MS) as never).database, state).toBe("run");
    }
    expect(againstMainVerdict(outcome("passed", mainRun("failure")) as never).database).toBe("run");
    expect(againstMainVerdict(outcome("passed", null) as never).database).toBe("run");
  });
});

describe("a pull request into main that brings more than documents", () => {
  const ch041 = { database: "run" as const, reason: "This run is for the pull request being opened, not a push to its branch. The database checks run in full." };

  it("the notice opens with a file it brings that is not markdown, then the earlier-run rule's reason", () => {
    const decided = beyondDocuments(ch041, ["README.md", "scripts/ci/documents-only.mjs"]);
    expect(decided.database).toBe("run");
    expect(decided.reason.startsWith("This pull request brings more than documents: scripts/ci/documents-only.mjs.")).toBe(true);
    expect(decided.reason.endsWith(ch041.reason)).toBe(true);
    expect(decided.reason).not.toContain("README.md");
  });

  it("names three files at most, and counts the rest", () => {
    const decided = beyondDocuments(ch041, ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.md"]);
    expect(decided.reason).toContain("a.ts, b.ts, c.ts and 2 more");
  });

  it("leaves the earlier-run rule's decision as it was, a skip included", () => {
    const skip = { database: "skip" as const, reason: "Only documents changed since abcdef1. The database checks are skipped." };
    const decided = beyondDocuments(skip, ["src/App.tsx"]);
    expect(decided.database).toBe("skip");
    expect(decided.reason.endsWith(skip.reason)).toBe(true);
  });
});

describe("reading main's run makes one read of GitHub while that run is going", () => {
  const SHA = MAIN_SHA;
  const RUNS = `repos/owner/repo/actions/workflows/7/runs?event=push&branch=main&head_sha=${SHA}&per_page=20`;
  const JOBS = "repos/owner/repo/actions/runs/39282167919/jobs?filter=latest&per_page=100";

  function github(status: string | null, database: string | null = null) {
    const asked: string[] = [];
    const run = {
      id: 39282167919, run_number: 273, html_url: "https://github.com/owner/repo/actions/runs/39282167919",
      head_sha: SHA, event: "push", head_branch: "main", status,
    };
    const get = (endpoint: string) => {
      asked.push(endpoint);
      if (endpoint === RUNS) return { workflow_runs: status === null ? [] : [run] };
      if (endpoint === JOBS) {
        return { jobs: [{ name: "checks", conclusion: "success" }, { name: "database checks (practice copy)", conclusion: database }] };
      }
      throw new Error(`unexpected read ${endpoint}`);
    };
    return { get, asked };
  }

  it("a run still going is one read, the runs alone, and its check counts as going", () => {
    const api = github("in_progress", "success");
    const run = mainRunOn("owner/repo", 7, SHA, api.get);
    expect(api.asked).toEqual([RUNS]);
    expect(run).toMatchObject({ number: 273, completed: false, databaseConclusion: null });
    expect(mainState(run)).toBe("going");
  });

  it("a run that has ended is read with its jobs, and a passed check counts as passed", () => {
    const api = github("completed", "success");
    const run = mainRunOn("owner/repo", 7, SHA, api.get);
    expect(api.asked).toEqual([RUNS, JOBS]);
    expect(run).toMatchObject({ number: 273, completed: true, databaseConclusion: "success" });
    expect(mainState(run)).toBe("passed");
  });

  it("a run that has ended with a failed check counts as failed", () => {
    const api = github("completed", "failure");
    expect(mainState(mainRunOn("owner/repo", 7, SHA, api.get))).toBe("failed");
  });

  it("no run registered yet is one read, and counts as missing", () => {
    const api = github(null);
    const run = mainRunOn("owner/repo", 7, SHA, api.get);
    expect(api.asked).toEqual([RUNS]);
    expect(run).toBeNull();
    expect(mainState(run)).toBe("missing");
  });

  it("a 15-minute wait on a run that never ends reads GitHub once per read of the wait", () => {
    const api = github("in_progress");
    const time = clock();
    const outcome = waitForMain({ read: () => mainRunOn("owner/repo", 7, SHA, api.get), now: time.now, sleep: time.sleep });
    expect(outcome.state).toBe("going");
    expect(api.asked.length).toBe(MAIN_WAIT_MS / MAIN_READ_EVERY_MS + 1);
    expect(api.asked.every((endpoint) => endpoint === RUNS)).toBe(true);
  });
});

describe("only main's own push run on the commit counts, whatever else GitHub lists", () => {
  const SHA = MAIN_SHA;
  const OTHER_SHA = "0123456789abcdef0123456789abcdef01234567";
  const RUNS = `repos/owner/repo/actions/workflows/7/runs?event=push&branch=main&head_sha=${SHA}&per_page=20`;

  type ListedRun = { id: number; run_number: number; html_url: string; head_sha: string; event: string; head_branch: string; status: string };

  const mainsOwn: ListedRun = {
    id: 39282167919, run_number: 273, html_url: "https://github.com/owner/repo/actions/runs/39282167919",
    head_sha: SHA, event: "push", head_branch: "main", status: "in_progress",
  };

  const impostors: [string, ListedRun][] = [
    ["a pull request's run whose head is that commit", {
      id: 39282170001, run_number: 280, html_url: "https://github.com/owner/repo/actions/runs/39282170001",
      head_sha: SHA, event: "pull_request", head_branch: "main", status: "completed",
    }],
    ["main's push run on another commit", {
      id: 39282170002, run_number: 281, html_url: "https://github.com/owner/repo/actions/runs/39282170002",
      head_sha: OTHER_SHA, event: "push", head_branch: "main", status: "completed",
    }],
    ["a push run on that commit to another branch", {
      id: 39282170003, run_number: 282, html_url: "https://github.com/owner/repo/actions/runs/39282170003",
      head_sha: SHA, event: "push", head_branch: "ch-999-elsewhere", status: "completed",
    }],
  ];

  function github(runs: ListedRun[]) {
    const get = (endpoint: string) => {
      if (endpoint === RUNS) return { workflow_runs: runs };
      const listed = runs.find((r) => endpoint === `repos/owner/repo/actions/runs/${r.id}/jobs?filter=latest&per_page=100`);
      if (listed) return { jobs: [{ name: "checks", conclusion: "success" }, { name: "database checks (practice copy)", conclusion: "success" }] };
      throw new Error(`unexpected read ${endpoint}`);
    };
    return { get };
  }

  it.each(impostors)("%s, listed beside main's own run, is passed over", (_name, impostor) => {
    const run = mainRunOn("owner/repo", 7, SHA, github([impostor, mainsOwn]).get);
    expect(run).toMatchObject({ id: mainsOwn.id, number: 273, completed: false, databaseConclusion: null });
    expect(mainState(run)).toBe("going");
  });

  it("with all of them listed, main's own run is the one read", () => {
    const run = mainRunOn("owner/repo", 7, SHA, github([...impostors.map(([, r]) => r), mainsOwn]).get);
    expect(run).toMatchObject({ id: mainsOwn.id, number: 273, completed: false });
    expect(mainState(run)).toBe("going");
  });

  it("with only those listed, no run of main's on that commit is found", () => {
    const run = mainRunOn("owner/repo", 7, SHA, github(impostors.map(([, r]) => r)).get);
    expect(run).toBeNull();
    expect(mainState(run)).toBe("missing");
  });
});

describe("a run's jobs are read, and summed up, in one place for both rules", () => {
  const JOBS = "repos/owner/repo/actions/runs/39282167919/jobs?filter=latest&per_page=100";
  const jobs = [{ name: "checks", conclusion: "success" }, { name: "database checks (practice copy)", conclusion: "failure" }];
  const run = { id: 39282167919, run_number: 273, html_url: "https://github.com/owner/repo/actions/runs/39282167919" };

  it("a run's jobs are its latest attempt's, in one read", () => {
    const asked: string[] = [];
    const got = runJobs("owner/repo", 39282167919, (endpoint: string) => (asked.push(endpoint), { jobs }));
    expect(asked).toEqual([JOBS]);
    expect(got).toEqual(jobs);
  });

  it("a run is named by its id, number and page, with how its database job ended", () => {
    expect(runSummary(run, jobs)).toEqual({ id: run.id, number: 273, url: run.html_url, databaseConclusion: "failure" });
    expect(runSummary(run, []).databaseConclusion).toBeNull();
  });
});

describe("the \"what changed\" job's limit outlasts the against-main rule's slowest decision", () => {
  function jobLimitMs() {
    const workflow = fs.readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
    const job = /\n {2}decide:\n([\s\S]*?)(?=\n {2}[A-Za-z_-]+:\n)/.exec(workflow);
    const minutes = job && /\n {4}timeout-minutes: (\d+)\n/.exec(job[1]);
    if (!minutes) throw new Error("the decide job's timeout-minutes was not found in ci.yml");
    return Number(minutes[1]) * 60_000;
  }

  it("a pull request into main that brings only documents, every call slow, the wait full, and the reads at its limit failing: the script still answers in time", () => {
    const beforeWait = 5 * CALL_LIMIT_MS;
    const c = clock();
    const read = () => {
      if (c.now() - c.started < MAIN_WAIT_MS) return mainRun(null);
      c.sleep(2 * CALL_LIMIT_MS);
      throw new Error("gh api failed (502)");
    };
    expect(() => waitForMain({ read, now: c.now, sleep: c.sleep })).toThrow(`on ${MAIN_READ_RETRIES + 1} reads in a row`);
    const waitMs = c.now() - c.started;
    expect(waitMs).toBeGreaterThan(MAIN_WAIT_MS);
    const setUp = 2 * 60_000;
    expect(jobLimitMs()).toBeGreaterThanOrEqual(setUp + beforeWait + waitMs);
  });
});
