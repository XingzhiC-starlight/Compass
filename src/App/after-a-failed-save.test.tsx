import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeRow, type FakeSupabase } from "../lib/fakeSupabase";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const realSetTimeout = globalThis.setTimeout.bind(globalThis);

const CHECK_CONSOLE =
  "When a save is refused, the browser console shows only the error's code and one-line summary: text in the database's description of the refused row never appears there, by any route, a failed add included, nor in what the failed-save note is given";
const CHECK_NOTE =
  "The note reads \"Couldn't save just now — try again in a moment.\", muted, for about four seconds, and never contains anything the person typed; several failures close together show one note";
const CHECK_RENAME = "A project rename whose save fails shows the saved name in the sidebar while the note is showing";
const CHECK_REORDER = "A pill reorder whose save fails shows the saved order while the note is showing";
const CHECK_REFRESH =
  "After any failed save, the sidebar and the cards show what is saved without going blank or showing \"Loading…\"; a box someone is typing in keeps its text and cursor, and a selection of thoughts survives";
const CHECK_SWITCH = "Switching projects rebuilds the cards: nothing open or selected in one project shows in another";
const CHECK_SUCCESS = "A save that succeeds refreshes neither the sidebar nor the cards";
const CHECK_OFFLINE =
  "When a save fails and the server cannot be reached to refresh, the cards and sidebar stay as they are (no \"Couldn't load this project just now.\"), open boxes keep their words, and once the connection returns the screen shows what is saved without the person doing anything";
const CHECK_TEXT_EDIT =
  "When an edit to a thought's or task's text fails, the item reopens for editing with exactly the words typed once the screen has refreshed, without taking the cursor from wherever the person is";
const CHECK_NAME_EDIT = "When an edit to a name or title fails, the saved version shows";

const NOTE = "Couldn't save just now — try again in a moment.";
const NOTE_START = "Couldn't save just now";
const LOAD_FAILED = "Couldn't load this project just now.";
const GATE_FAILED = "Compass couldn't load just now.";
const TASK_ADD = "+ Add a task";
const TASK_PLACEHOLDER = "Type a task, press Enter…";
const THOUGHT_ADD = "+ Add a thought";
const THOUGHT_PLACEHOLDER = "What's on your mind? Press Enter to add…";

const net = vi.hoisted(() => {
  const dropped = () => ({ message: "TypeError: Failed to fetch", details: "", hint: "", code: "" });
  const unreachable: unknown = new Proxy(function unreachable() {}, {
    get(_target, key) {
      if (key === "then") {
        return (ok?: (value: unknown) => unknown, fail?: (reason: unknown) => unknown) =>
          Promise.resolve({ data: null, error: dropped(), count: null, status: 0, statusText: "" }).then(ok, fail);
      }
      return () => unreachable;
    },
    apply() {
      return unreachable;
    },
  });
  return {
    server: null as { client: unknown } | null,
    offline: false,
    unreachableClient: {
      from: () => unreachable,
      rpc: () => unreachable,
      channel: () => unreachable,
      removeChannel: () => unreachable,
      auth: unreachable,
    } as Record<string | symbol, unknown>,
  };
});

vi.mock("../lib/supabase", () => ({
  getSupabase: () =>
    new Proxy(
      {},
      {
        get(_target, key) {
          const client = net.offline ? net.unreachableClient : (net.server!.client as Record<string | symbol, unknown>);
          const member = client[key];
          return typeof member === "function" ? (member as (...args: unknown[]) => unknown).bind(client) : member;
        },
      },
    ),
}));

const who = vi.hoisted(() => ({ user: { id: "user-1", email: "founder@example.com" } }));

vi.mock("../lib/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/db")>();
  return {
    ...real,
    getCurrentUser: vi.fn(async () => who.user),
    onAuthChange: vi.fn(() => () => {}),
    onPasswordRecovery: vi.fn(() => () => {}),
    signOut: vi.fn(async () => {}),
  };
});

const USER = { id: "user-1", email: "founder@example.com" };
const CREATED = "2026-07-21T17:00:00.000Z";
const PROJECT_NAMES = ["Lighthouse", "Garden", "Workshop"];

function projectRow(id: string, name: string, sortOrder: number): FakeRow {
  return {
    id,
    user_id: USER.id,
    name,
    accent_color: "#9A7B4F",
    sort_order: sortOrder,
    archived_at: null,
    total_days: 90,
    hours_planned_per_day: 4,
    hours_available_per_day: 6,
    started_at: "2026-07-21",
    created_at: CREATED,
  };
}
function phaseRow(id: string, projectId: string, name: string, sortOrder: number): FakeRow {
  return { id, user_id: USER.id, project_id: projectId, name, est_days: 5, sort_order: sortOrder, is_done: false, completed_at: null, created_at: CREATED };
}
function learningRow(id: string, projectId: string, name: string, sortOrder: number, pct: number, focus: boolean): FakeRow {
  return { id, user_id: USER.id, project_id: projectId, name, sort_order: sortOrder, progress_pct: pct, is_focus: focus, created_at: CREATED };
}
function taskRow(id: string, projectId: string, text: string, sortOrder: number): FakeRow {
  return { id, user_id: USER.id, project_id: projectId, text, is_done: false, sort_order: sortOrder, task_date: "2026-09-20", phase_id: null, learning_item_id: null, created_at: CREATED };
}
function thoughtRow(id: string, projectId: string, text: string, sortOrder: number, groupId: string | null = null): FakeRow {
  return { id, user_id: USER.id, project_id: projectId, title: null, text, sort_order: sortOrder, group_id: groupId, created_at: CREATED };
}

