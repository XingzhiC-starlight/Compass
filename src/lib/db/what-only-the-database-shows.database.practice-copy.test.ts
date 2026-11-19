import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  SaveFailedError,
  addPhase,
  addTask,
  addThought,
  deleteProject,
  getProjectDashboardData,
  groupThoughts,
  listArchivedProjects,
  listProjects,
  removePhase,
  saveInterview,
  setActiveProject,
  setLoggedSecondsForDate,
  todayDate,
} from "../db";
import { TEXT_LIMITS } from "../limits";
import {
  forgetRequestsSent,
  requestsSent,
  signInAsPractice,
  signOutOfPractice,
  signedInConnection,
  type PracticeAccountName,
  type SentRequest,
} from "../practiceCopy";
import type { ID, InterviewInput, Phase, Project, User } from "../types";

const CHECK_OWNER =
  "With the practice copy up, the database command, signed in as one practice account through the app's own seam, saves a project and reads it back: the saved row names that account as its owner though nothing sent one, and the other practice account, signed in the same way, sees no such project";
const CHECK_REFUSALS =
  "With the practice copy up, the database command shows the database refusing, and keeping nothing of, one value past each kind of rule the schema declares — a name one character past its limit, a whole-number day count given a fraction, a progress of 101 — and accepting the value just inside each";
const CHECK_CASCADE =
  "With the practice copy up, the database command deletes a project that has a phase, a learning item, a task, a thought in a group and a time session, and shows every one of them gone while another project's rows remain";
const CHECK_PHASES =
  "With the practice copy up and two projects saved by one practice account, the database command reads one project's phases and gets that project's only, and a phase added to it is numbered one past the highest of its own phases, so a number freed by a deleted phase is skipped";

const REFUSED_BY_A_LIMIT = "23514";
const NOT_OF_THE_COLUMNS_TYPE = "22P02";

type Outcome<T> = { threw: boolean; value?: T; error?: unknown };

async function trying<T>(run: () => Promise<T> | T): Promise<Outcome<T>> {
  try {
    return { threw: false, value: await run() };
  } catch (error) {
    return { threw: true, error };
  }
}

function told(outcome: Outcome<unknown>): string {
  if (outcome.threw) return `it threw: ${String(outcome.error)}`;
  try {
    return `it answered: ${JSON.stringify(outcome.value)}`;
  } catch {
    return `it answered: ${String(outcome.value)}`;
  }
}

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

function named(what: string): string {
  return `${what} ${RUN}`;
}

