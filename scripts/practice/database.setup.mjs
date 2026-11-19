import fs from "node:fs";
import path from "node:path";
import { aroundEach, inject, vi } from "vitest";
import { MAIN_FOLDER, allowOnlyPracticeCopy, holdEachCheck, readSettings } from "./lib.mjs";

if (process.cwd() !== MAIN_FOLDER) process.chdir(MAIN_FOLDER);

const where = inject("practiceCopy");
const settings = readSettings(fs.readFileSync(path.join(MAIN_FOLDER, "supabase", "config.toml"), "utf8"));

for (const [name, value] of [
  ["VITE_SUPABASE_URL", where.address],
  ["VITE_SUPABASE_ANON_KEY", where.publicKey],
  ["VITE_TURNSTILE_SITE_KEY", ""],
]) {
  import.meta.env[name] = value;
  process.env[name] = value;
}

allowOnlyPracticeCopy(globalThis, import.meta.env.VITE_SUPABASE_URL, settings);

const accounts = JSON.parse(fs.readFileSync(path.join(MAIN_FOLDER, "supabase", "practice", "accounts.json"), "utf8")).accounts;
Object.defineProperty(globalThis, Symbol.for("compass.practice.accounts"), {
  value: accounts.map(({ name, email, password }) => ({ name, email, password })),
  writable: true,
  configurable: true,
  enumerable: false,
});

holdEachCheck("database", { aroundEach, vi });
