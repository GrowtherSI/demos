import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { demoViteConfig } from "./vite.mjs";

describe("demoViteConfig", () => {
  const config = demoViteConfig();

  it("resolves one React, from the demo's own install", () => {
    expect(config.resolve.dedupe).toEqual(["react", "react-dom"]);
    expect(config.oxc.jsx.runtime).toBe("automatic");
  });

  it("lets the dev server read shared/ from outside the demo's root", () => {
    const shared = fileURLToPath(new URL("..", import.meta.url));
    expect(config.server.fs.allow).toEqual([".", shared]);
  });

  it("proxies the download kit's /v1/version to growther.si in dev and preview", () => {
    const proxy = { target: "https://growther.si", changeOrigin: true };
    expect(config.server.proxy["/v1/version"]).toEqual(proxy);
    expect(config.preview.proxy["/v1/version"]).toEqual(proxy);
  });
});
