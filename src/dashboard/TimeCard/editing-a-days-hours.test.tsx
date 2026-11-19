import { act, Component, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyTime } from "../../lib/db";
import type { Project } from "../../lib/types";
import TimeCard from "../TimeCard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_LOOK =
  'Open a past day whose hours are not a whole tenth, such as 2 hours 32 minutes, and click away without typing: nothing is written, and the row still shows "2.5h"';
const CHECK_ENTER = "Open a past day and press Enter without typing: nothing is written";
const CHECK_TYPED =
  "Open a past day, type a different value and press Enter or click away: the day's stored total becomes the entered hours × 3600 seconds, and the row shows the entered hours";
const CHECK_INVALID =
  "Open a past day, clear the field, or type letters, or a negative number, then leave: nothing is written and the row shows its previous hours";
const CHECK_ESCAPE =
  "Open a past day, type a new value and press Escape: nothing is written and the row shows its previous hours";
const CHECK_TODAY =
  "Today's row in the Days view stays read-only, and the glance editor is unchanged: opening today's hours and clicking away writes nothing";

function daysAgo(back: number): string {
  const d = new Date();
  d.setDate(d.getDate() - back);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

const PAST_DAY = daysAgo(3);
const PAST_SECONDS = 2 * 3600 + 32 * 60;
const TODAY_SECONDS = 5400;
const GOAL_HOURS = 4;

function history(): DailyTime[] {
  const rows: DailyTime[] = [];
  for (let back = 48; back >= 0; back -= 1) {
    rows.push({
      date: daysAgo(back),
      loggedSeconds: back === 3 ? PAST_SECONDS : back === 0 ? TODAY_SECONDS : 0,
    });
  }
  return rows;
}

const project: Project = {
  id: "project-1",
  userId: "user-1",
  name: "Compass",
  accentColor: "#9A7B4F",
  sortOrder: 0,
  archivedAt: null,
  totalDays: 90,
  hoursPlannedPerDay: GOAL_HOURS,
  hoursAvailablePerDay: 6,
  startedAt: daysAgo(60),
  createdAt: `${daysAgo(60)}T10:00:00.000Z`,
};

const seam = vi.hoisted(() => ({
  setLoggedSecondsForDate: vi.fn(async (_date: string, _seconds: number) => undefined),
  setHoursPlannedPerDay: vi.fn(async (_hours: number) => undefined),
  startSession: vi.fn(async () => undefined),
  stopSession: vi.fn(async () => undefined),
}));

const KEEP_REAL = vi.hoisted(() => new Set(["todayDate", "getActiveProjectId"]));

vi.mock("../../lib/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/db")>();

  const safe: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(real)) {
    safe[name] =
      typeof value === "function" && !KEEP_REAL.has(name)
        ? vi.fn(async () => {
            throw new Error(`TimeCard test: unexpected seam call ${name}()`);
          })
        : value;
  }

  const days = (): DailyTime[] => {
    const rows: DailyTime[] = [];
    const two = (n: number) => String(n).padStart(2, "0");
    for (let back = 48; back >= 0; back -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - back);
      rows.push({
        date: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`,
        loggedSeconds: back === 3 ? 2 * 3600 + 32 * 60 : back === 0 ? 5400 : 0,
      });
    }
    return rows;
  };

  return {
    ...safe,
    setLoggedSecondsForDate: seam.setLoggedSecondsForDate,
    setHoursPlannedPerDay: seam.setHoursPlannedPerDay,
    startSession: seam.startSession,
    stopSession: seam.stopSession,
    getTodayLoggedSeconds: vi.fn(async () => 5400),
    listDailyTime: vi.fn(async (n: number) => days().slice(-n)),
    onWriteError: vi.fn(() => () => {}),
  };
});

class Boundary extends Component<{ children: ReactNode }, { crash: string | null }> {
  state: { crash: string | null } = { crash: null };
  static getDerivedStateFromError(error: unknown): { crash: string } {
    return { crash: error instanceof Error ? error.message : String(error) };
  }
  render(): ReactNode {
    if (this.state.crash !== null) return <p>[the card crashed: {this.state.crash}]</p>;
    return this.props.children;
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function openCard({ depth }: { depth: boolean }): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <Boundary>
        <TimeCard
          project={project}
          currentPhaseStart={project.startedAt}
          remainingDays={30}
          allPhasesDone={false}
          initialLoggedSeconds={TODAY_SECONDS}
          initiallyRunning={false}
          initialDaily={history()}
          depth={depth}
          onToggle={vi.fn()}
        />
      </Boundary>,
    );
  });
  await settle();
  expect(screenText(), "harness: the card drew without crashing").not.toContain("[the card crashed");
}

function tidy(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function compact(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, "");
}

function screenText(): string {
  return tidy(container.textContent);
}

function editablePastDays(): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[title="Click to edit hours"]'));
}

function hoursShownOnPastDays(): string[] {
  return editablePastDays().map((el) => tidy(el.textContent));
}

function pastDayShowing(hours: string): HTMLElement | null {
  return editablePastDays().find((el) => compact(el.textContent).includes(hours)) ?? null;
}

function smallestHolding(...parts: string[]): HTMLElement | null {
  const all = Array.from(container.querySelectorAll<HTMLElement>("*")).filter((el) =>
    parts.every((part) => tidy(el.textContent).includes(part)),
  );
  all.sort((a, b) => tidy(a.textContent).length - tidy(b.textContent).length);
  return all[0] ?? null;
}

function editorsOpen(): number {
  return container.querySelectorAll("input").length;
}

function editor(): HTMLInputElement | null {
  return container.querySelector("input");
}

function writesMade(): string[] {
  const watched = [
    "setLoggedSecondsForDate",
    "setHoursPlannedPerDay",
    "startSession",
    "stopSession",
  ] as const;
  return watched.flatMap((name) =>
    seam[name].mock.calls.map((args: unknown[]) => `${name}(${args.map(String).join(", ")})`),
  );
}

async function openPastDay(): Promise<HTMLInputElement> {
  expect(editorsOpen(), "harness: no field is open before the click (numbers are text, I14)").toBe(0);
  const target = pastDayShowing("2.5");
  expect(
    target,
    `the past day showing 2.5h among the click-to-edit days (past days show: ${hoursShownOnPastDays().join(" | ")})`,
  ).not.toBeNull();
  await act(async () => {
    target!.click();
  });
  await settle();
  const field = editor();
  expect(field, "the hours editor opened").not.toBeNull();
  expect(field!.value, "the editor opens showing the hours to a tenth").toBe("2.5");
  return field!;
}

async function typeInto(field: HTMLInputElement, value: string): Promise<void> {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function clickAway(field: HTMLInputElement): Promise<void> {
  await act(async () => {
    field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  await settle();
}

async function press(field: HTMLInputElement, key: "Enter" | "Escape"): Promise<void> {
  await act(async () => {
    field.dispatchEvent(new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true }));
  });
  await settle();
}

function expectRowStillShows(hours: string): void {
  expect(editorsOpen(), "the editor has closed").toBe(0);
  expect(
    pastDayShowing(hours),
    `the row still shows ${hours}h (past days show: ${hoursShownOnPastDays().join(" | ")})`,
  ).not.toBeNull();
  expect(compact(container.textContent), `"${hours}h" on screen`).toContain(`${hours}h`);
}

beforeEach(() => {
  seam.setLoggedSecondsForDate.mockClear();
  seam.setHoursPlannedPerDay.mockClear();
  seam.startSession.mockClear();
  seam.stopSession.mockClear();
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
});

describe("a past day opened and left untouched", () => {
  it(`${CHECK_LOOK}`, async () => {
    await openCard({ depth: true });
    const field = await openPastDay();

    await clickAway(field);

    expect(writesMade(), "nothing is written").toEqual([]);
    expectRowStillShows("2.5");
  });

  it(`${CHECK_ENTER}`, async () => {
    await openCard({ depth: true });
    const field = await openPastDay();

    await press(field, "Enter");

    expect(writesMade(), "nothing is written").toEqual([]);
    expectRowStillShows("2.5");
  });
});

describe("a past day edited", () => {
  it(`${CHECK_TYPED} — by Enter: 3.5 typed over 2.5 stores 12 600 seconds for that day, and the row shows 3.5h`, async () => {
    await openCard({ depth: true });
    const field = await openPastDay();

    await typeInto(field, "3.5");
    await press(field, "Enter");

    expect(writesMade(), "the one write: that day's total, as hours × 3600").toEqual([
      `setLoggedSecondsForDate(${PAST_DAY}, ${3.5 * 3600})`,
    ]);
    expect(editorsOpen(), "the editor has closed").toBe(0);
    expect(
      pastDayShowing("3.5"),
      `the row shows 3.5h (past days show: ${hoursShownOnPastDays().join(" | ")})`,
    ).not.toBeNull();
    expect(pastDayShowing("2.5"), "the row no longer shows 2.5h").toBeNull();
  });

  it(`${CHECK_TYPED} — by clicking away: 0.5 typed over 2.5 stores 1 800 seconds for that day, and the row shows 0.5h`, async () => {
    await openCard({ depth: true });
    const field = await openPastDay();

    await typeInto(field, "0.5");
    await clickAway(field);

    expect(writesMade(), "the one write: that day's total, as hours × 3600").toEqual([
      `setLoggedSecondsForDate(${PAST_DAY}, ${0.5 * 3600})`,
    ]);
    expect(editorsOpen(), "the editor has closed").toBe(0);
    expect(
      pastDayShowing("0.5"),
      `the row shows 0.5h (past days show: ${hoursShownOnPastDays().join(" | ")})`,
    ).not.toBeNull();
    expect(pastDayShowing("2.5"), "the row no longer shows 2.5h").toBeNull();
  });

  it(`${CHECK_TYPED} — exactly as entered: 2.75 typed over 2.5 stores 9 900 seconds, not a tenth's worth, and the row leaves 2.5h behind`, async () => {
    await openCard({ depth: true });
    const field = await openPastDay();

    await typeInto(field, "2.75");
    await clickAway(field);

    expect(writesMade(), "the one write: the entered hours × 3600, unrounded").toEqual([
      `setLoggedSecondsForDate(${PAST_DAY}, ${2.75 * 3600})`,
    ]);
    expect(editorsOpen(), "the editor has closed").toBe(0);
    expect(pastDayShowing("2.5"), "the row no longer shows 2.5h").toBeNull();
  });
});

