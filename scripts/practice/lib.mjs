import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {{ name: string, address: string, inbox: string, app: string }} PracticeSettings */

export class PracticeRefusal extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "PracticeRefusal";
    this.kind = kind;
  }
}

export class NetworkRefused extends Error {
  constructor(address) {
    super(`A check may not reach this address: ${address}. The suite reaches no network address, and a database check reaches the practice copy alone.`);
    this.name = "NetworkRefused";
    this.address = address;
  }
}

/** @param {string} text
 * @returns {PracticeSettings} */
export function readSettings(text) {
  let section = "";
  const found = {};
  for (const raw of String(text).split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const heading = line.match(/^\[([^\]]+)\]$/);
    if (heading) { section = heading[1].trim(); continue; }
    const pair = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!pair) continue;
    const key = section ? `${section}.${pair[1]}` : pair[1];
    if (!(key in found)) found[key] = pair[2].replace(/\s+#.*$/, "").trim().replace(/^"(.*)"$/, "$1");
  }
  const need = (key, what) => {
    if (!found[key]) throw new Error(`The practice copy's settings do not say ${what} (${key}).`);
    return found[key];
  };
  return {
    name: need("project_id", "its name"),
    address: `http://127.0.0.1:${need("api.port", "where it answers")}`,
    inbox: `http://127.0.0.1:${need("local_smtp.port", "where its inbox answers")}`,
    app: need("auth.site_url", "the practice app's address"),
  };
}

export function judgeAddress(candidate, settings) {
  const no = (reason) => ({ ok: false, reason });
  let ours;
  try {
    ours = new URL(String(settings?.address ?? ""));
  } catch {
    return no("The practice copy's own settings hold no address to compare with.");
  }
  if (ours.protocol !== "http:" || ours.hostname !== "127.0.0.1" || !ours.port) {
    return no("The practice copy only ever answers at http://127.0.0.1 with a port of its own; the settings name something else.");
  }
  const expected = `http://127.0.0.1:${ours.port}`;

  if (typeof candidate !== "string" || candidate.trim() === "") return no("No address was given.");
  const bare = candidate.endsWith("/") ? candidate.slice(0, -1) : candidate;
  if (bare === expected) return { ok: true, reason: "" };

  let given;
  try {
    given = new URL(candidate);
  } catch {
    return no("That is not an address.");
  }
  if (given.username || given.password) return no("That address carries a sign-in name, so it leads to another host.");
  if (given.hostname !== "127.0.0.1") return no("That address is not on this machine: the practice copy answers at 127.0.0.1 only.");
  if (given.protocol !== "http:") return no("The practice copy answers over plain http; that address uses something else.");
  if (given.port !== ours.port) return no(`That is another local copy's address: the practice copy's port is ${ours.port}.`);
  return no("That address has something after it; the practice copy's address ends at its port.");
}

export function pickPublicValues(answer, settings) {
  const text = String(answer?.text ?? "");
  if (answer?.code !== 0) {
    if (/No such container/i.test(text)) {
      throw new PracticeRefusal("down", "The practice copy is not running. Start it with: npm run practice:up");
    }
    throw new PracticeRefusal("tool", `The Supabase tool could not say where the practice copy is (it ended with ${answer?.code}).`);
  }
  let listed = null;
  const from = text.indexOf("{");
  const to = text.lastIndexOf("}");
  if (from !== -1 && to > from) {
    try { listed = JSON.parse(text.slice(from, to + 1)); } catch { listed = null; }
  }
  if (!listed || typeof listed !== "object") {
    throw new PracticeRefusal("tool", "The Supabase tool's answer could not be read.");
  }
  const address = listed.API_URL;
  const inbox = listed.INBUCKET_URL ?? listed.MAILPIT_URL;
  const publicKey = listed.PUBLISHABLE_KEY ?? listed.ANON_KEY;

  const verdict = judgeAddress(address, settings);
  if (!verdict.ok) {
    throw new PracticeRefusal("not-ours", `The copy the tool found is not the practice copy. ${verdict.reason}`);
  }
  if (inbox !== settings.inbox) {
    throw new PracticeRefusal("not-ours", "The copy the tool found is not the practice copy: its inbox is not the one in our settings.");
  }
  if (typeof publicKey !== "string" || publicKey === "") {
    throw new PracticeRefusal("tool", "The Supabase tool's answer holds no public key.");
  }
  return { address: settings.address, publicKey, inbox: settings.inbox };
}

