import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../lib/types";
import Sidebar from "../Sidebar";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

describe("presses inside the delete confirmation never reach the pill behind it", () => {
  it("Cancel and Delete on an inactive pill's confirmation switch nothing and reorder nothing", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onSelectProject = vi.fn();
    const onReorderProjects = vi.fn();
    const onDeleteProject = vi.fn();
    await act(async () => {
      root!.render(
        <Sidebar
          projects={[project("p1", "Lighthouse", 0), project("p2", "Garden", 1)]}
          archived={[]}
          finishedIds={new Set()}
          activeProjectId="p1"
          onRenamed={vi.fn()}
          onReorderProjects={onReorderProjects}
          onSelectProject={onSelectProject}
          onNewProject={vi.fn()}
          onDeleteProject={onDeleteProject}
          onArchiveProject={vi.fn()}
          onUnarchiveProject={vi.fn()}
          onSignOut={vi.fn()}
          onOpenCompanion={vi.fn()}
          companionOpen={false}
        />,
      );
    });

    const pressFully = async (el: Element) => {
      await act(async () => {
        for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
          el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
        }
      });
    };
    const inPanel = (text: string) =>
      Array.from(document.body.querySelectorAll(".confirm-panel button")).find((b) => b.textContent === text);

    const x = container.querySelector('button[aria-label="Delete Garden"]')!;
    await pressFully(x);
    await pressFully(inPanel("Cancel")!);
    await pressFully(x);
    await pressFully(inPanel("Delete")!);

    expect(onDeleteProject).toHaveBeenCalledTimes(1);
    expect(onDeleteProject).toHaveBeenCalledWith("p2");
    expect(onSelectProject, "no switch to the pill behind the panel").not.toHaveBeenCalled();
    expect(onReorderProjects, "no drag armed by the panel's presses").not.toHaveBeenCalled();
  });
});
