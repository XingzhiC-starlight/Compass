import type { SupabaseClient } from "@supabase/supabase-js";

export type FakeRow = Record<string, unknown>;

export type FakeOperation = "select" | "insert" | "update" | "delete" | "rpc";

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

export interface FakeError {
  message: string;
  details: string;
  hint: string;
  code: string;
}

export interface FakeFilter {
  column: string;
  op: string;
  value: unknown;
}

export interface FakeRequest {
  table: string;
  operation: FakeOperation;
  filters: FakeFilter[];
  payload: FakeRow | FakeRow[] | null;
  error: FakeError | null;
}

export interface FakeSupabase {
  client: SupabaseClient;
  rows(table: string): FakeRow[];
  seed(table: string, rows: FakeRow[]): void;
  failNext(table: string, operation: FakeOperation, failure?: string | Partial<FakeError>): void;
  loseReplyNext(table: string, operation: FakeOperation): void;
  holdNext(table: string, operation: FakeOperation): () => void;
  requests: FakeRequest[];
}

export function createFakeSupabase(seed: Record<string, FakeRow[]> = {}): FakeSupabase {
  const tables = new Map<string, FakeRow[]>();
  const armed: { table: string; operation: FakeOperation; error: FakeError }[] = [];
  const lost: Armed[] = [];
  const holds: Hold[] = [];
  const requests: FakeRequest[] = [];

  const rowsOf = (table: string): FakeRow[] => {
    let rows = tables.get(table);
    if (!rows) {
      rows = [];
      tables.set(table, rows);
    }
    return rows;
  };

  const stamp = (row: FakeRow): FakeRow => ({
    ...row,
    id: row.id ?? crypto.randomUUID(),
    created_at: row.created_at ?? new Date().toISOString(),
  });

  const seedTable = (table: string, rows: FakeRow[]): void => {
    for (const row of rows) rowsOf(table).push(stamp(row));
  };
  for (const [table, rows] of Object.entries(seed)) seedTable(table, rows);

  const client = {
    from: (table: string) => new FakeQuery(table, rowsOf, armed, lost, holds, requests),
    rpc: (fn: string, args: FakeRow = {}) => new FakeCall(fn, args, rowsOf, armed, lost, holds, requests),
  } as unknown as SupabaseClient;

  return {
    client,
    rows: (table) => rowsOf(table).map((r) => ({ ...r })),
    seed: seedTable,
    failNext: (table, operation, failure) => {
      const shaped = typeof failure === "string" ? { message: failure } : (failure ?? {});
      armed.push({ table, operation, error: { ...fetchFailure(), ...shaped } });
    },
    loseReplyNext: (table, operation) => {
      lost.push({ table, operation });
    },
    holdNext: (table, operation) => {
      let open: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        open = resolve;
      });
      holds.push({ table, operation, gate });
      return () => open();
    },
    requests,
  };
}

type Hold = { table: string; operation: FakeOperation; gate: Promise<void> };

type Armed = { table: string; operation: FakeOperation };

function takeArmed<T extends { table: string; operation: FakeOperation }>(
  list: T[],
  table: string,
  operation: FakeOperation,
): T | null {
  const at = list.findIndex((a) => a.table === table && a.operation === operation);
  return at === -1 ? null : list.splice(at, 1)[0];
}

function gateFor(holds: Hold[], table: string, operation: FakeOperation): Promise<void> {
  const held = takeArmed(holds, table, operation);
  return held ? held.gate : Promise.resolve();
}

function fetchFailure(message = "TypeError: Failed to fetch"): FakeError {
  return { message, details: "", hint: "", code: "" };
}

function notSingle(count: number): FakeError {
  return {
    code: "PGRST116",
    details: `Results contain ${count} rows, application/vnd.pgrst.object+json requires 1 row`,
    hint: "",
    message: "JSON object requested, multiple (or no) rows returned",
  };
}

type Answer = {
  data: unknown;
  error: FakeError | null;
  count: null;
  status: number;
  statusText: string;
};

class FakeQuery implements PromiseLike<Answer> {
  private operation: Exclude<FakeOperation, "rpc"> = "select";
  private payload: FakeRow | FakeRow[] | null = null;
  private filters: FakeFilter[] = [];
  private ordering: { column: string; ascending: boolean }[] = [];
  private max: number | null = null;
  private shape: "rows" | "single" | "maybeSingle" = "rows";
  private returning = false;

  constructor(
    private readonly table: string,
    private readonly rowsOf: (table: string) => FakeRow[],
    private readonly armed: { table: string; operation: FakeOperation; error: FakeError }[],
    private readonly lost: Armed[],
    private readonly holds: Hold[],
    private readonly requests: FakeRequest[],
  ) {}

