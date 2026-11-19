import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "../lib/db";
import type { Thought, ThoughtGroup } from "../lib/types";
import ThoughtLog from "./ThoughtLog";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_7 = "The thought log does all of the above — for a loose thought, a whole group, and a thought dragged inside its group";
const OF_1 = "check 1, holding it near the bottom edge scrolls down and near the top edge scrolls up, 14 px a frame within 56 px";
const OF_2 = "check 2, dropped after the feed has scrolled it lands where the pointer is, and the new order is the same after a reload";
const OF_3 = "check 3, moving the pointer back towards the middle stops the scrolling";
const OF_4 = "check 4, holding the pointer above or below the feed keeps it scrolling; moving it off to either side stops it";
const OF_5 = "check 5, dropping or pressing Escape stops the scrolling; after a cancel the feed stays where it scrolled and the item keeps its place";
const OF_6 = "check 6, a feed short enough to fit its panel does not move during a drag";

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
const UNITS = ".th-row, .th-group-header";

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
function units(): HTMLElement[] {
  return list ? Array.from(list.el.querySelectorAll<HTMLElement>(UNITS)).filter((u) => u.querySelector(".th-handle")) : [];
}
function unitTop(i: number): number {
  return LIST.top + i * ROW_H - (list?.top ?? 0);
}
function rectInList(el: Element): DOMRect {
  const all = units();
  const own = el.closest(UNITS);
  if (own && all.includes(own as HTMLElement)) return rect(unitTop(all.indexOf(own as HTMLElement)), ROW_H);
  const held = all.filter((u) => el.contains(u));
  if (held.length) {
    const a = all.indexOf(held[0]);
    const b = all.indexOf(held[held.length - 1]);
    return rect(unitTop(a), (b - a + 1) * ROW_H);
  }
  return rect(unitTop(all.length), ROW_H);
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
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => (units().length + 1) * ROW_H });
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
  return units()[i] ?? list.el;
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
    const p = { x: X, y: r.top + Math.min(r.height, ROW_H) / 2 };
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
const label = (n: number) => `Thought ${pad(n)}`;
const GROUP = "Cluster";
const HEADER = `[${GROUP}]`;
function thought(n: number, sortOrder: number, groupId: string | null = null): Thought {
  return {
    id: `h${pad(n)}`,
    projectId: "p1",
    userId: "u1",
    text: label(n),
    sortOrder,
    groupId,
    createdAt: `2026-10-14T16:${pad(n)}:00.000Z`,
  };
}
function group(sortOrder: number): ThoughtGroup {
  return { id: "g1", projectId: "p1", userId: "u1", name: GROUP, sortOrder, createdAt: "2026-10-14T15:00:00.000Z" };
}
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

interface Feed {
  thoughts: Thought[];
  groups: ThoughtGroup[];
}

interface Kind {
  name: string;
  long(): Feed;
  short(): Feed;
  grip(): Element;
  dropped: string[];
  savedOrder(): string[];
  reloaded(order: string[]): Feed;
}

function rowNamed(name: string): HTMLElement | undefined {
  return units().find((u) => u.matches(".th-row") && u.textContent?.includes(name));
}
function gripIn(el: Element | undefined | null, what: string): Element {
  const grip = el?.querySelector(".th-handle");
  expect(grip, `harness: the grip of ${what}`).toBeTruthy();
  return grip!;
}
function lastCall<T extends unknown[]>(fn: (...args: T) => unknown): T | undefined {
  const calls = vi.mocked(fn).mock.calls as unknown as T[];
  return calls.length ? calls[calls.length - 1] : undefined;
}
function feedOrderSaved(): string[] {
  const call = lastCall(db.reorderFeed);
  expect(call, "the new feed order is handed to the seam to be saved").toBeTruthy();
  return call![0].map((item) => `${item.kind}:${item.id}`);
}

