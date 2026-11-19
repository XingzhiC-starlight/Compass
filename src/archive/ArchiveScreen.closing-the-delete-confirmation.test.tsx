import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "../lib/db";
import type { Project } from "../lib/types";
import ArchiveScreen from "./ArchiveScreen";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = vi.hoisted(() => ({ archived: [] as Project[] }));
vi.mock("../lib/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/db")>();
  return {
    ...real,
    listArchivedProjects: vi.fn(async () => [...store.archived]),
    deleteProject: vi.fn(async (id: string) => {
      store.archived = store.archived.filter((p) => p.id !== id);
    }),
  };
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

beforeEach(() => {
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
});

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function renderArchive(): Promise<void> {
  store.archived = [project("a1", "Lighthouse"), project("a2", "Old harbor")];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ArchiveScreen onRestore={vi.fn()} onBack={vi.fn()} />);
  });
  await settle();
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function deleteX(name: string): HTMLButtonElement {
  const x = container.querySelector<HTMLButtonElement>(`button[aria-label="Delete ${name}"]`);
  expect(x, `harness: the ${name} row's delete ×`).not.toBeNull();
  return x!;
}

function findConfirm(): { cancel: HTMLButtonElement; del: HTMLButtonElement } | null {
  const buttons = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button"));
  const cancel = buttons.find((b) => norm(b.textContent) === "Cancel");
  const del = buttons.find((b) => norm(b.textContent) === "Delete");
  return cancel && del ? { cancel, del } : null;
}

async function openFromKeyboard(name: string): Promise<HTMLButtonElement> {
  const x = deleteX(name);
  await act(async () => {
    x.focus();
  });
  expect(document.activeElement, "harness: the × can take keyboard focus").toBe(x);
  await act(async () => {
    x.click();
  });
  await settle();
  expect(findConfirm(), "the confirmation opened").not.toBeNull();
  return x;
}

async function key(keyName: string): Promise<void> {
  const target = (document.activeElement as HTMLElement | null) ?? document.body;
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: keyName, bubbles: true, cancelable: true }));
  });
  await settle();
}

async function clickOnTheScreen(): Promise<void> {
  const heading = container.querySelector("h1");
  expect(heading, "harness: the archive screen's heading").not.toBeNull();
  await act(async () => {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      const Ctor = type.startsWith("pointer") && typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;
      heading!.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true }));
    }
  });
  await settle();
}

describe("closing the delete confirmation on the archive screen", () => {
  it("Cancel closes it, deletes nothing, and returns focus to the row's ×", async () => {
    await renderArchive();
    await openFromKeyboard("Old harbor");
    await act(async () => {
      findConfirm()!.cancel.click();
    });
    await settle();
    expect(findConfirm(), "the confirmation is gone").toBeNull();
    expect(db.deleteProject, "nothing is deleted").not.toHaveBeenCalled();
    expect(norm(container.textContent), "the row stays").toContain("Old harbor");
    expect(document.activeElement, "focus is back on the × that opened it").toBe(deleteX("Old harbor"));
  });

  it("Escape closes it, deletes nothing, and returns focus to the row's ×", async () => {
    await renderArchive();
    await openFromKeyboard("Old harbor");
    await key("Escape");
    expect(findConfirm(), "the confirmation is gone").toBeNull();
    expect(db.deleteProject, "nothing is deleted").not.toHaveBeenCalled();
    expect(norm(container.textContent), "the row stays").toContain("Old harbor");
    expect(document.activeElement, "focus is back on the × that opened it").toBe(deleteX("Old harbor"));
  });

  it("a click on the screen outside it closes it and deletes nothing", async () => {
    await renderArchive();
    await openFromKeyboard("Old harbor");
    await clickOnTheScreen();
    expect(findConfirm(), "the confirmation is gone").toBeNull();
    expect(db.deleteProject, "nothing is deleted").not.toHaveBeenCalled();
    expect(norm(container.textContent), "the row stays").toContain("Old harbor");
  });
});
