import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LearningItem } from "../lib/types";
import LearningCard from "./LearningCard";

const db = vi.hoisted(() => ({
  addLearningItem: vi.fn(),
  removeLearningItem: vi.fn(async () => undefined),
  renameLearningItem: vi.fn(),
  reorderLearningItems: vi.fn(),
  setFocusItem: vi.fn(async () => undefined),
  setLearningProgress: vi.fn(),
}));

vi.mock("../lib/db", () => db);

const item = (id: string, isFocus = false): LearningItem => ({
  id,
  projectId: "p1",
  userId: "u1",
  name: id,
  sortOrder: 0,
  progressPct: 20,
  isFocus,
  createdAt: "2026-06-13T10:00:00.000Z",
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = null;
  container = null;
  vi.clearAllMocks();
});

describe("LearningCard deletion", () => {
  it("moves the focus tag to the row promoted after focused deletion", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <LearningCard
          items={[item("current", true), item("next"), item("later")]}
          depth
          onToggle={vi.fn()}
        />,
      );
    });

    const firstDelete = container.querySelector<HTMLButtonElement>(
      ".row:first-child [aria-label='Delete item']",
    );
    expect(firstDelete).not.toBeNull();

    await act(async () => {
      firstDelete?.click();
    });

    const rows = [...container.querySelectorAll<HTMLElement>(".row")];
    expect(rows.map((row) => row.querySelector(".row-name")?.textContent)).toEqual([
      "next",
      "later",
    ]);
    expect(rows[0].querySelector(".focus-tag")?.textContent).toBe("focus");
    expect(rows[1].querySelector(".focus-tag")).toBeNull();
    expect(db.removeLearningItem).toHaveBeenCalledWith("current", "next");
  });
});
