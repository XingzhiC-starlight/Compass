import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setTestUser,
  addTask,
  getProjectDashboardData,
  onWriteError,
  renameProject,
  savesInFlight,
  setActiveProject,
  updateTask,
  whenSavesSettle,
  type WriteFailure,
} from "../db";
import { createFakeSupabase, type FakeSupabase } from "../fakeSupabase";

const holder = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../supabase", () => ({
  getSupabase: () =>
    new Proxy(
      {},
      {
        get(_t, key) {
          const client = (holder.current as { client: Record<string | symbol, unknown> }).client;
          const member = client[key];
          return typeof member === "function" ? member.bind(client) : member;
        },
      },
    ),
}));

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

describe("saves in flight", () => {
  it("counts a save from its call until it answers, and never a read", async () => {
    expect(savesInFlight()).toBe(0);
    const release = fake.holdNext("daily_tasks", "update");
    const save = updateTask("t1", { text: "Draft two" });
    expect(savesInFlight()).toBe(1);

    const read = getProjectDashboardData("p1");
    expect(savesInFlight()).toBe(1);
    await read;

    release();
    expect(await save).toBe(true);
    expect(savesInFlight()).toBe(0);
  });

  it("counts a failed save until it answers, and a rejected one too", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    fake.failNext("projects", "update");
    const failing = renameProject("Beacon");
    expect(savesInFlight()).toBe(1);
    await failing;
    expect(savesInFlight()).toBe(0);

    fake.failNext("daily_tasks", "insert");
    const rejecting = addTask("Write");
    expect(savesInFlight()).toBe(1);
    await expect(rejecting).rejects.toMatchObject({ name: "SaveFailedError" });
    expect(savesInFlight()).toBe(0);
  });

  it("whenSavesSettle resolves at once when idle, else when the last save ends — one started while waiting included", async () => {
    let settled = false;
    await whenSavesSettle();

    const releaseFirst = fake.holdNext("daily_tasks", "update");
    const first = updateTask("t1", { text: "a" });
    const waiting = whenSavesSettle().then(() => {
      settled = true;
    });

    const releaseSecond = fake.holdNext("projects", "update");
    const second = renameProject("Harbor");

    releaseFirst();
    await first;
    await Promise.resolve();
    expect(settled).toBe(false);

    releaseSecond();
    await second;
    await waiting;
    expect(settled).toBe(true);
    expect(savesInFlight()).toBe(0);
  });
});
