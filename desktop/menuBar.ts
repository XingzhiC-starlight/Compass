/**
 * What the menu bar shows (spec §22): today's time on the project whose clock is running,
 * and nothing when no clock runs. Pure: the tables and the instant come in as arguments.
 */
import type { LocalTables } from "../src/lib/localDatabase";
import { localYMD, loggedSecondsOn, timeSessionFromRow, type TimeSessionRow } from "../src/lib/transforms";

/**
 * The text beside the menu-bar icon: hours and minutes, `0:07` or `2:30`, of today's time on
 * the project with a clock running today; the empty text otherwise. A clock left running
 * from an earlier day shows nothing: the app closes it at that day's end when it next reads
 * the time (spec §8).
 */
export function clockTitle(tables: LocalTables | null, now: Date): string {
  if (!tables) return "";
  const today = localYMD(now);
  const sessions = (tables.time_sessions as unknown as TimeSessionRow[]).map(timeSessionFromRow);
  const running = sessions.find((session) => session.endedAt === null && session.sessionDate === today);
  if (!running) return "";

  const ofTheProject = sessions.filter((session) => session.projectId === running.projectId);
  const seconds = loggedSecondsOn(ofTheProject, today, now.getTime());
  const minutes = Math.floor(seconds / 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

export interface MenuLine {
  label?: string;
  kind: "press" | "tick" | "line";
  does?: "open" | "open-at-login" | "quit";
  ticked?: boolean;
  enabled?: boolean;
}

/**
 * The menu under the icon. Opening at login is the operating system's setting for an
 * installed app: run from the source it would open the bare Electron program, so there the
 * line is shown and cannot be pressed.
 */
export function menuLines(state: { installed: boolean; opensAtLogin: boolean }): MenuLine[] {
  return [
    { label: "Open Compass", kind: "press", does: "open" },
    { kind: "line" },
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
