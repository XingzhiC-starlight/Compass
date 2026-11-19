import { afterAll, describe, expect, it } from "vitest";
import { seamFindings, shippedFiles } from "./what-the-code-holds";
import { REPO, attempt, copyOfTheCode, finding, plant, plantedCopy, removeScratchFolders, scratchRoot, sorted, write } from "./what-the-code-holds.planting";

const CHECK_SEAM =
  "A check fails when a screen or a pure module reaches the database client other than through the seam, and passes for the code as it is";

afterAll(removeScratchFolders);

describe("a screen or a pure module reaches the database only through the seam", () => {
  it(`${CHECK_SEAM} — passes for the code as it is`, () => {
    const files = attempt(() => shippedFiles(REPO));
    expect(files, "the reader looks at the app's code: the seam, a screen and the page shell").toEqual(
      expect.arrayContaining(["src/lib/db.ts", "src/App.tsx", "src/dashboard/Sidebar.tsx", "index.html"]),
    );
    expect(attempt(() => seamFindings(REPO))).toEqual([]);
  });

  it(`${CHECK_SEAM} — passes for an import of the client's types alone, which reaches no client`, () => {
    const root = scratchRoot();
    write(root, "src/lib/supabase.ts", ['import { createClient } from "@supabase/supabase-js";', "export const getSupabase = () => createClient(\"https://made-up.example\", \"made-up\");"]);
    write(root, "src/lib/db.ts", ['import { getSupabase } from "./supabase";', "export const ready = () => getSupabase();"]);
    write(root, "src/dashboard/Planted.tsx", ['import type { SupabaseClient } from "@supabase/supabase-js";', "export type Held = SupabaseClient | null;"]);

    expect(attempt(() => seamFindings(root))).toEqual([]);
  });

  it(`${CHECK_SEAM} — fails when a screen imports the client module`, () => {
    const root = copyOfTheCode();
    const line = plant(root, "src/dashboard/Sidebar.tsx", 'import { getSupabase as plantedClient } from "../lib/supabase";');

    expect(attempt(() => seamFindings(root))).toEqual([finding("src/dashboard/Sidebar.tsx", line, "the seam", /supabase/)]);
  });

  it(`${CHECK_SEAM} — fails when a pure module imports the client's package for its value`, () => {
    const root = copyOfTheCode();
    const line = plant(root, "src/lib/transforms.ts", 'import { createClient as plantedCreateClient } from "@supabase/supabase-js";');

    expect(attempt(() => seamFindings(root))).toEqual([finding("src/lib/transforms.ts", line, "the seam", /supabase/)]);
  });

  it(`${CHECK_SEAM} — fails when a screen imports the test support that reaches the same client`, () => {
    const root = copyOfTheCode();
    const line = plant(root, "src/App.tsx", 'import * as plantedPractice from "./lib/practiceCopy";');

    expect(attempt(() => seamFindings(root))).toEqual([finding("src/App.tsx", line, "the seam", /practiceCopy/)]);
  });

  it(`${CHECK_SEAM} — fails for a re-export and a dynamic import of the client module, with or without its extension`, () => {
    const root = scratchRoot();
    write(root, "src/lib/supabase.ts", ['import { createClient } from "@supabase/supabase-js";', "export const getSupabase = () => createClient(\"https://made-up.example\", \"made-up\");"]);
    write(root, "src/lib/db.ts", ['import { getSupabase } from "./supabase";', "export const ready = () => getSupabase();"]);
    write(root, "src/dashboard/Passthrough.ts", ["// a pure module beside a screen", 'export { getSupabase } from "../lib/supabase.ts";']);
    write(root, "src/dashboard/Later.tsx", [
      "export async function later() {",
      '  const client = await import("../lib/supabase");',
      "  return client;",
      "}",
    ]);

    expect(sorted(attempt(() => seamFindings(root)))).toEqual([
      finding("src/dashboard/Later.tsx", 2, "the seam", /supabase/),
      finding("src/dashboard/Passthrough.ts", 2, "the seam", /supabase/),
    ]);
  });
});

const THE_ALLOWED_PAIR = {
  "src/lib/supabase.ts": ['import { createClient, type SupabaseClient } from "@supabase/supabase-js";', 'export const getSupabase = (): SupabaseClient => createClient("https://made-up.example", "made-up");'],
  "src/lib/db.ts": ['import { getSupabase } from "./supabase";', 'import type { SupabaseClient } from "@supabase/supabase-js";', "export const ready = (): SupabaseClient => getSupabase();"],
};

