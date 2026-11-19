import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { KEPT_BROWSER_FILES, readSettings } from "../scripts/practice/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const SETTINGS = readSettings(fs.readFileSync(path.join(HERE, "..", "supabase", "config.toml"), "utf8"));

const APP = process.env.BROWSER_APP || SETTINGS.app;

const leftOut = Object.entries(KEPT_BROWSER_FILES)
  .filter(([, asks]) => process.env[asks] !== "1")
  .map(([file]) => `**/${file}`);

export default defineConfig({
  testDir: HERE,
  testMatch: "**/*.browser.ts",
  testIgnore: ["**/results/**", ...leftOut],
  outputDir: path.join(HERE, "results"),
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["json", { outputFile: path.join(HERE, "results", "report.json") }],
  ],
  use: {
    baseURL: APP,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
