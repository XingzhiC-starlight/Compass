import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "dist/",
    "ds-bundle/",
    ".ds-sync/",
    ".design-sync/",
    ".claude/",
    "browser/results/",
    "desktop/out/",
    "desktop/results/",
    "desktop/release/",
    "supabase/",
  ]),
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "prefer-const": ["error", { ignoreReadBeforeAssign: true }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [reactRefresh.configs.vite],
    // The hooks plugin's newer rules are written for the React Compiler, which Compass does not
    // use, and would flag the "latest value in a ref" pattern the cards rely on, so they are
    // left off.
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: globals.browser },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    files: ["scripts/**", "browser/**", "desktop/**", "*.{js,mjs,ts}"],
    languageOptions: { globals: globals.node },
  },
]);
