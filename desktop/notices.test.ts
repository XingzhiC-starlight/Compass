import { describe, expect, it } from "vitest";
import type { ClockReading } from "./menuBar";
import { goalNotice, goalWatch } from "./notices";

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

  it(`${CHECK} — the rule alone answers each crossing it is shown; keeping it to once a day is the watch's part`, () => {
    expect(goalNotice(reading({ seconds: 7198 }), reading({ seconds: 7201 }))).not.toBeNull();
    expect(goalNotice(reading({ seconds: 7201 }), reading({ seconds: 7206 }))).toBeNull();
    expect(goalNotice(reading({ seconds: 7199 }), reading({ seconds: 7203 }))).not.toBeNull();
  });
});

const ONCE =
  "The looks the app takes, one after another: a project is told once a day and no more, each project and each day apart, and with the note turned off nothing is told and the look is still kept (spec §22)";

describe("the watch over the day's goal", () => {
  it(`${ONCE} — the first look says nothing, the crossing says it, and the looks after it are quiet`, () => {
    const watch = goalWatch();
    expect(watch.look(reading({ seconds: 7190 }), true)).toBeNull();
    expect(watch.look(reading({ seconds: 7200 }), true)).toEqual({ title: "Garden", body: "You've reached today's goal of 2h." });
    expect(watch.look(reading({ seconds: 7205 }), true)).toBeNull();
  });

  it(`${ONCE} — a second crossing the same day, after the total was typed lower or the goal raised, says nothing`, () => {
    const watch = goalWatch();
    watch.look(reading({ seconds: 7198 }), true);
    expect(watch.look(reading({ seconds: 7201 }), true)).not.toBeNull();
    // The day's total typed lower, and the clock crossing the goal again.
    watch.look(reading({ seconds: 7100, atMs: T0 + 7_300_000 }), true);
    expect(watch.look(reading({ seconds: 7203, atMs: T0 + 7_403_000 }), true)).toBeNull();
    // The goal raised to three hours, and crossed.
    watch.look(reading({ seconds: 10_798, goalSeconds: 10_800 }), true);
    expect(watch.look(reading({ seconds: 10_801, goalSeconds: 10_800 }), true)).toBeNull();
  });

  it(`${ONCE} — another project the same day is told for itself, and the first is still not told twice`, () => {
    const watch = goalWatch();
    watch.look(reading({ seconds: 7198 }), true);
    expect(watch.look(reading({ seconds: 7201 }), true)).not.toBeNull();
    watch.look(reading({ projectId: "shed", projectName: "Shed", seconds: 7198 }), true);
    expect(watch.look(reading({ projectId: "shed", projectName: "Shed", seconds: 7201 }), true)).toMatchObject({ title: "Shed" });
    watch.look(reading({ seconds: 7100, atMs: T0 + 7_300_000 }), true);
    expect(watch.look(reading({ seconds: 7203, atMs: T0 + 7_403_000 }), true)).toBeNull();
  });

  it(`${ONCE} — the next day the same project is told again`, () => {
    const watch = goalWatch();
    watch.look(reading({ seconds: 7198 }), true);
    expect(watch.look(reading({ seconds: 7201 }), true)).not.toBeNull();
    watch.look(reading({ date: "2026-11-21", seconds: 7198 }), true);
    expect(watch.look(reading({ date: "2026-11-21", seconds: 7201 }), true)).not.toBeNull();
  });

  it(`${ONCE} — with the note off the crossing says nothing, the look is kept, and turning it on announces no crossing already made`, () => {
    const watch = goalWatch();
    watch.look(reading({ seconds: 7198 }), false);
    expect(watch.look(reading({ seconds: 7201 }), false)).toBeNull();
    expect(watch.look(reading({ seconds: 7206 }), true)).toBeNull();
  });

  it(`${ONCE} — a clock stopped and started again begins from nothing: a look with no reading takes the place of the one before`, () => {
    const watch = goalWatch();
    watch.look(reading({ seconds: 7198 }), true);
    watch.look(null, true);
    expect(watch.look(reading({ seconds: 7201 }), true)).toBeNull();
  });
});
