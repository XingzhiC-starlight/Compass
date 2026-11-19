import { describe, expect, it } from "vitest";
import {
  LOCAL_TABLES,
  LOCAL_USER_ID,
  SAVE_INTERVIEW_PARAMETERS,
  emptyTables,
  parseTables,
  runLocalRequest,
  serializeTables,
  type LocalAnswer,
  type LocalQuery,
  type LocalRequest,
  type LocalRow,
  type LocalTables,
} from "./localDatabase";

const CHECK =
  "The local database keeps the rules the seam relied on the hosted database for: a new row's defaults, each column's limits, a row's link to its project, what a delete takes with it, and the setup's all-or-nothing save";

const NOW = "2026-09-22T10:00:00.000Z";

function surroundings() {
  let made = 0;
  return {
    now: () => NOW,
    newId: () => `00000000-0000-4000-8000-${String((made += 1)).padStart(12, "0")}`,
  };
}

function query(table: string, kind: LocalQuery["kind"], more: Partial<LocalQuery> = {}): LocalQuery {
  return { kind, table, payload: null, filters: [], ordering: [], limit: null, shape: "rows", columns: null, ...more };
}

/** A small database that runs requests one after another, as the client's backend does. */
function database(start: LocalTables = emptyTables()) {
  let tables = start;
  const around = surroundings();
  return {
    send(request: LocalRequest): LocalAnswer {
      const outcome = runLocalRequest(tables, request, around);
      tables = outcome.tables;
      return outcome.answer;
    },
    rows: (table: string): LocalRow[] => tables[table],
    get tables() {
      return tables;
    },
  };
}

const PROJECT = {
  name: "Garden",
  accent_color: "#9A7B4F",
  sort_order: 0,
  total_days: 30,
  hours_planned_per_day: 2,
  hours_available_per_day: 3.5,
  started_at: "2026-09-22",
};

function withAProject() {
  const db = database();
  const answer = db.send(query("projects", "insert", { payload: PROJECT, columns: "*", shape: "single" }));
  const project = answer.data as LocalRow;
  return { db, project };
}

const setupArgs = (more: LocalRow = {}): LocalRow => ({
  p_project_id: "9d1c2b3a-4e5f-4a6b-8c7d-0e1f2a3b4c5d",
  p_name: "Garden",
  p_accent_color: "#9A7B4F",
  p_sort_order: 0,
  p_total_days: 30,
  p_hours_planned_per_day: 2,
  p_hours_available_per_day: 3,
  p_started_at: "2026-09-22",
  p_phases: [
    { name: "Dig", est_days: 3 },
    { name: "Plant", est_days: 5 },
  ],
  p_learning_items: [
    { name: "Soil", progress_pct: 10, is_focus: true },
    { name: "Water", progress_pct: 30, is_focus: false },
  ],
  ...more,
});

describe("the local database: a new row", () => {
  it(`${CHECK} — a new row gets an id, the one person as its owner, the instant it was made and each column's default`, () => {
    const { db, project } = withAProject();
    expect(project).toEqual({
      ...PROJECT,
      id: "00000000-0000-4000-8000-000000000001",
      user_id: LOCAL_USER_ID,
      created_at: NOW,
      archived_at: null,
    });

    const task = db.send(
      query("daily_tasks", "insert", {
        payload: { project_id: project.id, text: "Buy seeds", sort_order: 0, task_date: "2026-09-22" },
        columns: "*",
        shape: "single",
      }),
    ).data as LocalRow;
    expect(task).toMatchObject({ is_done: false, phase_id: null, learning_item_id: null, user_id: LOCAL_USER_ID });

    const session = db.send(
      query("time_sessions", "insert", {
        payload: { project_id: project.id, started_at: NOW, session_date: "2026-09-22" },
        columns: "*",
        shape: "single",
      }),
    ).data as LocalRow;
    expect(session).toMatchObject({ ended_at: null, duration_seconds: 0 });
  });

  it(`${CHECK} — a write that asks for no rows back answers with none, and one that asks for some columns answers with those alone`, () => {
    const { db, project } = withAProject();
    const quiet = db.send(
      query("phases", "insert", { payload: { project_id: project.id, name: "Dig", est_days: 2, sort_order: 0 } }),
    );
    expect(quiet).toMatchObject({ data: null, error: null, status: 200 });

    const some = db.send(query("phases", "select", { columns: "id, sort_order" }));
    expect(some.data).toEqual([{ id: db.rows("phases")[0].id, sort_order: 0 }]);
  });
});

