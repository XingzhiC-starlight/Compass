/**
 * The local database (spec §21): the seven tables of §3 kept on the person's own device.
 *
 * This file is the engine alone. It takes the tables and one request, and hands back an
 * answer and, when the request changed something, the tables that follow. It touches no
 * browser storage, no file and no clock of its own, so the same engine runs wherever the
 * tables are kept; `src/lib/localClient.ts` is what keeps them.
 *
 * It keeps the rules the seam (`src/lib/db.ts`) relies on the database for: the defaults a
 * new row gets, the limits of each column, a row's link to its project, what a delete takes
 * with it, and the setup's all-or-nothing save.
 */

export type LocalRow = Record<string, unknown>;
export type LocalTables = Record<string, LocalRow[]>;

export interface LocalFilter {
  column: string;
  op: string;
  value: unknown;
}

export interface LocalError {
  message: string;
  details: string;
  hint: string;
  code: string;
}

export interface LocalAnswer {
  data: unknown;
  error: LocalError | null;
  count: null;
  status: number;
  statusText: string;
}

export interface LocalQuery {
  kind: "select" | "insert" | "update" | "delete";
  table: string;
  payload: LocalRow | LocalRow[] | null;
  filters: LocalFilter[];
  ordering: { column: string; ascending: boolean }[];
  limit: number | null;
  shape: "rows" | "single" | "maybeSingle";
  /** The columns to answer with; null when a write asked for no rows back. */
  columns: string | null;
}

export interface LocalCall {
  kind: "rpc";
  fn: string;
  args: LocalRow;
}

export type LocalRequest = LocalQuery | LocalCall;

/** What the engine does not decide for itself: the instant a row is made, and its id. */
export interface LocalSurroundings {
  now: () => string;
  newId: () => string;
}

export interface LocalOutcome {
  answer: LocalAnswer;
  /** The tables after the request; the very object handed in when nothing changed. */
  tables: LocalTables;
}

/** The one person a local copy has: every row is theirs (I17). */
export const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";

const FORMAT = "compass-local-database";
const VERSION = 1;

type Kind = "id" | "text" | "whole" | "number" | "flag" | "day" | "instant";

interface Column {
  kind: Kind;
  nullable?: boolean;
  /** The value a new row gets when it names none. */
  fallback?: unknown;
  /** The most characters a text may hold, or the least and most a number may be. */
  longest?: number;
  least?: number;
  most?: number;
  /** The table this column points into, and what a delete there does to this row. */
  pointsTo?: { table: string; whenGone: "delete the row" | "empty the column" };
}

const shared = {
  id: { kind: "id" },
  user_id: { kind: "id" },
  created_at: { kind: "instant" },
} satisfies Record<string, Column>;

const inAProject: Column = { kind: "id", pointsTo: { table: "projects", whenGone: "delete the row" } };

