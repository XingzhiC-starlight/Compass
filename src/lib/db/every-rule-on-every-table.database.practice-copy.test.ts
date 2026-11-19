import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  addLearningItem,
  addPhase,
  addTask,
  addThought,
  deleteProject,
  getProjectDashboardData,
  groupThoughts,
  removeLearningItem,
  removePhase,
  removeTask,
  removeThought,
  renameLearningItem,
  renamePhase,
  renameProject,
  renameThoughtGroup,
  saveInterview,
  setActiveProject,
  setLoggedSecondsForDate,
  startSession,
  stopSession,
  todayDate,
  updateTask,
  updateThought,
} from "../db";
import {
  forgetRequestsSent,
  requestsSent,
  signedInConnection,
  signedOutConnection,
  signInAsPractice,
  signOutOfPractice,
  type PracticeAccountName,
} from "../practiceCopy";
import { localYMD } from "../transforms";
import type { User } from "../types";

const randomUUID = (): string => crypto.randomUUID();

const CHECK_READ =
  "With the practice copy up, the database command shows, for each of the seven tables, that the account that owns a row reads it, and that the other practice account and someone not signed in each read none of that account's rows";
const CHECK_CHANGE =
  "With the practice copy up, for each of the seven tables, a change and a delete of one account's row by the other practice account, and by someone not signed in, leave the row as it was; the owning account's own change and delete of a row of the same kind take effect";
const CHECK_NO_OTHER_OWNER =
  "With the practice copy up, for each of the seven tables, an account cannot save a row that names the other practice account as its owner, nor change its own row to name the other account; someone not signed in saves no row; nothing of a refused row is kept";
const CHECK_STAMP =
  "With the practice copy up, a row of each of the seven tables, added the way the app adds it, names the signed-in account as its owner, though nothing the app sent named one";
const CHECK_LIMITS =
  "With the practice copy up, the database refuses, and keeps nothing of, each value one past a limit spec §3 declares, and keeps the value at the limit: every name and title at 201 characters against 200, a task's and a thought's text at 4001 against 4000, an accent at 33 against 32, a progress of −1 and of 101 against 0 and 100, and each count of days, hours and seconds at −1 against 0";
const CHECK_WHOLE =
  "With the practice copy up, each whole-number count a person enters — a project's length in days, a phase's days, a progress, a day's logged seconds — refuses a fraction and keeps nothing of it, and keeps a whole number";
const CHECK_PROJECT_DELETE =
  "With the practice copy up, deleting one account's project leaves the other account's projects and rows as they were";
const CHECK_LINKS =
  "With the practice copy up, deleting a phase or a learning item that a task links to leaves the task in place with that link cleared, and deleting a thought group on its own leaves its thoughts in place, in no group";
const CHECK_ONE_PROJECT =
  "With the practice copy up and two projects of one account holding rows of every kind, with the same dates and places, the dashboard's read of one project hands back that project's rows only; a task, a learning item and a thought added to it are numbered from its own rows alone; making a group in it moves only its own thoughts and groups; and changing or deleting one of its rows changes no other row";

const TABLES = ["projects", "phases", "learning_items", "daily_tasks", "thoughts", "thought_groups", "time_sessions"] as const;
type Table = (typeof TABLES)[number];
type Row = Record<string, unknown>;

const CHANGE: Record<Table, Row> = {
  projects: { name: "Changed made-up project" },
  phases: { name: "Changed made-up phase" },
  learning_items: { name: "Changed made-up skill" },
  daily_tasks: { text: "Changed made-up task" },
  thoughts: { text: "Changed made-up thought" },
  thought_groups: { name: "Changed made-up group" },
  time_sessions: { duration_seconds: 999 },
};

function rowFor(table: Table, projectId: string, label: string): Row {
  const today = todayDate();
  switch (table) {
    case "projects":
      return {
        name: label,
        accent_color: "#7FB069",
        sort_order: 900,
        archived_at: null,
        total_days: 10,
        hours_planned_per_day: 2,
        hours_available_per_day: 3,
        started_at: today,
      };
    case "phases":
      return { project_id: projectId, name: label, est_days: 2, sort_order: 900, is_done: false, completed_at: null };
    case "learning_items":
      return { project_id: projectId, name: label, sort_order: 900, progress_pct: 20, is_focus: false };
    case "daily_tasks":
      return {
        project_id: projectId,
        text: label,
        is_done: false,
        sort_order: 900,
        task_date: today,
        phase_id: null,
        learning_item_id: null,
      };
    case "thoughts":
      return { project_id: projectId, title: null, text: label, sort_order: 900, group_id: null };
    case "thought_groups":
      return { project_id: projectId, name: label, sort_order: 900 };
    case "time_sessions": {
      const end = new Date();
      const start = new Date(end.getTime() - 60_000);
      return {
        project_id: projectId,
        started_at: start.toISOString(),
        ended_at: end.toISOString(),
        duration_seconds: 60,
        session_date: localYMD(start),
      };
    }
  }
}

