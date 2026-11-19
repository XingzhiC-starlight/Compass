import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "../lib/db";
import type { InterviewInput, Project } from "../lib/types";
import Interview from "./Interview";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_RETRY =
  "After a setup is not saved, the button reads \"Open my dashboard →\" and can be pressed again, every answer is still on screen as typed, and the note \"Couldn't save just now — try again in a moment.\" shows; pressing again saves the answers as they now stand";

const KEEP_REAL = vi.hoisted(() => new Set(["SaveFailedError", "todayDate", "getActiveProjectId"]));
vi.mock("../lib/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/db")>();
  const quiet: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(real)) {
    quiet[name] = typeof value === "function" && !KEEP_REAL.has(name) ? vi.fn(async () => undefined) : value;
  }
  return quiet;
});

const OPEN = "Open my dashboard →";
const OPENING = "Opening…";

type Answers = {
  name: string;
  planned: string;
  available: string;
  days: string;
  phases: Array<[name: string, days: string]>;
  learn: Array<[name: string, level: string]>;
};

const TYPED: Answers = {
  name: "  Harbor Lights  ",
  planned: "2.5",
  available: "4",
  days: "30",
  phases: [
    ["Research the harbor", "3"],
    ["Build the lamp", "5"],
    ["Launch night", "2"],
  ],
  learn: [
    ["Soldering", "Confident · ~65%"],
    ["Lens optics", "Beginner · ~10%"],
  ],
};

const SAVED: Project = {
  id: "11111111-1111-4111-8111-111111111115",
  userId: "user-1",
  name: "Harbor Lights, take two",
  accentColor: "#7BC8B2",
  sortOrder: 0,
  archivedAt: null,
  totalDays: 30,
  hoursPlannedPerDay: 2.5,
  hoursAvailablePerDay: 4,
  startedAt: "2026-09-22",
  createdAt: "2026-09-22T17:00:00.000Z",
};

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
let container: HTMLDivElement;
let root: Root | null = null;
let onComplete: ReturnType<typeof vi.fn<() => void>>;

beforeEach(async () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }),
  );
  vi.mocked(db.saveInterview).mockReset();
  onComplete = vi.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Interview onComplete={onComplete} />);
  });
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  vi.unstubAllGlobals();
});

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

function tidy(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function projectNameBox(): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>('input[placeholder="Name this project"]');
}
function boxFor(question: string): HTMLInputElement | null {
  const label = Array.from(container.querySelectorAll("label")).find((l) => tidy(l.textContent).startsWith(question));
  return (label?.control as HTMLInputElement | null | undefined) ?? null;
}
const plannedBox = () => boxFor("How many hours would you like to spend on it each day?");
const availableBox = () => boxFor("How much time do you actually have available each day?");
const daysBox = () => boxFor("How long do you think this project will take?");

function section(title: string): HTMLElement | null {
  return Array.from(container.querySelectorAll<HTMLElement>("section")).find((s) => tidy(s.querySelector("h2")?.textContent) === title) ?? null;
}
function rowsOf(title: string): HTMLElement[] {
  return Array.from(section(title)?.querySelectorAll<HTMLElement>(".row") ?? []);
}
function buttonReading(text: string, scope: ParentNode = container): HTMLButtonElement | null {
  return Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find((b) => tidy(b.textContent) === text) ?? null;
}
function cta(): HTMLButtonElement | null {
  return buttonReading(OPEN) ?? buttonReading(OPENING);
}

