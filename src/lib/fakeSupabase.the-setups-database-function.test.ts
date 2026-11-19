import { describe, expect, it } from "vitest";
import { createFakeSupabase, SAVE_INTERVIEW_PARAMETERS, type FakeRow } from "./fakeSupabase";

function setupArgs(overrides: FakeRow = {}): FakeRow {
  return {
    p_project_id: "11111111-1111-4111-8111-111111111111",
    p_name: "Garden",
    p_accent_color: "#7BC8B2",
    p_sort_order: 2,
    p_total_days: 30,
    p_hours_planned_per_day: 2,
    p_hours_available_per_day: 3,
    p_started_at: "2026-09-22",
    p_phases: [
      { name: "Dig", est_days: 3 },
      { name: "Plant", est_days: 5 },
    ],
    p_learning_items: [
      { name: "Soil", progress_pct: 10, is_focus: true },
      { name: "Seeds", progress_pct: 50, is_focus: false },
    ],
    ...overrides,
  };
}

describe("fake Supabase client — the setup's database call (save_interview)", () => {
  it("writes the project, its phases and its learning items together and answers the project", async () => {
    const fake = createFakeSupabase({ projects: [{ id: "old", name: "Older", sort_order: 0, archived_at: null }] });

    const answer = await fake.client.rpc("save_interview", setupArgs());
    expect(answer.error).toBeNull();
    expect(answer.data).toMatchObject({ id: setupArgs().p_project_id, name: "Garden", sort_order: 2, archived_at: null });

    expect(fake.rows("projects").map((r) => r.id)).toEqual(["old", setupArgs().p_project_id]);
    const project = fake.rows("projects")[1];
    expect(project).toMatchObject({
      accent_color: "#7BC8B2",
      total_days: 30,
      hours_planned_per_day: 2,
      hours_available_per_day: 3,
      started_at: "2026-09-22",
    });
    expect(fake.rows("phases").map((r) => [r.project_id, r.name, r.est_days, r.sort_order, r.is_done, r.completed_at])).toEqual([
      [project.id, "Dig", 3, 0, false, null],
      [project.id, "Plant", 5, 1, false, null],
    ]);
    expect(fake.rows("learning_items").map((r) => [r.project_id, r.name, r.progress_pct, r.sort_order, r.is_focus])).toEqual([
      [project.id, "Soil", 10, 0, true],
      [project.id, "Seeds", 50, 1, false],
    ]);
    expect(fake.requests.map((r) => [r.table, r.operation, r.error])).toEqual([["save_interview", "rpc", null]]);
    expect(fake.requests[0].payload).toEqual(setupArgs());
  });

  it("answers an id it already holds with that project, unchanged, and writes nothing", async () => {
    const fake = createFakeSupabase();
    await fake.client.rpc("save_interview", setupArgs());

    const again = await fake.client.rpc(
      "save_interview",
      setupArgs({ p_name: "Renamed", p_phases: [{ name: "Other", est_days: 9 }], p_learning_items: [] }),
    );
    expect(again.error).toBeNull();
    expect(again.data).toMatchObject({ id: setupArgs().p_project_id, name: "Garden" });
    expect(fake.rows("projects")).toHaveLength(1);
    expect(fake.rows("phases").map((r) => r.name)).toEqual(["Dig", "Plant"]);
    expect(fake.rows("learning_items")).toHaveLength(2);

    const other = await fake.client.rpc("save_interview", setupArgs({ p_project_id: "22222222-2222-4222-8222-222222222222" }));
    expect(other.error).toBeNull();
    expect(fake.rows("projects")).toHaveLength(2);
  });

  it("an armed failure keeps nothing of the setup and is spent", async () => {
    const fake = createFakeSupabase();
    fake.failNext("save_interview", "rpc", { code: "23514", message: "new row violates check constraint" });

    const refused = await fake.client.rpc("save_interview", setupArgs());
    expect(refused.data).toBeNull();
    expect(refused.error?.code).toBe("23514");
    expect(fake.rows("projects")).toEqual([]);
    expect(fake.rows("phases")).toEqual([]);
    expect(fake.rows("learning_items")).toEqual([]);

    const next = await fake.client.rpc("save_interview", setupArgs());
    expect(next.error).toBeNull();
    expect(fake.rows("projects")).toHaveLength(1);
  });

  it("a lost reply lands in full, answers a dropped connection, and the retry finds the project", async () => {
    const fake = createFakeSupabase();
    fake.loseReplyNext("save_interview", "rpc");

    const lost = await fake.client.rpc("save_interview", setupArgs());
    expect(lost.data).toBeNull();
    expect(lost.error).toEqual({ message: "TypeError: Failed to fetch", details: "", hint: "", code: "" });
    expect(fake.rows("projects")).toHaveLength(1);
    expect(fake.rows("phases")).toHaveLength(2);
    expect(fake.rows("learning_items")).toHaveLength(2);
    expect(fake.requests[0].error?.message).toBe("TypeError: Failed to fetch");

    const retry = await fake.client.rpc("save_interview", setupArgs({ p_name: "Edited" }));
    expect(retry.error).toBeNull();
    expect(retry.data).toMatchObject({ name: "Garden" });
    expect(fake.rows("projects")).toHaveLength(1);
  });

  it("a lost reply works on a table too, and an armed failure for the same request wins", async () => {
    const fake = createFakeSupabase();
    fake.loseReplyNext("thoughts", "insert");
    const lost = await fake.client.from("thoughts").insert({ text: "a" }).select().single();
    expect(lost.data).toBeNull();
    expect(lost.error?.message).toBe("TypeError: Failed to fetch");
    expect(fake.rows("thoughts").map((r) => r.text)).toEqual(["a"]);

    fake.loseReplyNext("thoughts", "insert");
    fake.failNext("thoughts", "insert");
    const refused = await fake.client.from("thoughts").insert({ text: "b" });
    expect(refused.error?.message).toBe("TypeError: Failed to fetch");
    expect(fake.rows("thoughts").map((r) => r.text)).toEqual(["a"]);
    await fake.client.from("thoughts").insert({ text: "c" });
    expect(fake.requests[fake.requests.length - 1].error?.message).toBe("TypeError: Failed to fetch");
    expect(fake.rows("thoughts").map((r) => r.text)).toEqual(["a", "c"]);
  });

  it("answers an unknown function, or arguments the function does not declare, with PGRST202", async () => {
    const fake = createFakeSupabase();

    const unknown = await fake.client.rpc("make_project", setupArgs());
    expect(unknown.data).toBeNull();
    expect(unknown.error?.code).toBe("PGRST202");

    const { p_sort_order: _dropped, ...missing } = setupArgs();
    const short = await fake.client.rpc("save_interview", missing);
    expect(short.error?.code).toBe("PGRST202");

    const extra = await fake.client.rpc("save_interview", setupArgs({ p_user_id: "someone" }));
    expect(extra.error?.code).toBe("PGRST202");
    expect(fake.rows("projects")).toEqual([]);
    expect(Object.keys(setupArgs()).sort()).toEqual([...SAVE_INTERVIEW_PARAMETERS].sort());
  });

  it("a held call waits, unapplied, until it is released", async () => {
    const fake = createFakeSupabase();
    const release = fake.holdNext("save_interview", "rpc");
    let answered = false;
    const held = Promise.resolve(fake.client.rpc("save_interview", setupArgs())).then((r) => {
      answered = true;
      return r;
    });
    const other = { ...setupArgs(), p_project_id: "33333333-3333-4333-8333-333333333333" };
    await fake.client.rpc("save_interview", other);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(answered).toBe(false);
    expect(fake.rows("projects").map((r) => r.id)).toEqual([other.p_project_id]);

    release();
    expect((await held).error).toBeNull();
    expect(fake.rows("projects").map((r) => r.id)).toEqual([other.p_project_id, setupArgs().p_project_id]);
  });

  it("a missing is_focus is false, and a list that is not a list is refused, never thrown", async () => {
    const fake = createFakeSupabase();
    const noFocus = await fake.client.rpc("save_interview", setupArgs({ p_learning_items: [{ name: "Soil", progress_pct: 10 }] }));
    expect(noFocus.error).toBeNull();
    expect(fake.rows("learning_items")[0].is_focus).toBe(false);

    const notAList = await fake.client.rpc(
      "save_interview",
      setupArgs({ p_project_id: "44444444-4444-4444-8444-444444444444", p_phases: { name: "Dig" } }),
    );
    expect(notAList.data).toBeNull();
    expect(notAList.error?.code).toBe("22023");
    expect(fake.rows("projects")).toHaveLength(1);
  });
});