export const LEFT_BEHIND_MARKER = "ROWS-LEFT-BEHIND";

const CLOSING_WORDS = ": all checks passed — everything above is rolled back";

export const CATCH_MESSAGE = "the check cannot run: plpgsql.check_asserts is off, so no assertion would be read";

export function judgeCatches(checks) {
  const uncaught = checks
    .filter(({ held, message }) => held || message !== CATCH_MESSAGE)
    .map(({ file, held, message }) => ({ file, said: held ? `held — ${message}` : message }));
  return { caught: checks.length > 0 && uncaught.length === 0, uncaught };
}

export function judgeRolledBackCheck(answer) {
  const text = String(answer?.text ?? "");
  if (answer?.code === 0) {
    return { held: false, message: "The check ended without raising, so nothing was undone." };
  }
  const lines = text.split("\n");
  let message = "";
  for (const line of lines) {
    const found = line.match(/(?:^|\s)error: (.+)$/);
    if (found) message = found[1].replace(/"\}\}\s*$/, "").trim();
  }
  if (!message) return { held: false, message: "The check's closing message could not be read: the check may not have run." };
  return { held: message.endsWith(CLOSING_WORDS), message };
}

export function judgeReplay(answer) {
  if (answer?.code === 0) return { replayed: true, failed: null };
  const begun = [...String(answer?.text ?? "").matchAll(/Applying migration (\S+?)\.\.\./g)];
  return { replayed: false, failed: begun.length ? begun[begun.length - 1][1] : null };
}

export function judgeApplied(applied, files) {
  const committed = [...files].map((file) => String(file).replace(/\.sql$/, "")).sort();
  const replayed = [...applied].map(String);
  for (let i = 0; i < Math.max(committed.length, replayed.length); i++) {
    if (committed[i] === replayed[i]) continue;
    if (replayed[i] === undefined) return { ok: false, reason: `The practice copy has not replayed ${committed[i]}.` };
    if (committed[i] === undefined) return { ok: false, reason: `The practice copy replayed ${replayed[i]}, which is not a committed migration.` };
    return { ok: false, reason: `The practice copy replayed ${replayed[i]} where the committed migration is ${committed[i]}.` };
  }
  return { ok: true, reason: "" };
}

export function judgeChecksFolder(entries, migrations) {
  const known = new Set(migrations);
  const judged = entries.filter((name) => !PASSED_OVER.includes(name)).sort();
  const lines = [];
  for (const name of judged) {
    if (name === SHAPE_QUESTION || known.has(name)) continue;
    if (CHECK_NAME.test(name)) {
      lines.push(`The file supabase/checks/${name} is named after a migration that does not exist; ${theMigrations(migrations)}.`);
      continue;
    }
    lines.push(
      `The file supabase/checks/${name} is neither a migration's rolled-back check, named after its migration as NNNN_<name>.sql, nor the read-only question ${SHAPE_QUESTION}. Name it after its migration, or move it out of the folder.`,
    );
  }
  const present = new Set(entries);
  for (const migration of [...migrations].sort()) {
    if (!present.has(migration)) {
      lines.push(`The migration ${migration} has no rolled-back check; write one as supabase/checks/${migration}.`);
    }
  }
  return { ok: lines.length === 0, lines };
}

const SHAPE_QUESTION = "schema-shape.sql";

const CHECK_NAME = /^\d{4}_.+\.sql$/;

const PASSED_OVER = [".DS_Store"];

function theMigrations(migrations) {
  const names = [...migrations].sort();
  if (names.length === 0) return "there is no migration";
  if (names.length === 1) return `the only migration is ${names[0]}`;
  return `the migrations are ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function refuseUnlessChecksFolderIsWhole(folder) {
  const { ok, lines } = judgeChecksFolder(folder.entries, folder.migrations);
  if (ok) return;
  throw new PracticeRefusal("folder", [...lines, "No check was run."].join("\n"));
}

export function troublesInFile(file, module, began) {
  const NO_CHECK_IN_FILE = "No test suite found in file";
  const NO_CHECK_IN_GROUP = "No test found in suite";
  const found = [];
  const noCheckFound = [...module.children.allTests()].length === 0;
  const note = networkNoteOn(module);
  for (const group of [module, ...module.children.allSuites()]) {
    const errors = group === module && note ? group.errors().filter((_, at) => at !== note.errorAt) : group.errors();    if (errors.length === 0) continue;
    const because = firstLineOf(errors[0]);
    const unrun = [...group.children.allTests()].filter((check) => leftUnrun(check, began)).length;
    if (group === module && noCheckFound) {
      found.push({ file, what: because.startsWith(NO_CHECK_IN_FILE) ? "the file holds no check" : `the file could not load: ${because}` });
    } else if (because.startsWith(NO_CHECK_IN_GROUP)) {
      found.push({ file, what: `the group "${because.slice(NO_CHECK_IN_GROUP.length).trim()}" holds no check` });
    } else if (unrun > 0) {
      found.push({ file, what: `${unrun} ${unrun === 1 ? "check" : "checks"} did not run, since a step before them went wrong: ${because}` });
    } else {
      found.push({ file, what: `a step after the checks went wrong: ${because}` });
    }
  }
  if (note) found.push(...networkTroubles(file, note));
  return found;
}

function networkNoteOn(module) {
  const notes = typeof module.meta === "function" ? module.meta() : undefined;
  const note = notes?.[NETWORK_NOTE];
  if (!note || typeof note !== "object" || !Number.isInteger(note.errorAt) || !Array.isArray(note.left)) return null;
  if (!note.left.every(isALeftover)) return null;
  const error = (module.errors()[note.errorAt]);
  const said = error?.message;
  const isItsError = ["suite", "database"].some((group) => messagesForLeftovers(group, note.left).join("\n") === said);
  return isItsError ? note : null;
}

function isALeftover(one) {
  if (!one || typeof one !== "object") return false;
  const { check, addresses } = (one);
  return (check === null || typeof check === "string") && Array.isArray(addresses) && addresses.every((address) => typeof address === "string");
}

export function switchedOffInFile(file, module, began) {
  const found = [];
  const turns = turnsAtOneLine(module);
  for (const check of module.children.allTests()) {
    if (check.result().state !== "skipped") continue;
    if (leftUnrun(check, began)) continue;
    const turn = turns.get(check);
    found.push({ name: String(check.fullName ?? ""), file, line: check.location?.line ?? 0, ...(turn ? { turn } : {}) });
  }
  return found;
}

/** Whether a check that ended as "skipped" was meant to run and never began. The runner
 *  reports a check that switched itself off as it ran in the very same words; what tells
 *  the two apart is whether the check began. */
function leftUnrun(check, began) {
  return check.result().state === "skipped" && check.options.mode === "run" && !(typeof began === "function" && began(check) === true);
}

export function turnsAtOneLine(module) {
  const sharing = new Map();
  for (const check of module.children.allTests()) {
    const line = check.location?.line ?? 0;
    if (!(line > 0)) continue;
    const place = `${line} ${cutName(String(check.fullName ?? ""))}`;
    sharing.set(place, [...(sharing.get(place) ?? []), check]);
  }
  const turns = new Map();
  for (const checks of sharing.values()) {
    if (checks.length < 2) continue;
    checks.forEach((check, at) => turns.set(check, { nth: at + 1, of: checks.length }));
  }
  return turns;
}

export function cutName(name, limit = 120) {
  const whole = String(name ?? "");
  if (whole.length <= limit) return whole;
  const last = whole.charCodeAt(limit - 1);
  const keep = last >= 0xd800 && last <= 0xdbff ? limit - 1 : limit;
  return `${whole.slice(0, keep)}…`;
}

export function troubleRaisedOutside(error, file) {
  return { file, what: `an error was raised outside any check: ${firstLineOf(error)}` };
}

export function troubleNobodyNamed(verdict, checks, troubles) {
  if (verdict === "passed" || troubles.length > 0) return null;
  if (checks.length === 0 || checks.some((check) => !check.passed)) return null;
  return { file: "", what: "the test runner reported that the run did not pass, and the command heard of no check that failed and of nothing that went wrong outside the checks" };
}

export function failingExitCode(code) {
  return code !== undefined && code !== null && Number(code) !== 0;
}

export function runnerEndedAsFailed(verdict, leftByTheRun, leftByTheClosing) {
  return verdict !== "passed" || failingExitCode(leftByTheRun) || failingExitCode(leftByTheClosing);
}

export const SUBFOLDER_CHECKS = "the test runner, started from a subfolder";

export const LEAVE_OUT_SUBFOLDER_CHECKS = "--leave-out-subfolder-checks";

export function nameFilterFor(words) {
  if (!words.includes(LEAVE_OUT_SUBFOLDER_CHECKS)) return undefined;
  const escaped = SUBFOLDER_CHECKS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^(?![\\s\\S]*${escaped})`);
}

