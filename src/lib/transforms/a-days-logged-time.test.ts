import { describe, it, expect } from "vitest";
import type { TimeSession } from "../types";
import { loggedSecondsOn, bucketDailyTime, deriveDashboardTime } from "../transforms";

const sess = (sessionDate: string, durationSeconds: number, ended = true, startedAt = `${sessionDate}T10:00:00.000Z`): TimeSession => ({
  id: `s-${sessionDate}-${durationSeconds}`, projectId: "p1", userId: "u1",
  startedAt, endedAt: ended ? `${sessionDate}T11:00:00.000Z` : null,
  durationSeconds, sessionDate, createdAt: startedAt,
});

describe("loggedSecondsOn", () => {
  it("sums ended sessions for the date and counts a running session live", () => {
    const now = new Date("2026-06-13T10:30:00.000Z").getTime();
    const sessions = [
      sess("2026-06-13", 600),
      sess("2026-06-13", 0, false),
      sess("2026-06-12", 999),
    ];
    expect(loggedSecondsOn(sessions, "2026-06-13", now)).toBe(600 + 1800);
  });
});

describe("bucketDailyTime", () => {
  it("returns one row per day oldest-first, zero-filling empty days", () => {
    const now = new Date("2026-06-13T12:00:00.000Z");
    const out = bucketDailyTime([sess("2026-06-13", 3600)], 3, now);
    expect(out.map((d) => d.date)).toEqual(["2026-06-11", "2026-06-12", "2026-06-13"]);
    expect(out.map((d) => d.loggedSeconds)).toEqual([0, 0, 3600]);
  });
});

describe("deriveDashboardTime", () => {
  it("derives loggedSeconds, running, and daily from one shared now", () => {
    const now = new Date("2026-06-13T10:30:00.000Z");
    const out = deriveDashboardTime([
      sess("2026-06-12", 1200),
      sess("2026-06-13", 600),
      sess("2026-06-13", 0, false, "2026-06-13T10:00:00.000Z"),
    ], 2, now);

    expect(out.running).toBe(true);
    expect(out.loggedSeconds).toBe(2400);
    expect(out.daily.map((d) => d.date)).toEqual(["2026-06-12", "2026-06-13"]);
    expect(out.daily.map((d) => d.loggedSeconds)).toEqual([1200, 2400]);
  });

  it("uses the same running-session elapsed time in today's total and daily bucket", () => {
    const now = new Date("2026-06-13T10:45:00.000Z");
    const out = deriveDashboardTime([
      sess("2026-06-13", 0, false, "2026-06-13T10:00:00.000Z"),
    ], 1, now);

    expect(out.loggedSeconds).toBe(2700);
    expect(out.daily[0].loggedSeconds).toBe(out.loggedSeconds);
  });

  it("returns running false when all sessions are closed", () => {
    const out = deriveDashboardTime([sess("2026-06-13", 900)], 1, new Date("2026-06-13T12:00:00.000Z"));
    expect(out.running).toBe(false);
    expect(out.loggedSeconds).toBe(900);
  });
});