function seedRows(): Record<string, FakeRow[]> {
  return {
    projects: [projectRow("p1", "Lighthouse", 0), projectRow("p2", "Garden", 1), projectRow("p3", "Workshop", 2)],
    phases: [
      phaseRow("ph1", "p1", "Sketch the screens", 0),
      phaseRow("ph2", "p1", "Build the backend", 1),
      phaseRow("ph3", "p2", "Plant seeds", 0),
    ],
    learning_items: [
      learningRow("li1", "p1", "React basics", 0, 30, true),
      learningRow("li2", "p1", "Postgres", 1, 10, false),
      learningRow("li3", "p2", "Soil types", 0, 20, true),
    ],
    daily_tasks: [
      taskRow("t1", "p1", "Write the intro", 0),
      taskRow("t2", "p1", "Call the printer", 1),
      taskRow("t3", "p2", "Water the plants", 0),
    ],
    thoughts: [
      thoughtRow("th1", "p1", "First idea", 0),
      thoughtRow("th2", "p1", "Second idea", 1),
      thoughtRow("th3", "p1", "Grouped idea", 0, "g1"),
      thoughtRow("th4", "p2", "Garden thought", 0),
    ],
    thought_groups: [{ id: "g1", user_id: USER.id, project_id: "p1", name: "Launch notes", sort_order: 2, created_at: CREATED }],
    time_sessions: [],
  };
}

type Field = HTMLInputElement | HTMLTextAreaElement;

let fake: FakeSupabase;
let container: HTMLDivElement;
let root: Root | null = null;
let online = true;

async function settle(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

async function pass(ms: number, step = 100): Promise<void> {
  let left = ms;
  while (left > 0) {
    const d = Math.min(step, left);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(d);
    });
    left -= d;
  }
  await settle();
}

async function waitFor(check: () => boolean, ms = 3000, step = 50): Promise<boolean> {
  await settle();
  let waited = 0;
  while (!check() && waited < ms) {
    await pass(step, step);
    waited += step;
  }
  return check();
}

async function openCompass(): Promise<void> {
  fake = createFakeSupabase(seedRows());
  net.server = fake;
  net.offline = false;
  vi.resetModules();
  const db = await import("../lib/db");
  db.__setTestUser(USER);
  await db.setActiveProject("p1");
  const { default: App } = await import("../App");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<App />);
  });
  const ready = await waitFor(() => shown(sidebar()).includes("Lighthouse") && shown(container).includes("Write the intro"), 5000);
  expect(ready, `harness: the dashboard opened on Lighthouse (screen: ${shown(container).slice(0, 300)})`).toBe(true);
}

function tidy(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function shown(el: Element | null | undefined): string {
  if (!el) return "";
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll("input, textarea, select").forEach((f) => f.remove());
  return tidy(copy.textContent);
}

function sidebar(): Element | null {
  return container.querySelector(".sidebar");
}
function card(kind: "timeline" | "learning" | "task"): Element | null {
  return container.querySelector(`.bubble-${kind}`);
}

function nameOf(el: Element): string {
  return el.getAttribute("aria-label") ?? el.getAttribute("title") ?? tidy(el.textContent);
}
function matchesName(el: Element, name: string | RegExp): boolean {
  const names = [el.getAttribute("aria-label"), el.getAttribute("title"), el.tagName === "BUTTON" ? tidy(el.textContent) : null];
  return names.some((n) => n !== null && (typeof name === "string" ? n === name : name.test(n)));
}
function controls(scope: ParentNode): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>("button, [role='button'], input, [title], [aria-label]"));
}
function named(name: string | RegExp, scope: ParentNode = container): HTMLElement | null {
  return controls(scope).find((el) => matchesName(el, name)) ?? null;
}
function allNamed(name: string | RegExp, scope: ParentNode = container): HTMLElement[] {
  return controls(scope).filter((el) => matchesName(el, name));
}

function textEl(text: string, scope: ParentNode = container): HTMLElement | null {
  const all = Array.from(scope.querySelectorAll<HTMLElement>("*")).filter(
    (el) => !["SCRIPT", "STYLE", "TEXTAREA", "OPTION"].includes(el.tagName) && tidy(el.textContent) === text,
  );
  return all.find((el) => !Array.from(el.children).some((child) => tidy(child.textContent) === text)) ?? null;
}

function rowControl(text: string, name: string | RegExp): HTMLElement | null {
  let n: Element | null = textEl(text);
  while (n && n !== container) {
    const found = controls(n).find((el) => matchesName(el, name));
    if (found) return found;
    n = n.parentElement;
  }
  return null;
}

function fieldWithPlaceholder(placeholder: string, scope: ParentNode = container): Field | null {
  return scope.querySelector<Field>(`input[placeholder="${placeholder}"], textarea[placeholder="${placeholder}"]`);
}
function fieldHolding(value: string, scope: ParentNode = container): Field | null {
  return Array.from(scope.querySelectorAll<Field>("input, textarea")).find((f) => f.value === value) ?? null;
}
function activeField(): Field | null {
  const a = document.activeElement;
  return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement ? a : null;
}

