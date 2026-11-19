import fs from "node:fs";
import path from "node:path";
import {
  KEPT_BROWSER_FILES, LEFT_BEHIND_MARKER, MAIN_FOLDER, PracticeRefusal, browserFilesNamed, cutName, judgeAddress, judgeApplied, judgeReplay,
  judgeRolledBackCheck, pickPublicValues, refuseUnlessChecksFolderIsWhole, troubleNobodyNamed,
} from "./lib.mjs";

const PARTS_NOT_STARTED = [
  "studio", "storage-api", "imgproxy", "realtime", "edge-runtime", "logflare", "vector", "postgres-meta", "supavisor",
];

const APPLIED_QUESTION =
  "select 'applied:' || coalesce(string_agg(version || '_' || name, ',' order by version), '') as answer " +
  "from supabase_migrations.schema_migrations";

const ROWS_QUESTION =
  "select 'rows:' || (select count(*) from auth.users)" +
  ["projects", "phases", "learning_items", "thought_groups", "daily_tasks", "thoughts", "time_sessions"]
    .map((table) => ` || ',' || (select count(*) from public.${table})`)
    .join("") +
  " as answer";

function refuseWhenLinked(around) {
  if (around.linked) {
    throw new PracticeRefusal(
      "linked",
      "The repository's Supabase folder is linked to a hosted project, so a practice command could reach the live project. Unlink it first (supabase unlink); the practice copy is never linked.",
    );
  }
}

function refuseUnlessReplayed(answer, what) {
  const { replayed, failed } = judgeReplay(answer);
  if (replayed) return;
  if (failed) {
    throw new PracticeRefusal("replay", `The migration ${failed} could not replay, so the practice copy was not ${what}. Nothing else was done.`);
  }
  throw new PracticeRefusal("tool", `The Supabase tool could not start its work (it ended with ${answer.code}), so the practice copy was not ${what}. Is Docker running?`);
}

const HOW_TO_REMAKE = "Remake the practice copy with: npm run practice:reset";

async function countRows(around) {
  const answer = await around.tool(["db", "query", "--local", ROWS_QUESTION]);
  const found = answer.code === 0 ? String(answer.text).match(/rows:([0-9,]+)/) : null;
  return found ? found[1] : null;
}

async function sendWhenReady(around, address, init) {
  let last;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const answer = await around.request(address, init);
      if (![502, 503, 504].includes(answer.status)) return answer;
      last = new Error(`the sign-in service answered ${answer.status}`);
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new PracticeRefusal("tool", `The practice copy's sign-in did not answer in time (${last instanceof Error ? last.message : "no answer"}).`);
}

function secondsSince(began) {
  return Math.round((Date.now() - began) / 100) / 10;
}

export async function findPracticeCopy(around) {
  refuseWhenLinked(around);
  const answer = await around.tool(["status", "-o", "json"]);
  return pickPublicValues(answer, around.settings);
}

export async function makeAccounts(around, where, accounts) {
  const verdict = judgeAddress(where?.address, around.settings);
  if (!verdict.ok) {
    throw new PracticeRefusal("address", `The practice accounts are made at the practice copy and nowhere else. ${verdict.reason}`);
  }
  const signUp = `${around.settings.address}/auth/v1/signup`;
  for (const account of accounts) {
    const answer = await sendWhenReady(around, signUp, {
      method: "POST",
      headers: { apikey: where.publicKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: account.email, password: account.password }),
    });
    if (answer.status === 200) continue;
    if (answer.status === 400 || answer.status === 422) {
      let said;
      try { said = await answer.text(); } catch { said = ""; }
      if (/already/i.test(said)) continue;
    }
    throw new PracticeRefusal("tool", `The practice account ${account.email} could not be made: the sign-up answered ${answer.status}.`);
  }
}

export async function bringUp(around, accounts) {
  refuseWhenLinked(around);
  const began = Date.now();
  const started = await around.tool(["start", "-x", PARTS_NOT_STARTED.join(",")]);
  refuseUnlessReplayed(started, "brought up");
  const where = await findPracticeCopy(around);
  await makeAccounts(around, where, accounts);
  const seconds = secondsSince(began);
  around.say(`The practice copy is up at ${where.address}, its inbox at ${where.inbox} (${seconds} s).`);
  return { address: where.address, seconds };
}

