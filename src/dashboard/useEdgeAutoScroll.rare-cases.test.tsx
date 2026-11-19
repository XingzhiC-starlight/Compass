import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EDGE_SCROLL_PX_PER_FRAME, edgeScrollStep, useEdgeAutoScroll, type EdgeAutoScroll } from "./useEdgeAutoScroll";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// React documents useMemo as a hint it may discard. With `forget.memos` on,
// every useMemo in this file's modules hands back a freshly computed value
// (its hook still runs, so the order of hooks never changes).
const forget = vi.hoisted(() => ({ memos: false }));
vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  return {
    ...real,
    useMemo: <T,>(make: () => T, deps: import("react").DependencyList) => {
      const kept = real.useMemo(make, deps);
      return forget.memos ? make() : kept;
    },
  };
});

let queue = new Map<number, FrameRequestCallback>();
let lastId = 0;
const realRaf = window.requestAnimationFrame;
const realCaf = window.cancelAnimationFrame;
const realRect = Element.prototype.getBoundingClientRect;
let top = 0;
let api: EdgeAutoScroll | null = null;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Harness() {
  const ref = useRef<HTMLUListElement>(null);
  api = useEdgeAutoScroll(ref);
  return <ul ref={ref}><li>Row</li></ul>;
}

async function frames(n: number) {
  for (let i = 0; i < n; i += 1) {
    await act(async () => {
      const due = Array.from(queue.values());
      queue.clear();
      for (const cb of due) cb(0);
    });
  }
}
const dragover = (y: number) =>
  document.body.dispatchEvent(new MouseEvent("dragover", { bubbles: true, cancelable: true, clientX: 250, clientY: y }));

beforeEach(async () => {
  queue = new Map();
  top = 0;
  window.requestAnimationFrame = (cb) => {
    lastId += 1;
    queue.set(lastId, cb);
    return lastId;
  };
  window.cancelAnimationFrame = (id) => {
    queue.delete(id);
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<Harness />));
  const el = container.querySelector("ul")!;
  Object.defineProperty(el, "scrollTop", { configurable: true, get: () => top, set: (v: number) => { top = v; } });
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => 1000 });
  Object.defineProperty(el, "clientHeight", { configurable: true, get: () => 300 });
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return this === el ? ({ top: 100, bottom: 400, left: 100, right: 400 } as DOMRect) : realRect.call(this);
  };
});

afterEach(async () => {
  forget.memos = false;
  await act(async () => root?.unmount());
  container?.remove();
  window.requestAnimationFrame = realRaf;
  window.cancelAnimationFrame = realCaf;
  Element.prototype.getBoundingClientRect = realRect;
});

describe("the edge scroll stops on its own when the drag ends anywhere on the page", () => {
  for (const ending of ["drop", "dragend"]) {
    it(`a ${ending} on the page stops the scrolling though the list's own stop never runs`, async () => {
      await act(async () => api!.start());
      dragover(390);
      await frames(5);
      expect(top).toBe(70);
      await act(async () => {
        document.body.dispatchEvent(new MouseEvent(ending, { bubbles: true, cancelable: true }));
      });
      await frames(5);
      expect(top, "no step after the drag ended").toBe(70);
      dragover(390);
      await frames(5);
      expect(top, "nothing is left listening").toBe(70);
    });
  }
});

describe("the edge scroll stops when the row that started the drag is gone before its dragend", () => {
  it("a dragend on a row a refresh removed mid-drag stops the scrolling, and nothing is left listening", async () => {
    const row = document.createElement("div");
    document.body.appendChild(row);
    row.addEventListener("dragstart", () => api!.start());
    await act(async () => {
      row.dispatchEvent(new MouseEvent("dragstart", { bubbles: true, cancelable: true }));
    });
    dragover(390);
    await frames(5);
    expect(top).toBe(70);
    row.remove();
    await act(async () => {
      row.dispatchEvent(new MouseEvent("dragend", { bubbles: true, cancelable: true }));
    });
    await frames(5);
    expect(top, "no step after the drag ended").toBe(70);
    dragover(390);
    await frames(5);
    expect(top, "a later drag over the page does not scroll the list").toBe(70);
  });
});

