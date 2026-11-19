import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readSettings } from "../practice/lib.mjs";
import { migrationFiles, realSurroundings, realTool } from "../practice/cli.mjs";
import { findPracticeCopy, makeAccounts, prepareDatabaseRun } from "../practice/commands.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RESULTS = path.join(ROOT, "verify-results");
const SETTINGS = readSettings(fs.readFileSync(path.join(ROOT, "supabase", "config.toml"), "utf8"));
export const APP = new URL(SETTINGS.app).origin;
export const ALLOWED_ORIGINS = new Set([APP, new URL(SETTINGS.address).origin]);
const TABLES = new Set([
  "projects", "phases", "learning_items", "daily_tasks", "thoughts", "thought_groups", "time_sessions",
]);

const ACCOUNT_EMAIL = /^verify-[a-z0-9-]+@compass\.test$/;

function git(...args) {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

export function checkoutState() {
  return {
    checkout: ROOT,
    branch: git("branch", "--show-current") || "(no branch)",
    commit: git("rev-parse", "--short", "HEAD") || "(no commit)",
    dirty: git("status", "--porcelain") !== "",
  };
}

function stamp(at = new Date()) {
  const two = (n) => String(n).padStart(2, "0");
  return `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}-${two(at.getHours())}${two(at.getMinutes())}${two(at.getSeconds())}`;
}

export function newRun() {
  const state = checkoutState();
  const id = `${stamp()}-${state.commit}${state.dirty ? "-dirty" : ""}`;
  const dir = path.join(RESULTS, id);
  fs.mkdirSync(dir, { recursive: true });
  const run = { id, dir, ...state, startedAt: new Date().toISOString(), app: null, session: null, practiceCopy: { startedByRun: false } };
  saveRun(run);
  fs.writeFileSync(path.join(RESULTS, "latest"), `${id}\n`);
  return run;
}

export function currentRun() {
  let id;
  try {
    id = fs.readFileSync(path.join(RESULTS, "latest"), "utf8").trim();
  } catch {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(path.join(RESULTS, id, "run.json"), "utf8"));
  } catch {
    return null;
  }
}

export function saveRun(run) {
  fs.writeFileSync(path.join(run.dir, "run.json"), `${JSON.stringify(run, null, 2)}\n`);
}

function quietSurroundings() {
  return { ...realSurroundings(), say: () => {} };
}

/** The practice copy's address, public key and inbox. Refuses, in the practice commands' own
 *  words, when it is down, is not the one in supabase/config.toml, or the folder is linked to a
 *  hosted project; with `migrations`, also when it holds other migrations than the committed ones. */
export async function practiceCopy({ migrations = false } = {}) {
  const around = quietSurroundings();
  return migrations ? prepareDatabaseRun(around, migrationFiles()) : findPracticeCopy(around);
}

export function runAccounts(run) {
  try {
    return JSON.parse(fs.readFileSync(path.join(run.dir, "accounts.json"), "utf8")).accounts;
  } catch {
    return [];
  }
}

export const BY_HAND = "by-hand";

/** The account named, or else the newest one made to drive by hand (journeys make their own). */
export function handAccount(run, email) {
  const accounts = runAccounts(run);
  return email ? accounts.find((one) => one.email === email) : accounts.filter((one) => one.label === BY_HAND).at(-1);
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 16) || "x";
}

export function accountDetails(run, label) {
  const runPart = run.id.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 14);
  const email = `verify-${runPart}-${slug(label)}-${crypto.randomBytes(3).toString("hex")}@compass.test`;
  return { email, password: `Verify-${crypto.randomBytes(6).toString("base64url")}-7!`, label };
}

export function recordAccount(run, account) {
  const accounts = runAccounts(run).filter((one) => one.email !== account.email);
  accounts.push({ email: account.email, password: account.password, label: account.label ?? "" });
  fs.writeFileSync(path.join(run.dir, "accounts.json"), `${JSON.stringify({ about: "Made-up accounts on the practice copy, for this run only. Never paste them anywhere.", accounts }, null, 2)}\n`);
}

/** Signs a fresh made-up account up at the practice copy, the way `npm run practice:up` makes its
 *  two, and records it with the run so cleanup can remove it. */
export async function makeAccount(run, label, where) {
  const account = accountDetails(run, label);
  recordAccount(run, account);
  await makeAccounts(quietSurroundings(), where ?? (await practiceCopy()), [account]);
  return account;
}

export async function removeAccounts(emails) {
  const named = emails.filter((email) => ACCOUNT_EMAIL.test(email));
  if (named.length === 0) return 0;
  return deleteUsersWhere(`email in (${named.map((email) => `'${email}'`).join(", ")})`);
}