const accounts: Partial<Record<PracticeAccountName, User>> = {};
let signedIn: PracticeAccountName | null = null;
const made: Record<PracticeAccountName, Set<string>> = { a: new Set(), b: new Set() };
const base: Partial<Record<PracticeAccountName, string>> = {};

const A = (): User => accounts.a!;
const B = (): User => accounts.b!;

async function as(which: PracticeAccountName): Promise<SupabaseClient> {
  accounts[which] = await signInAsPractice(which);
  signedIn = which;
  return signedInConnection();
}

async function signedOut(): Promise<SupabaseClient> {
  signedIn = null;
  let connection: SupabaseClient | undefined;
  let failure: unknown;
  try {
    connection = await signedOutConnection();
  } catch (error) {
    failure = error;
  }
  expect(failure, "harness: a connection for someone not signed in was handed over").toBeUndefined();
  return connection!;
}

function remember(table: string, id: string): void {
  if (table === "projects" && signedIn) made[signedIn].add(id);
}

async function insertOwn(table: Table, projectId: string, label: string, extra: Row = {}): Promise<string> {
  const id = randomUUID();
  remember(table, id);
  const { error } = await signedInConnection()
    .from(table)
    .insert({ id, ...rowFor(table, projectId, label), ...extra });
  expect(error, `harness: the signed-in account saved its own row of ${table}`).toBeNull();
  return id;
}

async function readRow(table: string, id: string, connection: SupabaseClient = signedInConnection()): Promise<Row[]> {
  const { data, error } = await connection.from(table).select("*").eq("id", id);
  expect(error, `harness: the read of ${table} was answered`).toBeNull();
  return (data ?? []) as Row[];
}

async function rowsInProject(table: Table, projectId: string): Promise<Row[]> {
  const column = table === "projects" ? "id" : "project_id";
  const { data, error } = await signedInConnection().from(table).select("*").eq(column, projectId).order("id");
  expect(error, `harness: the read of ${table} was answered`).toBeNull();
  return (data ?? []) as Row[];
}

async function makeProject(label: string, phases: string[], skills: string[]): Promise<string> {
  const setupId = randomUUID();
  remember("projects", setupId);
  const project = await saveInterview({
    setupId,
    projectName: label,
    totalDays: 30,
    hoursPlannedPerDay: 2,
    hoursAvailablePerDay: 3,
    phases: phases.map((name) => ({ name, estDays: 3 })),
    learn: skills.map((name) => ({ name, level: 30 })),
  });
  expect(project.id, "harness: the project was saved").toBe(setupId);
  return setupId;
}

async function makeFullProject(label: string): Promise<string> {
  const projectId = await makeProject(label, ["A made-up phase", "Another made-up phase"], ["A made-up skill", "Another made-up skill"]);
  await setActiveProject(projectId);
  await addTask("A made-up task");
  await addThought("A made-up loose thought");
  const second = await addThought("A made-up thought to group");
  const third = await addThought("Another made-up thought to group");
  const grouped = await groupThoughts([second.id, third.id], "A made-up group");
  expect(grouped, "harness: the group was made").not.toBeNull();
  await setLoggedSecondsForDate(todayDate(), 1800);
  for (const table of TABLES) {
    expect((await rowsInProject(table, projectId)).length, `harness: the project holds a row of ${table}`).toBeGreaterThan(0);
  }
  return projectId;
}

async function everyRowOfMine(): Promise<Record<string, Row[]>> {
  const all: Record<string, Row[]> = {};
  for (const table of TABLES) {
    const { data, error } = await signedInConnection().from(table).select("*").order("id");
    expect(error, `harness: the read of ${table} was answered`).toBeNull();
    all[table] = (data ?? []) as Row[];
  }
  return all;
}

beforeAll(async () => {
  await as("b");
  base.b = await makeProject("the other account's own project", ["A made-up phase"], ["A made-up skill"]);
  await as("a");
  base.a = await makeProject("the first account's own project", ["A made-up phase"], ["A made-up skill"]);
});

afterAll(async () => {
  const leftBehind: string[] = [];
  try {
    for (const which of ["a", "b"] as const) {
      const ids = [...made[which]];
      if (ids.length === 0) continue;
      const connection = await as(which);
      const { error } = await connection.from("projects").delete().in("id", ids);
      const { data: remaining, error: readError } = await connection.from("projects").select("id").in("id", ids);
      if (error || readError || (remaining ?? []).length > 0) {
        const what = error ? `the delete was refused (${error.code})` : readError ? `what remained could not be read (${readError.code})` : `${remaining!.length} of the ${ids.length} projects this file made remain`;
        leftBehind.push(`practice account ${which}: ${what}`);
      }
    }
  } finally {
    await signOutOfPractice();
  }
  if (leftBehind.length > 0) {
    throw new Error(`The projects this file made were not all deleted — ${leftBehind.join("; ")}. Remake the practice copy with: npm run practice:reset`);
  }
});