function noteText(): string {
  const el = textElContaining(NOTE_START, document.body);
  return el ? tidy(el.textContent) : "";
}
function textElContaining(part: string, scope: ParentNode): HTMLElement | null {
  const all = Array.from(scope.querySelectorAll<HTMLElement>("*")).filter(
    (el) => !["SCRIPT", "STYLE", "TEXTAREA"].includes(el.tagName) && tidy(el.textContent).includes(part),
  );
  return all.find((el) => !Array.from(el.children).some((child) => tidy(child.textContent).includes(part))) ?? null;
}
function notesShowing(): number {
  return shown(document.body).split(NOTE_START).length - 1;
}

function pillEls(): HTMLElement[] {
  return Array.from(sidebar()?.querySelectorAll<HTMLElement>(".project-pill") ?? []).filter(
    (p) => !p.classList.contains("new-pill") && !shown(p).includes("New project"),
  );
}
function pillOrder(): string[] {
  return pillEls().map((p) => PROJECT_NAMES.find((n) => shown(p).includes(n)) ?? `? ${shown(p)}`);
}
function storedOrder(): string[] {
  return fake
    .rows("projects")
    .filter((r) => r.archived_at === null)
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
    .map((r) => String(r.name));
}

async function click(el: Element | null, what: string): Promise<void> {
  expect(el, `harness: ${what} (screen: ${shown(container).slice(0, 300)})`).not.toBeNull();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

function setNativeValue(field: Field, value: string): void {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

async function type(field: Field, text: string, { replace = false } = {}): Promise<void> {
  await act(async () => {
    field.focus();
  });
  if (field.disabled || field.readOnly) return;
  let next = replace ? text : field.value + text;
  if (field.maxLength >= 0 && next.length > field.maxLength) next = next.slice(0, field.maxLength);
  await act(async () => {
    setNativeValue(field, next);
  });
  await settle(2);
}

async function pressEnter(field: Field): Promise<void> {
  await act(async () => {
    field.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }),
    );
  });
  await settle();
}

async function openAddBox(label: string, placeholder: string, scope: ParentNode = container): Promise<Field> {
  let box = fieldWithPlaceholder(placeholder, scope);
  if (!box) {
    await click(named(label, scope) ?? textEl(label, scope), `the "${label}" row`);
    box = fieldWithPlaceholder(placeholder, scope);
  }
  expect(box, `harness: the add box "${placeholder}"`).not.toBeNull();
  await act(async () => {
    box!.focus();
  });
  return box!;
}

async function openEditor(text: string, scope: Element | null): Promise<Field> {
  expect(scope, `harness: the part of the screen holding "${text}"`).not.toBeNull();
  await click(textEl(text, scope!), `"${text}" on screen, to edit it`);
  const editor = activeField() ?? fieldHolding(text, scope!);
  expect(editor, `harness: "${text}" opened for editing`).not.toBeNull();
  return editor!;
}

async function showThoughtLog(): Promise<void> {
  await click(named("Thought log"), 'the "Thought log" switch');
}
async function showTaskList(): Promise<void> {
  await click(named("Task list"), 'the "Task list" switch');
}

async function savedElsewhere(change: () => PromiseLike<unknown>): Promise<void> {
  await act(async () => {
    await change();
  });
}
function renameOnServer(id: string, name: string) {
  return () => fake.client.from("projects").update({ name }).eq("id", id);
}

function goOffline(): void {
  net.offline = true;
  online = false;
  window.dispatchEvent(new Event("offline"));
}
function goOnline(): void {
  net.offline = false;
  online = true;
  window.dispatchEvent(new Event("online"));
}

function watchForBlanking(): { stop(): string[] } {
  const seen: string[] = [];
  const read = (records: MutationRecord[]) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        const text = node.textContent ?? "";
        if (/Loading(…|\.\.\.)/.test(text)) seen.push(`"Loading…" appeared: ${tidy(text).slice(0, 60)}`);
      });
      if (record.type === "characterData" && /Loading(…|\.\.\.)/.test(record.target.textContent ?? "")) {
        seen.push('"Loading…" appeared');
      }
      record.removedNodes.forEach((node) => {
        if (node instanceof Element && (node.matches(".bubble, .sidebar") || node.querySelector(".bubble, .sidebar"))) {
          seen.push(`a card or the sidebar was taken down: ${tidy(node.textContent).slice(0, 60)}`);
        }
      });
    }
  };
  const observer = new MutationObserver(read);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  return {
    stop() {
      read(observer.takeRecords());
      observer.disconnect();
      return seen;
    },
  };
}

function deepText(value: unknown, seen: Set<unknown> = new Set()): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string") return value;
  if (typeof value === "function") return "[function]";
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "";
  seen.add(value);
  const parts: string[] = [];
  try {
    parts.push(String(value));
  } catch {
    /* still read its properties */
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    let inner: unknown;
    try {
      inner = (value as Record<string, unknown>)[key];
    } catch {
      continue;
    }
    parts.push(`${key}: ${deepText(inner, seen)}`);
  }
  return parts.join("\n");
}