export async function remake(around, accounts) {
  const began = Date.now();
  const where = await findPracticeCopy(around);
  const reset = await around.tool(["db", "reset"]);
  refuseUnlessReplayed(reset, "remade");
  await makeAccounts(around, where, accounts);
  const seconds = secondsSince(began);
  around.say(`The practice copy's database was remade from nothing, every migration replayed (${seconds} s).`);
  return { seconds };
}

export async function throwAway(around) {
  refuseWhenLinked(around);
  const stopped = await around.tool(["stop", "--no-backup"]);
  if (stopped.code !== 0) {
    throw new PracticeRefusal("tool", `The Supabase tool could not throw the practice copy away (it ended with ${stopped.code}).`);
  }
  around.say("The practice copy was thrown away, data included.");
}

export async function prepareDatabaseRun(around, migrationFiles, folder) {
  if (folder !== undefined) refuseUnlessChecksFolderIsWhole(folder);
  const where = await findPracticeCopy(around);
  const answer = await around.tool(["db", "query", "--local", APPLIED_QUESTION]);
  const found = answer.code === 0 ? String(answer.text).match(/applied:([A-Za-z0-9_.,-]*)/) : null;
  if (!found) {
    throw new PracticeRefusal("tool", "The practice copy could not be asked which migrations it replayed.");
  }
  const applied = found[1].split(",").filter(Boolean);
  const verdict = judgeApplied(applied, migrationFiles);
  if (!verdict.ok) {
    throw new PracticeRefusal("stale", `The practice copy does not hold the committed migrations. ${verdict.reason} Remake it with: npm run practice:reset`);
  }
  return where;
}

export async function runRolledBackChecks(around, files, folder) {
  if (folder !== undefined) refuseUnlessChecksFolderIsWhole(folder);
  await findPracticeCopy(around);
  const checks = [];
  for (const file of files) {
    const before = await countRows(around);
    const answer = await around.tool(["db", "query", "--local", "-f", file]);
    const after = await countRows(around);
    let { held, message } = judgeRolledBackCheck(answer);
    let leftRows = false;
    if (before === null || after === null) {
      held = false;
      message = `${message} The rows could not be counted, so nothing shows whether any remained.`;
    } else if (before !== after) {
      held = false;
      leftRows = true;
      message = `Rows were left behind: the counts before the check (${before}) and after it (${after}) differ. ${HOW_TO_REMAKE}. The check said: ${message}`;
    } else if (answer?.code === 0) {
      message = `${message} The row totals are the same before and after it. ${HOW_TO_REMAKE}`;
    }
    checks.push({ file, held, message });
    const line = held ? `held         ${file} — ${message}` : `did not hold ${file} — ${message}`;
    around.say(leftRows ? `${LEFT_BEHIND_MARKER}  ${line}` : line);
  }
  const failed = checks.filter((check) => !check.held).length;
  around.say(
    failed === 0
      ? `Every check held (${checks.length} of ${checks.length}), and the practice copy holds the same rows as before.`
      : `${failed} of ${checks.length} checks did not hold.`,
  );
  return { held: failed === 0, checks };
}

export async function startPracticeApp(around, startServer) {
  const where = await findPracticeCopy(around);
  const serveAt = around.settings.app;
  const server = await startTheAppAt(where, serveAt, startServer);
  around.say(`The practice app is at ${serveAt}, pointed at the practice copy at ${where.address}.`);
  return { address: serveAt, close: server.close };
}

async function startTheAppAt(where, serveAt, startServer) {
  try {
    return await startServer(
      { supabaseUrl: where.address, supabaseKey: where.publicKey, turnstileSiteKey: "" },
      serveAt,
    );
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    if (/in use|EADDRINUSE|taken/i.test(why)) {
      throw new PracticeRefusal("taken", `The practice app's address, ${serveAt}, is taken by something else. The practice app never moves to another address and never uses an app already running; free the address and start it again.`);
    }
    throw new PracticeRefusal("tool", `The practice app could not start at ${serveAt}.`);
  }
}

/** After about half a minute in which nothing asked it anything, the data interface
 *  refuses a session just issued, for an instant ("JWT issued at future"). */
export function keepAwake(around, where, everyMs = 10_000) {
  const verdict = judgeAddress(where?.address, around.settings);
  if (!verdict.ok) {
    throw new PracticeRefusal("address", `Only the practice copy is kept awake. ${verdict.reason}`);
  }
  const question = `${around.settings.address}/rest/v1/projects?select=id&limit=1`;
  const ask = () => {
    try {
      Promise.resolve(around.request(question, { headers: { apikey: where.publicKey } })).catch(() => {});
    } catch { /* forgotten */ }
  };
  ask();
  const timer = setInterval(ask, everyMs);
  if (typeof timer.unref === "function") timer.unref();
  return { stop: () => clearInterval(timer) };
}

