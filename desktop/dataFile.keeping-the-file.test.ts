import { describe, expect, it } from "vitest";
import { createLocalClient } from "../src/lib/localClient";
import { parseTables, type LocalRequest, type LocalTables } from "../src/lib/localDatabase";
import { diskFiles, fileBackend, type DataFiles, type DiskTools } from "./dataFile";

const CHECK =
  "The desktop app's holder keeps the tables in one file: a save is in the file before it is answered, a file it cannot read is left alone and never taken for an empty one, a save the disk refuses is not shown as made, and a save cut short leaves the old file whole (spec §22)";

const FILE = "/made-up/Compass/compass-data.json";

function pretendDisk(start: Record<string, string> = {}) {
  const held = new Map(Object.entries(start));
  const writes: string[] = [];
  const files: DataFiles = {
    read: (file) => held.get(file) ?? null,
    write: (file, text) => {
      writes.push(file);
      held.set(file, text);
    },
  };
  return { files, held, writes };
}

let made = 0;
const around = {
  now: () => "2026-11-20T09:00:00.000Z",
  newId: () => `00000000-0000-4000-8000-${String(++made).padStart(12, "0")}`,
};

const PROJECT = {
  name: "Garden",
  accent_color: "#9A7B4F",
  sort_order: 0,
  total_days: 30,
  hours_planned_per_day: 2,
  hours_available_per_day: 3,
  started_at: "2026-11-20",
};

describe("the desktop app's data file", () => {
  it(`${CHECK} — a saved row is in the file when the save is answered, and a new holder on the same file reads it`, async () => {
    const { files, held } = pretendDisk();
    const first = createLocalClient(fileBackend(files, FILE, around));
    const { error } = await first.from("projects").insert(PROJECT);
    expect(error).toBeNull();
    expect(parseTables(held.get(FILE)!).projects.map((row) => row.name)).toEqual(["Garden"]);

    const again = createLocalClient(fileBackend(files, FILE, around));
    expect((await again.from("projects").select("name")).data).toEqual([{ name: "Garden" }]);
  });

  it(`${CHECK} — a read writes nothing, and there is no file until the first save`, async () => {
    const { files, held, writes } = pretendDisk();
    const client = createLocalClient(fileBackend(files, FILE, around));
    expect((await client.from("projects").select("*")).data).toEqual([]);
    expect(held.has(FILE)).toBe(false);
    expect(writes).toEqual([]);
  });

  it(`${CHECK} — the file is read once and the tables held from then on`, async () => {
    const { files } = pretendDisk();
    let reads = 0;
    const counting: DataFiles = {
      read: (file) => {
        reads += 1;
        return files.read(file);
      },
      write: files.write,
    };
    const client = createLocalClient(fileBackend(counting, FILE, around));
    await client.from("projects").insert(PROJECT);
    await client.from("projects").select("*");
    await client.from("projects").select("*");
    expect(reads).toBe(1);
  });

  it(`${CHECK} — a file it cannot read is left exactly as it is, every request is refused, and it is asked again once the file is mended`, async () => {
    const unreadable = '{"format":"compass-local-database","version":99,"tables":{}}';
    const { files, held, writes } = pretendDisk({ [FILE]: unreadable });
    const backend = fileBackend(files, FILE, around);
    const client = createLocalClient(backend);

    expect((await client.from("projects").select("*")).error?.code).toBe("COMPASS_LOCAL_UNREADABLE");
    expect((await client.from("projects").insert(PROJECT)).error?.code).toBe("COMPASS_LOCAL_UNREADABLE");
    expect(held.get(FILE)).toBe(unreadable);
    expect(writes).toEqual([]);
    expect(backend.held()).toBeNull();

    held.delete(FILE);
    expect((await client.from("projects").select("*")).data).toEqual([]);
  });

  it(`${CHECK} — a disk that cannot be read at all refuses the request instead of throwing`, async () => {
    const client = createLocalClient(
      fileBackend(
        {
          read: () => {
            throw new Error("EACCES");
          },
          write: () => undefined,
        },
        FILE,
        around,
      ),
    );
    expect((await client.from("projects").select("*")).error?.code).toBe("COMPASS_LOCAL_UNREADABLE");
  });

  it(`${CHECK} — a save the disk refuses is answered as failed, and the row is not there afterwards`, async () => {
    const { files } = pretendDisk();
    let full = true;
    const refusing: DataFiles = {
      read: files.read,
      write: (file, text) => {
        if (full) throw new Error("ENOSPC");
        files.write(file, text);
      },
    };
    const client = createLocalClient(fileBackend(refusing, FILE, around));
    expect((await client.from("projects").insert(PROJECT)).error?.code).toBe("COMPASS_LOCAL_NOT_SAVED");
    expect((await client.from("projects").select("*")).data).toEqual([]);

    full = false;
    expect((await client.from("projects").insert(PROJECT)).error).toBeNull();
    expect((await client.from("projects").select("*")).data).toHaveLength(1);
  });

  it(`${CHECK} — something that is not a request is refused, and nothing is written`, async () => {
    const { files, writes } = pretendDisk();
    const backend = fileBackend(files, FILE, around);
    for (const notOne of [null, "projects", 7, { kind: "select" }, { kind: "insert", table: "projects" }]) {
      const answer = await backend.send(notOne as unknown as LocalRequest);
      expect(answer.data, JSON.stringify(notOne)).toBeNull();
      expect(answer.error, JSON.stringify(notOne)).not.toBeNull();
    }
    expect(writes).toEqual([]);
  });

  it(`${CHECK} — the menu bar is told the tables when they are first read and after every save, and not after a read`, async () => {
    const { files } = pretendDisk();
    const told: LocalTables[] = [];
    const client = createLocalClient(fileBackend(files, FILE, around, (tables) => told.push(tables)));
    await client.from("projects").select("*");
    expect(told).toHaveLength(1);
    await client.from("projects").insert(PROJECT);
    expect(told).toHaveLength(2);
    expect(told[1].projects).toHaveLength(1);
    await client.from("projects").select("*");
    expect(told).toHaveLength(2);
  });
});

