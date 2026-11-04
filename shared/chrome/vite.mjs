/**
 * Vite settings every demo needs to use ../shared from its own directory.
 *
 *   // demo/vite.config.js
 *   import { defineConfig, mergeConfig } from "vite";
 *   import { demoViteConfig } from "../shared/chrome/vite.mjs";
 *   export default mergeConfig(demoViteConfig(), defineConfig({ ... }));
 *
 * - fs.allow: shared/ sits outside the demo's root, which the dev server
 *   refuses to serve by default.
 * - dedupe: shared/ has no node_modules of its own; this resolves react and
 *   react-dom from the DEMO's install, so there is exactly one React.
 * - jsx: the chrome is .tsx; Vite (oxc) compiles it with the automatic runtime,
 *   no React plugin needed.
 * - proxy: the download kit fetches same-origin /v1/version. In production the
 *   demo's Worker answers it; in dev, growther.si does.
 */
import { fileURLToPath } from "node:url";

const SHARED = fileURLToPath(new URL("..", import.meta.url));

export function demoViteConfig() {
  return {
    resolve: { dedupe: ["react", "react-dom"] },
    oxc: { jsx: { runtime: "automatic" } },
    server: {
      fs: { allow: [".", SHARED] },
      proxy: {
        "/v1/version": { target: "https://growther.si", changeOrigin: true },
      },
    },
    preview: {
      proxy: {
        "/v1/version": { target: "https://growther.si", changeOrigin: true },
      },
    },
  };
}
