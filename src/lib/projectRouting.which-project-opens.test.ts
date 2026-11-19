import { describe, expect, it } from "vitest";
import type { Project } from "./types";
import { chooseActiveProject } from "./projectRouting";

const project = (id: string, sortOrder: number): Project => ({
  id,
  userId: "u1",
  name: id,
  accentColor: "#9A7B4F",
  sortOrder,
  archivedAt: null,
  totalDays: 10,
  hoursPlannedPerDay: 2,
  hoursAvailablePerDay: 3,
  startedAt: "2026-06-25",
  createdAt: "2026-06-25T00:00:00.000Z",
});

describe("chooseActiveProject", () => {
  it("keeps the current active project when it still exists", () => {
    expect(chooseActiveProject([project("p1", 0), project("p2", 1)], "p2")).toBe("p2");
  });

  it("falls back to first live project when active id is stale", () => {
    expect(chooseActiveProject([project("p1", 0), project("p2", 1)], "missing")).toBe("p1");
  });

  it("returns null when no live projects remain", () => {
    expect(chooseActiveProject([], "p1")).toBeNull();
  });
});
