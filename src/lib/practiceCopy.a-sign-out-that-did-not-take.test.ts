import { beforeEach, describe, expect, it, vi } from "vitest";

const stand = vi.hoisted(() => ({
  session: null as null | { access_token: string },
  client: {} as Record<string, unknown>,
}));

vi.mock("./db", () => ({
  getCurrentUser: vi.fn(async () => null),
  signInWithEmail: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
}));

vi.mock("./supabase", () => ({
  getSupabase: () => stand.client,
}));

import { signedOutConnection } from "./practiceCopy";

beforeEach(() => {
  stand.client = { auth: { getSession: async () => ({ data: { session: stand.session }, error: null }) } };
});

describe("the connection for someone not signed in, after a sign-out that did not take", () => {
  it("refuses to hand over a connection while the page still holds a session, and names how to remake the practice copy", async () => {
    stand.session = { access_token: "a made-up session" };
    await expect(signedOutConnection()).rejects.toThrow(/sign-out did not take[\s\S]*npm run practice:reset/);
  });

  it("hands over the seam's own client once the page holds no session", async () => {
    stand.session = null;
    await expect(signedOutConnection()).resolves.toBe(stand.client);
  });
});
