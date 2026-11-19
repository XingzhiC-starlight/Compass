/* jsdom lays nothing out: every row's box is 0 tall at the top, so a drop
   with the pointer above a row's top lands before it, below it after it. */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { expect } from "vitest";
import { __setTestUser, setActiveProject, whenSavesSettle } from "../lib/db";
import type { FakeSupabase } from "../lib/fakeSupabase";
import type { LearningItem } from "../lib/types";
import LearningCard from "./LearningCard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export const CREATED = "2026-10-01T10:00:00.000Z";

export type Spec = [name: string, pct: number, focus?: boolean];

let fake: FakeSupabase | null = null;
let root: Root | null = null;
let container: HTMLDivElement | null = null;
let shownItems: LearningItem[] = [];
let NAMES: string[] = [];

export async function startOn(next: FakeSupabase) {
  fake = next;
  __setTestUser({ id: "u1", email: "owner@example.com" } as never);
  await setActiveProject("p1");
}

export function open(specs: Spec[]) {
  const items: LearningItem[] = specs.map(([name, pct, focus], i) => ({
    id: `li-${name}`,
    projectId: "p1",
    userId: "u1",
    name,
    sortOrder: i,
    progressPct: pct,
    isFocus: !!focus,
    createdAt: CREATED,
  }));
  fake!.seed(
    "learning_items",
    items.map((it) => ({
      id: it.id,
      project_id: "p1",
      name: it.name,
      sort_order: it.sortOrder,
      progress_pct: it.progressPct,
      is_focus: it.isFocus,
      created_at: CREATED,
    })),
  );
  NAMES = specs.map(([name]) => name);
  mount(items, true);
}

export function mount(items: LearningItem[], depth: boolean) {
  shownItems = items;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<LearningCard items={items} depth={depth} onToggle={() => undefined} />));
}
export function unmount() {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
}

export async function settle() {
  await act(async () => {
    await whenSavesSettle();
  });
}

export function cardText(): string {
  return container!.textContent ?? "";
}
export function rows(): HTMLElement[] {
  return Array.from(container!.querySelectorAll<HTMLElement>("[draggable]"));
}
export function nameOf(row: Element): string {
  const text = row.textContent ?? "";
  return NAMES.find((n) => text.includes(n)) ?? "?";
}
export function order(): string[] {
  return rows().map(nameOf);
}
export function rowNamed(name: string): HTMLElement {
  const row = rows().find((r) => nameOf(r) === name);
  expect(row, `a roadmap row named "${name}"`).toBeTruthy();
  return row!;
}
export function taggedRows(): string[] {
  return rows()
    .filter((r) =>
      Array.from(r.querySelectorAll("*")).some(
        (el) => el.children.length === 0 && (el.textContent ?? "").trim().toLowerCase() === "focus",
      ),
    )
    .map(nameOf);
}
export function eyebrow(): string | null {
  const el = Array.from(container!.querySelectorAll("*")).find(
    (e) => e.children.length === 0 && /^\d+%\s*·\s*focus$/i.test((e.textContent ?? "").trim()),
  );
  return el ? (el.textContent ?? "").trim().replace(/\s+/g, " ") : null;
}

export function glance(): { eyebrow: string | null; names: string[] } {
  act(() => root!.render(<LearningCard items={shownItems} depth={false} onToggle={() => undefined} />));
  const shown = eyebrow();
  const text = cardText();
  const names = NAMES.filter((n) => text.includes(n));
  act(() => root!.render(<LearningCard items={shownItems} depth={true} onToggle={() => undefined} />));
  return { eyebrow: shown, names };
}

export function fire(el: Element, type: "dragstart" | "dragover" | "drop" | "dragend", clientY = 0) {
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientY }));
  });
}
export function pressGrip(row: Element) {
  let el: Element = row;
  while (el.firstElementChild) el = el.firstElementChild;
  act(() => {
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  });
}
export async function drag(from: string, to: string, where: "before" | "after") {
  const source = rowNamed(from);
  pressGrip(source);
  fire(source, "dragstart");
  const target = rowNamed(to);
  const y = where === "before" ? -5 : 5;
  fire(target, "dragover", y);
  fire(target, "drop", y);
  fire(source, "dragend");
  await settle();
}
export async function press(rowName: string, label: string) {
  const control = rowNamed(rowName).querySelector<HTMLElement>(`[aria-label="${label}"], [title="${label}"]`);
  expect(control, `the "${label}" control on the row "${rowName}"`).toBeTruthy();
  act(() => {
    control!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await settle();
}