describe("every table's rows are read by their owner alone, on the practice copy", () => {
  for (const table of TABLES) {
    it(`${CHECK_READ} — ${table}`, async () => {
      await as("a");
      const owned = await insertOwn(table, base.a!, "read by its owner");
      expect(
        (await readRow(table, owned)).map((row) => row.id),
        "the account that owns the row reads it",
      ).toEqual([owned]);

      const asB = await as("b");
      const bOwn = await insertOwn(table, base.b!, "the other account's own");
      expect((await readRow(table, bOwn)).map((row) => row.id), "harness: the other account reads its own row").toEqual([bOwn]);
      expect(await readRow(table, owned), "the other practice account reads none of it, asked by its id").toEqual([]);
      const { data: bByOwner, error: bError } = await asB.from(table).select("id").eq("user_id", A().id);
      expect(bError, "harness: the read was answered").toBeNull();
      expect(bByOwner ?? [], "the other practice account reads none of the first account's rows").toEqual([]);

      const anon = await signedOut();
      expect(await readRow(table, owned, anon), "someone not signed in reads none of it, asked by its id").toEqual([]);
      const { data: anonByOwner, error: anonError } = await anon.from(table).select("id").eq("user_id", A().id);
      expect(anonError, "harness: the read was answered").toBeNull();
      expect(anonByOwner ?? [], "someone not signed in reads none of the first account's rows").toEqual([]);
    });
  }
});

describe("every table's rows are changed and deleted by their owner alone, on the practice copy", () => {
  for (const table of TABLES) {
    it(`${CHECK_CHANGE} — ${table}`, async () => {
      await as("a");
      const target = await insertOwn(table, base.a!, "left as it was");
      const before = await readRow(table, target);
      expect(before.length, "harness: the row is there").toBe(1);

      const asB = await as("b");
      await asB.from(table).update(CHANGE[table]).eq("id", target);
      await asB.from(table).delete().eq("id", target);

      const anon = await signedOut();
      await anon.from(table).update(CHANGE[table]).eq("id", target);
      await anon.from(table).delete().eq("id", target);

      await as("a");
      expect(await readRow(table, target), "the row is as it was, after the other account and someone not signed in tried").toEqual(before);

      const own = await insertOwn(table, base.a!, "changed and deleted by its owner");
      const { error: changeError } = await signedInConnection().from(table).update(CHANGE[table]).eq("id", own);
      expect(changeError, "the owner's change was answered without an error").toBeNull();
      expect((await readRow(table, own))[0], "the owner's own change took effect").toMatchObject(CHANGE[table]);
      const { error: deleteError } = await signedInConnection().from(table).delete().eq("id", own);
      expect(deleteError, "the owner's delete was answered without an error").toBeNull();
      expect(await readRow(table, own), "the owner's own delete took effect").toEqual([]);
    });
  }
});

describe("no row names another owner, on the practice copy", () => {
  for (const table of TABLES) {
    it(`${CHECK_NO_OTHER_OWNER} — ${table}`, async () => {
      const asA = await as("a");

      const naming = randomUUID();
      remember(table, naming);
      // It is sent as the seam sends some of its adds, asking nothing back, so only that owner
      // check refuses it.
      const saved = await asA
        .from(table)
        .insert({ id: naming, ...rowFor(table, base.a!, "names the other account"), user_id: B().id });
      expect(saved.error?.code, "a row naming the other account as its owner is refused").toBe("42501");
      expect(saved.data, "and nothing of it is handed back").toBeNull();

      const own = await insertOwn(table, base.a!, "its own, kept as it was");
      const before = await readRow(table, own);
      const changed = await asA.from(table).update({ user_id: B().id }).eq("id", own).select();
      expect(changed.error?.code, "a change of its own row to name the other account is refused").toBe("42501");
      expect(await readRow(table, own), "and the row is as it was, its owner still the first account").toEqual(before);
      expect(before[0]?.user_id, "harness: the row names the first account").toBe(A().id);

      const anonymous = randomUUID();
      const anon = await signedOut();
      const anonSaved = await anon.from(table).insert({ id: anonymous, ...rowFor(table, base.a!, "saved by someone not signed in") });
      expect(anonSaved.error?.code, "someone not signed in saves no row").toBe("42501");

      await as("a");
      expect(await readRow(table, naming), "nothing of the row naming the other account is kept, as the first account reads").toEqual([]);
      expect(await readRow(table, anonymous), "nothing of the row someone not signed in sent is kept, as the first account reads").toEqual([]);
      await as("b");
      expect(await readRow(table, naming), "nothing of the row naming the other account is kept, as the other account reads").toEqual([]);
      expect(await readRow(table, anonymous), "nothing of the row someone not signed in sent is kept, as the other account reads").toEqual([]);
    });
  }
});

