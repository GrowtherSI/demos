import { defineConfig } from "vitest/config";

/**
 * The shared/ suite: the chrome every demo mounts, the Worker every demo
 * deploys with, and the mirrored download kit's own tests.
 *
 * Each app (every demo, and shared/home) runs its own suite from its own
 * install — `npm test` at the root runs this one and then theirs
 * (scripts/apps.mjs). `include` is anchored to shared/ so this config never
 * picks up an app's tests, which need that app's dependencies, and never
 * walks into .claude/worktrees (a full second copy of the repository).
 */
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: [
      "shared/chrome/**/*.test.{js,ts,tsx}",
      "shared/worker/**/*.test.{js,ts}",
      "shared/seo/**/*.test.{js,mjs}",
      "shared/downloadKit/**/*.test.{ts,tsx}",
    ],
    environment: "node",
    // jsdom only exposes localStorage for a document with a real (non-opaque)
    // origin; the download kit's client tests depend on it.
    environmentOptions: {
      jsdom: { url: "https://demos.growther.si/" },
    },
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      provider: "v8",
      include: [
        "shared/chrome/**/*.{ts,tsx,mjs}",
        "shared/worker/**/*.js",
        "shared/seo/**/*.{js,mjs}",
      ],
      exclude: ["**/*.test.*"],
      /*
       * 100%, and it stays there. Everything measured here is code this
       * repository owns; shared/downloadKit is not measured because it is a
       * byte-for-byte mirror whose canonical copy (growther-marketing) owns
       * its coverage — its tests still run above, against this copy.
       */
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
