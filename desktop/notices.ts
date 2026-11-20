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

/**
 * The note for the goal reached between two looks at the clock, or null. It is sent only when
 * the crossing is seen: the look before was at the same project on the same day and under its
 * goal, and this one is at it or past it. So opening the app, or starting a clock, with the
 * goal already behind says nothing, and neither does a project with no goal.
 */
export function goalNotice(before: ClockReading | null, now: ClockReading | null): Notice | null {
  if (!before || !now) return null;
  if (before.projectId !== now.projectId || before.date !== now.date) return null;
  if (now.goalSeconds <= 0) return null;
  if (before.seconds >= now.goalSeconds || now.seconds < now.goalSeconds) return null;
  return {
    title: now.projectName || "Compass",
    body: `You've reached today's goal of ${fmtH(now.goalSeconds)}h.`,
  };
}
