import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setTestUser,
  listDailyTime,
  onWriteError,
  setActiveProject,
  setLoggedSecondsForDate,
} from "../db";
import { createFakeSupabase, type FakeRow, type FakeSupabase } from "../fakeSupabase";

const CHECK_EDIT_INSERT_FAILS =
  "Editing a day's hours by hand when the new total cannot be written: the day's sessions and total are unchanged, and the note shows once";
const CHECK_EDIT_DELETE_FAILS =
  "Editing a day's hours by hand when the new total was written but the day's earlier sessions could not be removed: the day reads its previous hours plus the entered ones, the note shows once, and a second edit of that day leaves exactly the entered hours";
const CHECK_EDIT_OK =
  "A successful edit of a day's hours leaves exactly one session for that project and day, its duration the entered hours × 3600 seconds, and other projects' sessions on that day untouched";
const CHECK_TWO_EDITS =
  "Two edits of the same day sent in quick succession end with exactly one session for that day, holding the later value";

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

const TUE = "2026-09-15";

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

function durations(rows: FakeRow[]): number[] {
  return rows.map((r) => Number(r.duration_seconds));
}

function stored(): string {
  return fake
    .rows("time_sessions")
    .map((r) => `${r.project_id} ${r.session_date} ${r.duration_seconds}s ${r.ended_at === null ? "running" : "ended"}`)
    .join(" | ");
}

async function dayReads(date: string): Promise<number | undefined> {
  return (await listDailyTime(49)).find((day) => day.date === date)?.loggedSeconds;
}

async function quietly(call: Promise<unknown>): Promise<void> {
  await call.catch(() => undefined);
}

let notes = 0;
let unsubscribe: () => void = () => {};

describe("editing a day's hours by hand", () => {
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

  it(`${CHECK_EDIT_INSERT_FAILS}`, async () => {
    open([endedSession("a", "p1", TUE, 1800), endedSession("b", "p1", TUE, 1200)]);
    const before = sessionsOf("p1", TUE);
    fake.failNext("time_sessions", "insert");

    await quietly(setLoggedSecondsForDate(TUE, 2 * 3600));

    expect(sessionsOf("p1", TUE), `the day's sessions are unchanged (stored: ${stored()})`).toEqual(before);
    expect(await dayReads(TUE), "the day's total is unchanged: 3 000 s").toBe(3000);
    expect(notes, "the note shows once").toBe(1);
  });

  it(`${CHECK_EDIT_DELETE_FAILS}`, async () => {
    open([endedSession("old", "p1", TUE, 3600)]);
    fake.failNext("time_sessions", "delete");

    await quietly(setLoggedSecondsForDate(TUE, 2 * 3600));

    expect(
      await dayReads(TUE),
      `the day reads its previous hours plus the entered ones: 1 h + 2 h = 10 800 s (stored: ${stored()})`,
    ).toBe(10800);
    expect(notes, "the note shows once").toBe(1);

    await setLoggedSecondsForDate(TUE, 2 * 3600);

    expect(
      durations(sessionsOf("p1", TUE)),
      `a second edit leaves exactly the entered hours: one session of 7 200 s (stored: ${stored()})`,
    ).toEqual([7200]);
    expect(await dayReads(TUE), "the day reads exactly the entered hours").toBe(7200);
    expect(notes, "the second edit shows no note").toBe(1);
  });

  it(`${CHECK_EDIT_OK}`, async () => {
    open([
      endedSession("a", "p1", TUE, 1800),
      endedSession("b", "p1", TUE, 1200),
      endedSession("theirs", "p2", TUE, 3600),
    ]);
    const otherBefore = sessionsOf("p2", TUE);

    await setLoggedSecondsForDate(TUE, 2.5 * 3600);

    const mine = sessionsOf("p1", TUE);
    expect(mine.length, `exactly one session for that project and day (stored: ${stored()})`).toBe(1);
    expect(durations(mine), "its duration the entered hours × 3600 seconds").toEqual([9000]);
    expect(mine[0].ended_at, "the session is already ended").not.toBeNull();
    expect(sessionsOf("p2", TUE), "the other project's session on that day is untouched").toEqual(otherBefore);
    expect(notes, "nothing failed, no note").toBe(0);
  });

  it(`${CHECK_TWO_EDITS}`, async () => {
    open([endedSession("old", "p1", TUE, 3600)]);

    await Promise.all([setLoggedSecondsForDate(TUE, 1 * 3600), setLoggedSecondsForDate(TUE, 2 * 3600)]);

    expect(
      durations(sessionsOf("p1", TUE)),
      `exactly one session for that day, holding the later value (stored: ${stored()})`,
    ).toEqual([7200]);
    expect(await dayReads(TUE), "the day reads the later value").toBe(7200);
    expect(notes, "nothing failed, no note").toBe(0);
  });
});
