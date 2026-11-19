#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  APP, BY_HAND, ROOT, appAddressTaken, checkoutState, commandOf, currentRun, handAccount, isRunning, makeAccount, newRun,
  practiceCopy, readRows, removeAccounts, removeEveryVerifyAccount, runAccounts, saveRun, signInAtThePracticeCopy, stopStarted,
  untilDeadline,
} from "./lib.mjs";
import { JOURNEYS, journeysNamed, runJourneys } from "./journey.mjs";

const FEATURES = path.join(ROOT, ".claude", "skills", "verify-compass", "features");
const APP_COMMAND = "scripts/practice/cli.mjs app";
const SESSION_COMMAND = "scripts/verify/session.mjs";
const BOOLEAN = new Set(["exact", "headed", "full", "keep-video", "keep-copy", "clear", "every-verify-account", "no-browser"]);
const TAKEN =
  `Something already answers at ${APP}: another run's practice app, \`npm run practice:app\` or \`npm run test:browser\`. ` +
  "It is not driven, since it may serve another checkout's code. If it is this checkout's earlier run, end it with " +
  "`node scripts/verify/verify.mjs cleanup`; otherwise stop it where it was started.";

const say = (line) => console.log(line);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rel = (file) => path.relative(ROOT, file) || ".";

class Refusal extends Error {}

function parse(argv) {
  const words = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i];
    if (!word.startsWith("--")) {
      words.push(word);
      continue;
    }
    const key = word.slice(2);
    if (BOOLEAN.has(key)) flags[key] = true;
    else {
      flags[key] = argv[i + 1];
      i += 1;
    }
  }
  return { words, flags };
}

function targetFrom(flags, prefix = "") {
  const read = (key) => flags[`${prefix}${key}`];
  const target = {};
  for (const key of ["role", "name", "placeholder", "label", "title", "text", "css", "in", "nth"]) {
    if (read(key) !== undefined) target[key] = read(key);
  }
  if (read("exact")) target.exact = true;
  return Object.keys(target).length > 0 ? target : undefined;
}

function lastWords(file) {
  try {
    return fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).slice(-3).join(" / ") || "it said nothing";
  } catch {
    return "it said nothing";
  }
}

function runNode(args, limit, log) {
  return new Promise((resolve) => {
    const out = fs.openSync(log, "a");
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ["ignore", out, out] });
    const timer = setTimeout(() => child.kill("SIGTERM"), limit);
    child.on("error", () => resolve(127));
    child.on("close", (code) => {
      clearTimeout(timer);
      fs.closeSync(out);
      resolve(code ?? 1);
    });
  });
}

function startDetached(args, log) {
  const out = fs.openSync(log, "a");
  const child = spawn(process.execPath, args, { cwd: ROOT, detached: true, stdio: ["ignore", out, out] });
  fs.closeSync(out);
  const state = { pid: child.pid, exited: false };
  child.on("exit", () => { state.exited = true; });
  child.unref();
  return state;
}

async function bringPracticeCopy(run) {
  try {
    await practiceCopy({ migrations: true });
    return { startedByRun: false };
  } catch (error) {
    if (error?.kind !== "down") throw new Refusal(error.message);
  }
  say("The practice copy is down: bringing it up (npm run practice:up)…");
  const log = path.join(run.dir, "practice-copy.log");
  const code = await runNode(["scripts/practice/cli.mjs", "up"], 300_000, log);
  if (code !== 0) throw new Refusal(`The practice copy could not be brought up: ${lastWords(log)}`);
  await practiceCopy({ migrations: true });
  return { startedByRun: true };
}

async function startApp(run) {
  const log = path.join(run.dir, "app.log");
  const started = startDetached(["scripts/practice/cli.mjs", "app"], log);
  for (const until = Date.now() + 120_000; Date.now() < until; await sleep(250)) {
    const text = fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "";
    if (text.includes("The practice app is at ")) break;
    if (started.exited) throw new Refusal(`The practice app did not start: ${lastWords(log)}`);
  }
  if (started.exited || !isRunning(started.pid)) throw new Refusal(`The practice app did not start: ${lastWords(log)}`);
  const answer = await fetch(APP).catch(() => null);
  if (!answer?.ok) throw new Refusal(`The practice app started but ${APP} does not answer.`);
  return { pid: started.pid, address: APP };
}