const KINDS: Kind[] = [
  {
    name: "a loose thought",
    long: () => ({ thoughts: range(0, 30).map((n) => thought(n, n)), groups: [] }),
    short: () => ({ thoughts: range(0, 2).map((n) => thought(n, n)), groups: [] }),
    grip: () => gripIn(rowNamed(label(0)), `"${label(0)}"`),
    dropped: [...range(1, 15), 0, ...range(16, 30)].map(label),
    savedOrder: feedOrderSaved,
    reloaded: (order) => ({
      thoughts: order.map((key, i) => thought(Number(key.slice("thought:h".length)), i)),
      groups: [],
    }),
  },
  {
    name: "a whole group",
    long: () => ({
      thoughts: [thought(0, 0, "g1"), thought(1, 1, "g1"), ...range(2, 29).map((n) => thought(n, n - 1))],
      groups: [group(0)],
    }),
    short: () => ({ thoughts: [thought(0, 0, "g1"), thought(1, 1)], groups: [group(0)] }),
    grip: () => {
      const header = units().find((u) => u.matches(".th-group-header"));
      return gripIn(header, "the group's header");
    },
    dropped: [...range(2, 14).map(label), HEADER, label(0), label(1), ...range(15, 29).map(label)],
    savedOrder: feedOrderSaved,
    reloaded: (order) => {
      const thoughts: Thought[] = [thought(0, 0, "g1"), thought(1, 1, "g1")];
      const groups: ThoughtGroup[] = [];
      order.forEach((key, i) => {
        if (key === "group:g1") groups.push(group(i));
        else thoughts.push(thought(Number(key.slice("thought:h".length)), i));
      });
      return { thoughts, groups };
    },
  },
  {
    name: "a thought dragged inside its group",
    long: () => ({ thoughts: range(0, 29).map((n) => thought(n, n, "g1")), groups: [group(0)] }),
    short: () => ({ thoughts: range(0, 2).map((n) => thought(n, n, "g1")), groups: [group(0)] }),
    grip: () => gripIn(rowNamed(label(0)), `"${label(0)}" inside its group`),
    dropped: [HEADER, ...[...range(1, 14), 0, ...range(15, 29)].map(label)],
    savedOrder: () => {
      const call = lastCall(db.reorderThoughtsInGroup);
      expect(call, "the group's new order is handed to the seam to be saved").toBeTruthy();
      expect(call![0], "the group whose order is saved").toBe("g1");
      return call![1];
    },
    reloaded: (order) => ({
      thoughts: order.map((id, i) => thought(Number(id.slice(1)), i, "g1")),
      groups: [group(0)],
    }),
  },
];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mountLog(feed: Feed, startAt = 0): Promise<PlayedList> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ThoughtLog initialThoughts={feed.thoughts} initialGroups={feed.groups} />);
  });
  const el = Array.from(container.querySelectorAll("ul")).find((ul) => ul.querySelector(".th-row"));
  expect(el, "harness: the thought feed").toBeTruthy();
  return playScrolling(el!, startAt);
}
async function unmountLog(): Promise<void> {
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
  return units().map((u) => (u.matches(".th-group-header") ? (u.textContent?.includes(GROUP) ? HEADER : "[?]") : (u.textContent?.match(/Thought \d\d/)?.[0] ?? "?")));
}
const scrolled = () => list!.top;
const REORDERS = () => [db.reorderFeed, db.reorderThoughtsInGroup, db.moveThoughtToGroup].map((fn) => vi.mocked(fn));

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
  await unmountLog();
  Element.prototype.getBoundingClientRect = realRect;
  restoreFrames();
});

