import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { COMPANION_TASKS, clockSeconds, formatClock, goalPct, listedTaskIds, taskGlance } from "./companionSummary";

const task = (id: string, isDone = false): Task => ({
  id,
  userId: "u1",
  projectId: "p1",
  phaseId: null,
  learningItemId: null,
  text: `task ${id}`,
  isDone,
  sortOrder: 0,
  taskDate: "2026-07-21",
  createdAt: "2026-07-21T09:00:00.000Z",
});

describe("the companion's clock", () => {
  it("a stopped clock shows its reading, whatever the time", () => {
    const clock = { baseSeconds: 125, baseAtMs: 1_000, running: false, date: "2026-07-21" };
    expect(clockSeconds(clock, 1_000)).toBe(125);
    expect(clockSeconds(clock, 9_000_000)).toBe(125);
  });

  it("a running clock shows its reading plus the time since, in whole seconds, however late it is asked", () => {
    const clock = { baseSeconds: 125, baseAtMs: 1_000, running: true, date: "2026-07-21" };
    expect(clockSeconds(clock, 1_000)).toBe(125);
    expect(clockSeconds(clock, 1_999)).toBe(125);
    expect(clockSeconds(clock, 2_000)).toBe(126);
    expect(clockSeconds(clock, 61_500)).toBe(185);
  });

  it("a moment before the reading was taken adds nothing", () => {
    expect(clockSeconds({ baseSeconds: 10, baseAtMs: 5_000, running: true, date: "2026-07-21" }, 4_000)).toBe(10);
  });

  it("reads as minutes and seconds under an hour, and with the hours from then on", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(3_599)).toBe("59:59");
    expect(formatClock(3_600)).toBe("1:00:00");
    expect(formatClock(3_845)).toBe("1:04:05");
    expect(formatClock(-3)).toBe("0:00");
  });

  it("the bar is the share of the daily goal, never past full, and empty with no goal", () => {
    expect(goalPct(3_600, 2)).toBe(50);
    expect(goalPct(9_000, 2)).toBe(100);
    expect(goalPct(3_600, 0)).toBe(0);
  });
});

describe("the companion's tasks", () => {
  it("the heading counts the done among all, and says so when there are none", () => {
    expect(taskGlance([task("a", true), task("b"), task("c")]).eyebrow).toBe("Tasks · 1 of 3 done");
    expect(taskGlance([]).eyebrow).toBe("Tasks · none yet");
    expect(taskGlance([task("a", true), task("b")]).openTasks.map((t) => t.id)).toEqual(["b"]);
  });

  it("a first reading lists the first few open tasks, in list order", () => {
    const tasks = [task("a", true), task("b"), task("c"), task("d"), task("e"), task("f")];
    expect(listedTaskIds(tasks)).toEqual(["b", "c", "d", "e"]);
    expect(listedTaskIds(tasks)).toHaveLength(COMPANION_TASKS);
  });

  it("a later reading keeps a listed task that is now done, drops one that is gone, and fills up with open ones", () => {
    const tasks = [task("b", true), task("c"), task("g"), task("h"), task("i")];
    expect(listedTaskIds(tasks, ["b", "c", "x"])).toEqual(["b", "c", "g", "h"]);
  });
});
