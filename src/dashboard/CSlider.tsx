import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

export default function CSlider({
  value,
  onChange,
  accent,
  ariaLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  accent: string;
  ariaLabel: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = Math.max(0, Math.min(100, value));

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const stopDragRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDragRef.current?.(), []);

  function valueFromClientX(clientX: number): number {
    const el = trackRef.current;
    if (!el) return pct;
    const rect = el.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    return Math.round(Math.max(0, Math.min(1, frac)) * 100);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.preventDefault();
    stopDragRef.current?.();

    const dragOnChange = onChangeRef.current;
    let moved = false;
    dragOnChange(valueFromClientX(e.clientX));

    const move = (ev: globalThis.PointerEvent) => {
      moved = true;
      dragOnChange(valueFromClientX(ev.clientX));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      stopDragRef.current = null;
    };
    const finish = () => {
      stop();
      if (moved) swallowNextClick();
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    stopDragRef.current = stop;
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    let next: number;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = pct - 5;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = pct + 5;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 100;
    else return;
    e.preventDefault();
    onChange(Math.max(0, Math.min(100, next)));
  }

  return (
    <div
      ref={trackRef}
      className="cslider"
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <div className="cslider-fill" style={{ width: `${pct}%`, background: accent }} />
      <div
        className="cslider-knob"
        style={{ left: `${pct}%`, background: accent } as CSSProperties}
      />
    </div>
  );
}

/* After a drag, the browser synthesizes a `click` whose target is the common
   ancestor of the press and release points. If the pointer drifted off the thin
   track, that lands on the card behind the slider and would flip its view.
   Swallow exactly that one click, wherever it fires, in the capture phase —
   before it reaches the card's onClick. */
function swallowNextClick() {
  const swallow = (ev: globalThis.MouseEvent) => {
    ev.stopPropagation();
    window.removeEventListener("click", swallow, true);
  };
  window.addEventListener("click", swallow, true);
  setTimeout(() => window.removeEventListener("click", swallow, true));
}
