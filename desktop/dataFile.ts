/**
 * The desktop app's holder of the data (spec §22): one file, owned by the main process.
 *
 * It is a backend of the local client (`src/lib/localClient.ts`, spec §21): a request comes
 * in as plain data, the pure engine runs it, and the tables it hands back are written to the
 * file before the answer goes out. The page never touches the file.
 *
 * The tables are read once, when the first request arrives, and held from then on: the main
 * process is the file's only writer, since a second copy of the app is never started (§22).
 */
import type { LocalAnswer, LocalRequest, LocalSurroundings, LocalTables } from "../src/lib/localDatabase";
import { emptyTables, parseTables, runLocalRequest, serializeTables } from "../src/lib/localDatabase";

/** The two things the holder asks of a disk, so a test can hand it a pretend one. */
export interface DataFiles {
  /** The file's text, or null when there is no such file. Throws when it cannot be read. */
  read(file: string): string | null;
  /** Replaces the file's text whole: the old text or the new is there afterwards, never a part. */
  write(file: string, text: string): void;
}

/** The parts of Node's `fs` and `path` the real disk needs. */
export interface DiskTools {
  readFileSync(file: string, encoding: "utf8"): string;
  writeFileSync(file: string, text: string, options: { encoding: "utf8"; mode: number }): void;
  renameSync(from: string, to: string): void;
  mkdirSync(folder: string, options: { recursive: true }): unknown;
  dirname(file: string): string;
}

/**
 * The real disk. A save writes a second file beside the first and then renames it over the
 * first, which the operating system does in one step, so a save cut short leaves the old
 * file whole. The file is readable by its owner alone.
 */
export function diskFiles(tools: DiskTools): DataFiles {
  return {
    read(file) {
      try {
        return tools.readFileSync(file, "utf8");
      } catch (error) {
        if ((error as { code?: unknown }).code === "ENOENT") return null;
        throw error;
      }
    },
    write(file, text) {
      tools.mkdirSync(tools.dirname(file), { recursive: true });
      const beside = `${file}.saving`;
      tools.writeFileSync(beside, text, { encoding: "utf8", mode: 0o600 });
      tools.renameSync(beside, file);
    },
  };
}

export interface FileBackend {
  send(request: LocalRequest): Promise<LocalAnswer>;
  /** The tables as last read or saved; null before the first request and when the file cannot be read. */
  held(): LocalTables | null;
}

/**
 * @param changed told the tables after every save, and once when they are first read
 */
export function fileBackend(
  files: DataFiles,
  file: string,
  around: LocalSurroundings,
  changed: (tables: LocalTables) => void = () => undefined,
): FileBackend {
  let tables: LocalTables | null = null;

  function open(): LocalTables | null {
    if (tables) return tables;
    try {
      const kept = files.read(file);
      tables = kept === null ? emptyTables() : parseTables(kept);
    } catch {
      // Left as it is, and asked again at the next request: a file that will not open is
      // never taken for an empty one and written over.
      return null;
    }
    changed(tables);
    return tables;
  }

  return {
    held: () => tables,
    send(request) {
      return Promise.resolve().then(() => {
        const before = open();
        if (!before) return refused("COMPASS_LOCAL_UNREADABLE", "the data saved on this device could not be read");

        let outcome;
        try {
          outcome = runLocalRequest(before, request, around);
        } catch {
          return refused("COMPASS_LOCAL_BAD_REQUEST", "the request was not one the local database answers");
        }
        if (outcome.tables === before) return outcome.answer;

        try {
          files.write(file, serializeTables(outcome.tables));
        } catch {
          return refused("COMPASS_LOCAL_NOT_SAVED", "this device's storage did not take the save");
        }
        tables = outcome.tables;
        changed(tables);
        return outcome.answer;
      });
    },
  };
}

function refused(code: string, message: string): LocalAnswer {
  return { data: null, error: { code, message, details: "", hint: "" }, count: null, status: 0, statusText: "" };
}
