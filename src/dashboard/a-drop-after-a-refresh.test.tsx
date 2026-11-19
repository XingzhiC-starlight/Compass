import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Task, Thought, ThoughtGroup } from "../lib/types";
import TaskPanel from "./TaskPanel";
import ThoughtLog from "./ThoughtLog";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const db = vi.hoisted(() => {
  const fn = () => vi.fn(async () => undefined);
  return {
    addTask: fn(),
    updateTask: vi.fn(async () => true),
    removeTask: fn(),
    reorderTasks: fn(),
    addThought: fn(),
    updateThought: vi.fn(async () => true),
    removeThought: fn(),
    reorderFeed: fn(),
    reorderThoughtsInGroup: fn(),
    groupThoughts: fn(),
    mergeThoughtsIntoGroup: fn(),
    popThoughtsFromGroup: fn(),
    ungroupThoughts: fn(),
    renameThoughtGroup: fn(),
    moveThoughtToGroup: fn(),
  };
});
vi.mock("../lib/db", () => db);

const CREATED = "2026-09-22T10:00:00.000Z";
const task = (id: string, sortOrder: number): Task => ({
  id, projectId: "p1", userId: "u1", text: `task ${id}`, isDone: false, sortOrder,
  taskDate: "2026-09-22", phaseId: null, learningItemId: null, createdAt: CREATED,
});
const thought = (id: string, sortOrder: number, groupId: string | null = null): Thought => ({
  id, projectId: "p1", userId: "u1", title: "", text: `thought ${id}`, sortOrder, groupId, createdAt: CREATED,
});
const group: ThoughtGroup = { id: "g1", projectId: "p1", userId: "u1", name: "Group", sortOrder: 9, createdAt: CREATED };

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(node: React.ReactNode) {
  if (!root) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root!.render(node));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.clearAllMocks();
});

/** jsdom lays nothing out: every row's box is 0 tall, so a drop anywhere
    below its top counts as "after" the row. */
function fire(el: Element, type: "dragstart" | "drop") {
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientY: 5 }));
  });
}
function pressGrip(row: Element) {
  act(() => {
    row.querySelector(".task-handle, .th-handle")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
}

describe("a drop after a refresh moved the rows", () => {
  it("the task list drops the held task after the row it is let go on", () => {
    render(<TaskPanel initialTasks={[task("a", 0), task("b", 1), task("c", 2)]} initialThoughts={[]} initialThoughtGroups={[]} syncVersion={0} />);
    const rows = () => Array.from(container!.querySelectorAll("li.task-item:not(.task-add-row)"));
    pressGrip(rows()[0]);
    fire(rows()[0], "dragstart");

    render(<TaskPanel initialTasks={[task("b", 0), task("c", 1), task("a", 2)]} initialThoughts={[]} initialThoughtGroups={[]} syncVersion={1} />);
    fire(rows()[0], "drop");

    expect(db.reorderTasks).toHaveBeenCalledWith(["b", "a", "c"]);
  });

  it("the thought feed drops the held thought after the row it is let go on", () => {
    render(<ThoughtLog initialThoughts={[thought("a", 0), thought("b", 1), thought("c", 2)]} initialGroups={[]} syncVersion={0} />);
    const rows = () => Array.from(container!.querySelectorAll("ul.th-feed > li.th-row:not(.th-add-row)"));
    pressGrip(rows()[0]);
    fire(rows()[0], "dragstart");

    render(<ThoughtLog initialThoughts={[thought("b", 0), thought("c", 1), thought("a", 2)]} initialGroups={[]} syncVersion={1} />);
    fire(rows()[0], "drop");

    expect(db.reorderFeed).toHaveBeenCalledWith([
      { id: "b", kind: "thought" },
      { id: "a", kind: "thought" },
      { id: "c", kind: "thought" },
    ]);
  });

  it("a group drops the held thought after the member it is let go on", () => {
    const members = (order: string[]) => order.map((id, i) => thought(id, i, "g1"));
    render(<ThoughtLog initialThoughts={members(["a", "b", "c"])} initialGroups={[group]} syncVersion={0} />);
    const rows = () => Array.from(container!.querySelectorAll("ul.th-group-list > li.th-row"));
    pressGrip(rows()[0]);
    fire(rows()[0], "dragstart");

    render(<ThoughtLog initialThoughts={members(["b", "c", "a"])} initialGroups={[group]} syncVersion={1} />);
    fire(rows()[0], "drop");

    expect(db.reorderThoughtsInGroup).toHaveBeenCalledWith("g1", ["b", "a", "c"]);
  });
});
