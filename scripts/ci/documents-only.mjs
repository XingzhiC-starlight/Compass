import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DATABASE_JOB = "database checks (practice copy)";

export const DECIDE_JOB = "what changed";

export function isDocument(filePath) {
  return /\.md$/i.test(filePath);
}

export function databaseConclusion(jobs) {
  const job = jobs.find((j) => j.name === DATABASE_JOB);
  return job?.conclusion ?? null;
}

export function reliedOnRun(runs, currentNumber) {
  const passed = runs.filter((r) => r.number < currentNumber && r.databaseConclusion === "success");
  passed.sort((a, b) => b.number - a.number);
  return passed[0] ?? null;
}

function some(listed) {
  const paths = [...new Set(listed)];
  const shown = paths.slice(0, 3).join(", ");
  return paths.length > 3 ? `${shown} and ${paths.length - 3} more` : shown;
}

export function verdict(facts) {
  const run = (reason) => ({ database: "run", reason: `${reason} The database checks run in full.` });
  if (facts.problem) return run(`What the decision needs could not be read: ${facts.problem}.`);
  if (facts.action !== "synchronize") {
    return run(`This run is for the pull request being ${facts.action || "touched without a push"}, not a push to its branch.`);
  }
  const earlier = facts.earlier;
  if (!earlier || earlier.databaseConclusion !== "success") {
    return run("No earlier run of this pull request passed its database checks.");
  }
  const since = `${earlier.headSha.slice(0, 7)}, whose database checks passed in run #${earlier.number} (${earlier.url})`;
  const code = facts.changed.filter((p) => !isDocument(p));
  if (code.length > 0) return run(`Something other than documents changed since ${since}: ${some(code)}.`);
  return {
    database: "skip",
    reason: `Only documents changed since ${since}. The database checks are skipped.`,
  };
}

export function workflowLines(decided) {
  // GitHub's workflow commands end at the line's end; these three are how a message says
  // "%", a carriage return and a new line without ending it.
  const message = decided.reason.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  const title = decided.database === "skip" ? "Database checks skipped" : "Database checks run in full";
  return { output: `database=${decided.database}`, notice: `::notice title=${title}::${message}` };
}

const RECORD = "compass-ci tested";

export function recordLine(tested) {
  return `${RECORD} base ${tested.base} tree ${tested.tree}`;
}

/** Each log line starts with GitHub's timestamp and a space. */
export function recordedTest(log) {
  // GitHub's logs open with a byte-order mark, which is not part of the first line.
  const line = new RegExp(`^\\S+ ${RECORD} base ([0-9a-f]{40}) tree ([0-9a-f]{40})\\r?$`);
  const found = log.replace(/^\uFEFF/, "").split("\n").map((l) => line.exec(l)).filter(Boolean);
  return found.length === 1 ? { base: found[0][1], tree: found[0][2] } : null;
}

export const MAIN_WAIT_MS = 15 * 60_000;

export const MAIN_READ_EVERY_MS = 30_000;

export function ruleFor(baseRef, brought) {
  return baseRef === "main" && Array.isArray(brought) && brought.every(isDocument) ? "against main" : "earlier run";
}

export function mainState(run) {
  if (!run) return "missing";
  if (run.databaseConclusion === "success") return "passed";
  if (run.databaseConclusion === "failure") return "failed";
  if (run.databaseConclusion !== null || run.completed) return "ended";
  return "going";
}

export const MAIN_READ_RETRIES = 2;

export function waitForMain(how) {
  const { read, now, sleep, limitMs = MAIN_WAIT_MS, everyMs = MAIN_READ_EVERY_MS } = how;
  const start = now();
  let reads = 0;
  let failedInARow = 0;
  for (;;) {
    let run;
    reads += 1;
    try {
      run = read();
      failedInARow = 0;
    } catch (error) {
      failedInARow += 1;
      if (failedInARow > MAIN_READ_RETRIES) throw new Error(`${error.message}, on ${failedInARow} reads in a row`, { cause: error });
      sleep(everyMs);
      continue;
    }
    const state = mainState(run);
    const waitedMs = now() - start;
    if ((state !== "going" && state !== "missing") || waitedMs >= limitMs) {
      return { run, state, waitedMs, waited: reads > 1 };
    }
    sleep(Math.min(everyMs, limitMs - waitedMs));
  }
}

