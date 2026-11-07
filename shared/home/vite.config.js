import { defineConfig, mergeConfig } from "vite";
import { demoViteConfig } from "../chrome/vite.mjs";
import { demoCards } from "./demoCards.js";

export default mergeConfig(
  demoViteConfig(),
  defineConfig({
    plugins: [demoCards()],
    build: {
      // three.js alone is ~500 kB minified; split it so the app code caches separately.
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/three")) return "three";
            if (id.includes("node_modules/react")) return "react";
            return undefined;
          },
        },
      },
    },
    test: {
      environment: "node",
      coverage: {
        provider: "v8",
        // demoCards.js renders the listing, so it is measured with src/.
        include: ["src/**/*.js", "demoCards.js"],
        // 100%, and it stays there: never lower it to make a red build green.
        thresholds: {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
      },
    },
  }),
);
