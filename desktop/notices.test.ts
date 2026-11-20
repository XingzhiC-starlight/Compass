import { describe, expect, it } from "vitest";
import type { ClockReading } from "./menuBar";
import { goalNotice } from "./notices";

const CHECK =
  "The desktop app sends one note, when the running clock is seen to cross the project's daily goal by running, and none for a goal already behind, a project with no goal, another project, another day or time typed in by hand (spec §22)";

const T0 = new Date(2026, 10, 20, 15, 0, 0).getTime();

/** A reading whose instant moves with its seconds, as a clock left to run does, unless said otherwise. */
const reading = (over: Partial<ClockReading> = {}): ClockReading => {
  const seconds = over.seconds ?? 0;
  return {
    projectId: "garden",
    projectName: "Garden",
    date: "2026-11-20",
    seconds,
    goalSeconds: 2 * 3600,
    atMs: T0 + seconds * 1000,
    ...over,
  };
};

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

  it(`${CHECK} — time typed in by hand, which moves the total further than the clock could, says nothing`, () => {
    const before = reading({ seconds: 1800 });
    const fiveSecondsOn = before.atMs + 5000;
    // The total typed up past the goal.
    expect(goalNotice(before, reading({ seconds: 7300, atMs: fiveSecondsOn }))).toBeNull();
    // A typed total seen half saved, the new total and the running session both counted.
    expect(goalNotice(before, reading({ seconds: 1800 + 5760, atMs: fiveSecondsOn }))).toBeNull();
    // The same five seconds made by the clock do say it.
    expect(goalNotice(reading({ seconds: 7197 }), reading({ seconds: 7202 }))).not.toBeNull();
  });

  it(`${CHECK} — a look that comes late, as after the computer slept with the clock running, still says it`, () => {
    const before = reading({ seconds: 5400 });
    expect(goalNotice(before, reading({ seconds: 9000, atMs: before.atMs + 3_600_000 }))).not.toBeNull();
  });

  it(`${CHECK} — it is once for each crossing the clock makes: after a total typed lower, the next crossing says it again`, () => {
    expect(goalNotice(reading({ seconds: 7198 }), reading({ seconds: 7201 }))).not.toBeNull();
    expect(goalNotice(reading({ seconds: 7201 }), reading({ seconds: 7206 }))).toBeNull();
    expect(goalNotice(reading({ seconds: 7199 }), reading({ seconds: 7203 }))).not.toBeNull();
  });
});