export function againstMainVerdict(facts) {
  const { run, mainSha, waitedMs, waited, limitMs = MAIN_WAIT_MS } = facts;
  const commit = mainSha.slice(0, 7);
  const brings = `This pull request brings only documents: its files differ from main's ${commit} only in markdown.`;
  const full = (reason) => ({ database: "run", reason: `${brings} ${reason} The database checks run in full.` });
  if (!run) return full(`No run of main's checks on ${commit} was found after ${howLong(limitMs)} of waiting.`);
  const named = `run #${run.number} (${run.url})`;
  const state = mainState(run);
  if (state === "passed") {
    const after = waited ? `, which this run waited ${howLong(waitedMs)} for` : "";
    return {
      database: "skip",
      reason: `${brings} On main, the database checks on ${commit} passed in ${named}${after}. The database checks are skipped.`,
    };
  }
  if (state === "failed") return full(`On main, the database checks on ${commit} failed in ${named}.`);
  if (state === "going") {
    return full(`On main, the database checks on ${commit} were still going in ${named} after ${howLong(limitMs)} of waiting.`);
  }
  const how = run.databaseConclusion ? `ended as ${run.databaseConclusion}` : "ended without a database check";
  return full(`On main, ${named} on ${commit} ${how}.`);
}

function howLong(ms) {
  if (ms < 60_000) {
    const seconds = Math.round(ms / 1000);
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }
  const minutes = Math.round(ms / 60_000);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export function beyondDocuments(decided, brought) {
  const code = brought.filter((p) => !isDocument(p));
  return { ...decided, reason: `This pull request brings more than documents: ${some(code)}. ${decided.reason}` };
}

export const CALL_LIMIT_MS = 90_000;

function read(command, args, cwd = process.cwd()) {
  try {
    return execFileSync(command, args, {
      cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, timeout: CALL_LIMIT_MS,
    });
  } catch (error) {
    const said = String(error.stderr || error.message).trim().split("\n")[0];
    throw new Error(`${command} ${args[0]} failed (${said})`, { cause: error });
  }
}

function names(output) {
  return output.split("\0").filter(Boolean);
}

function jobLog(repo, jobId) {
  const endpoint = `repos/${repo}/actions/jobs/${jobId}/logs`;
  try {
    return read("gh", ["api", endpoint, "--allow-escape-sequences"]);
  } catch (error) {
    if (!/unknown flag: --allow-escape-sequences/.test(error.message)) throw error;
    return read("gh", ["api", endpoint]);
  }
}

export function gatherFacts(env) {
  const event = readEvent(env);
  const facts = { action: String(event.action ?? ""), earlier: null, changed: [], problem: null };
  if (facts.action !== "synchronize") return facts;

  const repo = String(env.GITHUB_REPOSITORY);
  const runId = Number(env.GITHUB_RUN_ID);
  const tested = String(env.GITHUB_SHA);
  const pr = event.pull_request;

  const current = JSON.parse(read("gh", ["api", `repos/${repo}/actions/runs/${runId}`]));
  const listed = JSON.parse(read("gh", ["api",
    `repos/${repo}/actions/workflows/${current.workflow_id}/runs?event=pull_request&per_page=50&branch=${encodeURIComponent(pr.head.ref)}`]));
  const candidates = listed.workflow_runs
    .filter((r) => r.id !== runId && (r.pull_requests ?? []).some((p) => p.number === pr.number))
    .sort((a, b) => b.run_number - a.run_number);
  const now = current.run_number;
  const runs = [];
  const decideJobs = new Map();
  for (const r of candidates) {
    const jobs = runJobs(repo, r.id);
    runs.push({ ...runSummary(r, jobs), headSha: r.head_sha });
    decideJobs.set(r.id, jobs.find((j) => j.name === DECIDE_JOB)?.id);
    if (reliedOnRun(runs, now)) break;
  }
  facts.earlier = reliedOnRun(runs, now);
  if (!facts.earlier) return facts;

  const jobId = decideJobs.get(facts.earlier.id);
  const recorded = jobId ? recordedTest(jobLog(repo, jobId)) : null;
  if (!recorded) throw new Error(`run #${facts.earlier.number} holds no record of what it tested`);
  facts.changed = changedSince({ head: facts.earlier.headSha, ...recorded }, tested);
  return facts;
}

export function changedSince(earlier, tested, cwd = process.cwd()) {
  const git = (...args) => read("git", args, cwd);

  for (const commit of [earlier.head, earlier.base]) {
    try { git("cat-file", "-e", `${commit}^{commit}`); }
    catch { git("fetch", "--quiet", "--no-tags", "origin", commit); }
  }

  const rebuilt = git("merge-tree", "--write-tree", "--no-messages", earlier.base, earlier.head).trim().split("\n")[0];
  if (rebuilt !== earlier.tree) {
    throw new Error(`the merge run ${earlier.head.slice(0, 7)} tested does not come out as it recorded`);
  }

  return names(git("diff", "-z", "--no-renames", "--name-only", rebuilt, tested));
}

export function broughtByPullRequest(tested, cwd = process.cwd(), parents = parentsOf(tested, cwd)) {
  const git = (...args) => read("git", args, cwd);
  if (parents.length !== 3) throw new Error(`${tested.slice(0, 7)} is not the pull request merged into its base`);
  const base = parents[1];
  return { base, files: names(git("diff", "-z", "--no-renames", "--name-only", base, tested)) };
}

function readEvent(env) {
  return JSON.parse(fs.readFileSync(String(env.GITHUB_EVENT_PATH), "utf8"));
}

function ghJson(endpoint) {
  return JSON.parse(read("gh", ["api", endpoint]));
}

export function runJobs(repo, runId, get = ghJson) {
  return get(`repos/${repo}/actions/runs/${runId}/jobs?filter=latest&per_page=100`).jobs;
}

export function runSummary(run, jobs) {
  return { id: run.id, number: run.run_number, url: run.html_url, databaseConclusion: databaseConclusion(jobs) };
}

function parentsOf(commit, cwd = process.cwd()) {
  return read("git", ["rev-list", "--parents", "-n", "1", commit], cwd).trim().split(" ");
}

export function mainRunOn(repo, workflowId, sha, get = ghJson) {
  const listed = get(`repos/${repo}/actions/workflows/${workflowId}/runs?event=push&branch=main&head_sha=${sha}&per_page=20`);
  const newest = listed.workflow_runs
    .filter((r) => r.head_sha === sha && r.event === "push" && r.head_branch === "main")
    .sort((a, b) => b.run_number - a.run_number)[0];
  if (!newest) return null;
  const completed = newest.status === "completed";
  return { ...runSummary(newest, completed ? runJobs(repo, newest.id, get) : []), completed };
}

function sleepFor(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function decide(env, parents) {
  const event = readEvent(env);
  const baseRef = String(event.pull_request?.base?.ref ?? "");
  const earlierRun = () => {
    try {
      return verdict(gatherFacts(env));
    } catch (error) {
      return verdict({ action: "", earlier: null, changed: [], problem: error.message });
    }
  };
  if (baseRef !== "main") return earlierRun();

  const brought = broughtByPullRequest(String(env.GITHUB_SHA), process.cwd(), parents);
  if (ruleFor(baseRef, brought.files) !== "against main") return beyondDocuments(earlierRun(), brought.files);

  const repo = String(env.GITHUB_REPOSITORY);
  const current = JSON.parse(read("gh", ["api", `repos/${repo}/actions/runs/${Number(env.GITHUB_RUN_ID)}`]));
  const outcome = waitForMain({
    read: () => mainRunOn(repo, current.workflow_id, brought.base), now: () => performance.now(), sleep: sleepFor,
  });
  return againstMainVerdict({ mainSha: brought.base, ...outcome });
}

export function main(env = process.env) {
  let parents;
  try {
    const merge = String(env.GITHUB_SHA);
    parents = parentsOf(merge);
    const tree = read("git", ["rev-parse", `${merge}^{tree}`]).trim();
    if (parents.length === 3) console.log(recordLine({ base: parents[1], tree }));
  } catch { /* no record: a later run relying on this one runs in full */ }

  let decided;
  try {
    decided = decide(env, parents);
  } catch (error) {
    decided = verdict({ action: "", earlier: null, changed: [], problem: error.message });
  }
  const { output, notice } = workflowLines(decided);
  console.log(notice);
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `${output}\n`);
  else console.log(output);
}

const STARTED = Symbol.for("compass.documents-only.started");
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) && !globalThis[STARTED]) {
  globalThis[STARTED] = true;
  main();
}
