import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LearningItem, Phase } from "../lib/types";
import { commitmentEyebrow, fmtH, learningGlance, phasePacing, timelineGlance } from "./projectTime";

const phase = (name: string, estDays: number, done: string | null = null): Phase => ({
  id: name,
  userId: "u1",
  projectId: "p1",
  createdAt: "2026-07-21T09:00:00.000Z",
  name,
  estDays,
  sortOrder: 0,
  isDone: done !== null,
  completedAt: done,
});

const item = (name: string, progressPct: number, isFocus = false): LearningItem => ({
  id: name,
  userId: "u1",
  projectId: "p1",
  createdAt: "2026-07-21T09:00:00.000Z",
  name,
  progressPct,
  isFocus,
  sortOrder: 0,
});

beforeEach(() => {
  vi.useFakeTimers();
  // Day 6 of a project begun on 21 July.
  vi.setSystemTime(new Date(2026, 6, 26, 10, 0, 0));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("hours as the cards write them", () => {
  it("one decimal, and none for a whole number", () => {
    expect(fmtH(7_200)).toBe("2");
    expect(fmtH(9_000)).toBe("2.5");
    expect(fmtH(0)).toBe("0");
    expect(fmtH(3_590)).toBe("1");
  });
});

describe("where a project stands among its phases", () => {
  it("with nothing done, the current phase began with the project and every phase's days remain", () => {
    expect(phasePacing([phase("Dig", 4), phase("Plant", 6)], "2026-07-21")).toEqual({
      currentPhaseStart: "2026-07-21",
      remainingDays: 10,
      allPhasesDone: false,
    });
  });

  it("the current phase began at the latest completion, and done phases' days no longer remain", () => {
    const phases = [phase("Dig", 4, "2026-07-24"), phase("Sow", 2, "2026-07-23"), phase("Plant", 6)];
    expect(phasePacing(phases, "2026-07-21")).toEqual({
      currentPhaseStart: "2026-07-24",
      remainingDays: 6,
      allPhasesDone: false,
    });
  });

  it("no phases is not every phase done", () => {
    expect(phasePacing([], "2026-07-21").allPhasesDone).toBe(false);
    expect(phasePacing([phase("Dig", 4, "2026-07-24")], "2026-07-21").allPhasesDone).toBe(true);
  });

  it("the line above the clock counts the day of the current phase over the days remaining, then the goal", () => {
    const pacing = phasePacing([phase("Dig", 4, "2026-07-24"), phase("Plant", 6)], "2026-07-21");
    expect(commitmentEyebrow(pacing, 2)).toBe("Day 3 / 6 · Goal 2h");
    expect(commitmentEyebrow(phasePacing([], "2026-07-21"), 2.5)).toBe("Day 6 · Goal 2.5h");
    expect(commitmentEyebrow(phasePacing([phase("Dig", 4, "2026-07-24")], "2026-07-21"), 2)).toBe("Done · Goal 2h");
  });
});

describe("the timeline's glance", () => {
  it("names the first phase not done, and how far the elapsed days reach into its planned days", () => {
    // Five days have passed; the first phase took four of them in the plan.
    const glance = timelineGlance([phase("Dig", 4, "2026-07-24"), phase("Plant", 4)], "2026-07-21");
    expect(glance).toMatchObject({
      total: 2,
      currentIndex: 1,
      doneCount: 1,
      phaseN: 2,
      currentName: "Plant",
      phaseProgress: 25,
      eyebrow: "Phase 2 of 2",
    });
  });

  it("stays between empty and full, and a phase of no days is empty", () => {
    expect(timelineGlance([phase("Dig", 2)], "2026-07-21").phaseProgress).toBe(100);
    expect(timelineGlance([phase("Dig", 10, "2026-07-22"), phase("Plant", 3)], "2026-07-21").phaseProgress).toBe(0);
    expect(timelineGlance([phase("Dig", 0)], "2026-07-21").phaseProgress).toBe(0);
  });

  it("every phase done is full, and no phases says so", () => {
    expect(timelineGlance([phase("Dig", 4, "2026-07-24")], "2026-07-21")).toMatchObject({
      allDone: true,
      currentName: "All phases done",
      phaseProgress: 100,
      eyebrow: "Phase 1 of 1",
    });
    expect(timelineGlance([], "2026-07-21")).toMatchObject({ currentName: "—", eyebrow: "No phases yet", phaseProgress: 0 });
  });
});

describe("the learning card's glance", () => {
  it("shows the flagged item with its own percent, else the first, else none", () => {
    expect(learningGlance([item("Soil", 10), item("Water", 30, true)])).toMatchObject({ focusPct: 30, eyebrow: "30% · Focus" });
    expect(learningGlance([item("Soil", 10), item("Water", 30)]).focus?.name).toBe("Soil");
    expect(learningGlance([])).toEqual({ focus: null, focusPct: 0, eyebrow: "No focus set" });
  });
});
