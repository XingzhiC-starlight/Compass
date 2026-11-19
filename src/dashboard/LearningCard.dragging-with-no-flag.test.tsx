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

const item = (id: string, sortOrder: number): LearningItem => ({
  id,
  projectId: "p1",
  userId: "u1",
  name: id,
  sortOrder,
  progressPct: 100,
  isFocus: false,
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

describe("LearningCard drag with every row complete and no flag", () => {
  it("keeps the focus the glance showed before the drag, and saves it", () => {
    const items = [item("Alpha", 0), item("Beta", 1)];
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root!.render(<LearningCard items={items} depth onToggle={vi.fn()} />));

    const rows = () => [...container!.querySelectorAll<HTMLElement>("[draggable]")];
    const beta = rows()[1];
    let grip: Element = beta;
    while (grip.firstElementChild) grip = grip.firstElementChild;
    fire(grip, "mousedown");
    fire(beta, "dragstart");
    fire(rows()[0], "dragover", -5);
    fire(rows()[0], "drop", -5);
    fire(beta, "dragend");

    expect(rows().map((r) => r.querySelector(".row-name")?.textContent)).toEqual(["Beta", "Alpha"]);
    expect(db.reorderLearningItems).toHaveBeenCalledWith(["Beta", "Alpha"]);
    expect(db.setFocusItem).toHaveBeenCalledTimes(1);
    expect(db.setFocusItem).toHaveBeenCalledWith("Alpha");

    act(() => root!.render(<LearningCard items={items} depth={false} onToggle={vi.fn()} />));
    const text = container.textContent ?? "";
    expect(text).toContain("Alpha");
    expect(text).not.toContain("Beta");
  });
});