for (const kind of KINDS) {
  describe(`the thought log scrolls while ${kind.name} is dragged to its edge`, () => {
    it(`${CHECK_7} — ${kind.name}, ${OF_1}: near the bottom edge the feed scrolls down`, async () => {
      await mountLog(kind.long());
      const drag = await Drag.fromGrip(kind.grip());
      await drag.hold(NEAR_BOTTOM, 10);
      expect(scrolled(), "the feed's scroll position after 10 frames near the bottom edge").toBe(10 * PACE);
    });

    it(`${CHECK_7} — ${kind.name}, ${OF_1}: near the top edge the feed scrolls up`, async () => {
      await mountLog(kind.long());
      const drag = await Drag.fromGrip(kind.grip());
      await drag.hold(NEAR_BOTTOM, 20);
      expect(scrolled(), "after 20 frames near the bottom edge").toBe(20 * PACE);
      await drag.hold(NEAR_TOP, 10);
      expect(scrolled(), "after 10 more frames near the top edge").toBe(10 * PACE);
    });

    it(`${CHECK_7} — ${kind.name}, ${OF_1}: 54 px from an edge scrolls, 58 px does not`, async () => {
      await mountLog(kind.long());
      const drag = await Drag.fromGrip(kind.grip());
      await drag.hold(NEAR_BOTTOM, 20);
      expect(scrolled(), "after 20 frames near the bottom edge").toBe(20 * PACE);
      await drag.hold({ x: X, y: LIST.bottom - (ZONE + 2) }, 10);
      expect(scrolled(), "58 px from the bottom edge").toBe(20 * PACE);
      await drag.hold({ x: X, y: LIST.top + (ZONE + 2) }, 10);
      expect(scrolled(), "58 px from the top edge").toBe(20 * PACE);
      await drag.hold({ x: X, y: LIST.bottom - (ZONE - 2) }, 10);
      expect(scrolled(), "54 px from the bottom edge").toBe(30 * PACE);
      await drag.hold({ x: X, y: LIST.top + (ZONE - 2) }, 10);
      expect(scrolled(), "54 px from the top edge").toBe(20 * PACE);
    });

    it(`${CHECK_7} — ${kind.name}, ${OF_2}`, async () => {
      await mountLog(kind.long());
      const drag = await Drag.fromGrip(kind.grip());
      await drag.hold(NEAR_BOTTOM, 40);
      expect(scrolled(), "the feed scrolled 40 frames' worth").toBe(40 * PACE);
      await drag.hold({ x: X, y: 190 }, 3);
      await drag.drop();
      expect(shown(), "the feed's order after the drop").toEqual(kind.dropped);

      const order = kind.savedOrder();
      await unmountLog();
      await mountLog(kind.reloaded(order));
      expect(shown(), "the feed's order after a reload").toEqual(kind.dropped);
    });

    it(`${CHECK_7} — ${kind.name}, ${OF_3}`, async () => {
      await mountLog(kind.long());
      const drag = await Drag.fromGrip(kind.grip());
      await drag.hold(NEAR_BOTTOM, 10);
      expect(scrolled(), "the feed scrolled while held near the bottom edge").toBe(10 * PACE);
      await drag.hold(MIDDLE, 15);
      expect(scrolled(), "the feed after 15 frames in the middle").toBe(10 * PACE);
    });

    it(`${CHECK_7} — ${kind.name}, ${OF_4}: held below the feed, it keeps scrolling down`, async () => {
      await mountLog(kind.long());
      const drag = await Drag.fromGrip(kind.grip());
      await drag.hold(BELOW, 10);
      expect(scrolled(), "after 10 frames below the feed").toBe(10 * PACE);
      await drag.hold(BELOW, 10);
      expect(scrolled(), "after 20 frames below the feed").toBe(20 * PACE);
    });

    it(`${CHECK_7} — ${kind.name}, ${OF_4}: held above the feed, it keeps scrolling up`, async () => {
      await mountLog(kind.long());
      const drag = await Drag.fromGrip(kind.grip());
      await drag.hold(BELOW, 30);
      expect(scrolled(), "after 30 frames below the feed").toBe(30 * PACE);
      await drag.hold(ABOVE, 10);
      expect(scrolled(), "after 10 frames above the feed").toBe(20 * PACE);
      await drag.hold(ABOVE, 10);
      expect(scrolled(), "after 20 frames above the feed").toBe(10 * PACE);
    });

    it(`${CHECK_7} — ${kind.name}, ${OF_4}: moved off to the right, the scrolling stops`, async () => {
      await mountLog(kind.long());
      const drag = await Drag.fromGrip(kind.grip());
      await drag.hold(NEAR_BOTTOM, 10);
      expect(scrolled(), "the feed scrolled while held near the bottom edge").toBe(10 * PACE);
      await drag.hold(RIGHT_SIDE, 15);
      expect(scrolled(), "the feed after 15 frames off to the right").toBe(10 * PACE);
    });

    it(`${CHECK_7} — ${kind.name}, ${OF_4}: moved off to the left, the scrolling stops`, async () => {
      await mountLog(kind.long());
      const drag = await Drag.fromGrip(kind.grip());
      await drag.hold(NEAR_BOTTOM, 10);
      expect(scrolled(), "the feed scrolled while held near the bottom edge").toBe(10 * PACE);
      await drag.hold(LEFT_SIDE, 15);
      expect(scrolled(), "the feed after 15 frames off to the left").toBe(10 * PACE);
    });

    it(`${CHECK_7} — ${kind.name}, ${OF_5}: a drop stops the scrolling`, async () => {
      await mountLog(kind.long());
      const drag = await Drag.fromGrip(kind.grip());
      await drag.hold(NEAR_BOTTOM, 10);
      expect(scrolled(), "the feed scrolled while held near the bottom edge").toBe(10 * PACE);
      await drag.drop();
      await frames(15);
      expect(scrolled(), "the feed 15 frames after the drop").toBe(10 * PACE);
    });

    it(`${CHECK_7} — ${kind.name}, ${OF_5}: Escape stops the scrolling, the feed stays where it scrolled to, and the item keeps its old place`, async () => {
      await mountLog(kind.long());
      const before = shown();
      const drag = await Drag.fromGrip(kind.grip());
      await drag.hold(NEAR_BOTTOM, 10);
      expect(scrolled(), "the feed scrolled while held near the bottom edge").toBe(10 * PACE);
      await drag.cancel();
      await frames(15);
      expect(scrolled(), "the feed 15 frames after the cancel").toBe(10 * PACE);
      expect(shown(), "the feed's order after the cancel").toEqual(before);
      for (const fn of REORDERS()) expect(fn, "nothing is reordered or moved").not.toHaveBeenCalled();
    });

    it(`${CHECK_7} — ${kind.name}, ${OF_6}`, async () => {
      await mountLog(kind.short());
      const drag = await Drag.fromGrip(kind.grip());
      for (const [where, p] of [
        ["near the bottom edge", NEAR_BOTTOM],
        ["below the feed", BELOW],
        ["near the top edge", NEAR_TOP],
        ["above the feed", ABOVE],
      ] as const) {
        await drag.hold(p, 10);
        expect(scrolled(), `the feed's scroll position, held ${where}`).toBe(0);
      }
    });
  });
}

