import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CREATED,
  cardText,
  drag,
  eyebrow,
  mount,
  open,
  press,
  startOn,
  taggedRows,
  unmount,
  type Spec,
} from "../../dashboard/LearningCard.test.harness";
import { getProjectDashboardData } from "../db";
import { createFakeSupabase, type FakeRow, type FakeSupabase } from "../fakeSupabase";

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

const OTHER_PROJECT: FakeRow[] = [
  { id: "other-1", project_id: "p2", name: "Pottery", sort_order: 0, progress_pct: 100, is_focus: true, created_at: CREATED },
  { id: "other-2", project_id: "p2", name: "Glazing", sort_order: 1, progress_pct: 10, is_focus: false, created_at: CREATED },
];

let fake: FakeSupabase;

beforeEach(async () => {
  fake = createFakeSupabase({
    projects: [
      { id: "p1", name: "Lighthouse", archived_at: null, sort_order: 0 },
      { id: "p2", name: "Studio", archived_at: null, sort_order: 1 },
    ],
    learning_items: OTHER_PROJECT,
  });
  holder.current = fake;
  await startOn(fake);
});

afterEach(() => {
  unmount();
  vi.restoreAllMocks();
});

interface Case {
  name: string;
  roadmap: Spec[];
  act: () => Promise<void>;
  focus: string;
  pct: number;
}

const CASES: Case[] = [
  {
    name: "an open row dragged to the top",
    roadmap: [["Typography", 40, true], ["Databases", 20], ["Routing", 60]],
    act: () => drag("Routing", "Typography", "before"),
    focus: "Routing",
    pct: 60,
  },
  {
    name: "an open row dragged between a completed top row and the focus",
    roadmap: [["Typography", 100], ["Databases", 30, true], ["Routing", 70]],
    act: () => drag("Routing", "Typography", "after"),
    focus: "Routing",
    pct: 70,
  },
  {
    name: "a completed row dragged to the top",
    roadmap: [["Typography", 30, true], ["Databases", 50], ["Routing", 100]],
    act: () => drag("Routing", "Typography", "before"),
    focus: "Typography",
    pct: 30,
  },
  {
    name: "the focus row dragged below another open row",
    roadmap: [["Typography", 100], ["Databases", 30, true], ["Routing", 70]],
    act: () => drag("Databases", "Routing", "after"),
    focus: "Routing",
    pct: 70,
  },
  {
    name: "rows below the first open row reordered",
    roadmap: [["Typography", 100], ["Databases", 30, true], ["Routing", 70], ["Testing", 10]],
    act: () => drag("Testing", "Routing", "before"),
    focus: "Databases",
    pct: 30,
  },
  {
    name: "a drag with every row complete",
    roadmap: [["Typography", 100], ["Databases", 100, true], ["Routing", 100]],
    act: () => drag("Routing", "Typography", "before"),
    focus: "Databases",
    pct: 100,
  },
  {
    name: "the top focus completed, then rows below the advanced focus dragged",
    roadmap: [["Typography", 40, true], ["Databases", 20], ["Routing", 60], ["Testing", 80]],
    act: async () => {
      await press("Typography", "Mark learning item done");
      await drag("Testing", "Routing", "before");
    },
    focus: "Databases",
    pct: 20,
  },
  {
    name: "the focus deleted with a completed next row and a later open row",
    roadmap: [["Typography", 40, true], ["Databases", 100], ["Routing", 60]],
    act: () => press("Typography", "Delete item"),
    focus: "Routing",
    pct: 60,
  },
  {
    name: "the focus deleted with every remaining row complete",
    roadmap: [["Typography", 40, true], ["Databases", 100], ["Routing", 100]],
    act: () => press("Typography", "Delete item"),
    focus: "Databases",
    pct: 100,
  },
];

describe("the saved focus after a drag or a delete", () => {
  for (const c of CASES) {
    it(`After each case above, the saved focus matches the one shown, on exactly one item of the project, and a reload shows the same focus — ${c.name}`, async () => {
      open(c.roadmap);
      await c.act();

      const saved = fake
        .rows("learning_items")
        .filter((r) => r.project_id === "p1" && r.is_focus === true)
        .map((r) => r.name);
      expect(saved).toEqual([c.focus]);

      expect(taggedRows()).toEqual(saved);

      expect(fake.rows("learning_items").filter((r) => r.project_id === "p2")).toEqual(OTHER_PROJECT);

      unmount();
      const reloaded = (await getProjectDashboardData("p1"))!.learning;
      expect(reloaded.filter((i) => i.isFocus).map((i) => i.name)).toEqual([c.focus]);
      expect(reloaded.every((i) => i.projectId === "p1")).toBe(true);
      mount(reloaded, false);
      expect(eyebrow()).toBe(`${c.pct}% · Focus`);
      expect(cardText()).toContain(c.focus);
    });
  }
});
