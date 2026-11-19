import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setTestUser,
  addLearningItem,
  addTask,
  addThought,
  getProjectDashboardData,
  getTodayLoggedSeconds,
  groupThoughts,
  listDailyTime,
  onWriteError,
  setActiveProject,
  setLoggedSecondsForDate,
  startSession,
  todayDate,
  type WriteFailure,
} from "../db";
import { createFakeSupabase, type FakeRequest, type FakeRow, type FakeSupabase } from "../fakeSupabase";

const holder = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../supabase", () => ({
  getSupabase: () =>
    new Proxy(
      {},
      {
        get(_t, key) {
          const client = (holder.current as { client: Record<string | symbol, unknown> }).client;
          const member = client[key];
          return typeof member === "function" ? member.bind(client) : member;
        },
      },
    ),
}));

const CHECK_READS =
  "Against the stand-in, with two projects' rows seeded in every table, every read of one project's learning items, tasks, thoughts, thought groups and time sessions, and the dashboard's one read of a project, asks for that project only and hands back its rows only; a deliberately unfiltered read fails the check";
const CHECK_ADDS =
  "Against the stand-in, adding a learning item, a task, a thought, a thought group or a time session, started or entered by hand, sends no owner; each new learning item, task and thought is numbered from its own project's rows alone, whatever the other project holds, and making a group moves only its own project's thoughts and groups; an add that names an owner, or counts the other project's rows, fails the check";

const OWNER = "u-ch019-owner";
const ONE = "p-ch019-one";
const OTHER = "p-ch019-other";
const TODAY = "2026-10-09";
const NOW = new Date(2026, 9, 9, 10, 0, 0);
const at = (hour: number, minute: number): string => new Date(2026, 9, 9, hour, minute, 0).toISOString();

const IN_ONE = 2;
const IN_OTHER = 5;

function projectRow(id: string, sortOrder: number): FakeRow {
  return {
    id,
    user_id: OWNER,
    name: `Made-up project ${id}`,
    accent_color: "#7FB069",
    sort_order: sortOrder,
    archived_at: null,
    total_days: 30,
    hours_planned_per_day: 2,
    hours_available_per_day: 3,
    started_at: "2026-10-01",
    created_at: at(7, 0),
  };
}

function rowsOf(projectId: string, count: number) {
  const base = (kind: string, i: number) => ({
    id: `${projectId}-${kind}-${i}`,
    user_id: OWNER,
    project_id: projectId,
    created_at: at(7, i),
  });
  const indexes = Array.from({ length: count }, (_, i) => i);
  const groupId = `${projectId}-group`;
  return {
    phases: indexes.map((i) => ({ ...base("phase", i), name: `Made-up phase ${i}`, est_days: 3, sort_order: i, is_done: false, completed_at: null })),
    learning_items: indexes.map((i) => ({ ...base("skill", i), name: `Made-up skill ${i}`, sort_order: i, progress_pct: 20, is_focus: i === 0 })),
    daily_tasks: indexes.map((i) => ({
      ...base("task", i),
      text: `Made-up task ${i}`,
      is_done: false,
      sort_order: i,
      task_date: TODAY,
      phase_id: null,
      learning_item_id: null,
    })),
    thoughts: [
      ...indexes.map((i) => ({ ...base("thought", i), title: null, text: `Made-up thought ${i}`, sort_order: i, group_id: null })),
      { ...base("grouped-thought", 0), title: null, text: "Made-up grouped thought", sort_order: 0, group_id: groupId },
    ],
    thought_groups: [{ id: groupId, user_id: OWNER, project_id: projectId, name: "Made-up group", sort_order: count, created_at: at(7, 30) }],
  };
}

const one = rowsOf(ONE, IN_ONE);
const other = rowsOf(OTHER, IN_OTHER);

const SESSIONS: FakeRow[] = [
  { id: "s-one-ended", user_id: OWNER, project_id: ONE, started_at: at(8, 0), ended_at: at(8, 10), duration_seconds: 600, session_date: TODAY, created_at: at(8, 0) },
  { id: "s-other-ended", user_id: OWNER, project_id: OTHER, started_at: at(6, 0), ended_at: at(8, 0), duration_seconds: 7200, session_date: TODAY, created_at: at(6, 0) },
  { id: "s-other-running", user_id: OWNER, project_id: OTHER, started_at: at(9, 55), ended_at: null, duration_seconds: 0, session_date: TODAY, created_at: at(9, 55) },
];
const ONE_SECONDS_TODAY = 600;

