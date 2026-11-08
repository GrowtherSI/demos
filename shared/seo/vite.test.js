/**
 * The seo-files plugin against the real apps: fibonacci-vis (a demo) and
 * shared/home (the listing). What it emits is what deploys, so the fixtures
 * are the apps themselves rather than copies that could drift.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import { readPageMeta, REPO_URL } from "./render.js";
import { readSite, renderFiles, seoFiles } from "./vite.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const DEMO = join(REPO, "fibonacci-vis");
const HOME = join(REPO, "shared/home");
const demos = JSON.parse(readFileSync(join(HOME, "demos.json"), "utf8"));
const listingOptions = { demos, readme: "../../README.md" };

/** A plugin after Vite told it its root. */
function configured(root, options) {
  const plugin = seoFiles(options);
  plugin.configResolved({ root });
  return plugin;
}

/** Run generateBundle and collect what it emits. */
function emitted(plugin) {
  const files = {};
  plugin.generateBundle.call({
    emitFile: ({ type, fileName, source }) => {
      expect(type).toBe("asset");
      files[fileName] = source;
    },
  });
  return files;
}

describe("readSite", () => {
  it("reads a demo from its index.html, package.json and README", () => {
    const site = readSite(DEMO);
    expect(site).toMatchObject({
      name: "Fibonacci Visualizer",
      canonical: "https://fibonacci-vis.demos.growther.si/",
      origin: "https://fibonacci-vis.demos.growther.si",
      demos: undefined,
      sourceUrl: `${REPO_URL}/tree/main/fibonacci-vis`,
      readmeUrl: `${REPO_URL}/blob/main/fibonacci-vis/README.md`,
    });
    expect(site.description.length).toBeGreaterThan(50);
    expect(site.readme).toBe(readFileSync(join(DEMO, "README.md"), "utf8"));
  });

  it("reads the listing with the repository as its source and README", () => {
    const site = readSite(HOME, listingOptions);
    expect(site).toMatchObject({
      name: "OpenSource Demos",
      canonical: "https://demos.growther.si/",
      demos,
      sourceUrl: REPO_URL,
      readmeUrl: `${REPO_URL}/blob/main/README.md`,
    });
    expect(site.readme).toBe(readFileSync(join(REPO, "README.md"), "utf8"));
  });

  describe("without repository.directory", () => {
    const root = mkdtempSync(join(tmpdir(), "seo-files-"));
    afterAll(() => rmSync(root, { recursive: true, force: true }));

    it("refuses: there is nowhere to point Source at", () => {
      writeFileSync(
        join(root, "index.html"),
        readFileSync(join(DEMO, "index.html"), "utf8"),
      );
      writeFileSync(join(root, "package.json"), '{"name":"x"}');
      expect(() => readSite(root)).toThrow(
        "package.json needs repository.directory",
      );
    });
  });
});

describe("renderFiles", () => {
  it("gives a demo its own sitemap and names the listing's sitemap in robots.txt", () => {
    const files = renderFiles(readSite(DEMO));
    expect(Object.keys(files)).toEqual([
      "sitemap.xml",
      "robots.txt",
      "llms.txt",
      "llms-full.txt",
    ]);
    expect(files["sitemap.xml"].type).toBe("application/xml; charset=utf-8");
    expect(files["robots.txt"].type).toBe("text/plain; charset=utf-8");
    expect(files["sitemap.xml"].source.match(/<loc>/g)).toHaveLength(1);
    expect(files["sitemap.xml"].source).toContain(
      "<loc>https://fibonacci-vis.demos.growther.si/</loc>",
    );
    expect(files["robots.txt"].source).toContain(
      "Sitemap: https://fibonacci-vis.demos.growther.si/sitemap.xml\nSitemap: https://demos.growther.si/sitemap.xml\n",
    );
    expect(
      files["llms-full.txt"].source.startsWith(files["llms.txt"].source),
    ).toBe(true);
    expect(files["llms-full.txt"].source).toContain("# Fibonacci Visualizer\n");
    expect(files["llms-full.txt"].source).toContain("## Run it");
  });

  it("gives the listing a sitemap of itself and every demo, and only its own sitemap in robots.txt", () => {
    const files = renderFiles(readSite(HOME, listingOptions));
    const locs = [
      ...files["sitemap.xml"].source.matchAll(/<loc>(.*?)<\/loc>/g),
    ].map((m) => m[1]);
    expect(locs).toEqual([
      "https://demos.growther.si/",
      ...demos.map((d) => `https://${d.slug}.demos.growther.si/`),
    ]);
    expect(files["robots.txt"].source.match(/^Sitemap: .*$/gm)).toEqual([
      "Sitemap: https://demos.growther.si/sitemap.xml",
    ]);
    for (const d of demos) {
      expect(files["llms.txt"].source).toContain(
        `- [${d.title}](https://${d.slug}.demos.growther.si/): ${d.description}`,
      );
    }
    expect(files["llms-full.txt"].source).toContain("## Adding a demo");
  });
});

