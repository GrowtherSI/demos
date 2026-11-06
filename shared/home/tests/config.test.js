/**
 * vite.config.js: the demo-cards plugin that renders demos.json into
 * index.html, and the chunking that keeps React cacheable on its own.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import config from "../vite.config.js";
import { renderCards } from "../demoCards.js";

const MANIFEST = fileURLToPath(new URL("../demos.json", import.meta.url));
const demos = JSON.parse(readFileSync(MANIFEST, "utf8"));
const plugin = config.plugins.find((p) => p.name === "demo-cards");

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

describe("build config", () => {
  const { manualChunks } = config.build.rollupOptions.output;

  it("splits React into its own chunk and leaves the rest to Vite", () => {
    expect(manualChunks("/x/node_modules/react-dom/client.js")).toBe("react");
    expect(manualChunks("/x/node_modules/react/index.js")).toBe("react");
    expect(manualChunks("/x/src/main.js")).toBeUndefined();
  });

  it("inherits the shared demo settings (one React, shared/ served)", () => {
    expect(config.resolve.dedupe).toEqual(["react", "react-dom"]);
    expect(config.server.proxy["/v1/version"].target).toBe(
      "https://growther.si",
    );
  });
});
