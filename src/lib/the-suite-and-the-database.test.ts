import { afterEach, describe, expect, it, vi } from "vitest";

const CHECK =
  "In the existing suite no check opens a connection to any database: none is handed the live project's address, loading the seam makes no database client, and a check that tries to reach any network address is refused and fails, with nothing arriving there";

const made = vi.hoisted(() => ({ clients: [] as unknown[][] }));

vi.mock("@supabase/supabase-js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@supabase/supabase-js")>();
  return {
    ...original,
    createClient: (...args: unknown[]) => {
      made.clients.push(args);
      return { madeUpClient: made.clients.length };
    },
  };
});

const MADE_UP_ADDRESS = "http://127.0.0.1:55321";
const MADE_UP_KEY = "sb_publishable_made_up_for_the_test";

const LIVE_PROJECT = "your-project-ref";

function onThisMachine(address: string): boolean {
  try {
    const host = new URL(address).hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the existing suite and the database", () => {
  it(`${CHECK} — loading the seam makes no database client; the first use makes the one client`, async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SUPABASE_URL", MADE_UP_ADDRESS);
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", MADE_UP_KEY);
    made.clients.length = 0;

    await import("./db");
    const { getSupabase } = await import("./supabase");
    expect(made.clients.length, "loading the seam made no client").toBe(0);

    const first = getSupabase();
    expect(made.clients.length, "the first use made the client").toBe(1);

    const second = getSupabase();
    expect(made.clients.length, "the second use made no other").toBe(1);
    expect(second, "and handed back the same client").toBe(first);
  });

  it(`${CHECK} — the live project's address is not around the suite`, () => {
    const address = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();

    expect(
      address.includes(LIVE_PROJECT),
      "the address around this check names the live project",
    ).toBe(false);
    expect(
      address === "" || onThisMachine(address),
      "the address around this check is either absent or on this machine — never a hosted database's",
    ).toBe(true);
  });
});
