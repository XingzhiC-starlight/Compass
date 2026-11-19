import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Task, Thought } from "../lib/types";
import TaskPanel from "./TaskPanel";
import ThoughtLog from "./ThoughtLog";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const db = vi.hoisted(() => {
  const fn = () => vi.fn(async () => undefined);
  return {
    addTask: vi.fn(),
    updateTask: vi.fn(async () => true),
    removeTask: fn(),
    reorderTasks: fn(),
    addThought: vi.fn(),
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
const task = (id: string, text: string, sortOrder: number): Task => ({
  id, projectId: "p1", userId: "u1", text, isDone: false, sortOrder,
  taskDate: "2026-09-22", phaseId: null, learningItemId: null, createdAt: CREATED,
});
const thought = (id: string, text: string, sortOrder: number): Thought => ({
  id, projectId: "p1", userId: "u1", title: "", text, sortOrder, groupId: null, createdAt: CREATED,
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<StrictMode>{node}</StrictMode>));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.clearAllMocks();
});

async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function typeInto(field: HTMLTextAreaElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function pressEnter(field: HTMLTextAreaElement) {
  act(() => {
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true, cancelable: true }));
  });
}
function openTaskAddBox(): HTMLTextAreaElement {
  const button = Array.from(container!.querySelectorAll("button")).find((b) => b.textContent?.includes("+ Add a task"))!;
  act(() => button.click());
  return container!.querySelector<HTMLTextAreaElement>('textarea[placeholder="Type a task, press Enter…"]')!;
}

describe("under StrictMode, as the app runs in development", () => {
  it("a successful add clears the box, lists the task, and lets typing in again", async () => {
    db.addTask.mockResolvedValueOnce(task("t9", "Buy stamps", 1));
    render(<TaskPanel initialTasks={[task("t1", "Write", 0)]} initialThoughts={[]} initialThoughtGroups={[]} />);
    const box = openTaskAddBox();
    typeInto(box, "Buy stamps");
    pressEnter(box);
    await settle();

    expect(box.readOnly, "the box no longer waits").toBe(false);
    expect(box.value, "it cleared for the next entry").toBe("");
    expect(container!.textContent, "the task is listed").toContain("Buy stamps");
  });

  it("a failed add keeps the words and lets typing in again", async () => {
    db.addTask.mockRejectedValueOnce(Object.assign(new Error("TypeError: Failed to fetch"), { code: "" }));
    render(<TaskPanel initialTasks={[task("t1", "Write", 0)]} initialThoughts={[]} initialThoughtGroups={[]} />);
    const box = openTaskAddBox();
    typeInto(box, "Buy stamps");
    pressEnter(box);
    await settle();

    expect(box.readOnly, "the box no longer waits").toBe(false);
    expect(box.getAttribute("aria-busy"), "nor says it is busy").toBeNull();
    expect(box.value, "the words are still there").toBe("Buy stamps");
    typeInto(box, "Buy stamps today");
    expect(box.value, "and it takes typing again").toBe("Buy stamps today");
  });

  it("a failed edit to a thought's text reopens with the words typed", async () => {
    db.updateThought.mockResolvedValueOnce(false);
    render(<ThoughtLog initialThoughts={[thought("th1", "First idea", 0)]} initialGroups={[]} />);
    const text = Array.from(container!.querySelectorAll("p.th-text")).find((p) => p.textContent === "First idea")!;
    act(() => (text as HTMLElement).click());
    const editor = container!.querySelector<HTMLTextAreaElement>("textarea.th-text-input")!;
    typeInto(editor, "First idea, refined");
    pressEnter(editor);
    await settle();

    const reopened = container!.querySelector<HTMLTextAreaElement>("textarea.th-text-input");
    expect(reopened?.value, "the thought reopens with the words typed").toBe("First idea, refined");
  });
});