function firstLineOf(error) {
  const said = String(error?.message ?? error ?? "").split("\n")[0].trim();
  return said === "" ? "no reason was given" : said.slice(0, 200);
}

const RECORD = Symbol.for("compass.practice.networkAttempts");
const AT_WORK = Symbol.for("compass.practice.checkAtWork");
const SWITCHED_OFF = Symbol.for("compass.practice.networkSwitchedOff");
const SENT = Symbol.for("compass.practice.requestsSent");
const GUARDED = Symbol.for("compass.practice.guardedFor");

function record() {
  if (!Array.isArray(globalThis[RECORD])) globalThis[RECORD] = [];
  return globalThis[RECORD];
}

function atWork() {
  if (!(globalThis[AT_WORK] instanceof AsyncLocalStorage)) globalThis[AT_WORK] = new AsyncLocalStorage();
  return globalThis[AT_WORK];
}

function checkAtWork() {
  return atWork().getStore() ?? null;
}

function madeBy(attempt, check) {
  return check === null ? attempt.check === null : attempt.check?.id === check.id;
}

function note(address) {
  record().push({ address, check: checkAtWork() });
}

function takeWhere(which) {
  const all = record();
  const taken = all.filter(which);
  const kept = all.filter((attempt) => !which(attempt));
  all.length = 0;
  all.push(...kept);
  return taken.map(({ address, check }) => ({ address, check }));
}

