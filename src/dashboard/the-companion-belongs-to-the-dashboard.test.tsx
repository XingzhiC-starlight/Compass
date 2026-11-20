import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardShellData, ProjectDashboardData } from "../lib/db";
import type { Project } from "../lib/types";
import Dashboard from "./Dashboard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK =
  "The dashboard owns the companion: the sidebar's button opens one window and afterwards brings it forward, it shows the active project, a save made in it makes the cards read again in place, closing it or leaving the dashboard ends it (spec §23)";

const world = vi.hoisted(() => ({
  reads: 0,
  payload: null as unknown,
  opens: [] as unknown[],
  next: null as unknown,
  companion: null as null | Record<string, unknown>,
  syncVersions: [] as number[],
  captureAsked: [] as (() => void)[],
}));

vi.mock("../lib/db", () => ({
  getProjectDashboardData: async () => {
    world.reads += 1;
    return world.payload;
  },
  savesInFlight: () => 0,
  whenSavesSettle: async () => undefined,
  storesOnThisDevice: () => true,
}));
vi.mock("../companion/companionWindow", () => ({
  openCompanionWindow: async () => {
    world.opens.push(world.next);
    return world.next;
  },
  showCompass: () => undefined,
  followTheme: () => () => undefined,
  onCaptureAsked: (cb: () => void) => {
    world.captureAsked.push(cb);
    return () => {
      world.captureAsked = world.captureAsked.filter((f) => f !== cb);
    };
  },
}));
vi.mock("../companion/Companion", () => ({
  default: (props: Record<string, unknown>) => {
    world.companion = props;
    return null;
  },
}));
vi.mock("./TimeCard", () => ({
  default: ({ syncVersion }: { syncVersion: number }) => {
    world.syncVersions.push(syncVersion);
    return <div className="time-card-stub" />;
  },
}));
vi.mock("./TimelineCard", () => ({ default: () => null }));
vi.mock("./LearningCard", () => ({ default: () => null }));
vi.mock("./TaskPanel", () => ({ default: () => null }));

const project = (id: string, name: string, accentColor: string): Project => ({
  id,
  userId: "u1",
  name,
  accentColor,
  sortOrder: 0,
  archivedAt: null,
  totalDays: 10,
  hoursPlannedPerDay: 2,
  hoursAvailablePerDay: 3,
  startedAt: "2026-07-21",
  createdAt: "2026-07-21T09:00:00.000Z",
});
const garden = project("p1", "Garden", "#9A7B4F");
const shed = project("p2", "Shed", "#5F8FA8");
const shell: DashboardShellData = { projects: [garden, shed], archived: [], completion: {} };
const payloadFor = (p: Project): ProjectDashboardData => ({
  project: p,
  phases: [],
  learning: [],
  tasks: [],
  loggedSeconds: 0,
  running: false,
  daily: [{ date: "2026-07-21", loggedSeconds: 0 }],
  thoughts: [],
  thoughtGroups: [],
});

function fakeWindow() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    closed: false,
    focus: vi.fn(),
    close: vi.fn(),
    addEventListener: (type: string, cb: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(cb);
    },
    removeEventListener: (type: string, cb: () => void) => listeners.get(type)?.delete(cb),
    fire: (type: string) => listeners.get(type)?.forEach((cb) => cb()),
  };
}

let root: Root;
let host: HTMLDivElement;
const settled = vi.fn();

async function show(activeProjectId: string) {
  world.payload = payloadFor(activeProjectId === "p1" ? garden : shed);
  await act(async () => {
    root.render(
      <Dashboard
        activeProjectId={activeProjectId}
        shell={shell}
        quietRefreshRequest={0}
        onQuietRefreshSettled={settled}
        onSignOut={vi.fn()}
        onSelectProject={vi.fn()}
        onNewProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onArchiveProject={vi.fn()}
        onUnarchiveProject={vi.fn()}
        onProjectRenamed={vi.fn()}
        onProjectsReordered={vi.fn()}
        onProjectCompletionChange={vi.fn()}
      />,
    );
  });
}
const companionButton = () => host.querySelector(".sidebar-companion") as HTMLButtonElement;
const pressCompanion = () =>
  act(async () => {
    companionButton().click();
  });

