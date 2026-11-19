import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useServerState } from "./useServerState";

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

describe("useServerState", () => {
  let setLocal: (v: string) => void = () => undefined;
  function Copy({ server, sync }: { server: string; sync: number }) {
    const [value, setValue] = useServerState(server, sync);
    setLocal = setValue;
    return <p>{value}</p>;
  }

  it("starts from the server, keeps local edits, and adopts the server only when syncVersion moves", () => {
    mount(<Copy server="saved" sync={0} />);
    expect(container!.textContent).toBe("saved");

    act(() => setLocal("edited here"));
    expect(container!.textContent).toBe("edited here");

    rerender(<Copy server="newer on server" sync={0} />);
    expect(container!.textContent).toBe("edited here");

    rerender(<Copy server="newer on server" sync={1} />);
    expect(container!.textContent).toBe("newer on server");

    act(() => setLocal("edited again"));
    rerender(<Copy server="newer on server" sync={1} />);
    expect(container!.textContent).toBe("edited again");
  });
});