const SCHEMA: Record<string, Record<string, Column>> = {
  projects: {
    ...shared,
    name: { kind: "text", longest: 200 },
    accent_color: { kind: "text", longest: 32 },
    sort_order: { kind: "whole" },
    archived_at: { kind: "instant", nullable: true, fallback: null },
    total_days: { kind: "whole", least: 0 },
    hours_planned_per_day: { kind: "number", least: 0 },
    hours_available_per_day: { kind: "number", least: 0 },
    started_at: { kind: "day" },
  },
  phases: {
    ...shared,
    project_id: inAProject,
    name: { kind: "text", longest: 200 },
    est_days: { kind: "whole", least: 0 },
    sort_order: { kind: "whole" },
    is_done: { kind: "flag", fallback: false },
    completed_at: { kind: "day", nullable: true, fallback: null },
  },
  learning_items: {
    ...shared,
    project_id: inAProject,
    name: { kind: "text", longest: 200 },
    sort_order: { kind: "whole" },
    progress_pct: { kind: "whole", least: 0, most: 100 },
    is_focus: { kind: "flag", fallback: false },
  },
  thought_groups: {
    ...shared,
    project_id: inAProject,
    name: { kind: "text", longest: 200 },
    sort_order: { kind: "whole" },
  },
  daily_tasks: {
    ...shared,
    project_id: inAProject,
    text: { kind: "text", longest: 4000 },
    is_done: { kind: "flag", fallback: false },
    sort_order: { kind: "whole" },
    task_date: { kind: "day" },
    phase_id: { kind: "id", nullable: true, fallback: null, pointsTo: { table: "phases", whenGone: "empty the column" } },
    learning_item_id: {
      kind: "id",
      nullable: true,
      fallback: null,
      pointsTo: { table: "learning_items", whenGone: "empty the column" },
    },
  },
  thoughts: {
    ...shared,
    project_id: inAProject,
    title: { kind: "text", nullable: true, fallback: null, longest: 200 },
    text: { kind: "text", longest: 4000 },
    sort_order: { kind: "whole" },
    group_id: {
      kind: "id",
      nullable: true,
      fallback: null,
      pointsTo: { table: "thought_groups", whenGone: "empty the column" },
    },
  },
  time_sessions: {
    ...shared,
    project_id: inAProject,
    started_at: { kind: "instant" },
    ended_at: { kind: "instant", nullable: true, fallback: null },
    duration_seconds: { kind: "whole", least: 0, fallback: 0 },
    session_date: { kind: "day" },
  },
};

export const LOCAL_TABLES = Object.keys(SCHEMA);

export function emptyTables(): LocalTables {
  return Object.fromEntries(LOCAL_TABLES.map((table) => [table, []]));
}

/** The tables as the text that is kept. */
export function serializeTables(tables: LocalTables): string {
  const kept = Object.fromEntries(LOCAL_TABLES.map((table) => [table, tables[table] ?? []]));
  return JSON.stringify({ format: FORMAT, version: VERSION, tables: kept });
}

/**
 * The tables from the text that was kept. Throws when the text is not this engine's, or is a
 * later version's, so a copy it cannot read is never taken for an empty one and written over.
 */
export function parseTables(text: string): LocalTables {
  const kept = JSON.parse(text) as { format?: unknown; version?: unknown; tables?: unknown };
  if (kept === null || typeof kept !== "object" || kept.format !== FORMAT) {
    throw new Error("the saved data is not a Compass local database");
  }
  if (kept.version !== VERSION) {
    throw new Error("the saved data was written by another version of Compass");
  }
  const held = (kept.tables ?? {}) as Record<string, unknown>;
  const tables = emptyTables();
  for (const table of LOCAL_TABLES) {
    const rows = held[table];
    if (rows === undefined) continue;
    if (!Array.isArray(rows) || rows.some((row) => row === null || typeof row !== "object" || Array.isArray(row))) {
      throw new Error(`the saved data holds no readable table "${table}"`);
    }
    tables[table] = rows as LocalRow[];
  }
  return tables;
}

