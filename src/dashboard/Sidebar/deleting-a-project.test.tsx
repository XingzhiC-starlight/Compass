import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Project } from "../../lib/types";
import Sidebar from "../Sidebar";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_SAME_CONFIRMATION =
  "Pressing the delete × on a sidebar pill, on a row of the sidebar's Archive view, or on a row of the archive screen opens the same confirmation inside Compass, and no browser confirm box appears";
const CHECK_CLOSES = "Cancel, Escape, or a click outside the confirmation closes it and deletes nothing";
const CHECK_DELETE = "Delete removes the project as today";
const CHECK_KEYBOARD =
  "Keyboard: when the confirmation opens, focus is inside it; Tab and Shift+Tab stay inside it; when it closes, focus returns to the × that opened it";
const CHECK_ARCHIVE_ASKS_NOTHING = "Archiving a finished project from its pill still asks nothing and archives at once";

const LINE = "This removes its phases, tasks, learning, thoughts and time history.";

const KEEP_REAL = vi.hoisted(() => new Set(["SaveFailedError", "todayDate", "getActiveProjectId"]));
vi.mock("../../lib/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/db")>();
  const quiet: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(real)) {
    quiet[name] = typeof value === "function" && !KEEP_REAL.has(name) ? vi.fn(async () => undefined) : value;
  }
  return quiet;
});

function project(id: string, name: string, sortOrder: number, archivedAt: string | null = null): Project {
  return {
    id,
    userId: "u1",
    name,
    accentColor: "#9A7B4F",
    sortOrder,
    archivedAt,
    totalDays: 90,
    hoursPlannedPerDay: 4,
    hoursAvailablePerDay: 6,
    startedAt: "2026-07-21",
    createdAt: "2026-07-21T17:00:00.000Z",
  };
}

const LIVE = [project("p1", "Lighthouse", 0), project("p2", "Garden", 1)];
const ARCHIVED = [project("a1", "Old harbor", 2, "2026-09-01T17:00:00.000Z")];

let container: HTMLDivElement;
let outside: HTMLDivElement;
let root: Root | null = null;
let confirmSpy: ReturnType<typeof vi.spyOn>;
let handlers: {
  onDeleteProject: Mock<(id: string) => void>;
  onArchiveProject: Mock<(id: string) => void>;
  onSelectProject: Mock<(id: string) => void>;
};

beforeEach(() => {
  confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  outside?.remove();
  confirmSpy.mockRestore();
});

async function renderSidebar(finishedIds: Set<string> = new Set()): Promise<void> {
  outside = document.createElement("div");
  outside.textContent = "somewhere else on the page";
  document.body.appendChild(outside);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  handlers = { onDeleteProject: vi.fn(), onArchiveProject: vi.fn(), onSelectProject: vi.fn() };
  await act(async () => {
    root!.render(
      <Sidebar
        projects={LIVE}
        archived={ARCHIVED}
        finishedIds={finishedIds}
        activeProjectId="p1"
        onRenamed={vi.fn()}
        onReorderProjects={vi.fn()}
        onSelectProject={handlers.onSelectProject}
        onNewProject={vi.fn()}
        onDeleteProject={handlers.onDeleteProject}
        onArchiveProject={handlers.onArchiveProject}
        onUnarchiveProject={vi.fn()}
        onSignOut={vi.fn()}
        onOpenCompanion={vi.fn()}
        companionOpen={false}
      />,
    );
  });
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function buttonsWithText(text: string): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).filter((b) => norm(b.textContent) === text);
}

function deleteX(name: string): HTMLButtonElement | null {
  return document.body.querySelector<HTMLButtonElement>(`button[aria-label="Delete ${name}"]`);
}

function commonAncestor(nodes: Element[]): Element | null {
  let candidate: Element | null = nodes[0] ?? null;
  while (candidate && !nodes.every((n) => candidate!.contains(n))) candidate = candidate.parentElement;
  return candidate;
}

function findConfirm(): { root: Element; cancel: HTMLButtonElement; del: HTMLButtonElement } | null {
  const cancel = buttonsWithText("Cancel")[0];
  const del = buttonsWithText("Delete")[0];
  if (!cancel || !del) return null;
  const dialog = cancel.closest('[role="dialog"], [role="alertdialog"]');
  const panel = dialog && dialog.contains(del) ? dialog : commonAncestor([cancel, del]);
  if (!panel) return null;
  return { root: panel, cancel, del };
}

