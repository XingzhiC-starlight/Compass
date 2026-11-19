import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { edgeScrollStep, useEdgeAutoScroll, type EdgeAutoScroll, type ListBox, type PointerAt } from "./useEdgeAutoScroll";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_1 =
  "In a task list longer than its panel, holding a dragged task near the bottom edge scrolls the list down, and near the top edge scrolls it up, at the same pace and within the same distance of the edge as the thought log";
const CHECK_3 = "Moving the pointer back towards the middle of the list stops the scrolling";
const CHECK_4 = "Holding the pointer above or below the list keeps it scrolling; moving it off to either side of the list stops it";
const CHECK_5 =
  "Dropping the task, or pressing Escape to cancel the drag, stops the scrolling; after a cancel the list stays where it scrolled to and the task keeps its old place";
const CHECK_6 = "A task list short enough to fit its panel does not move during a drag";

const PACE = 14;
const ZONE = 56;

const BOX: ListBox = { top: 100, bottom: 400, left: 100, right: 400 };
const X = 250;
const at = (x: number, y: number): PointerAt => ({ x, y });

function step(pointer: PointerAt, box: ListBox = BOX): number | string {
  try {
    return edgeScrollStep(pointer, box);
  } catch (e) {
    return `edgeScrollStep threw: ${(e as Error).message}`;
  }
}

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

const CLIENT_HEIGHT = BOX.bottom - BOX.top;
interface Scroll {
  top: number;
  height: number;
}
let scroll: Scroll = { top: 0, height: 1000 };
let listEl: HTMLUListElement | null = null;
const realRect = Element.prototype.getBoundingClientRect;

function boxRect(): DOMRect {
  return {
    top: BOX.top,
    bottom: BOX.bottom,
    left: BOX.left,
    right: BOX.right,
    x: BOX.left,
    y: BOX.top,
    width: BOX.right - BOX.left,
    height: BOX.bottom - BOX.top,
    toJSON() {
      return this;
    },
  } as DOMRect;
}

function playScrolling(el: HTMLUListElement, contentHeight: number, startAt = 0): void {
  scroll = { top: startAt, height: contentHeight };
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    get: () => scroll.top,
    set: (v: number) => {
      scroll.top = Number(v);
    },
  });
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => scroll.height });
  Object.defineProperty(el, "clientHeight", { configurable: true, get: () => CLIENT_HEIGHT });
  Object.defineProperty(el, "offsetHeight", { configurable: true, get: () => CLIENT_HEIGHT });
  el.scrollBy = ((a?: number | ScrollToOptions, b?: number) => {
    scroll.top += typeof a === "object" ? (a.top ?? 0) : (b ?? 0);
  }) as typeof el.scrollBy;
  el.scrollTo = ((a?: number | ScrollToOptions, b?: number) => {
    const top = typeof a === "object" ? a.top : b;
    if (typeof top === "number") scroll.top = top;
  }) as typeof el.scrollTo;
}

let api: EdgeAutoScroll | null = null;
let failure = "";
let container: HTMLDivElement | null = null;
let root: Root | null = null;

function Harness() {
  const ref = useRef<HTMLUListElement>(null);
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- the harness catches a hook that throws, to report it
    api = useEdgeAutoScroll(ref);
  } catch (e) {
    api = null;
    failure = `useEdgeAutoScroll threw: ${(e as Error).message}`;
  }
  return (
    <div>
      <div className="above">A header above the list</div>
      <ul ref={ref}>
        {Array.from({ length: 25 }, (_, i) => (
          <li key={i}>Row {i}</li>
        ))}
      </ul>
    </div>
  );
}

async function mount(contentHeight: number, startAt = 0): Promise<HTMLUListElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Harness />);
  });
  listEl = container.querySelector("ul");
  expect(listEl, "harness: the list").not.toBeNull();
  playScrolling(listEl!, contentHeight, startAt);
  for (const el of [listEl!, container.querySelector(".above")!]) {
    el.addEventListener("dragover", (e) => e.stopPropagation());
  }
  return listEl!;
}