const CONSOLE_METHODS = ["error", "warn", "log", "info", "debug", "trace"] as const;
type Spy = { mock: { calls: unknown[][] }; mockRestore(): void };
let consoleSpies: Spy[] = [];
function watchConsole(): void {
  consoleSpies = CONSOLE_METHODS.map((m) => vi.spyOn(console, m).mockImplementation(() => undefined) as unknown as Spy);
}
function printed(): string {
  return consoleSpies.flatMap((s) => s.mock.calls.map((args) => args.map((a) => deepText(a)).join(" "))).join("\n");
}

type NodeProcess = {
  listeners(event: string): Array<(...args: unknown[]) => void>;
  removeAllListeners(event: string): unknown;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
};
const nodeProcess = (globalThis as unknown as { process: NodeProcess }).process;
let uncaught: unknown[] = [];
let heldRejectionListeners: Array<(...args: unknown[]) => void> | null = null;
function watchUncaught(): void {
  uncaught = [];
  heldRejectionListeners = nodeProcess.listeners("unhandledRejection");
  nodeProcess.removeAllListeners("unhandledRejection");
  nodeProcess.on("unhandledRejection", (reason: unknown) => {
    uncaught.push(reason);
  });
}
function stopWatchingUncaught(): void {
  if (!heldRejectionListeners) return;
  nodeProcess.removeAllListeners("unhandledRejection");
  for (const listener of heldRejectionListeners) nodeProcess.on("unhandledRejection", listener);
  heldRejectionListeners = null;
}

function fakeDataTransfer(): Record<string, unknown> {
  const data: Record<string, string> = {};
  return {
    dropEffect: "move",
    effectAllowed: "all",
    types: [] as string[],
    files: [],
    items: [],
    setData(kind: string, value: string) {
      data[kind] = value;
    },
    getData(kind: string) {
      return data[kind] ?? "";
    },
    clearData() {},
    setDragImage() {},
  };
}

function pointerish(type: string, clientX: number, clientY: number, dataTransfer?: Record<string, unknown>): Event {
  const pressed = !(type.endsWith("up") || type === "drop" || type === "dragend");
  const init = { bubbles: true, cancelable: true, composed: true, clientX, clientY, button: 0, buttons: pressed ? 1 : 0 };
  let event: Event;
  if (type.startsWith("pointer") && typeof PointerEvent === "function") {
    event = new PointerEvent(type, { ...init, pointerId: 1, isPrimary: true, pointerType: "mouse" });
  } else {
    event = new MouseEvent(type, init);
  }
  if (dataTransfer) Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  return event;
}

function placePills(): () => void {
  const pills = pillEls();
  const undo: Array<() => void> = [];
  pills.forEach((pill, i) => {
    const top = 100 + i * 40;
    const rect = { x: 0, y: top, top, left: 0, width: 200, height: 32, right: 200, bottom: top + 32, toJSON: () => ({}) } as DOMRect;
    pill.getBoundingClientRect = () => rect;
    undo.push(() => {
      delete (pill as { getBoundingClientRect?: unknown }).getBoundingClientRect;
    });
  });
  const doc = document as unknown as { elementFromPoint: ((x: number, y: number) => Element | null) | undefined };
  const original = doc.elementFromPoint;
  doc.elementFromPoint = (_x: number, y: number) =>
    pills.find((p) => {
      const r = p.getBoundingClientRect();
      return y >= r.top && y <= r.bottom;
    }) ?? null;
  undo.push(() => {
    doc.elementFromPoint = original;
  });
  return () => undo.forEach((u) => u());
}

async function dragPill(from: string, to: string): Promise<void> {
  const undo = placePills();
  try {
    const source = pillEls().find((p) => shown(p).includes(from));
    const target = pillEls().find((p) => shown(p).includes(to));
    expect(source, `harness: the ${from} pill`).toBeTruthy();
    expect(target, `harness: the ${to} pill`).toBeTruthy();
    const x = 40;
    const y0 = source!.getBoundingClientRect().top + 12;
    const y1 = target!.getBoundingClientRect().top + 26;
    const dt = fakeDataTransfer();
    await act(async () => {
      source!.dispatchEvent(pointerish("pointerdown", x, y0));
      source!.dispatchEvent(pointerish("mousedown", x, y0));
    });
    await act(async () => {
      source!.dispatchEvent(pointerish("dragstart", x, y0, dt));
    });
    for (const y of [y0 + 8, (y0 + y1) / 2, y1 - 2, y1]) {
      const over = (document.elementFromPoint(x, y) as HTMLElement | null) ?? target!;
      await act(async () => {
        over.dispatchEvent(pointerish("pointermove", x, y));
        over.dispatchEvent(pointerish("mousemove", x, y));
        over.dispatchEvent(pointerish("dragenter", x, y, dt));
        over.dispatchEvent(pointerish("dragover", x, y, dt));
      });
    }
    await act(async () => {
      target!.dispatchEvent(pointerish("drop", x, y1, dt));
      source!.dispatchEvent(pointerish("dragend", x, y1, dt));
      target!.dispatchEvent(pointerish("pointerup", x, y1));
      target!.dispatchEvent(pointerish("mouseup", x, y1));
    });
    await settle();
  } finally {
    undo();
  }
}

let styleTag: HTMLStyleElement | null = null;

