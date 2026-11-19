import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setTestUser,
  listDailyTime,
  setActiveProject,
  startSession,
  stopSession,
} from "../db";
import { createFakeSupabase, type FakeRow, type FakeSupabase } from "../fakeSupabase";

const CHECK_WEEKEND =
  "With the tab open and the clock running on a Friday, the machine asleep until Monday: without a reload, the Days view shows Friday capped at its midnight, Saturday and Sunday with their stored hours, and \"Today\" at 0, each row labelled with its own day number";

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
const SAT = "2026-09-19";
const SUN = "2026-09-20";
const MON = "2026-09-21";
const MIDNIGHT_AFTER_FRI = local(2026, 9, 19);

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

function endedSession(id: string, projectId: string, date: string, seconds: number): FakeRow {
  const [y, m, d] = date.split("-").map(Number);
  const startedAt = local(y, m, d, 10, 0, 0);
  return {
    id,
    user_id: USER.id,
    project_id: projectId,
    started_at: startedAt.toISOString(),
    ended_at: new Date(startedAt.getTime() + seconds * 1000).toISOString(),
    duration_seconds: seconds,
    session_date: date,
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

function endsAt(row: FakeRow): number {
  return Date.parse(String(row.ended_at));
}

function stored(): string {
  return fake
    .rows("time_sessions")
    .map((r) => `${r.project_id} ${r.session_date} ${r.duration_seconds}s ${r.ended_at === null ? "running" : "ended"}`)
    .join(" | ");
}

describe("the day series after a weekend asleep", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(local(2026, 9, 18, 11, 0, 0));
    __setTestUser(USER);
    await setActiveProject("p1");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it(`${CHECK_WEEKEND} — the seam's series: Friday capped at 9 h, Saturday 1 h and Sunday 0.5 h as stored, Monday 0`, async () => {
    open([endedSession("sat", "p1", SAT, 3600), endedSession("sun", "p1", SUN, 1800)]);
    vi.setSystemTime(local(2026, 9, 18, 15, 0, 0));
    const started = await startSession();
    expect(started, "harness: the clock started on Friday").not.toBeNull();

    vi.setSystemTime(local(2026, 9, 21, 9, 0, 0));
    await stopSession();

    expect(await listDailyTime(4), `Friday to Monday (stored: ${stored()})`).toEqual([
      { date: FRI, loggedSeconds: 9 * 3600 },
      { date: SAT, loggedSeconds: 3600 },
      { date: SUN, loggedSeconds: 1800 },
      { date: MON, loggedSeconds: 0 },
    ]);
    const friday = sessionsOf("p1", FRI);
    expect(friday.length, "Friday holds one session").toBe(1);
    expect(endsAt(friday[0]), "Friday's session ends at its midnight").toBe(MIDNIGHT_AFTER_FRI.getTime());
    expect(fake.rows("time_sessions").filter((r) => r.ended_at === null), "the clock is off").toEqual([]);
  });
});
