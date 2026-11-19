import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project, Task, Thought } from "../lib/types";
import Sidebar from "./Sidebar";
import TaskPanel from "./TaskPanel";
import ThoughtLog from "./ThoughtLog";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_MARKUP =
  "A project name, a task and a thought whose text is shaped like markup appear on screen exactly as typed, both shown and while being edited, and add no element and no event handler to the page";

const MARKUP =
  '<img id="ch043-img" src="x" onerror="window.__ch043=1"><b id="ch043-b" onclick="window.__ch043=2">Ship &amp; tell</b><script>window.__ch043=3</script>';

const KEEP_REAL = vi.hoisted(() => new Set(["SaveFailedError", "todayDate", "getActiveProjectId"]));
vi.mock("../lib/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/db")>();
  const quiet: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(real)) {
    quiet[name] = typeof value === "function" && !KEEP_REAL.has(name) ? vi.fn(async () => undefined) : value;
  }
  quiet.updateTask = vi.fn(async () => true);
  quiet.updateThought = vi.fn(async () => true);
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

const task: Task = {
  id: "t1",
  projectId: "p1",
  userId: "u1",
  text: MARKUP,
  isDone: false,
  sortOrder: 0,
  taskDate: "2026-09-22",
  phaseId: null,
  learningItemId: null,
  createdAt: "2026-09-22T10:00:00.000Z",
};

const thought: Thought = {
  id: "th1",
  projectId: "p1",
  userId: "u1",
  title: "",
  text: MARKUP,
  sortOrder: 0,
  groupId: null,
  createdAt: "2026-09-22T10:00:00.000Z",
};

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
  delete (window as unknown as { __ch043?: unknown }).__ch043;
});

async function renderSidebar(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <Sidebar
        projects={[project("p1", MARKUP, 0), project("p2", "Garden", 1)]}
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
}

async function renderPanel(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<TaskPanel initialTasks={[task]} initialThoughts={[]} initialThoughtGroups={[]} syncVersion={0} />);
  });
}

async function renderLog(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ThoughtLog initialThoughts={[thought]} initialGroups={[]} syncVersion={0} />);
  });
}

function shownExactly(text: string): boolean {
  return Array.from(container.querySelectorAll("*")).some((el) => el.textContent === text);
}

function showing(text: string): HTMLElement[] {
  const all = Array.from(container.querySelectorAll<HTMLElement>("*")).filter((el) => el.textContent === text);
  return all.filter((el) => !all.some((other) => other !== el && el.contains(other)));
}

function expectNoElementNoHandler(): void {
  expect(document.getElementById("ch043-img"), "no image element was added").toBeNull();
  expect(document.getElementById("ch043-b"), "no bold element was added").toBeNull();
  const scripts = Array.from(document.querySelectorAll("script")).filter((s) => s.textContent?.includes("__ch043"));
  expect(scripts, "no script element was added").toEqual([]);
  const handlers = Array.from(document.querySelectorAll("*")).flatMap((el) =>
    Array.from(el.attributes)
      .filter((a) => a.name.toLowerCase().startsWith("on"))
      .map((a) => `${el.tagName.toLowerCase()} ${a.name}`),
  );
  expect(handlers, "no event handler was added to the page").toEqual([]);
  expect((window as unknown as { __ch043?: unknown }).__ch043, "nothing the text holds ran").toBeUndefined();
}

describe("a project name shaped like markup appears as typed", () => {
  it(`${CHECK_MARKUP} — a project's name, shown in the sidebar`, async () => {
    await renderSidebar();

    expect(shownExactly(MARKUP), "the project's name is on screen exactly as typed").toBe(true);
    expectNoElementNoHandler();
  });

  it(`${CHECK_MARKUP} — a project's name, while being renamed in the sidebar`, async () => {
    await renderSidebar();

    const name = container.querySelector<HTMLElement>('[title="Click to rename"]');
    expect(name, "harness: the active pill's name can be clicked to rename").not.toBeNull();
    await act(async () => {
      name!.click();
    });
    const field = Array.from(container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")).find(
      (f) => f.value === MARKUP,
    );

    expect(field, "the rename box holds the name exactly as typed").toBeDefined();
    expectNoElementNoHandler();
  });
});

describe("a task shaped like markup appears as typed", () => {
  it(`${CHECK_MARKUP} — a task, shown in the list`, async () => {
    await renderPanel();

    expect(showing(MARKUP).length, "the task's text is on screen exactly as typed").toBeGreaterThan(0);
    expectNoElementNoHandler();
  });

  it(`${CHECK_MARKUP} — a task, while being edited`, async () => {
    await renderPanel();

    const text = container.querySelector<HTMLElement>('[title="Click to edit"]') ?? showing(MARKUP)[0] ?? null;
    expect(text, "harness: the task's text can be clicked to edit").not.toBeNull();
    await act(async () => {
      text!.click();
    });
    const field = Array.from(container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")).find(
      (f) => f.value === MARKUP,
    );

    expect(field, "the edit box holds the task exactly as typed").toBeDefined();
    expectNoElementNoHandler();
  });
});

describe("a thought shaped like markup appears as typed", () => {
  it(`${CHECK_MARKUP} — a thought, shown in the feed`, async () => {
    await renderLog();

    expect(showing(MARKUP).length, "the thought's text is on screen exactly as typed").toBeGreaterThan(0);
    expectNoElementNoHandler();
  });

  it(`${CHECK_MARKUP} — a thought, while being edited`, async () => {
    await renderLog();

    const body = showing(MARKUP)[0] ?? null;
    expect(body, "harness: the thought's text can be clicked to edit").not.toBeNull();
    await act(async () => {
      body!.click();
    });
    const field = Array.from(container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")).find(
      (f) => f.value === MARKUP,
    );

    expect(field, "the edit box holds the thought exactly as typed").toBeDefined();
    expectNoElementNoHandler();
  });
});
