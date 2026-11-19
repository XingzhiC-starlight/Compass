import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
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

function project(id: string, name: string, sortOrder: number): Project {
  return {
    id,
    userId: "u1",
    name,
    accentColor: "#9A7B4F",
    sortOrder,
    archivedAt: null,
    totalDays: 90,
    hoursPlannedPerDay: 4,
    hoursAvailablePerDay: 6,
    startedAt: "2026-07-21",
    createdAt: "2026-07-21T17:00:00.000Z",
  };
}

let container: HTMLDivElement;
let root: Root | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
});

describe("the delete confirmation and the Settings panel are never open together", () => {
  it("a keyboard press on a pill's × closes Settings, and one Escape returns focus to the ×", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onDeleteProject = vi.fn();
    await act(async () => {
      root!.render(
        <Sidebar
          projects={[project("p1", "Lighthouse", 0), project("p2", "Garden", 1)]}
          archived={[]}
          finishedIds={new Set()}
          activeProjectId="p1"
          onRenamed={vi.fn()}
          onReorderProjects={vi.fn()}
          onSelectProject={vi.fn()}
          onNewProject={vi.fn()}
          onDeleteProject={onDeleteProject}
          onArchiveProject={vi.fn()}
          onUnarchiveProject={vi.fn()}
          onSignOut={vi.fn()}
        />,
      );
    });

    const settingsButton = container.querySelector<HTMLButtonElement>(".sidebar-settings")!;
    await act(async () => {
      settingsButton.click();
    });
    expect(container.querySelector(".settings-panel"), "Settings is open").not.toBeNull();

    const x = container.querySelector<HTMLButtonElement>('button[aria-label="Delete Garden"]')!;
    await act(async () => {
      x.focus();
      x.click();
    });
    expect(document.body.querySelector(".confirm-panel"), "the confirmation is open").not.toBeNull();
    expect(container.querySelector(".settings-panel"), "Settings closed as the confirmation opened").toBeNull();

    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(document.body.querySelector(".confirm-panel"), "the confirmation closed").toBeNull();
    expect(document.activeElement, "focus is back on the × that opened the confirmation").toBe(x);
    expect(onDeleteProject).not.toHaveBeenCalled();
  });
});
