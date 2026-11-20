import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectDashboardData } from "../lib/db";
import type { Task } from "../lib/types";
import Companion from "./Companion";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const seam = vi.hoisted(() => ({
  payload: null as unknown,
  settled: [] as (() => void)[],
  failed: [] as (() => void)[],
  startSession: vi.fn(),
  stopSession: vi.fn(),
  updateTask: vi.fn(),
  addThought: vi.fn(),
  reads: [] as string[],
}));

vi.mock("../lib/db", () => ({
  getProjectDashboardData: async (id: string) => {
    seam.reads.push(id);
    return seam.payload;
  },
  onSavesSettled: (cb: () => void) => {
    seam.settled.push(cb);
    return () => {
      seam.settled = seam.settled.filter((f) => f !== cb);
    };
  },
  onWriteError: (cb: () => void) => {
    seam.failed.push(cb);
    return () => {
      seam.failed = seam.failed.filter((f) => f !== cb);
    };
  },
  startSession: seam.startSession,
  stopSession: seam.stopSession,
  updateTask: seam.updateTask,
  addThought: seam.addThought,
  todayDate: () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },
}));

const task = (id: string, text: string, isDone = false): Task => ({
  id,
  userId: "u1",
  projectId: "p1",
  phaseId: null,
  learningItemId: null,
  text,
  isDone,
  sortOrder: 0,
  taskDate: "2026-07-21",
  createdAt: "2026-07-21T09:00:00.000Z",
});

function reading(over: Partial<ProjectDashboardData> = {}): ProjectDashboardData {
  return {
    project: {
      id: "p1",
      userId: "u1",
      name: "Garden",
      accentColor: "#9A7B4F",
      sortOrder: 0,
      archivedAt: null,
      totalDays: 10,
      hoursPlannedPerDay: 2,
      hoursAvailablePerDay: 3,
      startedAt: "2026-07-21",
      createdAt: "2026-07-21T09:00:00.000Z",
    },
    phases: [
      { id: "ph1", userId: "u1", projectId: "p1", name: "Dig the beds", estDays: 4, sortOrder: 0, isDone: false, completedAt: null, createdAt: "" },
      { id: "ph2", userId: "u1", projectId: "p1", name: "Plant", estDays: 6, sortOrder: 1, isDone: false, completedAt: null, createdAt: "" },
    ],
    learning: [
      { id: "l1", userId: "u1", projectId: "p1", name: "Soil", progressPct: 10, isFocus: false, sortOrder: 0, createdAt: "" },
      { id: "l2", userId: "u1", projectId: "p1", name: "Water", progressPct: 30, isFocus: true, sortOrder: 1, createdAt: "" },
    ],
    tasks: [task("t1", "Buy seeds"), task("t2", "Water the beds")],
    loggedSeconds: 3_600,
    running: false,
    daily: [],
    thoughts: [],
    thoughtGroups: [],
    ...over,
  };
}

let root: Root;
let host: HTMLDivElement;
let written: ReturnType<typeof vi.fn<() => void>>;
let opened: ReturnType<typeof vi.fn<() => void>>;

async function show(projectId = "p1", captureRequest = 0) {
  await act(async () => {
    root.render(
      <Companion
        win={window}
        projectId={projectId}
        projectName="Garden"
        accentColor="#9A7B4F"
        captureRequest={captureRequest}
        onOpenCompass={opened}
        onDataWritten={written}
      />,
    );
  });
}