function seed(): Record<string, FakeRow[]> {
  return {
    projects: [projectRow(ONE, 0), projectRow(OTHER, 1)],
    phases: [...one.phases, ...other.phases],
    learning_items: [...one.learning_items, ...other.learning_items],
    daily_tasks: [...one.daily_tasks, ...other.daily_tasks],
    thoughts: [...one.thoughts, ...other.thoughts],
    thought_groups: [...one.thought_groups, ...other.thought_groups],
    time_sessions: SESSIONS,
  };
}

const idsOf = (rows: { id: unknown }[]): string[] => rows.map((row) => String(row.id)).sort();

function isScopedTo(request: FakeRequest, projectId: string): boolean {
  const column = request.table === "projects" ? "id" : "project_id";
  return request.filters.some(
    (filter) =>
      filter.column === column &&
      ((filter.op === "eq" && filter.value === projectId) ||
        (filter.op === "in" && Array.isArray(filter.value) && filter.value.length > 0 && filter.value.every((value) => value === projectId))),
  );
}

function isTheUserWideHeal(request: FakeRequest): boolean {
  return (
    request.table === "time_sessions" &&
    request.operation === "select" &&
    request.filters.length === 2 &&
    request.filters.some((filter) => filter.column === "ended_at" && filter.op === "is" && filter.value === null) &&
    request.filters.some((filter) => filter.column === "session_date" && filter.op === "lt" && filter.value === TODAY)
  );
}

function described(request: FakeRequest): string {
  return `${request.operation} ${request.table} ${JSON.stringify(request.filters)}`;
}

function readsNotScoped(requests: FakeRequest[], projectId: string): string[] {
  return requests
    .filter((request) => request.operation === "select" && !isScopedTo(request, projectId) && !isTheUserWideHeal(request))
    .map(described);
}

function rowsOfAnother(rows: { id: string; projectId: string }[], projectId: string): string[] {
  return rows.filter((row) => row.projectId !== projectId).map((row) => row.id);
}

function writesNamingAnOwner(requests: FakeRequest[]): string[] {
  return requests
    .filter((request) => request.payload !== null)
    .filter((request) => {
      const rows = Array.isArray(request.payload) ? request.payload : [request.payload as FakeRow];
      return rows.some((row) => "user_id" in row || "userId" in row || Object.values(row).includes(OWNER));
    })
    .map((request) => `${request.operation} ${request.table} ${JSON.stringify(request.payload)}`);
}

let fake: FakeSupabase;
let failures: WriteFailure[];
let unsubscribe: () => void;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fake = createFakeSupabase(seed());
  holder.current = fake;
  failures = [];
  unsubscribe = onWriteError((failure) => failures.push(failure));
  __setTestUser({ id: OWNER, email: "owner@compass.test" });
  await setActiveProject(ONE);
});

