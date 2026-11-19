import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addPhase, SaveFailedError } from "../lib/db";
import type { Phase, Project } from "../lib/types";
import TimelineCard from "./TimelineCard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_ADD =
  "After Enter in an add box (a task, thought, phase or learning item), the words stay and the box takes no typing until the save ends; on success it clears for the next entry; on failure the same words are still there and nothing is added to the list";
const CHECK_FADE =
  "While an add box waits, it looks unchanged for about half a second, then fades as the login screen's fields do while busy, until the save ends";

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
  if (!addBox()) await click(named(PHASE_ADD) ?? textEls(PHASE_ADD)[0], `the "${PHASE_ADD}" row`);
  const box = addBox();
  expect(box, "harness: the phase add box").not.toBeNull();
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

describe("the phase add box waits for its save", () => {
  it(`${CHECK_ADD} — the phase box: while the save waits the words stay and take no typing; on success it clears for the next entry and the phase is listed`, async () => {
    await mountCard({ depth: true });
    const box = await openAddBox();
    await type(box, "Draw the map");
    await pressEnter(box);

    expect(vi.mocked(addPhase), "harness: Enter sent the phase to be saved").toHaveBeenCalledTimes(1);
    expect(addBox()?.value, "after Enter the words stay").toBe("Draw the map");
    await type(addBox()!, " and the legend");
    expect(addBox()?.value, "the box takes no typing until the save ends").toBe("Draw the map");

    await act(async () => {
      pending.adds[0].resolve(phase("ph9", "Draw the map", 2));
    });
    await settle();

    expect(addBox(), "on success the box is still open for the next entry").not.toBeNull();
    expect(addBox()?.value, "on success it clears").toBe("");
    expect(shown(container), "the phase is listed").toContain("Draw the map");
    await type(addBox()!, "Next one");
    expect(addBox()?.value, "and takes typing again").toBe("Next one");
  });

  it(`${CHECK_ADD} — the phase box: on failure the same words are still there and nothing is added`, async () => {
    await mountCard({ depth: true });
    const box = await openAddBox();
    await type(box, "Draw the map");
    await pressEnter(box);
    expect(vi.mocked(addPhase), "harness: Enter sent the phase to be saved").toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.adds[0].reject(new SaveFailedError({ code: "", message: "TypeError: Failed to fetch" }));
    });
    await settle();

    expect(addBox()?.value, "on failure the same words are still there").toBe("Draw the map");
    expect(shown(container), "nothing is added to the list").not.toContain("Draw the map");
    await type(addBox()!, " today");
    expect(addBox()?.value, "the save has ended: the box takes typing again").toBe("Draw the map today");
  });

  it(`${CHECK_FADE} — the phase box`, async () => {
    const busy = loginBusyFade();
    expect(busy, "harness: under the stylesheet, a busy login field fades to 0.68").toBeCloseTo(0.68, 2);
    await mountCard({ depth: true });
    const box = await openAddBox();
    await type(box, "Draw the map");
    const before = opacityOf(box);
    await pressEnter(box);
    expect(vi.mocked(addPhase), "harness: Enter sent the phase to be saved").toHaveBeenCalledTimes(1);

    await pass(250);
    expect(opacityOf(addBox()!), "a quarter second in, the box looks unchanged").toBeCloseTo(before, 2);
    await pass(750);
    expect(opacityOf(addBox()!), "past half a second, it fades as the login screen's fields do while busy").toBeCloseTo(before * busy, 2);

    await act(async () => {
      pending.adds[0].resolve(phase("ph9", "Draw the map", 2));
    });
    await settle();
    expect(opacityOf(addBox()!), "once the save ends, it looks as before").toBeCloseTo(before, 2);
  });
});
