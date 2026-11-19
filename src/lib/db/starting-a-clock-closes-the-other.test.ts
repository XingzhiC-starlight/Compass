import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setTestUser,
  getProjectDashboardData,
  onWriteError,
  setActiveProject,
  startSession,
} from "../db";
import { createFakeSupabase, type FakeRow, type FakeSupabase } from "../fakeSupabase";

const CHECK_START_CLOSES =
  "With a clock running in another project, starting the clock here closes it and starts one here: exactly one running session exists afterwards, the new one, and the other project shows its clock stopped when opened";
const CHECK_START_FAILS =
  "With the close of that other clock failing, starting the clock here writes no new session, the \"Couldn't save just now — retrying…\" note shows once, exactly one running session remains, the one that could not be closed, and after the re-sync this card shows the clock off";

const holder = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("../supabase", () => ({
  getSupabase: () =>
    new Proxy(
      {},
      {
        get(_target, key) {
          const client = (holder.current as { client: Record<string | symbol, unknown> }).client;
          const member = client[key];
          return typeof member === "function" ? member.bind(client) : member;
        },
      },
    ),
}));

let fake: FakeSupabase;

function local(y: number, month: number, d: number, h = 0, min = 0, s = 0): Date {
  return new Date(y, month - 1, d, h, min, s);
}

const FRI = "2026-09-18";

const USER = { id: "user-1", email: "founder@example.com" };

function projectRow(id: string, name: string, sortOrder: number): FakeRow {
  return {
    id,
    user_id: USER.id,
    name,
    accent_color: "#9A7B4F",
    sort_order: sortOrder,
    archived_at: null,
    total_days: 90,
    hours_planned_per_day: 4,
    hours_available_per_day: 6,
    started_at: "2026-07-21",
    created_at: "2026-07-21T17:00:00.000Z",
  };
}

const PROJECTS: FakeRow[] = [projectRow("p1", "This project", 0), projectRow("p2", "The other project", 1)];

function runningSession(id: string, projectId: string, startedAt: Date): FakeRow {
  const two = (n: number) => String(n).padStart(2, "0");
  return {
    id,
    user_id: USER.id,
    project_id: projectId,
    started_at: startedAt.toISOString(),
    ended_at: null,
    duration_seconds: 0,
    session_date: `${startedAt.getFullYear()}-${two(startedAt.getMonth() + 1)}-${two(startedAt.getDate())}`,
    created_at: startedAt.toISOString(),
  };
}

function open(sessions: FakeRow[]): void {
  fake = createFakeSupabase({ projects: PROJECTS, time_sessions: sessions });
  holder.current = fake;
}

function sessionsOf(projectId: string, date: string): FakeRow[] {
  return fake.rows("time_sessions").filter((r) => r.project_id === projectId && r.session_date === date);
}

function runningRows(): FakeRow[] {
  return fake.rows("time_sessions").filter((r) => r.ended_at === null);
}

function stored(): string {
  return fake
    .rows("time_sessions")
    .map((r) => `${r.project_id} ${r.session_date} ${r.duration_seconds}s ${r.ended_at === null ? "running" : "ended"}`)
    .join(" | ");
}

let notes = 0;
let unsubscribe: () => void = () => {};

describe("starting the clock while another project's clock runs", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(local(2026, 9, 18, 11, 0, 0));
    notes = 0;
    unsubscribe = onWriteError(() => {
      notes += 1;
    });
    __setTestUser(USER);
    await setActiveProject("p1");
  });

  afterEach(() => {
    unsubscribe();
    vi.useRealTimers();
  });

  it(`${CHECK_START_CLOSES}`, async () => {
    open([runningSession("p2-clock", "p2", local(2026, 9, 18, 10, 0, 0))]);
    vi.setSystemTime(local(2026, 9, 18, 11, 0, 0));

    const started = await startSession();

    expect(started, "a session was started here").not.toBeNull();
    const running = runningRows();
    expect(running.length, `exactly one running session exists afterwards (stored: ${stored()})`).toBe(1);
    expect(running[0].project_id, "the running one is this project's").toBe("p1");
    expect(running[0].id, "the running one is the new one").toBe(started!.id);
    const other = fake.rows("time_sessions").find((r) => r.id === "p2-clock");
    expect(other?.ended_at, "the other project's clock is closed").not.toBeNull();
    expect(notes, "nothing failed, no note").toBe(0);

    await setActiveProject("p2");
    const payload = await getProjectDashboardData("p2");
    expect(payload, "harness: the other project's dashboard payload loads").not.toBeNull();
    expect(payload!.running, "the other project shows its clock stopped").toBe(false);
  });

  it(`${CHECK_START_FAILS}`, async () => {
    open([runningSession("p2-clock", "p2", local(2026, 9, 18, 10, 0, 0))]);
    vi.setSystemTime(local(2026, 9, 18, 11, 0, 0));
    fake.failNext("time_sessions", "update");

    const started = await startSession().catch(() => "threw" as const);

    expect(started, "nothing was started").toBeNull();
    expect(
      fake.requests.filter((r) => r.table === "time_sessions" && r.operation === "insert"),
      "no new session is written",
    ).toEqual([]);
    expect(sessionsOf("p1", FRI), `this project has no session (stored: ${stored()})`).toEqual([]);
    expect(notes, "the note shows once").toBe(1);
    const running = runningRows();
    expect(running.length, `exactly one running session remains (stored: ${stored()})`).toBe(1);
    expect(running[0].id, "the one that could not be closed").toBe("p2-clock");

    const payload = await getProjectDashboardData("p1");
    expect(payload, "harness: this project's dashboard payload loads").not.toBeNull();
    expect(payload!.running, "after the re-sync this card shows the clock off").toBe(false);
    expect(runningRows().map((r) => r.id), "the other clock is still the only one running").toEqual(["p2-clock"]);
  });
});
