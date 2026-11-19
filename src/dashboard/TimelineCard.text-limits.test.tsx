import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addPhase } from "../lib/db";
import type { Phase, Project } from "../lib/types";
import TimelineCard from "./TimelineCard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_LIMITS =
  "Every box where a person types something Compass saves, on the dashboard, in the sidebar and in the interview, stops at its limit: 4,000 characters for a thought's or task's text, 200 for a project, phase, learning-item or group name and a thought's title; a longer paste keeps its first part";

const pending = vi.hoisted(() => ({
  adds: [] as Array<{ name: string; resolve: (phase: unknown) => void; reject: (error: unknown) => void }>,
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
    addPhase: vi.fn(
      (name: string) =>
        new Promise((resolve, reject) => {
          pending.adds.push({ name, resolve, reject });
        }),
    ),
    renamePhase: vi.fn(async () => undefined),
  };
});

const CREATED = "2026-07-21T17:00:00.000Z";
const PROJECT: Project = {
  id: "p1",
  userId: "u1",
  name: "Lighthouse",
  accentColor: "#9A7B4F",
  sortOrder: 0,
  archivedAt: null,
  totalDays: 90,
  hoursPlannedPerDay: 4,
  hoursAvailablePerDay: 6,
  startedAt: "2026-07-21",
  createdAt: CREATED,
};
function phase(id: string, name: string, sortOrder: number): Phase {
  return { id, projectId: "p1", userId: "u1", name, estDays: 5, sortOrder, isDone: false, completedAt: null, createdAt: CREATED };
}
const PHASES = [phase("ph1", "Sketch the screens", 0), phase("ph2", "Build the backend", 1)];

const PHASE_ADD = "+ Add a phase";
const PHASE_PLACEHOLDER = "Name a phase, press Enter…";
const LIMIT = 200;

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

async function mountCard({ depth }: { depth: boolean }): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<TimelineCard phases={PHASES} project={PROJECT} depth={depth} onToggle={vi.fn()} onPhasesChange={vi.fn()} />);
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
function textEls(text: string): HTMLElement[] {
  const all = Array.from(container.querySelectorAll<HTMLElement>("*")).filter(
    (el) => !["TEXTAREA", "OPTION"].includes(el.tagName) && tidy(el.textContent) === text,
  );
  return all.filter((el) => !Array.from(el.children).some((c) => tidy(c.textContent) === text));
}
function named(name: string): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLElement>("button, [role='button'], [title], [aria-label]")).find(
      (el) => el.getAttribute("aria-label") === name || el.getAttribute("title") === name || tidy(el.textContent) === name,
    ) ?? null
  );
}
function addBox(): Field | null {
  return container.querySelector<Field>(`input[placeholder="${PHASE_PLACEHOLDER}"], textarea[placeholder="${PHASE_PLACEHOLDER}"]`);
}
function fieldHolding(value: string): Field | null {
  return Array.from(container.querySelectorAll<Field>("input, textarea")).find((f) => f.value === value) ?? null;
}
function activeField(): Field | null {
  const a = document.activeElement;
  return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement ? a : null;
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
  if (!addBox()) await click(named(PHASE_ADD) ?? textEls(PHASE_ADD)[0], `the "${PHASE_ADD}" row`);
  const box = addBox();
  expect(box, "harness: the phase add box").not.toBeNull();
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
  vi.mocked(addPhase).mockClear();
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

describe("a phase's name stops at 200 characters", () => {
  it(`${CHECK_LIMITS} — the "+ Add a phase" box`, async () => {
    await mountCard({ depth: true });
    const box = await openAddBox();
    await expectPasteStopsAt(box, LIMIT);
    await type(box, "y");
    expect(box.value, "one more keystroke adds nothing").toBe("x".repeat(LIMIT));
  });

  it(`${CHECK_LIMITS} — a phase's rename in the checklist`, async () => {
    await mountCard({ depth: true });
    await click(textEls("Build the backend")[0], "the second phase's name, to rename it");
    const editor = activeField() ?? fieldHolding("Build the backend");
    expect(editor, "harness: the phase opened for renaming").not.toBeNull();
    await expectPasteStopsAt(editor!, LIMIT);
  });

  it(`${CHECK_LIMITS} — the current phase's rename on the glance`, async () => {
    await mountCard({ depth: false });
    await click(textEls("Sketch the screens")[0], "the current phase's name on the glance, to rename it");
    const editor = activeField() ?? fieldHolding("Sketch the screens");
    expect(editor, "harness: the glance name opened for renaming").not.toBeNull();
    await expectPasteStopsAt(editor!, LIMIT);
  });
});
