import { beforeEach, describe, expect, it, vi } from "vitest";
import { __setTestUser, addPhase, getProjectDashboardData, setActiveProject } from "../db";
import { createFakeSupabase, type FakeRequest, type FakeRow, type FakeSupabase } from "../fakeSupabase";

const CHECK =
  "Against the stand-in, with two projects' phases seeded, a check shows that reading one project's phases asks for that project only, and that adding a phase sends no owner and numbers it after that project's phases alone; a deliberately unfiltered read, or an add that names its owner, fails that check";

const holder = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("../supabase", () => ({
  getSupabase: () =>
    new Proxy(
      {},
      {
        get(_target, key) {
          const client = (holder.current as { client: Record<string | symbol, unknown> }).client;
          const member = client[key];
          return typeof member === "function" ? (member as (...args: unknown[]) => unknown).bind(client) : member;
        },
      },
    ),
}));

let fake: FakeSupabase;

const USER = { id: "user-1", email: "founder@example.com" };
const THIS = "p1";
const OTHER = "p2";

function projectRow(id: string, name: string, sortOrder: number): FakeRow {
  return {
    id,
    user_id: USER.id,
    name,
    accent_color: "#9A7B4F",
    sort_order: sortOrder,
    archived_at: null,
    total_days: 90,
    hours_planned_per_day: 4,
    hours_available_per_day: 6,
    started_at: "2026-07-21",
    created_at: "2026-07-21T17:00:00.000Z",
  };
}

function phaseRow(id: string, projectId: string, name: string, sortOrder: number): FakeRow {
  return {
    id,
    user_id: USER.id,
    project_id: projectId,
    name,
    est_days: 3,
    sort_order: sortOrder,
    is_done: false,
    completed_at: null,
    created_at: "2026-07-21T17:00:00.000Z",
  };
}

const THIS_PHASES = ["this-1", "this-2", "this-3"];
const NEXT_NUMBER = 3;
const PHASES: FakeRow[] = [
  phaseRow("other-1", OTHER, "Other: research", 0),
  phaseRow("this-1", THIS, "Sketch", 0),
  phaseRow("other-2", OTHER, "Other: outline", 1),
  phaseRow("this-2", THIS, "Build", 1),
  phaseRow("other-3", OTHER, "Other: draft", 2),
  phaseRow("this-3", THIS, "Test", 2),
  phaseRow("other-4", OTHER, "Other: edit", 3),
  phaseRow("other-5", OTHER, "Other: publish", 4),
];

function open(): void {
  fake = createFakeSupabase({
    projects: [projectRow(THIS, "This project", 0), projectRow(OTHER, "The other project", 1)],
    phases: PHASES,
  });
  holder.current = fake;
}

function asksForProjectOnly(request: FakeRequest, projectId: string): boolean {
  return request.filters.some((filter) => {
    if (filter.column !== "project_id") return false;
    if (filter.op === "eq") return filter.value === projectId;
    if (filter.op === "in") return Array.isArray(filter.value) && filter.value.length === 1 && filter.value[0] === projectId;
    return false;
  });
}

function problemsWithReads(requests: FakeRequest[], projectId: string): string[] {
  const reads = requests.filter((r) => r.table === "phases" && r.operation === "select");
  const problems: string[] = [];
  if (reads.length === 0) problems.push("no read of the phases was sent");
  for (const read of reads) {
    if (!asksForProjectOnly(read, projectId)) {
      problems.push(`a read of the phases did not ask for project ${projectId} only (it asked: ${JSON.stringify(read.filters)})`);
    }
  }
  return problems;
}

function sentRows(request: FakeRequest): FakeRow[] {
  if (request.payload === null) return [];
  return Array.isArray(request.payload) ? request.payload : [request.payload];
}

function problemsWithAdds(requests: FakeRequest[], projectId: string, ownerId: string, expectedNumber: number): string[] {
  const adds = requests.filter((r) => r.table === "phases" && r.operation === "insert");
  const problems: string[] = [];
  if (adds.length === 0) problems.push("no phase was sent to be added");
  for (const add of adds) {
    const rows = sentRows(add);
    if (rows.length === 0) problems.push("an add carried no phase");
    for (const row of rows) {
      if ("user_id" in row) problems.push("the add names its owner: it sends user_id");
      else if (Object.values(row).includes(ownerId)) problems.push("the add names its owner: one of its cells holds the owner's id");
      if (row.project_id !== projectId) problems.push(`the add is for project ${String(row.project_id)}, not ${projectId}`);
      if (row.sort_order !== expectedNumber) {
        problems.push(`the add numbers the phase ${String(row.sort_order)}, not ${expectedNumber} — after that project's phases alone`);
      }
    }
  }
  for (const read of requests.filter((r) => r.table === "phases" && r.operation === "select")) {
    if (!asksForProjectOnly(read, projectId)) {
      problems.push(`on the way, a read of the phases did not ask for project ${projectId} only (it asked: ${JSON.stringify(read.filters)})`);
    }
  }
  return problems;
}

