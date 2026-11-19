import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveInterview } from "../db";
import { createFakeSupabase, SAVE_INTERVIEW_PARAMETERS, type FakeSupabase } from "../fakeSupabase";

const holder = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../supabase", () => ({ getSupabase: () => holder.current }));

async function repoFile(path: string): Promise<string> {
  const fsModule = "node:fs";
  const fs = (await import(/* @vite-ignore */ fsModule)) as { readFileSync(path: string, encoding: "utf8"): string };
  const projectRoot = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  return fs.readFileSync(`${projectRoot}/${path}`, "utf8");
}

function code(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

function parameters(sql: string): [string, string][] {
  const head = /create function public\.save_interview\(([\s\S]*?)\)\s*returns/i.exec(sql);
  if (!head) throw new Error("no create function public.save_interview(…) returns … in the migration");
  return head[1]
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [name, type] = p.split(/\s+/);
      return [name, type.toLowerCase()];
    });
}

function statements(sql: string, keyword: RegExp): string[] {
  return sql.split(";").map((st) => st.trim()).filter((st) => keyword.test(st));
}

let fake: FakeSupabase;
beforeEach(() => {
  fake = createFakeSupabase();
  holder.current = fake.client;
});
afterEach(() => {
  vi.useRealTimers();
});

const SETUP = {
  setupId: "9d1c2b3a-4e5f-4a6b-8c7d-0e1f2a3b4c5d",
  projectName: "Garden",
  totalDays: 30,
  hoursPlannedPerDay: 2,
  hoursAvailablePerDay: 3,
  phases: [{ name: "Dig", estDays: 2.5 }],
  learn: [{ name: "Soil", level: 10 }],
};

describe("the setup's database function (supabase/migrations/0002_save_interview.sql)", () => {
  it("runs as the caller, with an empty search path, and builds no SQL from its input", async () => {
    const sql = code(await repoFile("supabase/migrations/0002_save_interview.sql"));
    expect(sql).toMatch(/\bsecurity invoker\b/i);
    expect(sql).not.toMatch(/\bsecurity definer\b/i);
    expect(sql).toMatch(/set search_path = ''/i);
    expect(sql.replace(/\b(grant|revoke)\s+execute\b/gi, "")).not.toMatch(/\bexecute\b/i);
    expect(sql).not.toMatch(/\bformat\s*\(/i);
  });

  it("may be called only by signed-in people", async () => {
    const sql = code(await repoFile("supabase/migrations/0002_save_interview.sql"));
    const signature = parameters(sql)
      .map(([, type]) => type)
      .join(", ");
    const who = (list: string) => list.split(",").map((r) => r.trim().toLowerCase());
    const revoked: string[] = [];
    const granted: string[] = [];
    for (const st of statements(sql, /^revoke\b/i)) {
      const m = /^revoke execute on function public\.save_interview\(([^)]*)\)\s*from ([\s\S]*)$/i.exec(st);
      expect(m, `a REVOKE on anything else: ${st}`).not.toBeNull();
      expect(m![1].toLowerCase()).toBe(signature);
      revoked.push(...who(m![2]));
    }
    for (const st of statements(sql, /^grant\b/i)) {
      const m = /^grant execute on function public\.save_interview\(([^)]*)\)\s*to ([\s\S]*)$/i.exec(st);
      expect(m, `a GRANT on anything else: ${st}`).not.toBeNull();
      expect(m![1].toLowerCase()).toBe(signature);
      granted.push(...who(m![2]));
    }
    expect(revoked.sort()).toEqual(["anon", "public"]);
    expect(granted).toEqual(["authenticated"]);
    expect(sql).not.toMatch(/alter\s+default\s+privileges/i);
  });

  it("raises only fixed messages, never one built from its input", async () => {
    const sql = code(await repoFile("supabase/migrations/0002_save_interview.sql"));
    const raises = (sql.match(/\braise\b[^;]*/gi) ?? []).map((r) => r.trim());
    expect(raises.length).toBeGreaterThan(0);
    for (const raise of raises) {
      expect(raise, raise).toMatch(/^raise\s+exception\s+'[^'%]*'(\s+using\s+errcode\s*=\s*'[0-9A-Z]{5}')?$/i);
    }
    expect(sql).not.toMatch(/raise\s+(log|notice|info|warning|debug)\b/i);
  });

  it("declares exactly the names the seam sends and the fake expects", async () => {
    const names = parameters(code(await repoFile("supabase/migrations/0002_save_interview.sql"))).map(([name]) => name);
    expect(names).toEqual([...SAVE_INTERVIEW_PARAMETERS]);

    await saveInterview(SETUP);
    const call = fake.requests.find((r) => r.table === "save_interview" && r.operation === "rpc");
    expect(call?.error).toBeNull();
    expect(Object.keys(call!.payload as object).sort()).toEqual([...names].sort());
    expect(call!.payload).not.toHaveProperty("p_user_id");
  });

  it("sends the person's local day as the start day, even when UTC has already turned (I4)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 22, 23, 40, 0));
    expect(new Date().toISOString().slice(0, 10), "harness: UTC has turned").toBe("2026-09-23");

    await saveInterview(SETUP);
    const call = fake.requests.find((r) => r.table === "save_interview" && r.operation === "rpc");
    expect((call!.payload as { p_started_at: string }).p_started_at).toBe("2026-09-22");
    expect(fake.rows("projects")[0].started_at).toBe("2026-09-22");
  });
});

describe("the rolled-back check (supabase/checks/0002_save_interview.sql)", () => {
  it("always ends by raising, so it leaves nothing behind", async () => {
    const sql = code(await repoFile("supabase/checks/0002_save_interview.sql"));
    const body = sql.trim();
    expect(body).toMatch(/^do \$\$/i);
    expect(body).toMatch(/raise exception '0002_save_interview check: all checks passed[^']*';\s*end\s*\$\$;$/i);
    expect(body).not.toMatch(/\b(commit|savepoint|release)\b/i);
  });
});
