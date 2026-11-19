import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addThought, SaveFailedError } from "../lib/db";
import type { Thought, ThoughtGroup } from "../lib/types";
import ThoughtLog from "./ThoughtLog";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_ADD =
  "After Enter in an add box (a task, thought, phase or learning item), the words stay and the box takes no typing until the save ends; on success it clears for the next entry; on failure the same words are still there and nothing is added to the list";
const CHECK_FADE =
  "While an add box waits, it looks unchanged for about half a second, then fades as the login screen's fields do while busy, until the save ends";

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
async function pass(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await settle();
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
async function pressEnter(field: Field): Promise<void> {
  await act(async () => {
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  });
  await settle();
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

function opacityOf(el: Element): number {
  let product = 1;
  for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
    const value = parseFloat(getComputedStyle(n).opacity);
    if (!Number.isNaN(value)) product *= value;
  }
  return product;
}
function loginBusyFade(): number {
  const probe = document.createElement("input");
  probe.className = "auth-input";
  probe.disabled = true;
  document.body.appendChild(probe);
  const fade = opacityOf(probe);
  probe.remove();
  return fade;
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

describe("the thought add box waits for its save", () => {
  it(`${CHECK_ADD} — the thought box: while the save waits the words stay and take no typing; on success it clears for the next entry and the thought is listed`, async () => {
    await mountLog();
    const box = await openAddBox();
    await type(box, "Ask Mira about the logo");
    await pressEnter(box);

    expect(vi.mocked(addThought), "harness: Enter sent the thought to be saved").toHaveBeenCalledTimes(1);
    expect(addBox()?.value, "after Enter the words stay").toBe("Ask Mira about the logo");
    await type(addBox()!, " and the colours");
    expect(addBox()?.value, "the box takes no typing until the save ends").toBe("Ask Mira about the logo");

    await act(async () => {
      pending.adds[0].resolve(thought("th9", "Ask Mira about the logo", 3));
    });
    await settle();

    expect(addBox(), "on success the box is still there for the next entry").not.toBeNull();
    expect(addBox()?.value, "on success it clears").toBe("");
    expect(shown(container), "the thought is listed").toContain("Ask Mira about the logo");
    await type(addBox()!, "Next one");
    expect(addBox()?.value, "and takes typing again").toBe("Next one");
  });

  it(`${CHECK_ADD} — the thought box: on failure the same words are still there and nothing is added`, async () => {
    await mountLog();
    const box = await openAddBox();
    await type(box, "Ask Mira about the logo");
    await pressEnter(box);
    expect(vi.mocked(addThought), "harness: Enter sent the thought to be saved").toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.adds[0].reject(new SaveFailedError({ code: "", message: "TypeError: Failed to fetch" }));
    });
    await settle();

    expect(addBox()?.value, "on failure the same words are still there").toBe("Ask Mira about the logo");
    expect(shown(container), "nothing is added to the list").not.toContain("Ask Mira about the logo");
    await type(addBox()!, " today");
    expect(addBox()?.value, "the save has ended: the box takes typing again").toBe("Ask Mira about the logo today");
  });

  it(`${CHECK_FADE} — the thought box`, async () => {
    const busy = loginBusyFade();
    expect(busy, "harness: under the stylesheet, a busy login field fades to 0.68").toBeCloseTo(0.68, 2);
    await mountLog();
    const box = await openAddBox();
    await type(box, "Ask Mira about the logo");
    const before = opacityOf(box);
    await pressEnter(box);
    expect(vi.mocked(addThought), "harness: Enter sent the thought to be saved").toHaveBeenCalledTimes(1);

    await pass(250);
    expect(opacityOf(addBox()!), "a quarter second in, the box looks unchanged").toBeCloseTo(before, 2);
    await pass(750);
    expect(opacityOf(addBox()!), "past half a second, it fades as the login screen's fields do while busy").toBeCloseTo(before * busy, 2);

    await act(async () => {
      pending.adds[0].resolve(thought("th9", "Ask Mira about the logo", 3));
    });
    await settle();
    expect(opacityOf(addBox()!), "once the save ends, it looks as before").toBeCloseTo(before, 2);
  });
});
