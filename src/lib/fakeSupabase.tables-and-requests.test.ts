import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "./fakeSupabase";

const sessions = () => [
  { id: "a", project_id: "p1", session_date: "2026-09-20", ended_at: null, duration_seconds: 0, started_at: "2026-09-20T10:00:00.000Z" },
  { id: "b", project_id: "p1", session_date: "2026-09-21", ended_at: "2026-09-21T11:00:00.000Z", duration_seconds: 3600, started_at: "2026-09-21T10:00:00.000Z" },
  { id: "c", project_id: "p2", session_date: "2026-09-21", ended_at: null, duration_seconds: 0, started_at: "2026-09-21T12:00:00.000Z" },
];

describe("fake Supabase client", () => {
  it("answers a select through eq, is, lt, gte, neq and not, with order and limit", async () => {
    const fake = createFakeSupabase({ time_sessions: sessions() });
    const sb = fake.client;

    const running = await sb.from("time_sessions").select("id").is("ended_at", null);
    expect(running.error).toBeNull();
    expect((running.data as { id: string }[]).map((r) => r.id)).toEqual(["a", "c"]);

    const stale = await sb.from("time_sessions").select("*").is("ended_at", null).lt("session_date", "2026-09-21");
    expect((stale.data as { id: string }[]).map((r) => r.id)).toEqual(["a"]);

    const since = await sb.from("time_sessions").select("*").eq("project_id", "p1").gte("session_date", "2026-09-21");
    expect((since.data as { id: string }[]).map((r) => r.id)).toEqual(["b"]);

    const others = await sb.from("time_sessions").select("*").neq("id", "b");
    expect((others.data as { id: string }[]).map((r) => r.id)).toEqual(["a", "c"]);

    const ended = await sb.from("time_sessions").select("*").not("ended_at", "is", null);
    expect((ended.data as { id: string }[]).map((r) => r.id)).toEqual(["b"]);

    const latest = await sb
      .from("time_sessions")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(1);
    expect((latest.data as { id: string }[]).map((r) => r.id)).toEqual(["c"]);
  });

  it("answers single and maybeSingle the way PostgREST does", async () => {
    const fake = createFakeSupabase({ time_sessions: sessions() });
    const sb = fake.client;

    const one = await sb.from("time_sessions").select("*").eq("id", "b").maybeSingle();
    expect(one.error).toBeNull();
    expect((one.data as { id: string }).id).toBe("b");

    const none = await sb.from("time_sessions").select("*").eq("id", "zzz").maybeSingle();
    expect(none.error).toBeNull();
    expect(none.data).toBeNull();

    const several = await sb.from("time_sessions").select("*").eq("project_id", "p1").maybeSingle();
    expect(several.data).toBeNull();
    expect(several.error?.code).toBe("PGRST116");

    const strictNone = await sb.from("time_sessions").select("*").eq("id", "zzz").single();
    expect(strictNone.data).toBeNull();
    expect(strictNone.error?.code).toBe("PGRST116");
  });

  it("applies insert, update and delete, answering rows only after select()", async () => {
    const fake = createFakeSupabase({ time_sessions: sessions() });
    const sb = fake.client;

    const silent = await sb.from("time_sessions").insert({ project_id: "p1", session_date: "2026-09-22" });
    expect(silent.error).toBeNull();
    expect(silent.data).toBeNull();
    expect(fake.rows("time_sessions")).toHaveLength(4);
    const stamped = fake.rows("time_sessions")[3];
    expect(typeof stamped.id).toBe("string");
    expect(typeof stamped.created_at).toBe("string");

    const returned = await sb
      .from("time_sessions")
      .insert({ project_id: "p2", session_date: "2026-09-22" })
      .select()
      .single();
    expect(returned.error).toBeNull();
    expect((returned.data as { project_id: string }).project_id).toBe("p2");
    expect(fake.rows("time_sessions")).toHaveLength(5);

    const updated = await sb.from("time_sessions").update({ duration_seconds: 60 }).eq("id", "a");
    expect(updated.error).toBeNull();
    expect(updated.data).toBeNull();
    expect(fake.rows("time_sessions").find((r) => r.id === "a")?.duration_seconds).toBe(60);

    const removed = await sb.from("time_sessions").delete().eq("project_id", "p1").eq("session_date", "2026-09-21");
    expect(removed.error).toBeNull();
    expect(fake.rows("time_sessions").map((r) => r.id)).not.toContain("b");
    expect(fake.rows("time_sessions")).toHaveLength(4);
  });

  it("an armed failure answers an error object, changes nothing, and is spent", async () => {
    const fake = createFakeSupabase({ time_sessions: sessions() });
    const sb = fake.client;
    fake.failNext("time_sessions", "update");

    const failed = await sb.from("time_sessions").update({ duration_seconds: 99 }).eq("id", "a");
    expect(failed.data).toBeNull();
    expect(failed.error?.message).toBe("TypeError: Failed to fetch");
    expect(fake.rows("time_sessions").find((r) => r.id === "a")?.duration_seconds).toBe(0);

    const next = await sb.from("time_sessions").update({ duration_seconds: 99 }).eq("id", "a");
    expect(next.error).toBeNull();
    expect(fake.rows("time_sessions").find((r) => r.id === "a")?.duration_seconds).toBe(99);

    fake.failNext("time_sessions", "delete", "boom");
    const read = await sb.from("time_sessions").select("*");
    expect(read.error).toBeNull();
    const del = await sb.from("time_sessions").delete().eq("id", "zzz");
    expect(del.error?.message).toBe("boom");
  });

  it("an armed failure can carry the database's own code, details and hint", async () => {
    const fake = createFakeSupabase();
    fake.failNext("thoughts", "insert", { code: "23514", details: "Failing row contains (MARKER)" });
    fake.failNext("thoughts", "insert", "offline");

    const refused = await fake.client.from("thoughts").insert({ text: "MARKER" });
    expect(refused.error).toEqual({
      message: "TypeError: Failed to fetch",
      details: "Failing row contains (MARKER)",
      hint: "",
      code: "23514",
    });
    const dropped = await fake.client.from("thoughts").insert({ text: "x" });
    expect(dropped.error).toEqual({ message: "offline", details: "", hint: "", code: "" });
    expect(fake.rows("thoughts")).toEqual([]);
  });

  it("a held request waits, unapplied and unlogged, until it is released", async () => {
    const fake = createFakeSupabase();
    const release = fake.holdNext("daily_tasks", "insert");
    let answered = false;
    const held = Promise.resolve(fake.client.from("daily_tasks").insert({ text: "a" })).then((r) => {
      answered = true;
      return r;
    });
    await fake.client.from("daily_tasks").insert({ text: "b" });

    await Promise.resolve();
    expect(answered).toBe(false);
    expect(fake.rows("daily_tasks").map((r) => r.text)).toEqual(["b"]);
    expect(fake.requests).toHaveLength(1);

    release();
    expect((await held).error).toBeNull();
    expect(fake.rows("daily_tasks").map((r) => r.text)).toEqual(["b", "a"]);
    expect(fake.requests).toHaveLength(2);

    const early = fake.holdNext("daily_tasks", "delete");
    early();
    expect((await fake.client.from("daily_tasks").delete().eq("text", "a")).error).toBeNull();
    expect(fake.rows("daily_tasks").map((r) => r.text)).toEqual(["b"]);
  });

  it("logs every request in order with its filters, payload and answer", async () => {
    const fake = createFakeSupabase();
    const sb = fake.client;
    fake.failNext("time_sessions", "insert");

    await sb.from("time_sessions").select("id").is("ended_at", null);
    await sb.from("time_sessions").insert({ project_id: "p1" });
    await sb.from("time_sessions").update({ ended_at: "x" }).eq("id", "a");

    expect(fake.requests.map((r) => [r.table, r.operation, r.error === null])).toEqual([
      ["time_sessions", "select", true],
      ["time_sessions", "insert", false],
      ["time_sessions", "update", true],
    ]);
    expect(fake.requests[0].filters).toEqual([{ column: "ended_at", op: "is", value: null }]);
    expect(fake.requests[2].payload).toEqual({ ended_at: "x" });
    expect(fake.rows("time_sessions")).toEqual([]);
  });

  it("hands back copies, so a test cannot change stored rows by accident", async () => {
    const fake = createFakeSupabase({ time_sessions: sessions() });
    const copy = fake.rows("time_sessions")[0];
    copy.duration_seconds = 12345;
    expect(fake.rows("time_sessions")[0].duration_seconds).toBe(0);

    const read = await fake.client.from("time_sessions").select("*").eq("id", "a").single();
    (read.data as { duration_seconds: number }).duration_seconds = 777;
    expect(fake.rows("time_sessions")[0].duration_seconds).toBe(0);
  });
});
