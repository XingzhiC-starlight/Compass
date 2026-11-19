import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import type { Finding } from "./what-the-code-holds";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const scratch: string[] = [];

export function removeScratchFolders(): void {
  for (const dir of scratch.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
}

export function scratchRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ch043-"));
  scratch.push(dir);
  return dir;
}

export function copyOfTheCode(): string {
  const root = scratchRoot();
  fs.cpSync(path.join(REPO, "src"), path.join(root, "src"), { recursive: true });
  if (fs.existsSync(path.join(REPO, "index.html"))) fs.copyFileSync(path.join(REPO, "index.html"), path.join(root, "index.html"));
  if (fs.existsSync(path.join(REPO, "public"))) fs.cpSync(path.join(REPO, "public"), path.join(root, "public"), { recursive: true });
  return root;
}

export function plant(root: string, file: string, line: string): number {
  const full = path.join(root, file);
  const before = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
  const head = before === "" ? "" : before.endsWith("\n") ? before : before + "\n";
  const after = head + line + "\n";
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, after);
  return after.split("\n").length - 1;
}

export function write(root: string, file: string, lines: string[]): void {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, lines.join("\n") + "\n");
}

export function plantedCopy(files: Record<string, string[] | Buffer>): string {
  const root = scratchRoot();
  for (const [file, content] of Object.entries(files)) {
    if (Array.isArray(content)) write(root, file, content);
    else {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), content);
    }
  }
  return root;
}

export function attempt<T>(run: () => T): T | { threw: string } {
  try {
    return run();
  } catch (error) {
    return { threw: error instanceof Error ? error.message : String(error) };
  }
}

export function sorted(findings: Finding[] | { threw: string }): Finding[] | { threw: string } {
  if (!Array.isArray(findings)) return findings;
  return [...findings].sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
}

export function finding(file: string, line: number, rule: Finding["rule"], found: RegExp = /\S/) {
  return { file, line, rule, found: expect.stringMatching(found) };
}
