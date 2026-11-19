import { beforeEach, describe, expect, it, vi } from "vitest";
import { removeLearningItem, setActiveProject, setFocusItem } from "../db";

type Write = {
  operation: "delete" | "update";
  payload?: Record<string, unknown>;
  filters: [string, unknown][];
};

const supabase = vi.hoisted(() => {
  const writes: Write[] = [];

  function query(operation: Write["operation"], payload?: Record<string, unknown>) {
    const write: Write = { operation, payload, filters: [] };
    const builder = {
      eq(column: string, value: unknown) {
        write.filters.push([column, value]);
        return builder;
      },
      then(resolve: (value: { error: null }) => unknown) {
        writes.push(write);
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    return builder;
  }

  return {
    writes,
    client: {
      from: () => ({
        delete: () => query("delete"),
        update: (payload: Record<string, unknown>) => query("update", payload),
      }),
    },
  };
});

vi.mock("../supabase", () => ({ getSupabase: () => supabase.client }));

beforeEach(async () => {
  supabase.writes.length = 0;
  await setActiveProject("p1");
});

describe("learning focus persistence", () => {
  it("deletes the focused item before promoting its successor", async () => {
    await removeLearningItem("current", "next");

    expect(supabase.writes).toEqual([
      {
        operation: "delete",
        payload: undefined,
        filters: [["id", "current"], ["project_id", "p1"]],
      },
      {
        operation: "update",
        payload: { is_focus: false },
        filters: [["project_id", "p1"]],
      },
      {
        operation: "update",
        payload: { is_focus: true },
        filters: [["id", "next"], ["project_id", "p1"]],
      },
    ]);
  });

  it("serializes rapid focus changes in user interaction order", async () => {
    await Promise.all([setFocusItem("first"), setFocusItem("second")]);

    expect(supabase.writes.map((write) => write.payload)).toEqual([
      { is_focus: false },
      { is_focus: true },
      { is_focus: false },
      { is_focus: true },
    ]);
    expect(supabase.writes[supabase.writes.length - 1]?.filters).toEqual([
      ["id", "second"],
      ["project_id", "p1"],
    ]);
  });
});