function bodiesSent(): string[] {
  return requestsSent()
    .map((request) => request.body)
    .filter((body): body is string => typeof body === "string" && body.length > 0);
}

function bodiesNamingAnOwner(ownerId: string): string[] {
  return bodiesSent().filter((body) => body.includes("user_id") || body.includes("userId") || body.includes(ownerId));
}

async function ownerOf(table: Table, id: string): Promise<unknown> {
  return (await readRow(table, id))[0]?.user_id;
}

describe("every table's added row is stamped with its account, on the practice copy", () => {
  it(`${CHECK_STAMP} — projects, saved by the setup`, async () => {
    await as("a");
    forgetRequestsSent();
    const projectId = await makeProject("stamped by the database", ["A made-up phase"], ["A made-up skill"]);

    expect(bodiesSent().length, "harness: the setup sent its save").toBeGreaterThan(0);
    expect(bodiesNamingAnOwner(A().id), "what the app sent names no owner").toEqual([]);
    expect(await ownerOf("projects", projectId), "the project names the signed-in account").toBe(A().id);
  });

  it(`${CHECK_STAMP} — phases, saved by the setup and added on the timeline`, async () => {
    await as("a");
    forgetRequestsSent();
    const projectId = await makeProject("its phases stamped", ["A made-up phase"], ["A made-up skill"]);
    await setActiveProject(projectId);
    const added = await addPhase("An added made-up phase");

    expect(bodiesNamingAnOwner(A().id), "what the app sent names no owner").toEqual([]);
    const phases = await rowsInProject("phases", projectId);
    expect(phases.map((row) => row.id), "harness: the setup's phase and the added one").toContain(added.id);
    expect(phases.length, "harness: the setup's phase and the added one").toBe(2);
    expect(
      phases.map((row) => row.user_id),
      "each phase names the signed-in account",
    ).toEqual(phases.map(() => A().id));
  });

  it(`${CHECK_STAMP} — learning_items, added on the learning card`, async () => {
    await as("a");
    await setActiveProject(base.a!);
    forgetRequestsSent();
    const item = await addLearningItem("An added made-up skill");

    expect(bodiesSent().length, "harness: the add was sent").toBeGreaterThan(0);
    expect(bodiesNamingAnOwner(A().id), "what the app sent names no owner").toEqual([]);
    expect(await ownerOf("learning_items", item.id), "the learning item names the signed-in account").toBe(A().id);
  });

  it(`${CHECK_STAMP} — daily_tasks, added on the task panel`, async () => {
    await as("a");
    await setActiveProject(base.a!);
    forgetRequestsSent();
    const task = await addTask("An added made-up task");

    expect(bodiesSent().length, "harness: the add was sent").toBeGreaterThan(0);
    expect(bodiesNamingAnOwner(A().id), "what the app sent names no owner").toEqual([]);
    expect(await ownerOf("daily_tasks", task.id), "the task names the signed-in account").toBe(A().id);
  });

  it(`${CHECK_STAMP} — thoughts, added to the thought log`, async () => {
    await as("a");
    await setActiveProject(base.a!);
    forgetRequestsSent();
    const thought = await addThought("An added made-up thought");

    expect(bodiesSent().length, "harness: the add was sent").toBeGreaterThan(0);
    expect(bodiesNamingAnOwner(A().id), "what the app sent names no owner").toEqual([]);
    expect(await ownerOf("thoughts", thought.id), "the thought names the signed-in account").toBe(A().id);
  });

  it(`${CHECK_STAMP} — thought_groups, made from two thoughts`, async () => {
    await as("a");
    await setActiveProject(base.a!);
    const first = await addThought("A made-up thought to group");
    const second = await addThought("Another made-up thought to group");
    forgetRequestsSent();
    const grouped = await groupThoughts([first.id, second.id], "A made-up stamped group");

    expect(grouped, "harness: the group was made").not.toBeNull();
    expect(bodiesNamingAnOwner(A().id), "what the app sent names no owner").toEqual([]);
    expect(await ownerOf("thought_groups", grouped!.group.id), "the group names the signed-in account").toBe(A().id);
  });

  it(`${CHECK_STAMP} — time_sessions, started on the clock and entered by hand`, async () => {
    await as("a");
    const projectId = await makeProject("its time stamped", ["A made-up phase"], ["A made-up skill"]);
    await setActiveProject(projectId);
    forgetRequestsSent();
    const started = await startSession();
    await stopSession();
    expect(started, "harness: a session was started").not.toBeNull();
    expect(await ownerOf("time_sessions", started!.id), "the started session names the signed-in account").toBe(A().id);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const day = localYMD(yesterday);
    await setLoggedSecondsForDate(day, 1500);

    expect(bodiesNamingAnOwner(A().id), "what the app sent names no owner").toEqual([]);
    const entered = (await rowsInProject("time_sessions", projectId)).filter((row) => row.session_date === day);
    expect(entered.length, "harness: the session entered by hand was saved").toBe(1);
    expect(entered[0]?.user_id, "the session entered by hand names the signed-in account").toBe(A().id);
  });
});