/** Runs one request against the tables. The tables handed in are never changed. */
export function runLocalRequest(tables: LocalTables, request: LocalRequest, around: LocalSurroundings): LocalOutcome {
  const work = copyOf(tables);
  const refused = (error: LocalError, status = 400): LocalOutcome => ({
    answer: { data: null, error, count: null, status, statusText: statusText(status) },
    tables,
  });

  if (request.kind === "rpc") {
    if (request.fn !== "save_interview" || !sameNames(Object.keys(request.args), SAVE_INTERVIEW_PARAMETERS)) {
      return refused(noSuchFunction(request.fn, request.args), 404);
    }
    const saved = saveInterview(work, request.args, around);
    if ("error" in saved) return refused(saved.error);
    return { answer: answered({ ...saved.row }), tables: saved.made ? work : tables };
  }

  const columns = SCHEMA[request.table];
  if (!columns) return refused(noSuchTable(request.table), 404);
  for (const { column } of [...request.filters, ...request.ordering]) {
    if (!(column in columns)) return refused(noSuchColumn(request.table, column));
  }

  const rows = work[request.table];
  const matches = (row: LocalRow) => request.filters.every((filter) => passes(row[filter.column], filter));
  let affected: LocalRow[];
  let changed = false;

  switch (request.kind) {
    case "select": {
      affected = sorted(rows.filter(matches), request.ordering);
      if (request.limit !== null) affected = affected.slice(0, request.limit);
      break;
    }
    case "insert": {
      const incoming = Array.isArray(request.payload) ? request.payload : [request.payload ?? {}];
      affected = [];
      for (const given of incoming) {
        const made = newRow(work, request.table, given, around);
        if ("error" in made) return refused(made.error, made.error.code === "23505" ? 409 : 400);
        rows.push(made.row);
        affected.push(made.row);
      }
      changed = affected.length > 0;
      break;
    }
    case "update": {
      const patch = (request.payload ?? {}) as LocalRow;
      affected = [];
      for (let at = 0; at < rows.length; at += 1) {
        if (!matches(rows[at])) continue;
        const next = { ...rows[at], ...patch };
        const error = unknownColumn(request.table, patch) ?? rowError(work, request.table, next, rows[at]);
        if (error) return refused(error);
        rows[at] = next;
        affected.push(next);
      }
      changed = affected.length > 0;
      break;
    }
    case "delete": {
      affected = rows.filter(matches);
      if (affected.length > 0) {
        work[request.table] = rows.filter((row) => !matches(row));
        for (const gone of affected) removeWhatPointedAt(work, request.table, gone.id);
        changed = true;
      }
      break;
    }
  }

  const answersRows = request.kind === "select" || request.columns !== null;
  if (!answersRows) return { answer: answered(null), tables: changed ? work : tables };

  const picked = affected.map((row) => pick(row, request.columns));
  if (request.shape === "rows") return { answer: answered(picked), tables: changed ? work : tables };
  if (picked.length === 1) return { answer: answered(picked[0]), tables: changed ? work : tables };
  if (picked.length === 0 && request.shape === "maybeSingle") {
    return { answer: answered(null), tables: changed ? work : tables };
  }
  // The rows were written all the same: only the answer's shape is refused, as the database's is.
  return {
    answer: { data: null, error: notSingle(picked.length), count: null, status: 406, statusText: statusText(406) },
    tables: changed ? work : tables,
  };
}

export const SAVE_INTERVIEW_PARAMETERS = [
  "p_project_id",
  "p_name",
  "p_accent_color",
  "p_sort_order",
  "p_total_days",
  "p_hours_planned_per_day",
  "p_hours_available_per_day",
  "p_started_at",
  "p_phases",
  "p_learning_items",
] as const;

/**
 * The setup's save (§13), as `supabase/migrations/0002_save_interview.sql` does it: a project
 * that is already there is handed back untouched, and otherwise the project, its phases and
 * its learning items are written together or not at all.
 */
function saveInterview(
  work: LocalTables,
  args: LocalRow,
  around: LocalSurroundings,
): { row: LocalRow; made: boolean } | { error: LocalError } {
  const already = work.projects.find((row) => row.id === args.p_project_id);
  if (already) return { row: already, made: false };
  for (const list of [args.p_phases, args.p_learning_items]) {
    if (list !== null && list !== undefined && !Array.isArray(list)) {
      return { error: refusal("22023", "cannot extract elements from an object") };
    }
  }

  const project = newRow(
    work,
    "projects",
    {
      id: args.p_project_id,
      name: args.p_name,
      accent_color: args.p_accent_color,
      sort_order: args.p_sort_order,
      archived_at: null,
      total_days: args.p_total_days,
      hours_planned_per_day: args.p_hours_planned_per_day,
      hours_available_per_day: args.p_hours_available_per_day,
      started_at: args.p_started_at,
    },
    around,
  );
  if ("error" in project) return project;
  work.projects.push(project.row);

  const phases = (args.p_phases ?? []) as LocalRow[];
  for (const [at, phase] of phases.entries()) {
    const made = newRow(
      work,
      "phases",
      { project_id: project.row.id, name: phase?.name, est_days: phase?.est_days, sort_order: at, is_done: false, completed_at: null },
      around,
    );
    if ("error" in made) return made;
    work.phases.push(made.row);
  }

  const learning = (args.p_learning_items ?? []) as LocalRow[];
  for (const [at, item] of learning.entries()) {
    const made = newRow(
      work,
      "learning_items",
      {
        project_id: project.row.id,
        name: item?.name,
        sort_order: at,
        progress_pct: item?.progress_pct,
        is_focus: item?.is_focus ?? false,
      },
      around,
    );
    if ("error" in made) return made;
    work.learning_items.push(made.row);
  }
  return { row: project.row, made: true };
}