function setNativeValue(field: Field, value: string): void {
  const proto =
    field instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

async function type(field: Field | null, value: string, what: string): Promise<void> {
  expect(field, `harness: ${what}`).not.toBeNull();
  await act(async () => {
    field!.focus();
    setNativeValue(field!, value);
  });
}

async function chooseLevel(select: HTMLSelectElement | null, optionText: string, what: string): Promise<void> {
  expect(select, `harness: ${what}`).not.toBeNull();
  const option = Array.from(select!.options).find((o) => tidy(o.textContent) === optionText);
  expect(option, `harness: the level "${optionText}"`).toBeTruthy();
  await act(async () => {
    setNativeValue(select!, option!.value);
  });
}

async function click(el: Element | null, what: string): Promise<void> {
  expect(el, `harness: ${what}`).not.toBeNull();
  await act(async () => {
    (el as HTMLElement).click();
  });
}

async function fill(a: Answers): Promise<void> {
  await type(projectNameBox(), a.name, 'the box "Name this project"');
  await type(plannedBox(), a.planned, "the hours-per-day box");
  await type(availableBox(), a.available, "the hours-available box");
  await type(daysBox(), a.days, "the project-length box");
  while (rowsOf("Timeline").length < a.phases.length) await click(buttonReading("+ Add a phase"), '"+ Add a phase"');
  for (const [i, [name, days]] of a.phases.entries()) {
    const row = rowsOf("Timeline")[i];
    await type(row.querySelector<HTMLInputElement>('input[type="text"]'), name, `phase row ${i + 1}'s name`);
    await type(row.querySelector<HTMLInputElement>('input[type="number"]'), days, `phase row ${i + 1}'s days`);
  }
  while (rowsOf("Learning").length < a.learn.length) await click(buttonReading("+ Add something to learn"), '"+ Add something to learn"');
  for (const [i, [name, level]] of a.learn.entries()) {
    const row = rowsOf("Learning")[i];
    await type(row.querySelector<HTMLInputElement>('input[type="text"]'), name, `learning row ${i + 1}'s name`);
    await chooseLevel(row.querySelector("select"), level, `learning row ${i + 1}'s level`);
  }
}

function answersOnScreen(): Answers {
  const selected = (s: HTMLSelectElement | null) => (s ? tidy(s.options[s.selectedIndex]?.textContent) : "(no level box)");
  return {
    name: projectNameBox()?.value ?? "(no name box)",
    planned: plannedBox()?.value ?? "(no box)",
    available: availableBox()?.value ?? "(no box)",
    days: daysBox()?.value ?? "(no box)",
    phases: rowsOf("Timeline").map((row) => [
      row.querySelector<HTMLInputElement>('input[type="text"]')?.value ?? "(no name box)",
      row.querySelector<HTMLInputElement>('input[type="number"]')?.value ?? "(no days box)",
    ]),
    learn: rowsOf("Learning").map((row) => [
      row.querySelector<HTMLInputElement>('input[type="text"]')?.value ?? "(no name box)",
      selected(row.querySelector("select")),
    ]),
  };
}

describe("the setup screen after a save that did not go through", () => {
  it(`${CHECK_RETRY} — the screen's part: the button is ready, every answer is as typed, and pressing again sends the answers as they now stand`, async () => {
    const save = vi.mocked(db.saveInterview);
    save.mockRejectedValueOnce(new db.SaveFailedError({ code: "", message: "TypeError: Failed to fetch" }));
    save.mockResolvedValueOnce(SAVED);

    await fill(TYPED);
    expect(answersOnScreen(), "harness: the answers read back as typed before the press").toEqual(TYPED);
    expect(cta()?.disabled, "harness: every step is complete, so the button can be pressed").toBe(false);

    await click(cta(), "the setup's button");
    await flush();

    expect(save, "harness: the first press asked the seam to save").toHaveBeenCalledTimes(1);

    expect(tidy(cta()?.textContent), 'the button reads "Open my dashboard →"').toBe(OPEN);
    expect(cta()?.disabled, "and it can be pressed again").toBe(false);
    expect(answersOnScreen(), "every answer is still on screen as typed").toEqual(TYPED);
    expect(onComplete, "nothing opened").not.toHaveBeenCalled();

    const NOW: Answers = {
      ...TYPED,
      name: "Harbor Lights, take two",
      phases: [TYPED.phases[0], ["Build the lamp", "6"], TYPED.phases[2]],
      learn: [TYPED.learn[0], ["Lens optics", "Comfortable · ~50%"]],
    };
    await type(projectNameBox(), NOW.name, 'the box "Name this project"');
    await type(rowsOf("Timeline")[1]?.querySelector<HTMLInputElement>('input[type="number"]') ?? null, "6", "phase row 2's days");
    await chooseLevel(rowsOf("Learning")[1]?.querySelector("select") ?? null, "Comfortable · ~50%", "learning row 2's level");
    expect(answersOnScreen(), "harness: the changed answers are on screen").toEqual(NOW);

    await click(cta(), "the setup's button, again");
    await flush();

    expect(save, "pressing again asks the seam to save once more").toHaveBeenCalledTimes(2);
    const sent = save.mock.calls[1][0] as InterviewInput;
    expect(
      {
        name: sent.projectName.trim(),
        planned: sent.hoursPlannedPerDay,
        available: sent.hoursAvailablePerDay,
        days: sent.totalDays,
        phases: sent.phases.map((p) => [p.name.trim(), p.estDays]),
        learn: sent.learn.map((l) => [l.name.trim(), l.level]),
      },
      "it saves the answers as they now stand",
    ).toEqual({
      name: "Harbor Lights, take two",
      planned: 2.5,
      available: 4,
      days: 30,
      phases: [
        ["Research the harbor", 3],
        ["Build the lamp", 6],
        ["Launch night", 2],
      ],
      learn: [
        ["Soldering", 65],
        ["Lens optics", 50],
      ],
    });
    expect(onComplete, "and the setup opens").toHaveBeenCalledTimes(1);
  });
});