describe("the local database: what it refuses", () => {
  const refusals: [string, string, LocalRow, string][] = [
    ["a text past its column's limit", "phases", { name: "x".repeat(201), est_days: 1, sort_order: 0 }, "23514"],
    ["a task past 4000 characters", "daily_tasks", { text: "x".repeat(4001), sort_order: 0, task_date: "2026-09-22" }, "23514"],
    ["a number below its least", "phases", { name: "Dig", est_days: -1, sort_order: 0 }, "23514"],
    ["a percent past 100", "learning_items", { name: "Soil", sort_order: 0, progress_pct: 101 }, "23514"],
    ["a missing value", "phases", { est_days: 1, sort_order: 0 }, "23502"],
    ["a value of the wrong kind", "phases", { name: "Dig", est_days: "three", sort_order: 0 }, "22P02"],
    ["a day that is not a day key", "daily_tasks", { text: "Buy seeds", sort_order: 0, task_date: "22 Sept" }, "22P02"],
    ["a column the table does not have", "phases", { name: "Dig", est_days: 1, sort_order: 0, colour: "red" }, "PGRST204"],
  ];

  it.each(refusals)(`${CHECK} — refuses %s, and writes nothing`, (_what, table, row, code) => {
    const { db, project } = withAProject();
    const before = db.tables;
    const answer = db.send(query(table, "insert", { payload: { project_id: project.id, ...row } }));
    expect(answer.error?.code).toBe(code);
    expect(answer.data).toBeNull();
    expect(db.tables, "the tables are the very ones from before").toBe(before);
  });

  it(`${CHECK} — a text of exactly the limit is taken, counted in characters and not in bytes`, () => {
    const { db, project } = withAProject();
    const answer = db.send(
      query("phases", "insert", { payload: { project_id: project.id, name: "字".repeat(200), est_days: 1, sort_order: 0 } }),
    );
    expect(answer.error).toBeNull();
  });

  it(`${CHECK} — refuses a row for a project that is not there, and a second row with an id already taken`, () => {
    const { db, project } = withAProject();
    const orphan = db.send(
      query("phases", "insert", {
        payload: { project_id: "11111111-1111-4111-8111-111111111111", name: "Dig", est_days: 1, sort_order: 0 },
      }),
    );
    expect(orphan.error?.code).toBe("23503");

    const twin = db.send(query("projects", "insert", { payload: { ...PROJECT, id: project.id } }));
    expect(twin.error?.code).toBe("23505");
    expect(db.rows("projects")).toHaveLength(1);
  });

  it(`${CHECK} — an update is held to the same limits, and several rows change together or not at all`, () => {
    const { db, project } = withAProject();
    for (const [at, name] of ["Dig", "Plant"].entries()) {
      db.send(query("phases", "insert", { payload: { project_id: project.id, name, est_days: 1, sort_order: at } }));
    }
    const before = db.tables;
    const answer = db.send(
      query("phases", "update", {
        payload: { name: "x".repeat(201) },
        filters: [{ column: "project_id", op: "eq", value: project.id }],
      }),
    );
    expect(answer.error?.code).toBe("23514");
    expect(db.tables).toBe(before);
    expect(db.rows("phases").map((row) => row.name)).toEqual(["Dig", "Plant"]);
  });

  it(`${CHECK} — a refusal's words name the table, the column and the rule, and never the text a person typed`, () => {
    const { db, project } = withAProject();
    const secret = "a private thought nobody else should read";
    const answers = [
      db.send(query("thoughts", "insert", { payload: { project_id: project.id, text: secret.repeat(200), sort_order: 0 } })),
      db.send(query("thoughts", "insert", { payload: { project_id: project.id, text: secret, sort_order: secret } })),
      db.send(query("thoughts", "insert", { payload: { project_id: secret, text: secret, sort_order: 0 } })),
    ];
    for (const answer of answers) {
      expect(answer.error).not.toBeNull();
      expect(JSON.stringify(answer.error)).not.toContain("private thought");
    }
  });

  it(`${CHECK} — a table or a function it does not have is refused, as the hosted database refuses it`, () => {
    const db = database();
    expect(db.send(query("diaries", "select")).error?.code).toBe("PGRST205");
    expect(db.send({ kind: "rpc", fn: "drop_everything", args: {} }).error?.code).toBe("PGRST202");
    expect(db.send({ kind: "rpc", fn: "save_interview", args: { p_name: "Garden" } }).error?.code).toBe("PGRST202");
    expect(db.send(query("projects", "select", { filters: [{ column: "colour", op: "eq", value: 1 }] })).error?.code).toBe(
      "PGRST204",
    );
  });
});

