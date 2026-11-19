import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function foldersLeftOut(): string[] {
  return fs
    .readFileSync(path.join(ROOT, ".vercelignore"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith("/") && !line.startsWith("#"))
    .map((line) => line.slice(0, -1));
}

function* filesUnder(folder: string): Generator<string> {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) yield* filesUnder(full);
    else if (/\.(ts|tsx|mts|css)$/.test(entry.name)) yield full;
  }
}

function relativeImports(text: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\bfrom\s+["'](\.{1,2}\/[^"']+)["']/g,
    /\bimport\s+["'](\.{1,2}\/[^"']+)["']/g,
    /\bimport\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g,
    /@import\s+(?:url\()?["'](\.{1,2}\/[^"']+)["']/g,
  ];
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) found.push(match[1]);
  return found;
}

describe("the hosting build, which leaves folders out", () => {
  it("names the folders it leaves out, the practice copy's among them", () => {
    expect(foldersLeftOut()).toEqual(expect.arrayContaining(["scripts", "supabase", "docs"]));
  });

  it("no file under src/ imports from a folder the hosting build leaves out", () => {
    const leftOut = foldersLeftOut();
    const reaching: string[] = [];

    for (const file of filesUnder(path.join(ROOT, "src"))) {
      for (const asked of relativeImports(fs.readFileSync(file, "utf8"))) {
        const target = path.relative(ROOT, path.resolve(path.dirname(file), asked)).split(path.sep).join("/");
        const folder = leftOut.find((one) => target === one || target.startsWith(`${one}/`));
        if (folder) reaching.push(`${path.relative(ROOT, file)} imports ${asked}, which is under ${folder}/`);
      }
    }

    expect(reaching, "imports the hosting build cannot find").toEqual([]);
  });
});