describe("seoFiles plugin", () => {
  it("is named, and takes its root from Vite", () => {
    const plugin = seoFiles();
    expect(plugin.name).toBe("seo-files");
    expect(plugin.transformIndexHtml.order).toBe("post");
    // Before configResolved it reads the current directory (the repository
    // root here, which is not an app).
    expect(() => emitted(plugin)).toThrow();
    plugin.configResolved({ root: DEMO });
    expect(Object.keys(emitted(plugin))).toContain("sitemap.xml");
  });

  it("emits the four files into the bundle", () => {
    const files = emitted(configured(DEMO));
    expect(files).toEqual(renderFilesSources(DEMO));
    const home = emitted(configured(HOME, listingOptions));
    expect(home).toEqual(renderFilesSources(HOME, listingOptions));
  });

  it("injects the page's JSON-LD graph into <head>, built from the final HTML", () => {
    const plugin = configured(DEMO, {
      app: { applicationCategory: "EducationalApplication" },
    });
    const html = readFileSync(join(DEMO, "index.html"), "utf8");
    const result = plugin.transformIndexHtml.handler(html);
    expect(result.html).toBe(html);
    expect(result.tags).toHaveLength(1);
    const [tag] = result.tags;
    expect(tag).toMatchObject({
      tag: "script",
      attrs: { type: "application/ld+json" },
      injectTo: "head",
    });
    const graph = JSON.parse(tag.children)["@graph"];
    const app = graph.find((n) => n["@type"] === "WebApplication");
    expect(app).toMatchObject({
      name: "Fibonacci Visualizer",
      url: "https://fibonacci-vis.demos.growther.si/",
      description: readPageMeta(html).description,
      applicationCategory: "EducationalApplication",
    });
    expect(graph.find((n) => n["@type"] === "SoftwareSourceCode")["@id"]).toBe(
      `${REPO_URL}/tree/main/fibonacci-vis`,
    );
  });

  it("builds the listing's ItemList from the demos it is given", () => {
    const plugin = configured(HOME, listingOptions);
    const html = readFileSync(join(HOME, "index.html"), "utf8");
    const graph = JSON.parse(
      plugin.transformIndexHtml.handler(html).tags[0].children,
    )["@graph"];
    const page = graph.find((n) => n["@type"] === "CollectionPage");
    expect(page.mainEntity.itemListElement.map((i) => i.name)).toEqual(
      demos.map((d) => d.title),
    );
    expect(graph.some((n) => n["@type"] === "WebApplication")).toBe(false);
  });

  describe("dev server", () => {
    const plugin = configured(DEMO);
    let handler;
    plugin.configureServer({ middlewares: { use: (fn) => (handler = fn) } });

    const request = (url) => {
      const res = { setHeader: vi.fn(), end: vi.fn() };
      const next = vi.fn();
      handler({ url }, res, next);
      return { res, next };
    };

    it("serves the files it would emit, with their content type", () => {
      const files = renderFiles(readSite(DEMO));
      for (const [path, file] of Object.entries(files)) {
        const { res, next } = request(`/${path}`);
        expect(next).not.toHaveBeenCalled();
        expect(res.setHeader).toHaveBeenCalledWith("content-type", file.type);
        expect(res.end).toHaveBeenCalledWith(file.source);
      }
    });

    it("ignores a query string", () => {
      const { res } = request("/robots.txt?x=1");
      expect(res.end).toHaveBeenCalledWith(
        renderFiles(readSite(DEMO))["robots.txt"].source,
      );
    });

    it("passes everything else on, including names of Object.prototype", () => {
      for (const url of ["/", "/index.html", "/constructor", "/assets/x.js"]) {
        const { res, next } = request(url);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.end).not.toHaveBeenCalled();
      }
    });
  });
});

function renderFilesSources(root, options) {
  return Object.fromEntries(
    Object.entries(renderFiles(readSite(root, options))).map(([k, v]) => [
      k,
      v.source,
    ]),
  );
}