const companion = () => document.body.querySelector(".companion") as HTMLElement;
const button = (name: string) => companion().querySelector(`button[aria-label="${name}"]`) as HTMLButtonElement | null;
const press = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};
const settle = async () => {
  await act(async () => {
    for (const cb of [...seam.settled]) cb();
  });
};
const expand = () => press(button("Show the timeline, learning and tasks")!);
const thoughtBox = () => companion().querySelector('input[aria-label="Add a thought"]') as HTMLInputElement;
async function type(text: string) {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(thoughtBox(), text);
    thoughtBox().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function enter() {
  await act(async () => {
    thoughtBox().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 23, 10, 0, 0));
  seam.payload = reading();
  seam.settled = [];
  seam.failed = [];
  seam.reads = [];
  seam.startSession.mockReset().mockResolvedValue({ id: "s1" });
  seam.stopSession.mockReset().mockResolvedValue(undefined);
  seam.updateTask.mockReset().mockResolvedValue(true);
  seam.addThought.mockReset().mockResolvedValue({ id: "th1" });
  window.resizeTo = vi.fn();
  written = vi.fn<() => void>();
  opened = vi.fn<() => void>();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("the companion's clock", () => {
  it("shows the project, the Commitment card's own line and today's time, stopped", async () => {
    await show();
    expect(companion().querySelector("h1")!.textContent).toBe("Garden");
    expect(companion().querySelector(".glance-eyebrow")!.textContent).toBe("Day 3 / 10 · Goal 2h");
    expect(companion().querySelector(".glance-hero")!.textContent).toBe("1:00:00");
    expect(button("Start work session")).not.toBeNull();
    expect((companion().querySelector(".glance-bar-fill") as HTMLElement).style.width).toBe("50%");
  });

  it("a running clock counts on from its reading by the time that has passed", async () => {
    seam.payload = reading({ running: true });
    await show();
    expect(button("Stop work session")).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(65_000);
    });
    expect(companion().querySelector(".glance-hero")!.textContent).toBe("1:01:05");
  });

  it("a press starts the clock at once, saves through the seam, and then tells the dashboard", async () => {
    let answer: (v: unknown) => void = () => undefined;
    seam.startSession.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await show();
    await press(button("Start work session")!);
    expect(button("Stop work session"), "it turns before the save answers").not.toBeNull();
    expect(seam.startSession).toHaveBeenCalledTimes(1);
    expect(written).not.toHaveBeenCalled();
    await act(async () => answer({ id: "s1" }));
    expect(written).toHaveBeenCalledTimes(1);
  });

  it("a press on a running clock stops it through the seam", async () => {
    seam.payload = reading({ running: true });
    await show();
    await press(button("Stop work session")!);
    expect(seam.stopSession).toHaveBeenCalledTimes(1);
    expect(button("Start work session")).not.toBeNull();
    expect(written).toHaveBeenCalledTimes(1);
  });

  it("when the saves in flight have answered it reads again and shows what is stored, wherever the save came from", async () => {
    await show();
    seam.payload = reading({ running: true, loggedSeconds: 7_200 });
    await settle();
    expect(button("Stop work session")).not.toBeNull();
    expect(companion().querySelector(".glance-hero")!.textContent).toBe("2:00:00");
    expect(seam.reads).toEqual(["p1", "p1"]);
  });

  it("past midnight it reads again", async () => {
    await show();
    vi.setSystemTime(new Date(2026, 6, 24, 0, 0, 30));
    seam.payload = reading({ loggedSeconds: 0 });
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(companion().querySelector(".glance-hero")!.textContent).toBe("0:00");
    expect(companion().querySelector(".glance-eyebrow")!.textContent).toBe("Day 4 / 10 · Goal 2h");
  });
});

describe("the companion's summary", () => {
  it("opens on a press on the card, grows the window, and shows the other three cards in short", async () => {
    await show();
    expect(companion().querySelector(".companion-summary")).toBeNull();
    await press(companion().querySelector(".bubble-time")!);
    expect(window.resizeTo).toHaveBeenLastCalledWith(300, 640);
    const text = companion().textContent!;
    expect(text).toContain("Phase 1 of 2");
    expect(text).toContain("Dig the beds");
    expect(text).toContain("30% · Focus");
    expect(text).toContain("Water");
    expect(text).toContain("Tasks · 0 of 2 done");
    await press(button("Show the clock alone")!);
    expect(companion().querySelector(".companion-summary")).toBeNull();
    expect(window.resizeTo).toHaveBeenLastCalledWith(300, 250);
  });

  it("a press on the clock's button does not open it", async () => {
    await show();
    await press(button("Start work session")!);
    expect(companion().querySelector(".companion-summary")).toBeNull();
  });

  it("lists the first four open tasks and counts the rest", async () => {
    seam.payload = reading({
      tasks: [task("t0", "Done one", true), ...["a", "b", "c", "d", "e", "f"].map((id) => task(id, `Task ${id}`))],
    });
    await show();
    await expand();
    expect([...companion().querySelectorAll(".task-text")].map((el) => el.textContent)).toEqual([
      "Task a",
      "Task b",
      "Task c",
      "Task d",
    ]);
    expect(companion().textContent).toContain("2 more open in Compass");
  });

  it("a ticked task is saved through the seam, stays in its place struck through, and the dashboard is told", async () => {
    await show();
    await expand();
    await press(companion().querySelector(".task-check")!);
    expect(seam.updateTask).toHaveBeenCalledWith("t1", { isDone: true });
    expect(written).toHaveBeenCalledTimes(1);

    seam.payload = reading({ tasks: [task("t1", "Buy seeds", true), task("t2", "Water the beds")] });
    await settle();
    const rows = [...companion().querySelectorAll(".task-item")];
    expect(rows.map((row) => row.textContent)).toEqual(["Buy seeds", "Water the beds"]);
    expect(rows[0].className).toContain("checked");
    expect(companion().textContent).toContain("Tasks · 1 of 2 done");
  });

  it("with no tasks, or none open, it says so", async () => {
    seam.payload = reading({ tasks: [] });
    await show();
    await expand();
    expect(companion().textContent).toContain("Add tasks in Compass");

    seam.payload = reading({ tasks: [task("t1", "Buy seeds", true)] });
    await press(button("Show the clock alone")!);
    await expand();
    expect(companion().textContent).toContain("All caught up");
  });
});

