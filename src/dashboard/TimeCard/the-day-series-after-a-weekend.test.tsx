import { act, Component, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyTime, ProjectDashboardData } from "../../lib/db";
import type { Project, TimeSession } from "../../lib/types";
import TimeCard from "../TimeCard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_WEEKEND =
  "With the tab open and the clock running on a Friday, the machine asleep until Monday: without a reload, the Days view shows Friday capped at its midnight, Saturday and Sunday with their stored hours, and \"Today\" at 0, each row labelled with its own day number";

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
const SAT = "2026-09-19";
const SUN = "2026-09-20";

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

describe("the Days view after a weekend asleep", () => {
  it(`${CHECK_WEEKEND}`, async () => {
    vi.setSystemTime(local(2026, 9, 18, 15, 0, 0));
    world.store.seconds[SAT] = 3600;
    world.store.seconds[SUN] = 1800;
    await openCard({ depth: false });
    await pressStart();
    expect(buttonNamed("Stop work session"), "harness: the clock is running").not.toBeNull();
    await pass(60_000);

    await sleepUntil(local(2026, 9, 21, 9, 0, 0));
    await showDepth();

    expect(daysRows(), `the last seven days, each labelled with its own day number (screen: ${screenText()})`).toEqual([
      [world.dayLabel("2026-09-15"), "0"],
      [world.dayLabel("2026-09-16"), "0"],
      [world.dayLabel("2026-09-17"), "0"],
      [world.dayLabel(FRI), "9"],
      [world.dayLabel(SAT), "1"],
      [world.dayLabel(SUN), "0.5"],
      ["Today", "0"],
    ]);
    expect(world.store.running, "the seam's clock is closed").toBeNull();
  });
});
