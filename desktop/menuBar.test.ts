import { describe, expect, it } from "vitest";
import { emptyTables, type LocalRow, type LocalTables } from "../src/lib/localDatabase";
import { clockReading, clockTitle, menuLines } from "./menuBar";

const CHECK =
  "The menu bar shows today's hours and minutes on the project whose clock is running, and nothing when no clock runs today; its menu opens Compass, sets opening at login in the installed app alone, and quits (spec §22)";

const NOW = new Date(2026, 10, 20, 15, 30, 0);
const at = (hour: number, minute: number, day = 20) => new Date(2026, 10, day, hour, minute, 0).toISOString();

function session(over: Partial<LocalRow>): LocalRow {
  return {
    id: `s-${Math.random()}`,
    user_id: "u",
    project_id: "garden",
    started_at: at(9, 0),
    ended_at: null,
    duration_seconds: 0,
    session_date: "2026-11-20",
    created_at: at(9, 0),
    ...over,
  };
}

function tablesWith(sessions: LocalRow[]): LocalTables {
  return { ...emptyTables(), time_sessions: sessions };
}

describe("the menu-bar clock", () => {
  it(`${CHECK} — no tables, no sessions, or only finished ones: nothing`, () => {
    expect(clockTitle(null, NOW)).toBe("");
    expect(clockTitle(tablesWith([]), NOW)).toBe("");
    expect(clockTitle(tablesWith([session({ ended_at: at(10, 0), duration_seconds: 3600 })]), NOW)).toBe("");
  });

  it(`${CHECK} — a clock started 25 minutes ago reads 0:25`, () => {
    expect(clockTitle(tablesWith([session({ started_at: at(15, 5) })]), NOW)).toBe("0:25");
  });

  it(`${CHECK} — today's finished time on the same project is added, and another project's is not`, () => {
    const tables = tablesWith([
      session({ started_at: at(8, 0), ended_at: at(10, 0), duration_seconds: 7200 }),
      session({ project_id: "shed", started_at: at(11, 0), ended_at: at(12, 0), duration_seconds: 3600 }),
      session({ started_at: at(15, 0) }),
    ]);
    expect(clockTitle(tables, NOW)).toBe("2:30");
  });

  it(`${CHECK} — seconds are dropped, not rounded up`, () => {
    const justUnder = new Date(2026, 10, 20, 15, 30, 59);
    expect(clockTitle(tablesWith([session({ started_at: at(15, 30) })]), justUnder)).toBe("0:00");
  });

  it(`${CHECK} — a clock left running from yesterday shows nothing`, () => {
    const left = session({ started_at: at(22, 0, 19), session_date: "2026-11-19" });
    expect(clockTitle(tablesWith([left]), NOW)).toBe("");
  });
});

describe("the running clock, read once", () => {
  const withProject = (sessions: LocalRow[], project: LocalRow = {}) => ({
    ...tablesWith(sessions),
    projects: [{ id: "garden", name: "Garden", hours_planned_per_day: 2, ...project }],
  });

  it(`${CHECK} — it names the project, the day, today's seconds and the goal in seconds`, () => {
    expect(clockReading(withProject([session({ started_at: at(15, 5) })]), NOW)).toEqual({
      projectId: "garden",
      projectName: "Garden",
      date: "2026-11-20",
      seconds: 25 * 60,
      goalSeconds: 7200,
    });
  });

  it(`${CHECK} — no goal, or a project row that is not there, is a goal of nothing`, () => {
    expect(clockReading(withProject([session({})], { hours_planned_per_day: 0 }), NOW)?.goalSeconds).toBe(0);
    expect(clockReading(tablesWith([session({})]), NOW)).toMatchObject({ projectName: "", goalSeconds: 0 });
  });

  it(`${CHECK} — no clock running today is no reading`, () => {
    expect(clockReading(null, NOW)).toBeNull();
    expect(clockReading(withProject([session({ ended_at: at(10, 0), duration_seconds: 3600 })]), NOW)).toBeNull();
    expect(clockReading(withProject([session({ session_date: "2026-11-19" })]), NOW)).toBeNull();
  });
});

describe("the menu under the icon", () => {
  const state = { installed: false, opensAtLogin: true, goalNotice: true, captureKeys: "Alt+Shift+T" };

  it(`${CHECK} — its lines, in order; run from the source, opening at login is shown and cannot be pressed`, () => {
    expect(menuLines(state)).toEqual([
      { label: "Open Compass", kind: "press", does: "open" },
      { label: "Capture a Thought", kind: "press", does: "capture", keys: "Alt+Shift+T" },
      { kind: "line" },
      { label: "Tell Me When I Reach Today's Goal", kind: "tick", does: "goal-notice", ticked: true },
      { label: "Open at Login", kind: "tick", does: "open-at-login", ticked: false, enabled: false },
      { kind: "line" },
      { label: "Quit Compass", kind: "press", does: "quit" },
    ]);
  });

  it(`${CHECK} — installed, opening at login can be pressed and is ticked when the setting is on`, () => {
    const line = (opensAtLogin: boolean) => menuLines({ ...state, installed: true, opensAtLogin })[4];
    expect(line(true)).toMatchObject({ ticked: true, enabled: true });
    expect(line(false)).toMatchObject({ ticked: false, enabled: true });
  });

  it(`${CHECK} — the goal's line follows its preference, and the capture line shows no keys the system did not give`, () => {
    expect(menuLines({ ...state, goalNotice: false })[3]).toMatchObject({ ticked: false });
    expect(menuLines({ ...state, captureKeys: null })[1]).toEqual({ label: "Capture a Thought", kind: "press", does: "capture" });
  });
});
