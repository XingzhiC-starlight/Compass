import { act, useEffect, type DragEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useDragReorder } from "./useDragReorder";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(node));
}
function rerender(node: React.ReactNode) {
  act(() => root!.render(node));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("useDragReorder", () => {
  type Dnd = ReturnType<typeof useDragReorder>;
  let dnd: Dnd | null = null;
  const commits: Array<[number, number]> = [];
  function List({ ids }: { ids: string[] }) {
    const d = useDragReorder((from, to) => commits.push([from, to]));
    const rows = ids.map((id, i) => ({ id, props: d.rowProps(i, id) }));
    useEffect(() => {
      dnd = d;
    });
    return <ul>{rows.map((r) => <li key={r.id}>{r.id}</li>)}</ul>;
  }
  const dropEvent = (clientY: number) =>
    ({
      preventDefault() {},
      clientY,
      currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 20 }) },
    }) as unknown as DragEvent;

  it("drops the row it holds, even when the rows moved under the drag", () => {
    mount(<List ids={["a", "b", "c"]} />);
    act(() => dnd!.rowProps(1, "b").onDragStart());

    rerender(<List ids={["a", "c", "b"]} />);
    act(() => dnd!.rowProps(0, "a").onDrop(dropEvent(5)));

    expect(commits).toEqual([[2, 0]]);
  });
});