function sent() {
  if (!Array.isArray(globalThis[SENT])) globalThis[SENT] = [];
  return globalThis[SENT];
}

function addressOf(input) {
  if (typeof input === "string") return input;
  if (input && typeof input === "object" && typeof input.url === "string") return input.url;
  if (input && typeof input === "object" && typeof input.href === "string") return input.href;
  return String(input);
}

function refusedFetch(input) {
  const address = addressOf(input);
  note(address);
  return Promise.reject(new NetworkRefused(address));
}

class RefusedWebSocket {
  constructor(address) {
    const tried = addressOf(address);
    note(tried);
    throw new NetworkRefused(tried);
  }
}

class RefusedXMLHttpRequest {
  open(_method, address) {
    const tried = addressOf(address);
    note(tried);
    throw new NetworkRefused(tried);
  }
  send() {
    throw new NetworkRefused("(a request that was never opened)");
  }
  setRequestHeader() {}
  abort() {}
  addEventListener() {}
  removeEventListener() {}
}

function placesOf(scope) {
  const page = scope ?? globalThis;
  return [...new Set([page, page?.window])].filter(
    (place) => place && (typeof place === "object" || typeof place === "function"),
  );
}

/** Set directly, not through the test runner's stubs: a suite that undoes its own stubs
 *  (`vi.unstubAllGlobals()`) then puts THESE back, not the real ones. */
function setDirectly(place, name, value) {
  try {
    Object.defineProperty(place, name, { value, writable: true, configurable: true, enumerable: true });
  } catch {
    place[name] = value;
  }
}

function mark(place, name, value) {
  try {
    Object.defineProperty(place, name, { value, writable: true, configurable: true, enumerable: false });
  } catch { /* a place that cannot be marked is simply set again next time */ }
}

function switchOff(place) {
  setDirectly(place, "fetch", refusedFetch);
  setDirectly(place, "WebSocket", RefusedWebSocket);
  setDirectly(place, "XMLHttpRequest", RefusedXMLHttpRequest);
  mark(place, SWITCHED_OFF, true);
  mark(place, GUARDED, null);
}

export function blockNetwork(scope) {
  for (const place of placesOf(scope)) {
    if (place[SWITCHED_OFF] && !place[GUARDED]) continue;
    switchOff(place);
  }
}

