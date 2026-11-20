/**
 * What the companion window shows, worked out from plain data (spec §23). Pure: no React, no
 * database. Where a line repeats a card's glance it is the card's own function
 * (`src/dashboard/projectTime.ts`), so the two windows cannot tell two stories.
 */
import type { ID, Task } from "../lib/types";

/** How many open tasks the companion lists before it counts the rest. */
export const COMPANION_TASKS = 4;

/**
 * The clock as a reading and the moment it was taken, not a counter that adds one: a timer
 * that fires late, as a hidden window's does, still shows the right time when it fires.
 */
export interface CompanionClock {
  /** Today's seconds on the project when the reading was taken. */
  baseSeconds: number;
  /** When it was taken, in milliseconds. */
  baseAtMs: number;
  running: boolean;
  /** The local day the reading belongs to. */
  date: string;
}

/** The whole seconds to show at `nowMs`. */
export function clockSeconds(clock: CompanionClock, nowMs: number): number {
  if (!clock.running) return Math.floor(clock.baseSeconds);
  return Math.floor(clock.baseSeconds + Math.max(0, (nowMs - clock.baseAtMs) / 1000));
}

/** A running clock's face: "4:05" under an hour, "1:04:05" from then on. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** How much of the daily goal is done, 0 to 100, and 0 with no goal. */
export function goalPct(loggedSeconds: number, plannedHours: number): number {
  const plan = plannedHours * 3600;
  return plan > 0 ? Math.min(100, Math.round((loggedSeconds / plan) * 100)) : 0;
}

/** The task section's heading and the open tasks, in list order. */
export function taskGlance(tasks: Task[]): { eyebrow: string; total: number; openTasks: Task[] } {
  const done = tasks.filter((t) => t.isDone).length;
  return {
    eyebrow: tasks.length ? `Tasks · ${done} of ${tasks.length} done` : "Tasks · none yet",
    total: tasks.length,
    openTasks: tasks.filter((t) => !t.isDone),
  };
}

/**
 * The tasks listed when a reading arrives: those already listed that still exist, done or not,
 * so one ticked a moment ago keeps its place, then open ones in list order, up to the count.
 */
export function listedTaskIds(tasks: Task[], listed: ID[] = []): ID[] {
  const kept = listed.filter((id) => tasks.some((t) => t.id === id)).slice(0, COMPANION_TASKS);
  const open = tasks.filter((t) => !t.isDone && !kept.includes(t.id)).map((t) => t.id);
  return [...kept, ...open].slice(0, COMPANION_TASKS);
}
