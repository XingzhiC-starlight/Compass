import { afterEach, describe, expect, it, vi } from "vitest";

const CHECK =
  "With a Supabase project configured the seam talks to that project; with none it keeps the data on this device and has no accounts; with half a configuration it stops and says so (I19)";

const made = vi.hoisted(() => ({ clients: [] as unknown[][] }));

vi.mock("@supabase/supabase-js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@supabase/supabase-js")>();
  return {
    ...original,
    createClient: (...args: unknown[]) => {
      made.clients.push(args);
      return { madeUpHostedClient: made.clients.length };
    },
  };
});

const MADE_UP_ADDRESS = "http://127.0.0.1:55321";
const MADE_UP_KEY = "sb_publishable_made_up_for_the_test";

async function freshModules(env: { url: string; key: string }) {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", env.url);
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", env.key);
  made.clients.length = 0;
  const db = await import("./db");
  const { getSupabase } = await import("./supabase");
  return { db, getSupabase };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  window.localStorage.clear();
});

describe("which database stands behind the seam", () => {
  it(`${CHECK} — with no project configured: the local client, made on first use and only once, and no hosted client`, async () => {
    const { db, getSupabase } = await freshModules({ url: "", key: "" });
    expect(made.clients.length).toBe(0);

    const first = getSupabase();
    expect(getSupabase(), "the second use hands back the same client").toBe(first);
    expect(made.clients.length, "no hosted client was made").toBe(0);
    expect(db.storesOnThisDevice()).toBe(true);

    expect(await db.getCurrentUser(), "the one person is there without signing in").toMatchObject({ email: "" });
    expect(await db.listProjects()).toEqual([]);
  });

  it(`${CHECK} — with a project configured: that project's client, and the seam says the data is not on this device`, async () => {
    const { db, getSupabase } = await freshModules({ url: MADE_UP_ADDRESS, key: MADE_UP_KEY });
    getSupabase();
    expect(made.clients).toEqual([[MADE_UP_ADDRESS, MADE_UP_KEY]]);
    expect(db.storesOnThisDevice()).toBe(false);
  });

  it.each([
    ["the address alone", { url: MADE_UP_ADDRESS, key: "" }],
    ["the key alone", { url: "", key: MADE_UP_KEY }],
  ])(`${CHECK} — with %s: it stops, names both values, and makes no client of either kind`, async (_what, env) => {
    const { getSupabase } = await freshModules(env);
    expect(() => getSupabase()).toThrow(/VITE_SUPABASE_URL.*VITE_SUPABASE_ANON_KEY/s);
    expect(made.clients.length).toBe(0);
    expect(window.localStorage.length, "nothing was kept on the device").toBe(0);
  });
});
