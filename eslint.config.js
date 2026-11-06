import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import { defineConfig, globalIgnores } from "eslint/config";

// One config for the whole repository: every demo (plain JS + three.js), the
// shared chrome and download kit (React/TSX), the Worker, and the tooling
// scripts. The TS block is growther-docs' / growther-admin's flat config
// verbatim, so the demos hold the same code-quality bar as the rest of the
// fleet; the JS block applies the same rules minus the TS-only ones.
const sharedRules = {
  "eslint-comments/no-restricted-disable": [
    "warn",
    "@typescript-eslint/no-explicit-any",
  ],
  "no-unused-vars": [
    "error",
    { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
  ],
};

export default defineConfig([
  // ⚠️ `.claude/**` IS NOT OPTIONAL. The coding harness creates git worktrees
  // under .claude/worktrees/<name>, each a FULL copy of this repo. eslint globs
  // `.`, finds a second candidate tsconfigRootDir, and typescript-eslint then
  // refuses to parse anything — so `npm run lint` (in both hooks) fails in the
  // main checkout for as long as a worktree exists. git ignores .claude/*;
  // eslint does not. (Same note, same reason, as growther-admin.)
  globalIgnores([
    "**/dist/**",
    "**/coverage/**",
    "**/.wrangler/**",
    ".claude/**",
  ]),
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      // Demos (browser) + Worker (web-standard) + build scripts (node).
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "eslint-comments": eslintComments,
    },
    rules: sharedRules,
  },
  {
    files: ["**/*.{ts,tsx,mts}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      // SPA (browser) + Worker (web-standard) + build scripts (node).
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "eslint-comments": eslintComments,
    },
    rules: {
      ...sharedRules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
]);
