import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// The desktop check (spec §22): it starts the built desktop app itself, so there is no
// browser project and no address here. `npm run test:desktop` builds the app first.
export default defineConfig({
  testDir: HERE,
  testMatch: "**/*.desktop.ts",
  testIgnore: ["**/out/**", "**/results/**"],
  outputDir: path.join(HERE, "results"),
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
});
