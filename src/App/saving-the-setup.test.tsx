import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeRow, type FakeSupabase } from "../lib/fakeSupabase";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_OPENS =
  'A setup that saves opens its dashboard showing what was entered, from first run and from "+ New project" alike: the name without its outer spaces, as the last project in the sidebar, with a color dot no other live project has while such a color is free; the Commitment card reading "Day 1 / N · Goal Xh" on the day of setup at any hour, N being the phases\' days added up and X the hours per day entered; the phases in the order entered, with their days; the learning items in the order entered, each at its level\'s starting progress (10, 30, 50, 65 or 80%), the first one as the focus';
const CHECK_NOT_KEPT =
  'When a setup is not saved — the database refuses any part of it, or the connection drops before it is done — none of it is kept: no new project in the sidebar, none after a reload, and a first-run setup still offers no "← Back"';
const CHECK_RETRY =
  "After a setup is not saved, the button reads \"Open my dashboard →\" and can be pressed again, every answer is still on screen as typed, and the note \"Couldn't save just now — try again in a moment.\" shows; pressing again saves the answers as they now stand";
const CHECK_SAVING = 'While a setup is saving, the button reads "Opening…" for as long as the save takes, and a second press adds nothing';
const CHECK_LOST =
  'When a setup was saved but its reply never arrived, the screen shows the same as after a failure; pressing "Open my dashboard →" again opens the project already saved, as first saved even if an answer was changed in between, and the sidebar holds that one project, not two. A reload instead shows that same one project';
const CHECK_EACH_VISIT =
  'Each visit to the setup screen makes its own project: after one setup opens, "+ New project" with the very same answers makes a second project';
const CHECK_ROUND =
  "A day count typed with a fraction is rounded up to a whole day and the setup opens: a phase of 2.5 days shows as 3d and one of 0.5 days as 1d, and a project length of 2.5 days does not stop the setup from opening";

const OPEN = "Open my dashboard →";
const OPENING = "Opening…";
const NOTE = "Couldn't save just now — try again in a moment.";
const NOTE_START = "Couldn't save just now";
const BACK = "← Back";

const net = vi.hoisted(() => {
  const whole = (v: unknown) => typeof v !== "number" || Number.isInteger(v);
  return {
    server: null as { client: unknown; failNext: (table: string, op: "rpc", failure: { code: string; message: string }) => void } | null,
    fractionalDays(args: unknown): unknown {
      const a = (args ?? {}) as { p_total_days?: unknown; p_phases?: Array<{ est_days?: unknown }> };
      if (!whole(a.p_total_days)) return a.p_total_days;
      const phase = (Array.isArray(a.p_phases) ? a.p_phases : []).find((p) => !whole(p?.est_days));
      return phase ? phase.est_days : null;
    },
  };
});

