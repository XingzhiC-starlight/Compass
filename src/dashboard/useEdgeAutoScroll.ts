import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export const EDGE_ZONE_PX = 56;

export const EDGE_SCROLL_PX_PER_FRAME = 14;

export interface ListBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface PointerAt {
  x: number;
  y: number;
}

export function edgeScrollStep(pointer: PointerAt, box: ListBox): number {
  if (pointer.x < box.left || pointer.x > box.right) return 0;
  if (pointer.y < box.top) return -EDGE_SCROLL_PX_PER_FRAME;
  if (pointer.y > box.bottom) return EDGE_SCROLL_PX_PER_FRAME;
  const fromTop = pointer.y - box.top;
  const fromBottom = box.bottom - pointer.y;
  if (fromTop < fromBottom && fromTop < EDGE_ZONE_PX) return -EDGE_SCROLL_PX_PER_FRAME;
  if (fromBottom < fromTop && fromBottom < EDGE_ZONE_PX) return EDGE_SCROLL_PX_PER_FRAME;
  return 0;
}

export interface EdgeAutoScroll {
  start(): void;
  stop(): void;
}

export function useEdgeAutoScroll(listRef: RefObject<HTMLElement | null>): EdgeAutoScroll {
  const pointer = useRef<PointerAt | null>(null);
  const frame = useRef<number | null>(null);
  const running = useRef(false);
  const lastSource = useRef<EventTarget | null>(null);
  const source = useRef<EventTarget | null>(null);

  const [api] = useState<
    EdgeAutoScroll & { onDragOver(e: DragEvent): void; onDragStarted(e: DragEvent): void }
  >(() => {
    const tick = () => {
      frame.current = null;
      const el = listRef.current;
      const at = pointer.current;
      if (!running.current || !el || !at) return;
      const end = el.scrollHeight - el.clientHeight;
      if (end <= 0) return;
      const step = edgeScrollStep(at, el.getBoundingClientRect());
      if (step === 0) return;
      const from = el.scrollTop;
      const to = Math.min(end, Math.max(0, from + step));
      // Within a pixel counts as there: at some zooms the browser keeps the
      // scroll a fraction short of an end, and the loop must still rest.
      if (Math.abs(to - from) < 1) return;
      el.scrollTop = to;
      frame.current = requestAnimationFrame(tick);
    };

    const self = {
      onDragOver(e: DragEvent) {
        pointer.current = { x: e.clientX, y: e.clientY };
        if (frame.current === null) frame.current = requestAnimationFrame(tick);
      },
      onDragStarted(e: DragEvent) {
        lastSource.current = e.target;
      },
      start() {
        if (running.current) return;
        running.current = true;
        pointer.current = null;
        // A row a refresh removes mid-drag still gets its dragend, but off the
        // page, where the window never hears it — so listen on the row itself.
        source.current = lastSource.current;
        lastSource.current = null;
        source.current?.addEventListener("dragend", self.stop);
        window.addEventListener("dragover", self.onDragOver, true);
        window.addEventListener("drop", self.stop, true);
        window.addEventListener("dragend", self.stop, true);
      },
      stop() {
        running.current = false;
        pointer.current = null;
        if (frame.current !== null) {
          cancelAnimationFrame(frame.current);
          frame.current = null;
        }
        window.removeEventListener("dragover", self.onDragOver, true);
        window.removeEventListener("drop", self.stop, true);
        window.removeEventListener("dragend", self.stop, true);
        source.current?.removeEventListener("dragend", self.stop);
        source.current = null;
      },
    };
    return self;
  });

  useEffect(() => {
    window.addEventListener("dragstart", api.onDragStarted, true);
    return () => {
      window.removeEventListener("dragstart", api.onDragStarted, true);
      api.stop();
    };
  }, [api]);

  return api;
}