async function appStylesheet(): Promise<string> {
  const fsModule = "node:fs";
  const fs = (await import(/* @vite-ignore */ fsModule)) as { readFileSync(path: string, encoding: "utf8"): string };
  const projectRoot = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  return fs.readFileSync(`${projectRoot}/src/styles/styles.css`, "utf8");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(new Date(2026, 8, 22, 10, 0, 0));
  localStorage.clear();
  online = true;
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
  vi.stubGlobal("__APP_VERSION__", "0.0.0-test");
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }),
  );
  if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  }
  const proto = Element.prototype as unknown as Record<string, unknown>;
  for (const name of ["scrollIntoView", "setPointerCapture", "releasePointerCapture"]) {
    if (typeof proto[name] !== "function") proto[name] = function () {};
  }
  if (typeof proto.hasPointerCapture !== "function") proto.hasPointerCapture = () => false;
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  styleTag?.remove();
  styleTag = null;
  stopWatchingUncaught();
  for (const spy of consoleSpies) spy.mockRestore();
  consoleSpies = [];
  net.offline = false;
  delete (window.navigator as { onLine?: boolean }).onLine;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("a refused add, on the whole app", () => {
  it(`${CHECK_CONSOLE} — a thought add refused by the database: nothing printed, nothing left uncaught and nothing in the note holds the refused row`, async () => {
    const PRIVATE = "I am scared the launch will fail and I will have to tell Mira";
    const SUMMARY = 'new row for relation "thoughts" violates check constraint "thoughts_text_check"';
    const HINT_MARK = "HINT-7f3a only-for-the-person";

    await openCompass();
    watchConsole();
    watchUncaught();
    await showThoughtLog();
    const box = await openAddBox(THOUGHT_ADD, THOUGHT_PLACEHOLDER);
    await type(box, PRIVATE);
    fake.failNext("thoughts", "insert", {
      code: "23514",
      message: SUMMARY,
      details: `Failing row contains (th-9, user-1, p1, null, ${PRIVATE}, 3, null, 2026-09-22 17:00:00+00).`,
      hint: `Shorten the value. ${HINT_MARK}`,
    });
    await pressEnter(box);
    await pass(1000);
    const noteWhileShowing = noteText();
    await act(async () => {
      await new Promise<void>((resolve) => realSetTimeout(resolve, 20));
    });
    await pass(5000);

    expect(
      fake.requests.some((r) => r.table === "thoughts" && r.operation === "insert" && r.error !== null),
      "harness: the add reached the database and was refused",
    ).toBe(true);

    const out = printed();
    expect(out, "the console never shows the refused row").not.toContain("Failing row contains");
    expect(out, "the console never shows the words typed").not.toContain(PRIVATE);
    expect(out, "the console never shows the hint").not.toContain(HINT_MARK);
    expect(out, "the console shows the error's code").toContain("23514");
    expect(out, "the console shows the one-line summary").toContain(SUMMARY);

    const leftUncaught = uncaught.map((u) => deepText(u)).join("\n");
    expect(leftUncaught, "nothing left uncaught carries the refused row").not.toContain("Failing row contains");
    expect(leftUncaught, "nothing left uncaught carries the words typed").not.toContain(PRIVATE);
    expect(uncaught.length, `the failed add is not left for the browser to print by itself (uncaught: ${leftUncaught.slice(0, 200)})`).toBe(0);

    expect(noteWhileShowing, "harness: the failed-save note showed").not.toBe("");
    expect(noteWhileShowing, "the note holds none of the words typed").not.toContain(PRIVATE);
    expect(noteWhileShowing, "the note holds nothing of the refused row").not.toContain("Failing row contains");
  });
});