async function press(el: Element): Promise<void> {
  await act(async () => {
    (el as HTMLElement).click();
  });
}

async function key(keyName: string, shiftKey = false): Promise<KeyboardEvent> {
  const target = (document.activeElement as HTMLElement | null) ?? document.body;
  const event = new KeyboardEvent("keydown", { key: keyName, shiftKey, bubbles: true, cancelable: true });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
}

function tabbables(scope: ParentNode): HTMLElement[] {
  return Array.from(
    scope.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]"),
  ).filter((el) => {
    if ((el as HTMLButtonElement).disabled) return false;
    if (el.getAttribute("tabindex") === "-1") return false;
    if (el.closest("[hidden], [inert]")) return false;
    return true;
  });
}

async function tab(shiftKey = false): Promise<void> {
  const event = await key("Tab", shiftKey);
  if (event.defaultPrevented) return;
  const all = tabbables(document.body);
  if (all.length === 0) return;
  const here = all.indexOf(document.activeElement as HTMLElement);
  const next = here === -1 ? (shiftKey ? all.length - 1 : 0) : (here + (shiftKey ? -1 : 1) + all.length) % all.length;
  await act(async () => {
    all[next].focus();
  });
}

async function clickOutside(): Promise<void> {
  await act(async () => {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      const Ctor = type.startsWith("pointer") && typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;
      outside.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true }));
    }
  });
}

async function showArchiveView(): Promise<void> {
  const flip = document.body.querySelector<HTMLButtonElement>('button[title="Show the archive"]');
  expect(flip, "harness: the sidebar's header button that shows the archive").not.toBeNull();
  await press(flip!);
}

function expectTheConfirmationFor(name: string): void {
  const confirm = findConfirm();
  expect(confirm, "a confirmation with a Cancel and a Delete opens inside Compass").not.toBeNull();
  const text = norm(confirm!.root.textContent);
  expect(text, "it names the project").toContain(`Delete "${name}"?`);
  expect(text, "it says what is removed").toContain(LINE);
  expect(norm(confirm!.cancel.textContent)).toBe("Cancel");
  expect(norm(confirm!.del.textContent)).toBe("Delete");
  expect(confirmSpy, "no browser confirm box appears").not.toHaveBeenCalled();
}