describe("a past day left with an entry that is not an edit", () => {
  it(`${CHECK_INVALID} — the field cleared, then left by clicking away`, async () => {
    await openCard({ depth: true });
    const field = await openPastDay();

    await typeInto(field, "");
    await clickAway(field);

    expect(writesMade(), "nothing is written").toEqual([]);
    expectRowStillShows("2.5");
  });

  it(`${CHECK_INVALID} — letters typed, then left by Enter`, async () => {
    await openCard({ depth: true });
    const field = await openPastDay();

    await typeInto(field, "abc");
    await press(field, "Enter");

    expect(writesMade(), "nothing is written").toEqual([]);
    expectRowStillShows("2.5");
  });

  it(`${CHECK_INVALID} — a negative number typed, then left by clicking away`, async () => {
    await openCard({ depth: true });
    const field = await openPastDay();

    await typeInto(field, "-1");
    await clickAway(field);

    expect(writesMade(), "nothing is written").toEqual([]);
    expectRowStillShows("2.5");
  });

  it(`${CHECK_ESCAPE}`, async () => {
    await openCard({ depth: true });
    const field = await openPastDay();

    await typeInto(field, "3.5");
    await press(field, "Escape");

    expect(writesMade(), "nothing is written").toEqual([]);
    expectRowStillShows("2.5");
    expect(pastDayShowing("3.5"), "the typed value is not shown").toBeNull();
  });
});

