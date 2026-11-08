/**
 * The Vite plugin that gives every demo site its crawler-facing files, with no
 * copy to maintain. demoViteConfig() (../chrome/vite.mjs) adds it to every
 * demo, so a demo gets all of this by having an index.html with a <title>, a
 * meta description and a canonical link, a package.json whose
 * repository.directory says where it lives, and a README.md:
 *
 *   dist/sitemap.xml      this page (and, on the listing, every demo)
 *   dist/robots.txt       crawl policy and the sitemap(s)
 *   dist/llms.txt         the llmstxt.org map
 *   dist/llms-full.txt    llms.txt plus the README
 *   <head>                a JSON-LD graph: WebApplication + SoftwareSourceCode
 *                         (or CollectionPage + ItemList on the listing),
 *                         Organization, WebSite and the breadcrumb
 *
 * The files are emitted into the bundle at build time and served from memory
 * by the dev server, so what `vite dev` shows at /llms.txt is what deploys.
 *
 *   seoFiles()                                   a demo
 *   seoFiles({ app: { applicationCategory } })   a demo, with more WebApplication facts
 *   seoFiles({ demos, readme: "../../README.md" }) the listing
 */
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEMOS_URL,
  jsonLd,
  jsonLdGraph,
  readPageMeta,
  renderLlmsFullTxt,
  renderLlmsTxt,
  renderRobots,
  renderSitemap,
  REPO_URL,
  demoUrl,
} from "./render.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const TEXT = "text/plain; charset=utf-8";
const XML = "application/xml; charset=utf-8";

/**
 * Everything the files are rendered from, read fresh from the app's root so a
 * dev-server edit to index.html or the README shows on the next request.
 */
export function readSite(root, { demos, readme = "README.md" } = {}) {
  const meta = readPageMeta(readFileSync(resolve(root, "index.html"), "utf8"));
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const dir = pkg.repository?.directory;
  if (!dir) {
    throw new Error(
      "package.json needs repository.directory (where this app lives in the repository)",
    );
  }
  const readmePath = resolve(root, readme);
  const readmeRel = relative(REPO_ROOT, readmePath).split("\\").join("/");
  return {
    ...meta,
    demos,
    sourceUrl: demos ? REPO_URL : `${REPO_URL}/tree/main/${dir}`,
    readmeUrl: `${REPO_URL}/blob/main/${readmeRel}`,
    readme: readFileSync(readmePath, "utf8"),
  };
}

/** The four files, keyed by their path in dist/. */
export function renderFiles(site) {
  const urls = [
    site.canonical,
    ...(site.demos ?? []).map((d) => demoUrl(d.slug)),
  ];
  // A demo's URL is also in the listing's sitemap; naming that sitemap here is
  // what lets it list a URL on this host (sitemaps.org cross-submission).
  const sitemaps = [`${site.origin}/sitemap.xml`];
  if (!site.demos) sitemaps.push(`${DEMOS_URL}/sitemap.xml`);
  const llms = renderLlmsTxt(site);
  return {
    "sitemap.xml": { type: XML, source: renderSitemap(urls) },
    "robots.txt": {
      type: TEXT,
      source: renderRobots({ origin: site.origin, sitemaps }),
    },
    "llms.txt": { type: TEXT, source: llms },
    "llms-full.txt": {
      type: TEXT,
      source: renderLlmsFullTxt(llms, site.readme),
    },
  };
}

/**
 * @param {object} [options]
 * @param {{slug: string, title: string, description: string}[]} [options.demos]
 *   the listing passes its demos.json; a demo passes nothing
 * @param {string} [options.readme]  the README, relative to the app's root
 * @param {Record<string, unknown>} [options.app]  extra WebApplication facts
 */
export function seoFiles(options = {}) {
  let root = process.cwd();
  const site = () => readSite(root, options);
  return {
    name: "seo-files",
    configResolved(config) {
      root = config.root;
    },
    transformIndexHtml: {
      // After every other HTML transform, so the meta it reads is final.
      order: "post",
      handler(html) {
        const graph = jsonLdGraph({
          ...readPageMeta(html),
          sourceUrl: site().sourceUrl,
          demos: options.demos,
          app: options.app,
        });
        return {
          html,
          tags: [
            {
              tag: "script",
              attrs: { type: "application/ld+json" },
              children: jsonLd(graph),
              injectTo: "head",
            },
          ],
        };
      },
    },
    generateBundle() {
      for (const [fileName, { source }] of Object.entries(
        renderFiles(site()),
      )) {
        this.emitFile({ type: "asset", fileName, source });
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url.split("?")[0].slice(1);
        const files = renderFiles(site());
        if (!Object.hasOwn(files, path)) return next();
        const file = files[path];
        res.setHeader("content-type", file.type);
        res.end(file.source);
      });
    },
  };
}
