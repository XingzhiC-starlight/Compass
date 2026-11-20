import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "../db";
import { browserBackend, createLocalClient, type LocalStore } from "../localClient";

const CHECK =
  "With no Supabase project, every operation of the seam works against the local database: nothing is refused, what was written is read back, and a new client on the same storage finds it all (I19)";

const holder = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../supabase", () => ({ getSupabase: () => holder.current }));

let held: Map<string, string>;
let failures: db.WriteFailure[];
let stopListening: () => void;

function openOnTheSameStorage(): void {
  const store: LocalStore = {
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => {
      held.set(key, value);
    },
  };
  holder.current = createLocalClient(browserBackend(() => store));
}

beforeEach(() => {
  held = new Map();
  failures = [];
  openOnTheSameStorage();
  stopListening = db.onWriteError((failure) => failures.push(failure));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  stopListening();
  vi.restoreAllMocks();
});

const SETUP = {
  setupId: "9d1c2b3a-4e5f-4a6b-8c7d-0e1f2a3b4c5d",
  projectName: "Garden",
  totalDays: 30,
  hoursPlannedPerDay: 2,
  hoursAvailablePerDay: 3,
  phases: [
    { name: "Dig", estDays: 2.5 },
    { name: "Plant", estDays: 4 },
  ],
  learn: [
    { name: "Soil", level: 10 },
    { name: "Water", level: 30 },
  ],
};

async function setUp() {
  const user = await db.getCurrentUser();
  const project = await db.saveInterview(SETUP);
  return { user, project };
}

async function payload(projectId: string) {
  const data = await db.getProjectDashboardData(projectId);
  if (!data) throw new Error("the project's payload was not found");
  return data;
}