describe("today's hours", () => {
  it(`${CHECK_TODAY} — Today's row in the Days view offers no editor: clicking its hours opens no field and writes nothing`, async () => {
    await openCard({ depth: true });

    const row = smallestHolding("Today", "1.5");
    expect(row, 'the "Today" row showing 1.5h in the Days view').not.toBeNull();
    expect(row!.closest('[title="Click to edit hours"]'), "Today's row is not click-to-edit").toBeNull();
    expect(row!.querySelector('[title="Click to edit hours"]'), "Today's row is not click-to-edit").toBeNull();

    const hours = Array.from(row!.querySelectorAll<HTMLElement>("*")).filter(
      (el) => el.children.length === 0 && tidy(el.textContent).includes("1.5"),
    );
    for (const el of hours.length > 0 ? hours : [row!]) {
      await act(async () => {
        el.click();
      });
    }
    await settle();

    expect(editorsOpen(), "no field opened").toBe(0);
    expect(writesMade(), "nothing is written").toEqual([]);
  });

  it(`${CHECK_TODAY} — the glance editor: opening today's hours and clicking away writes nothing`, async () => {
    await openCard({ depth: false });
    expect(editorsOpen(), "harness: no field is open before the click (numbers are text, I14)").toBe(0);

    const hours = smallestHolding("1.5");
    expect(hours, 'today\'s logged hours "1.5" in the glance hero').not.toBeNull();
    await act(async () => {
      hours!.click();
    });
    await settle();
    const field = editor();
    expect(field, "the glance editor opened").not.toBeNull();
    expect(field!.value, "the editor opens showing today's hours to a tenth").toBe("1.5");

    await clickAway(field!);

    expect(writesMade(), "nothing is written").toEqual([]);
    expect(editorsOpen(), "the editor has closed").toBe(0);
    expect(compact(container.textContent), "the glance still reads 1.5/4h").toContain("1.5/4h");
  });
});
