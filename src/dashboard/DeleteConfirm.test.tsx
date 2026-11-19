import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../lib/types";
import DeleteConfirm from "./DeleteConfirm";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PROJECT: Project = {
  id: "p1",
  userId: "u1",
  name: "Lighthouse",
  accentColor: "#9A7B4F",
  sortOrder: 0,
  archivedAt: null,
  totalDays: 90,
  hoursPlannedPerDay: 4,
  hoursAvailablePerDay: 6,
  startedAt: "2026-07-21",
  createdAt: "2026-07-21T17:00:00.000Z",
};

let container: HTMLDivElement;
let opener: HTMLButtonElement;
let elsewhere: HTMLInputElement;
let root: Root | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  opener?.remove();
  elsewhere?.remove();
  vi.restoreAllMocks();
});

async function open(): Promise<{ onCancel: ReturnType<typeof vi.fn>; onConfirm: ReturnType<typeof vi.fn> }> {
  opener = document.createElement("button");
  opener.textContent = "×";
  document.body.appendChild(opener);
  elsewhere = document.createElement("input");
  document.body.appendChild(elsewhere);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  opener.focus();
  await act(async () => {
    root!.render(<DeleteConfirm project={PROJECT} opener={opener} onCancel={onCancel} onConfirm={onConfirm} />);
  });
  return { onCancel, onConfirm };
}

const panel = () => document.body.querySelector<HTMLElement>(".confirm-panel");
const button = (text: string) =>
  Array.from(panel()!.querySelectorAll("button")).find((b) => b.textContent === text)!;

