import { act, Component, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyTime, ProjectDashboardData } from "../../lib/db";
import type { Project, TimeSession } from "../../lib/types";
import TimeCard from "../TimeCard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_ROLL =
  "A clock started at 23:59:00 and still running when the day rolls at 00:00:30 with the tab open: the finishing day stores one session of 60 seconds ending at midnight, today reads 0, and the clock is off";
const CHECK_SLEEP =
  "A clock started at 22:00 with the tab open, the machine asleep from 23:00 until 09:00 the next day: the finishing day stores 2 hours ending at its midnight, today reads 0, and the clock is off";

const world = vi.hoisted(() => {
  const two = (n: number) => String(n).padStart(2, "0");
  const key = (d: Date): string => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  const parts = (k: string) => k.split("-").map(Number) as [number, number, number];
  const dayEndMs = (k: string): number => {
    const [y, m, d] = parts(k);
    return new Date(y, m - 1, d + 1, 0, 0, 0).getTime();
  };

  const project: Project = {
    id: "project-1",
    userId: "user-1",
    name: "Compass",
    accentColor: "#9A7B4F",
    sortOrder: 0,
    archivedAt: null,
    totalDays: 90,
    hoursPlannedPerDay: 4,
    hoursAvailablePerDay: 6,
    startedAt: "2026-07-21",
    createdAt: "2026-07-21T17:00:00.000Z",
  };

  const dayLabel = (k: string): string => {
    const [y, m, d] = parts(k);
    const [sy, sm, sd] = parts(project.startedAt);
    const days = Math.round((new Date(y, m - 1, d).getTime() - new Date(sy, sm - 1, sd).getTime()) / 86_400_000);
    return `Day ${days + 1}`;
  };

  type Running = { id: string; startedAt: number; sessionDate: string };
  const store: { seconds: Record<string, number>; running: Running | null } = { seconds: {}, running: null };

  function closeClock(nowMs: number): void {
    const r = store.running;
    if (!r) return;
    const end = Math.min(nowMs, dayEndMs(r.sessionDate));
    const secs = Math.max(0, Math.floor((end - r.startedAt) / 1000));
    store.seconds[r.sessionDate] = (store.seconds[r.sessionDate] ?? 0) + secs;
    store.running = null;
  }
  function heal(): void {
    if (store.running && store.running.sessionDate !== key(new Date())) closeClock(Date.now());
  }
  function secondsOn(date: string): number {
    heal();
    let s = store.seconds[date] ?? 0;
    const r = store.running;
    if (r && r.sessionDate === date) s += Math.max(0, Math.floor((Date.now() - r.startedAt) / 1000));
    return s;
  }
  function series(days: number): DailyTime[] {
    heal();
    const rows: DailyTime[] = [];
    for (let back = days - 1; back >= 0; back -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - back);
      const k = key(d);
      rows.push({ date: k, loggedSeconds: secondsOn(k) });
    }
    return rows;
  }
  function runningSession(): TimeSession | null {
    const r = store.running;
    if (!r) return null;
    const iso = new Date(r.startedAt).toISOString();
    return {
      id: r.id,
      projectId: project.id,
      userId: project.userId,
      startedAt: iso,
      endedAt: null,
      durationSeconds: 0,
      sessionDate: r.sessionDate,
      createdAt: iso,
    };
  }
  function startClock(): TimeSession {
    const now = Date.now();
    store.running = { id: `session-${now}`, startedAt: now, sessionDate: key(new Date()) };
    return runningSession()!;
  }
  function reset(): void {
    store.seconds = {};
    store.running = null;
  }
  return { key, dayLabel, project, store, closeClock, heal, secondsOn, series, startClock, reset };
});

