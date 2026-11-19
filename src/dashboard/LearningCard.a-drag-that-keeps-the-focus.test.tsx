import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LearningItem } from "../lib/types";
import LearningCard from "./LearningCard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const db = vi.hoisted(() => ({
  addLearningItem: vi.fn(),
  removeLearningItem: vi.fn(async () => undefined),
  renameLearningItem: vi.fn(),
  reorderLearningItems: vi.fn(),
  setFocusItem: vi.fn(async () => undefined),
  setLearningProgress: vi.fn(),
}));

vi.mock("../lib/db", () => db);

const item = (id: string, sortOrder: number, progressPct: number, isFocus = false): LearningItem => ({
  id,
  projectId: "p1",
  userId: "u1",
  name: id,
  sortOrder,
  progressPct,
  isFocus,
  createdAt: "2026-06-13T10:00:00.000Z",
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.clearAllMocks();
});

function fire(el: Element, type: string, clientY = 0) {
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientY }));
  });
}

const rows = () => [...container!.querySelectorAll<HTMLElement>("[draggable]")];
const names = () => rows().map((r) => r.querySelector(".row-name")?.textContent);

function mountAndDragAbove(items: LearningItem[], from: number, to: number) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(<LearningCard items={items} depth onToggle={vi.fn()} />));

  const source = rows()[from];
  let grip: Element = source;
  while (grip.firstElementChild) grip = grip.firstElementChild;
  fire(grip, "mousedown");
  fire(source, "dragstart");
  fire(rows()[to], "dragover", -5);
  fire(rows()[to], "drop", -5);
  fire(source, "dragend");
}

function glanceText(items: LearningItem[]) {
  act(() => root!.render(<LearningCard items={items} depth={false} onToggle={vi.fn()} />));
  return container!.textContent ?? "";
}

describe("LearningCard drag that leaves the focus where it is", () => {
  it("saves the new order and no focus when the first open row already holds the focus", () => {
    const items = [item("Current", 0, 30, true), item("Alpha", 1, 50), item("Beta", 2, 70)];
    mountAndDragAbove(items, 2, 1);

    expect(names()).toEqual(["Current", "Beta", "Alpha"]);
    expect(db.reorderLearningItems).toHaveBeenCalledWith(["Current", "Beta", "Alpha"]);
    expect(db.setFocusItem).not.toHaveBeenCalled();
    const text = glanceText(items);
    expect(text).toContain("Current");
    expect(text).toContain("30% · Focus");
  });

  it("saves the new order and no focus when every row is complete", () => {
    const items = [item("Alpha", 0, 100, true), item("Beta", 1, 100)];
    mountAndDragAbove(items, 1, 0);

    expect(names()).toEqual(["Beta", "Alpha"]);
    expect(db.reorderLearningItems).toHaveBeenCalledWith(["Beta", "Alpha"]);
    expect(db.setFocusItem).not.toHaveBeenCalled();
    const text = glanceText(items);
    expect(text).toContain("Alpha");
    expect(text).not.toContain("Beta");
  });
});
