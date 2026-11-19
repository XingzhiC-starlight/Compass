import { describe, it, expect } from "vitest";
import {
  projectFromRow,
  phaseFromRow,
  phaseToRow,
  learningItemFromRow,
  learningItemToRow,
  taskFromRow,
  taskToRow,
  thoughtFromRow,
  thoughtToRow,
  thoughtGroupFromRow,
  timeSessionFromRow,
  timeSessionToRow,
} from "../transforms";

describe("row mappers", () => {
  it("project: maps every field", () => {
    const row = {
      id: "p1",
      user_id: "u1",
      name: "Compass",
      accent_color: "#9A7B4F",
      sort_order: 2,
      archived_at: null,
      total_days: 30,
      hours_planned_per_day: 4.5,
      hours_available_per_day: 6,
      started_at: "2026-06-13",
      created_at: "2026-06-13T10:00:00.000Z",
    } as never;
    const p = projectFromRow(row);
    expect(p).toEqual({
      id: "p1",
      userId: "u1",
      name: "Compass",
      accentColor: "#9A7B4F",
      sortOrder: 2,
      archivedAt: null,
      totalDays: 30,
      hoursPlannedPerDay: 4.5,
      hoursAvailablePerDay: 6,
      startedAt: "2026-06-13",
      createdAt: "2026-06-13T10:00:00.000Z",
    });
  });

  it("phase: maps a nullable completed_at both ways", () => {
    const open = phaseFromRow({
      id: "ph1", user_id: "u1", project_id: "p1", name: "Build",
      est_days: 10, sort_order: 0, is_done: false, completed_at: null,
      created_at: "2026-06-13T10:00:00.000Z",
    } as never);
    expect(open.completedAt).toBeNull();
    expect(open.isDone).toBe(false);
    expect(phaseToRow({ isDone: true, completedAt: "2026-06-14" })).toEqual({
      is_done: true,
      completed_at: "2026-06-14",
    });
  });

  it("learning item: round-trips is_focus / progress_pct", () => {
    const li = learningItemFromRow({
      id: "l1", user_id: "u1", project_id: "p1", name: "React",
      sort_order: 1, progress_pct: 30, is_focus: true,
      created_at: "2026-06-13T10:00:00.000Z",
    } as never);
    expect(li).toMatchObject({ progressPct: 30, isFocus: true, sortOrder: 1 });
    expect(learningItemToRow({ progressPct: 55, isFocus: false })).toEqual({
      progress_pct: 55,
      is_focus: false,
    });
  });

  it("task: maps the dormant nullable cross-links", () => {
    const t = taskFromRow({
      id: "t1", user_id: "u1", project_id: "p1", text: "Do it", is_done: false,
      sort_order: 0, task_date: "2026-06-13", phase_id: null, learning_item_id: null,
      created_at: "2026-06-13T10:00:00.000Z",
    } as never);
    expect(t).toMatchObject({ phaseId: null, learningItemId: null, taskDate: "2026-06-13" });
    expect(taskToRow({ text: "x", isDone: true })).toEqual({ text: "x", is_done: true });
  });

  it("thought: maps optional title and nullable group_id", () => {
    const t = thoughtFromRow({
      id: "th1", user_id: "u1", project_id: "p1", title: null, text: "idea",
      sort_order: 0, group_id: null, created_at: "2026-06-13T10:00:00.000Z",
    } as never);
    expect(t).toMatchObject({ title: "", text: "idea", groupId: null });
    expect(thoughtToRow({ title: "Heading", groupId: "g1", sortOrder: 2 })).toEqual({
      title: "Heading",
      group_id: "g1",
      sort_order: 2,
    });
  });

  it("thought group + time session: round-trip incl. null ended_at", () => {
    const g = thoughtGroupFromRow({
      id: "g1", user_id: "u1", project_id: "p1", name: "Cluster", sort_order: 1,
      created_at: "2026-06-13T10:00:00.000Z",
    } as never);
    expect(g).toMatchObject({ name: "Cluster", sortOrder: 1 });

    const s = timeSessionFromRow({
      id: "s1", user_id: "u1", project_id: "p1",
      started_at: "2026-06-13T10:00:00.000Z", ended_at: null,
      duration_seconds: 0, session_date: "2026-06-13",
      created_at: "2026-06-13T10:00:00.000Z",
    } as never);
    expect(s).toMatchObject({ endedAt: null, durationSeconds: 0, sessionDate: "2026-06-13" });
    expect(timeSessionToRow({ endedAt: "2026-06-13T11:00:00.000Z", durationSeconds: 3600 })).toEqual({
      ended_at: "2026-06-13T11:00:00.000Z",
      duration_seconds: 3600,
    });
  });
});