function newRow(
  work: LocalTables,
  table: string,
  given: LocalRow,
  around: LocalSurroundings,
): { row: LocalRow } | { error: LocalError } {
  const unknown = unknownColumn(table, given);
  if (unknown) return { error: unknown };

  const row: LocalRow = {};
  for (const [name, column] of Object.entries(SCHEMA[table])) {
    if (given[name] !== undefined) row[name] = given[name];
    else if ("fallback" in column) row[name] = column.fallback;
  }
  row.id ??= around.newId();
  row.user_id ??= LOCAL_USER_ID;
  row.created_at ??= around.now();

  if (work[table].some((other) => other.id === row.id)) {
    return { error: refusal("23505", `duplicate key value violates unique constraint "${table}_pkey"`) };
  }
  const error = rowError(work, table, row, null);
  return error ? { error } : { row };
}

function unknownColumn(table: string, given: LocalRow): LocalError | null {
  const stray = Object.keys(given).find((name) => !(name in SCHEMA[table]));
  return stray ? noSuchColumn(table, stray) : null;
}

/**
 * What is wrong with a row, or null. The words name the table, the column and the rule, and
 * never the value: a person's text does not travel in an error (spec §17).
 */
function rowError(work: LocalTables, table: string, row: LocalRow, before: LocalRow | null): LocalError | null {
  for (const [name, column] of Object.entries(SCHEMA[table])) {
    const value = row[name];
    if (value === null || value === undefined) {
      if (column.nullable) continue;
      return refusal("23502", `null value in column "${name}" of relation "${table}" violates not-null constraint`);
    }
    if (!isOfKind(value, column.kind)) {
      return refusal("22P02", `invalid input for column "${name}" of relation "${table}"`);
    }
    const tooLong = column.longest !== undefined && [...(value as string)].length > column.longest;
    const tooSmall = column.least !== undefined && (value as number) < column.least;
    const tooLarge = column.most !== undefined && (value as number) > column.most;
    if (tooLong || tooSmall || tooLarge) {
      return refusal("23514", `new row for relation "${table}" violates check constraint "${table}_${name}_check"`);
    }
    if (column.pointsTo && (before === null || before[name] !== value)) {
      const there = work[column.pointsTo.table].some((other) => other.id === value);
      if (!there) {
        return refusal(
          "23503",
          `insert or update on table "${table}" violates foreign key constraint "${table}_${name}_fkey"`,
        );
      }
    }
  }
  return null;
}

function isOfKind(value: unknown, kind: Kind): boolean {
  switch (kind) {
    case "id":
    case "text":
      return typeof value === "string";
    case "whole":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "flag":
      return typeof value === "boolean";
    case "day":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
    case "instant":
      return typeof value === "string" && !Number.isNaN(Date.parse(value));
  }
}

/** A delete takes with it the rows that belonged to the deleted one, and empties the links to it. */
function removeWhatPointedAt(work: LocalTables, table: string, id: unknown): void {
  for (const [other, columns] of Object.entries(SCHEMA)) {
    for (const [name, column] of Object.entries(columns)) {
      if (column.pointsTo?.table !== table) continue;
      if (column.pointsTo.whenGone === "empty the column") {
        work[other] = work[other].map((row) => (row[name] === id ? { ...row, [name]: null } : row));
        continue;
      }
      const gone = work[other].filter((row) => row[name] === id);
      if (gone.length === 0) continue;
      work[other] = work[other].filter((row) => row[name] !== id);
      for (const row of gone) removeWhatPointedAt(work, other, row.id);
    }
  }
}

