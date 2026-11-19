import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setTestUser,
  addLearningItem,
  addPhase,
  addTask,
  addThought,
  groupThoughts,
  onWriteError,
  renameLearningItem,
  renamePhase,
  renameProject,
  renameThoughtGroup,
  reorderProjects,
  saveInterview,
  setActiveProject,
  updateTask,
  updateThought,
  type WriteFailure,
} from "../db";
import { createFakeSupabase, type FakeOperation, type FakeRow, type FakeSupabase } from "../fakeSupabase";

const holder = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("../supabase", () => ({
  getSupabase: () =>
    new Proxy(
      {},
      {
        get(_target, key) {
          const client = (holder.current as { client: Record<string | symbol, unknown> }).client;
          const member = client[key];
          return typeof member === "function" ? (member as (...args: unknown[]) => unknown).bind(client) : member;
        },
      },
    ),
}));

describe("a failed save's report", () => {
  let fake: FakeSupabase;
  let reports: WriteFailure[];
  let unsubscribe: () => void;

  beforeEach(async () => {
    fake = createFakeSupabase({
      projects: [{ id: "p1", name: "Lighthouse", archived_at: null, sort_order: 0 }],
      daily_tasks: [{ id: "t1", project_id: "p1", text: "Draft", is_done: false, sort_order: 0 }],
      thoughts: [
        { id: "a", project_id: "p1", group_id: null, title: "", text: "one", sort_order: 0 },
        { id: "b", project_id: "p1", group_id: null, title: "", text: "two", sort_order: 1 },
      ],
    });
    holder.current = fake;
    reports = [];
    unsubscribe = onWriteError((f) => reports.push(f));
    __setTestUser({ id: "u1", email: "owner@example.com" } as never);
    await setActiveProject("p1");
  });

  afterEach(() => {
    unsubscribe();
    vi.restoreAllMocks();
  });

  it("is one console line and one pair per listener: code and first line of the summary only", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fake.failNext("daily_tasks", "update", {
      code: "23514",
      message: 'new row for relation "daily_tasks" violates check constraint\nsecond line',
      details: "Failing row contains (SECRET)",
      hint: "SECRET hint",
    });
    expect(await updateTask("t1", { text: "SECRET" })).toBe(false);

    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]).toEqual([
      '[compass] a save failed: 23514 new row for relation "daily_tasks" violates check constraint',
    ]);
    expect(reports).toEqual([
      { code: "23514", message: 'new row for relation "daily_tasks" violates check constraint' },
    ]);
  });
});