const leafNamed = (name: string) =>
  Array.from(rowNamed(name)?.querySelectorAll("*") ?? []).find((el) => el.children.length === 0 && el.textContent === name);
const TEXT_OF: Record<string, () => Element | null | undefined> = {
  "a loose thought": () => leafNamed(label(0)),
  "a whole group": () => list!.el.querySelector(".th-group-name"),
  "a thought dragged inside its group": () => leafNamed(label(0)),
};
for (const kind of KINDS) {
  describe(`text dragged without the grip of ${kind.name} neither scrolls the feed nor reorders it`, () => {
    it("text lifted, held near the bottom edge, then dropped on another unit", async () => {
      await mountLog(kind.long());
      const before = shown();
      const text = TEXT_OF[kind.name]();
      expect(text, "harness: the text to lift").toBeTruthy();
      const dt = transfer();
      const fire = (el: Element, type: string, p: Point) => act(async () => void el.dispatchEvent(dragEvent(type, p, dt)));
      await fire(text!, "dragstart", { x: X, y: unitTop(0) + ROW_H / 2 });
      for (let i = 0; i < 4; i += 1) {
        await fire(under(NEAR_BOTTOM), "dragover", NEAR_BOTTOM);
        await frames(3);
      }
      expect(scrolled(), "the feed after 12 frames near the bottom edge").toBe(0);
      const target = under(MIDDLE);
      await fire(target, "dragover", MIDDLE);
      await fire(target, "drop", MIDDLE);
      await fire(text!, "dragend", MIDDLE);
      expect(shown(), "the feed's order after the drop").toEqual(before);
      for (const fn of REORDERS()) expect(fn, "nothing is reordered or moved").not.toHaveBeenCalled();
    });
  });
}