describe("the failed-save note", () => {
  it(`${CHECK_NOTE} — its words, its color, how long it stays, and nothing typed in it`, async () => {
    await openCompass();
    styleTag = document.createElement("style");
    styleTag.textContent = await appStylesheet();
    document.head.appendChild(styleTag);

    await click(sidebar()?.querySelector('[title="Click to rename"]') ?? null, "the active pill's name, to rename it");
    const field = activeField() ?? sidebar()?.querySelector<HTMLInputElement>("input") ?? null;
    expect(field, "harness: the rename field").not.toBeNull();
    await type(field!, "Beacon of hope", { replace: true });
    fake.failNext("projects", "update");
    await pressEnter(field!);
    const failedAt = Date.now();

    await pass(1000);
    expect(noteText(), "the note reads exactly the calm line").toBe(NOTE);
    expect(noteText(), "the note never contains anything typed").not.toContain("Beacon");

    const noteEl = textElContaining(NOTE_START, document.body)!;
    let colored: HTMLElement | null = noteEl;
    let color = "";
    while (colored && colored !== document.body && !color) {
      color = colored.style.color || "";
      colored = colored.parentElement;
    }
    if (!color) color = getComputedStyle(noteEl).color;
    expect(color, "the note is muted — the muted text color (DS §2.4, D9)").toMatch(/--text-muted|#8a8a8a|rgb\(\s*138,\s*138,\s*138\s*\)/i);

    await pass(3000 - (Date.now() - failedAt));
    expect(noteText(), "about four seconds: still showing at 3 s").toBe(NOTE);
    await pass(6000 - (Date.now() - failedAt));
    expect(noteText(), "about four seconds: gone by 6 s").toBe("");
  });

  it(`${CHECK_NOTE} — two failures close together show one note`, async () => {
    await openCompass();
    fake.failNext("daily_tasks", "update");
    fake.failNext("daily_tasks", "update");

    await click(rowControl("Write the intro", /^Mark task (complete|incomplete)$/), "the first task's check");
    await click(rowControl("Call the printer", /^Mark task (complete|incomplete)$/), "the second task's check");
    await pass(300);

    expect(
      fake.requests.filter((r) => r.table === "daily_tasks" && r.operation === "update" && r.error !== null).length,
      "harness: both saves failed",
    ).toBe(2);
    expect(notesShowing(), "one note, not two").toBe(1);
    expect(noteText(), "and it is the calm line").toBe(NOTE);
    await pass(1000);
    expect(notesShowing(), "still one note a second later").toBe(1);
  });
});

describe("the sidebar shows what is saved", () => {
  it(`${CHECK_RENAME}`, async () => {
    await openCompass();
    await click(sidebar()?.querySelector('[title="Click to rename"]') ?? null, "the active pill's name, to rename it");
    const field = activeField() ?? sidebar()?.querySelector<HTMLInputElement>("input") ?? null;
    expect(field, "harness: the rename field").not.toBeNull();
    await type(field!, "Beacon", { replace: true });
    fake.failNext("projects", "update");
    await pressEnter(field!);

    await waitFor(() => noteText() !== "", 2000);
    await pass(1500);

    expect(
      fake.requests.some((r) => r.table === "projects" && r.operation === "update" && r.error !== null),
      "harness: the rename's save failed",
    ).toBe(true);
    expect(noteText(), "the note is showing").not.toBe("");
    expect(shown(sidebar()), "the sidebar shows the saved name").toContain("Lighthouse");
    expect(shown(sidebar()), "not the name whose save failed").not.toContain("Beacon");
  });

  it(`${CHECK_REORDER}`, async () => {
    await openCompass();
    expect(pillOrder(), "harness: the pills start in the saved order").toEqual(["Lighthouse", "Garden", "Workshop"]);
    for (let i = 0; i < 10; i += 1) fake.failNext("projects", "update");

    await dragPill("Lighthouse", "Workshop");
    await waitFor(() => noteText() !== "", 2000);
    await pass(1500);

    expect(
      fake.requests.some((r) => r.table === "projects" && r.operation === "update" && r.error !== null),
      "harness: the reorder's save was sent and failed",
    ).toBe(true);
    expect(storedOrder(), "harness: what is saved is still the old order").toEqual(["Lighthouse", "Garden", "Workshop"]);
    expect(noteText(), "the note is showing").not.toBe("");
    expect(pillOrder(), "the sidebar shows the saved order").toEqual(storedOrder());
  });

  it(`${CHECK_REORDER} — harness: with a working connection the same drag saves and shows the new order, so the check above is not empty`, async () => {
    await openCompass();
    await dragPill("Lighthouse", "Workshop");
    await pass(1000);

    expect(pillOrder(), "the sidebar shows the new order").toEqual(["Garden", "Workshop", "Lighthouse"]);
    expect(storedOrder(), "and the new order is saved").toEqual(["Garden", "Workshop", "Lighthouse"]);
    expect(noteText(), "nothing failed, no note").toBe("");
  });
});

describe("after a failed save, the screen shows what is saved and keeps what is in progress", () => {
  it(`${CHECK_REFRESH}`, async () => {
    await openCompass();

    await showThoughtLog();
    const boxes = allNamed("Select thought");
    expect(boxes.length, "harness: thoughts can be selected").toBeGreaterThanOrEqual(2);
    await click(boxes[0], "the first thought's checkbox");
    await click(allNamed("Select thought")[1], "the second thought's checkbox");
    expect(shown(container), "harness: two thoughts are selected").toContain("2 selected");
    await showTaskList();

    fake.failNext("daily_tasks", "update");
    const release = fake.holdNext("daily_tasks", "update");
    await click(rowControl("Write the intro", "Mark task complete"), "the first task's check");

    const box = await openAddBox(TASK_ADD, TASK_PLACEHOLDER);
    await type(box, "half-typed words");
    await act(async () => {
      box.focus();
      box.setSelectionRange(4, 4);
    });

    await savedElsewhere(renameOnServer("p1", "Harbor"));
    fake.seed("daily_tasks", [taskRow("t9", "p1", "Added on the laptop", 5)]);

    const watch = watchForBlanking();
    await act(async () => {
      release();
    });
    await waitFor(() => shown(sidebar()).includes("Harbor") && shown(card("task")).includes("Added on the laptop"), 3000);
    await pass(500);
    const blanking = watch.stop();

    expect(
      fake.requests.some((r) => r.table === "daily_tasks" && r.operation === "update" && r.error !== null),
      "harness: the save failed",
    ).toBe(true);

    expect(shown(sidebar()), "the sidebar shows the saved name").toContain("Harbor");
    expect(shown(card("task")), "the task list shows the saved tasks").toContain("Added on the laptop");
    expect(
      nameOf(rowControl("Write the intro", /^Mark task (complete|incomplete)$/) ?? container),
      "the task whose tick failed shows as saved: not done",
    ).toBe("Mark task complete");

    expect(blanking, "nothing went blank and nothing said Loading…").toEqual([]);

    expect(document.contains(box), "the box being typed in is still the same box").toBe(true);
    expect(box.value, "it keeps its text").toBe("half-typed words");
    expect(document.activeElement, "it keeps the cursor").toBe(box);
    expect([box.selectionStart, box.selectionEnd], "the cursor is where it was").toEqual([4, 4]);

    expect(shown(container), "the selection of two thoughts survives").toContain("2 selected");
  });

  it(`${CHECK_SWITCH}`, async () => {
    await openCompass();
    await showThoughtLog();
    await click(allNamed("Select thought")[0] ?? null, "the first thought's checkbox");
    await click(allNamed("Select thought")[1] ?? null, "the second thought's checkbox");
    expect(shown(container), "harness: two thoughts are selected").toContain("2 selected");
    const box = await openAddBox(THOUGHT_ADD, THOUGHT_PLACEHOLDER);
    await type(box, "half a thought");

    await click(named("Switch to Garden"), "the Garden pill");
    const switched = await waitFor(() => shown(container).includes("Water the plants"), 3000);
    expect(switched, "harness: the Garden project opened").toBe(true);

    expect(shown(container), "no selection carries across").not.toMatch(/\d+ selected/);
    const ticked = allNamed("Select thought").filter(
      (el) => (el as HTMLInputElement).checked === true || el.getAttribute("aria-checked") === "true" || el.getAttribute("aria-pressed") === "true",
    );
    expect(ticked.length, "no thought is ticked in the other project").toBe(0);
    expect(fieldHolding("half a thought"), "the half-typed thought does not carry across").toBeNull();
    expect(shown(container), "the Lighthouse thoughts are gone").not.toContain("First idea");
  });

  it(`${CHECK_SUCCESS}`, async () => {
    await openCompass();
    await savedElsewhere(renameOnServer("p1", "Harbor"));
    fake.seed("daily_tasks", [taskRow("t9", "p1", "Added on the laptop", 5)]);

    await click(rowControl("Write the intro", "Mark task complete"), "the first task's check");
    await pass(5000);

    expect(
      fake.rows("daily_tasks").find((r) => r.id === "t1")?.is_done,
      "harness: the tick was saved",
    ).toBe(true);
    expect(noteText(), "nothing failed, no note").toBe("");
    expect(shown(sidebar()), "the sidebar was not refreshed").toContain("Lighthouse");
    expect(shown(sidebar()), "the sidebar was not refreshed").not.toContain("Harbor");
    expect(shown(card("task")), "the cards were not refreshed").not.toContain("Added on the laptop");
    expect(
      nameOf(rowControl("Write the intro", /^Mark task (complete|incomplete)$/) ?? container),
      "the tick stays as the person made it",
    ).toBe("Mark task incomplete");
  });

  it(`${CHECK_OFFLINE}`, async () => {
    await openCompass();
    const box = await openAddBox(TASK_ADD, TASK_PLACEHOLDER);
    await type(box, "words to keep");

    const watch = watchForBlanking();
    await act(async () => {
      goOffline();
    });
    await click(rowControl("Write the intro", "Mark task complete"), "the first task's check");
    await pass(1000);
    expect(noteText(), "harness: the save failed and the note shows").not.toBe("");
    await pass(5000);
    const blanking = watch.stop();

    expect(shown(container), 'no "Couldn\'t load this project just now."').not.toContain(LOAD_FAILED);
    expect(shown(container), "no gate error either").not.toContain(GATE_FAILED);
    expect(blanking, "nothing went blank and nothing said Loading…").toEqual([]);
    expect(shown(card("task")), "the task list stays as it is").toContain("Call the printer");
    expect(shown(card("task")), "the task list stays as it is").toContain("Write the intro");
    expect(shown(card("timeline")), "the timeline stays as it is").toContain("Sketch the screens");
    expect(shown(card("learning")), "the learning card stays as it is").toContain("React basics");
    expect(shown(sidebar()), "the sidebar stays as it is").toContain("Lighthouse");
    expect(shown(sidebar()), "the sidebar stays as it is").toContain("Garden");
    expect(fieldWithPlaceholder(TASK_PLACEHOLDER)?.value, "the open box keeps its words").toBe("words to keep");

    await savedElsewhere(renameOnServer("p1", "Harbor"));

    await act(async () => {
      goOnline();
    });
    const caughtUp = await waitFor(() => shown(sidebar()).includes("Harbor"), 60_000, 500);

    expect(caughtUp, "once the connection returns, the sidebar shows the saved name by itself").toBe(true);
    expect(
      nameOf(rowControl("Write the intro", /^Mark task (complete|incomplete)$/) ?? container),
      "the task whose tick failed shows as saved: not done",
    ).toBe("Mark task complete");
    expect(fieldWithPlaceholder(TASK_PLACEHOLDER)?.value, "the open box still keeps its words").toBe("words to keep");
  });
});

describe("a failed edit to a task's or thought's text reopens with the words typed", () => {
  it(`${CHECK_TEXT_EDIT} — a task`, async () => {
    await openCompass();
    const editor = await openEditor("Write the intro", card("task"));
    await type(editor, "Write the whole intro", { replace: true });
    fake.failNext("daily_tasks", "update");
    const release = fake.holdNext("daily_tasks", "update");
    await pressEnter(editor);

    const box = await openAddBox(TASK_ADD, TASK_PLACEHOLDER);
    await type(box, "next thing");
    expect(document.activeElement, "harness: the person is typing in the add box").toBe(box);

    await act(async () => {
      release();
    });
    await waitFor(() => fieldHolding("Write the whole intro") !== null, 3000);
    await pass(1000);

    expect(
      fake.requests.some((r) => r.table === "daily_tasks" && r.operation === "update" && r.error !== null),
      "harness: the edit's save failed",
    ).toBe(true);
    const reopened = fieldHolding("Write the whole intro");
    expect(reopened, "the task reopens for editing with exactly the words typed").not.toBeNull();
    expect(reopened, "…in its own box, not the add box").not.toBe(box);
    expect(document.activeElement, "the cursor stays where the person is").toBe(box);
    expect(box.value, "and what they were typing there is intact").toBe("next thing");
  });

  it(`${CHECK_TEXT_EDIT} — a thought`, async () => {
    await openCompass();
    await showThoughtLog();
    const editor = await openEditor("First idea", card("task"));
    await type(editor, "First idea, refined", { replace: true });
    fake.failNext("thoughts", "update");
    const release = fake.holdNext("thoughts", "update");
    await pressEnter(editor);

    const box = await openAddBox(THOUGHT_ADD, THOUGHT_PLACEHOLDER);
    await type(box, "another thought");
    expect(document.activeElement, "harness: the person is typing in the thought box").toBe(box);

    await act(async () => {
      release();
    });
    await waitFor(() => fieldHolding("First idea, refined") !== null, 3000);
    await pass(1000);

    expect(
      fake.requests.some((r) => r.table === "thoughts" && r.operation === "update" && r.error !== null),
      "harness: the edit's save failed",
    ).toBe(true);
    const reopened = fieldHolding("First idea, refined");
    expect(reopened, "the thought reopens for editing with exactly the words typed").not.toBeNull();
    expect(reopened, "…in its own box, not the add box").not.toBe(box);
    expect(document.activeElement, "the cursor stays where the person is").toBe(box);
    expect(box.value, "and what they were typing there is intact").toBe("another thought");
  });
});

describe("a failed edit to a name or title shows the saved version", () => {
  async function failedRename(
    scope: () => Element | null,
    saved: string,
    typed: string,
    table: string,
    shownWhileWaiting = true,
  ): Promise<void> {
    const editor = await openEditor(saved, scope());
    await type(editor, typed, { replace: true });
    fake.failNext(table, "update");
    const release = fake.holdNext(table, "update");
    await pressEnter(editor);
    if (shownWhileWaiting) {
      expect(
        shown(scope()).includes(typed) || fieldHolding(typed) !== null,
        "harness: before the save answers, the new name is on screen (as text or in its field)",
      ).toBe(true);
    }
    await act(async () => {
      release();
    });
    await waitFor(() => noteText() !== "", 2000);
    await pass(1500);
    expect(
      fake.requests.some((r) => r.table === table && r.operation === "update" && r.error !== null),
      `harness: the ${table} rename's save failed`,
    ).toBe(true);
    expect(shown(scope()), "the saved version shows").toContain(saved);
    expect(shown(scope()), "not the version whose save failed").not.toContain(typed);
    expect(fieldHolding(typed), "and the failed version is not left open").toBeNull();
  }

  it(`${CHECK_NAME_EDIT} — a phase name`, async () => {
    await openCompass();
    await failedRename(() => card("timeline"), "Sketch the screens", "Sketch everything", "phases");
  });

  it(`${CHECK_NAME_EDIT} — a learning item's name`, async () => {
    await openCompass();
    await failedRename(() => card("learning"), "React basics", "React hooks", "learning_items");
  });

  it(`${CHECK_NAME_EDIT} — a thought group's name`, async () => {
    await openCompass();
    await showThoughtLog();
    await failedRename(() => card("task"), "Launch notes", "Renamed group", "thought_groups", false);
  });

  it(`${CHECK_NAME_EDIT} — a thought's title`, async () => {
    await openCompass();
    await showThoughtLog();
    const titles = allNamed("Click to edit title", card("task") ?? container);
    await click(titles[0] ?? null, "the first thought's title");
    const editor = activeField() ?? fieldWithPlaceholder("Add a title…");
    expect(editor, "harness: the title field").not.toBeNull();
    await type(editor!, "A title that failed", { replace: true });
    fake.failNext("thoughts", "update");
    const release = fake.holdNext("thoughts", "update");
    await pressEnter(editor!);
    expect(shown(card("task")), "harness: before the save answers, the new title is on screen").toContain("A title that failed");
    await act(async () => {
      release();
    });
    await waitFor(() => noteText() !== "", 2000);
    await pass(1500);

    expect(
      fake.requests.some((r) => r.table === "thoughts" && r.operation === "update" && r.error !== null),
      "harness: the title's save failed",
    ).toBe(true);
    expect(shown(card("task")), "the saved version shows: no title").not.toContain("A title that failed");
    expect(fieldHolding("A title that failed"), "and the failed title is not left open").toBeNull();
    expect(shown(card("task")), "the thought itself is still there").toContain("First idea");
  });
});