function idsOf(rows: { id: string }[]): string[] {
  return rows.map((row) => row.id).sort();
}

beforeEach(async () => {
  __setTestUser(USER);
  await setActiveProject(THIS);
  open();
});

describe("the seam's writing rules for phases, against the stand-in", () => {
  it(`${CHECK} — the dashboard's read of one project's phases`, async () => {
    const data = await getProjectDashboardData(THIS);

    expect(data, "harness: the dashboard's read found the project").not.toBeNull();
    expect(problemsWithReads(fake.requests, THIS), "the read asks for that project only").toEqual([]);
    expect(idsOf(data?.phases ?? []), "and hands back that project's phases only").toEqual(THIS_PHASES);
  });

  it(`${CHECK} — adding a phase`, async () => {
    const added = await addPhase("Ship the beta");

    expect(
      problemsWithAdds(fake.requests, THIS, USER.id, NEXT_NUMBER),
      "the add sends no owner and numbers the phase after that project's phases alone",
    ).toEqual([]);
    expect(added.projectId, "the phase handed back belongs to the open project").toBe(THIS);
    expect(added.sortOrder, "and is numbered after that project's three phases — not after all eight").toBe(NEXT_NUMBER);

    const kept = fake.rows("phases").filter((row) => row.name === "Ship the beta");
    expect(kept.length, "one phase was kept").toBe(1);
    expect(kept[0].project_id, "kept in the open project").toBe(THIS);
    expect(kept[0].sort_order, "kept with the number after that project's phases").toBe(NEXT_NUMBER);
    expect("user_id" in kept[0], "kept with no owner sent: the database is the one that stamps it").toBe(false);

    const others = fake.rows("phases").filter((row) => row.project_id === OTHER);
    expect(
      others.map((row) => row.sort_order),
      "the other project's phases are as they were",
    ).toEqual([0, 1, 2, 3, 4]);
  });

  it(`${CHECK} — a deliberately unfiltered read, and a read of the other project, each fail the check`, async () => {
    const unfiltered = await fake.client.from("phases").select("*");
    expect(unfiltered.data?.length, "harness: the unfiltered read was answered with both projects' phases").toBe(PHASES.length);
    expect(
      problemsWithReads(fake.requests, THIS),
      "the check catches a read that asks for no project",
    ).toEqual([expect.stringContaining("did not ask for project p1 only")]);

    open();
    await fake.client.from("phases").select("*").eq("project_id", OTHER);
    expect(
      problemsWithReads(fake.requests, THIS),
      "the check catches a read that asks for the other project",
    ).toEqual([expect.stringContaining("did not ask for project p1 only")]);

    open();
    expect(problemsWithReads(fake.requests, THIS), "the check catches a read that was never sent").toEqual([
      "no read of the phases was sent",
    ]);
  });

  it(`${CHECK} — an add that names its owner, and an add numbered after every project's phases, each fail the check`, async () => {
    await fake.client.from("phases").insert({
      project_id: THIS,
      user_id: USER.id,
      name: "Named by its owner",
      est_days: 1,
      sort_order: NEXT_NUMBER,
      is_done: false,
      completed_at: null,
    });
    expect(
      problemsWithAdds(fake.requests, THIS, USER.id, NEXT_NUMBER),
      "the check catches an add that names its owner",
    ).toEqual(["the add names its owner: it sends user_id"]);

    open();
    await fake.client.from("phases").insert({
      project_id: THIS,
      name: "Numbered after everything",
      est_days: 1,
      sort_order: PHASES.length,
      is_done: false,
      completed_at: null,
    });
    expect(
      problemsWithAdds(fake.requests, THIS, USER.id, NEXT_NUMBER),
      "the check catches an add numbered after every project's phases",
    ).toEqual([expect.stringContaining("numbers the phase 8, not 3")]);

    open();
    await fake.client.from("phases").select("id");
    await fake.client.from("phases").insert({
      project_id: THIS,
      name: "Counted across projects",
      est_days: 1,
      sort_order: NEXT_NUMBER,
      is_done: false,
      completed_at: null,
    });
    expect(
      problemsWithAdds(fake.requests, THIS, USER.id, NEXT_NUMBER),
      "the check catches an add whose sibling count forgot its project",
    ).toEqual([expect.stringContaining("on the way, a read of the phases did not ask for project p1 only")]);
  });
});