describe("the sidebar's delete × opens a calm confirmation inside Compass", () => {
  it(`${CHECK_SAME_CONFIRMATION} — a sidebar pill shows Delete "{name}"?, the line, a Cancel and a Delete`, async () => {
    await renderSidebar();
    const x = deleteX("Garden");
    expect(x, "harness: the Garden pill's delete ×").not.toBeNull();
    await press(x!);
    expectTheConfirmationFor("Garden");
    expect(handlers.onDeleteProject, "nothing is deleted just by opening it").not.toHaveBeenCalled();
  });

  it(`${CHECK_SAME_CONFIRMATION} — a row of the sidebar's Archive view shows the same words`, async () => {
    await renderSidebar();
    await showArchiveView();
    const x = deleteX("Old harbor");
    expect(x, "harness: the archived row's delete ×").not.toBeNull();
    await press(x!);
    expectTheConfirmationFor("Old harbor");
    expect(handlers.onDeleteProject, "nothing is deleted just by opening it").not.toHaveBeenCalled();
  });

  it(`${CHECK_CLOSES} — Cancel`, async () => {
    await renderSidebar();
    await press(deleteX("Garden")!);
    const confirm = findConfirm();
    expect(confirm, "the confirmation opened").not.toBeNull();
    await press(confirm!.cancel);
    expect(findConfirm(), "the confirmation is gone").toBeNull();
    expect(handlers.onDeleteProject, "nothing is deleted").not.toHaveBeenCalled();
  });

  it(`${CHECK_CLOSES} — Escape`, async () => {
    await renderSidebar();
    await press(deleteX("Garden")!);
    expect(findConfirm(), "the confirmation opened").not.toBeNull();
    await key("Escape");
    expect(findConfirm(), "the confirmation is gone").toBeNull();
    expect(handlers.onDeleteProject, "nothing is deleted").not.toHaveBeenCalled();
  });

  it(`${CHECK_CLOSES} — a click outside`, async () => {
    await renderSidebar();
    await press(deleteX("Garden")!);
    expect(findConfirm(), "the confirmation opened").not.toBeNull();
    await clickOutside();
    expect(findConfirm(), "the confirmation is gone").toBeNull();
    expect(handlers.onDeleteProject, "nothing is deleted").not.toHaveBeenCalled();
  });

  it(`${CHECK_DELETE} — Delete on the active project's pill hands that project, once, to be deleted`, async () => {
    await renderSidebar();
    await press(deleteX("Lighthouse")!);
    const confirm = findConfirm();
    expect(confirm, "the confirmation opened").not.toBeNull();
    expect(handlers.onDeleteProject, "nothing is deleted before Delete is pressed").not.toHaveBeenCalled();
    await press(confirm!.del);
    expect(handlers.onDeleteProject).toHaveBeenCalledTimes(1);
    expect(handlers.onDeleteProject).toHaveBeenCalledWith("p1");
    expect(confirmSpy, "no browser confirm box appears").not.toHaveBeenCalled();
  });

  it(`${CHECK_DELETE} — Delete on a row of the Archive view hands that project, once, to be deleted`, async () => {
    await renderSidebar();
    await showArchiveView();
    await press(deleteX("Old harbor")!);
    const confirm = findConfirm();
    expect(confirm, "the confirmation opened").not.toBeNull();
    await press(confirm!.del);
    expect(handlers.onDeleteProject).toHaveBeenCalledTimes(1);
    expect(handlers.onDeleteProject).toHaveBeenCalledWith("a1");
  });

  it(`${CHECK_KEYBOARD} — focus moves in, Tab and Shift+Tab stay inside, Escape returns focus to the ×`, async () => {
    await renderSidebar();
    const x = deleteX("Garden");
    expect(x, "harness: the Garden pill's delete ×").not.toBeNull();
    await act(async () => {
      x!.focus();
    });
    expect(document.activeElement, "harness: the × can take keyboard focus").toBe(x);
    await press(x!);

    const confirm = findConfirm();
    expect(confirm, "the confirmation opened").not.toBeNull();
    expect(confirm!.root.contains(document.activeElement), "focus is inside the confirmation when it opens").toBe(true);

    const presses = tabbables(confirm!.root).length + 2;
    for (let i = 0; i < presses; i++) {
      await tab(false);
      expect(confirm!.root.contains(document.activeElement), `Tab press ${i + 1} stays inside the confirmation`).toBe(true);
    }
    for (let i = 0; i < presses; i++) {
      await tab(true);
      expect(confirm!.root.contains(document.activeElement), `Shift+Tab press ${i + 1} stays inside the confirmation`).toBe(true);
    }

    await key("Escape");
    expect(findConfirm(), "the confirmation closed").toBeNull();
    expect(document.activeElement, "focus is back on the × that opened it").toBe(deleteX("Garden"));
  });

  it(`${CHECK_KEYBOARD} — Cancel returns focus to the ×`, async () => {
    await renderSidebar();
    const x = deleteX("Garden");
    await act(async () => {
      x!.focus();
    });
    await press(x!);
    const confirm = findConfirm();
    expect(confirm, "the confirmation opened").not.toBeNull();
    await press(confirm!.cancel);
    expect(findConfirm(), "the confirmation closed").toBeNull();
    expect(document.activeElement, "focus is back on the × that opened it").toBe(deleteX("Garden"));
  });

  it(`${CHECK_ARCHIVE_ASKS_NOTHING}`, async () => {
    await renderSidebar(new Set(["p1"]));
    const archive = document.body.querySelector<HTMLButtonElement>('button[aria-label="Archive Lighthouse"]');
    expect(archive, "harness: the finished pill's archive button").not.toBeNull();
    await press(archive!);
    expect(handlers.onArchiveProject, "it archives at once").toHaveBeenCalledTimes(1);
    expect(handlers.onArchiveProject).toHaveBeenCalledWith("p1");
    expect(confirmSpy, "no browser confirm box").not.toHaveBeenCalled();
    expect(findConfirm(), "no confirmation inside Compass").toBeNull();
    expect(document.body.querySelector('[role="dialog"], [role="alertdialog"]'), "no dialog of any kind").toBeNull();
  });
});
