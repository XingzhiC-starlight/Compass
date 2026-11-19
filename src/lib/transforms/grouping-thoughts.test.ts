import { describe, it, expect } from "vitest";
import type { Thought, ThoughtGroup } from "../types";
import { computeGroup, computeUngroup, computeMerge, computePop } from "../transforms";

const th = (id: string, sortOrder: number, groupId: string | null = null, createdAt = `2026-06-13T10:0${sortOrder}:00.000Z`): Thought => ({
  id, projectId: "p1", userId: "u1", title: "", text: id, sortOrder, groupId, createdAt,
});
const gr = (id: string, sortOrder: number): ThoughtGroup => ({
  id, projectId: "p1", userId: "u1", name: id, sortOrder, createdAt: "2026-06-13T09:00:00.000Z",
});
const newGroup = { id: "gNew", name: "Cluster", projectId: "p1", userId: "u1", createdAt: "2026-06-13T12:00:00.000Z" };

describe("computeGroup", () => {
  it("groups loose thoughts into a new group and renumbers the feed gap-free", () => {
    const thoughts = [th("a", 0), th("b", 1), th("c", 2)];
    const { thoughts: out, groups } = computeGroup(thoughts, [], ["b", "c"], newGroup);

    const inGroup = out.filter((t) => t.groupId === "gNew").sort((x, y) => x.sortOrder - y.sortOrder);
    expect(inGroup.map((t) => t.id)).toEqual(["b", "c"]);
    expect(inGroup.map((t) => t.sortOrder)).toEqual([0, 1]);

    expect(groups.map((g) => g.id)).toEqual(["gNew"]);
    const topOrders = [
      ...out.filter((t) => t.groupId === null).map((t) => t.sortOrder),
      ...groups.map((g) => g.sortOrder),
    ].sort((m, n) => m - n);
    expect(topOrders).toEqual([0, 1]);
    expect(thoughts[0].sortOrder).toBe(0);
  });

  it("splitting thoughts out of an old group drops the emptied old group", () => {
    const thoughts = [th("a", 0), th("b", 0, "gOld"), th("c", 1, "gOld")];
    const groups = [gr("gOld", 1)];
    const { thoughts: out, groups: outGroups } = computeGroup(thoughts, groups, ["b", "c"], newGroup);
    expect(outGroups.map((g) => g.id)).toEqual(["gNew"]);
    expect(out.filter((t) => t.groupId === "gNew").map((t) => t.id).sort()).toEqual(["b", "c"]);
  });
});

describe("computeUngroup", () => {
  it("removes the group and scatters its thoughts back to the end of the feed (createdAt order)", () => {
    const thoughts = [
      th("a", 0),
      th("x", 1, "g1", "2026-06-13T08:00:00.000Z"),
      th("y", 0, "g1", "2026-06-13T07:00:00.000Z"),
    ];
    const groups = [gr("g1", 1)];
    const { thoughts: out, groups: outGroups } = computeUngroup(thoughts, groups, "g1");
    expect(outGroups).toEqual([]);
    expect(out.every((t) => t.groupId === null)).toBe(true);
    const ordered = [...out].sort((m, n) => m.sortOrder - n.sortOrder).map((t) => t.id);
    expect(ordered).toEqual(["a", "y", "x"]);
  });

  it("is a no-op snapshot when the group id is unknown", () => {
    const thoughts = [th("a", 0)];
    const { thoughts: out, groups } = computeUngroup(thoughts, [], "missing");
    expect(out.map((t) => t.id)).toEqual(["a"]);
    expect(groups).toEqual([]);
  });
});

describe("computeMerge", () => {
  it("keeps existing members' order and appends newcomers (createdAt order)", () => {
    const thoughts = [
      th("m1", 0, "gT"),
      th("m2", 1, "gT"),
      th("n1", 0, null, "2026-06-13T06:00:00.000Z"),
      th("n2", 1, null, "2026-06-13T05:00:00.000Z"),
    ];
    const groups = [gr("gT", 0)];
    const { thoughts: out } = computeMerge(thoughts, groups, "gT", ["n1", "n2"]);
    const inGroup = out.filter((t) => t.groupId === "gT").sort((x, y) => x.sortOrder - y.sortOrder);
    expect(inGroup.map((t) => t.id)).toEqual(["m1", "m2", "n2", "n1"]);
    expect(inGroup.map((t) => t.sortOrder)).toEqual([0, 1, 2, 3]);
  });

  it("drops another group emptied by the merge", () => {
    const thoughts = [th("a", 0, "gOther"), th("b", 0, "gT")];
    const groups = [gr("gT", 0), gr("gOther", 1)];
    const { groups: out } = computeMerge(thoughts, groups, "gT", ["a"]);
    expect(out.map((g) => g.id)).toEqual(["gT"]);
  });
});

describe("computePop", () => {
  it("pops thoughts back to the feed and drops a group it empties", () => {
    const thoughts = [th("keep", 0), th("p1", 0, "g1"), th("p2", 1, "g1")];
    const groups = [gr("g1", 1)];
    const { thoughts: out, groups: outGroups } = computePop(thoughts, groups, ["p1", "p2"]);
    expect(outGroups).toEqual([]);
    expect(out.every((t) => t.groupId === null)).toBe(true);
    expect([...out].sort((m, n) => m.sortOrder - n.sortOrder).map((t) => t.id)).toEqual(["keep", "p1", "p2"]);
  });
});
