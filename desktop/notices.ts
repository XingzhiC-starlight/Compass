/**
 * The one note the desktop app sends (spec §22): the day's goal reached on the project whose
 * clock is running. It marks a good moment and never a missed one. `goalNotice` is pure: two
 * readings of the clock come in, and the note to show, or none, goes out. `goalWatch` is what
 * the app keeps between its looks: the reading before, and which projects it has told today.
 */
import { fmtH } from "../src/dashboard/projectTime";
import type { ClockReading } from "./menuBar";

export interface Notice {
  title: string;
  body: string;
}

/** How far a reading may run ahead of the time that passed between two looks, in seconds. */
const SLACK_SECONDS = 2;

/**
 * The note for the goal reached between two looks at the clock, or null. It is sent only when
 * the crossing is seen and the clock made it: the look before was at the same project on the
 * same day and under this look's goal, this one is at the goal or past it, and the time on
 * the project grew by no more than the time that passed between the two looks. So opening
 * the app, or starting a clock, with the goal already behind says nothing; neither does a
 * project with no goal; and neither does time typed in by hand, which moves the total in one
 * step, a save of it seen half done included.
 */
export function goalNotice(before: ClockReading | null, now: ClockReading | null): Notice | null {
  if (!before || !now) return null;
  if (before.projectId !== now.projectId || before.date !== now.date) return null;
  if (now.goalSeconds <= 0) return null;
  if (before.seconds >= now.goalSeconds || now.seconds < now.goalSeconds) return null;
  const passed = Math.max(0, (now.atMs - before.atMs) / 1000);
  if (now.seconds - before.seconds > passed + SLACK_SECONDS) return null;
  return {
    title: now.projectName || "Compass",
    body: `You've reached today's goal of ${fmtH(now.goalSeconds)}h.`,
  };
}

export interface GoalWatch {
  /**
   * One look at the clock. The note to show now, or null. `wanted` is the person's choice
   * (spec §22): with it off no note is given, and the look is still kept as the one before.
   */
  look(now: ClockReading | null, wanted: boolean): Notice | null;
}

/**
 * The looks the app takes, one after another. A project is told once a day and no more: a
 * second crossing on the same day, after the goal was raised or the day's total typed lower,
 * says nothing. What it remembers is in memory alone and ends with the app.
 */
export function goalWatch(): GoalWatch {
  let before: ClockReading | null = null;
  let toldOn = "";
  let told = new Set<string>();
  return {
    look(now, wanted) {
      const notice = wanted ? goalNotice(before, now) : null;
      before = now;
      if (!notice || !now) return null;
      if (toldOn !== now.date) {
        toldOn = now.date;
        told = new Set();
      }
      if (told.has(now.projectId)) return null;
      told.add(now.projectId);
      return notice;
    },
  };
}
