import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setTestUser,
  getTodayLoggedSeconds,
  setActiveProject,
  startSession,
  stopSession,
} from "../db";
import { createFakeSupabase, type FakeRow, type FakeSupabase } from "../fakeSupabase";

const CHECK_ROLL =
  "A clock started at 23:59:00 and still running when the day rolls at 00:00:30 with the tab open: the finishing day stores one session of 60 seconds ending at midnight, today reads 0, and the clock is off";
const CHECK_SLEEP =
  "A clock started at 22:00 with the tab open, the machine asleep from 23:00 until 09:00 the next day: the finishing day stores 2 hours ending at its midnight, today reads 0, and the clock is off";
const CHECK_HAND_STOP =
  "Stopping a clock by hand after its day's midnight credits that day only up to midnight, even when the capping that normally runs first fails";

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

function durations(rows: FakeRow[]): number[] {
  return rows.map((r) => Number(r.duration_seconds));
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

async function quietly(call: Promise<unknown>): Promise<void> {
  await call.catch(() => undefined);
}

describe("a clock that runs past midnight", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(local(2026, 9, 18, 11, 0, 0));
    __setTestUser(USER);
    await setActiveProject("p1");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it(`${CHECK_ROLL}`, async () => {
    open([]);
    vi.setSystemTime(local(2026, 9, 18, 23, 59, 0));
    const started = await startSession();
    expect(started, "harness: the clock started at 23:59:00").not.toBeNull();

    vi.setSystemTime(local(2026, 9, 19, 0, 0, 30));
    await stopSession();

    const friday = sessionsOf("p1", FRI);
    expect(friday.length, `the finishing day stores one session (stored: ${stored()})`).toBe(1);
    expect(durations(friday), "of 60 seconds — not the 90 that passed").toEqual([60]);
    expect(endsAt(friday[0]), "ending at midnight").toBe(MIDNIGHT_AFTER_FRI.getTime());
    expect(sessionsOf("p1", SAT), "today holds no session — the clock does not restart itself").toEqual([]);
    expect(await getTodayLoggedSeconds(), "today reads 0").toBe(0);
    expect(runningRows(), "no session is left running").toEqual([]);
  });

  it(`${CHECK_SLEEP}`, async () => {
    open([]);
    vi.setSystemTime(local(2026, 9, 18, 22, 0, 0));
    const started = await startSession();
    expect(started, "harness: the clock started at 22:00").not.toBeNull();

    vi.setSystemTime(local(2026, 9, 19, 9, 0, 0));
    await stopSession();

    const friday = sessionsOf("p1", FRI);
    expect(friday.length, `the finishing day stores one session (stored: ${stored()})`).toBe(1);
    expect(durations(friday), "of 2 hours (7 200 s) — not the 11 hours that passed").toEqual([7200]);
    expect(endsAt(friday[0]), "ending at its midnight").toBe(MIDNIGHT_AFTER_FRI.getTime());
    expect(await getTodayLoggedSeconds(), "today reads 0").toBe(0);
    expect(runningRows(), "no session is left running").toEqual([]);
  });

  it(`${CHECK_HAND_STOP}`, async () => {
    open([]);
    vi.setSystemTime(local(2026, 9, 18, 23, 0, 0));
    const started = await startSession();
    expect(started, "harness: the clock started at 23:00").not.toBeNull();

    vi.setSystemTime(local(2026, 9, 19, 1, 0, 0));
    fake.failNext("time_sessions", "update");
    await quietly(getTodayLoggedSeconds());
    expect(
      fake.requests.some((r) => r.table === "time_sessions" && r.operation === "update" && r.error !== null),
      "harness: the capping ran first and failed",
    ).toBe(true);
    expect(runningRows().length, "harness: the session is still open after the failed capping").toBe(1);

    await quietly(stopSession());

    const friday = sessionsOf("p1", FRI);
    expect(friday.length, `Friday holds one session (stored: ${stored()})`).toBe(1);
    expect(durations(friday), "credited only up to midnight: 3 600 s, not the 7 200 that passed").toEqual([3600]);
    expect(endsAt(friday[0]), "ending at midnight").toBe(MIDNIGHT_AFTER_FRI.getTime());
    expect(runningRows(), "the clock is off").toEqual([]);
  });
});
