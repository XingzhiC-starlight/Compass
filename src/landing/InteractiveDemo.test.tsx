import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import InteractiveDemo from "./InteractiveDemo";

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderDemo(mobile: boolean) {
  stubMatchMedia(mobile);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<InteractiveDemo />);
  });
}

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

const visibleFrame = () =>
  container!.querySelector<HTMLImageElement>(".landing-demo-frame.visible");

const segButton = (text: string) =>
  [...container!.querySelectorAll<HTMLButtonElement>(".landing-seg button")].find(
    (b) => b.textContent === text,
  )!;

describe("InteractiveDemo", () => {
  it("keeps the two toggles independent: Depth then Thoughts lands on depth+thoughts", async () => {
    await renderDemo(false);
    expect(visibleFrame()?.src).toContain("frame-summary-task.png");

    await act(async () => {
      segButton("Depth").click();
    });
    expect(visibleFrame()?.src).toContain("frame-depth-task.png");

    await act(async () => {
      segButton("Thoughts").click();
    });
    expect(visibleFrame()?.src).toContain("frame-depth-thoughts.png");
    expect(segButton("Depth").getAttribute("aria-pressed")).toBe("true");
    expect(segButton("Thoughts").getAttribute("aria-pressed")).toBe("true");
  });

  it("toggles views from the screenshot hotspots", async () => {
    await renderDemo(false);
    expect(container!.querySelectorAll(".landing-hotspot")).toHaveLength(4);

    await act(async () => {
      container!
        .querySelector<HTMLButtonElement>("[aria-label='Toggle summary or depth view']")
        ?.click();
    });
    expect(visibleFrame()?.src).toContain("frame-depth-task.png");

    await act(async () => {
      container!
        .querySelector<HTMLButtonElement>("[aria-label='Switch between Task and Thoughts panel']")
        ?.click();
    });
    expect(visibleFrame()?.src).toContain("frame-depth-thoughts.png");
  });

  it("drops the hotspots and shows the desktop note on small screens", async () => {
    await renderDemo(true);
    expect(container!.querySelectorAll(".landing-hotspot")).toHaveLength(0);
    expect(container!.textContent).toContain(
      "Compass is built for desktop — use the controls above to explore.",
    );
  });
});
