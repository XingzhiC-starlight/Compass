import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SLOW_SAVE_MS, useAddBox } from "./useAddBox";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Box = ReturnType<typeof useAddBox<string>>;
let box: Box;
let root: Root;
let container: HTMLDivElement;
let answer: { resolve: (row: string) => void; reject: (err: unknown) => void } | null;
const saved: string[] = [];
const sent: string[] = [];

function Harness() {
  const b = useAddBox<string>(
    (words) => {
      sent.push(words);
      return new Promise<string>((resolve, reject) => {
        answer = { resolve, reject };
      });
    },
    (row) => saved.push(row),
  );
  useEffect(() => {
    box = b;
  });
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  saved.length = 0;
  sent.length = 0;
  answer = null;
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("useAddBox", () => {
  it("an empty commit closes the box and sends nothing", async () => {
    act(() => box.open());
    act(() => box.change("   "));
    await act(async () => box.commit());
    expect(box.adding).toBe(false);
    expect(sent).toEqual([]);
  });

  it("while waiting: words stay, typing, Escape and a second commit are ignored, the field is read-only and busy; slow only after the threshold; success clears and hands over the row", async () => {
    act(() => box.open());
    act(() => box.change("  Buy stamps "));
    act(() => void box.commit());
    expect(sent).toEqual(["Buy stamps"]);
    expect(box.waiting).toBe(true);
    expect(box.fieldProps).toEqual({ readOnly: true, "aria-busy": true });

    act(() => box.change("Buy stamps and more"));
    act(() => box.cancel());
    act(() => void box.commit());
    expect(box.text).toBe("  Buy stamps ");
    expect(box.adding).toBe(true);
    expect(sent).toHaveLength(1);

    act(() => vi.advanceTimersByTime(SLOW_SAVE_MS - 1));
    expect(box.slow).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(box.slow).toBe(true);

    answer!.resolve("row-1");
    await flush();
    expect(saved).toEqual(["row-1"]);
    expect(box.text).toBe("");
    expect(box.adding).toBe(true);
    expect(box.waiting).toBe(false);
    expect(box.slow).toBe(false);
    expect(box.fieldProps).toEqual({ readOnly: false, "aria-busy": undefined });
  });

  it("on failure the words stay, nothing is handed over, and the box takes typing again", async () => {
    act(() => box.open());
    act(() => box.change("Buy stamps"));
    act(() => void box.commit());
    answer!.reject(new Error("offline"));
    await flush();

    expect(saved).toEqual([]);
    expect(box.text).toBe("Buy stamps");
    expect(box.waiting).toBe(false);
    act(() => box.change("Buy stamps today"));
    expect(box.text).toBe("Buy stamps today");
  });
});
