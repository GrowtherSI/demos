import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { demoViteConfig } from "./vite.mjs";
import { seoFiles } from "../seo/vite.mjs";

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

  it("gives every demo the seo-files plugin, passing `seo` through to it", () => {
    expect(config.plugins.map((p) => p.name)).toEqual(["seo-files"]);
    const demo = demoViteConfig({
      seo: { app: { applicationCategory: "GameApplication" } },
    }).plugins[0];
    demo.configResolved({
      root: fileURLToPath(new URL("../../fibonacci-vis", import.meta.url)),
    });
    const html = `<title>T</title><meta name="description" content="D"><link rel="canonical" href="https://t.demos.growther.si/">`;
    const graph = JSON.parse(
      demo.transformIndexHtml.handler(html).tags[0].children,
    )["@graph"];
    expect(graph.find((n) => n["@type"] === "WebApplication")).toMatchObject({
      name: "T",
      applicationCategory: "GameApplication",
    });
    expect(seoFiles().name).toBe(demo.name);
  });

  it("proxies the download kit's /v1/version to growther.si in dev and preview", () => {
    const proxy = { target: "https://growther.si", changeOrigin: true };
    expect(config.server.proxy["/v1/version"]).toEqual(proxy);
    expect(config.preview.proxy["/v1/version"]).toEqual(proxy);
  });
});