async function startSession(run, headed) {
  const log = path.join(run.dir, "session.log");
  const file = path.join(run.dir, "session.json");
  const started = startDetached([SESSION_COMMAND, run.dir, ...(headed ? ["--headed"] : [])], log);
  for (const until = Date.now() + 90_000; Date.now() < until; await sleep(250)) {
    if (fs.existsSync(file)) return { ...JSON.parse(fs.readFileSync(file, "utf8")), pid: started.pid };
    if (started.exited) break;
  }
  throw new Refusal(`The browser session did not open the practice app: ${lastWords(log)}`);
}

async function launch(flags) {
  const before = currentRun();
  if (before && !before.endedAt) {
    throw new Refusal(`A run is already launched from this checkout (${before.id}). Drive it, or end it with: node scripts/verify/verify.mjs cleanup`);
  }
  if (await appAddressTaken()) throw new Refusal(TAKEN);
  const run = newRun();
  say(`Run ${run.id} — evidence goes to ${rel(run.dir)}/`);
  try {
    run.practiceCopy = await bringPracticeCopy(run);
    saveRun(run);
    run.app = await startApp(run);
    saveRun(run);
    say(`The practice app is up at ${APP}, pointed at the practice copy${run.practiceCopy.startedByRun ? " (brought up by this run)" : ""}.`);
    if (!flags["no-browser"]) {
      run.session = await startSession(run, flags.headed === true);
      saveRun(run);
      say(`The browser session is open at the landing page${flags.headed ? ", in a window" : ""}.`);
    }
  } catch (error) {
    say(`Launch failed: ${error.message}`);
    await cleanup({}, run);
    throw new Refusal("Nothing was left running.");
  }
  return run;
}

function activeRun() {
  const run = currentRun();
  if (!run || run.endedAt) throw new Refusal("No run is launched from this checkout. Start one with: node scripts/verify/verify.mjs launch");
  if (run.checkout !== ROOT) throw new Refusal(`The latest run was launched from ${run.checkout}, not this checkout.`);
  return run;
}

async function cleanup(flags, given) {
  const run = given ?? currentRun();
  if (flags["every-verify-account"]) {
    const removed = await removeEveryVerifyAccount();
    say(`Removed ${removed} made-up verify accounts from the practice copy, and everything they owned.`);
  }
  if (!run || (run.endedAt && !given)) {
    if (!flags["every-verify-account"]) say("No launched run to end in this checkout.");
    return true;
  }
  let clean = true;
  if (run.session?.pid) {
    let closed = false;
    try {
      await fetch(`http://127.0.0.1:${run.session.port}/`, { method: "POST", body: JSON.stringify({ command: "close" }) });
      for (let waited = 0; waited < 5_000 && isRunning(run.session.pid); waited += 200) await sleep(200);
      closed = !isRunning(run.session.pid);
    } catch {
      /* not answering: stopped below */
    }
    say(`Browser session: ${closed ? "closed" : await stopStarted(run.session.pid, SESSION_COMMAND)}.`);
  }
  if (run.app?.pid) say(`Practice app: ${await stopStarted(run.app.pid, APP_COMMAND, { group: true })}.`);
  const emails = runAccounts(run).map((account) => account.email);
  if (emails.length > 0) {
    try {
      const removed = await removeAccounts(emails);
      say(`Removed ${removed} of this run's ${emails.length} made-up accounts from the practice copy, and everything they owned.`);
    } catch (error) {
      clean = false;
      say(`This run's accounts could not be removed (${error.message}). Remove them later with: node scripts/verify/verify.mjs cleanup --every-verify-account`);
    }
  }
  if (run.practiceCopy?.startedByRun && !flags["keep-copy"]) {
    const code = await runNode(["scripts/practice/cli.mjs", "down"], 120_000, path.join(run.dir, "practice-copy.log"));
    say(code === 0 ? "Practice copy: thrown away, as this run had brought it up." : "Practice copy: could not be thrown away; run npm run practice:down.");
    if (code !== 0) clean = false;
  }
  run.endedAt = new Date().toISOString();
  saveRun(run);
  say(`Evidence kept at ${rel(run.dir)}/${fs.existsSync(path.join(run.dir, "report.md")) ? " (report.md)" : ""}.`);
  return clean;
}

