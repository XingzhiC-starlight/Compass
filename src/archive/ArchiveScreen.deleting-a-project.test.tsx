import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import * as db from "../lib/db";
import type { Project } from "../lib/types";
import ArchiveScreen from "./ArchiveScreen";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_SAME_CONFIRMATION =
  "Pressing the delete × on a sidebar pill, on a row of the sidebar's Archive view, or on a row of the archive screen opens the same confirmation inside Compass, and no browser confirm box appears";
const CHECK_DELETE = "Delete removes the project as today";

const LINE = "This removes its phases, tasks, learning, thoughts and time history.";

const store = vi.hoisted(() => ({ archived: [] as Project[] }));
const KEEP_REAL = vi.hoisted(() => new Set(["SaveFailedError", "todayDate", "getActiveProjectId"]));
vi.mock("../lib/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/db")>();
  const quiet: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(real)) {
    quiet[name] = typeof value === "function" && !KEEP_REAL.has(name) ? vi.fn(async () => undefined) : value;
  }
  quiet.listArchivedProjects = vi.fn(async () => [...store.archived]);
  quiet.listProjects = vi.fn(async () => []);
  quiet.listProjectCompletion = vi.fn(async () => ({}));
  quiet.getDashboardShellData = vi.fn(async () => ({ projects: [], archived: [...store.archived], completion: {} }));
  quiet.deleteProject = vi.fn(async (id: string) => {
    store.archived = store.archived.filter((p) => p.id !== id);
  });
  return quiet;
});

function project(id: string, name: string): Project {
  return {
    id,
    userId: "u1",
    name,
    accentColor: "#9A7B4F",
    sortOrder: 0,
    archivedAt: "2026-09-01T17:00:00.000Z",
    totalDays: 90,
    hoursPlannedPerDay: 4,
    hoursAvailablePerDay: 6,
    startedAt: "2026-07-21",
    createdAt: "2026-07-21T17:00:00.000Z",
  };
}

let container: HTMLDivElement;
let root: Root | null = null;
let confirmSpy: ReturnType<typeof vi.spyOn>;
let onBack: Mock<() => void>;
let onRestore: Mock<(id: string) => void>;

beforeEach(() => {
  confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
  vi.mocked(db.deleteProject).mockClear();
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  confirmSpy.mockRestore();
});

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function renderArchive(archived: Project[]): Promise<void> {
  store.archived = [...archived];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  onBack = vi.fn();
  onRestore = vi.fn();
  await act(async () => {
    root!.render(<ArchiveScreen onRestore={onRestore} onBack={onBack} />);
  });
  await settle();
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function buttonsWithText(text: string): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).filter((b) => norm(b.textContent) === text);
}

function deleteX(name: string, allNames: string[]): HTMLButtonElement | null {
  const candidates = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).filter((b) => {
    const label = `${b.getAttribute("aria-label") ?? ""} ${b.getAttribute("title") ?? ""}`;
    return label.includes("Delete permanently") || label.includes(`Delete ${name}`);
  });
  for (const b of candidates) {
    let el: Element | null = b.parentElement;
    while (el && !allNames.some((n) => norm(el!.textContent).includes(n))) el = el.parentElement;
    if (el && norm(el.textContent).includes(name) && allNames.filter((n) => norm(el!.textContent).includes(n)).length === 1) return b;
  }
  return null;
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
  await settle();
}

describe("the archive screen's delete × opens the same calm confirmation", () => {
  it(`${CHECK_SAME_CONFIRMATION} — a row of the archive screen shows Delete "{name}"?, the line, a Cancel and a Delete`, async () => {
    const names = ["Lighthouse", "Old harbor"];
    await renderArchive([project("a1", "Lighthouse"), project("a2", "Old harbor")]);
    const x = deleteX("Old harbor", names);
    expect(x, "harness: the Old harbor row's delete ×").not.toBeNull();
    await press(x!);

    const confirm = findConfirm();
    expect(confirm, "a confirmation with a Cancel and a Delete opens inside Compass").not.toBeNull();
    const text = norm(confirm!.root.textContent);
    expect(text, "it names the project, in the same words as the sidebar").toContain('Delete "Old harbor"?');
    expect(text, "it never says \"for good\" here alone").not.toContain("for good");
    expect(text, "it says what is removed").toContain(LINE);
    expect(norm(confirm!.cancel.textContent)).toBe("Cancel");
    expect(norm(confirm!.del.textContent)).toBe("Delete");
    expect(confirmSpy, "no browser confirm box appears").not.toHaveBeenCalled();
    expect(db.deleteProject, "nothing is deleted just by opening it").not.toHaveBeenCalled();
  });

  it(`${CHECK_DELETE} — on the archive screen, Delete removes that project and its row`, async () => {
    const names = ["Lighthouse", "Old harbor"];
    await renderArchive([project("a1", "Lighthouse"), project("a2", "Old harbor")]);
    await press(deleteX("Old harbor", names)!);
    const confirm = findConfirm();
    expect(confirm, "the confirmation opened").not.toBeNull();
    await press(confirm!.del);

    expect(db.deleteProject).toHaveBeenCalledTimes(1);
    expect(db.deleteProject).toHaveBeenCalledWith("a2");
    expect(norm(container.textContent), "the deleted row is gone").not.toContain("Old harbor");
    expect(norm(container.textContent), "the other row stays").toContain("Lighthouse");
    expect(onBack, "the screen stays while rows remain").not.toHaveBeenCalled();
    expect(findConfirm(), "the confirmation closed").toBeNull();
  });

  it(`${CHECK_DELETE} — on the archive screen, deleting the last row leaves the screen as today`, async () => {
    await renderArchive([project("a1", "Lighthouse")]);
    await press(deleteX("Lighthouse", ["Lighthouse"])!);
    const confirm = findConfirm();
    expect(confirm, "the confirmation opened").not.toBeNull();
    await press(confirm!.del);

    expect(db.deleteProject).toHaveBeenCalledTimes(1);
    expect(db.deleteProject).toHaveBeenCalledWith("a1");
    expect(onBack, "the last row gone, the screen hands back to the gate, as ← Back does").toHaveBeenCalledTimes(1);
    expect(onRestore).not.toHaveBeenCalled();
  });
});
