/**
 * vite.config.js: the demo-cards plugin that renders demos.json into
 * index.html, and the chunking that keeps React and three.js cacheable on
 * their own.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import config from "../vite.config.js";
import { renderCards } from "../demoCards.js";

const MANIFEST = fileURLToPath(new URL("../demos.json", import.meta.url));
const demos = JSON.parse(readFileSync(MANIFEST, "utf8"));
const plugin = config.plugins.find((p) => p.name === "demo-cards");
const seo = config.plugins.find((p) => p.name === "seo-files");

describe("demo-cards plugin", () => {
  it("runs before Vite’s own HTML pass, so card images are fingerprinted", () => {
    expect(plugin.transformIndexHtml.order).toBe("pre");
  });

  it("fills <!--demos--> from demos.json", () => {
    const html = plugin.transformIndexHtml.handler("<ul><!--demos--></ul>");
    expect(html).toBe(`<ul>${renderCards(demos)}</ul>`);
    expect(html).not.toContain("<!--demos-->");
  });

  it("fills the real index.html", () => {
    const index = readFileSync(
      fileURLToPath(new URL("../index.html", import.meta.url)),
      "utf8",
    );
    const html = plugin.transformIndexHtml.handler(index);
    for (const d of demos)
      expect(html).toContain(`https://${d.slug}.demos.growther.si/`);
  });

  it("reloads the dev page when demos.json changes, and only then", () => {
    const handlers = {};
    const server = {
      watcher: {
        add: vi.fn(),
        on: vi.fn((event, fn) => (handlers[event] = fn)),
      },
      ws: { send: vi.fn() },
    };
    plugin.configureServer(server);
    expect(server.watcher.add).toHaveBeenCalledWith(MANIFEST);

    handlers.change("/somewhere/else.js");
    expect(server.ws.send).not.toHaveBeenCalled();

    handlers.change(MANIFEST);
    expect(server.ws.send).toHaveBeenCalledWith({ type: "full-reload" });
  });
});

describe("seo-files plugin", () => {
  const emitted = () => {
    const files = {};
    seo.configResolved({
      root: fileURLToPath(new URL("..", import.meta.url)),
    });
    seo.generateBundle.call({
      emitFile: ({ fileName, source }) => (files[fileName] = source),
    });
    return files;
  };

  it("lists the listing and every demo in demos.json in the sitemap", () => {
    const locs = [
      ...emitted()["sitemap.xml"].matchAll(/<loc>(.*?)<\/loc>/g),
    ].map((m) => m[1]);
    expect(locs).toEqual([
      "https://demos.growther.si/",
      ...demos.map((d) => `https://${d.slug}.demos.growther.si/`),
    ]);
  });

  it("describes every demo in llms.txt and appends the repository README to llms-full.txt", () => {
    const files = emitted();
    for (const d of demos) {
      expect(files["llms.txt"]).toContain(
        `- [${d.title}](https://${d.slug}.demos.growther.si/): ${d.description}`,
      );
    }
    expect(files["llms-full.txt"]).toContain("## Adding a demo");
  });

  it("puts the demos ItemList into the page's structured data", () => {
    const index = readFileSync(
      fileURLToPath(new URL("../index.html", import.meta.url)),
      "utf8",
    );
    const { tags } = seo.transformIndexHtml.handler(index);
    const graph = JSON.parse(tags[0].children)["@graph"];
    const page = graph.find((n) => n["@type"] === "CollectionPage");
    expect(page.mainEntity.itemListElement.map((i) => i.url)).toEqual(
      demos.map((d) => `https://${d.slug}.demos.growther.si/`),
    );
  });
});

describe("build config", () => {
  const { manualChunks } = config.build.rollupOptions.output;

  it("splits React and three.js into their own chunks and leaves the rest to Vite", () => {
    expect(manualChunks("/x/node_modules/react-dom/client.js")).toBe("react");
    expect(manualChunks("/x/node_modules/react/index.js")).toBe("react");
    expect(manualChunks("/x/node_modules/three/build/three.module.js")).toBe(
      "three",
    );
    expect(manualChunks("/x/src/main.js")).toBeUndefined();
  });

  it("inherits the shared demo settings (one React, shared/ served)", () => {
    expect(config.resolve.dedupe).toEqual(["react", "react-dom"]);
    expect(config.server.proxy["/v1/version"].target).toBe(
      "https://growther.si",
    );
  });
});