async function check(label, test) {
  try {
    const detail = await test();
    say(`ok      ${label}${detail ? ` — ${detail}` : ""}`);
    return true;
  } catch (error) {
    say(`NOT OK  ${label} — ${error.message}`);
    return false;
  }
}

async function doctor() {
  const results = [];
  const here = checkoutState();
  results.push(await check("checkout", async () => `${here.checkout} · ${here.branch} · ${here.commit}${here.dirty ? " with uncommitted changes (they are what the app serves)" : ""}`));
  const run = currentRun();
  const launched = run && !run.endedAt && run.checkout === ROOT;
  results.push(await check("run", async () => {
    if (!launched) throw new Error("no run is launched from this checkout: node scripts/verify/verify.mjs launch");
    if (run.commit !== here.commit) return `${run.id} — launched at ${run.commit}, the checkout is now at ${here.commit}`;
    return run.id;
  }));
  results.push(await check("practice copy", async () => {
    const where = await practiceCopy({ migrations: true });
    return `up at ${where.address}, ours, holds the committed migrations, not linked`;
  }));
  results.push(await check("practice app", async () => {
    if (!launched || !run.app?.pid) throw new Error("this run started none");
    if (!isRunning(run.app.pid) || !commandOf(run.app.pid).includes(APP_COMMAND)) throw new Error(`the app this run started (process ${run.app.pid}) is gone; end the run and launch again`);
    const page = await (await fetch(APP)).text();
    if (!page.includes("<title>Compass</title>")) throw new Error(`${APP} answers, but not with Compass`);
    const config = await (await fetch(`${APP}/src/lib/supabase.ts`)).text();
    const address = /"VITE_SUPABASE_URL":\s*"([^"]*)"/.exec(config)?.[1];
    const where = await practiceCopy();
    if (address !== where.address) throw new Error(`the app is pointed at ${address ?? "no address"}, not the practice copy`);
    if (!/"VITE_TURNSTILE_SITE_KEY":\s*""/.test(config)) throw new Error("the app was handed a CAPTCHA site key");
    return `${APP}, process ${run.app.pid}, pointed at the practice copy, no CAPTCHA key`;
  }));
  if (launched && run.session) {
    results.push(await check("browser session", async () => {
      if (!isRunning(run.session.pid)) throw new Error("the browser session this run started is gone");
      const reply = await askSession(run, "url", {});
      const reached = await askSession(run, "requests", {});
      if (!/refused: nothing$/.test(reached.at(-1))) throw new Error(`the page tried to reach other addresses — ${reached.at(-1)}`);
      return `process ${run.session.pid}, on ${reply[0]}, ${reached[0]}`;
    }));
  }
  if (launched) {
    results.push(await check("accounts", async () => {
      const made = runAccounts(run).length;
      const hand = handAccount(run);
      if (!hand) return `${made} made up by this run's journeys; none to drive by hand yet (\`account\` makes one)`;
      await signInAtThePracticeCopy(await practiceCopy(), hand);
      return `${made} made up by this run; the one to drive by hand, ${hand.email}, signs in`;
    }));
  }
  return results.every(Boolean);
}

async function askSession(run, command, args) {
  if (!run.session?.port) throw new Refusal("This run has no browser session (it was launched with --no-browser).");
  let answer;
  try {
    answer = await fetch(`http://127.0.0.1:${run.session.port}/`, { method: "POST", body: JSON.stringify({ command, args }) });
  } catch {
    throw new Refusal("The browser session does not answer. Run doctor, or end the run and launch again.");
  }
  const reply = await answer.json();
  if (!reply.ok) throw new Refusal(reply.error);
  return reply.lines;
}