type Limit = { table: Table; column: string; kept: unknown[]; refused: unknown[] };

const LIMITS: Limit[] = [
  { table: "projects", column: "name", kept: ["n".repeat(200)], refused: ["n".repeat(201)] },
  { table: "phases", column: "name", kept: ["n".repeat(200)], refused: ["n".repeat(201)] },
  { table: "learning_items", column: "name", kept: ["n".repeat(200)], refused: ["n".repeat(201)] },
  { table: "thought_groups", column: "name", kept: ["n".repeat(200)], refused: ["n".repeat(201)] },
  { table: "thoughts", column: "title", kept: ["t".repeat(200)], refused: ["t".repeat(201)] },
  { table: "daily_tasks", column: "text", kept: ["x".repeat(4000)], refused: ["x".repeat(4001)] },
  { table: "thoughts", column: "text", kept: ["x".repeat(4000)], refused: ["x".repeat(4001)] },
  { table: "projects", column: "accent_color", kept: ["#".repeat(32)], refused: ["#".repeat(33)] },
  { table: "learning_items", column: "progress_pct", kept: [0, 100], refused: [-1, 101] },
  { table: "projects", column: "total_days", kept: [0], refused: [-1] },
  { table: "projects", column: "hours_planned_per_day", kept: [0], refused: [-1] },
  { table: "projects", column: "hours_available_per_day", kept: [0], refused: [-1] },
  { table: "phases", column: "est_days", kept: [0], refused: [-1] },
  { table: "time_sessions", column: "duration_seconds", kept: [0], refused: [-1] },
];

function shownValue(value: unknown): string {
  return typeof value === "string" ? `${value.length} characters` : String(value);
}

async function tryValue(table: Table, column: string, value: unknown): Promise<{ code: string | undefined; kept: Row[] }> {
  const id = randomUUID();
  remember(table, id);
  const { error } = await signedInConnection()
    .from(table)
    .insert({ id, ...rowFor(table, base.a!, `holds ${column} of ${shownValue(value)}`), [column]: value });
  return { code: error?.code, kept: await readRow(table, id) };
}

function sameValue(stored: unknown, value: unknown): unknown {
  return typeof value === "number" ? Number(stored) : stored;
}

describe("every declared limit, on the practice copy", () => {
  for (const limit of LIMITS) {
    it(`${CHECK_LIMITS} — ${limit.table}.${limit.column}: refuses ${limit.refused.map(shownValue).join(" and ")}, keeps ${limit.kept.map(shownValue).join(" and ")}`, async () => {
      await as("a");
      for (const value of limit.refused) {
        const outcome = await tryValue(limit.table, limit.column, value);
        expect(outcome.code, `${limit.table}.${limit.column} of ${shownValue(value)} is refused by a declared limit`).toBe("23514");
        expect(outcome.kept, `and nothing of it is kept`).toEqual([]);
      }
      for (const value of limit.kept) {
        const outcome = await tryValue(limit.table, limit.column, value);
        expect(outcome.code, `${limit.table}.${limit.column} of ${shownValue(value)} is accepted`).toBeUndefined();
        expect(outcome.kept.length, "and the row is kept").toBe(1);
        expect(sameValue(outcome.kept[0]?.[limit.column], value), "with the value at the limit, whole").toEqual(value);
      }
    });
  }
});

type Whole = { table: Table; column: string };

const WHOLE_NUMBERS: Whole[] = [
  { table: "projects", column: "total_days" },
  { table: "phases", column: "est_days" },
  { table: "learning_items", column: "progress_pct" },
  { table: "time_sessions", column: "duration_seconds" },
];

describe("every whole-number count, on the practice copy", () => {
  for (const whole of WHOLE_NUMBERS) {
    it(`${CHECK_WHOLE} — ${whole.table}.${whole.column}: refuses 2.5, keeps 3`, async () => {
      await as("a");
      const fraction = await tryValue(whole.table, whole.column, 2.5);
      expect(fraction.code, `${whole.table}.${whole.column} of 2.5 is refused as not a whole number`).toBe("22P02");
      expect(fraction.kept, "and nothing of it is kept").toEqual([]);

      const kept = await tryValue(whole.table, whole.column, 3);
      expect(kept.code, `${whole.table}.${whole.column} of 3 is accepted`).toBeUndefined();
      expect(kept.kept.length, "and the row is kept").toBe(1);
      expect(Number(kept.kept[0]?.[whole.column]), "with the whole number").toBe(3);
    });
  }
});