const seam = vi.hoisted(() => ({
  startSession: vi.fn(async (): Promise<TimeSession | null> => world.startClock()),
  stopSession: vi.fn(async (): Promise<void> => {
    world.closeClock(Date.now());
  }),
  setLoggedSecondsForDate: vi.fn(async (_date: string, _seconds: number): Promise<void> => undefined),
  setHoursPlannedPerDay: vi.fn(async (_hours: number): Promise<void> => undefined),
  getTodayLoggedSeconds: vi.fn(async (): Promise<number> => world.secondsOn(world.key(new Date()))),
  listDailyTime: vi.fn(async (days: number): Promise<DailyTime[]> => world.series(days)),
  getProjectDashboardData: vi.fn(async (_id: string): Promise<ProjectDashboardData> => {
    world.heal();
    return {
      project: world.project,
      phases: [],
      learning: [],
      tasks: [],
      loggedSeconds: world.secondsOn(world.key(new Date())),
      running: world.store.running !== null,
      daily: world.series(49),
      thoughts: [],
      thoughtGroups: [],
    };
  }),
  onWriteError: vi.fn((_cb: (err: unknown) => void) => () => {}),
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
  return { ...safe, ...seam };
});

function local(y: number, month: number, d: number, h = 0, min = 0, s = 0): Date {
  return new Date(y, month - 1, d, h, min, s);
}
const FRI = "2026-09-18";
const GOAL = 4;

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
let payload: { loggedSeconds: number; running: boolean; daily: DailyTime[] };

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

async function sleepUntil(wake: Date): Promise<void> {
  vi.setSystemTime(wake);
  await pass(60_000);
}

function element(depth: boolean) {
  return (
    <Boundary>
      <TimeCard
        project={world.project}
        currentPhaseStart={world.project.startedAt}
        remainingDays={30}
        allPhasesDone={false}
        initialLoggedSeconds={payload.loggedSeconds}
        initiallyRunning={payload.running}
        initialDaily={payload.daily}
        depth={depth}
        onToggle={vi.fn()}
      />
    </Boundary>
  );
}

async function openCard({ depth }: { depth: boolean }): Promise<void> {
  payload = {
    loggedSeconds: world.secondsOn(world.key(new Date())),
    running: world.store.running !== null,
    daily: world.series(49),
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(element(depth));
  });
  await settle();
  expect(screenText(), "harness: the card drew without crashing").not.toContain("[the card crashed");
}

async function showDepth(): Promise<void> {
  await act(async () => {
    root!.render(element(true));
  });
  await settle();
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

function buttonNamed(name: string): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.getAttribute("aria-label") === name || b.getAttribute("title") === name || tidy(b.textContent) === name,
    ) ?? null
  );
}

function daysRows(): Array<[string, string]> {
  const text = screenText();
  const row = /(Day \d+|Today)\s*(\d+(?:\.\d+)?)\s*h(?![a-z])/g;
  const rows: Array<[string, string]> = [];
  let m: RegExpExecArray | null;
  while ((m = row.exec(text)) !== null) rows.push([m[1], m[2]]);
  return rows;
}

function expectClockOff(): void {
  expect(buttonNamed("Stop work session"), `the clock is off — no Stop button (screen: ${screenText()})`).toBeNull();
  expect(buttonNamed("Start work session"), `the clock is off — the Start button is there (screen: ${screenText()})`).not.toBeNull();
}

function expectTodayReads(hours: string): void {
  expect(compact(container.textContent), `today reads ${hours}/${GOAL}h`).toContain(`${hours}/${GOAL}h`);
}

async function pressStart(): Promise<void> {
  const start = buttonNamed("Start work session");
  expect(start, `harness: the Start work session button (screen: ${screenText()})`).not.toBeNull();
  await act(async () => {
    start!.click();
  });
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  world.reset();
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
  vi.useRealTimers();
});

describe("the day rolls with the tab open", () => {
  it(`${CHECK_ROLL} — on the card: today reads 0, the clock is off, and the seam's clock is closed with 60 s on the finishing day`, async () => {
    vi.setSystemTime(local(2026, 9, 18, 23, 59, 0));
    await openCard({ depth: false });
    await pressStart();
    expect(buttonNamed("Stop work session"), "harness: the clock is running").not.toBeNull();

    await pass(60_000);
    await pass(30_000);
    await pass(60_000);

    expectClockOff();
    expectTodayReads("0");
    expect(world.store.running, "the seam's clock is closed").toBeNull();
    expect(world.store.seconds[FRI], "the finishing day holds 60 seconds").toBe(60);
    expect(seam.startSession, "the clock does not restart itself").toHaveBeenCalledTimes(1);
  });

  it(`${CHECK_SLEEP} — on the card: after waking, today reads 0, the clock is off, and the Days view shows yesterday at 2h`, async () => {
    vi.setSystemTime(local(2026, 9, 18, 22, 0, 0));
    await openCard({ depth: false });
    await pressStart();
    expect(buttonNamed("Stop work session"), "harness: the clock is running").not.toBeNull();

    for (let minute = 0; minute < 60; minute += 1) await pass(60_000);
    await sleepUntil(local(2026, 9, 19, 9, 0, 0));

    expectClockOff();
    expectTodayReads("0");
    expect(world.store.running, "the seam's clock is closed").toBeNull();
    expect(world.store.seconds[FRI], "the finishing day holds 2 hours (7 200 s)").toBe(7200);
    expect(seam.startSession, "the clock does not restart itself").toHaveBeenCalledTimes(1);

    await showDepth();
    expect(daysRows().slice(-2), `the Days view ends with yesterday at 2h and Today at 0 (rows: ${JSON.stringify(daysRows())})`).toEqual([
      [world.dayLabel(FRI), "2"],
      ["Today", "0"],
    ]);
  });
});