async function requireApp(run) {
  if (!run.app?.pid || !isRunning(run.app.pid)) throw new Refusal("The practice app this run started is gone. End the run (cleanup) and launch again.");
}

function chosenJourneys(words) {
  try {
    return journeysNamed(words);
  } catch (error) {
    throw new Refusal(error.message);
  }
}

async function journey(words, flags, run) {
  await requireApp(run);
  const chosen = chosenJourneys(words);
  const results = await runJourneys(run, chosen, { headed: flags.headed === true, keepVideo: flags["keep-video"] === true, say });
  const failed = results.filter((result) => !result.passed);
  say(failed.length === 0
    ? `Every journey passed (${results.length} of ${results.length}).`
    : `${failed.length} of ${results.length} journeys failed: ${failed.map((result) => result.name).join(", ")}.`);
  say(`Report: ${rel(path.join(run.dir, "report.md"))}`);
  return failed.length === 0;
}

function list() {
  for (const one of JOURNEYS) {
    say(`${one.section.padEnd(4)} ${one.name.padEnd(11)} ${one.title}`);
    for (const step of one.steps) say(`       ${step.id.padEnd(26)} ${step.what}`);
  }
}

function mapCheck() {
  const problems = [];
  for (const one of JOURNEYS) {
    const file = path.join(FEATURES, `${one.name}.md`);
    if (!fs.existsSync(file)) {
      problems.push(`${rel(file)} is missing: the ${one.name} journey has no feature file.`);
      continue;
    }
    const text = fs.readFileSync(file, "utf8");
    const section = /## Sub-features\n([\s\S]*?)\n## /.exec(text)?.[1] ?? "";
    const listed = new Map([...section.matchAll(/^- `([a-z0-9-]+)`(.*)$/gm)].map((m) => [m[1], m[2]]));
    const steps = new Set(one.steps.map((step) => step.id));
    for (const id of steps) if (!listed.has(id)) problems.push(`${rel(file)}: the journey's step \`${id}\` is not listed under Sub-features.`);
    for (const [id, rest] of listed) {
      if (!steps.has(id) && !/not driven/i.test(rest)) problems.push(`${rel(file)}: \`${id}\` is neither a step of the journey nor marked "not driven".`);
    }
    if (!text.includes(`verify.mjs journey ${one.name}`)) problems.push(`${rel(file)} does not show how to run its journey (node scripts/verify/verify.mjs journey ${one.name}).`);
  }
  for (const line of problems) say(line);
  say(problems.length === 0 ? `The feature map and the ${JOURNEYS.length} journeys name the same steps.` : `${problems.length} differences between the feature map and the journeys.`);
  return problems.length === 0;
}

async function rows(words, flags, run) {
  const [table] = words;
  const account = handAccount(run, flags.account);
  if (!account) throw new Refusal("This run has no such account. Make one with: node scripts/verify/verify.mjs account");
  const query = [`select=${flags.select ?? "*"}`];
  for (const condition of [flags.where].filter(Boolean)) {
    const [column, value] = String(condition).split("=");
    query.push(`${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`);
  }
  if (flags.order) query.push(`order=${encodeURIComponent(flags.order)}`);
  const where = await practiceCopy();
  const found = await readRows(where, await signInAtThePracticeCopy(where, account), table, query.join("&"));
  say(JSON.stringify(found, null, 2));
}