function call(what: "start" | "stop"): void {
  try {
    api?.[what]();
  } catch (e) {
    failure = `${what}() threw: ${(e as Error).message}`;
  }
}
async function start(): Promise<void> {
  await act(async () => call("start"));
}
async function stop(): Promise<void> {
  await act(async () => call("stop"));
}

async function pointerAt(p: PointerAt): Promise<void> {
  const inside = p.x >= BOX.left && p.x <= BOX.right && p.y >= BOX.top && p.y <= BOX.bottom;
  const target: Element = inside
    ? listEl!.children[Math.min(listEl!.children.length - 1, Math.floor((p.y - BOX.top + scroll.top) / 40))] ?? listEl!
    : p.y < BOX.top && p.x >= BOX.left && p.x <= BOX.right
      ? container!.querySelector(".above")!
      : document.body;
  await act(async () => {
    target.dispatchEvent(new MouseEvent("dragover", { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y }));
  });
}

async function hold(p: PointerAt, n: number): Promise<void> {
  await pointerAt(p);
  for (let i = 1; i <= n; i += 1) {
    await frames(1);
    if (i % 3 === 0) await pointerAt(p);
  }
}

const where = () => `the list's scroll position${failure ? ` (${failure})` : ""}`;

beforeEach(() => {
  installFrames();
  failure = "";
  api = null;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (listEl && this === listEl) return boxRect();
    return realRect.call(this);
  };
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  container = null;
  listEl = null;
  Element.prototype.getBoundingClientRect = realRect;
  restoreFrames();
});

describe("edgeScrollStep: which way a held drag scrolls its list", () => {
  it(`${CHECK_1} — near the bottom edge the step is down, 14 px a frame`, () => {
    expect(step(at(X, BOX.bottom - 10))).toBe(PACE);
    expect(step(at(X, BOX.bottom - 1))).toBe(PACE);
  });

  it(`${CHECK_1} — near the top edge the step is up, 14 px a frame`, () => {
    expect(step(at(X, BOX.top + 10))).toBe(-PACE);
    expect(step(at(X, BOX.top + 1))).toBe(-PACE);
  });

  it(`${CHECK_1} — the edge zone is 56 px deep: 54 px from an edge scrolls, 58 px does not`, () => {
    expect(step(at(X, BOX.bottom - (ZONE - 2)))).toBe(PACE);
    expect(step(at(X, BOX.top + (ZONE - 2)))).toBe(-PACE);
    expect(step(at(X, BOX.bottom - (ZONE + 2)))).toBe(0);
    expect(step(at(X, BOX.top + (ZONE + 2)))).toBe(0);
  });

  it(`${CHECK_3} — the middle of the list gives no step`, () => {
    expect(step(at(X, (BOX.top + BOX.bottom) / 2))).toBe(0);
  });

  it(`${CHECK_4} — above the list the step is up, below it down, however far`, () => {
    expect(step(at(X, BOX.top - 40))).toBe(-PACE);
    expect(step(at(X, BOX.top - 2000))).toBe(-PACE);
    expect(step(at(X, BOX.bottom + 40))).toBe(PACE);
    expect(step(at(X, BOX.bottom + 2000))).toBe(PACE);
  });

  it(`${CHECK_4} — off to the left or right of the list there is no step, whatever the height`, () => {
    for (const x of [BOX.left - 40, BOX.right + 40]) {
      for (const y of [BOX.top - 40, BOX.top + 10, (BOX.top + BOX.bottom) / 2, BOX.bottom - 10, BOX.bottom + 40]) {
        expect(step(at(x, y)), `pointer at (${x}, ${y})`).toBe(0);
      }
    }
  });
});

