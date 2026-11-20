/**
 * What the menu bar shows (spec §22): today's time on the project whose clock is running,
 * and nothing when no clock runs. Pure: the tables and the instant come in as arguments.
 */
import type { LocalTables } from "../src/lib/localDatabase";
import { localYMD, loggedSecondsOn, timeSessionFromRow, type TimeSessionRow } from "../src/lib/transforms";

/** The running clock, read once: which project, which day, how long today, and its goal. */
export interface ClockReading {
  projectId: string;
  projectName: string;
  /** The local day the reading belongs to. */
  date: string;
  /** Today's seconds on the project, the running session counted to the instant. */
  seconds: number;
  /** The project's daily goal in seconds, 0 when it has none. */
  goalSeconds: number;
  /** The instant of the reading, in milliseconds. */
  atMs: number;
}

/**
 * The clock running today, or null when none is. A clock left running from an earlier day is
 * none: the app closes it at that day's end when it next reads the time (spec §8).
 */
export function clockReading(tables: LocalTables | null, now: Date): ClockReading | null {
  if (!tables) return null;
  const today = localYMD(now);
  const sessions = (tables.time_sessions as unknown as TimeSessionRow[]).map(timeSessionFromRow);
  const running = sessions.find((session) => session.endedAt === null && session.sessionDate === today);
  if (!running) return null;

  const ofTheProject = sessions.filter((session) => session.projectId === running.projectId);
  const project = (tables.projects ?? []).find((row) => row.id === running.projectId);
  const hours = Number(project?.hours_planned_per_day ?? 0);
  return {
    projectId: running.projectId,
    projectName: typeof project?.name === "string" ? project.name : "",
    date: today,
    seconds: loggedSecondsOn(ofTheProject, today, now.getTime()),
    goalSeconds: Number.isFinite(hours) && hours > 0 ? hours * 3600 : 0,
    atMs: now.getTime(),
  };
}

/**
 * The text beside the menu-bar icon: hours and minutes, `0:07` or `2:30`, of today's time on
 * the project with a clock running today; the empty text otherwise.
 */
export function clockTitle(tables: LocalTables | null, now: Date): string {
  const reading = clockReading(tables, now);
  if (!reading) return "";
  const minutes = Math.floor(reading.seconds / 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

export interface MenuLine {
  label?: string;
  kind: "press" | "tick" | "line";
  does?: "open" | "capture" | "goal-notice" | "open-at-login" | "quit";
  /** The keys that do the same from anywhere, shown beside the line. */
  keys?: string;
  ticked?: boolean;
  enabled?: boolean;
}

/**
 * The menu under the icon. Opening at login is the operating system's setting for an
 * installed app: run from the source it would open the bare Electron program, so there the
 * line is shown and cannot be pressed.
 */
export function menuLines(state: {
  installed: boolean;
  opensAtLogin: boolean;
  /** Whether the note at the day's goal is on (`preferences.ts`). */
  goalNotice: boolean;
  /** The capture shortcut, when the system let the app have it. */
  captureKeys: string | null;
}): MenuLine[] {
  return [
    { label: "Open Compass", kind: "press", does: "open" },
    { label: "Capture a Thought", kind: "press", does: "capture", ...(state.captureKeys ? { keys: state.captureKeys } : {}) },
    { kind: "line" },
    { label: "Tell Me When I Reach Today's Goal", kind: "tick", does: "goal-notice", ticked: state.goalNotice },
    {
      label: "Open at Login",
      kind: "tick",
      does: "open-at-login",
      ticked: state.installed && state.opensAtLogin,
      enabled: state.installed,
    },
    { kind: "line" },
    { label: "Quit Compass", kind: "press", does: "quit" },
  ];
}
