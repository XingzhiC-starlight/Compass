import { useRef, useState } from "react";
import type { DragEvent } from "react";

export function reorder<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [moved] = copy.splice(from, 1);
  if (from < to) to--;
  copy.splice(to, 0, moved);
  return copy;
}

export function useDragReorder(onCommit: (from: number, to: number) => void) {
  const [grabbedId, setGrabbedId] = useState<string | null>(null);
  const dragFrom = useRef<string | null>(null);
  const [dropAt, setDropAt] = useState<{ index: number; after: boolean } | null>(null);
  const placeOf = useRef(new Map<string, number>());
  placeOf.current = new Map();

  function endDrag() {
    dragFrom.current = null;
    setGrabbedId(null);
    setDropAt(null);
  }

  const isAfter = (e: DragEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientY - rect.top > rect.height / 2;
  };

  const gripProps = (id: string) => ({
    onMouseDown: () => setGrabbedId(id),
    onMouseUp: () => setGrabbedId(null),
  });

  const rowProps = (index: number, id: string) => {
    placeOf.current.set(id, index);
    return {
    draggable: grabbedId === id,
    onDragStart: () => {
      dragFrom.current = id;
    },
    onDragOver: (e: DragEvent) => {
      if (dragFrom.current === null) return;
      e.preventDefault();
      setDropAt({ index, after: isAfter(e) });
    },
    onDrop: (e: DragEvent) => {
      const held = dragFrom.current;
      if (held === null) return;
      e.preventDefault();
      const from = placeOf.current.get(held);
      if (from !== undefined) onCommit(from, index + (isAfter(e) ? 1 : 0));
      endDrag();
    },
    onDragEnd: endDrag,
    };
  };

  return { grabbedId, dropAt, gripProps, rowProps };
}
