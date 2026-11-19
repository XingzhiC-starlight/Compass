import { describe, it, expect } from "vitest";
import type { TimeSession } from "../types";
import { loggedSecondsOn, localDayEnd, closeSessionAt } from "../transforms";

describe("localDayEnd and closeSessionAt", () => {
  it("localDayEnd is the local midnight that closes the day, across month and year ends", () => {
    expect(localDayEnd("2026-09-18").getTime()).toBe(new Date(2026, 8, 19, 0, 0, 0).getTime());
    expect(localDayEnd("2026-09-30").getTime()).toBe(new Date(2026, 9, 1).getTime());
    expect(localDayEnd("2026-12-31").getTime()).toBe(new Date(2027, 0, 1).getTime());
    expect(localDayEnd("2028-02-29").getTime()).toBe(new Date(2028, 2, 1).getTime());
  });

  it("closeSessionAt ends at now while the day is still on, and at the day's end once midnight has passed", () => {
    const startedAt = new Date(2026, 8, 18, 23, 59, 0).toISOString();
    const stillFriday = new Date(2026, 8, 18, 23, 59, 45).getTime();
    expect(closeSessionAt(startedAt, "2026-09-18", stillFriday)).toEqual({
      endedAt: new Date(stillFriday).toISOString(),
      durationSeconds: 45,
    });
    const saturdayMorning = new Date(2026, 8, 19, 9, 0, 0).getTime();
    expect(closeSessionAt(startedAt, "2026-09-18", saturdayMorning)).toEqual({
      endedAt: new Date(2026, 8, 19, 0, 0, 0).toISOString(),
      durationSeconds: 60,
    });
  });

  it("closeSessionAt floors to whole seconds and never credits a negative duration", () => {
    const startedAt = new Date(2026, 8, 18, 10, 0, 0, 0).toISOString();
    expect(closeSessionAt(startedAt, "2026-09-18", new Date(2026, 8, 18, 10, 0, 1, 999).getTime()).durationSeconds).toBe(1);
    expect(closeSessionAt(startedAt, "2026-09-18", new Date(2026, 8, 18, 9, 0, 0).getTime()).durationSeconds).toBe(0);
  });

  it("loggedSecondsOn counts a still-running session only up to its own day's end", () => {
    const running: TimeSession = {
      id: "r",
      projectId: "p",
      userId: "u",
      startedAt: new Date(2026, 8, 18, 22, 0, 0).toISOString(),
      endedAt: null,
      durationSeconds: 0,
      sessionDate: "2026-09-18",
      createdAt: new Date(2026, 8, 18, 22, 0, 0).toISOString(),
    };
    const saturday9 = new Date(2026, 8, 19, 9, 0, 0).getTime();
    expect(loggedSecondsOn([running], "2026-09-18", saturday9)).toBe(2 * 3600);
    expect(loggedSecondsOn([running], "2026-09-19", saturday9)).toBe(0);
    const friday2230 = new Date(2026, 8, 18, 22, 30, 0).getTime();
    expect(loggedSecondsOn([running], "2026-09-18", friday2230)).toBe(1800);
  });
});