export async function runDatabaseChecks(around, migrationFiles, runTests, options) {
  const where = await prepareDatabaseRun(around, migrationFiles);

  const secondTry = options?.secondTry === true;
  let report;
  try {
    report = await runTests(where, { secondTry });
  } catch (error) {
    if (error instanceof PracticeRefusal) throw error;
    throw new PracticeRefusal("tool", `The database checks could not be run: ${firstLineOf(error)}`);
  }
  const reports = Array.isArray(report) ? report : Array.isArray(report?.checks) ? report.checks : [];
  const reported = !Array.isArray(report) && Array.isArray(report?.troubles) ? report.troubles : [];
  const switchedOff = !Array.isArray(report) && Array.isArray(report?.switchedOff) ? report.switchedOff : [];

  const runnerFailed = !Array.isArray(report) && report?.runnerFailed === true;
  const unnamed = troubleNobodyNamed(runnerFailed ? "failed" : "passed", reports, reported);
  const troubles = unnamed ? [...reported, unnamed] : reported;

  const failedChecks = reports.filter((check) => !check.passed);
  const triedTwiceChecks = reports.filter((check) => check.tries > 1);
  const failed = failedChecks.map((check) => check.name);
  const triedTwice = triedTwiceChecks.map((check) => check.name);
  const notProven = troubles.map((trouble) => String(trouble?.file ?? ""));
  for (const check of failedChecks) around.say(`failed      ${aboutACheck(check)}`);
  for (const check of triedTwiceChecks) around.say(`second try  ${aboutACheck(check)}`);
  for (const check of switchedOff) around.say(`switched off  ${aboutACheck(check)}`);
  troubles.forEach((trouble, at) => {
    const what = String(trouble?.what ?? "").trim() || "the test runner gave no reason";
    around.say(`not proven  ${notProven[at] ? `${notProven[at]}: ` : ""}${what}`);
  });

  const ran = reports.length;
  const end = switchedOff.length > 0 ? `; ${switchedOff.length} switched off.` : ".";
  if (troubles.length > 0) {
    const ofTheChecks = ran === 0 ? "no check ran" : `${failed.length} of ${ran} database checks that ran failed`;
    around.say(`The run did not pass: ${troubles.length} not proven, and ${ofTheChecks}${end}`);
  } else if (ran === 0) {
    around.say(`No database check ran, so nothing was proven${end}`);
  } else if (failed.length === 0) {
    around.say(`Every database check${switchedOff.length > 0 ? " that ran" : ""} passed (${ran} of ${ran})${end}`);
  } else {
    around.say(`${failed.length} of ${ran} database checks failed${end}`);
  }
  return {
    passed: ran > 0 && failed.length === 0 && troubles.length === 0,
    ran,
    failed,
    secondTry: triedTwice,
    notProven,
  };
}

function aboutACheck(check) {
  const file = String(check?.file ?? "");
  const line = Number.isInteger(check?.line) && check.line > 0 ? `:${check.line}` : "";
  const name = cutName(String(check?.name ?? ""));
  const { nth, of } = check?.turn ?? {};
  const turn = Number.isInteger(nth) && Number.isInteger(of) && nth >= 1 && of >= nth ? ` (${nth} of ${of} at this line)` : "";
  return `${file ? `${file}${line}  ` : ""}${name}${turn}`;
}

function firstLineOf(error) {
  const said = error instanceof Error ? error.message.split("\n")[0].trim() : "";
  return said === "" ? "the test runner gave no reason" : said;
}

const ENDS_WITH_A_LINE_NUMBER = /:\d+(?:[:-]\d+)?$/;

export async function refuseNamesWithoutAFile(names, filesNamed) {
  const without = [];
  for (const name of names ?? []) {
    if (ENDS_WITH_A_LINE_NUMBER.test(String(name))) {
      without.push(String(name));
      continue;
    }
    let files;
    try {
      files = await filesNamed(name);
    } catch (error) {
      if (error instanceof PracticeRefusal) throw error;
      throw new PracticeRefusal("tool", `The database check files could not be listed: ${firstLineOf(error)}`);
    }
    if (!Array.isArray(files) || files.length === 0) without.push(String(name));
  }
  if (without.length === 0) return;

  const which = without.length === 1 ? `the name "${without[0]}"` : `these names: ${without.map((name) => `"${name}"`).join(", ")}`;
  const hint = without.some((name) => ENDS_WITH_A_LINE_NUMBER.test(name)) ? " A name is a file's name: leave out the line number." : "";
  throw new PracticeRefusal("no-match", `No database check file matches ${which}.${hint} No check was run.`);
}