vi.mock("../lib/supabase", () => ({
  getSupabase: () =>
    new Proxy(
      {},
      {
        get(_target, key) {
          const server = net.server!;
          const client = server.client as Record<string | symbol, unknown>;
          if (key === "rpc") {
            return (fn: string, args?: unknown, ...rest: unknown[]) => {
              const fraction = fn === "save_interview" ? net.fractionalDays(args) : null;
              if (fraction !== null) {
                server.failNext("save_interview", "rpc", { code: "22P02", message: `invalid input syntax for type integer: "${String(fraction)}"` });
              }
              return (client.rpc as (...a: unknown[]) => unknown).call(client, fn, args, ...rest);
            };
          }
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

function projectRow(id: string, name: string, sortOrder: number, color: string): FakeRow {
  return {
    id,
    user_id: USER.id,
    name,
    accent_color: color,
    sort_order: sortOrder,
    archived_at: null,
    total_days: 90,
    hours_planned_per_day: 4,
    hours_available_per_day: 6,
    started_at: "2026-09-20",
    created_at: CREATED,
  };
}
function phaseRow(id: string, projectId: string, name: string, sortOrder: number, days: number): FakeRow {
  return { id, user_id: USER.id, project_id: projectId, name, est_days: days, sort_order: sortOrder, is_done: false, completed_at: null, created_at: CREATED };
}
function learningRow(id: string, projectId: string, name: string, sortOrder: number, pct: number, focus: boolean): FakeRow {
  return { id, user_id: USER.id, project_id: projectId, name, sort_order: sortOrder, progress_pct: pct, is_focus: focus, created_at: CREATED };
}

function nothingSaved(): Record<string, FakeRow[]> {
  return { projects: [], phases: [], learning_items: [], daily_tasks: [], thoughts: [], thought_groups: [], time_sessions: [] };
}
const SAVED_NAMES = ["Lighthouse", "Garden", "Workshop"];
const SAVED_COLORS = ["#9A7B4F", "#7BC8B2", "#B8A9C9"];
function threeProjects(): Record<string, FakeRow[]> {
  return {
    projects: SAVED_NAMES.map((name, i) => projectRow(`p${i + 1}`, name, i, SAVED_COLORS[i])),
    phases: [phaseRow("ph1", "p1", "Sketch the screens", 0, 5), phaseRow("ph2", "p2", "Plant seeds", 0, 4), phaseRow("ph3", "p3", "Clear the bench", 0, 2)],
    learning_items: [learningRow("li1", "p1", "React basics", 0, 30, true), learningRow("li2", "p2", "Soil types", 0, 20, true), learningRow("li3", "p3", "Joinery", 0, 10, true)],
    daily_tasks: [],
    thoughts: [],
    thought_groups: [],
    time_sessions: [],
  };
}

type Answers = {
  name: string;
  planned: string;
  available: string;
  days: string;
  phases: Array<[name: string, days: string]>;
  learn: Array<[name: string, level: string]>;
};

const HARBOR: Answers = {
  name: "   Harbor Lights  ",
  planned: "2.5",
  available: "4",
  days: "45",
  phases: [
    ["Research the harbor", "3"],
    ["Build the lamp", "5"],
    ["Launch night", "2"],
  ],
  learn: [
    ["Soldering", "Confident · ~65%"],
    ["Lens optics", "Beginner · ~10%"],
    ["Wiring", "Almost fluent · ~80%"],
    ["Permits", "Some basics · ~30%"],
    ["Marketing", "Comfortable · ~50%"],
  ],
};
const HARBOR_NAME = "Harbor Lights";
const HARBOR_EYEBROW = "Day 1 / 10 · Goal 2.5h";
const HARBOR_PHASES = [
  ["Research the harbor", "3d"],
  ["Build the lamp", "5d"],
  ["Launch night", "2d"],
];
const HARBOR_LEARNING = [
  ["Soldering", "65%", "focus"],
  ["Lens optics", "10%", ""],
  ["Wiring", "80%", ""],
  ["Permits", "30%", ""],
  ["Marketing", "50%", ""],
];

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

let fake: FakeSupabase;
let container: HTMLDivElement;
let root: Root | null = null;

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

async function mountApp(activeId?: string): Promise<void> {
  vi.resetModules();
  const db = await import("../lib/db");
  db.__setTestUser(USER);
  if (activeId) await db.setActiveProject(activeId);
  const { default: App } = await import("../App");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<App />);
  });
  const ready = await waitFor(() => onInterview() || onDashboardReady(), 5000);
  expect(ready, `harness: the app opened (screen: ${shown(container).slice(0, 300)})`).toBe(true);
}

async function openFirstRun(): Promise<void> {
  fake = createFakeSupabase(nothingSaved());
  net.server = fake;
  await mountApp();
  expect(onInterview(), "harness: the first run opens the setup").toBe(true);
}

async function openWithProjects(): Promise<void> {
  fake = createFakeSupabase(threeProjects());
  net.server = fake;
  await mountApp("p1");
  const ready = await waitFor(() => onDashboardReady() && pillNames().length === 3, 5000);
  expect(ready, `harness: the dashboard opened on three projects (screen: ${shown(container).slice(0, 300)})`).toBe(true);
}

async function reload(): Promise<void> {
  await act(async () => {
    root!.unmount();
  });
  root = null;
  container.remove();
  await mountApp();
  await pass(1000);
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

function onInterview(): boolean {
  return container.querySelector(".setup") !== null;
}
function onDashboardReady(): boolean {
  return container.querySelector(".sidebar") !== null && !onInterview() && eyebrow("time") !== "";
}

function sidebar(): Element | null {
  return container.querySelector(".sidebar");
}
function pillEls(): HTMLElement[] {
  return Array.from(sidebar()?.querySelectorAll<HTMLElement>(".project-pill") ?? []).filter(
    (p) => !p.classList.contains("new-pill") && !shown(p).includes("New project"),
  );
}
function pillNames(): string[] {
  return pillEls().map((p) => p.querySelector(".pill-name")?.textContent ?? `? ${shown(p)}`);
}
function pillColors(): string[] {
  return pillEls().map((p) => p.style.getPropertyValue("--pill-accent").trim().toUpperCase());
}

function eyebrow(kind: "time" | "timeline" | "learning"): string {
  return tidy(container.querySelector(`.bubble-${kind} .glance-eyebrow`)?.textContent);
}
function hero(kind: "time" | "timeline" | "learning"): string {
  return tidy(container.querySelector(`.bubble-${kind} .glance-hero`)?.textContent);
}

async function showDepth(): Promise<void> {
  if (container.querySelector(".bubble-timeline .row")) return;
  await click(container.querySelector(".bubble-timeline"), "the Timeline card, to open its depth");
  await settle();
}
function timelineRows(): string[][] {
  return Array.from(container.querySelectorAll(".bubble-timeline .row")).map((row) => [
    tidy(row.querySelector(".row-name")?.textContent),
    tidy(row.querySelector(".ph-days")?.textContent),
  ]);
}
function learningRows(): string[][] {
  return Array.from(container.querySelectorAll(".bubble-learning .row")).map((row) => [
    tidy(row.querySelector(".row-name")?.textContent),
    tidy(row.querySelector(".lr-pct")?.textContent),
    tidy(row.querySelector(".focus-tag")?.textContent),
  ]);
}

function noteText(): string {
  const all = Array.from(document.body.querySelectorAll<HTMLElement>("*")).filter(
    (el) => !["SCRIPT", "STYLE", "TEXTAREA"].includes(el.tagName) && tidy(el.textContent).includes(NOTE_START),
  );
  const el = all.find((e) => !Array.from(e.children).some((child) => tidy(child.textContent).includes(NOTE_START)));
  return el ? tidy(el.textContent) : "";
}

function projectNameBox(): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>('input[placeholder="Name this project"]');
}
function boxFor(question: string): HTMLInputElement | null {
  const label = Array.from(container.querySelectorAll("label")).find((l) => tidy(l.textContent).startsWith(question));
  return (label?.control as HTMLInputElement | null | undefined) ?? null;
}
const plannedBox = () => boxFor("How many hours would you like to spend on it each day?");
const availableBox = () => boxFor("How much time do you actually have available each day?");
const daysBox = () => boxFor("How long do you think this project will take?");

function section(title: string): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLElement>(".setup section")).find((s) => tidy(s.querySelector("h2")?.textContent) === title) ??
    null
  );
}
function rowsOf(title: string): HTMLElement[] {
  return Array.from(section(title)?.querySelectorAll<HTMLElement>(".row") ?? []);
}
function buttonReading(text: string, scope: ParentNode = container): HTMLButtonElement | null {
  return Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find((b) => tidy(b.textContent) === text) ?? null;
}
function cta(): HTMLButtonElement | null {
  return buttonReading(OPEN) ?? buttonReading(OPENING);
}
function newProjectButton(): HTMLElement | null {
  return Array.from(sidebar()?.querySelectorAll<HTMLElement>("button") ?? []).find((b) => shown(b).includes("New project")) ?? null;
}