/** One filter on one cell, as the database judges it: nothing is equal to, or apart from, an empty cell. */
function passes(cell: unknown, { op, value }: LocalFilter): boolean {
  const empty = cell === null || cell === undefined;
  const negated = op.startsWith("not.");
  const test = negated ? op.slice(4) : op;
  if (test === "is") {
    const hit = value === null ? empty : cell === value;
    return negated ? !hit : hit;
  }
  if (empty) return false;
  let hit: boolean;
  switch (test) {
    case "eq":
      hit = cell === value;
      break;
    case "neq":
      hit = cell !== value;
      break;
    case "lt":
      hit = (cell as never) < (value as never);
      break;
    case "lte":
      hit = (cell as never) <= (value as never);
      break;
    case "gt":
      hit = (cell as never) > (value as never);
      break;
    case "gte":
      hit = (cell as never) >= (value as never);
      break;
    case "in":
      hit = Array.isArray(value) && value.includes(cell);
      break;
    default:
      throw new Error(`the local database does not know the filter "${op}"`);
  }
  return negated ? !hit : hit;
}

/** Rows in order; an empty cell sorts as the largest value, so last going up and first going down. */
function sorted(rows: LocalRow[], ordering: LocalQuery["ordering"]): LocalRow[] {
  if (ordering.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const { column, ascending } of ordering) {
      const x = a[column] ?? null;
      const y = b[column] ?? null;
      if (x === y) continue;
      const less = y === null ? true : x === null ? false : (x as never) < (y as never);
      return (less ? -1 : 1) * (ascending ? 1 : -1);
    }
    return 0;
  });
}

function pick(row: LocalRow, columns: string | null): LocalRow {
  const asked = (columns ?? "*").split(",").map((name) => name.trim()).filter(Boolean);
  if (asked.length === 0 || asked.includes("*")) return { ...row };
  return Object.fromEntries(asked.filter((name) => name in row).map((name) => [name, row[name]]));
}

function copyOf(tables: LocalTables): LocalTables {
  return Object.fromEntries(LOCAL_TABLES.map((table) => [table, [...(tables[table] ?? [])]]));
}

function sameNames(given: string[], expected: readonly string[]): boolean {
  return given.length === expected.length && expected.every((name) => given.includes(name));
}

function answered(data: unknown): LocalAnswer {
  return { data, error: null, count: null, status: 200, statusText: statusText(200) };
}

function statusText(status: number): string {
  switch (status) {
    case 200:
      return "OK";
    case 404:
      return "Not Found";
    case 406:
      return "Not Acceptable";
    case 409:
      return "Conflict";
    default:
      return "Bad Request";
  }
}

function refusal(code: string, message: string): LocalError {
  return { code, message, details: "", hint: "" };
}

function notSingle(count: number): LocalError {
  return {
    code: "PGRST116",
    details: `Results contain ${count} rows, application/vnd.pgrst.object+json requires 1 row`,
    hint: "",
    message: "JSON object requested, multiple (or no) rows returned",
  };
}

function noSuchTable(table: string): LocalError {
  return refusal("PGRST205", `Could not find the table 'public.${table}' in the schema cache`);
}

function noSuchColumn(table: string, column: string): LocalError {
  return refusal("PGRST204", `Could not find the '${column}' column of '${table}' in the schema cache`);
}

function noSuchFunction(fn: string, args: LocalRow): LocalError {
  return {
    code: "PGRST202",
    details: `Searched for the function public.${fn} with parameters ${Object.keys(args).sort().join(", ")}`,
    hint: "",
    message: `Could not find the function public.${fn} in the schema cache`,
  };
}