describe("deleting one account's project, on the practice copy", () => {
  it(`${CHECK_PROJECT_DELETE}`, async () => {
    await as("a");
    const deleted = await makeFullProject("deleted by its owner");
    await as("b");
    await makeFullProject("the other account's, left as it was");
    const before = await everyRowOfMine();
    for (const table of TABLES) {
      expect(before[table].length, `harness: the other account holds rows of ${table}`).toBeGreaterThan(0);
    }

    await as("a");
    await setActiveProject(deleted);
    await deleteProject(deleted);
    expect(await rowsInProject("projects", deleted), "harness: the first account's project is gone").toEqual([]);

    await as("b");
    expect(await everyRowOfMine(), "the other account's projects and rows, as they were").toEqual(before);
  });
});

describe("the links cleared when their target goes, on the practice copy", () => {
  it(`${CHECK_LINKS} — a phase and a learning item that a task links to`, async () => {
    const asA = await as("a");
    const projectId = await makeFullProject("its task's links cleared");
    const [phase] = await rowsInProject("phases", projectId);
    const skills = await rowsInProject("learning_items", projectId);
    const skill = skills.find((row) => row.is_focus === false) ?? skills[0];
    const [task] = await rowsInProject("daily_tasks", projectId);
    const linked = await asA.from("daily_tasks").update({ phase_id: phase.id, learning_item_id: skill.id }).eq("id", task.id).select();
    expect(linked.error, "harness: the task was linked to a phase and a learning item").toBeNull();
    const before = (await readRow("daily_tasks", String(task.id)))[0];

    await asA.from("phases").delete().eq("id", phase.id);
    expect(await readRow("phases", String(phase.id)), "harness: the phase is gone").toEqual([]);
    const afterPhase = await readRow("daily_tasks", String(task.id));
    expect(afterPhase.length, "the task is in place after its phase was deleted").toBe(1);
    expect(afterPhase[0], "with its phase link cleared, and the rest as it was").toEqual({ ...before, phase_id: null });

    await asA.from("learning_items").delete().eq("id", skill.id);
    expect(await readRow("learning_items", String(skill.id)), "harness: the learning item is gone").toEqual([]);
    const afterSkill = await readRow("daily_tasks", String(task.id));
    expect(afterSkill.length, "the task is in place after its learning item was deleted").toBe(1);
    expect(afterSkill[0], "with its learning item link cleared, and the rest as it was").toEqual({
      ...before,
      phase_id: null,
      learning_item_id: null,
    });
  });

  it(`${CHECK_LINKS} — a thought group deleted on its own`, async () => {
    const asA = await as("a");
    const projectId = await makeFullProject("its group deleted on its own");
    const [group] = await rowsInProject("thought_groups", projectId);
    const members = (await rowsInProject("thoughts", projectId)).filter((row) => row.group_id === group.id);
    expect(members.length, "harness: the group holds thoughts").toBeGreaterThan(0);

    await asA.from("thought_groups").delete().eq("id", group.id);
    expect(await readRow("thought_groups", String(group.id)), "harness: the group is gone").toEqual([]);

    const after = await rowsInProject("thoughts", projectId);
    for (const member of members) {
      expect(
        after.find((row) => row.id === member.id),
        "the thought is in place, in no group, and the rest as it was",
      ).toEqual({ ...member, group_id: null });
    }
  });
});

type Two = { one: string; other: string };

async function makeTwoProjects(): Promise<Two> {
  const connection = await as("a");
  const one = await makeProject("the one project", ["Phase A", "Phase B"], ["Skill A", "Skill B"]);
  const other = await makeProject("the other project", ["Phase A", "Phase B", "Phase C", "Phase D", "Phase E"], ["Skill A", "Skill B", "Skill C", "Skill D", "Skill E"]);
  const today = todayDate();
  const now = Date.now();
  for (const [projectId, count] of [
    [one, 2],
    [other, 5],
  ] as const) {
    const groupId = randomUUID();
    const rows = {
      daily_tasks: Array.from({ length: count }, (_, i) => ({ ...rowFor("daily_tasks", projectId, `task ${i}`), sort_order: i, task_date: today })),
      thought_groups: [{ id: groupId, ...rowFor("thought_groups", projectId, "a group"), sort_order: count }],
      thoughts: [
        ...Array.from({ length: count }, (_, i) => ({ ...rowFor("thoughts", projectId, `thought ${i}`), sort_order: i })),
        { ...rowFor("thoughts", projectId, "a grouped thought"), sort_order: 0, group_id: groupId },
      ],
    };
    for (const [table, list] of Object.entries(rows)) {
      const { error } = await connection.from(table).insert(list);
      expect(error, `harness: the rows of ${table} were saved`).toBeNull();
    }
  }
  const sessions = [
    { project_id: one, started_at: new Date(now - 20 * 60_000).toISOString(), ended_at: new Date(now - 10 * 60_000).toISOString(), duration_seconds: 600, session_date: today },
    { project_id: other, started_at: new Date(now - 3 * 3_600_000).toISOString(), ended_at: new Date(now - 3_600_000).toISOString(), duration_seconds: 7200, session_date: today },
    { project_id: other, started_at: new Date(now - 60_000).toISOString(), ended_at: null, duration_seconds: 0, session_date: today },
  ];
  const { error } = await connection.from("time_sessions").insert(sessions);
  expect(error, "harness: today's sessions were saved").toBeNull();
  clocksLeftRunning.push(one, other);
  return { one, other };
}

