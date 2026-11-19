/**
 * The local client (spec §21): what `getSupabase()` hands the seam when no Supabase project
 * is configured. It answers the same calls the seam makes of the Supabase client — `from`,
 * `rpc` and `auth` — from the local database (`src/lib/localDatabase.ts`), so the seam is the
 * same code whichever of the two stands behind it.
 *
 * A local copy has no accounts: one person, always there, whose work stays on the device.
 */
import type { LocalAnswer, LocalFilter, LocalQuery, LocalRequest, LocalRow } from "./localDatabase";
import { LOCAL_USER_ID, emptyTables, parseTables, runLocalRequest, serializeTables } from "./localDatabase";
import { randomId } from "./transforms";

/** Where a request is run and its tables are kept. */
export interface LocalBackend {
  send(request: LocalRequest): Promise<LocalAnswer>;
}

/** The part of the browser's storage the local database needs. */
export type LocalStore = Pick<Storage, "getItem" | "setItem">;

export const LOCAL_DATABASE_KEY = "compass.localDatabase";

/**
 * Keeps the tables in the browser's storage, as one text under one key. Each request reads
 * the text, runs, and writes the text back within one turn of the page, so two windows on
 * the same storage never write over each other's work.
 *
 * A text it cannot read is left as it is and every request is refused: a copy that will not
 * open is never mistaken for an empty one.
 */
export function browserBackend(store: () => LocalStore, key: string = LOCAL_DATABASE_KEY): LocalBackend {
  return {
    send(request) {
      return Promise.resolve().then(() => {
        let tables;
        try {
          const kept = store().getItem(key);
          tables = kept === null ? emptyTables() : parseTables(kept);
        } catch {
          return refused("COMPASS_LOCAL_UNREADABLE", "the data saved on this device could not be read");
        }
        const outcome = runLocalRequest(tables, request, {
          now: () => new Date().toISOString(),
          newId: randomId,
        });
        if (outcome.tables === tables) return outcome.answer;
        try {
          store().setItem(key, serializeTables(outcome.tables));
        } catch {
          return refused("COMPASS_LOCAL_NOT_SAVED", "this device's storage did not take the save");
        }
        return outcome.answer;
      });
    },
  };
}

function refused(code: string, message: string): LocalAnswer {
  return { data: null, error: { code, message, details: "", hint: "" }, count: null, status: 0, statusText: "" };
}

export interface LocalClient {
  /** The mark the seam reads to know this copy keeps its data on the device. */
  readonly storesOnThisDevice: true;
  from(table: string): LocalQueryBuilder;
  rpc(fn: string, args?: LocalRow): PromiseLike<LocalAnswer>;
  auth: LocalAuth;
}

export function createLocalClient(backend: LocalBackend): LocalClient {
  return {
    storesOnThisDevice: true,
    from: (table) => new LocalQueryBuilder(backend, table),
    rpc: (fn, args = {}) => backend.send({ kind: "rpc", fn, args }),
    auth: localAuth(),
  };
}

/** One request being put together, sent when it is awaited. */
export class LocalQueryBuilder implements PromiseLike<LocalAnswer> {
  private readonly query: LocalQuery;

  constructor(
    private readonly backend: LocalBackend,
    table: string,
  ) {
    this.query = {
      kind: "select",
      table,
      payload: null,
      filters: [],
      ordering: [],
      limit: null,
      shape: "rows",
      columns: null,
    };
  }

  select(columns: string = "*"): this {
    this.query.columns = columns;
    return this;
  }
  insert(payload: LocalRow | LocalRow[]): this {
    this.query.kind = "insert";
    this.query.payload = payload;
    return this;
  }
  update(payload: LocalRow): this {
    this.query.kind = "update";
    this.query.payload = payload;
    return this;
  }
  delete(): this {
    this.query.kind = "delete";
    return this;
  }

  private where(op: string, column: string, value: unknown): this {
    const filter: LocalFilter = { column, op, value };
    this.query.filters.push(filter);
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
  order(column: string, options: { ascending?: boolean } = {}): this {
    this.query.ordering.push({ column, ascending: options.ascending ?? true });
    return this;
  }
  limit(count: number): this {
    this.query.limit = count;
    return this;
  }
  single(): this {
    this.query.shape = "single";
    return this;
  }
  maybeSingle(): this {
    this.query.shape = "maybeSingle";
    return this;
  }

  then<R1 = LocalAnswer, R2 = never>(
    onFulfilled?: ((value: LocalAnswer) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    const request: LocalQuery = {
      ...this.query,
      filters: [...this.query.filters],
      ordering: [...this.query.ordering],
    };
    return this.backend.send(request).then(onFulfilled, onRejected);
  }
}

type AuthAnswer = { data: Record<string, unknown>; error: { message: string } | null };

export interface LocalAuth {
  getSession(): Promise<{ data: { session: { user: { id: string; email: string } } }; error: null }>;
  onAuthStateChange(listener: unknown): { data: { subscription: { unsubscribe(): void } } };
  signOut(): Promise<{ error: null }>;
  signInWithOAuth(): Promise<AuthAnswer>;
  signInWithPassword(): Promise<AuthAnswer>;
  signUp(): Promise<AuthAnswer>;
  resend(): Promise<AuthAnswer>;
  resetPasswordForEmail(): Promise<AuthAnswer>;
  updateUser(): Promise<AuthAnswer>;
  verifyOtp(): Promise<AuthAnswer>;
}

/**
 * The seam's auth calls, answered for a copy with no accounts: the one person is always
 * signed in, who they are never changes, signing out does nothing, and every call that needs
 * an account is refused.
 */
function localAuth(): LocalAuth {
  const noAccounts = (): Promise<AuthAnswer> =>
    Promise.resolve({ data: {}, error: { message: "this copy of Compass has no accounts" } });
  return {
    getSession: () =>
      Promise.resolve({ data: { session: { user: { id: LOCAL_USER_ID, email: "" } } }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    signOut: () => Promise.resolve({ error: null }),
    signInWithOAuth: noAccounts,
    signInWithPassword: noAccounts,
    signUp: noAccounts,
    resend: noAccounts,
    resetPasswordForEmail: noAccounts,
    updateUser: noAccounts,
    verifyOtp: noAccounts,
  };
}