function answersOnScreen(): Answers {
  const selected = (s: HTMLSelectElement | null) => (s ? tidy(s.options[s.selectedIndex]?.textContent) : "(no level box)");
  return {
    name: projectNameBox()?.value ?? "(no name box)",
    planned: plannedBox()?.value ?? "(no box)",
    available: availableBox()?.value ?? "(no box)",
    days: daysBox()?.value ?? "(no box)",
    phases: rowsOf("Timeline").map((row) => [
      row.querySelector<HTMLInputElement>('input[type="text"]')?.value ?? "(no name box)",
      row.querySelector<HTMLInputElement>('input[type="number"]')?.value ?? "(no days box)",
    ]),
    learn: rowsOf("Learning").map((row) => [
      row.querySelector<HTMLInputElement>('input[type="text"]')?.value ?? "(no name box)",
      selected(row.querySelector("select")),
    ]),
  };
}

async function click(el: Element | null, what: string): Promise<void> {
  expect(el, `harness: ${what} (screen: ${shown(container).slice(0, 300)})`).not.toBeNull();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

function setNativeValue(field: Field, value: string): void {
  const proto =
    field instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

async function type(field: Field | null, value: string, what: string): Promise<void> {
  expect(field, `harness: ${what}`).not.toBeNull();
  await act(async () => {
    field!.focus();
    setNativeValue(field!, value);
  });
}

async function chooseLevel(select: HTMLSelectElement | null, optionText: string, what: string): Promise<void> {
  expect(select, `harness: ${what}`).not.toBeNull();
  const option = Array.from(select!.options).find((o) => tidy(o.textContent) === optionText);
  expect(option, `harness: the level "${optionText}"`).toBeTruthy();
  await act(async () => {
    setNativeValue(select!, option!.value);
  });
}

async function fill(a: Answers): Promise<void> {
  await type(projectNameBox(), a.name, 'the box "Name this project"');
  await type(plannedBox(), a.planned, "the hours-per-day box");
  await type(availableBox(), a.available, "the hours-available box");
  await type(daysBox(), a.days, "the project-length box");
  while (rowsOf("Timeline").length < a.phases.length) await click(buttonReading("+ Add a phase"), '"+ Add a phase"');
  for (const [i, [name, days]] of a.phases.entries()) {
    const row = rowsOf("Timeline")[i];
    await type(row.querySelector<HTMLInputElement>('input[type="text"]'), name, `phase row ${i + 1}'s name`);
    await type(row.querySelector<HTMLInputElement>('input[type="number"]'), days, `phase row ${i + 1}'s days`);
  }
  while (rowsOf("Learning").length < a.learn.length) await click(buttonReading("+ Add something to learn"), '"+ Add something to learn"');
  for (const [i, [name, level]] of a.learn.entries()) {
    const row = rowsOf("Learning")[i];
    await type(row.querySelector<HTMLInputElement>('input[type="text"]'), name, `learning row ${i + 1}'s name`);
    await chooseLevel(row.querySelector("select"), level, `learning row ${i + 1}'s level`);
  }
  await settle(2);
  expect(answersOnScreen(), "harness: the answers read back as typed").toEqual(a);
}

async function pressOpen(): Promise<void> {
  const button = buttonReading(OPEN);
  expect(button, `harness: the button reads "${OPEN}"`).not.toBeNull();
  expect(button!.disabled, "harness: every step is complete, so the button can be pressed").toBe(false);
  await click(button, `"${OPEN}"`);
}

async function dashboardOf(name: string, ms = 5000): Promise<boolean> {
  return waitFor(() => onDashboardReady() && pillNames().includes(name), ms);
}

async function openNewProject(): Promise<void> {
  await click(newProjectButton(), 'the "+ New project" pill');
  const opened = await waitFor(onInterview, 2000);
  expect(opened, 'harness: "+ New project" opened the setup').toBe(true);
}

function stored(table: string): FakeRow[] {
  return fake.rows(table);
}
function storedNames(table: string): string[] {
  return stored(table).map((r) => String(r.name));
}
function setupCalls(): Array<{ error: unknown }> {
  return fake.requests.filter((r) => r.table === "save_interview" && r.operation === "rpc");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(new Date(2026, 8, 22, 10, 0, 0));
  localStorage.clear();
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
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("a setup that saves opens its dashboard", () => {
  async function expectHarborDashboard(otherPills: string[]): Promise<void> {
    expect(pillNames(), "the name without its outer spaces, as the last project in the sidebar").toEqual([...otherPills, HARBOR_NAME]);
    const colors = pillColors();
    const mine = colors[colors.length - 1];
    expect(mine, "the new project's pill has a color dot").not.toBe("");
    expect(colors.slice(0, -1), "a color dot no other live project has").not.toContain(mine);
    expect(eyebrow("time").toLowerCase(), 'the Commitment card reads "Day 1 / N · Goal Xh": N = 3 + 5 + 2, X = 2.5').toBe(HARBOR_EYEBROW.toLowerCase());
    expect(eyebrow("learning"), "the focus is the first learning item, at 65%").toBe("65% · Focus");
    expect(hero("learning"), "the focus is the first learning item").toBe("Soldering");
    await showDepth();
    expect(timelineRows(), "the phases in the order entered, with their days").toEqual(HARBOR_PHASES);
    expect(learningRows(), "the learning items in the order entered, each at its level's progress, the first one the focus").toEqual(HARBOR_LEARNING);
  }

  it(`${CHECK_OPENS} — from first run, at 23:40`, async () => {
    vi.setSystemTime(new Date(2026, 8, 22, 23, 40, 0));
    await openFirstRun();
    await fill(HARBOR);
    await pressOpen();

    const opened = await dashboardOf(HARBOR_NAME);
    expect(opened, `the setup opens its dashboard (screen: ${shown(container).slice(0, 300)})`).toBe(true);
    await expectHarborDashboard([]);
  });

  it(`${CHECK_OPENS} — from "+ New project", at 17:05, beside three live projects`, async () => {
    vi.setSystemTime(new Date(2026, 8, 22, 17, 5, 0));
    await openWithProjects();
    expect(pillColors(), "harness: the three saved pills show their colors").toEqual(SAVED_COLORS);
    await openNewProject();
    await fill(HARBOR);
    await pressOpen();

    const opened = await dashboardOf(HARBOR_NAME);
    expect(opened, `the setup opens its dashboard (screen: ${shown(container).slice(0, 300)})`).toBe(true);
    await expectHarborDashboard(SAVED_NAMES);
  });
});

describe("a setup that is not saved keeps nothing", () => {
  it(`${CHECK_NOT_KEPT} — the database refuses it, on first run`, async () => {
    await openFirstRun();
    expect(buttonReading(BACK), 'harness: a first-run setup offers no "← Back"').toBeNull();
    await fill(HARBOR);
    fake.failNext("save_interview", "rpc", {
      code: "23514",
      message: 'new row for relation "learning_items" violates check constraint "learning_items_progress_pct_check"',
    });
    await pressOpen();
    await pass(6000);

    expect(storedNames("projects"), "none of it is kept: no project").toEqual([]);
    expect(storedNames("phases"), "none of it is kept: no phases").toEqual([]);
    expect(storedNames("learning_items"), "none of it is kept: no learning items").toEqual([]);
    expect(onInterview(), "no new project: the setup is still on screen").toBe(true);
    expect(pillNames(), "no new project in the sidebar").toEqual([]);
    expect(buttonReading(BACK), 'a first-run setup still offers no "← Back"').toBeNull();

    await reload();
    expect(onInterview(), "none after a reload: the first-run setup opens again").toBe(true);
    expect(pillNames(), "none after a reload: no project in the sidebar").toEqual([]);
    expect(buttonReading(BACK), 'after the reload, still no "← Back"').toBeNull();

    expect(setupCalls().some((r) => r.error !== null), "harness: the setup reached the database and was refused").toBe(true);
  });

  it(`${CHECK_NOT_KEPT} — the connection drops, from "+ New project"`, async () => {
    await openWithProjects();
    await openNewProject();
    await fill(HARBOR);
    fake.failNext("save_interview", "rpc");
    await pressOpen();
    await pass(6000);

    expect(storedNames("projects"), "none of it is kept: only the three projects already saved").toEqual(SAVED_NAMES);
    expect(storedNames("phases"), "none of it is kept: only the phases already saved").toEqual(["Sketch the screens", "Plant seeds", "Clear the bench"]);
    expect(storedNames("learning_items"), "none of it is kept: only the learning items already saved").toEqual(["React basics", "Soil types", "Joinery"]);
    expect(onInterview(), "harness: the setup is still on screen").toBe(true);

    await click(buttonReading(BACK), '"← Back"');
    await waitFor(onDashboardReady, 3000);
    expect(pillNames(), "no new project in the sidebar").toEqual(SAVED_NAMES);

    await reload();
    await waitFor(() => onDashboardReady() && pillNames().length > 0, 3000);
    expect(pillNames(), "none after a reload").toEqual(SAVED_NAMES);

    expect(setupCalls().some((r) => r.error !== null), "harness: the setup was sent and its connection dropped").toBe(true);
  });
});

describe("after a setup is not saved", () => {
  it(`${CHECK_RETRY} — the note shows, the answers survive the quiet refresh, and pressing again saves them as they now stand`, async () => {
    vi.setSystemTime(new Date(2026, 8, 22, 21, 15, 0));
    await openFirstRun();
    await fill(HARBOR);
    fake.failNext("save_interview", "rpc");
    await pressOpen();
    await waitFor(() => noteText() !== "", 2000);

    expect(noteText(), "the note shows").toBe(NOTE);
    await pass(2000);
    expect(onInterview(), "the setup is still on screen").toBe(true);
    expect(tidy(cta()?.textContent), 'the button reads "Open my dashboard →"').toBe(OPEN);
    expect(cta()?.disabled, "and can be pressed again").toBe(false);
    expect(answersOnScreen(), "every answer is still on screen as typed").toEqual(HARBOR);

    await type(projectNameBox(), "Harbor Lights, take two", 'the box "Name this project"');
    await type(rowsOf("Timeline")[1]?.querySelector<HTMLInputElement>('input[type="number"]') ?? null, "6", "phase row 2's days");
    await pressOpen();

    const opened = await dashboardOf("Harbor Lights, take two");
    expect(opened, `pressing again saves and opens the setup (screen: ${shown(container).slice(0, 300)})`).toBe(true);
    expect(pillNames(), "it saves the name as it now stands").toEqual(["Harbor Lights, take two"]);
    expect(eyebrow("time").toLowerCase(), "and the days as they now stand: N = 3 + 6 + 2").toBe("Day 1 / 11 · Goal 2.5h".toLowerCase());
    await showDepth();
    expect(timelineRows(), "the phases as they now stand").toEqual([
      ["Research the harbor", "3d"],
      ["Build the lamp", "6d"],
      ["Launch night", "2d"],
    ]);
    expect(storedNames("projects"), "one project saved").toEqual(["Harbor Lights, take two"]);
  });
});

describe("while a setup is saving", () => {
  it(`${CHECK_SAVING}`, async () => {
    await openFirstRun();
    await fill(HARBOR);
    const release = fake.holdNext("save_interview", "rpc");
    await pressOpen();

    await pass(60_000, 5_000);
    expect(tidy(cta()?.textContent), 'a minute in, the button reads "Opening…"').toBe(OPENING);

    await click(cta(), "the setup's button, pressed again");
    await pass(10 * 60_000, 10_000);
    expect(tidy(cta()?.textContent), 'eleven minutes in, the button still reads "Opening…"').toBe(OPENING);
    expect(noteText(), "no failure is declared while the save is under way").toBe("");

    await act(async () => {
      release();
    });
    const opened = await dashboardOf(HARBOR_NAME);
    expect(opened, `once the save answers, the setup opens (screen: ${shown(container).slice(0, 300)})`).toBe(true);
    await pass(2000);

    expect(pillNames(), "a second press adds nothing: one project in the sidebar").toEqual([HARBOR_NAME]);
    expect(stored("projects").length, "a second press adds nothing: one project saved").toBe(1);
    expect(stored("phases").length, "a second press adds nothing: its three phases, once").toBe(3);
    expect(stored("learning_items").length, "a second press adds nothing: its five learning items, once").toBe(5);
  });
});

describe("a setup saved whose reply never arrived", () => {
  async function saveAndLoseTheReply(): Promise<void> {
    await openWithProjects();
    await openNewProject();
    await fill(HARBOR);
    fake.loseReplyNext("save_interview", "rpc");
    await pressOpen();
    await waitFor(() => noteText() !== "", 2000);
  }

  it(`${CHECK_LOST} — pressing again opens the project already saved, as first saved`, async () => {
    vi.setSystemTime(new Date(2026, 8, 22, 19, 30, 0));
    await saveAndLoseTheReply();

    expect(noteText(), "the screen shows the same as after a failure: the note").toBe(NOTE);
    await pass(2000);
    expect(onInterview(), "the same as after a failure: the setup is still on screen").toBe(true);
    expect(tidy(cta()?.textContent), 'the same as after a failure: the button reads "Open my dashboard →"').toBe(OPEN);
    expect(cta()?.disabled, "the same as after a failure: it can be pressed").toBe(false);
    expect(answersOnScreen(), "the same as after a failure: every answer as typed").toEqual(HARBOR);

    await type(projectNameBox(), "Harbor Lights, renamed", 'the box "Name this project"');
    await type(rowsOf("Timeline")[0]?.querySelector<HTMLInputElement>('input[type="number"]') ?? null, "9", "phase row 1's days");
    await pressOpen();

    const opened = await dashboardOf(HARBOR_NAME);
    expect(opened, `pressing again opens the project already saved (screen: ${shown(container).slice(0, 300)})`).toBe(true);
    await pass(1000);
    expect(pillNames(), "the sidebar holds that one project, not two, as first saved").toEqual([...SAVED_NAMES, HARBOR_NAME]);
    expect(eyebrow("time").toLowerCase(), "the project as first saved: N = 3 + 5 + 2").toBe(HARBOR_EYEBROW.toLowerCase());
    await showDepth();
    expect(timelineRows(), "its phases as first saved").toEqual(HARBOR_PHASES);
    expect(storedNames("projects"), "one project saved, not two").toEqual([...SAVED_NAMES, HARBOR_NAME]);
  });

  it(`${CHECK_LOST} — a reload instead shows that same one project`, async () => {
    await saveAndLoseTheReply();
    await pass(2000);
    expect(onInterview(), "before the reload, the screen shows the same as after a failure: the setup is still on screen").toBe(true);

    await reload();
    await waitFor(() => onDashboardReady() && pillNames().length > 3, 3000);
    expect(pillNames(), "a reload shows that same one project, once").toEqual([...SAVED_NAMES, HARBOR_NAME]);
    expect(storedNames("projects"), "one project saved").toEqual([...SAVED_NAMES, HARBOR_NAME]);
  });
});

describe("each visit to the setup", () => {
  it(`${CHECK_EACH_VISIT}`, async () => {
    await openFirstRun();
    await fill(HARBOR);
    await pressOpen();
    const first = await dashboardOf(HARBOR_NAME);
    expect(first, "harness: the first setup opened").toBe(true);

    await openNewProject();
    await fill(HARBOR);
    await pressOpen();
    const second = await waitFor(() => onDashboardReady() && pillNames().length === 2, 5000);

    expect(second, `the second setup opens too (screen: ${shown(container).slice(0, 300)})`).toBe(true);
    expect(pillNames(), "a second project, with the very same answers").toEqual([HARBOR_NAME, HARBOR_NAME]);
    expect(stored("projects").length, "two projects saved").toBe(2);
    expect(stored("phases").length, "each with its own three phases").toBe(6);
    expect(stored("learning_items").length, "each with its own five learning items").toBe(10);
  });
});

describe("a day count typed with a fraction", () => {
  it(`${CHECK_ROUND}`, async () => {
    await openFirstRun();
    await fill({
      name: "Workbench",
      planned: "2",
      available: "3",
      days: "2.5",
      phases: [
        ["Sketch", "2.5"],
        ["Polish", "0.5"],
      ],
      learn: [
        ["Sanding", "Beginner · ~10%"],
        ["Finishes", "Some basics · ~30%"],
      ],
    });
    await pressOpen();

    const opened = await dashboardOf("Workbench");
    expect(opened, `the setup opens (screen: ${shown(container).slice(0, 300)}; note: "${noteText()}")`).toBe(true);
    await showDepth();
    expect(timelineRows(), "a phase of 2.5 days shows as 3d and one of 0.5 days as 1d").toEqual([
      ["Sketch", "3d"],
      ["Polish", "1d"],
    ]);
    expect(stored("projects").map((r) => r.total_days), "a project length of 2.5 days is rounded up to 3").toEqual([3]);
  });
});
