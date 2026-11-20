/**
 * The one note the desktop app sends (spec §22): the day's goal reached on the project whose
 * clock is running. It marks a good moment and never a missed one. Pure: two readings of the
 * clock come in, and the note to show, or none, goes out.
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
