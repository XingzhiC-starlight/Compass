import { describe, expect, it } from "vitest";
import { LOCAL_DATABASE_KEY, browserBackend, createLocalClient, type LocalStore } from "./localClient";
import { LOCAL_USER_ID, parseTables } from "./localDatabase";

const CHECK =
  "The local client keeps the tables in the device's storage: what one window saves another reads, a save never writes over another window's, a text it cannot read is left alone, and a save the storage refuses is reported and not shown as made";

function memoryStore(start: Record<string, string> = {}) {
  const held = new Map(Object.entries(start));
  const store: LocalStore = {
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => {
      held.set(key, value);
    },
  };
  return { store, held };
}

const PROJECT = {
  name: "Garden",
  accent_color: "#9A7B4F",
  sort_order: 0,
  total_days: 30,
  hours_planned_per_day: 2,
  hours_available_per_day: 3,
  started_at: "2026-09-22",
};

describe("the local client and the device's storage", () => {
  it(`${CHECK} — a row saved through one client is read by another client on the same storage`, async () => {
    const { store, held } = memoryStore();
    const first = createLocalClient(browserBackend(() => store));
    const { data: made, error } = await first.from("projects").insert(PROJECT).select().single();
    expect(error).toBeNull();

    expect(parseTables(held.get(LOCAL_DATABASE_KEY)!).projects).toHaveLength(1);

    const second = createLocalClient(browserBackend(() => store));
    const { data: read } = await second.from("projects").select("*").eq("id", (made as { id: string }).id).maybeSingle();
    expect(read).toMatchObject({ name: "Garden", user_id: LOCAL_USER_ID });
  });

  it(`${CHECK} — two windows that each save keep both saves`, async () => {
    const { store } = memoryStore();
    const one = createLocalClient(browserBackend(() => store));
    const other = createLocalClient(browserBackend(() => store));
    await Promise.all([
      one.from("projects").insert({ ...PROJECT, name: "From one window" }),
      other.from("projects").insert({ ...PROJECT, name: "From the other", sort_order: 1 }),
    ]);
    const { data } = await one.from("projects").select("name").order("sort_order");
    expect(data).toEqual([{ name: "From one window" }, { name: "From the other" }]);
  });

  it(`${CHECK} — a read writes nothing to the storage`, async () => {
    const { store, held } = memoryStore();
    const client = createLocalClient(browserBackend(() => store));
    await client.from("projects").select("*");
    await client.from("projects").delete().eq("id", "11111111-1111-4111-8111-111111111111");
    expect(held.has(LOCAL_DATABASE_KEY)).toBe(false);
  });

  it(`${CHECK} — a kept text it cannot read is left exactly as it is, and every request is refused`, async () => {
    const unreadable = '{"format":"compass-local-database","version":99,"tables":{}}';
    const { store, held } = memoryStore({ [LOCAL_DATABASE_KEY]: unreadable });
    const client = createLocalClient(browserBackend(() => store));

    const read = await client.from("projects").select("*");
    expect(read.data).toBeNull();
    expect(read.error?.code).toBe("COMPASS_LOCAL_UNREADABLE");

    const write = await client.from("projects").insert(PROJECT);
    expect(write.error?.code).toBe("COMPASS_LOCAL_UNREADABLE");
    expect(held.get(LOCAL_DATABASE_KEY)).toBe(unreadable);
  });

  it(`${CHECK} — a save the storage refuses is answered as a failed save, and the row is not there afterwards`, async () => {
    const { store } = memoryStore();
    let full = true;
    const refusing: LocalStore = {
      getItem: (key) => store.getItem(key),
      setItem: (key, value) => {
        if (full) throw new Error("QuotaExceededError");
        store.setItem(key, value);
      },
    };
    const client = createLocalClient(browserBackend(() => refusing));

    const refused = await client.from("projects").insert(PROJECT).select().single();
    expect(refused.data).toBeNull();
    expect(refused.error?.code).toBe("COMPASS_LOCAL_NOT_SAVED");
    expect((await client.from("projects").select("*")).data).toEqual([]);

    full = false;
    expect((await client.from("projects").insert(PROJECT)).error).toBeNull();
    expect((await client.from("projects").select("*")).data).toHaveLength(1);
  });

  it(`${CHECK} — storage that cannot be reached at all refuses the request instead of throwing`, async () => {
    const client = createLocalClient(
      browserBackend(() => {
        throw new Error("SecurityError: storage is switched off");
      }),
    );
    const answer = await client.from("projects").select("*");
    expect(answer.error?.code).toBe("COMPASS_LOCAL_UNREADABLE");
  });

  it(`${CHECK} — the setup's save goes through the same storage`, async () => {
    const { store } = memoryStore();
    const client = createLocalClient(browserBackend(() => store));
    const { data, error } = await client.rpc("save_interview", {
      p_project_id: "9d1c2b3a-4e5f-4a6b-8c7d-0e1f2a3b4c5d",
      p_name: "Garden",
      p_accent_color: "#9A7B4F",
      p_sort_order: 0,
      p_total_days: 30,
      p_hours_planned_per_day: 2,
      p_hours_available_per_day: 3,
      p_started_at: "2026-09-22",
      p_phases: [{ name: "Dig", est_days: 3 }],
      p_learning_items: [{ name: "Soil", progress_pct: 10, is_focus: true }],
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ name: "Garden" });

    const again = createLocalClient(browserBackend(() => store));
    expect((await again.from("phases").select("name")).data).toEqual([{ name: "Dig" }]);
  });
});

describe("the local client has no accounts", () => {
  it("one person is always signed in, who they are never changes, signing out does nothing, and a call that needs an account is refused", async () => {
    const client = createLocalClient(browserBackend(() => memoryStore().store));
    expect(client.storesOnThisDevice).toBe(true);

    const { data } = await client.auth.getSession();
    expect(data.session.user).toEqual({ id: LOCAL_USER_ID, email: "" });

    let told = 0;
    const { data: listening } = client.auth.onAuthStateChange(() => {
      told += 1;
    });
    expect((await client.auth.signOut()).error).toBeNull();
    expect((await client.auth.getSession()).data.session.user.id).toBe(LOCAL_USER_ID);
    listening.subscription.unsubscribe();
    expect(told).toBe(0);

    for (const call of [
      client.auth.signInWithOAuth,
      client.auth.signInWithPassword,
      client.auth.signUp,
      client.auth.resend,
      client.auth.resetPasswordForEmail,
      client.auth.updateUser,
      client.auth.verifyOtp,
    ]) {
      expect((await call()).error?.message).toMatch(/no accounts/);
    }
  });
});