beforeEach(() => {
  world.reads = 0;
  world.opens = [];
  world.companion = null;
  world.syncVersions = [];
  world.captureAsked = [];
  world.next = fakeWindow();
  settled.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("the companion belongs to the dashboard", () => {
  it(`${CHECK} — a press opens one window showing the active project; a second press brings that window forward`, async () => {
    await show("p1");
    expect(world.companion).toBeNull();
    expect(companionButton().className).not.toContain("active");

    await pressCompanion();
    expect(world.opens).toHaveLength(1);
    expect(world.companion).toMatchObject({ win: world.next, projectId: "p1", projectName: "Garden", accentColor: "#9A7B4F" });
    expect(companionButton().className).toContain("active");

    await pressCompanion();
    expect(world.opens, "no second window").toHaveLength(1);
    expect((world.next as ReturnType<typeof fakeWindow>).focus).toHaveBeenCalledTimes(1);
  });

  it(`${CHECK} — it follows a switch to another project and stays open`, async () => {
    await show("p1");
    await pressCompanion();
    await show("p2");
    expect(world.companion).toMatchObject({ projectId: "p2", projectName: "Shed", accentColor: "#5F8FA8" });
    expect((world.next as ReturnType<typeof fakeWindow>).close).not.toHaveBeenCalled();
  });

  it(`${CHECK} — a save made in it makes the dashboard read again and the cards adopt the reading in place`, async () => {
    await show("p1");
    await pressCompanion();
    const readsBefore = world.reads;
    const cardsBefore = host.querySelector(".time-card-stub");
    await act(async () => {
      (world.companion!.onDataWritten as () => void)();
    });
    expect(world.reads).toBe(readsBefore + 1);
    expect(world.syncVersions[world.syncVersions.length - 1]).toBe(1);
    expect(host.querySelector(".time-card-stub"), "the cards were not remounted").toBe(cardsBefore);
    expect(settled).toHaveBeenLastCalledWith(true);
  });

  it(`${CHECK} — closing its window ends it, and the button opens a new one`, async () => {
    await show("p1");
    await pressCompanion();
    const first = world.next as ReturnType<typeof fakeWindow>;
    world.companion = null;
    await act(async () => first.fire("pagehide"));
    expect(world.companion).toBeNull();
    expect(companionButton().className).not.toContain("active");

    world.next = fakeWindow();
    await pressCompanion();
    expect(world.opens).toHaveLength(2);
    expect(world.companion).toMatchObject({ win: world.next });
  });

  it(`${CHECK} — leaving the dashboard closes its window, and so does the page going`, async () => {
    await show("p1");
    await pressCompanion();
    const win = world.next as ReturnType<typeof fakeWindow>;
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(win.close).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<div />));
    expect(win.close).toHaveBeenCalledTimes(2);
  });

  it(`${CHECK} — a window the browser refused shows nothing`, async () => {
    world.next = null;
    await show("p1");
    await pressCompanion();
    expect(world.companion).toBeNull();
    expect(companionButton().className).not.toContain("active");
  });

  it(`${CHECK} — the desktop app asking for a thought opens it, or brings it forward, and counts the asking for it; closing it forgets the count, and leaving the dashboard stops the listening`, async () => {
    await show("p1");
    const ask = () =>
      act(async () => {
        for (const cb of [...world.captureAsked]) cb();
      });
    expect(world.captureAsked.length).toBe(1);

    await ask();
    expect(world.opens.length).toBe(1);
    expect(world.companion).toMatchObject({ projectId: "p1", captureRequest: 1 });

    const win = world.next as ReturnType<typeof fakeWindow>;
    await ask();
    expect(world.opens.length).toBe(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
    expect(world.companion).toMatchObject({ captureRequest: 2 });

    await act(async () => win.fire("pagehide"));
    world.next = fakeWindow();
    await pressCompanion();
    expect(world.companion).toMatchObject({ captureRequest: 0 });

    await act(async () => root.unmount());
    expect(world.captureAsked.length).toBe(0);
    // The check's own closing unmounts a root, so it is given a new one.
    root = createRoot(host);
  });

  it(`${CHECK} — asked for a thought when the browser refuses the window, nothing is counted`, async () => {
    world.next = null;
    await show("p1");
    await act(async () => {
      for (const cb of [...world.captureAsked]) cb();
    });
    expect(world.companion).toBeNull();
  });
});
