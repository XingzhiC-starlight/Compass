import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addThought } from "../lib/db";
import type { Thought, ThoughtGroup } from "../lib/types";
import ThoughtLog from "./ThoughtLog";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_LIMITS =
  "Every box where a person types something Compass saves, on the dashboard, in the sidebar and in the interview, stops at its limit: 4,000 characters for a thought's or task's text, 200 for a project, phase, learning-item or group name and a thought's title; a longer paste keeps its first part";

const CREATED = "2026-09-20T17:00:00.000Z";
function thought(id: string, text: string, sortOrder: number, groupId: string | null = null): Thought {
  return { id, projectId: "p1", userId: "u1", text, sortOrder, groupId, createdAt: CREATED };
}
const THOUGHTS: Thought[] = [
  thought("th1", "First idea", 0),
  thought("th2", "Second idea", 1),
  thought("th3", "Grouped idea", 0, "g1"),
];
const GROUPS: ThoughtGroup[] = [{ id: "g1", projectId: "p1", userId: "u1", name: "Launch notes", sortOrder: 2, createdAt: CREATED }];

const pending = vi.hoisted(() => ({
  adds: [] as Array<{ text: string; resolve: (thought: unknown) => void; reject: (error: unknown) => void }>,
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
    addThought: vi.fn(
      (text: string) =>
        new Promise((resolve, reject) => {
          pending.adds.push({ text, resolve, reject });
        }),
    ),
    updateThought: vi.fn(async () => true),
    renameThoughtGroup: vi.fn(async () => undefined),
    groupThoughts: vi.fn(async (ids: string[], name: string) => {
      const group = { id: "g-new", projectId: "p1", userId: "u1", name: name ?? "", sortOrder: 1, createdAt: "2026-09-22T17:00:00.000Z" };
      return {
        group,
        thoughts: [
          { id: "th1", projectId: "p1", userId: "u1", text: "First idea", sortOrder: ids.includes("th1") ? 0 : 0, groupId: ids.includes("th1") ? "g-new" : null, createdAt: "2026-09-20T17:00:00.000Z" },
          { id: "th2", projectId: "p1", userId: "u1", text: "Second idea", sortOrder: 1, groupId: ids.includes("th2") ? "g-new" : null, createdAt: "2026-09-20T17:00:00.000Z" },
          { id: "th3", projectId: "p1", userId: "u1", text: "Grouped idea", sortOrder: 0, groupId: "g1", createdAt: "2026-09-20T17:00:00.000Z" },
        ],
        groups: [
          group,
          { id: "g1", projectId: "p1", userId: "u1", name: "Launch notes", sortOrder: 2, createdAt: "2026-09-20T17:00:00.000Z" },
        ],
      };
    }),
  };
});

const THOUGHT_ADD = "+ Add a thought";
const THOUGHT_PLACEHOLDER = "What's on your mind? Press Enter to add…";
const TEXT_LIMIT = 4000;
const NAME_LIMIT = 200;

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

async function mountLog(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ThoughtLog initialThoughts={THOUGHTS} initialGroups={GROUPS} />);
  });
  await settle();
}

function tidy(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}
function shown(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll("input, textarea, select").forEach((f) => f.remove());
  return tidy(copy.textContent);
}
function textEl(text: string): HTMLElement | null {
  const all = Array.from(container.querySelectorAll<HTMLElement>("*")).filter(
    (el) => !["TEXTAREA", "OPTION"].includes(el.tagName) && tidy(el.textContent) === text,
  );
  return all.find((el) => !Array.from(el.children).some((c) => tidy(c.textContent) === text)) ?? null;
}
function allNamed(name: string): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("button, [role='button'], input, [title], [aria-label]")).filter(
    (el) => el.getAttribute("aria-label") === name || el.getAttribute("title") === name || (el.tagName === "BUTTON" && tidy(el.textContent) === name),
  );
}
function fieldWithPlaceholder(placeholder: string): Field | null {
  return container.querySelector<Field>(`input[placeholder="${placeholder}"], textarea[placeholder="${placeholder}"]`);
}
function fieldHolding(value: string): Field | null {
  return Array.from(container.querySelectorAll<Field>("input, textarea")).find((f) => f.value === value) ?? null;
}
function activeField(): Field | null {
  const a = document.activeElement;
  return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement ? a : null;
}
function addBox(): Field | null {
  return fieldWithPlaceholder(THOUGHT_PLACEHOLDER);
}

async function click(el: Element | null | undefined, what: string): Promise<void> {
  expect(el ?? null, `harness: ${what} (screen: ${shown(container).slice(0, 200)})`).not.toBeNull();
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
  if (!addBox()) {
    const row = allNamed(THOUGHT_ADD)[0] ?? textEl(THOUGHT_ADD);
    await click(row, `the "${THOUGHT_ADD}" row`);
  }
  const box = addBox();
  expect(box, "harness: the thought add box").not.toBeNull();
  return box!;
}

async function expectPasteStopsAt(field: Field, limit: number): Promise<void> {
  await type(field, "x".repeat(limit) + "TAIL beyond the limit", { replace: true });
  expect(field.value.length, `the box stops at ${limit} characters`).toBe(limit);
  expect(field.value, "a longer paste keeps its first part").toBe("x".repeat(limit));
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
  vi.mocked(addThought).mockClear();
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

describe("the thought log's boxes stop at their limits", () => {
  it(`${CHECK_LIMITS} — the thought add box, 4,000`, async () => {
    await mountLog();
    const box = await openAddBox();
    await expectPasteStopsAt(box, TEXT_LIMIT);
    await type(box, "y");
    expect(box.value, "one more keystroke adds nothing").toBe("x".repeat(TEXT_LIMIT));
  });

  it(`${CHECK_LIMITS} — a thought's edit box, 4,000`, async () => {
    await mountLog();
    await click(textEl("First idea"), "the first thought's text, to edit it");
    const editor = activeField() ?? fieldHolding("First idea");
    expect(editor, "harness: the thought opened for editing").not.toBeNull();
    await expectPasteStopsAt(editor!, TEXT_LIMIT);
  });

  it(`${CHECK_LIMITS} — a thought's title, 200`, async () => {
    await mountLog();
    await click(allNamed("Click to edit title")[0], "the first thought's title");
    const editor = activeField() ?? fieldWithPlaceholder("Add a title…");
    expect(editor, "harness: the title field").not.toBeNull();
    await expectPasteStopsAt(editor!, NAME_LIMIT);
  });

  it(`${CHECK_LIMITS} — a group's name, renamed from its header, 200`, async () => {
    await mountLog();
    await click(textEl("Launch notes"), "the group's name, to rename it");
    const editor = activeField() ?? fieldHolding("Launch notes");
    expect(editor, "harness: the group's rename field").not.toBeNull();
    await expectPasteStopsAt(editor!, NAME_LIMIT);
  });

  it(`${CHECK_LIMITS} — a group's name, named as the group is made, 200`, async () => {
    await mountLog();
    await click(allNamed("Select thought")[0], "the first thought's checkbox");
    await click(allNamed("Select thought")[1], "the second thought's checkbox");
    await click(allNamed("Group")[0], 'the "Group" button');
    const editor = fieldWithPlaceholder("Name this group…") ?? activeField();
    expect(editor, 'harness: the "Name this group…" field').not.toBeNull();
    await expectPasteStopsAt(editor!, NAME_LIMIT);
  });
});
