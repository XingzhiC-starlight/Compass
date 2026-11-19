import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import { readSettings } from "./scripts/practice/lib.mjs";

process.env.TZ = "America/Los_Angeles";

const DATABASE_FILES = ["src/**/*.database.*.test.{ts,tsx}", "scripts/**/*.database.*.test.ts"];

const FALSE_ON_PURPOSE = "scripts/practice/*-on-purpose.database.fixture.test.ts";
const falseCheckAskedFor = process.env.PRACTICE_FALSE_CHECK === "1";

const CLOSING_FAILS_ON_PURPOSE = "scripts/practice/closing-fails-on-purpose.global-setup.mjs";
const closingFailureAskedFor = process.env.PRACTICE_CLOSING_FAILS === "1";

const EXIT_CODE_FAILS_ON_PURPOSE = "scripts/practice/exit-code-fails-on-purpose.global-setup.mjs";
const exitCodeFailureAskedFor = process.env.PRACTICE_EXIT_CODE_FAILS === "1";

const FIRST_STEP_FAILS_ON_PURPOSE = "scripts/practice/first-step-fails-on-purpose.global-setup.mjs";
const firstStepFailureAskedFor = process.env.PRACTICE_FIRST_STEP_FAILS === "1";

const MAIN_FOLDER = path.dirname(fileURLToPath(import.meta.url));

const PRACTICE_APP = readSettings(fs.readFileSync(path.join(MAIN_FOLDER, "supabase", "config.toml"), "utf8")).app;

export default defineConfig({
  root: MAIN_FOLDER,
  // No .env file is read: the developer's .env.local holds the live project's address and
  // public key.
  envDir: false,
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "suite",
          environment: "jsdom",
          exclude: [...configDefaults.exclude, ".claude/**", ...DATABASE_FILES],
          setupFiles: ["scripts/practice/suite.setup.mjs"],
          runner: "scripts/practice/network.runner.mjs",
          // Blanked, so a value exported in a shell, or set for a whole job, does not reach a check.
          env: {
            VITE_SUPABASE_URL: "",
            VITE_SUPABASE_ANON_KEY: "",
            VITE_TURNSTILE_SITE_KEY: "",
          },
        },
      },
      {
        extends: true,
        test: {
          name: "database",
          environment: "jsdom",
          environmentOptions: { jsdom: { url: PRACTICE_APP } },
          include: DATABASE_FILES,
          exclude: [...configDefaults.exclude, ".claude/**", ...(falseCheckAskedFor ? [] : [FALSE_ON_PURPOSE])],
          globalSetup: [
            "scripts/practice/database.global-setup.mjs",
            ...(closingFailureAskedFor ? [CLOSING_FAILS_ON_PURPOSE] : []),
            ...(exitCodeFailureAskedFor ? [EXIT_CODE_FAILS_ON_PURPOSE] : []),
            ...(firstStepFailureAskedFor ? [FIRST_STEP_FAILS_ON_PURPOSE] : []),
          ],
          setupFiles: ["scripts/practice/database.setup.mjs"],
          runner: "scripts/practice/network.runner.mjs",
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
          env: {
            VITE_SUPABASE_URL: "",
            VITE_SUPABASE_ANON_KEY: "",
            VITE_TURNSTILE_SITE_KEY: "",
          },
        },
      },
    ],
  },
});