afterEach(() => {
  unsubscribe();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function sentBy<T>(call: () => Promise<T>): Promise<{ value: T; sent: FakeRequest[] }> {
  const from = fake.requests.length;
  const value = await call();
  return { value, sent: fake.requests.slice(from) };
}

describe("one project's reads, against the stand-in", () => {
  it(`${CHECK_READS} — reading today's logged seconds`, async () => {
    expect(todayDate(), "harness: the pinned day").toBe(TODAY);
    const { value, sent } = await sentBy(() => getTodayLoggedSeconds());

    expect(sent.length, "harness: the read reached the stand-in").toBeGreaterThan(0);
    expect(readsNotScoped(sent, ONE), "reads that did not ask for the one project alone").toEqual([]);
    expect(value, "the one project's ten minutes, and nothing of the other's two hours or running clock").toBe(ONE_SECONDS_TODAY);
  });

  it(`${CHECK_READS} — reading the recent days of time`, async () => {
    const { value, sent } = await sentBy(() => listDailyTime(7));

    expect(sent.length, "harness: the read reached the stand-in").toBeGreaterThan(0);
    expect(readsNotScoped(sent, ONE), "reads that did not ask for the one project alone").toEqual([]);
    expect(value.find((day) => day.date === TODAY)?.loggedSeconds, "today holds the one project's ten minutes alone").toBe(ONE_SECONDS_TODAY);
    expect(
      value.filter((day) => day.date !== TODAY).map((day) => day.loggedSeconds),
      "and every other day nothing",
    ).toEqual(value.filter((day) => day.date !== TODAY).map(() => 0));
  });

  it(`${CHECK_READS} — the dashboard's one read of a project`, async () => {
    const { value, sent } = await sentBy(() => getProjectDashboardData(ONE));

    expect(sent.length, "harness: the read reached the stand-in").toBeGreaterThan(0);
    expect(readsNotScoped(sent, ONE), "reads that did not ask for the one project alone").toEqual([]);
    expect(value, "the dashboard's read answered").not.toBeNull();
    const data = value!;
    expect(data.project.id, "the project asked for").toBe(ONE);
    expect(
      rowsOfAnother([...data.phases, ...data.learning, ...data.tasks, ...data.thoughts, ...data.thoughtGroups], ONE),
      "rows handed back from the other project",
    ).toEqual([]);
    expect(idsOf(data.phases), "the one project's phases").toEqual(idsOf(one.phases));
    expect(idsOf(data.learning), "the one project's learning items").toEqual(idsOf(one.learning_items));
    expect(idsOf(data.tasks), "the one project's tasks").toEqual(idsOf(one.daily_tasks));
    expect(idsOf(data.thoughts), "the one project's thoughts").toEqual(idsOf(one.thoughts));
    expect(idsOf(data.thoughtGroups), "the one project's group").toEqual(idsOf(one.thought_groups));
    expect(data.loggedSeconds, "today's time is the one project's alone").toBe(ONE_SECONDS_TODAY);
    expect(data.running, "the other project's running clock is not this project's").toBe(false);
    expect(data.daily.find((day) => day.date === TODAY)?.loggedSeconds, "today's row of the history is the one project's alone").toBe(
      ONE_SECONDS_TODAY,
    );
  });

  it(`${CHECK_READS} — a deliberately unfiltered read fails the check`, async () => {
    const from = fake.requests.length;
    const { data } = await fake.client.from("daily_tasks").select("*");
    const sent = fake.requests.slice(from);
    const handedBack = ((data ?? []) as FakeRow[]).map((row) => ({ id: String(row.id), projectId: String(row.project_id) }));

    expect(readsNotScoped(sent, ONE), "a read with no project filter is found by the judge of what was asked").toHaveLength(1);
    expect(rowsOfAnother(handedBack, ONE), "and the other project's rows it hands back are found by the judge of what was handed back").toEqual(
      idsOf(other.daily_tasks),
    );
  });
});

describe("one project's adds, against the stand-in", () => {
  it(`${CHECK_ADDS} — adding a learning item sends no owner, and numbers it from its own project's learning items alone`, async () => {
    const { value: item, sent } = await sentBy(() => addLearningItem("A made-up skill"));

    expect(sent.some((request) => request.table === "learning_items" && request.operation === "insert"), "harness: the add was sent").toBe(true);
    expect(writesNamingAnOwner(sent), "writes that named an owner").toEqual([]);
    expect(readsNotScoped(sent, ONE), "counts that did not ask for the one project alone").toEqual([]);
    expect(item.projectId, "the new item is the one project's").toBe(ONE);
    expect(item.sortOrder, `numbered after the one project's ${IN_ONE} items, whatever the other's ${IN_OTHER}`).toBe(IN_ONE);
    expect(fake.rows("learning_items").find((row) => row.id === item.id)?.sort_order, "and stored so").toBe(IN_ONE);
  });

  it(`${CHECK_ADDS} — adding a task sends no owner, and numbers it from its own project's tasks alone`, async () => {
    const { value: task, sent } = await sentBy(() => addTask("A made-up task"));

    expect(sent.some((request) => request.table === "daily_tasks" && request.operation === "insert"), "harness: the add was sent").toBe(true);
    expect(writesNamingAnOwner(sent), "writes that named an owner").toEqual([]);
    expect(readsNotScoped(sent, ONE), "counts that did not ask for the one project alone").toEqual([]);
    expect(task.projectId, "the new task is the one project's").toBe(ONE);
    expect(task.sortOrder, `numbered after the one project's ${IN_ONE} tasks, whatever the other's ${IN_OTHER}`).toBe(IN_ONE);
    expect(fake.rows("daily_tasks").find((row) => row.id === task.id)?.sort_order, "and stored so").toBe(IN_ONE);
  });

  it(`${CHECK_ADDS} — adding a thought sends no owner, and numbers it from its own project's feed alone`, async () => {
    const { value: thought, sent } = await sentBy(() => addThought("A made-up thought"));
    const ownFeed = IN_ONE + 1;

    expect(sent.some((request) => request.table === "thoughts" && request.operation === "insert"), "harness: the add was sent").toBe(true);
    expect(writesNamingAnOwner(sent), "writes that named an owner").toEqual([]);
    expect(readsNotScoped(sent, ONE), "counts that did not ask for the one project alone").toEqual([]);
    expect(thought.projectId, "the new thought is the one project's").toBe(ONE);
    expect(thought.sortOrder, `numbered from the one project's feed of ${ownFeed}, whatever the other's ${IN_OTHER + 1}`).toBe(ownFeed);
    expect(fake.rows("thoughts").find((row) => row.id === thought.id)?.sort_order, "and stored so").toBe(ownFeed);
  });

  it(`${CHECK_ADDS} — making a group sends no owner, and moves only its own project's thoughts and groups`, async () => {
    const otherThoughts = fake.rows("thoughts").filter((row) => row.project_id === OTHER);
    const otherGroups = fake.rows("thought_groups").filter((row) => row.project_id === OTHER);

    const { value: made, sent } = await sentBy(() => groupThoughts([`${ONE}-thought-0`, `${ONE}-thought-1`], "A made-up new group"));

    expect(made, "harness: the group was made").not.toBeNull();
    expect(sent.some((request) => request.table === "thought_groups" && request.operation === "insert"), "harness: the new group was sent").toBe(true);
    expect(writesNamingAnOwner(sent), "writes that named an owner").toEqual([]);
    expect(readsNotScoped(sent, ONE), "reads that did not ask for the one project alone").toEqual([]);
    expect(made!.group.projectId, "the new group is the one project's").toBe(ONE);
    expect(rowsOfAnother([...made!.thoughts, ...made!.groups], ONE), "the other project's rows handed back").toEqual([]);
    expect(fake.rows("thoughts").filter((row) => row.project_id === OTHER), "the other project's thoughts, as they were").toEqual(otherThoughts);
    expect(fake.rows("thought_groups").filter((row) => row.project_id === OTHER), "the other project's groups, as they were").toEqual(otherGroups);
  });

  it(`${CHECK_ADDS} — starting a time session sends no owner`, async () => {
    const { value: session, sent } = await sentBy(() => startSession());

    expect(session, "harness: a session was started").not.toBeNull();
    expect(sent.some((request) => request.table === "time_sessions" && request.operation === "insert"), "harness: the new session was sent").toBe(true);
    expect(writesNamingAnOwner(sent), "writes that named an owner").toEqual([]);
    expect(session!.projectId, "the new session is the one project's").toBe(ONE);
  });

  it(`${CHECK_ADDS} — a time session entered by hand sends no owner`, async () => {
    const { sent } = await sentBy(() => setLoggedSecondsForDate(TODAY, 1200));

    const inserts = sent.filter((request) => request.table === "time_sessions" && request.operation === "insert");
    expect(inserts.length, "harness: the entered session was sent").toBeGreaterThan(0);
    expect(failures, "harness: no save failed").toEqual([]);
    expect(writesNamingAnOwner(sent), "writes that named an owner").toEqual([]);
    expect(
      fake.rows("time_sessions").filter((row) => row.project_id === OTHER),
      "the other project's sessions on that date, as they were",
    ).toEqual(SESSIONS.filter((row) => row.project_id === OTHER));
  });

  it(`${CHECK_ADDS} — an add that names an owner, or counts the other project's rows, fails the check`, async () => {
    const from = fake.requests.length;
    await fake.client.from("daily_tasks").insert({ id: "t-names-an-owner", user_id: OWNER, project_id: ONE, text: "named", sort_order: 9, task_date: TODAY });
    await fake.client.from("daily_tasks").select("id");
    const sent = fake.requests.slice(from);

    expect(writesNamingAnOwner(sent), "an add that names an owner is found").toHaveLength(1);
    expect(readsNotScoped(sent, ONE), "a count over every project's rows is found").toHaveLength(1);
  });
});
