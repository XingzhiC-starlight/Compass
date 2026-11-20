import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../lib/types";
import Sidebar from "../Sidebar";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal("__APP_VERSION__", "0.0.0-test");

const KEEP_REAL = vi.hoisted(() => new Set(["SaveFailedError", "todayDate", "getActiveProjectId"]));
vi.mock("../../lib/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/db")>();
  const quiet: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(real)) {
    quiet[name] = typeof value === "function" && !KEEP_REAL.has(name) ? vi.fn(async () => undefined) : value;
  }
  return quiet;
});

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

const THEME_KEY = "compass.theme";

let container: HTMLDivElement;
let root: Root | null = null;

async function mountSidebar() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <Sidebar
        projects={[PROJECT]}
        archived={[]}
        finishedIds={new Set()}
        activeProjectId="p1"
        onRenamed={vi.fn()}
        onReorderProjects={vi.fn()}
        onSelectProject={vi.fn()}
        onNewProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onArchiveProject={vi.fn()}
        onUnarchiveProject={vi.fn()}
        onSignOut={vi.fn()}
        onOpenCompanion={vi.fn()}
        companionOpen={false}
      />,
    );
  });
}

async function unmountSidebar() {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
}

async function openSettings() {
  const trigger = container.querySelector<HTMLButtonElement>(".sidebar-settings")!;
  await act(async () => {
    trigger.click();
  });
}

function themeButton(label: string): HTMLButtonElement {
  const group = container.querySelector('[role="group"][aria-label="Theme"]')!;
  return [...group.querySelectorAll("button")].find((b) => b.textContent === label)!;
}

function shownTheme(): string | null {
  return document.documentElement.getAttribute("data-theme");
}

beforeEach(() => {
  localStorage.removeItem(THEME_KEY);
});

afterEach(async () => {
  await unmountSidebar();
  localStorage.removeItem(THEME_KEY);
  vi.restoreAllMocks();
});

describe("the Theme choice in Settings", () => {
  it("starts on Classic, with the document root unmarked", async () => {
    await mountSidebar();
    await openSettings();
    expect(themeButton("Classic").getAttribute("aria-pressed")).toBe("true");
    expect(themeButton("Sand").getAttribute("aria-pressed")).toBe("false");
    expect(shownTheme()).toBeNull();
  });

  it("a press on Sand marks the root, stores the choice and leaves the dialog open", async () => {
    await mountSidebar();
    await openSettings();
    await act(async () => {
      themeButton("Sand").click();
    });
    expect(shownTheme()).toBe("sand");
    expect(localStorage.getItem(THEME_KEY)).toBe("sand");
    expect(themeButton("Sand").getAttribute("aria-pressed")).toBe("true");
    expect(themeButton("Classic").getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("a press on Classic takes the mark off and stores that choice", async () => {
    localStorage.setItem(THEME_KEY, "sand");
    await mountSidebar();
    expect(shownTheme()).toBe("sand");
    await openSettings();
    await act(async () => {
      themeButton("Classic").click();
    });
    expect(shownTheme()).toBeNull();
    expect(localStorage.getItem(THEME_KEY)).toBe("classic");
  });

  it("a stored Sand shows again when the sidebar mounts, and the mark leaves with the sidebar", async () => {
    localStorage.setItem(THEME_KEY, "sand");
    await mountSidebar();
    expect(shownTheme()).toBe("sand");
    await openSettings();
    expect(themeButton("Sand").getAttribute("aria-pressed")).toBe("true");
    await unmountSidebar();
    expect(shownTheme()).toBeNull();
    expect(localStorage.getItem(THEME_KEY)).toBe("sand");
  });

  it("anything else in storage reads as Classic", async () => {
    localStorage.setItem(THEME_KEY, "midnight");
    await mountSidebar();
    expect(shownTheme()).toBeNull();
    await openSettings();
    expect(themeButton("Classic").getAttribute("aria-pressed")).toBe("true");
  });

  it("storage that refuses to be read or written still lets the choice show", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage is off");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage is off");
    });
    await mountSidebar();
    expect(shownTheme()).toBeNull();
    await openSettings();
    await act(async () => {
      themeButton("Sand").click();
    });
    expect(shownTheme()).toBe("sand");
    expect(themeButton("Sand").getAttribute("aria-pressed")).toBe("true");
  });
});
