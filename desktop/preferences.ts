/**
 * What the desktop app remembers about itself (spec §22), which is not the person's work and
 * so is not in the data file: one small file of its own beside it.
 */
import type { DataFiles } from "./dataFile";

export interface Preferences {
  /** Whether the note at the day's goal is sent. */
  goalNotice: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = { goalNotice: true };

const FORMAT = "compass-preferences";

/** The preferences a kept text holds. Anything missing or not understood is its default. */
export function parsePreferences(text: string | null): Preferences {
  if (text === null) return { ...DEFAULT_PREFERENCES };
  try {
    const kept = JSON.parse(text) as { format?: unknown; goalNotice?: unknown } | null;
    if (!kept || kept.format !== FORMAT) return { ...DEFAULT_PREFERENCES };
    return { goalNotice: typeof kept.goalNotice === "boolean" ? kept.goalNotice : DEFAULT_PREFERENCES.goalNotice };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function serializePreferences(preferences: Preferences): string {
  return `${JSON.stringify({ format: FORMAT, version: 1, ...preferences }, null, 2)}\n`;
}

export interface PreferencesHolder {
  get(): Preferences;
  /** Changes some, keeps them for this run whatever the disk says, and answers them all. */
  set(change: Partial<Preferences>): Preferences;
}

/**
 * The holder of the preferences file. It is read once, at the first asking; a file that is
 * not there or cannot be read gives the defaults. A change is written whole; when the disk
 * refuses, the change still holds until the app closes.
 */
export function preferencesHolder(files: DataFiles, file: string): PreferencesHolder {
  let held: Preferences | null = null;

  function get(): Preferences {
    if (held) return held;
    try {
      held = parsePreferences(files.read(file));
    } catch {
      held = { ...DEFAULT_PREFERENCES };
    }
    return held;
  }

  return {
    get,
    set(change) {
      held = { ...get(), ...change };
      try {
        files.write(file, serializePreferences(held));
      } catch {
        /* kept for this run */
      }
      return held;
    },
  };
}