function madeUpId(): ID {
  const hex = (length: number): string =>
    Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

function nameOfLength(beginning: string, length: number): string {
  return `${beginning} `.padEnd(length, "x").slice(0, length);
}

function setup(projectName: string, phases: string[] = ["A first phase"], learn: string[] = ["A first skill"]): InterviewInput {
  return {
    setupId: madeUpId(),
    projectName,
    totalDays: 30,
    hoursPlannedPerDay: 2,
    hoursAvailablePerDay: 4,
    phases: phases.map((name) => ({ name, estDays: 3 })),
    learn: learn.map((name) => ({ name, level: 30 })),
  };
}

const made: ID[] = [];

async function signedInAs(which: PracticeAccountName): Promise<User> {
  const outcome = await trying(() => signInAsPractice(which));
  expect(
    outcome.threw,
    `the database command is signed in as practice account "${which}" through the app's own seam (${told(outcome)})`,
  ).toBe(false);
  expect(
    typeof outcome.value?.id === "string" && outcome.value.id.length > 0,
    `and the seam knows who that is (${told(outcome)})`,
  ).toBe(true);
  return outcome.value as User;
}

async function saved(input: InterviewInput): Promise<Project> {
  made.push(input.setupId);
  const outcome = await trying(() => saveInterview(input));
  expect(outcome.threw, `the project "${input.projectName}" is saved through the seam (${told(outcome)})`).toBe(false);
  expect(outcome.value?.id, "and it is the project this setup made").toBe(input.setupId);
  return outcome.value as Project;
}

type Answer = { data: Record<string, unknown>[] | null; error: { code?: string; message?: string } | null };

async function asked(what: string, send: (connection: ReturnType<typeof signedInConnection>) => PromiseLike<unknown>): Promise<Answer> {
  const outcome = await trying(async () => send(signedInConnection()));
  expect(outcome.threw, `${what}: the request was sent over the seam's own connection (${told(outcome)})`).toBe(false);
  const answer = outcome.value as Partial<Answer> | null | undefined;
  return { data: answer?.data ?? null, error: answer?.error ?? null };
}

async function rowsOf(table: string, projectId: ID, columns = "id"): Promise<Record<string, unknown>[]> {
  const answer = await asked(`reading ${table}`, (connection) =>
    connection.from(table).select(columns).eq("project_id", projectId),
  );
  expect(answer.error, `reading ${table}: the practice copy answered`).toBeNull();
  return answer.data ?? [];
}

function idsOf(rows: Record<string, unknown>[]): string[] {
  return rows.map((row) => String(row.id)).sort();
}

function described(request: SentRequest): string {
  return `${request.method} ${request.address}`;
}

afterEach(async () => {
  if (made.length === 0) return;
  try {
    await signInAsPractice("a");
    for (const id of made.splice(0)) {
      try {
        await deleteProject(id);
      } catch {
        /* it was never saved, or is gone already */
      }
    }
  } catch {
    /* nobody could sign in: nothing was saved either */
  }
});

afterAll(async () => {
  try {
    await signOutOfPractice();
  } catch {
    /* not built yet: nothing to stop */
  }
});

describe("the owner, stamped by the database", () => {
  it(`${CHECK_OWNER} — the saved row names the account as its owner, though nothing sent one`, async () => {
    const account = await signedInAs("a");
    const input = setup(named("owner stamp"));

    const cleared = await trying(() => forgetRequestsSent());
    const project = await saved(input);
    const record = await trying(() => requestsSent());

    const listed = await listProjects();
    const readBack = listed.find((one) => one.id === input.setupId);
    expect(readBack?.name, "the project is read back").toBe(input.projectName);
    expect(project.userId, "the project handed back names that account as its owner").toBe(account.id);
    expect(readBack?.userId, "and so does the project read back").toBe(account.id);

    const stored = await asked("reading the saved row", (connection) =>
      connection.from("projects").select("id, user_id").eq("id", input.setupId),
    );
    expect(stored.error, "the practice copy answered").toBeNull();
    expect(stored.data, "the saved row names that account as its owner").toEqual([{ id: input.setupId, user_id: account.id }]);

    expect(cleared.threw, `the record of what was sent was cleared before the save (${told(cleared)})`).toBe(false);
    expect(record.threw, `the record of what was sent can be read (${told(record)})`).toBe(false);
    const carrying = (record.value ?? []).filter((request) => request.method !== "GET" && request.body !== null);
    expect(
      carrying.filter((request) => String(request.body).includes(input.projectName)).length > 0,
      `the save is on the record of what was sent (on record: ${JSON.stringify((record.value ?? []).map(described))})`,
    ).toBe(true);
    expect(
      carrying.filter((request) => String(request.body).includes("user_id")).map(described),
      "requests that named an owner column",
    ).toEqual([]);
    expect(
      carrying.filter((request) => String(request.body).includes(account.id)).map(described),
      "requests that carried the account's identity",
    ).toEqual([]);
  });

  it(`${CHECK_OWNER} — the other practice account, signed in the same way, sees no such project`, async () => {
    const owner = await signedInAs("a");
    const input = setup(named("hidden from the other account"), ["A phase the other account must not see"]);
    await saved(input);

    const seenByOwner = await listProjects();
    expect(
      seenByOwner.some((one) => one.id === input.setupId),
      "harness: the account that saved the project sees it",
    ).toBe(true);
    const phasesSeenByOwner = await rowsOf("phases", input.setupId);
    expect(phasesSeenByOwner.length, "harness: and sees its phase").toBe(1);

    const other = await signedInAs("b");
    expect(other.id, "the other practice account is another person to the database").not.toBe(owner.id);

    const live = await listProjects();
    const archived = await listArchivedProjects();
    expect(
      [...live, ...archived].filter((one) => one.id === input.setupId || one.name === input.projectName),
      "the projects the other account sees that are this one",
    ).toEqual([]);
    expect(
      [...live, ...archived].filter((one) => one.userId !== other.id),
      "the projects the other account sees that are not its own",
    ).toEqual([]);

    const asked_ = await asked("asking for the project by its identity", (connection) =>
      connection.from("projects").select("id, name").eq("id", input.setupId),
    );
    expect(asked_.error, "the practice copy answered").toBeNull();
    expect(asked_.data, "asked for by its identity, no such project is there for the other account").toEqual([]);
    expect(await rowsOf("phases", input.setupId), "nor any phase of it").toEqual([]);
  });
});

describe("the database refuses one value past each kind of rule, and keeps nothing of it", () => {
  it(`${CHECK_REFUSALS} — a name one character past its limit`, async () => {
    await signedInAs("a");
    const project = await saved(setup(named("a name past its limit")));
    await setActiveProject(project.id);

    const beginning = named("phase");
    const limit = TEXT_LIMITS.phaseName;
    const onePast = nameOfLength(beginning, limit + 1);
    const justInside = nameOfLength(beginning, limit);

    const refused = await trying(() => addPhase(onePast));
    const afterRefusal = await phasesOf(project.id);

    expect(refused.threw, `a phase name of ${limit + 1} characters was refused (${told(refused)})`).toBe(true);
    expect(refused.error, "the seam passed the refusal on as a failed save").toBeInstanceOf(SaveFailedError);
    expect((refused.error as SaveFailedError).code, "it was the database's declared limit that refused it").toBe(REFUSED_BY_A_LIMIT);
    expect(
      afterRefusal.filter((phase) => phase.name.startsWith(beginning)).map((phase) => phase.name.length),
      "what the database kept of the refused name: nothing, not even a shortened form",
    ).toEqual([]);

    const accepted = await trying(() => addPhase(justInside));
    const afterAcceptance = await phasesOf(project.id);

    expect(accepted.threw, `a phase name of ${limit} characters was accepted (${told(accepted)})`).toBe(false);
    expect(
      afterAcceptance.filter((phase) => phase.name.startsWith(beginning)).map((phase) => phase.name),
      "what the database kept: the name just inside the limit, whole",
    ).toEqual([justInside]);
  });

  it(`${CHECK_REFUSALS} — a whole-number day count given a fraction`, async () => {
    await signedInAs("a");
    const project = await saved(setup(named("a fraction of a day")));

    const fraction = named("phase of 2.5 days");
    const whole = named("phase of 2 days");
    const phase = (name: string, days: number) => ({
      project_id: project.id,
      name,
      est_days: days,
      sort_order: 50,
      is_done: false,
      completed_at: null,
    });

    const refused = await asked("adding a phase of 2.5 days", (connection) =>
      connection.from("phases").insert(phase(fraction, 2.5)).select(),
    );
    const afterRefusal = await rowsOf("phases", project.id, "name, est_days");

    expect(refused.error?.code, `a day count of 2.5 was refused as not a whole number (answered: ${JSON.stringify(refused)})`).toBe(
      NOT_OF_THE_COLUMNS_TYPE,
    );
    expect(refused.data, "nothing was handed back as saved").toBeNull();
    expect(
      afterRefusal.filter((row) => row.name === fraction),
      "what the database kept of the refused phase: nothing, not even rounded",
    ).toEqual([]);

    const accepted = await asked("adding a phase of 2 days", (connection) =>
      connection.from("phases").insert(phase(whole, 2)).select(),
    );
    const afterAcceptance = await rowsOf("phases", project.id, "name, est_days");

    expect(accepted.error, `a day count of 2 was accepted (answered: ${JSON.stringify(accepted)})`).toBeNull();
    expect(
      afterAcceptance.filter((row) => row.name === whole),
      "what the database kept: the phase, with its whole days",
    ).toEqual([{ name: whole, est_days: 2 }]);
  });

  it(`${CHECK_REFUSALS} — a progress of 101`, async () => {
    await signedInAs("a");
    const project = await saved(setup(named("a progress past 100")));

    const past = named("skill at 101");
    const inside = named("skill at 100");
    const item = (name: string, progress: number) => ({
      project_id: project.id,
      name,
      sort_order: 50,
      progress_pct: progress,
      is_focus: false,
    });

    const refused = await asked("adding a learning item at 101", (connection) =>
      connection.from("learning_items").insert(item(past, 101)).select(),
    );
    const afterRefusal = await rowsOf("learning_items", project.id, "name, progress_pct");

    expect(refused.error?.code, `a progress of 101 was refused by the declared limit (answered: ${JSON.stringify(refused)})`).toBe(
      REFUSED_BY_A_LIMIT,
    );
    expect(refused.data, "nothing was handed back as saved").toBeNull();
    expect(
      afterRefusal.filter((row) => row.name === past),
      "what the database kept of the refused item: nothing, not even held to 100",
    ).toEqual([]);

    const accepted = await asked("adding a learning item at 100", (connection) =>
      connection.from("learning_items").insert(item(inside, 100)).select(),
    );
    const afterAcceptance = await rowsOf("learning_items", project.id, "name, progress_pct");

    expect(accepted.error, `a progress of 100 was accepted (answered: ${JSON.stringify(accepted)})`).toBeNull();
    expect(
      afterAcceptance.filter((row) => row.name === inside),
      "what the database kept: the item, at 100",
    ).toEqual([{ name: inside, progress_pct: 100 }]);
  });
});

const OWNED = ["phases", "learning_items", "daily_tasks", "thoughts", "thought_groups", "time_sessions"];

async function filled(project: Project): Promise<void> {
  await setActiveProject(project.id);
  await addTask(`A task of ${project.name}`);
  const first = await addThought(`A first thought of ${project.name}`);
  const second = await addThought(`A second thought of ${project.name}`);
  const grouped = await groupThoughts([first.id, second.id], `A group of ${project.name}`);
  expect(grouped?.group.projectId, `harness: the thoughts of "${project.name}" were put in a group`).toBe(project.id);
  await setLoggedSecondsForDate(todayDate(), 1500);
}

async function everyRowOf(projectId: ID): Promise<Record<string, string[]>> {
  const rows: Record<string, string[]> = {};
  for (const table of OWNED) rows[table] = idsOf(await rowsOf(table, projectId));
  return rows;
}

describe("a deleted project takes every row it owned", () => {
  it(`${CHECK_CASCADE}`, async () => {
    await signedInAs("a");
    const deleted = await saved(setup(named("the project that is deleted")));
    const kept = await saved(setup(named("the project that remains")));
    await filled(deleted);
    await filled(kept);

    const deletedBefore = await everyRowOf(deleted.id);
    const keptBefore = await everyRowOf(kept.id);
    const groupedBefore = (await rowsOf("thoughts", deleted.id, "id, group_id")).filter((row) => row.group_id !== null);

    for (const table of OWNED) {
      expect(deletedBefore[table].length > 0, `harness: before the delete, the project has a row in ${table}`).toBe(true);
      expect(keptBefore[table].length > 0, `harness: before the delete, the other project has a row in ${table}`).toBe(true);
    }
    expect(groupedBefore.length > 0, "harness: before the delete, the project has a thought in a group").toBe(true);

    const outcome = await trying(() => deleteProject(deleted.id));
    expect(outcome.threw, `the project was deleted through the seam (${told(outcome)})`).toBe(false);

    const gone = await asked("asking for the deleted project", (connection) =>
      connection.from("projects").select("id").eq("id", deleted.id),
    );
    expect(gone.error, "the practice copy answered").toBeNull();
    expect(gone.data, "the deleted project").toEqual([]);
    expect(await everyRowOf(deleted.id), "what is left of the deleted project's rows").toEqual({
      phases: [],
      learning_items: [],
      daily_tasks: [],
      thoughts: [],
      thought_groups: [],
      time_sessions: [],
    });

    const remains = await asked("asking for the other project", (connection) =>
      connection.from("projects").select("id").eq("id", kept.id),
    );
    expect(remains.data, "the other project remains").toEqual([{ id: kept.id }]);
    expect(await everyRowOf(kept.id), "and so does every one of its rows").toEqual(keptBefore);
  });
});

const THIS_PHASES = ["Sketch", "Build", "Test"];
const OTHER_PHASES = ["Other: research", "Other: outline", "Other: draft", "Other: edit", "Other: publish"];

async function twoProjects(): Promise<{ open: Project; other: Project }> {
  await signedInAs("a");
  const open = await saved(setup(named("the project that is open"), THIS_PHASES));
  const other = await saved(setup(named("the other project"), OTHER_PHASES));
  await setActiveProject(open.id);
  return { open, other };
}

async function phasesOf(projectId: ID): Promise<Phase[]> {
  return (await getProjectDashboardData(projectId))!.phases;
}

function numbersOf(phases: Phase[]): number[] {
  return phases.map((phase) => phase.sortOrder);
}

describe("one project's phases, on the practice copy", () => {
  it(`${CHECK_PHASES} — reading one project's phases hands back that project's only`, async () => {
    const { open, other } = await twoProjects();

    const phases = await phasesOf(open.id);

    expect(
      phases.map((phase) => phase.name),
      "the phases read: the open project's, in their order",
    ).toEqual(THIS_PHASES);
    expect(
      phases.filter((phase) => phase.projectId !== open.id).map((phase) => phase.name),
      "phases read that belong to another project",
    ).toEqual([]);

    expect((await rowsOf("phases", other.id)).length, "harness: the other project's phases are in the same table").toBe(
      OTHER_PHASES.length,
    );
  });

  it(`${CHECK_PHASES} — a phase added is numbered one past the highest of its own, and a number freed by a deleted phase is skipped`, async () => {
    const { open, other } = await twoProjects();

    const before = await phasesOf(open.id);
    expect(before.map((phase) => phase.name), "harness: the open project has its three phases").toEqual(THIS_PHASES);
    expect(new Set(numbersOf(before)).size, "harness: each with a number of its own").toBe(THIS_PHASES.length);

    const inOrder = [...before].sort((one, next) => one.sortOrder - next.sortOrder);
    const freed = inOrder[1];
    await removePhase(freed.id);
    const remaining = await phasesOf(open.id);
    expect(
      remaining.map((phase) => phase.name),
      "harness: the phase in the middle was deleted",
    ).toEqual(THIS_PHASES.filter((name) => name !== freed.name));
    expect(numbersOf(remaining), "harness: and its number is free — no phase of the project holds it").not.toContain(freed.sortOrder);
    const highest = Math.max(...numbersOf(remaining));
    expect(freed.sortOrder < highest, "harness: the freed number is not the highest").toBe(true);

    const added = await trying(() => addPhase("Ship"));
    const after = await phasesOf(open.id);
    const kept = after.find((phase) => phase.name === "Ship");

    expect(added.threw, `the phase was added (${told(added)})`).toBe(false);
    expect(kept?.projectId, "the new phase is kept in the open project").toBe(open.id);
    expect(kept?.sortOrder, "it is numbered one past the highest of its own project's phases").toBe(highest + 1);
    expect(added.value?.sortOrder, "and handed back with that number").toBe(highest + 1);
    expect(numbersOf(after), "the number freed by the deleted phase is skipped: no phase holds it").not.toContain(freed.sortOrder);
    expect(new Set(numbersOf(after)).size, "no two phases of the project share a number").toBe(after.length);

    const others = await phasesOf(other.id);
    expect(others.map((phase) => phase.name), "the other project's phases are as they were").toEqual(OTHER_PHASES);
    expect(
      Math.max(...numbersOf(others)) + 1,
      "harness: numbered after the other project's phases, the new phase would have had another number",
    ).not.toBe(highest + 1);
  });
});
