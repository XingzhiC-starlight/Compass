import type { LearningItem, Phase } from "../lib/types";

// Parse a "yyyy-mm-dd" date as a LOCAL calendar day (not UTC), so day
// boundaries line up with the user's clock.
function parseLocal(date: string): Date {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function dayNumber(startedAt: string): number {
  const start = parseLocal(startedAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1;
}

/** Hours to one decimal, a whole number without it: "2", "2.5". */
export function fmtH(seconds: number): string {
  const h = Math.round((seconds / 3600) * 10) / 10;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

/** Where a project stands among its phases: what the Commitment card's eyebrow counts from. */
export interface PhasePacing {
  /** The day the current phase began: the latest completion, else the project's start. */
  currentPhaseStart: string;
  /** The planned days of every phase not yet done. */
  remainingDays: number;
  allPhasesDone: boolean;
}

export function phasePacing(phases: Phase[], startedAt: string): PhasePacing {
  const completedDates = phases.filter((p) => p.isDone && p.completedAt).map((p) => p.completedAt as string);
  return {
    currentPhaseStart: completedDates.length ? completedDates.reduce((a, b) => (b > a ? b : a)) : startedAt,
    remainingDays: phases.filter((p) => !p.isDone).reduce((s, p) => s + p.estDays, 0),
    allPhasesDone: phases.length > 0 && phases.every((p) => p.isDone),
  };
}

/** The line above the clock: "Day 3 / 12 · Goal 5h", or "Done · Goal 5h" once every phase is done. */
export function commitmentEyebrow(pacing: PhasePacing, plannedHours: number): string {
  const goal = `Goal ${fmtH(plannedHours * 3600)}h`;
  if (pacing.allPhasesDone) return `Done · ${goal}`;
  const phaseDayN = Math.max(1, dayNumber(pacing.currentPhaseStart));
  return `Day ${phaseDayN}${pacing.remainingDays > 0 ? ` / ${pacing.remainingDays}` : ""} · ${goal}`;
}

/** The Timeline card's glance: which phase is current and how far through its planned days. */
export interface TimelineGlance {
  total: number;
  /** The first phase not done, or -1 when there is none. */
  currentIndex: number;
  allDone: boolean;
  doneCount: number;
  phaseN: number;
  currentName: string;
  /** 0 to 100. */
  phaseProgress: number;
  eyebrow: string;
}

export function timelineGlance(phases: Phase[], startedAt: string): TimelineGlance {
  const total = phases.length;
  const currentIndex = phases.findIndex((p) => !p.isDone);
  const allDone = total > 0 && currentIndex === -1;
  const phaseN = allDone ? total : currentIndex + 1;
  const elapsed = Math.max(0, dayNumber(startedAt) - 1);
  let before = 0;
  for (let i = 0; i < currentIndex; i++) before += Math.max(0, phases[i].estDays);
  const current = currentIndex >= 0 ? phases[currentIndex] : null;
  const phaseProgress = allDone
    ? 100
    : current && current.estDays > 0
      ? Math.max(0, Math.min(100, ((elapsed - before) / current.estDays) * 100))
      : 0;
  return {
    total,
    currentIndex,
    allDone,
    doneCount: phases.filter((p) => p.isDone).length,
    phaseN,
    currentName: allDone ? "All phases done" : total > 0 ? phases[currentIndex].name : "—",
    phaseProgress,
    eyebrow: total ? `Phase ${phaseN} of ${total}` : "No phases yet",
  };
}

/** The Learning card's glance: the flagged item, else the first, with its own percent. */
export interface LearningGlance {
  focus: LearningItem | null;
  focusPct: number;
  eyebrow: string;
}

export function learningGlance(items: LearningItem[]): LearningGlance {
  const focus = items.find((it) => it.isFocus) ?? items[0] ?? null;
  const focusPct = focus ? focus.progressPct : 0;
  return { focus, focusPct, eyebrow: focus ? `${focusPct}% · Focus` : "No focus set" };
}