export async function runBrowserChecks(around, startServer, runJourneys, options) {
  const secondTry = options?.secondTry === true;
  const names = Array.isArray(options?.files) ? options.files.map(String) : [];

  let files = [];
  if (names.length > 0) {
    const named = browserFilesNamed(names, journeyFiles());
    if (named.without.length > 0) {
      const which = named.without.length === 1
        ? `the name "${named.without[0]}"`
        : `these names: ${named.without.map((name) => `"${name}"`).join(", ")}`;
      throw new PracticeRefusal("no-match", `No browser check file matches ${which}. No check was run.`);
    }
    files = named.files;
  }

  const where = await findPracticeCopy(around);
  const app = around.settings.app;
  const server = await startTheAppAt(where, app, startServer);

  let report;
  try {
    report = await runJourneys({ app, inbox: where.inbox }, { secondTry, files });
  } catch (error) {
    await closeQuietly(server);
    if (error instanceof PracticeRefusal) throw error;
    throw new PracticeRefusal("tool", `The browser checks could not be run: ${firstLineOf(error)}`);
  }
  await closeQuietly(server);

  const reports = Array.isArray(report?.checks) ? report.checks : [];
  const reported = Array.isArray(report?.troubles) ? report.troubles : [];
  const unnamed = troubleNobodyNamed(report?.runnerFailed === true ? "failed" : "passed", reports, reported);
  const troubles = unnamed ? [...reported, unnamed] : reported;

  const failedChecks = reports.filter((check) => !check.passed);
  const triedTwiceChecks = reports.filter((check) => check.tries > 1);
  const notProven = troubles.map((trouble) => String(trouble?.file ?? ""));
  for (const check of failedChecks) {
    const look = [check.picture ? `picture ${check.picture}` : "", check.recording ? `recording ${check.recording}` : ""]
      .filter(Boolean)
      .join(", ");
    around.say(`failed      ${aboutACheck(check)} — ${look || "no picture was kept"}`);
  }
  for (const check of triedTwiceChecks) {
    const look = check.firstFailurePicture ? ` — picture of its first failure ${check.firstFailurePicture}` : "";
    around.say(`second try  ${aboutACheck(check)}${look}`);
  }
  troubles.forEach((trouble, at) => {
    const what = String(trouble?.what ?? "").trim() || "the browser's runner gave no reason";
    around.say(`not proven  ${notProven[at] ? `${notProven[at]}: ` : ""}${what}`);
  });

  const ran = reports.length;
  const failed = failedChecks.map((check) => check.name);
  if (troubles.length > 0) {
    const ofTheChecks = ran === 0 ? "no check ran" : `${failed.length} of ${ran} browser checks that ran failed`;
    around.say(`The run did not pass: ${troubles.length} not proven, and ${ofTheChecks}.`);
  } else if (ran === 0) {
    around.say("No browser check ran, so nothing was proven.");
  } else if (failed.length === 0) {
    around.say(`Every browser check passed (${ran} of ${ran}).`);
  } else {
    around.say(`${failed.length} of ${ran} browser checks failed.`);
  }
  return {
    passed: ran > 0 && failed.length === 0 && troubles.length === 0,
    ran,
    failed,
    secondTry: triedTwiceChecks.map((check) => check.name),
    notProven,
  };
}

function journeyFiles() {
  let found;
  try {
    found = fs.readdirSync(path.join(MAIN_FOLDER, "browser"), { recursive: true });
  } catch {
    return [];
  }
  return found
    .map((name) => `browser/${String(name).split(path.sep).join("/")}`)
    .filter((file) => file.endsWith(".browser.ts") && !file.startsWith("browser/results/"))
    .filter((file) => !(file in KEPT_BROWSER_FILES) || process.env[KEPT_BROWSER_FILES[file]] === "1")
    .sort();
}

async function closeQuietly(server) {
  try {
    await server.close();
  } catch {
    /* the run's answer stands */
  }
}
