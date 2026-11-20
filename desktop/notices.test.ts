import { describe, expect, it } from "vitest";
import type { ClockReading } from "./menuBar";
import { goalNotice } from "./notices";

const CHECK =
  "The desktop app sends one note, when the running clock is seen to cross the project's daily goal, and none for a goal already behind, a project with no goal, another project or another day (spec §22)";

const reading = (over: Partial<ClockReading> = {}): ClockReading => ({
  projectId: "garden",
  projectName: "Garden",
  date: "2026-11-20",
  seconds: 0,
  goalSeconds: 2 * 3600,
  ...over,
});

describe("the note at the day's goal", () => {
  it(`${CHECK} — under the goal at one look and at it at the next: the note, named for the project`, () => {
    expect(goalNotice(reading({ seconds: 7195 }), reading({ seconds: 7200 }))).toEqual({
      title: "Garden",
      body: "You've reached today's goal of 2h.",
    });
    expect(goalNotice(reading({ seconds: 100 }), reading({ seconds: 9000 }))).not.toBeNull();
  });

  it(`${CHECK} — a goal of two and a half hours is written with its half, and a project with no name is Compass`, () => {
    const now = reading({ seconds: 9000, goalSeconds: 9000, projectName: "" });
    expect(goalNotice(reading({ seconds: 8999, goalSeconds: 9000 }), now)).toEqual({
      title: "Compass",
      body: "You've reached today's goal of 2.5h.",
    });
  });

  it(`${CHECK} — still under it, or already past it at the look before: nothing`, () => {
    expect(goalNotice(reading({ seconds: 10 }), reading({ seconds: 15 }))).toBeNull();
    expect(goalNotice(reading({ seconds: 7200 }), reading({ seconds: 7205 }))).toBeNull();
    expect(goalNotice(reading({ seconds: 9000 }), reading({ seconds: 9005 }))).toBeNull();
  });

  it(`${CHECK} — no look before, or no clock now: nothing, so opening the app past the goal says nothing`, () => {
    expect(goalNotice(null, reading({ seconds: 9000 }))).toBeNull();
    expect(goalNotice(reading({ seconds: 7195 }), null)).toBeNull();
    expect(goalNotice(null, null)).toBeNull();
  });

  it(`${CHECK} — another project, or another day, at the look before: nothing`, () => {
    expect(goalNotice(reading({ projectId: "shed", seconds: 10 }), reading({ seconds: 7300 }))).toBeNull();
    expect(goalNotice(reading({ date: "2026-11-19", seconds: 10 }), reading({ seconds: 7300 }))).toBeNull();
  });

  it(`${CHECK} — a project with no goal: nothing`, () => {
    expect(goalNotice(reading({ seconds: 10, goalSeconds: 0 }), reading({ seconds: 7300, goalSeconds: 0 }))).toBeNull();
  });

  it(`${CHECK} — a goal lowered under the time already done says nothing`, () => {
    expect(goalNotice(reading({ seconds: 5000, goalSeconds: 7200 }), reading({ seconds: 5005, goalSeconds: 3600 }))).toBeNull();
  });
});