  select(_columns?: string): this {
    if (this.operation !== "select") this.returning = true;
    return this;
  }
  insert(payload: FakeRow | FakeRow[]): this {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: FakeRow): this {
    this.operation = "update";
    this.payload = payload;
    return this;
  }
  delete(): this {
    this.operation = "delete";
    return this;
  }

  private where(op: string, column: string, value: unknown): this {
    this.filters.push({ column, op, value });
    return this;
  }
  eq(column: string, value: unknown): this {
    return this.where("eq", column, value);
  }
  neq(column: string, value: unknown): this {
    return this.where("neq", column, value);
  }
  is(column: string, value: unknown): this {
    return this.where("is", column, value);
  }
  lt(column: string, value: unknown): this {
    return this.where("lt", column, value);
  }
  lte(column: string, value: unknown): this {
    return this.where("lte", column, value);
  }
  gt(column: string, value: unknown): this {
    return this.where("gt", column, value);
  }
  gte(column: string, value: unknown): this {
    return this.where("gte", column, value);
  }
  in(column: string, values: unknown[]): this {
    return this.where("in", column, values);
  }
  not(column: string, op: string, value: unknown): this {
    return this.where(`not.${op}`, column, value);
  }
  order(column: string, opts: { ascending?: boolean } = {}): this {
    this.ordering.push({ column, ascending: opts.ascending ?? true });
    return this;
  }
  limit(n: number): this {
    this.max = n;
    return this;
  }
  single(): this {
    this.shape = "single";
    return this;
  }
  maybeSingle(): this {
    this.shape = "maybeSingle";
    return this;
  }

