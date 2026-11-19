import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "../lib/db";
import type { Task } from "../lib/types";
import TaskPanel from "./TaskPanel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_1 =
  "In a task list longer than its panel, holding a dragged task near the bottom edge scrolls the list down, and near the top edge scrolls it up, at the same pace and within the same distance of the edge as the thought log";
const CHECK_2 = "A task dropped after the list has scrolled lands where the pointer is, and the new order is the same after a reload";
const CHECK_3 = "Moving the pointer back towards the middle of the list stops the scrolling";
const CHECK_4 = "Holding the pointer above or below the list keeps it scrolling; moving it off to either side of the list stops it";
const CHECK_5 =
  "Dropping the task, or pressing Escape to cancel the drag, stops the scrolling; after a cancel the list stays where it scrolled to and the task keeps its old place";
const CHECK_6 = "A task list short enough to fit its panel does not move during a drag";

const KEEP_REAL = vi.hoisted(() => new Set(["SaveFailedError", "todayDate", "getActiveProjectId"]));
vi.mock("../lib/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/db")>();
  const quiet: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(real)) {
    quiet[name] = typeof value === "function" && !KEEP_REAL.has(name) ? vi.fn(async () => undefined) : value;
  }
  return quiet;
});

const PACE = 14;
const ZONE = 56;

interface Point {
  x: number;
  y: number;
}
const LIST = { top: 100, bottom: 400, left: 100, right: 400 };
const ROW_H = 40;
const X = 250;
const NEAR_BOTTOM: Point = { x: X, y: LIST.bottom - 10 };
const NEAR_TOP: Point = { x: X, y: LIST.top + 10 };
const MIDDLE: Point = { x: X, y: (LIST.top + LIST.bottom) / 2 };
const ABOVE: Point = { x: X, y: LIST.top - 60 };
const BELOW: Point = { x: X, y: LIST.bottom + 60 };
const RIGHT_SIDE: Point = { x: LIST.right + 40, y: LIST.bottom - 10 };
const LEFT_SIDE: Point = { x: LIST.left - 40, y: LIST.bottom - 10 };
const UNITS = ".task-item";

type FrameHost = { requestAnimationFrame: typeof requestAnimationFrame; cancelAnimationFrame: typeof cancelAnimationFrame };
const hosts = Array.from(new Set<FrameHost>([globalThis as unknown as FrameHost, window as unknown as FrameHost]));
let saved: Array<{ host: FrameHost; raf: FrameHost["requestAnimationFrame"]; caf: FrameHost["cancelAnimationFrame"] }> = [];
let queue = new Map<number, FrameRequestCallback>();
let lastId = 0;
let clock = 0;

function installFrames(): void {
  queue = new Map();
  saved = hosts.map((host) => ({ host, raf: host.requestAnimationFrame, caf: host.cancelAnimationFrame }));
  const raf = (cb: FrameRequestCallback): number => {
    lastId += 1;
    queue.set(lastId, cb);
    return lastId;
  };
  const caf = (id: number): void => {
    queue.delete(id);
  };
  for (const host of hosts) {
    host.requestAnimationFrame = raf;
    host.cancelAnimationFrame = caf;
  }
}
function restoreFrames(): void {
  for (const s of saved) {
    s.host.requestAnimationFrame = s.raf;
    s.host.cancelAnimationFrame = s.caf;
  }
  queue.clear();
}
async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await act(async () => {
      const due = Array.from(queue.values());
      queue.clear();
      clock += 1000 / 60;
      for (const cb of due) cb(clock);
    });
  }
}

interface PlayedList {
  el: HTMLElement;
  top: number;
}
let list: PlayedList | null = null;
const realRect = Element.prototype.getBoundingClientRect;

function rect(top: number, height: number): DOMRect {
  return {
    top,
    bottom: top + height,
    left: LIST.left,
    right: LIST.right,
    x: LIST.left,
    y: top,
    width: LIST.right - LIST.left,
    height,
    toJSON() {
      return this;
    },
  } as DOMRect;
}
function rows(): HTMLElement[] {
  return list ? Array.from(list.el.querySelectorAll<HTMLElement>(UNITS)).filter((r) => r.querySelector(".task-handle")) : [];
}
function rowTop(i: number): number {
  return LIST.top + i * ROW_H - (list?.top ?? 0);
}
function rectInList(el: Element): DOMRect {
  const all = rows();
  const own = el.closest(UNITS);
  if (own && all.includes(own as HTMLElement)) return rect(rowTop(all.indexOf(own as HTMLElement)), ROW_H);
  const held = all.filter((r) => el.contains(r));
  if (held.length) {
    const a = all.indexOf(held[0]);
    return rect(rowTop(a), held.length * ROW_H);
  }
  return rect(rowTop(all.length), ROW_H);
}