const clocksLeftRunning: string[] = [];

async function deleteTheClocksLeftRunning(): Promise<void> {
  const projectIds = clocksLeftRunning.splice(0);
  if (projectIds.length === 0) return;
  const connection = await as("a");
  const { error } = await connection.from("time_sessions").delete().in("project_id", projectIds).is("ended_at", null);
  const { data: remaining, error: readError } = await connection.from("time_sessions").select("id").in("project_id", projectIds).is("ended_at", null);
  expect(error, "harness: the running clocks this check made were deleted").toBeNull();
  expect(readError, "harness: what remained of them was read").toBeNull();
  expect(remaining ?? [], "harness: none of them still runs").toEqual([]);
}

async function snapshot(two: Two): Promise<Map<string, string>> {
  const all = new Map<string, string>();
  for (const projectId of [two.one, two.other]) {
    for (const table of TABLES) {
      for (const row of await rowsInProject(table, projectId)) all.set(`${table}:${String(row.id)}`, JSON.stringify(row));
    }
  }
  return all;
}

function differing(before: Map<string, string>, after: Map<string, string>): string[] {
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys].filter((key) => before.get(key) !== after.get(key)).sort();
}

const idsIn = (rows: readonly object[]): string[] => rows.map((row) => String((row as Row).id)).sort();