describe("the local database: a delete", () => {
  it(`${CHECK} — deleting a project deletes everything in it, and leaves another project's rows alone`, () => {
    const db = database();
    const projects = ["Garden", "Shed"].map(
      (name, at) =>
        db.send(query("projects", "insert", { payload: { ...PROJECT, name, sort_order: at }, columns: "*", shape: "single" }))
          .data as LocalRow,
    );
    for (const project of projects) {
      const inProject = { project_id: project.id, sort_order: 0 };
      db.send(query("phases", "insert", { payload: { ...inProject, name: "Dig", est_days: 1 } }));
      db.send(query("learning_items", "insert", { payload: { ...inProject, name: "Soil", progress_pct: 10 } }));
      db.send(query("thought_groups", "insert", { payload: { ...inProject, name: "Ideas" } }));
      db.send(query("daily_tasks", "insert", { payload: { ...inProject, text: "Buy seeds", task_date: "2026-09-22" } }));
      db.send(query("thoughts", "insert", { payload: { ...inProject, text: "Rounder pills" } }));
      db.send(query("time_sessions", "insert", { payload: { project_id: project.id, started_at: NOW, session_date: "2026-09-22" } }));
    }

    const answer = db.send(query("projects", "delete", { filters: [{ column: "id", op: "eq", value: projects[0].id }] }));
    expect(answer.error).toBeNull();
    for (const table of LOCAL_TABLES) {
      const owners = db.rows(table).map((row) => (table === "projects" ? row.id : row.project_id));
      expect(owners, `${table} holds the other project's row alone`).toEqual([projects[1].id]);
    }
  });

  it(`${CHECK} — deleting a group, a phase or a learning item empties the links to it and keeps the rows that held them`, () => {
    const { db, project } = withAProject();
    const inProject = { project_id: project.id, sort_order: 0 };
    const made = (table: string, row: LocalRow) =>
      db.send(query(table, "insert", { payload: { ...inProject, ...row }, columns: "*", shape: "single" })).data as LocalRow;
    const group = made("thought_groups", { name: "Ideas" });
    const phase = made("phases", { name: "Dig", est_days: 1 });
    const item = made("learning_items", { name: "Soil", progress_pct: 10 });
    made("thoughts", { text: "Rounder pills", group_id: group.id });
    made("daily_tasks", { text: "Buy seeds", task_date: "2026-09-22", phase_id: phase.id, learning_item_id: item.id });

    for (const [table, row] of [["thought_groups", group], ["phases", phase], ["learning_items", item]] as const) {
      db.send(query(table, "delete", { filters: [{ column: "id", op: "eq", value: row.id }] }));
    }
    expect(db.rows("thoughts")).toMatchObject([{ text: "Rounder pills", group_id: null }]);
    expect(db.rows("daily_tasks")).toMatchObject([{ text: "Buy seeds", phase_id: null, learning_item_id: null }]);
  });

  it(`${CHECK} — a thought cannot be put in a group that is not there`, () => {
    const { db, project } = withAProject();
    const thought = db.send(
      query("thoughts", "insert", { payload: { project_id: project.id, text: "Rounder pills", sort_order: 0 }, columns: "*", shape: "single" }),
    ).data as LocalRow;
    const answer = db.send(
      query("thoughts", "update", {
        payload: { group_id: "22222222-2222-4222-8222-222222222222" },
        filters: [{ column: "id", op: "eq", value: thought.id }],
      }),
    );
    expect(answer.error?.code).toBe("23503");
  });
});