function playScrolling(el: HTMLElement, startAt = 0): PlayedList {
  const played: PlayedList = { el, top: startAt };
  const height = LIST.bottom - LIST.top;
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    get: () => played.top,
    set: (v: number) => {
      played.top = Number(v);
    },
  });
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => (rows().length + 1) * ROW_H });
  Object.defineProperty(el, "clientHeight", { configurable: true, get: () => height });
  Object.defineProperty(el, "offsetHeight", { configurable: true, get: () => height });
  el.scrollBy = ((a?: number | ScrollToOptions, b?: number) => {
    played.top += typeof a === "object" ? (a.top ?? 0) : (b ?? 0);
  }) as typeof el.scrollBy;
  el.scrollTo = ((a?: number | ScrollToOptions, b?: number) => {
    const top = typeof a === "object" ? a.top : b;
    if (typeof top === "number") played.top = top;
  }) as typeof el.scrollTo;
  list = played;
  return played;
}

function under(p: Point): Element {
  const inside = p.x >= LIST.left && p.x <= LIST.right && p.y >= LIST.top && p.y <= LIST.bottom;
  if (!inside || !list) return document.body;
  const i = Math.floor((p.y - LIST.top + list.top) / ROW_H);
  return rows()[i] ?? list.el;
}

function transfer() {
  const data = new Map<string, string>();
  return {
    dropEffect: "move",
    effectAllowed: "all",
    types: [] as string[],
    files: [] as File[],
    items: [] as unknown[],
    setData(type: string, value: string) {
      data.set(type, value);
      this.types = Array.from(data.keys());
    },
    getData(type: string) {
      return data.get(type) ?? "";
    },
    clearData() {
      data.clear();
      this.types = [];
    },
    setDragImage() {},
  };
}
type Transfer = ReturnType<typeof transfer>;
function dragEvent(type: string, p: Point, dt: Transfer): MouseEvent {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: 0 });
  Object.defineProperty(ev, "dataTransfer", { value: dt });
  return ev;
}

class Drag {
  private over: Element | null = null;
  private constructor(
    private readonly source: Element,
    private readonly dt: Transfer,
    private at: Point,
  ) {}

  static async fromGrip(grip: Element): Promise<Drag> {
    const r = grip.getBoundingClientRect();
    const p = { x: X, y: r.top + r.height / 2 };
    const init = { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: 0, buttons: 1 };
    await act(async () => {
      const Pointer = typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
      grip.dispatchEvent(new Pointer("pointerdown", init));
      grip.dispatchEvent(new MouseEvent("mousedown", init));
    });
    const source = grip.closest('[draggable="true"]') ?? grip;
    const drag = new Drag(source, transfer(), p);
    await act(async () => {
      source.dispatchEvent(dragEvent("dragstart", p, drag.dt));
    });
    return drag;
  }

  private async report(): Promise<void> {
    const target = under(this.at);
    await act(async () => {
      if (target !== this.over) {
        this.over?.dispatchEvent(dragEvent("dragleave", this.at, this.dt));
        target.dispatchEvent(dragEvent("dragenter", this.at, this.dt));
        this.over = target;
      }
      target.dispatchEvent(dragEvent("dragover", this.at, this.dt));
    });
  }

  async hold(p: Point, n: number): Promise<void> {
    this.at = p;
    await this.report();
    for (let i = 1; i <= n; i += 1) {
      await frames(1);
      if (i % 3 === 0) await this.report();
    }
  }

  async drop(): Promise<void> {
    await this.report();
    const target = this.over!;
    await act(async () => {
      target.dispatchEvent(dragEvent("drop", this.at, this.dt));
    });
    await act(async () => {
      this.source.dispatchEvent(dragEvent("dragend", this.at, this.dt));
    });
  }

  async cancel(): Promise<void> {
    await act(async () => {
      this.over?.dispatchEvent(dragEvent("dragleave", this.at, this.dt));
    });
    this.dt.dropEffect = "none";
    await act(async () => {
      this.source.dispatchEvent(dragEvent("dragend", this.at, this.dt));
    });
  }
}

