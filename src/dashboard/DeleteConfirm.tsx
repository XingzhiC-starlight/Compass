import { useCallback, useEffect, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Project } from "../lib/types";

export type DeleteConfirmProps = {
  project: Project;
  opener: HTMLElement | null;
  onCancel: () => void;
  onConfirm: () => void;
};

const EDGE = 16;
const GAP = 8;

export default function DeleteConfirm({ project, opener, onCancel, onConfirm }: DeleteConfirmProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const lineId = useId();
  const closedRef = useRef(false);

  const cancel = useCallback(
    (returnFocus: boolean) => {
      if (closedRef.current) return;
      closedRef.current = true;
      if (returnFocus && opener?.isConnected) opener.focus();
      onCancel();
    },
    [onCancel, opener],
  );

  const confirm = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onConfirm();
  }, [onConfirm]);

  useLayoutEffect(() => {
    function place() {
      const panel = panelRef.current;
      if (!panel) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      // A × that has left the page (re-mounted, or gone with its row) reports
      // an all-zero rectangle, not none — so it counts as no × at all.
      const r = opener?.isConnected ? opener.getBoundingClientRect() : undefined;
      let left: number;
      let top: number;
      if (!r) {
        left = (vw - w) / 2;
        top = (vh - h) / 2;
      } else if (r.right + GAP + w <= vw - EDGE) {
        left = r.right + GAP;
        top = r.top + r.height / 2 - h / 2;
      } else if (r.left - GAP - w >= EDGE) {
        left = r.left - GAP - w;
        top = r.top + r.height / 2 - h / 2;
      } else {
        left = r.right - w;
        top = r.bottom + GAP;
        if (top + h > vh - EDGE) top = r.top - GAP - h;
      }
      left = Math.max(EDGE, Math.min(left, vw - EDGE - w));
      top = Math.max(EDGE, Math.min(top, vh - EDGE - h));
      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${Math.round(top)}px`;
    }
    place();
    let frame: number | null = null;
    function placeSoon() {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        place();
      });
    }
    window.addEventListener("resize", placeSoon);
    window.addEventListener("scroll", placeSoon, true);
    return () => {
      window.removeEventListener("resize", placeSoon);
      window.removeEventListener("scroll", placeSoon, true);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [opener]);

  // The rest of the page is hidden from assistive technology while the panel
  // is open (aria-modal alone does not stop a screen reader's browse mode),
  // and each sibling's own aria-hidden is restored when it closes.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const hidden: Array<[Element, string | null]> = [];
    for (const el of Array.from(document.body.children)) {
      if (el === panel) continue;
      hidden.push([el, el.getAttribute("aria-hidden")]);
      el.setAttribute("aria-hidden", "true");
    }
    return () => {
      for (const [el, before] of hidden) {
        if (before === null) el.removeAttribute("aria-hidden");
        else el.setAttribute("aria-hidden", before);
      }
    };
  }, []);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const panel = panelRef.current;
      if (!panel) return;
      if (e.key === "Escape") {
        e.preventDefault();
        cancel(true);
        return;
      }
      if (e.key !== "Tab") return;
      const stops = Array.from(panel.querySelectorAll<HTMLElement>("button:not(:disabled)"));
      if (stops.length === 0) return;
      e.preventDefault();
      const here = stops.indexOf(document.activeElement as HTMLElement);
      const next =
        here === -1 ? (e.shiftKey ? stops.length - 1 : 0) : (here + (e.shiftKey ? -1 : 1) + stops.length) % stops.length;
      stops[next].focus();
    }

    function onPointerDown(e: Event) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (opener?.contains(target)) return;
      cancel(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [cancel, opener]);

  return createPortal(
    <div
      ref={panelRef}
      className="confirm-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={lineId}
    >
      <p id={titleId} className="confirm-panel-title">
        Delete "{project.name}"?
      </p>
      <p id={lineId} className="confirm-panel-line">
        This removes its phases, tasks, learning, thoughts and time history.
      </p>
      <div className="confirm-panel-actions">
        <button ref={cancelRef} type="button" className="confirm-panel-cancel" onClick={() => cancel(true)}>
          Cancel
        </button>
        <button type="button" className="confirm-panel-delete" onClick={confirm}>
          Delete
        </button>
      </div>
    </div>,
    document.body,
  );
}
