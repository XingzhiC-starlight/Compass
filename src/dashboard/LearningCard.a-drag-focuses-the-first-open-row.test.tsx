import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getProjectDashboardData } from "../lib/db";
import { createFakeSupabase, type FakeSupabase } from "../lib/fakeSupabase";
import {
  cardText,
  drag,
  eyebrow,
  glance,
  mount,
  open,
  order,
  startOn,
  taggedRows,
  unmount,
} from "./LearningCard.test.harness";

const holder = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../lib/supabase", () => ({
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

beforeEach(async () => {
  fake = createFakeSupabase({
    projects: [{ id: "p1", name: "Lighthouse", archived_at: null, sort_order: 0 }],
  });
  holder.current = fake;
  await startOn(fake);
});

afterEach(() => {
  unmount();
  vi.restoreAllMocks();
});

async function expectSavedAndReloaded(name: string, pct: number) {
  const saved = fake
    .rows("learning_items")
    .filter((r) => r.project_id === "p1" && r.is_focus === true)
    .map((r) => r.name);
  expect(saved).toEqual([name]);

  unmount();
  const reloaded = (await getProjectDashboardData("p1"))!.learning;
  expect(reloaded.filter((i) => i.isFocus).map((i) => i.name)).toEqual([name]);
  mount(reloaded, false);
  expect(eyebrow()).toBe(`${pct}% · Focus`);
  expect(cardText()).toContain(name);
}

describe("after a drag, the first open row is the focus, wherever the focus sat", () => {
  it("moves the focus from a later open row to the first open row, though the dragged rows all sit below the focus", async () => {
    open([
      ["Typography", 20],
      ["Databases", 100],
      ["Routing", 30, true],
      ["Testing", 40],
      ["Deploys", 50],
    ]);
    await drag("Deploys", "Testing", "before");

    expect(order()).toEqual(["Typography", "Databases", "Routing", "Deploys", "Testing"]);
    expect(taggedRows()).toEqual(["Typography"]);
    const g = glance();
    expect(g.eyebrow).toBe("20% · Focus");
    expect(g.names).toContain("Typography");
    expect(g.names).not.toContain("Routing");
    await expectSavedAndReloaded("Typography", 20);
  });

  it("hands the focus row dragged below several open rows to the first of them, not the nearest above its new place", async () => {
    open([
      ["Routing", 30, true],
      ["Typography", 20],
      ["Testing", 40],
    ]);
    await drag("Routing", "Testing", "after");

    expect(order()).toEqual(["Typography", "Testing", "Routing"]);
    expect(taggedRows()).toEqual(["Typography"]);
    const g = glance();
    expect(g.eyebrow).toBe("20% · Focus");
    expect(g.names).toContain("Typography");
    expect(g.names).not.toContain("Testing");
    await expectSavedAndReloaded("Typography", 20);
  });
});