export function networkAttempts() {
  const here = checkAtWork();
  return record().filter((attempt) => madeBy(attempt, here)).map((attempt) => attempt.address);
}

export function forgetNetworkAttempts() {
  const here = checkAtWork();
  takeWhere((attempt) => madeBy(attempt, here));
}

export function asCheck(check, work) {
  return atWork().run(check, work);
}

export function takeNetworkAttempts(check) {
  if (check !== undefined) return takeWhere((attempt) => madeBy(attempt, check));
  if (checkAtWork() !== null) {
    throw new Error("Every attempt left on the record is taken at the end of a file, never from inside a check: name the check whose attempts to take.");
  }
  return takeWhere(() => true);
}

export const MAIN_FOLDER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function holdEachCheck(group, { aroundEach, vi }) {
  aroundEach(async (runTest, context) => {
    const check = { id: context.task.id, name: context.task.fullTestName ?? context.task.name };
    const fakeAlready = vi.isFakeTimers();
    await asCheck(check, runTest);
    if (!fakeAlready && vi.isFakeTimers()) vi.useRealTimers();
    const own = takeNetworkAttempts(check);
    if (own.length > 0) {
      throw new Error(networkMessage(group, "during", own.map((attempt) => attempt.address)));
    }
  });
}

export function networkMessage(group, place, addresses, check) {
  const tried = addresses.join(", ");
  const suite = group === "suite";
  const what = suite ? "the network" : "something other than the practice copy";
  const wayOn = suite
    ? "Two ways on: stand in for the request inside the check, as the seam's checks do with their in-memory stand-in; or, when the check needs a real database, name its file <module>.database.<topic>.test.ts and run it with npm run test:db (spec §19)."
    : "A database check reaches the practice copy alone; stand in for any other request inside the check.";
  const opening = {
    during: `This check tried to reach ${what}, which ${suite ? "a check in the suite" : "a database check"} may not do: ${tried}.`,
    outside: `Something in this file tried to reach ${what} outside any check, in a step before or after its checks or as the file loaded: ${tried}.`,
    late: `The check "${check ?? ""}" left something running that tried to reach ${what} after it had ended: ${tried}.`,
  }[place];
  return `${opening} Nothing was sent. ${wayOn}`;
}

export function leftoverMessages(group, attempts) {
  return messagesForLeftovers(group, leftovers(attempts));
}

export function messagesForLeftovers(group, left) {
  return left.map(({ check, addresses }) =>
    check === null ? networkMessage(group, "outside", addresses) : networkMessage(group, "late", addresses, check),
  );
}

export const NETWORK_NOTE = "compass.network";

export function leftovers(attempts) {
  const byMaker = new Map();
  for (const attempt of attempts) {
    const key = attempt.check === null ? "" : `check:${attempt.check.id}`;
    if (!byMaker.has(key)) byMaker.set(key, { check: attempt.check === null ? null : String(attempt.check.name ?? ""), addresses: [] });
    byMaker.get(key).addresses.push(attempt.address);
  }
  return [...byMaker.values()];
}

export function addressesSaid(addresses) {
  const times = new Map();
  for (const address of addresses) times.set(address, (times.get(address) ?? 0) + 1);
  return [...times].map(([address, count]) => (count > 1 ? `${address} (${count} times)` : address)).join(", ");
}

export function networkTroubles(file, note) {
  return note.left.map(({ check, addresses }) => ({
    file,
    what:
      check === null
        ? `a network attempt outside any check, nothing sent: ${addressesSaid(addresses)}`
        : `a network attempt left running by "${cutName(check)}", nothing sent: ${addressesSaid(addresses)}`,
  }));
}

function isOnThisMachine(origin) {
  return typeof origin === "string" && /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);
}

function isAt(address, origin) {
  if (typeof address !== "string" || !address.startsWith(origin)) return false;
  const next = address.charAt(origin.length);
  if (next !== "" && next !== "/" && next !== "?" && next !== "#") return false;
  try {
    const asked = new URL(address);
    return !asked.username && !asked.password && asked.origin === origin;
  } catch {
    return false;
  }
}

function pathOf(address) {
  try {
    return new URL(address).pathname;
  } catch {
    return "";
  }
}