const pad = (n: number) => String(n).padStart(2, "0");
function task(n: number, sortOrder = n): Task {
  return {
    id: `t${pad(n)}`,
    projectId: "p1",
    userId: "u1",
    text: `Task ${pad(n)}`,
    isDone: false,
    sortOrder,
    taskDate: "2026-10-14",
    phaseId: null,
    learningItemId: null,
    createdAt: `2026-10-14T16:${pad(n)}:00.000Z`,
  };
}
const tasks = (count: number) => Array.from({ length: count }, (_, i) => task(i));
const names = (ns: number[]) => ns.map((n) => `Task ${pad(n)}`);
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mountPanel(initialTasks: Task[], startAt = 0): Promise<PlayedList> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<TaskPanel initialTasks={initialTasks} initialThoughts={[]} initialThoughtGroups={[]} />);
  });
  const el = Array.from(container.querySelectorAll("ul")).find((ul) => ul.querySelector(UNITS));
  expect(el, "harness: the task list").toBeTruthy();
  return playScrolling(el!, startAt);
}
async function unmountPanel(): Promise<void> {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  container = null;
  list = null;
}

function shown(): string[] {
  return rows()
    .map((r) => r.textContent?.match(/Task \d\d/)?.[0] ?? "")
    .filter(Boolean);
}
function gripOf(name: string): Element {
  const row = rows().find((r) => r.textContent?.includes(name));
  const grip = row?.querySelector(".task-handle");
  expect(grip, `harness: the grip of "${name}"`).toBeTruthy();
  return grip!;
}
const scrolled = () => list!.top;

beforeEach(() => {
  installFrames();
  vi.clearAllMocks();
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (list && this === list.el) return rect(LIST.top, LIST.bottom - LIST.top);
    if (list && list.el.contains(this)) return rectInList(this);
    return realRect.call(this);
  };
});

afterEach(async () => {
  await unmountPanel();
  Element.prototype.getBoundingClientRect = realRect;
  restoreFrames();
});

