import { describe, expect, it } from "vitest";
import type { LearningItem } from "../lib/types";
import {
  focusAfterReorder,
  hasOpenFocus,
  markLearningFocus,
  removeLearningItemAndAdvanceFocus,
  shouldFocusNewLearningItem,
} from "./learningFocus";

const item = (id: string, progressPct: number, isFocus = false): LearningItem => ({
  id,
  projectId: "p1",
  userId: "u1",
  name: id,
  sortOrder: 0,
  progressPct,
  isFocus,
  createdAt: "2026-06-13T10:00:00.000Z",
});

describe("learning focus helpers", () => {
  it("treats a completed focus as not open", () => {
    expect(hasOpenFocus([item("done", 100, true)])).toBe(false);
  });

  it("focuses a new open item when every existing item is complete", () => {
    const existing = [item("done", 100, true)];
    expect(shouldFocusNewLearningItem(existing, item("new", 0))).toBe(true);
  });

  it("keeps the current open focus when adding another open item", () => {
    const existing = [item("current", 40, true)];
    expect(shouldFocusNewLearningItem(existing, item("new", 0))).toBe(false);
  });

  it("marks exactly one learning item as focus", () => {
    expect(markLearningFocus([item("old", 100, true), item("new", 0)], "new")).toMatchObject([
      { id: "old", isFocus: false },
      { id: "new", isFocus: true },
    ]);
  });

  it("hands the focus to the row under the deleted focus when that row is open", () => {
    expect(
      removeLearningItemAndAdvanceFocus([
        item("current", 30, true),
        item("next", 20),
        item("later", 10),
      ], "current"),
    ).toMatchObject({
      items: [
        { id: "next", isFocus: true },
        { id: "later", isFocus: false },
      ],
      nextFocusId: "next",
    });
  });

  it("preserves focus when a different item is deleted", () => {
    expect(
      removeLearningItemAndAdvanceFocus([
        item("current", 30, true),
        item("other", 20),
      ], "other"),
    ).toMatchObject({
      items: [{ id: "current", isFocus: true }],
      nextFocusId: null,
    });
  });

  it("leaves an empty roadmap without a focus", () => {
    expect(removeLearningItemAndAdvanceFocus([item("only", 30, true)], "only")).toEqual({
      items: [],
      nextFocusId: null,
    });
  });
});

describe("focus after a drag, and after deleting the focus (builder's regression tests)", () => {
  it("asks for no focus write when the first open row already holds the focus", () => {
    expect(focusAfterReorder([item("done", 100), item("current", 30, true), item("other", 70)])).toBeNull();
  });

  it("asks for no focus write when every row is complete", () => {
    expect(focusAfterReorder([item("a", 100), item("b", 100, true)])).toBeNull();
  });

  it("keeps the row shown before the drag, and asks to save it, when every row is complete and none carries the flag", () => {
    expect(focusAfterReorder([item("b", 100), item("a", 100)], "a")).toBe("a");
  });

  it("asks for no focus write when every row is complete, none is flagged and no row was shown", () => {
    expect(focusAfterReorder([item("b", 100), item("a", 100)])).toBeNull();
  });

  it("asks for no focus write when every row is complete, none is flagged and the row shown is not on the roadmap", () => {
    expect(focusAfterReorder([item("b", 100), item("a", 100)], "gone")).toBeNull();
  });

  it("names the first open row when no row carries the flag", () => {
    expect(focusAfterReorder([item("done", 100), item("open", 10)])).toBe("open");
  });

  it("passes over completed rows when the deleted focus leaves an open row further down", () => {
    expect(
      removeLearningItemAndAdvanceFocus([
        item("current", 30, true),
        item("done", 100),
        item("open", 10),
      ], "current"),
    ).toMatchObject({
      items: [
        { id: "done", isFocus: false },
        { id: "open", isFocus: true },
      ],
      nextFocusId: "open",
    });
  });

  it("hands the focus to the first open row that remains, above the deleted focus, not the next open row after it", () => {
    expect(
      removeLearningItemAndAdvanceFocus([
        item("above", 30),
        item("done", 100),
        item("current", 40, true),
        item("below", 20),
      ], "current"),
    ).toMatchObject({
      items: [
        { id: "above", isFocus: true },
        { id: "done", isFocus: false },
        { id: "below", isFocus: false },
      ],
      nextFocusId: "above",
    });
  });
});
