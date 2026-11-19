import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addTask } from "../lib/db";
import type { Task } from "../lib/types";
import TaskPanel from "./TaskPanel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_LIMITS =
  "Every box where a person types something Compass saves, on the dashboard, in the sidebar and in the interview, stops at its limit: 4,000 characters for a thought's or task's text, 200 for a project, phase, learning-item or group name and a thought's title; a longer paste keeps its first part";

const pending = vi.hoisted(() => ({
  adds: [] as Array<{ text: string; resolve: (task: unknown) => void; reject: (error: unknown) => void }>,
}));

const KEEP_REAL = vi.hoisted(() => new Set(["SaveFailedError", "todayDate", "getActiveProjectId"]));

vi.mock("../lib/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/db")>();
  const quiet: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(real)) {
    quiet[name] = typeof value === "function" && !KEEP_REAL.has(name) ? vi.fn(async () => undefined) : value;
  }
  return {
    ...quiet,
    addTask: vi.fn(
      (text: string) =>
        new Promise((resolve, reject) => {
          pending.adds.push({ text, resolve, reject });
        }),
    ),
    updateTask: vi.fn(async () => true),
    removeTask: vi.fn(async () => undefined),
    reorderTasks: vi.fn(async () => undefined),
  };
});

function task(id: string, text: string, sortOrder: number): Task {
  return {
    id,
    projectId: "p1",
    userId: "u1",
    text,
    isDone: false,
    sortOrder,
    taskDate: "2026-09-20",
    phaseId: null,
    learningItemId: null,
    createdAt: "2026-09-20T17:00:00.000Z",
  };
}
const TASKS = [task("t1", "Write the intro", 0), task("t2", "Call the printer", 1)];

const TASK_ADD = "+ Add a task";
const TASK_PLACEHOLDER = "Type a task, press Enter…";
const LIMIT = 4000;

type Field = HTMLInputElement | HTMLTextAreaElement;
let container: HTMLDivElement;
let root: Root | null = null;
let styleTag: HTMLStyleElement | null = null;

async function settle(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

async function mountPanel(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<TaskPanel initialTasks={TASKS} initialThoughts={[]} initialThoughtGroups={[]} />);
  });
  await settle();
}

function tidy(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}
function textEl(text: string): HTMLElement | null {
  const all = Array.from(container.querySelectorAll<HTMLElement>("*")).filter(
    (el) => !["TEXTAREA", "OPTION"].includes(el.tagName) && tidy(el.textContent) === text,
  );
  return all.find((el) => !Array.from(el.children).some((c) => tidy(c.textContent) === text)) ?? null;
}
function named(name: string): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLElement>("button, [role='button'], [title], [aria-label]")).find(
      (el) => el.getAttribute("aria-label") === name || el.getAttribute("title") === name || tidy(el.textContent) === name,
    ) ?? null
  );
}
function addBox(): Field | null {
  return container.querySelector<Field>(`input[placeholder="${TASK_PLACEHOLDER}"], textarea[placeholder="${TASK_PLACEHOLDER}"]`);
}
function fieldHolding(value: string): Field | null {
  return Array.from(container.querySelectorAll<Field>("input, textarea")).find((f) => f.value === value) ?? null;
}

async function click(el: Element | null, what: string): Promise<void> {
  expect(el, `harness: ${what}`).not.toBeNull();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

function setNativeValue(field: Field, value: string): void {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
async function type(field: Field, text: string, { replace = false } = {}): Promise<void> {
  await act(async () => {
    field.focus();
  });
  if (field.disabled || field.readOnly) return;
  let next = replace ? text : field.value + text;
  if (field.maxLength >= 0 && next.length > field.maxLength) next = next.slice(0, field.maxLength);
  await act(async () => {
    setNativeValue(field, next);
  });
  await settle(2);
}

async function openAddBox(): Promise<Field> {
  if (!addBox()) await click(named(TASK_ADD) ?? textEl(TASK_ADD), `the "${TASK_ADD}" row`);
  const box = addBox();
  expect(box, "harness: the task add box").not.toBeNull();
  return box!;
}

function longPaste(limit: number): string {
  return "x".repeat(limit) + "TAIL beyond the limit";
}

async function appStylesheet(): Promise<string> {
  const fsModule = "node:fs";
  const fs = (await import(/* @vite-ignore */ fsModule)) as { readFileSync(path: string, encoding: "utf8"): string };
  const projectRoot = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  return fs.readFileSync(`${projectRoot}/src/styles/styles.css`, "utf8");
}

beforeAll(async () => {
  styleTag = document.createElement("style");
  styleTag.textContent = await appStylesheet();
  document.head.appendChild(styleTag);
});
afterAll(() => {
  styleTag?.remove();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  pending.adds.length = 0;
  vi.mocked(addTask).mockClear();
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  vi.useRealTimers();
});

describe("the task boxes stop at 4,000 characters", () => {
  it(`${CHECK_LIMITS} — the task add box`, async () => {
    await mountPanel();
    const box = await openAddBox();
    await type(box, longPaste(LIMIT), { replace: true });
    expect(box.value.length, "the box stops at 4,000 characters").toBe(LIMIT);
    expect(box.value, "a longer paste keeps its first part").toBe("x".repeat(LIMIT));
    await type(box, "y");
    expect(box.value, "one more keystroke adds nothing").toBe("x".repeat(LIMIT));
  });

  it(`${CHECK_LIMITS} — the task edit box`, async () => {
    await mountPanel();
    await click(textEl("Write the intro"), "the first task's text, to edit it");
    const editor = (document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLInputElement
      ? document.activeElement
      : fieldHolding("Write the intro")) as Field | null;
    expect(editor, "harness: the task opened for editing").not.toBeNull();
    await type(editor!, longPaste(LIMIT), { replace: true });
    expect(editor!.value.length, "the box stops at 4,000 characters").toBe(LIMIT);
    expect(editor!.value, "a longer paste keeps its first part").toBe("x".repeat(LIMIT));
  });
});