describe("the builder's regression tests: the seam", () => {
  it("an import of the client's types alone is not a finding, in each of its forms; a mixed import is", () => {
    const root = plantedCopy({
      ...THE_ALLOWED_PAIR,
      "src/dashboard/TypesAlone.tsx": [
        'export type { SupabaseClient } from "@supabase/supabase-js";',
        'import { type Session, type User } from "@supabase/supabase-js";',
        'export type Client = typeof import("@supabase/supabase-js");',
        "export type Held = Session | User | null;",
      ],
      "src/dashboard/Mixed.tsx": ['import { type Session, createClient } from "@supabase/supabase-js";', "export const both = [createClient] as unknown as Session[];"],
    });

    expect(seamFindings(root)).toEqual([
      { file: "src/dashboard/Mixed.tsx", line: 1, rule: "the seam", found: expect.stringMatching(/supabase-js.*for its value/) },
    ]);
  });

  it("an import in a type's place, import(\"x\").Name, and any import in a declaration file name types alone and are not findings; a called import() is", () => {
    const root = plantedCopy({
      ...THE_ALLOWED_PAIR,
      "src/lib/held.ts": ['export let held: import("@supabase/supabase-js").Session | null = null;', "export const keep = (one: typeof held) => (held = one);"],
      "src/lib/env.d.ts": ['import { Session } from "@supabase/supabase-js";', "declare global {", "  interface Window { lastSession?: Session }", "}"],
      "src/lib/later.ts": ['export const later = () => import("@supabase/supabase-js");'],
    });

    expect(seamFindings(root)).toEqual([
      { file: "src/lib/later.ts", line: 1, rule: "the seam", found: expect.stringMatching(/supabase-js.*for its value/) },
    ]);
  });

  it("an import spread over several lines is named at the line that names the module", () => {
    const root = plantedCopy({
      ...THE_ALLOWED_PAIR,
      "src/dashboard/Spread.tsx": ["import {", "  getSupabase,", '} from "../lib/supabase";', "export const spread = getSupabase;"],
    });

    expect(seamFindings(root)).toEqual([{ file: "src/dashboard/Spread.tsx", line: 3, rule: "the seam", found: expect.stringMatching(/client module/) }]);
  });

  it("a planted copy that breaks the seam every way names every finding, and nothing the rule allows", () => {
    const root = plantedCopy({
      ...THE_ALLOWED_PAIR,
      "src/lib/db.ts": [...THE_ALLOWED_PAIR["src/lib/db.ts"], 'import { createClient as second } from "@supabase/supabase-js";'],
      "src/App.tsx": ['import "./lib/supabase";', 'import { createFakeSupabase } from "./lib/fakeSupabase";', 'import * as practice from "./lib/practiceCopy.ts";', "export const all = [createFakeSupabase, practice];"],
      "src/lib/transforms.ts": ['import supabase from "@supabase/supabase-js/dist/main";', 'export * from "./supabase";', "export const pure = supabase;"],
      "src/dashboard/Later.tsx": ["export const later = () => import('../lib/supabase.ts');"],
      "src/lib/practiceCopy.ts": ['import { getSupabase } from "./supabase";', 'import { createFakeSupabase } from "./fakeSupabase";', "export const practice = [getSupabase, createFakeSupabase];"],
      "src/lib/Sidebar.test.tsx": ['import { getSupabase } from "./supabase";', "export const inATest = getSupabase;"],
    });

    const found = seamFindings(root).map(({ file, line, found }) => `${file}:${line} ${found.split(",")[0]}`);
    expect(found.sort()).toEqual(
      [
        'src/App.tsx:1 imports "./lib/supabase"',
        'src/App.tsx:2 imports "./lib/fakeSupabase"',
        'src/App.tsx:3 imports "./lib/practiceCopy.ts"',
        'src/dashboard/Later.tsx:1 imports "../lib/supabase.ts"',
        'src/lib/db.ts:4 imports "@supabase/supabase-js"',
        'src/lib/transforms.ts:1 imports "@supabase/supabase-js/dist/main"',
        'src/lib/transforms.ts:2 imports "./supabase"',
      ].sort(),
    );
  });

  it("every package under @supabase/ counts as the client's package: imported for its value outside the client module it is a finding, for its types alone it is not", () => {
    const parts = ["@supabase/postgrest-js", "@supabase/auth-js", "@supabase/realtime-js", "@supabase/storage-js/dist/main"];
    const root = plantedCopy({
      ...THE_ALLOWED_PAIR,
      "src/lib/supabase.ts": [...THE_ALLOWED_PAIR["src/lib/supabase.ts"], 'import { PostgrestClient } from "@supabase/postgrest-js";', "export const parts = PostgrestClient;"],
      "src/dashboard/Parts.tsx": [...parts.map((part, index) => `import * as part${index} from "${part}";`), "export const built = [part0, part1, part2, part3];"],
      "src/dashboard/PartsTypes.tsx": ['import type { PostgrestError } from "@supabase/postgrest-js";', "export type Held = PostgrestError | null;"],
    });

    expect(seamFindings(root).map(({ file, line, found }) => `${file}:${line} ${found.split(",")[0]}`)).toEqual(
      parts.map((part, index) => `src/dashboard/Parts.tsx:${index + 1} imports "${part}"`),
    );
  });

  it("a module of every code kind the build reads — .mts, .cts, .js, .jsx, .mjs, .cjs — is read, and its import past the seam is a finding", () => {
    const kinds = ["mts", "cts", "js", "jsx", "mjs", "cjs"];
    const root = plantedCopy({
      ...THE_ALLOWED_PAIR,
      ...Object.fromEntries(kinds.map((kind) => [`src/lib/planted.${kind}`, ["// made up", 'import { getSupabase } from "./supabase";', "export const reached = getSupabase;"]])),
      "src/dashboard/Planted.jsx": ['import { createClient } from "@supabase/supabase-js";', "export const Planted = () => <p>{String(createClient)}</p>;"],
    });

    expect(seamFindings(root).map(({ file, line }) => `${file}:${line}`).sort()).toEqual(
      ["src/dashboard/Planted.jsx:1", ...kinds.map((kind) => `src/lib/planted.${kind}:2`)].sort(),
    );
  });

  it("import x = require(\"x\") is an import: of the client module it is a finding, of the client's package for its value it is one, written import type it is not", () => {
    const root = plantedCopy({
      ...THE_ALLOWED_PAIR,
      "src/dashboard/Required.ts": ['import client = require("../lib/supabase");', "export const required = client.getSupabase;"],
      "src/lib/requiredPackage.ts": ['import supabase = require("@supabase/supabase-js");', "export const value = supabase.createClient;"],
      "src/lib/requiredTypes.ts": ['import type supabase = require("@supabase/supabase-js");', "export type Held = supabase.Session | null;"],
    });

    expect(seamFindings(root).map(({ file, line, found }) => `${file}:${line} ${found.split(",")[0]}`).sort()).toEqual(
      ['src/dashboard/Required.ts:1 imports "../lib/supabase"', 'src/lib/requiredPackage.ts:1 imports "@supabase/supabase-js"'].sort(),
    );
  });

  it("a module named with a .js, .jsx or .mjs extension, as moduleResolution bundler allows, is the module it names: the client module or the test support so named is a finding", () => {
    const root = plantedCopy({
      ...THE_ALLOWED_PAIR,
      "src/dashboard/Named.tsx": [
        'import { getSupabase } from "../lib/supabase.js";',
        'import { createFakeSupabase } from "../lib/fakeSupabase.jsx";',
        'import * as practice from "../lib/practiceCopy.mjs";',
        "export const named = [getSupabase, createFakeSupabase, practice];",
      ],
    });

    expect(seamFindings(root).map(({ file, line, found }) => `${file}:${line} ${found.split(",")[0]}`)).toEqual([
      'src/dashboard/Named.tsx:1 imports "../lib/supabase.js"',
      'src/dashboard/Named.tsx:2 imports "../lib/fakeSupabase.jsx"',
      'src/dashboard/Named.tsx:3 imports "../lib/practiceCopy.mjs"',
    ]);
  });

  it("Vite's import.meta.glob is a load-later: a pattern that matches the client module or the test support is a finding at its line, one that leaves them out or misses them is not", () => {
    const root = plantedCopy({
      ...THE_ALLOWED_PAIR,
      "src/lib/db.ts": [...THE_ALLOWED_PAIR["src/lib/db.ts"], 'export const again = import.meta.glob("./supabase.ts");'],
      "src/dashboard/Sidebar.tsx": ['export const eager = import.meta.glob("../lib/supabase.ts", { eager: true });'],
      "src/dashboard/Wild.tsx": ["export const wild = import.meta.glob(", '  "../lib/supa*.[tj]s",', ");"],
      "src/dashboard/Rooted.tsx": ["export const rooted = import.meta.glob([", '  "/src/dashboard/*.css",', '  "/src/**/practice?opy.ts",', "]);"],
      "src/dashboard/Based.tsx": ['export const based = import.meta.glob("./fakeSupabase.ts", { base: "../lib" });'],
      "src/dashboard/LeftOut.tsx": ['export const leftOut = import.meta.glob(["../lib/*.ts", "!../lib/{supabase,practiceCopy,fakeSupabase}.ts"]);'],
      "src/dashboard/Missed.tsx": ['// import.meta.glob("../lib/supabase.ts")', 'export const missed = import.meta.glob("./*.css");', 'export const text = "import.meta.glob(\'../lib/supabase.ts\')";'],
    });

    expect(seamFindings(root).map(({ file, line, found }) => `${file}:${line} ${found.split(",")[0]}`).sort()).toEqual(
      [
        'src/dashboard/Based.tsx:1 imports "./fakeSupabase.ts"',
        'src/dashboard/Rooted.tsx:3 imports "/src/**/practice?opy.ts"',
        'src/dashboard/Sidebar.tsx:1 imports "../lib/supabase.ts"',
        'src/dashboard/Wild.tsx:2 imports "../lib/supa*.[tj]s"',
      ].sort(),
    );
  });
});