describe("one project among two of one account, on the practice copy", () => {
  afterEach(deleteTheClocksLeftRunning);

  it(`${CHECK_ONE_PROJECT} — the dashboard's read of one project hands back that project's rows only`, async () => {
    const two = await makeTwoProjects();
    await setActiveProject(two.one);

    const data = await getProjectDashboardData(two.one);

    expect(data, "the dashboard's read answered").not.toBeNull();
    expect(data!.project.id, "the project asked for").toBe(two.one);
    expect(idsIn(data!.phases), "its phases, and none of the other's").toEqual(idsIn(await rowsInProject("phases", two.one)));
    expect(idsIn(data!.learning), "its learning items, and none of the other's").toEqual(idsIn(await rowsInProject("learning_items", two.one)));
    expect(idsIn(data!.tasks), "its tasks, and none of the other's").toEqual(idsIn(await rowsInProject("daily_tasks", two.one)));
    expect(idsIn(data!.thoughts), "its thoughts, and none of the other's").toEqual(idsIn(await rowsInProject("thoughts", two.one)));
    expect(idsIn(data!.thoughtGroups), "its groups, and none of the other's").toEqual(idsIn(await rowsInProject("thought_groups", two.one)));
    expect(data!.loggedSeconds, "today's time is its ten minutes alone").toBe(600);
    expect(data!.running, "the other project's running clock is not its").toBe(false);
    expect(data!.daily.find((day) => day.date === todayDate())?.loggedSeconds, "today's row of its history is its alone").toBe(600);
  });

  it(`${CHECK_ONE_PROJECT} — a task, a learning item and a thought added to it are numbered from its own rows alone`, async () => {
    const two = await makeTwoProjects();
    await setActiveProject(two.one);

    const task = await addTask("A made-up added task");
    const skill = await addLearningItem("A made-up added skill");
    const thought = await addThought("A made-up added thought");

    expect(task.sortOrder, "the task is numbered after its own two tasks, whatever the other's five").toBe(2);
    expect(skill.sortOrder, "the learning item after its own two, whatever the other's five").toBe(2);
    expect(thought.sortOrder, "the thought from its own feed of two loose thoughts and a group, whatever the other's six").toBe(3);
    expect((await readRow("daily_tasks", task.id))[0]?.sort_order, "and the task is stored so").toBe(2);
    expect((await readRow("learning_items", skill.id))[0]?.sort_order, "and the learning item is stored so").toBe(2);
    expect((await readRow("thoughts", thought.id))[0]?.sort_order, "and the thought is stored so").toBe(3);
  });

  it(`${CHECK_ONE_PROJECT} — making a group in it moves only its own thoughts and groups`, async () => {
    const two = await makeTwoProjects();
    await setActiveProject(two.one);
    const otherThoughts = await rowsInProject("thoughts", two.other);
    const otherGroups = await rowsInProject("thought_groups", two.other);
    const loose = (await rowsInProject("thoughts", two.one)).filter((row) => row.group_id === null);

    const made = await groupThoughts(
      loose.map((row) => String(row.id)),
      "A made-up new group",
    );

    expect(made, "harness: the group was made").not.toBeNull();
    expect(made!.group.projectId, "the new group is its own").toBe(two.one);
    expect((await readRow("thought_groups", made!.group.id))[0]?.project_id, "and stored in it").toBe(two.one);
    expect(
      [...made!.thoughts, ...made!.groups].filter((row) => row.projectId !== two.one).map((row) => row.id),
      "none of the other project's rows handed back",
    ).toEqual([]);
    expect(await rowsInProject("thoughts", two.other), "the other project's thoughts, as they were").toEqual(otherThoughts);
    expect(await rowsInProject("thought_groups", two.other), "the other project's groups, as they were").toEqual(otherGroups);
  });

  it(`${CHECK_ONE_PROJECT} — changing one of its rows changes no other row`, async () => {
    const two = await makeTwoProjects();
    await setActiveProject(two.one);
    const [phase] = await rowsInProject("phases", two.one);
    const skill = (await rowsInProject("learning_items", two.one)).find((row) => row.is_focus === false)!;
    const [task] = await rowsInProject("daily_tasks", two.one);
    const thought = (await rowsInProject("thoughts", two.one)).find((row) => row.group_id === null)!;
    const [group] = await rowsInProject("thought_groups", two.one);

    const changes: [string, string, () => Promise<unknown>][] = [
      ["renaming it", `projects:${two.one}`, () => renameProject("the one project, renamed")],
      ["renaming a phase", `phases:${String(phase.id)}`, () => renamePhase(String(phase.id), "Phase A, renamed")],
      ["renaming a learning item", `learning_items:${String(skill.id)}`, () => renameLearningItem(String(skill.id), "Skill, renamed")],
      ["changing a task's text", `daily_tasks:${String(task.id)}`, () => updateTask(String(task.id), { text: "Task, changed" })],
      ["changing a thought's text", `thoughts:${String(thought.id)}`, () => updateThought(String(thought.id), { text: "Thought, changed" })],
      ["renaming a group", `thought_groups:${String(group.id)}`, () => renameThoughtGroup(String(group.id), "Group, renamed")],
    ];
    for (const [what, target, change] of changes) {
      const before = await snapshot(two);
      await change();
      expect(differing(before, await snapshot(two)), `${what} changes that row and no other`).toEqual([target]);
    }

    const before = await snapshot(two);
    await setLoggedSecondsForDate(todayDate(), 900);
    const after = await snapshot(two);
    const touched = differing(before, after);
    const isItsOwnSession = (key: string): boolean => {
      if (!key.startsWith("time_sessions:")) return false;
      const row = JSON.parse(before.get(key) ?? after.get(key) ?? "{}") as Row;
      return row.project_id === two.one && row.session_date === todayDate();
    };
    expect(touched.length, "harness: entering today's time by hand changed its day").toBeGreaterThan(0);
    expect(
      touched.filter((key) => !isItsOwnSession(key)),
      "entering its day's time by hand changes no row but its own sessions of that day",
    ).toEqual([]);
  });

  it(`${CHECK_ONE_PROJECT} — deleting one of its rows changes no other row`, async () => {
    const two = await makeTwoProjects();
    await setActiveProject(two.one);
    const phases = await rowsInProject("phases", two.one);
    const skill = (await rowsInProject("learning_items", two.one)).find((row) => row.is_focus === false)!;
    const [task] = await rowsInProject("daily_tasks", two.one);
    const thought = (await rowsInProject("thoughts", two.one)).find((row) => row.group_id === null)!;

    const deletes: [string, string, () => Promise<unknown>][] = [
      ["deleting a phase", `phases:${String(phases[1].id)}`, () => removePhase(String(phases[1].id))],
      ["deleting a learning item", `learning_items:${String(skill.id)}`, () => removeLearningItem(String(skill.id))],
      ["deleting a task", `daily_tasks:${String(task.id)}`, () => removeTask(String(task.id))],
      ["deleting a thought", `thoughts:${String(thought.id)}`, () => removeThought(String(thought.id))],
    ];
    for (const [what, target, remove] of deletes) {
      const before = await snapshot(two);
      expect(before.has(target), `harness: the row is there before ${what}`).toBe(true);
      await remove();
      const after = await snapshot(two);
      expect(after.has(target), `${what} deletes it`).toBe(false);
      expect(differing(before, after), `${what} changes no other row`).toEqual([target]);
    }
  });
});