const SESSION_COMMANDS = {
  open: (words) => ({ path: words[0] ?? "/" }),
  reload: () => ({}),
  click: (_words, flags) => ({ target: targetFrom(flags), modifiers: flags.modifiers ? String(flags.modifiers).split("+") : undefined }),
  fill: (words, flags) => ({ target: targetFrom(flags), value: flags.value ?? words.join(" ") }),
  type: (words, flags) => ({ target: targetFrom(flags), value: flags.value ?? words.join(" ") }),
  press: (words, flags) => ({ target: targetFrom(flags), keys: words.join(" ") }),
  select: (words, flags) => ({ target: targetFrom(flags), value: flags.value ?? words[0] }),
  check: (_words, flags) => ({ target: targetFrom(flags) }),
  uncheck: (_words, flags) => ({ target: targetFrom(flags) }),
  hover: (_words, flags) => ({ target: targetFrom(flags) }),
  drag: (_words, flags) => ({ target: targetFrom(flags), to: targetFrom(flags, "to-"), position: flags.position }),
  see: (_words, flags) => ({ target: targetFrom(flags) }),
  gone: (_words, flags) => ({ target: targetFrom(flags) }),
  count: (_words, flags) => ({ target: targetFrom(flags) }),
  text: (_words, flags) => ({ target: targetFrom(flags) }),
  value: (_words, flags) => ({ target: targetFrom(flags) }),
  focused: () => ({}),
  url: () => ({}),
  snapshot: (_words, flags) => ({ in: flags.in }),
  shot: (_words, flags) => ({ full: flags.full === true }),
  console: (_words, flags) => ({ clear: flags.clear === true }),
  requests: () => ({}),
  wait: (words) => ({ ms: words[0] }),
  viewport: (words) => ({ width: words[0], height: words[1] }),
  motion: (words) => ({ value: words[0] }),
  "sign-in": (words) => ({ email: words[0] }),
  setup: (_words, flags) => ({ name: flags.name }),
};

const USAGE = `Usage: node scripts/verify/verify.mjs <command>
  prove [journey…]          launch, doctor, the journeys (all when none is named), cleanup — the safety net
  launch [--headed]         the practice copy (brought up when down), the practice app, a browser session
  doctor                    read-only: is this instance worth driving?
  journey <name…|all>       run journeys against the launched app; evidence and report.md in the run folder
  cleanup [--keep-copy]     stop what this run started and remove its accounts; the evidence stays
  list | map                the journeys and their steps | check the feature map names the same steps
  account | sign-in [email] | setup [--name N]
  open [path] | reload | click | fill <text> | type <text> | press <keys> | select <value> | check | uncheck | hover
  drag … --to-role/--to-css/… [--position top|bottom] | see | gone | count | text | value | focused | url
  snapshot [--in css] | shot [--full] | console [--clear] | requests | wait <ms> | viewport <w> <h> | motion reduce
  rows <table> [--select cols] [--where column=value] [--order column] [--account email]
Targets: --role R --name N [--exact] | --placeholder P | --label L | --title T | --text T | --css C, with --in C and --nth N.`;

const LIMITS = { prove: 40 * 60_000, journey: 35 * 60_000, launch: 8 * 60_000, cleanup: 3 * 60_000 };

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { words, flags } = parse(rest);
  untilDeadline(LIMITS[command] ?? 90_000, `verify.mjs ${command ?? ""}`.trim());
  switch (command) {
    case "launch":
      await launch(flags);
      return true;
    case "doctor":
      return doctor();
    case "cleanup":
      return cleanup(flags);
    case "journey":
      return journey(words, flags, activeRun());
    case "prove": {
      chosenJourneys(words);
      const run = await launch({ ...flags, "no-browser": true });
      let passed;
      try {
        passed = (await doctor()) && (await journey(words, flags, run));
      } finally {
        await cleanup(flags, run);
      }
      return passed;
    }
    case "list":
      list();
      return true;
    case "map":
      return mapCheck();
    case "account": {
      const account = await makeAccount(activeRun(), BY_HAND);
      say(`Made ${account.email} on the practice copy; its password is in the run's accounts.json. Sign in with: node scripts/verify/verify.mjs sign-in`);
      return true;
    }
    case "rows":
      await rows(words, flags, activeRun());
      return true;
    default:
      if (SESSION_COMMANDS[command]) {
        for (const line of await askSession(activeRun(), command, SESSION_COMMANDS[command](words, flags))) say(line);
        return true;
      }
      console.error(USAGE);
      process.exit(2);
  }
}

try {
  const ok = await main();
  process.exit(ok ? 0 : 1);
} catch (error) {
  console.error(error instanceof Refusal ? `Refused: ${error.message}` : `verify.mjs failed: ${error?.stack ?? error}`);
  process.exit(1);
}
