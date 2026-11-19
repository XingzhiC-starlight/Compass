import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../lib/types";
import Sidebar from "../Sidebar";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_LIMITS =
  "Every box where a person types something Compass saves, on the dashboard, in the sidebar and in the interview, stops at its limit: 4,000 characters for a thought's or task's text, 200 for a project, phase, learning-item or group name and a thought's title; a longer paste keeps its first part";

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

const LIMIT = 200;
type Field = HTMLInputElement | HTMLTextAreaElement;
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

function setNativeValue(field: Field, value: string): void {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
async function paste(field: Field, text: string): Promise<void> {
  await act(async () => {
    field.focus();
  });
  if (field.disabled || field.readOnly) return;
  const next = field.maxLength >= 0 && text.length > field.maxLength ? text.slice(0, field.maxLength) : text;
  await act(async () => {
    setNativeValue(field, next);
  });
}

describe("the sidebar's rename box stops at 200 characters", () => {
  it(`${CHECK_LIMITS} — a project's name, renamed in the sidebar`, async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
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
          onDeleteProject={vi.fn()}
          onArchiveProject={vi.fn()}
          onUnarchiveProject={vi.fn()}
          onSignOut={vi.fn()}
        />,
      );
    });

    const name = container.querySelector<HTMLElement>('[title="Click to rename"]');
    expect(name, "harness: the active pill's name can be clicked to rename").not.toBeNull();
    await act(async () => {
      name!.click();
    });
    const active = document.activeElement;
    const field = (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : container.querySelector("input")) as Field | null;
    expect(field, "harness: the rename field").not.toBeNull();

    await paste(field!, "x".repeat(LIMIT) + "TAIL beyond the limit");

    expect(field!.value.length, "the box stops at 200 characters").toBe(LIMIT);
    expect(field!.value, "a longer paste keeps its first part").toBe("x".repeat(LIMIT));
  });
});