describe("the scroll rests at an end the browser stops a fraction short of", () => {
  // At a zoom like 110% the browser keeps the scroll position a fraction
  // short of its end (699.6 of 700 here, 0.4 instead of 0 at the top).
  const clampAt = (low: number, high: number) => {
    const el = container!.querySelector("ul")!;
    Object.defineProperty(el, "scrollTop", {
      configurable: true,
      get: () => top,
      set: (v: number) => { top = Math.min(high, Math.max(low, v)); },
    });
  };

  it("held below the list at its end, it stops asking for frames", async () => {
    clampAt(0.4, 699.6);
    top = 690;
    await act(async () => api!.start());
    dragover(390);
    await frames(5);
    expect(top).toBe(699.6);
    expect(queue.size, "no frame left running at the end").toBe(0);
  });

  it("held above the list at its start, it stops asking for frames", async () => {
    clampAt(0.4, 699.6);
    top = 10;
    await act(async () => api!.start());
    dragover(110);
    await frames(5);
    expect(top).toBe(0.4);
    expect(queue.size, "no frame left running at the start").toBe(0);
  });
});

describe("on a list shorter than its two edge zones, the nearer edge decides", () => {
  const down = EDGE_SCROLL_PX_PER_FRAME;
  const up = -EDGE_SCROLL_PX_PER_FRAME;
  const step = (y: number, top: number, bottom: number) =>
    edgeScrollStep({ x: 250, y }, { top, bottom, left: 100, right: 400 });

  it("a 90 px list scrolls down nearer its bottom edge and up nearer its top edge", () => {
    expect(step(150, 100, 190), "40 px from the bottom, 50 from the top").toBe(down);
    expect(step(180, 100, 190), "10 px from the bottom").toBe(down);
    expect(step(140, 100, 190), "40 px from the top, 50 from the bottom").toBe(up);
    expect(step(110, 100, 190), "10 px from the top").toBe(up);
    expect(step(145, 100, 190), "exactly the middle").toBe(0);
  });

  it("a 50 px list scrolls down with the pointer just below it and up just above it", () => {
    expect(step(152, 100, 150), "2 px below the list").toBe(down);
    expect(step(148, 100, 150), "2 px inside the bottom edge").toBe(down);
    expect(step(98, 100, 150), "2 px above the list").toBe(up);
    expect(step(102, 100, 150), "2 px inside the top edge").toBe(up);
  });
});

describe("a re-render mid-drag keeps the drag running and its stop complete", () => {
  it("with React forgetting its memos, a re-render neither stops the scrolling nor leaves a listener behind", async () => {
    forget.memos = true;
    await act(async () => api!.start());
    dragover(390);
    await frames(5);
    expect(top).toBe(70);
    await act(async () => root!.render(<Harness />));
    dragover(390);
    await frames(5);
    expect(top, "the drag still scrolls after the re-render").toBe(140);
    await act(async () => api!.stop());
    await frames(5);
    dragover(390);
    await frames(5);
    expect(top, "the list's stop leaves nothing listening").toBe(140);
  });
});

describe("the edge scroll stops when the list leaves the page mid-drag", () => {
  it("unmounting the list while it scrolls leaves no frame queued and nothing listening", async () => {
    const live = new Set<string>();
    const ids = new Map<unknown, number>();
    const key = (type: string, fn: unknown, opts: unknown) => {
      if (!ids.has(fn)) ids.set(fn, ids.size);
      const capture = typeof opts === "boolean" ? opts : Boolean((opts as AddEventListenerOptions | undefined)?.capture);
      return `${type} ${capture ? "capture" : "bubble"} #${ids.get(fn)}`;
    };
    const realAdd = window.addEventListener.bind(window);
    const realRemove = window.removeEventListener.bind(window);
    const add = vi.spyOn(window, "addEventListener").mockImplementation((type, fn, opts) => {
      live.add(key(type, fn, opts));
      realAdd(type, fn, opts);
    });
    const remove = vi.spyOn(window, "removeEventListener").mockImplementation((type, fn, opts) => {
      live.delete(key(type, fn, opts));
      realRemove(type, fn, opts);
    });
    try {
      await act(async () => api!.start());
      dragover(390);
      await frames(5);
      expect(top).toBe(70);
      expect(queue.size, "a frame is queued while the drag scrolls").toBe(1);
      expect(live.size, "the drag listens on the page").toBeGreaterThan(0);
      await act(async () => root!.unmount());
      root = null;
      expect(queue.size, "no frame left queued once the list is gone").toBe(0);
      expect([...live], "no page listener left once the list is gone").toEqual([]);
      dragover(390);
      expect(queue.size, "a later drag movement wakes nothing").toBe(0);
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });
});