describe("the real disk under the data file", () => {
  function pretendTools(start: Record<string, string> = {}) {
    const held = new Map(Object.entries(start));
    const did: string[] = [];
    const tools: DiskTools = {
      readFileSync: (file) => {
        if (!held.has(file)) throw Object.assign(new Error("no such file"), { code: "ENOENT" });
        return held.get(file)!;
      },
      writeFileSync: (file, text, options) => {
        did.push(`write ${file} mode ${options.mode.toString(8)}`);
        held.set(file, text);
      },
      renameSync: (from, to) => {
        did.push(`rename ${from} -> ${to}`);
        held.set(to, held.get(from)!);
        held.delete(from);
      },
      mkdirSync: (folder) => {
        did.push(`mkdir ${folder}`);
      },
      dirname: (file) => file.slice(0, file.lastIndexOf("/")),
    };
    return { tools, held, did };
  }

  it(`${CHECK} — a missing file reads as none, and any other failure is passed on`, () => {
    const { tools } = pretendTools();
    expect(diskFiles(tools).read(FILE)).toBeNull();
    const locked: DiskTools = {
      ...tools,
      readFileSync: () => {
        throw Object.assign(new Error("not allowed"), { code: "EACCES" });
      },
    };
    expect(() => diskFiles(locked).read(FILE)).toThrow("not allowed");
  });

  it(`${CHECK} — a save makes the folder, writes a second file readable by its owner alone, and renames it over the first`, () => {
    const { tools, held, did } = pretendTools({ [FILE]: "old" });
    diskFiles(tools).write(FILE, "new");
    expect(did).toEqual([
      "mkdir /made-up/Compass",
      `write ${FILE}.saving mode 600`,
      `rename ${FILE}.saving -> ${FILE}`,
    ]);
    expect(held.get(FILE)).toBe("new");
    expect(held.has(`${FILE}.saving`)).toBe(false);
  });

  it(`${CHECK} — a save cut short before the rename leaves the old file whole`, () => {
    const { tools, held } = pretendTools({ [FILE]: "old" });
    const cut: DiskTools = {
      ...tools,
      renameSync: () => {
        throw new Error("the power went");
      },
    };
    expect(() => diskFiles(cut).write(FILE, "new")).toThrow("the power went");
    expect(held.get(FILE)).toBe("old");
  });
});
