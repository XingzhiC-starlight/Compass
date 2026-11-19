import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "../lib/db";
import type { Project } from "../lib/types";
import ArchiveScreen from "./ArchiveScreen";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Waiting<T> = { arg?: string; release: (value: T) => void };
const seam = vi.hoisted(() => ({
  archived: [] as Project[],
  slow: false,
  deletes: [] as Waiting<"refused" | undefined>[],
  reads: [] as Waiting<Project[]>[],
}));
vi.mock("../lib/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/db")>();
  return {
    ...real,
    listArchivedProjects: vi.fn(() => {
      if (!seam.slow) return Promise.resolve([...seam.archived]);
      const snapshot = [...seam.archived];
      return new Promise<Project[]>((resolve) => seam.reads.push({ release: () => resolve(snapshot) }));
    }),
    // The seam's contract for a delete (spec §21): a refused one is reported once, as one console
    // line holding the error's code and summary, and the call resolves with nothing either way.
    deleteProject: vi.fn((id: string) => {
      return new Promise<void>((resolve) =>
        seam.deletes.push({
          arg: id,
          release: (outcome) => {
            if (outcome === "refused") console.error("[compass] a save failed: 57014 canceling statement due to statement timeout");
            else seam.archived = seam.archived.filter((p) => p.id !== id);
            resolve();
          },
        }),
      );
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
const onBack = vi.fn();

beforeEach(() => {
  seam.slow = false;
  seam.deletes = [];
  seam.reads = [];
  vi.mocked(db.deleteProject).mockClear();
  onBack.mockClear();
});

afterEach(async () => {
  if (root) {
    await act(async () => root!.unmount());
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

async function renderArchive(archived: Project[]): Promise<void> {
  seam.archived = [...archived];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<ArchiveScreen onRestore={() => {}} onBack={onBack} />));
  await settle();
  seam.slow = true;
}

const rowNames = () => Array.from(container.querySelectorAll(".archive-item-name")).map((el) => el.firstChild?.textContent);

async function confirmDelete(name: string): Promise<void> {
  const x = container.querySelector<HTMLButtonElement>(`button[aria-label="Delete ${name}"]`);
  expect(x, `harness: the ${name} row's ×`).not.toBeNull();
  await act(async () => x!.click());
  await settle();
  const del = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.trim() === "Delete");
  expect(del, "harness: the confirmation's Delete").toBeDefined();
  await act(async () => del!.click());
  await settle();
}

async function release<T>(w: Waiting<T>, value?: T): Promise<void> {
  await act(async () => w.release(value as T));
  await settle();
}

describe("overlapping deletes on the archive screen", () => {
  it("a second Delete on a row whose deletion is still on its way deletes it only once", async () => {
    await renderArchive([project("a1", "Lighthouse"), project("a2", "Old harbor")]);
    await confirmDelete("Lighthouse");
    expect(rowNames(), "harness: the row is still on screen while its deletion is on its way").toContain("Lighthouse");
    await confirmDelete("Lighthouse");

    expect(db.deleteProject, "one project, one deletion").toHaveBeenCalledTimes(1);
    await release(seam.deletes[0]);
    await release(seam.reads[0]);
    expect(rowNames()).toEqual(["Old harbor"]);
  });

  it("a refused deletion can be asked for again, and is sent again", async () => {
    await renderArchive([project("a1", "Lighthouse"), project("a2", "Old harbor")]);
    await confirmDelete("Lighthouse");
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await release(seam.deletes[0], "refused");
      expect(logged, "harness: the seam reported the refusal once, and resolved").toHaveBeenCalledTimes(1);
    } finally {
      logged.mockRestore();
    }
    await release(seam.reads[0]);
    expect(rowNames(), "the row stays after a refused deletion").toContain("Lighthouse");

    await confirmDelete("Lighthouse");
    expect(db.deleteProject, "the second Delete sends it again").toHaveBeenCalledTimes(2);
    expect(seam.deletes[1]?.arg, "for the same project").toBe("a1");
    await release(seam.deletes[1]);
    await release(seam.reads[1]);
    expect(rowNames()).toEqual(["Old harbor"]);
  });

  it("a list read that answers after a newer one never brings back a deleted row", async () => {
    await renderArchive([project("a1", "Lighthouse"), project("a2", "Old harbor"), project("a3", "Tidewater")]);
    await confirmDelete("Lighthouse");
    await confirmDelete("Old harbor");
    expect(seam.deletes.map((d) => d.arg)).toEqual(["a1", "a2"]);

    await release(seam.deletes[0]);
    await release(seam.deletes[1]);
    expect(seam.reads).toHaveLength(2);
    await release(seam.reads[1]);
    expect(rowNames()).toEqual(["Tidewater"]);
    await release(seam.reads[0]);
    expect(rowNames(), "the stale read does not show Old harbor again").toEqual(["Tidewater"]);
    expect(onBack).not.toHaveBeenCalled();
  });
});