export function allowOnlyPracticeCopy(scope, candidate, settings) {
  const places = placesOf(scope);
  const verdict = judgeAddress(candidate, settings);
  if (!verdict.ok) {
    for (const place of places) switchOff(place);
    throw new PracticeRefusal("address", `The database checks reach the practice copy and nothing else. ${verdict.reason}`);
  }

  const ours = [settings.address, settings.inbox].filter(isOnThisMachine);
  for (const place of places) {
    if (place[GUARDED] === settings.address) continue;
    const former = place.fetch;

    const guardedFetch = (...args) => {
      const address = addressOf(args[0]);
      const at = ours.find((origin) => isAt(address, origin));
      if (!at || typeof former !== "function") return refusedFetch(args[0]);
      if (at === settings.address && pathOf(address).startsWith("/rest/v1/")) {
        const init = args[1];
        sent().push({
          method: String(init?.method ?? args[0]?.method ?? "GET").toUpperCase(),
          address,
          body: typeof init?.body === "string" ? init.body : null,
        });
      }
      return former.apply(place, args);
    };

    setDirectly(place, "fetch", guardedFetch);
    setDirectly(place, "WebSocket", RefusedWebSocket);
    setDirectly(place, "XMLHttpRequest", RefusedXMLHttpRequest);
    mark(place, GUARDED, settings.address);
  }
}

export const KEPT_BROWSER_FILES = Object.freeze({
  "browser/false-on-purpose.browser.ts": "BROWSER_FALSE_CHECK",
  "browser/second-try-on-purpose.browser.ts": "BROWSER_SECOND_TRY_CHECK",
});

export function browserFilesNamed(names, available) {
  const files = [];
  const without = [];
  for (const name of names) {
    const typed = String(name);
    const matched = typed === "" ? [] : available.filter((file) => file.includes(typed));
    if (matched.length === 0) without.push(typed);
    for (const file of matched) if (!files.includes(file)) files.push(file);
  }
  return { files, without };
}

// eslint-disable-next-line no-control-regex
const COLOUR_CODES = /\u001b\[[0-9;]*m/g;

export function readBrowserReport(report, root, exitCode) {
  const rootDir = typeof report?.config?.rootDir === "string" ? report.config.rootDir : root;
  const fromRoot = (where) => path.relative(root, path.resolve(rootDir, String(where))).split(path.sep).join("/");
  const attached = (result, name) => {
    const found = (result?.attachments ?? []).find((one) => one?.name === name && typeof one.path === "string");
    return found ? path.relative(root, path.resolve(rootDir, found.path)).split(path.sep).join("/") : undefined;
  };

  const checks = [];
  const walk = (suite, titles) => {
    for (const spec of suite?.specs ?? []) {
      for (const test of spec?.tests ?? []) {
        const ran = (test?.results ?? []).filter((result) => result?.status !== "skipped");
        if (ran.length === 0) continue;
        const last = ran[ran.length - 1];
        const passed = last.status === "passed";
        // Tried again only when its own first try failed. A journey runs its stops in order,
        // so a retry walks every stop again: a stop that passed on the first try and failed
        // on the rerun was not tried again for itself, and has no first failure to show.
        const triedAgain = ran.length > 1 && ran[0].status !== "passed";
        const check = {
          name: [...titles, String(spec.title ?? "")].join(" > "),
          file: fromRoot(spec.file ?? suite.file ?? ""),
          passed,
          tries: triedAgain ? ran.length : 1,
          line: Number.isInteger(spec.line) ? spec.line : 0,
        };
        if (!passed) {
          const picture = attached(last, "screenshot");
          const recording = attached(last, "video");
          if (picture) check.picture = picture;
          if (recording) check.recording = recording;
        }
        if (triedAgain) {
          const picture = attached(ran[0], "screenshot");
          if (picture) check.firstFailurePicture = picture;
        }
        checks.push(check);
      }
    }
    for (const inner of suite?.suites ?? []) walk(inner, [...titles, String(inner.title ?? "")]);
  };
  for (const file of report?.suites ?? []) walk(file, []);

  const troubles = (report?.errors ?? []).map((error) => ({
    file: typeof error?.location?.file === "string" ? fromRoot(error.location.file) : "",
    what: `something went wrong outside the checks: ${firstLineOf(String(error?.message ?? error?.value ?? "").replace(COLOUR_CODES, "").trim())}`,
  }));

  return { checks, troubles, runnerFailed: exitCode !== 0 };
}