describe("what a refused save lets out", () => {
  const CHECK_CONSOLE =
    "When a save is refused, the browser console shows only the error's code and one-line summary: text in the database's description of the refused row never appears there, by any route, a failed add included, nor in what the failed-save note is given";

  let fake: FakeSupabase;

  const PRIVATE = "I am scared the launch will fail and I will have to tell Mira";
  const HINT_MARK = "HINT-7f3a only-for-the-person";
  const SUMMARY = 'new row violates check constraint "length_check"';
  const REFUSAL = {
    code: "23514",
    message: SUMMARY,
    details: `Failing row contains (row-9, user-1, p1, null, ${PRIVATE}, 3, null, 2026-09-22 17:00:00+00).`,
    hint: `Shorten the value. ${HINT_MARK}`,
  };

  const USER = { id: "user-1", email: "founder@example.com" };
  const CREATED = "2026-07-21T17:00:00.000Z";

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

  function open(): void {
    fake = createFakeSupabase({
      projects: [projectRow("p1", "Lighthouse", 0), projectRow("p2", "Garden", 1)],
      phases: [
        { id: "ph1", user_id: USER.id, project_id: "p1", name: "Sketch the screens", est_days: 5, sort_order: 0, is_done: false, completed_at: null, created_at: CREATED },
      ],
      learning_items: [
        { id: "li1", user_id: USER.id, project_id: "p1", name: "React basics", sort_order: 0, progress_pct: 30, is_focus: true, created_at: CREATED },
      ],
      daily_tasks: [
        { id: "t1", user_id: USER.id, project_id: "p1", text: "Write the intro", is_done: false, sort_order: 0, task_date: "2026-09-20", phase_id: null, learning_item_id: null, created_at: CREATED },
      ],
      thoughts: [
        { id: "th1", user_id: USER.id, project_id: "p1", title: null, text: "First idea", sort_order: 0, group_id: null, created_at: CREATED },
      ],
      thought_groups: [
        { id: "g1", user_id: USER.id, project_id: "p1", name: "Launch notes", sort_order: 1, created_at: CREATED },
      ],
      time_sessions: [],
    });
    holder.current = fake;
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
      /* an object that cannot be turned into text still has properties */
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
  let spies: Spy[] = [];

  function printed(): string {
    return spies.flatMap((spy) => spy.mock.calls.map((args) => args.map((arg) => deepText(arg)).join(" "))).join("\n");
  }

  let reports: unknown[] = [];
  let unsubscribe: () => void = () => {};

  async function flush(): Promise<void> {
    for (let i = 0; i < 5; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  beforeEach(async () => {
    spies = CONSOLE_METHODS.map((method) => vi.spyOn(console, method).mockImplementation(() => undefined) as unknown as Spy);
    reports = [];
    unsubscribe = onWriteError((failure) => {
      reports.push(failure);
    });
    __setTestUser(USER);
    await setActiveProject("p1");
  });

  afterEach(() => {
    unsubscribe();
    for (const spy of spies) spy.mockRestore();
  });

  type Route = { name: string; table: string; operation: FakeOperation; run: () => Promise<unknown> };

  const ROUTES: Route[] = [
    { name: "an edit of a thought's text", table: "thoughts", operation: "update", run: () => updateThought("th1", { text: PRIVATE }) },
    { name: "an edit of a thought's title", table: "thoughts", operation: "update", run: () => updateThought("th1", { title: PRIVATE }) },
    { name: "an edit of a task's text", table: "daily_tasks", operation: "update", run: () => updateTask("t1", { text: PRIVATE }) },
    { name: "a project rename", table: "projects", operation: "update", run: () => renameProject(PRIVATE) },
    { name: "a pill reorder", table: "projects", operation: "update", run: () => reorderProjects(["p2", "p1"]) },
    { name: "a phase rename", table: "phases", operation: "update", run: () => renamePhase("ph1", PRIVATE) },
    { name: "a learning item rename", table: "learning_items", operation: "update", run: () => renameLearningItem("li1", PRIVATE) },
    { name: "a thought group rename", table: "thought_groups", operation: "update", run: () => renameThoughtGroup("g1", PRIVATE) },
    { name: "a failed add of a thought", table: "thoughts", operation: "insert", run: () => addThought(PRIVATE) },
    { name: "a failed add of a task", table: "daily_tasks", operation: "insert", run: () => addTask(PRIVATE) },
    { name: "a failed add of a phase", table: "phases", operation: "insert", run: () => addPhase(PRIVATE) },
    { name: "a failed add of a learning item", table: "learning_items", operation: "insert", run: () => addLearningItem(PRIVATE) },
    {
      name: "a failed setup from the interview",
      table: "save_interview",
      operation: "rpc",
      run: () =>
        saveInterview({
          setupId: "5a1f0c1e-0000-4000-8000-000000000015",
          projectName: PRIVATE,
          totalDays: 30,
          hoursPlannedPerDay: 2,
          hoursAvailablePerDay: 3,
          phases: [{ name: "First steps", estDays: 3 }],
          learn: [{ name: "Typing", level: 10 }],
        }),
    },
  ];

  it.each(ROUTES)(`${CHECK_CONSOLE} — $name`, async (route) => {
    open();
    fake.failNext(route.table, route.operation, REFUSAL);

    let rejected = false;
    let rejection: unknown = null;
    await route.run().catch((error: unknown) => {
      rejected = true;
      rejection = error;
    });
    await flush();

    expect(
      fake.requests.some((r) => r.table === route.table && r.operation === route.operation && r.error !== null),
      `harness: the ${route.table} ${route.operation} reached the database and was refused`,
    ).toBe(true);

    const out = printed();
    expect(out, "the console never shows the database's description of the refused row").not.toContain("Failing row contains");
    expect(out, "the console never shows the words the person typed").not.toContain(PRIVATE);
    expect(out, "the console shows only the code and summary — not the hint").not.toContain(HINT_MARK);
    expect(out, "the console shows the error's code").toContain(REFUSAL.code);
    expect(out, "the console shows the error's one-line summary").toContain(SUMMARY);

    expect(reports.length, "the failure reached the failed-save note").toBeGreaterThan(0);
    const given = reports.map((report) => deepText(report)).join("\n");
    expect(given, "the note is given nothing of the refused row").not.toContain("Failing row contains");
    expect(given, "the note is given none of the words typed").not.toContain(PRIVATE);
    expect(given, "the note is given nothing of the hint").not.toContain(HINT_MARK);

    if (rejected) {
      const handedBack = deepText(rejection);
      expect(handedBack, "the error handed back never carries the refused row").not.toContain("Failing row contains");
      expect(handedBack, "the error handed back never carries the words typed").not.toContain(PRIVATE);
      expect(handedBack, "the error handed back never carries the hint").not.toContain(HINT_MARK);
    }
  });
});

describe("what a failed setup prints", () => {
  const CHECK_LOG =
    "When a setup fails, the browser console shows one line with the error's code and short summary, and nothing typed in the setup";

  let fake: FakeSupabase;

  const USER = { id: "user-1", email: "founder@example.com" };

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
      started_at: "2026-07-21",
      created_at: "2026-07-21T17:00:00.000Z",
    };
  }

  const TYPED_PROJECT = "Mira's bakery, before I tell anyone";
  const TYPED_PHASE = "Pay back the loan from my sister";
  const TYPED_LEARNING = "How to talk about money without panicking";

  const SETUP = {
    setupId: "0f0e0d0c-0b0a-4908-8706-050403020115",
    projectName: `  ${TYPED_PROJECT}  `,
    totalDays: 30,
    hoursPlannedPerDay: 2,
    hoursAvailablePerDay: 3,
    phases: [{ name: TYPED_PHASE, estDays: 3 }],
    learn: [{ name: TYPED_LEARNING, level: 30 }],
  };

  const CODE = "23514";
  const SUMMARY = 'new row for relation "phases" violates check constraint "phases_est_days_check"';
  const REFUSAL = {
    code: CODE,
    message: SUMMARY,
    details: `Failing row contains (ph-9, user-1, p-9, ${TYPED_PHASE}, -1, 0, f, null, 2026-09-22 17:00:00+00).`,
    hint: `Check the project named ${TYPED_PROJECT} and ${TYPED_LEARNING}.`,
  };

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
  let spies: Spy[] = [];

  function consoleEntries(): string[] {
    return spies.flatMap((spy) => spy.mock.calls.map((args) => args.map((arg) => deepText(arg)).join(" ")));
  }

  async function flush(): Promise<void> {
    for (let i = 0; i < 5; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  beforeEach(() => {
    spies = CONSOLE_METHODS.map((method) => vi.spyOn(console, method).mockImplementation(() => undefined) as unknown as Spy);
    __setTestUser(USER);
  });

  afterEach(() => {
    for (const spy of spies) spy.mockRestore();
    spies = [];
  });

  it(`${CHECK_LOG} — the database refuses the setup, its description quoting what was typed`, async () => {
    fake = createFakeSupabase({ projects: [projectRow("p1", "Lighthouse", 0, "#9A7B4F")] });
    holder.current = fake;
    fake.failNext("save_interview", "rpc", REFUSAL);

    let rejected = false;
    await saveInterview(SETUP).catch(() => {
      rejected = true;
    });
    await flush();

    const entries = consoleEntries();
    const out = entries.join("\n");

    expect(entries.length, `the console shows one line (it showed: ${JSON.stringify(entries).slice(0, 400)})`).toBe(1);
    expect(out, "the line holds the error's code").toContain(CODE);
    expect(out, "the line holds the error's short summary").toContain(SUMMARY);
    expect(out, "nothing typed: not the project's name").not.toContain(TYPED_PROJECT);
    expect(out, "nothing typed: not a phase's name").not.toContain(TYPED_PHASE);
    expect(out, "nothing typed: not a learning item's name").not.toContain(TYPED_LEARNING);
    expect(out, "nothing of the database's description of the refused row").not.toContain("Failing row contains");

    expect(rejected, "harness: the setup was not saved").toBe(true);
    expect(
      fake.requests.some((r) => r.table === "save_interview" && r.operation === "rpc" && r.error !== null),
      "harness: the setup reached the database and was refused",
    ).toBe(true);
  });
});

describe("a reshape whose first read fails", () => {
  let fake: FakeSupabase;
  let reports: WriteFailure[];
  let unsubscribe: () => void;

  beforeEach(async () => {
    fake = createFakeSupabase({
      projects: [{ id: "p1", name: "Lighthouse", archived_at: null, sort_order: 0 }],
      daily_tasks: [{ id: "t1", project_id: "p1", text: "Draft", is_done: false, sort_order: 0 }],
      thoughts: [
        { id: "a", project_id: "p1", group_id: null, title: "", text: "one", sort_order: 0 },
        { id: "b", project_id: "p1", group_id: null, title: "", text: "two", sort_order: 1 },
      ],
    });
    holder.current = fake;
    reports = [];
    unsubscribe = onWriteError((f) => reports.push(f));
    __setTestUser({ id: "u1", email: "owner@example.com" } as never);
    await setActiveProject("p1");
  });

  afterEach(() => {
    unsubscribe();
    vi.restoreAllMocks();
  });

  it("reports once, answers null and changes nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    fake.failNext("thoughts", "select");
    const before = fake.rows("thoughts");

    expect(await groupThoughts(["a", "b"], "")).toBeNull();
    expect(reports).toHaveLength(1);
    expect(fake.rows("thoughts")).toEqual(before);
    expect(fake.rows("thought_groups")).toEqual([]);
  });
});