describe("the delete confirmation panel underneath the surfaces", () => {
  it("opens with focus on Cancel, the safe choice", async () => {
    await open();
    expect(document.activeElement).toBe(button("Cancel"));
  });

  it("a click outside closes it once and leaves focus where that click put it, not on the ×", async () => {
    const { onCancel, onConfirm } = await open();
    await act(async () => {
      elsewhere.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(opener);
    await act(async () => {
      elsewhere.focus();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(document.activeElement).toBe(elsewhere);
  });

  it("a press on the × that opened it does not close it (the × itself asks again)", async () => {
    const { onCancel } = await open();
    await act(async () => {
      opener.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Delete is reported once and does not hand focus back to the ×, which goes with its project", async () => {
    const { onCancel, onConfirm } = await open();
    await act(async () => {
      button("Delete").click();
      button("Delete").click();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(opener);
  });

  it("Escape twice in a row is one close", async () => {
    const { onCancel } = await open();
    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
  });

  it("sits beside the × on its right when there is room, and inside the window when there is not", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(260);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(140);
    const rect = (left: number, top: number) =>
      ({ left, top, right: left + 18, bottom: top + 18, width: 18, height: 18, x: left, y: top, toJSON() {} }) as DOMRect;

    vi.spyOn(HTMLButtonElement.prototype, "getBoundingClientRect").mockReturnValue(rect(200, 300));
    await open();
    expect(panel()!.style.left).toBe(`${200 + 18 + 8}px`);
    expect(panel()!.style.top).toBe(`${300 + 9 - 70}px`);
    await act(async () => {
      root!.unmount();
    });
    root = null;
    container.remove();
    opener.remove();
    elsewhere.remove();

    const width = window.innerWidth;
    const height = window.innerHeight;
    vi.spyOn(HTMLButtonElement.prototype, "getBoundingClientRect").mockReturnValue(rect(width - 30, height - 20));
    await open();
    const left = parseInt(panel()!.style.left, 10);
    const top = parseInt(panel()!.style.top, 10);
    expect(left).toBeGreaterThanOrEqual(16);
    expect(left + 260).toBeLessThanOrEqual(width - 16);
    expect(top).toBeGreaterThanOrEqual(16);
    expect(top + 140).toBeLessThanOrEqual(height - 16);
  });

  it("sits below the × when neither side has room, and above it when below has none either", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(480);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(768);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(260);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(140);
    const rect = (left: number, top: number) =>
      ({ left, top, right: left + 18, bottom: top + 18, width: 18, height: 18, x: left, y: top, toJSON() {} }) as DOMRect;
    const place = vi.spyOn(HTMLButtonElement.prototype, "getBoundingClientRect");

    place.mockReturnValue(rect(270, 200));
    await open();
    expect(panel()!.style.left, "below: right edges in line").toBe(`${270 + 18 - 260}px`);
    expect(panel()!.style.top, "below: 8 px under the ×").toBe(`${200 + 18 + 8}px`);
    await act(async () => {
      root!.unmount();
    });
    root = null;
    container.remove();
    opener.remove();
    elsewhere.remove();

    place.mockReturnValue(rect(270, 700));
    await open();
    expect(panel()!.style.left, "above: right edges in line").toBe(`${270 + 18 - 260}px`);
    expect(panel()!.style.top, "above: 8 px over the ×").toBe(`${700 - 8 - 140}px`);
  });

  it("Escape that closes the panel is marked handled, its default prevented", async () => {
    await open();
    const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => {
      document.activeElement!.dispatchEvent(esc);
    });
    expect(esc.defaultPrevented).toBe(true);
  });

  it("Cancel does not hand focus to a × that has left the page", async () => {
    const { onCancel } = await open();
    const focus = vi.spyOn(opener, "focus");
    opener.remove();
    await act(async () => {
      button("Cancel").click();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
  });

  it("hides the rest of the page from a screen reader while it is open, and gives it back as it was when it closes", async () => {
    const alreadyHidden = document.createElement("div");
    alreadyHidden.setAttribute("aria-hidden", "true");
    document.body.appendChild(alreadyHidden);
    const { onCancel } = await open();
    for (const el of Array.from(document.body.children)) {
      if (el === panel()) expect(el.hasAttribute("aria-hidden"), "the panel itself").toBe(false);
      else expect(el.getAttribute("aria-hidden"), `beside the panel: ${el.outerHTML.slice(0, 40)}`).toBe("true");
    }
    await act(async () => {
      button("Cancel").click();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    await act(async () => {
      root!.unmount();
    });
    root = null;
    expect(opener.hasAttribute("aria-hidden")).toBe(false);
    expect(elsewhere.hasAttribute("aria-hidden")).toBe(false);
    expect(container.hasAttribute("aria-hidden")).toBe(false);
    expect(alreadyHidden.getAttribute("aria-hidden")).toBe("true");
    alreadyHidden.remove();
  });

  it("is centred in the window, not pinned to its corner, when the × that opened it leaves the page", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(260);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(140);
    const frames = holdFrames();
    await open();
    opener.remove();
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });
    await act(async () => {
      frames.run();
    });
    expect(panel()!.style.left).toBe(`${Math.round((window.innerWidth - 260) / 2)}px`);
    expect(panel()!.style.top).toBe(`${Math.round((window.innerHeight - 140) / 2)}px`);
  });

  it("measures once a frame however many scroll events arrive in it, and not again after it closes", async () => {
    const frames = holdFrames();
    await open();
    const measure = vi.spyOn(opener, "getBoundingClientRect");
    const list = document.createElement("div");
    document.body.appendChild(list);
    await act(async () => {
      for (let i = 0; i < 12; i++) list.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("resize"));
    });
    expect(measure, "before the frame").toHaveBeenCalledTimes(0);
    expect(frames.pending(), "frames asked for by the burst").toBe(1);
    await act(async () => {
      frames.run();
    });
    expect(measure, "after one frame").toHaveBeenCalledTimes(1);
    await act(async () => {
      list.dispatchEvent(new Event("scroll"));
    });
    expect(frames.pending()).toBe(1);
    await act(async () => {
      root!.unmount();
    });
    root = null;
    expect(frames.pending(), "frames left waiting after the panel closed").toBe(0);
    list.remove();
  });
});

function holdFrames(): { run: () => void; pending: () => number } {
  const waiting = new Map<number, FrameRequestCallback>();
  let next = 1;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    waiting.set(next, cb);
    return next++;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    waiting.delete(id);
  });
  return {
    run: () => {
      const now = Array.from(waiting.values());
      waiting.clear();
      for (const cb of now) cb(0);
    },
    pending: () => waiting.size,
  };
}