describe("the local database: reading", () => {
  function withSessions() {
    const { db, project } = withAProject();
    const rows: [string, string | null][] = [
      ["2026-09-20", "2026-09-20T11:00:00.000Z"],
      ["2026-09-21", null],
      ["2026-09-22", "2026-09-22T11:00:00.000Z"],
    ];
    for (const [day, ended] of rows) {
      db.send(
        query("time_sessions", "insert", {
          payload: { project_id: project.id, started_at: `${day}T10:00:00.000Z`, ended_at: ended, session_date: day },
        }),
      );
    }
    return db;
  }
  const days = (answer: LocalAnswer) => (answer.data as LocalRow[]).map((row) => row.session_date);

  it(`${CHECK} — filters judge an empty cell as the database does: it "is" empty, and is neither equal to nor apart from anything`, () => {
    const db = withSessions();
    const filtered = (op: string, column: string, value: unknown) =>
      days(db.send(query("time_sessions", "select", { filters: [{ column, op, value }], ordering: [{ column: "session_date", ascending: true }] })));

    expect(filtered("is", "ended_at", null)).toEqual(["2026-09-21"]);
    expect(filtered("not.is", "ended_at", null)).toEqual(["2026-09-20", "2026-09-22"]);
    expect(filtered("neq", "ended_at", "2026-09-20T11:00:00.000Z")).toEqual(["2026-09-22"]);
    expect(filtered("lt", "session_date", "2026-09-22")).toEqual(["2026-09-20", "2026-09-21"]);
    expect(filtered("gte", "session_date", "2026-09-21")).toEqual(["2026-09-21", "2026-09-22"]);
    expect(filtered("in", "session_date", ["2026-09-20", "2026-09-22"])).toEqual(["2026-09-20", "2026-09-22"]);
  });

  it(`${CHECK} — rows come back in the order asked for, an empty cell last going up and first going down, and no more than the limit`, () => {
    const db = withSessions();
    const ordered = (ascending: boolean, limit: number | null = null) =>
      days(db.send(query("time_sessions", "select", { ordering: [{ column: "ended_at", ascending }], limit })));

    expect(ordered(true)).toEqual(["2026-09-20", "2026-09-22", "2026-09-21"]);
    expect(ordered(false)).toEqual(["2026-09-21", "2026-09-22", "2026-09-20"]);
    expect(ordered(true, 1)).toEqual(["2026-09-20"]);
  });

  it(`${CHECK} — one row asked for and none or several found is refused, and "maybe one" with none is an empty answer`, () => {
    const db = withSessions();
    const none = [{ column: "session_date", op: "eq", value: "2026-01-01" }];
    expect(db.send(query("time_sessions", "select", { shape: "single" })).error?.code).toBe("PGRST116");
    expect(db.send(query("time_sessions", "select", { shape: "single", filters: none })).error?.code).toBe("PGRST116");
    expect(db.send(query("time_sessions", "select", { shape: "maybeSingle", filters: none }))).toMatchObject({
      data: null,
      error: null,
    });
  });

  it(`${CHECK} — a read hands back copies: changing an answer changes nothing kept`, () => {
    const { db } = withAProject();
    const rows = db.send(query("projects", "select")).data as LocalRow[];
    rows[0].name = "Changed in the answer";
    expect(db.rows("projects")[0].name).toBe("Garden");
  });
});