describe("a thought typed in the companion", () => {
  it("is saved on Enter, trimmed, the box empties and says it was saved, and the dashboard is told", async () => {
    await show();
    await expand();
    expect(thoughtBox().maxLength).toBe(4000);
    await type("  Order mulch  ");
    await enter();
    expect(seam.addThought).toHaveBeenCalledWith("Order mulch");
    expect(thoughtBox().value).toBe("");
    expect(thoughtBox().placeholder).toBe("Saved to the thought log");
    expect(written).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(2_400);
    });
    expect(thoughtBox().placeholder).toBe("Capture a thought…");
  });

  it("an empty box saves nothing", async () => {
    await show();
    await expand();
    await type("   ");
    await enter();
    expect(seam.addThought).not.toHaveBeenCalled();
  });

  it("a refused save puts the words back in the box", async () => {
    seam.addThought.mockRejectedValue(new Error("refused"));
    await show();
    await expand();
    await type("Order mulch");
    await enter();
    expect(thoughtBox().value).toBe("Order mulch");
    expect(written).not.toHaveBeenCalled();
  });

  it("another project starts with an empty box and its own reading", async () => {
    await show();
    await expand();
    await type("Order mulch");
    seam.payload = reading({ loggedSeconds: 60 });
    await show("p2");
    expect(thoughtBox().value).toBe("");
    expect(seam.reads[seam.reads.length - 1]).toBe("p2");
    expect(companion().querySelector(".glance-hero")!.textContent).toBe("1:00");
  });

  it("until another project's reading arrives it shows no time and no line of the project before", async () => {
    seam.payload = reading({ loggedSeconds: 3_600, running: true });
    await show();
    expect(companion().querySelector(".glance-hero")!.textContent).toBe("1:00:00");
    seam.payload = null as unknown as ProjectDashboardData;
    await show("p2");
    expect(companion().querySelector(".glance-hero")!.textContent).toBe("0:00");
    expect(companion().querySelector(".glance-eyebrow")!.textContent).toBe("Today");
    expect(button("Start work session")).not.toBeNull();
  });
});

describe("a thought asked for from outside", () => {
  it("opens the summary, grows the window and puts the cursor in the thought box", async () => {
    await show();
    expect(thoughtBox()).toBeNull();
    await show("p1", 1);
    expect(button("Show the clock alone")).not.toBeNull();
    expect(window.resizeTo).toHaveBeenCalledWith(300, 640);
    expect(document.activeElement).toBe(thoughtBox());
  });

  it("with the summary open already it only moves the cursor, and each new asking moves it again", async () => {
    await show();
    await expand();
    expect(document.activeElement).not.toBe(thoughtBox());
    await show("p1", 1);
    expect(document.activeElement).toBe(thoughtBox());
    expect(button("Show the clock alone")).not.toBeNull();

    thoughtBox().blur();
    await show("p1", 2);
    expect(document.activeElement).toBe(thoughtBox());
  });

  it("a companion opened for a thought starts with its summary open; one opened by its button does not", async () => {
    await show("p1", 1);
    expect(document.activeElement).toBe(thoughtBox());
  });

  it("closing the summary by hand afterwards does not bring the cursor back when it is opened again", async () => {
    await show("p1", 1);
    await press(button("Show the clock alone")!);
    await expand();
    expect(document.activeElement).not.toBe(thoughtBox());
  });
});

describe("the companion's other lines", () => {
  it("a failed save anywhere shows the calm note here for four seconds", async () => {
    await show();
    await act(async () => {
      for (const cb of [...seam.failed]) cb();
    });
    expect(companion().querySelector('[role="status"]')!.textContent).toBe("Couldn't save just now — try again in a moment.");
    await act(async () => {
      vi.advanceTimersByTime(4_000);
    });
    expect(companion().querySelector('[role="status"]')).toBeNull();
  });

  it("Open Compass asks for the main window", async () => {
    await show();
    await press([...companion().querySelectorAll("button")].find((b) => b.textContent === "Open Compass")!);
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("closing it stops its listening", async () => {
    await show();
    expect(seam.settled).toHaveLength(1);
    await act(async () => root.render(<div />));
    expect(seam.settled).toHaveLength(0);
    expect(seam.failed).toHaveLength(0);
    expect(document.body.querySelector(".companion")).toBeNull();
  });
});