describe("useEdgeAutoScroll: a list scrolls while a drag is held at its edge", () => {
  it(`${CHECK_1} — held near the bottom edge, the list scrolls down 14 px each frame`, async () => {
    await mount(1000);
    await start();
    await hold(at(X, BOX.bottom - 10), 10);
    expect(scroll.top, where()).toBe(10 * PACE);
  });

  it(`${CHECK_1} — held near the top edge, the list scrolls up 14 px each frame`, async () => {
    await mount(1000, 500);
    await start();
    await hold(at(X, BOX.top + 10), 10);
    expect(scroll.top, where()).toBe(500 - 10 * PACE);
  });

  it(`${CHECK_3} — after scrolling down, the pointer moved to the middle stops the list where it is`, async () => {
    await mount(1000);
    await start();
    await hold(at(X, BOX.bottom - 10), 10);
    expect(scroll.top, where()).toBe(10 * PACE);
    await hold(at(X, (BOX.top + BOX.bottom) / 2), 10);
    expect(scroll.top, where()).toBe(10 * PACE);
  });

  it(`${CHECK_4} — held below the list, it keeps scrolling down`, async () => {
    await mount(1000);
    await start();
    await hold(at(X, BOX.bottom + 60), 10);
    expect(scroll.top, where()).toBe(10 * PACE);
    await hold(at(X, BOX.bottom + 60), 10);
    expect(scroll.top, where()).toBe(20 * PACE);
  });

  it(`${CHECK_4} — held above the list, over a header whose own handler stops the drag event, it keeps scrolling up`, async () => {
    await mount(1000, 500);
    await start();
    await hold(at(X, BOX.top - 60), 10);
    expect(scroll.top, where()).toBe(500 - 10 * PACE);
    await hold(at(X, BOX.top - 60), 10);
    expect(scroll.top, where()).toBe(500 - 20 * PACE);
  });

  it(`${CHECK_4} — it keeps scrolling to the end of the list and no further, at either end`, async () => {
    await mount(1000, 650);
    await start();
    await hold(at(X, BOX.bottom + 60), 10);
    expect(scroll.top, where()).toBe(700);
    await act(async () => call("stop"));

    await act(async () => {
      scroll.top = 30;
    });
    await start();
    await hold(at(X, BOX.top - 60), 10);
    expect(scroll.top, where()).toBe(0);
  });

  it(`${CHECK_4} — moved off to the right of the list, the scrolling stops`, async () => {
    await mount(1000);
    await start();
    await hold(at(X, BOX.bottom - 10), 10);
    expect(scroll.top, where()).toBe(10 * PACE);
    await hold(at(BOX.right + 40, BOX.bottom - 10), 10);
    expect(scroll.top, where()).toBe(10 * PACE);
  });

  it(`${CHECK_4} — moved off to the left of the list, even beyond its bottom, the scrolling stops`, async () => {
    await mount(1000);
    await start();
    await hold(at(X, BOX.bottom + 60), 10);
    expect(scroll.top, where()).toBe(10 * PACE);
    await hold(at(BOX.left - 40, BOX.bottom + 60), 10);
    expect(scroll.top, where()).toBe(10 * PACE);
  });

  it(`${CHECK_5} — when the drag ends, the scrolling stops at once and the list stays where it got to`, async () => {
    await mount(1000);
    await start();
    await hold(at(X, BOX.bottom - 10), 10);
    expect(scroll.top, where()).toBe(10 * PACE);
    await stop();
    await frames(10);
    expect(scroll.top, where()).toBe(10 * PACE);
    await hold(at(X, BOX.bottom - 10), 10);
    expect(scroll.top, where()).toBe(10 * PACE);
  });

  it(`${CHECK_6} — a list whose content fits its box stays still wherever the drag is held`, async () => {
    await mount(200);
    await start();
    expect(failure, "the hook mounted and started").toBe("");
    for (const p of [at(X, BOX.bottom - 10), at(X, BOX.bottom + 60), at(X, BOX.top + 10), at(X, BOX.top - 60)]) {
      await hold(p, 10);
      expect(scroll.top, `${where()}, pointer at (${p.x}, ${p.y})`).toBe(0);
    }
  });
});