  then<R1 = Answer, R2 = never>(
    onFulfilled?: ((value: Answer) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return gateFor(this.holds, this.table, this.operation)
      .then(() => this.send())
      .then(onFulfilled, onRejected);
  }

  private matches(row: FakeRow): boolean {
    return this.filters.every(({ column, op, value }) => {
      const cell = row[column];
      const negate = op.startsWith("not.");
      const test = negate ? op.slice(4) : op;
      let hit: boolean;
      switch (test) {
        case "eq":
          hit = cell === value;
          break;
        case "neq":
          hit = cell !== value;
          break;
        case "is":
          hit = value === null ? cell === null || cell === undefined : cell === value;
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
          throw new Error(`fakeSupabase: unsupported filter ${op}`);
      }
      return negate ? !hit : hit;
    });
  }

  private sorted(rows: FakeRow[]): FakeRow[] {
    if (this.ordering.length === 0) return rows;
    return [...rows].sort((a, b) => {
      for (const { column, ascending } of this.ordering) {
        const x = a[column] as never;
        const y = b[column] as never;
        if (x === y) continue;
        const less = x < y;
        return (less ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    });
  }

  private send(): Answer {
    const record: FakeRequest = {
      table: this.table,
      operation: this.operation,
      filters: [...this.filters],
      payload: this.payload,
      error: null,
    };
    const refused = takeArmed(this.armed, this.table, this.operation);
    if (refused) {
      record.error = refused.error;
      this.requests.push(record);
      return { data: null, error: refused.error, count: null, status: 0, statusText: "" };
    }

    const rows = this.rowsOf(this.table);
    let affected: FakeRow[];
    switch (this.operation) {
      case "select": {
        affected = this.sorted(rows.filter((r) => this.matches(r)));
        if (this.max !== null) affected = affected.slice(0, this.max);
        break;
      }
      case "insert": {
        const incoming = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
        affected = incoming.map((r) => ({
          ...r,
          id: r.id ?? crypto.randomUUID(),
          created_at: r.created_at ?? new Date().toISOString(),
        }));
        rows.push(...affected);
        break;
      }
      case "update": {
        affected = [];
        for (let i = 0; i < rows.length; i += 1) {
          if (this.matches(rows[i])) {
            rows[i] = { ...rows[i], ...(this.payload as FakeRow) };
            affected.push(rows[i]);
          }
        }
        break;
      }
      case "delete": {
        affected = rows.filter((r) => this.matches(r));
        const keep = rows.filter((r) => !this.matches(r));
        rows.length = 0;
        rows.push(...keep);
        break;
      }
    }

    const answerRows = this.operation === "select" || this.returning;
    let data: unknown = answerRows ? affected.map((r) => ({ ...r })) : null;
    let error: FakeError | null = null;
    let status = 200;
    if (answerRows && this.shape !== "rows") {
      const list = data as FakeRow[];
      if (list.length === 1) data = list[0];
      else if (list.length === 0 && this.shape === "maybeSingle") data = null;
      else {
        data = null;
        error = notSingle(list.length);
        status = 406;
      }
    }
    if (takeArmed(this.lost, this.table, this.operation)) return loseReply(record, this.requests);
    record.error = error;
    this.requests.push(record);
    return { data, error, count: null, status, statusText: status === 200 ? "OK" : "Not Acceptable" };
  }
}

function loseReply(record: FakeRequest, requests: FakeRequest[]): Answer {
  const error = fetchFailure();
  record.error = error;
  requests.push(record);
  return { data: null, error, count: null, status: 0, statusText: "" };
}

function noSuchFunction(fn: string, args: FakeRow): FakeError {
  return {
    code: "PGRST202",
    details: `Searched for the function public.${fn} with parameters ${Object.keys(args).sort().join(", ")}`,
    hint: "",
    message: `Could not find the function public.${fn} in the schema cache`,
  };
}

class FakeCall implements PromiseLike<Answer> {
  constructor(
    private readonly fn: string,
    private readonly args: FakeRow,
    private readonly rowsOf: (table: string) => FakeRow[],
    private readonly armed: { table: string; operation: FakeOperation; error: FakeError }[],
    private readonly lost: Armed[],
    private readonly holds: Hold[],
    private readonly requests: FakeRequest[],
  ) {}

  then<R1 = Answer, R2 = never>(
    onFulfilled?: ((value: Answer) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return gateFor(this.holds, this.fn, "rpc")
      .then(() => this.send())
      .then(onFulfilled, onRejected);
  }

  private send(): Answer {
    const record: FakeRequest = { table: this.fn, operation: "rpc", filters: [], payload: this.args, error: null };
    const refused = takeArmed(this.armed, this.fn, "rpc");
    if (refused) {
      record.error = refused.error;
      this.requests.push(record);
      return { data: null, error: refused.error, count: null, status: 0, statusText: "" };
    }
    if (this.fn !== "save_interview" || !sameNames(Object.keys(this.args), SAVE_INTERVIEW_PARAMETERS)) {
      const error = noSuchFunction(this.fn, this.args);
      record.error = error;
      this.requests.push(record);
      return { data: null, error, count: null, status: 404, statusText: "Not Found" };
    }
    const saved = saveInterview(this.args, this.rowsOf);
    if ("error" in saved) {
      record.error = saved.error;
      this.requests.push(record);
      return { data: null, error: saved.error, count: null, status: 400, statusText: "Bad Request" };
    }
    if (takeArmed(this.lost, this.fn, "rpc")) return loseReply(record, this.requests);
    this.requests.push(record);
    return { data: { ...saved.row }, error: null, count: null, status: 200, statusText: "OK" };
  }
}

function sameNames(given: string[], expected: readonly string[]): boolean {
  return given.length === expected.length && expected.every((name) => given.includes(name));
}

function saveInterview(args: FakeRow, rowsOf: (table: string) => FakeRow[]): { row: FakeRow } | { error: FakeError } {
  const projects = rowsOf("projects");
  const existing = projects.find((row) => row.id === args.p_project_id);
  if (existing) return { row: existing };
  for (const list of [args.p_phases, args.p_learning_items]) {
    if (list !== null && list !== undefined && !Array.isArray(list)) {
      return { error: { code: "22023", message: "cannot extract elements from an object", details: "", hint: "" } };
    }
  }

  const createdAt = new Date().toISOString();
  const project: FakeRow = {
    id: args.p_project_id,
    name: args.p_name,
    accent_color: args.p_accent_color,
    sort_order: args.p_sort_order,
    archived_at: null,
    total_days: args.p_total_days,
    hours_planned_per_day: args.p_hours_planned_per_day,
    hours_available_per_day: args.p_hours_available_per_day,
    started_at: args.p_started_at,
    created_at: createdAt,
  };
  const phases = ((args.p_phases ?? []) as FakeRow[]).map((phase, i) => ({
    id: crypto.randomUUID(),
    project_id: project.id,
    name: phase.name,
    est_days: phase.est_days,
    sort_order: i,
    is_done: false,
    completed_at: null,
    created_at: createdAt,
  }));
  const learning = ((args.p_learning_items ?? []) as FakeRow[]).map((item, i) => ({
    id: crypto.randomUUID(),
    project_id: project.id,
    name: item.name,
    sort_order: i,
    progress_pct: item.progress_pct,
    is_focus: item.is_focus ?? false,
    created_at: createdAt,
  }));
  projects.push(project);
  rowsOf("phases").push(...phases);
  rowsOf("learning_items").push(...learning);
  return { row: project };
}