describe("a long task list scrolls while a task is dragged to its edge", () => {
  it(`${CHECK_1} — near the bottom edge the list scrolls down, 14 px a frame`, async () => {
    await mountPanel(tasks(30));
    const drag = await Drag.fromGrip(gripOf("Task 02"));
    await drag.hold(NEAR_BOTTOM, 10);
    expect(scrolled(), "the list's scroll position after 10 frames near the bottom edge").toBe(10 * PACE);
  });

  it(`${CHECK_1} — near the top edge the list scrolls up, 14 px a frame`, async () => {
    await mountPanel(tasks(30));
    const drag = await Drag.fromGrip(gripOf("Task 02"));
    await drag.hold(NEAR_BOTTOM, 20);
    expect(scrolled(), "the list's scroll position after 20 frames near the bottom edge").toBe(20 * PACE);
    await drag.hold(NEAR_TOP, 10);
    expect(scrolled(), "the list's scroll position after 10 more frames near the top edge").toBe(10 * PACE);
  });

  it(`${CHECK_1} — the edge zone is 56 px deep: 54 px from an edge scrolls, 58 px does not`, async () => {
    await mountPanel(tasks(30), 500);
    const drag = await Drag.fromGrip(gripOf("Task 15"));
    await drag.hold({ x: X, y: LIST.bottom - (ZONE + 2) }, 10);
    expect(scrolled(), "58 px from the bottom edge").toBe(500);
    await drag.hold({ x: X, y: LIST.top + (ZONE + 2) }, 10);
    expect(scrolled(), "58 px from the top edge").toBe(500);
    await drag.hold({ x: X, y: LIST.bottom - (ZONE - 2) }, 10);
    expect(scrolled(), "54 px from the bottom edge").toBe(500 + 10 * PACE);
    await drag.hold({ x: X, y: LIST.top + (ZONE - 2) }, 10);
    expect(scrolled(), "54 px from the top edge").toBe(500);
  });

  it(`${CHECK_2} — the task lands just above the task under the pointer, and the seam is handed that order`, async () => {
    await mountPanel(tasks(30));
    const drag = await Drag.fromGrip(gripOf("Task 00"));
    await drag.hold(NEAR_BOTTOM, 40);
    expect(scrolled(), "the list scrolled 40 frames' worth").toBe(40 * PACE);
    await drag.hold({ x: X, y: 190 }, 3);
    expect(under({ x: X, y: 190 }).textContent, "harness: the row under the pointer").toContain("Task 16");
    await drag.drop();

    const expected = names([...range(1, 15), 0, ...range(16, 29)]);
    expect(shown(), "the list's order after the drop").toEqual(expected);
    const calls = vi.mocked(db.reorderTasks).mock.calls;
    expect(calls.length, "the new order is handed to the seam to be saved").toBeGreaterThan(0);
    expect(calls[calls.length - 1][0], "the order saved").toEqual(expected.map((n) => `t${n.slice(5)}`));
  });

  it(`${CHECK_2} — after a reload from the saved order, the list shows the same order`, async () => {
    await mountPanel(tasks(30));
    const drag = await Drag.fromGrip(gripOf("Task 00"));
    await drag.hold(NEAR_BOTTOM, 40);
    await drag.hold({ x: X, y: 190 }, 3);
    await drag.drop();
    const before = shown();
    const calls = vi.mocked(db.reorderTasks).mock.calls;
    expect(calls.length, "the new order is handed to the seam to be saved").toBeGreaterThan(0);
    const saved = calls[calls.length - 1][0];

    await unmountPanel();
    const reloaded = saved.map((id, i) => task(Number(id.slice(1)), i));
    await mountPanel(reloaded);
    expect(shown(), "the order after a reload").toEqual(before);
    expect(before, "the drop landed where the pointer was").toEqual(names([...range(1, 15), 0, ...range(16, 29)]));
  });

  it(`${CHECK_3} — after scrolling down, the pointer moved to the middle stops the list where it is`, async () => {
    await mountPanel(tasks(30));
    const drag = await Drag.fromGrip(gripOf("Task 02"));
    await drag.hold(NEAR_BOTTOM, 10);
    expect(scrolled(), "the list scrolled while held near the bottom edge").toBe(10 * PACE);
    await drag.hold(MIDDLE, 15);
    expect(scrolled(), "the list after 15 frames in the middle").toBe(10 * PACE);
  });

  it(`${CHECK_4} — held below the list, it keeps scrolling down`, async () => {
    await mountPanel(tasks(30));
    const drag = await Drag.fromGrip(gripOf("Task 02"));
    await drag.hold(BELOW, 10);
    expect(scrolled(), "after 10 frames below the list").toBe(10 * PACE);
    await drag.hold(BELOW, 10);
    expect(scrolled(), "after 20 frames below the list").toBe(20 * PACE);
  });

  it(`${CHECK_4} — held above the list, it keeps scrolling up`, async () => {
    await mountPanel(tasks(30));
    const drag = await Drag.fromGrip(gripOf("Task 02"));
    await drag.hold(BELOW, 30);
    expect(scrolled(), "after 30 frames below the list").toBe(30 * PACE);
    await drag.hold(ABOVE, 10);
    expect(scrolled(), "after 10 frames above the list").toBe(20 * PACE);
    await drag.hold(ABOVE, 10);
    expect(scrolled(), "after 20 frames above the list").toBe(10 * PACE);
  });

  it(`${CHECK_4} — moved off to the right of the list, the scrolling stops`, async () => {
    await mountPanel(tasks(30));
    const drag = await Drag.fromGrip(gripOf("Task 02"));
    await drag.hold(NEAR_BOTTOM, 10);
    expect(scrolled(), "the list scrolled while held near the bottom edge").toBe(10 * PACE);
    await drag.hold(RIGHT_SIDE, 15);
    expect(scrolled(), "the list after 15 frames off to the right").toBe(10 * PACE);
  });

  it(`${CHECK_4} — moved off to the left of the list, the scrolling stops`, async () => {
    await mountPanel(tasks(30));
    const drag = await Drag.fromGrip(gripOf("Task 02"));
    await drag.hold(NEAR_BOTTOM, 10);
    expect(scrolled(), "the list scrolled while held near the bottom edge").toBe(10 * PACE);
    await drag.hold(LEFT_SIDE, 15);
    expect(scrolled(), "the list after 15 frames off to the left").toBe(10 * PACE);
  });

  it(`${CHECK_5} — a drop stops the scrolling`, async () => {
    await mountPanel(tasks(30));
    const drag = await Drag.fromGrip(gripOf("Task 02"));
    await drag.hold(NEAR_BOTTOM, 10);
    expect(scrolled(), "the list scrolled while held near the bottom edge").toBe(10 * PACE);
    await drag.drop();
    await frames(15);
    expect(scrolled(), "the list 15 frames after the drop").toBe(10 * PACE);
  });

  it(`${CHECK_5} — Escape stops the scrolling, the list stays where it scrolled to, and the task keeps its old place`, async () => {
    await mountPanel(tasks(30));
    const drag = await Drag.fromGrip(gripOf("Task 02"));
    await drag.hold(NEAR_BOTTOM, 10);
    expect(scrolled(), "the list scrolled while held near the bottom edge").toBe(10 * PACE);
    await drag.cancel();
    await frames(15);
    expect(scrolled(), "the list 15 frames after the cancel").toBe(10 * PACE);
    expect(shown(), "the order after the cancel").toEqual(names(range(0, 29)));
    expect(vi.mocked(db.reorderTasks), "no new order is saved").not.toHaveBeenCalled();
  });

  it(`${CHECK_6} — three tasks: the list stays still wherever the drag is held`, async () => {
    await mountPanel(tasks(3));
    const drag = await Drag.fromGrip(gripOf("Task 01"));
    for (const [label, p] of [
      ["near the bottom edge", NEAR_BOTTOM],
      ["below the list", BELOW],
      ["near the top edge", NEAR_TOP],
      ["above the list", ABOVE],
    ] as const) {
      await drag.hold(p, 10);
      expect(scrolled(), `the list's scroll position, held ${label}`).toBe(0);
    }
  });
});