describe("the seam on this device", () => {
  it(`${CHECK} — the one person is there without signing in, and signing out leaves them there`, async () => {
    expect(db.storesOnThisDevice()).toBe(true);
    const user = await db.getCurrentUser();
    expect(user).toMatchObject({ email: "" });

    let gateRuns = 0;
    const off = db.onAuthChange(() => {
      gateRuns += 1;
    });
    await db.signOut();
    expect(await db.getCurrentUser()).toEqual(user);
    off();
    expect(gateRuns, "who is signed in never changes, so the gate is never asked to run again").toBe(0);
  });

  it(`${CHECK} — the setup, then the project list, the cards' payload and the finished-projects map`, async () => {
    const { user, project } = await setUp();
    expect(project).toMatchObject({ id: SETUP.setupId, name: "Garden", userId: user?.id, sortOrder: 0, archivedAt: null });
    expect(db.getActiveProjectId()).toBe(project.id);

    const shell = await db.getDashboardShellData();
    expect(shell.projects.map((p) => p.name)).toEqual(["Garden"]);
    expect(shell.archived).toEqual([]);
    expect(shell.completion).toEqual({ [project.id]: false });

    const data = await payload(project.id);
    expect(data.phases.map((p) => [p.name, p.estDays, p.sortOrder])).toEqual([
      ["Dig", 3, 0],
      ["Plant", 4, 1],
    ]);
    expect(data.learning.map((l) => [l.name, l.progressPct, l.isFocus])).toEqual([
      ["Soil", 10, true],
      ["Water", 30, false],
    ]);
    expect(data).toMatchObject({ tasks: [], thoughts: [], thoughtGroups: [], loggedSeconds: 0, running: false });

    const again = await db.saveInterview({ ...SETUP, projectName: "Sent twice" });
    expect(again.name, "a second send of the same setup hands back the first project").toBe("Garden");
    expect((await db.listProjects()).length).toBe(1);
    expect(failures).toEqual([]);
  });

  it(`${CHECK} — the project, the timeline and the learning card's writes`, async () => {
    const { project } = await setUp();
    await db.renameProject("Kitchen garden");
    await db.setHoursPlannedPerDay(4);

    const phase = await db.addPhase("Harvest", 6);
    await db.renamePhase(phase.id, "Harvest and store");
    await db.setPhaseDays(phase.id, 7);
    await db.setPhaseDone(phase.id, true);
    let data = await payload(project.id);
    await db.reorderPhases([phase.id, ...data.phases.filter((p) => p.id !== phase.id).map((p) => p.id)]);
    await db.removePhase(data.phases[0].id);

    const item = await db.addLearningItem("Compost");
    await db.renameLearningItem(item.id, "Composting");
    await db.setLearningProgress(item.id, 55);
    await db.setFocusItem(item.id);
    await db.reorderLearningItems([item.id, ...data.learning.map((l) => l.id)]);
    await db.removeLearningItem(data.learning[1].id, item.id);

    data = await payload(project.id);
    expect(data.project).toMatchObject({ name: "Kitchen garden", hoursPlannedPerDay: 4 });
    expect(data.phases.map((p) => [p.name, p.estDays, p.isDone])).toEqual([
      ["Harvest and store", 7, true],
      ["Plant", 4, false],
    ]);
    expect(data.phases[0].completedAt).toBe(db.todayDate());
    expect(data.learning.map((l) => [l.name, l.progressPct, l.isFocus])).toEqual([
      ["Composting", 55, true],
      ["Soil", 10, false],
    ]);
    expect(failures).toEqual([]);
  });

  it(`${CHECK} — the task list's and the thought feed's writes`, async () => {
    const { project } = await setUp();
    const seeds = await db.addTask("Buy seeds");
    const beds = await db.addTask("Mark the beds");
    expect(await db.updateTask(seeds.id, { isDone: true, text: "Buy seeds and twine" })).toBe(true);
    await db.reorderTasks([beds.id, seeds.id]);

    const one = await db.addThought("Rounder beds");
    const two = await db.addThought("A path through the middle");
    const three = await db.addThought("Shade by August");
    expect(await db.updateThought(one.id, { title: "Shape", text: "Rounder beds, maybe" })).toBe(true);

    const grouped = await db.groupThoughts([one.id, two.id], "Layout");
    expect(grouped?.group.name).toBe("Layout");
    const groupId = grouped!.group.id;
    await db.renameThoughtGroup(groupId, "Layout ideas");
    await db.mergeThoughtsIntoGroup(groupId, [three.id]);
    await db.reorderThoughtsInGroup(groupId, [three.id, two.id, one.id]);
    await db.popThoughtsFromGroup([two.id]);
    await db.moveThoughtToGroup(two.id, groupId);
    await db.moveThoughtToGroup(two.id, null);
    await db.reorderFeed([
      { id: two.id, kind: "thought" },
      { id: groupId, kind: "group" },
    ]);

    let data = await payload(project.id);
    expect(data.tasks.map((t) => [t.text, t.isDone])).toEqual([
      ["Mark the beds", false],
      ["Buy seeds and twine", true],
    ]);
    expect(data.thoughtGroups.map((g) => g.name)).toEqual(["Layout ideas"]);
    expect(data.thoughts.filter((t) => t.groupId === groupId).map((t) => t.text)).toEqual([
      "Shade by August",
      "Rounder beds, maybe",
    ]);
    expect(data.thoughts.find((t) => t.id === one.id)?.title).toBe("Shape");
    expect(data.thoughts.find((t) => t.id === two.id)?.groupId).toBeNull();

    await db.ungroupThoughts(groupId);
    await db.removeThought(three.id);
    await db.removeTask(beds.id);
    data = await payload(project.id);
    expect(data.thoughtGroups).toEqual([]);
    expect(data.thoughts.every((t) => t.groupId === null)).toBe(true);
    expect(data.thoughts.map((t) => t.id).sort()).toEqual([one.id, two.id].sort());
    expect(data.tasks.map((t) => t.text)).toEqual(["Buy seeds and twine"]);
    expect(failures).toEqual([]);
  });

  it(`${CHECK} — the clock and a day's hours`, async () => {
    const { project } = await setUp();
    const session = await db.startSession();
    expect(session).toMatchObject({ projectId: project.id, endedAt: null, sessionDate: db.todayDate() });
    expect((await payload(project.id)).running).toBe(true);
    await db.stopSession();
    expect((await payload(project.id)).running).toBe(false);

    await db.setLoggedSecondsForDate(db.todayDate(), 5400);
    expect(await db.getTodayLoggedSeconds()).toBe(5400);
    const series = await db.listDailyTime(7);
    expect(series).toHaveLength(7);
    expect(series[series.length - 1]).toEqual({ date: db.todayDate(), loggedSeconds: 5400 });
    expect(failures).toEqual([]);
  });

  it(`${CHECK} — archiving, restoring, reordering and deleting a project, which takes everything in it`, async () => {
    const { project } = await setUp();
    await db.addTask("Buy seeds");
    await db.addThought("Rounder beds");
    await db.startSession();
    await db.stopSession();
    const second = await db.saveInterview({ ...SETUP, setupId: "0f0e0d0c-0b0a-4908-8706-050403020115", projectName: "Shed" });
    expect(second.sortOrder).toBe(1);

    await db.reorderProjects([second.id, project.id]);
    expect((await db.listProjects()).map((p) => p.name)).toEqual(["Shed", "Garden"]);

    await db.archiveProject(project.id);
    expect((await db.listProjects()).map((p) => p.name)).toEqual(["Shed"]);
    expect((await db.listArchivedProjects()).map((p) => p.name)).toEqual(["Garden"]);
    await db.unarchiveProject(project.id);
    expect((await db.listProjects()).map((p) => p.name)).toEqual(["Shed", "Garden"]);

    await db.setActiveProject(project.id);
    await db.deleteProject(project.id);
    expect(db.getActiveProjectId(), "the seam moves on to the project that is left").toBe(second.id);
    expect(await db.getProjectDashboardData(project.id)).toBeNull();

    const kept = JSON.parse([...held.values()][0]) as { tables: Record<string, { project_id?: string; id: string }[]> };
    for (const [table, rows] of Object.entries(kept.tables)) {
      const owners = new Set(rows.map((row) => (table === "projects" ? row.id : row.project_id)));
      expect([...owners].filter((owner) => owner !== second.id), `${table} holds nothing of the deleted project`).toEqual([]);
    }
    expect(failures).toEqual([]);
  });

  it(`${CHECK} — closing and opening again: a new client on the same storage finds everything`, async () => {
    const { project } = await setUp();
    await db.addTask("Buy seeds");
    await db.addThought("Rounder beds");
    await db.setLoggedSecondsForDate(db.todayDate(), 1800);

    openOnTheSameStorage();
    expect(db.storesOnThisDevice()).toBe(true);
    const data = await payload(project.id);
    expect(data.project.name).toBe("Garden");
    expect(data.tasks.map((t) => t.text)).toEqual(["Buy seeds"]);
    expect(data.thoughts.map((t) => t.text)).toEqual(["Rounder beds"]);
    expect(data.loggedSeconds).toBe(1800);
  });

  it(`${CHECK} — a save this device refuses is reported once as a failed save, with a code and no row`, async () => {
    await setUp();
    const stored = held;
    const refusing: LocalStore = {
      getItem: (key) => stored.get(key) ?? null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    holder.current = createLocalClient(browserBackend(() => refusing));

    await expect(db.addTask("A private line that must not travel")).rejects.toBeInstanceOf(db.SaveFailedError);
    expect(failures).toEqual([{ code: "COMPASS_LOCAL_NOT_SAVED", message: "this device's storage did not take the save" }]);
    expect(JSON.stringify(failures)).not.toContain("private line");
  });
});