export async function removeEveryVerifyAccount() {
  return deleteUsersWhere("email like 'verify-%@compass.test'");
}

async function deleteUsersWhere(condition) {
  await practiceCopy();
  const question =
    `with gone as (delete from auth.users where ${condition} returning 1) ` +
    "select 'removed:' || count(*) as answer from gone";
  const answer = await realTool(["db", "query", "--local", question]);
  const found = answer.code === 0 ? String(answer.text).match(/removed:(\d+)/) : null;
  if (!found) throw new Error("The practice copy could not be asked to remove the run's accounts.");
  return Number(found[1]);
}

export async function signInAtThePracticeCopy(where, account) {
  const answer = await fetch(`${where.address}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: where.publicKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  if (!answer.ok) throw new Error(`${account.email} could not sign in at the practice copy (it answered ${answer.status}).`);
  return (await answer.json()).access_token;
}

/** Reads rows the way the app does: as the signed-in account, through the public key, so the
 *  owner-only rules decide what comes back. */
export async function readRows(where, token, table, query = "select=*") {
  if (!TABLES.has(table)) throw new Error(`"${table}" is not one of Compass's tables: ${[...TABLES].join(", ")}.`);
  const answer = await fetch(`${where.address}/rest/v1/${table}?${query}`, {
    headers: { apikey: where.publicKey, Authorization: `Bearer ${token}` },
  });
  if (!answer.ok) throw new Error(`The practice copy did not hand back ${table} (it answered ${answer.status}).`);
  return answer.json();
}

export async function emailsInTheInbox(where) {
  const answer = await fetch(`${where.inbox}/api/v1/messages?limit=200`);
  if (!answer.ok) throw new Error(`The practice inbox did not answer (${answer.status}).`);
  const { messages } = await answer.json();
  return messages ?? [];
}

/** The newest email to `email` that was not in the inbox before; waits up to `within` ms. */
export async function newestEmailTo(where, email, before, within = 30_000) {
  const until = Date.now() + within;
  while (Date.now() < until) {
    const fresh = (await emailsInTheInbox(where)).find(
      (one) => !before.has(one.ID) && (one.To ?? []).some((to) => to.Address?.toLowerCase() === email.toLowerCase()),
    );
    if (fresh) {
      const answer = await fetch(`${where.inbox}/api/v1/message/${encodeURIComponent(fresh.ID)}`);
      const { HTML, Text, Subject } = await answer.json();
      return { id: fresh.ID, subject: Subject ?? "", html: HTML ?? "", text: Text ?? "" };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No email to ${email} reached the practice inbox within ${Math.round(within / 1000)} seconds.`);
}

/** The reset link an email carries. It holds a one-time token: open it, never print or save it. */
export function resetLinkIn(message) {
  const href = /href="([^"]*#token_hash=[^"]*)"/.exec(message.html)?.[1] ?? /(\S*#token_hash=\S*)/.exec(message.text)?.[1];
  if (!href) throw new Error("The email holds no reset link.");
  const link = href.replace(/&amp;/g, "&");
  if (new URL(link).origin !== APP) throw new Error("The email's reset link does not lead to the practice app.");
  return link;
}

function answersAt(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (answered) => {
      socket.destroy();
      resolve(answered);
    };
    socket.setTimeout(1000, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

export async function appAddressTaken() {
  const port = Number(new URL(APP).port);
  const answered = await Promise.all(["127.0.0.1", "::1"].map((host) => answersAt(host, port)));
  return answered.some(Boolean);
}

export function commandOf(pid) {
  try {
    return execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

export function isRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

/** Stops a process this run started, and only when its command line is still the one it was
 *  started with, so a number the system has since handed to another program is left alone. */
export async function stopStarted(pid, commandHolds, { group = false } = {}) {
  if (!isRunning(pid)) return "was not running";
  if (!commandOf(pid).includes(commandHolds)) return "left alone: that process number now belongs to another program";
  const signal = (name) => {
    try {
      process.kill(group ? -pid : pid, name);
    } catch {
      /* already gone */
    }
  };
  signal("SIGTERM");
  for (let waited = 0; waited < 10_000 && isRunning(pid); waited += 200) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!isRunning(pid)) return "stopped";
  signal("SIGKILL");
  return "killed after it ignored a request to stop";
}

export function withoutColour(text) {
  // eslint-disable-next-line no-control-regex -- the driver's messages carry terminal colour codes, which begin with a control character
  return String(text ?? "").replace(/\u001b\[[0-9;]*m/g, "");
}

export function untilDeadline(ms, what) {
  const timer = setTimeout(() => {
    console.error(`Stopped: ${what} ran past its time limit of ${Math.round(ms / 1000)} seconds.`);
    process.exit(124);
  }, ms);
  timer.unref();
}
