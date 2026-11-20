import { describe, expect, it } from "vitest";
import type { DataFiles } from "./dataFile";
import { DEFAULT_PREFERENCES, parsePreferences, preferencesHolder, serializePreferences } from "./preferences";

const CHECK =
  "The desktop app keeps its own preferences in a small file beside the data: the defaults when the file is missing or not understood, a change written whole, and a change kept for the run when the disk refuses (spec §22)";

function pretendDisk(start: string | null = null, refuses: "nothing" | "reads" | "writes" = "nothing") {
  const disk = { text: start, reads: 0, writes: 0 };
  const files: DataFiles = {
    read() {
      disk.reads += 1;
      if (refuses === "reads") throw new Error("cannot read");
      return disk.text;
    },
    write(_file, text) {
      if (refuses === "writes") throw new Error("cannot write");
      disk.writes += 1;
      disk.text = text;
    },
  };
  return { disk, files };
}

describe("the desktop app's preferences", () => {
  it(`${CHECK} — the note at the goal is on until it is turned off`, () => {
    expect(DEFAULT_PREFERENCES).toEqual({ goalNotice: true });
    expect(parsePreferences(null)).toEqual({ goalNotice: true });
  });

  it(`${CHECK} — a kept text is read back, and what it lacks or garbles is the default`, () => {
    expect(parsePreferences(serializePreferences({ goalNotice: false }))).toEqual({ goalNotice: false });
    expect(parsePreferences('{"format":"compass-preferences","version":1}')).toEqual({ goalNotice: true });
    expect(parsePreferences('{"format":"compass-preferences","goalNotice":"no"}')).toEqual({ goalNotice: true });
    expect(parsePreferences('{"format":"something-else","goalNotice":false}')).toEqual({ goalNotice: true });
    expect(parsePreferences("not json")).toEqual({ goalNotice: true });
    expect(parsePreferences("null")).toEqual({ goalNotice: true });
  });

  it(`${CHECK} — the file is read once, and nothing is written until something changes`, () => {
    const { disk, files } = pretendDisk();
    const holder = preferencesHolder(files, "prefs.json");
    expect(holder.get()).toEqual({ goalNotice: true });
    holder.get();
    expect(disk).toMatchObject({ reads: 1, writes: 0, text: null });
  });

  it(`${CHECK} — a change is written whole and read back by the next run`, () => {
    const { disk, files } = pretendDisk();
    expect(preferencesHolder(files, "prefs.json").set({ goalNotice: false })).toEqual({ goalNotice: false });
    expect(JSON.parse(disk.text!)).toEqual({ format: "compass-preferences", version: 1, goalNotice: false });
    expect(preferencesHolder(files, "prefs.json").get()).toEqual({ goalNotice: false });
  });

  it(`${CHECK} — a file that cannot be read gives the defaults, and a change the disk refuses holds for the run`, () => {
    expect(preferencesHolder(pretendDisk(null, "reads").files, "prefs.json").get()).toEqual({ goalNotice: true });

    const { disk, files } = pretendDisk(null, "writes");
    const holder = preferencesHolder(files, "prefs.json");
    expect(holder.set({ goalNotice: false })).toEqual({ goalNotice: false });
    expect(holder.get()).toEqual({ goalNotice: false });
    expect(disk.text).toBeNull();
  });
});