describe("the local database: the setup's save", () => {
  it(`${CHECK} — takes the ten parameters the hosted function takes`, () => {
    expect([...SAVE_INTERVIEW_PARAMETERS].sort()).toEqual(Object.keys(setupArgs()).sort());
  });

  it(`${CHECK} — writes the project, its phases in order and its learning items in order`, () => {
    const db = database();
    const answer = db.send({ kind: "rpc", fn: "save_interview", args: setupArgs() });
    expect(answer.error).toBeNull();
    expect(answer.data).toMatchObject({ id: setupArgs().p_project_id, name: "Garden", archived_at: null, user_id: LOCAL_USER_ID });
    expect(db.rows("phases").map((row) => [row.name, row.est_days, row.sort_order, row.is_done, row.completed_at])).toEqual([
      ["Dig", 3, 0, false, null],
      ["Plant", 5, 1, false, null],
    ]);
    expect(db.rows("learning_items").map((row) => [row.name, row.progress_pct, row.sort_order, row.is_focus])).toEqual([
      ["Soil", 10, 0, true],
      ["Water", 30, 1, false],
    ]);
  });

  it(`${CHECK} — a second send of the same setup hands back the project already there and writes nothing more`, () => {
    const db = database();
    const first = db.send({ kind: "rpc", fn: "save_interview", args: setupArgs() });
    const after = db.tables;
    const second = db.send({ kind: "rpc", fn: "save_interview", args: setupArgs({ p_name: "Typed again" }) });
    expect(second.data).toEqual(first.data);
    expect(db.tables).toBe(after);
    expect(db.rows("phases")).toHaveLength(2);
  });

  it(`${CHECK} — one bad row anywhere in the setup and nothing of it is written, not even the project`, () => {
    for (const bad of [
      { p_phases: [{ name: "Dig", est_days: 3 }, { name: "x".repeat(201), est_days: 1 }] },
      { p_learning_items: [{ name: "Soil", progress_pct: 10 }, { name: "Water", progress_pct: 130 }] },
      { p_phases: { name: "Dig" } },
    ]) {
      const db = database();
      const before = db.tables;
      const answer = db.send({ kind: "rpc", fn: "save_interview", args: setupArgs(bad) });
      expect(answer.error).not.toBeNull();
      expect(db.tables).toBe(before);
      expect(db.rows("projects")).toEqual([]);
    }
  });
});

describe("the local database: the text that is kept", () => {
  it(`${CHECK} — the tables come back from their text as they went in`, () => {
    const db = database();
    db.send({ kind: "rpc", fn: "save_interview", args: setupArgs() });
    expect(parseTables(serializeTables(db.tables))).toEqual(db.tables);
  });

  it(`${CHECK} — a text that is not this database's, or is a later version's, is refused and never read as empty`, () => {
    const later = JSON.stringify({ format: "compass-local-database", version: 2, tables: {} });
    const broken = JSON.stringify({ format: "compass-local-database", version: 1, tables: { projects: "gone" } });
    for (const text of ["", "not json", "{}", "null", JSON.stringify({ projects: [] }), later, broken]) {
      expect(() => parseTables(text), JSON.stringify(text)).toThrow();
    }
  });

  it(`${CHECK} — a request never changes the tables it was handed: a write hands back new ones, a read the same`, () => {
    const start = emptyTables();
    const frozen = JSON.stringify(start);
    const around = surroundings();
    const write = runLocalRequest(start, query("projects", "insert", { payload: PROJECT }), around);
    expect(write.tables).not.toBe(start);
    expect(JSON.stringify(start)).toBe(frozen);

    const read = runLocalRequest(write.tables, query("projects", "select"), around);
    expect(read.tables).toBe(write.tables);
    const nothingToDelete = runLocalRequest(start, query("projects", "delete"), around);
    expect(nothingToDelete.tables).toBe(start);
  });
});
