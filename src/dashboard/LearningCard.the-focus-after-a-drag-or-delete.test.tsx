import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../lib/fakeSupabase";
import { drag, glance, open, order, press, startOn, taggedRows, unmount } from "./LearningCard.test.harness";

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

beforeEach(async () => {
  const fake = createFakeSupabase({
    projects: [{ id: "p1", name: "Lighthouse", archived_at: null, sort_order: 0 }],
  });
  holder.current = fake;
  await startOn(fake);
});

afterEach(() => {
  unmount();
  vi.restoreAllMocks();
});

describe("the learning focus after a drag", () => {
  it("Dragging an open row to the top makes it the focus.", async () => {
    open([
      ["Typography", 40, true],
      ["Databases", 20],
      ["Routing", 60],
    ]);
    await drag("Routing", "Typography", "before");

    expect(order()).toEqual(["Routing", "Typography", "Databases"]);
    expect(taggedRows()).toEqual(["Routing"]);
    const g = glance();
    expect(g.eyebrow).toBe("60% · Focus");
    expect(g.names).toContain("Routing");
  });

  it("With a completed row at the top and the focus on the open row under it, dragging another open row between them makes the dragged row the focus; the completed row never takes it.", async () => {
    open([
      ["Typography", 100],
      ["Databases", 30, true],
      ["Routing", 70],
    ]);
    await drag("Routing", "Typography", "after");

    expect(order()).toEqual(["Typography", "Routing", "Databases"]);
    expect(taggedRows()).toEqual(["Routing"]);
    const g = glance();
    expect(g.eyebrow).toBe("70% · Focus");
    expect(g.names).toContain("Routing");
    expect(g.names).not.toContain("Typography");
  });

  it("Dragging a completed row to the top leaves the focus on the first open row in the new order.", async () => {
    open([
      ["Typography", 30, true],
      ["Databases", 50],
      ["Routing", 100],
    ]);
    await drag("Routing", "Typography", "before");

    expect(order()).toEqual(["Routing", "Typography", "Databases"]);
    expect(taggedRows()).toEqual(["Typography"]);
    const g = glance();
    expect(g.eyebrow).toBe("30% · Focus");
    expect(g.names).toContain("Typography");
    expect(g.names).not.toContain("Routing");
  });

  it("Dragging the focus row below other open rows makes the first open row in the new order the focus.", async () => {
    open([
      ["Typography", 100],
      ["Databases", 30, true],
      ["Routing", 70],
    ]);
    await drag("Databases", "Routing", "after");

    expect(order()).toEqual(["Typography", "Routing", "Databases"]);
    expect(taggedRows()).toEqual(["Routing"]);
    const g = glance();
    expect(g.eyebrow).toBe("70% · Focus");
    expect(g.names).toContain("Routing");
    expect(g.names).not.toContain("Typography");
  });

  it("When the focus is the first open row, reordering rows that all sit below it does not change the focus.", async () => {
    open([
      ["Typography", 100],
      ["Databases", 30, true],
      ["Routing", 70],
      ["Testing", 10],
    ]);
    await drag("Testing", "Routing", "before");

    expect(order()).toEqual(["Typography", "Databases", "Testing", "Routing"]);
    expect(taggedRows()).toEqual(["Databases"]);
    const g = glance();
    expect(g.eyebrow).toBe("30% · Focus");
    expect(g.names).toContain("Databases");
    expect(g.names).not.toContain("Typography");
  });

  it("With every row complete, a drag leaves the focus where it was.", async () => {
    open([
      ["Typography", 100],
      ["Databases", 100, true],
      ["Routing", 100],
    ]);
    await drag("Routing", "Typography", "before");

    expect(order()).toEqual(["Routing", "Typography", "Databases"]);
    expect(taggedRows()).toEqual(["Databases"]);
    const g = glance();
    expect(g.eyebrow).toBe("100% · Focus");
    expect(g.names).toContain("Databases");
    expect(g.names).not.toContain("Routing");
  });

  it("Complete the focus item at the top so the focus advances to the open row under it, then drag rows below that row: the focus stays on the open row it advanced to.", async () => {
    open([
      ["Typography", 40, true],
      ["Databases", 20],
      ["Routing", 60],
      ["Testing", 80],
    ]);
    await press("Typography", "Mark learning item done");
    expect(taggedRows()).toEqual(["Databases"]);

    await drag("Testing", "Routing", "before");

    expect(order()).toEqual(["Typography", "Databases", "Testing", "Routing"]);
    expect(taggedRows()).toEqual(["Databases"]);
    const g = glance();
    expect(g.eyebrow).toBe("20% · Focus");
    expect(g.names).toContain("Databases");
    expect(g.names).not.toContain("Typography");
  });
});

describe("the learning focus after a delete", () => {
  it("Delete the focus item when the next row is complete and a later row is open: the focus lands on the open row.", async () => {
    open([
      ["Typography", 40, true],
      ["Databases", 100],
      ["Routing", 60],
    ]);
    await press("Typography", "Delete item");

    expect(order()).toEqual(["Databases", "Routing"]);
    expect(taggedRows()).toEqual(["Routing"]);
    const g = glance();
    expect(g.eyebrow).toBe("60% · Focus");
    expect(g.names).toContain("Routing");
    expect(g.names).not.toContain("Databases");
  });

  it("Delete the focus item when every remaining row is complete: the focus lands on the first remaining row.", async () => {
    open([
      ["Typography", 40, true],
      ["Databases", 100],
      ["Routing", 100],
    ]);
    await press("Typography", "Delete item");

    expect(order()).toEqual(["Databases", "Routing"]);
    expect(taggedRows()).toEqual(["Databases"]);
    const g = glance();
    expect(g.eyebrow).toBe("100% · Focus");
    expect(g.names).toContain("Databases");
    expect(g.names).not.toContain("Routing");
  });
});