describe("a task let go over the add row at the list's end lands after the last task", () => {
  it("held at the bottom edge until the list's end, then dropped on the add row's upper half", async () => {
    await mountPanel(tasks(10));
    const drag = await Drag.fromGrip(gripOf("Task 00"));
    await drag.hold(NEAR_BOTTOM, 20);
    expect(scrolled(), "harness: the list at its end (11 rows of 40 px in a 300 px box)").toBe(140);
    const addRow = list!.el.querySelector<HTMLElement>(".task-add-row")!;
    const p = { x: X, y: 370 };
    const dt = transfer();
    const over = dragEvent("dragover", p, dt);
    await act(async () => {
      addRow.dispatchEvent(over);
    });
    expect(over.defaultPrevented, "the add row accepts the drop").toBe(true);
    expect(rows()[9].style.boxShadow, "the drop line under the last task").toBe("inset 0 -2px 0 var(--accent-task)");
    await act(async () => {
      addRow.dispatchEvent(dragEvent("drop", p, dt));
    });
    await act(async () => {
      rows().find((r) => r.textContent?.includes("Task 00"))!.dispatchEvent(dragEvent("dragend", p, dt));
    });

    const expected = names([...range(1, 9), 0]);
    expect(shown(), "the list's order after the drop").toEqual(expected);
    expect(vi.mocked(db.reorderTasks), "the order saved").toHaveBeenLastCalledWith(expected.map((n) => `t${n.slice(5)}`));
    expect(rows().map((r) => r.style.boxShadow).filter(Boolean), "no drop line left on screen").toEqual([]);
  });
});

describe("a task's text dragged without its grip neither scrolls the list nor reorders it", () => {
  it("text lifted from a task, held near the bottom edge, then dropped on another task", async () => {
    await mountPanel(tasks(30));
    const text = rows()[0].querySelector(".task-text")!;
    const dt = transfer();
    const fire = (el: Element, type: string, p: Point) => act(async () => void el.dispatchEvent(dragEvent(type, p, dt)));
    await fire(text, "dragstart", { x: X, y: rowTop(0) + ROW_H / 2 });
    for (let i = 0; i < 4; i += 1) {
      await fire(under(NEAR_BOTTOM), "dragover", NEAR_BOTTOM);
      await frames(3);
    }
    expect(scrolled(), "the list after 12 frames near the bottom edge").toBe(0);
    const target = under(MIDDLE);
    await fire(target, "dragover", MIDDLE);
    await fire(target, "drop", MIDDLE);
    await fire(text, "dragend", MIDDLE);
    expect(shown(), "the order after the drop").toEqual(names(range(0, 29)));
    expect(vi.mocked(db.reorderTasks), "no new order is saved").not.toHaveBeenCalled();
  });
});
