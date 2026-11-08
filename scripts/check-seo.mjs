#!/usr/bin/env node
/**
 * check-seo.mjs — CI guard, run against an app's dist/ after `npm run build`:
 *
 *   node scripts/check-seo.mjs fibonacci-vis/dist
 *
 * Confirms the build produced what crawlers and LLMs will fetch, and that the
 * files agree with each other and with the page:
 *
 *  - index.html has a <title>, a meta description, a canonical link and a
 *    JSON-LD graph that parses and is about the canonical URL
 *  - sitemap.xml exists, is a urlset, lists the canonical URL first, and
 *    every URL in it is https on growther.si
 *  - robots.txt allows everyone and names this origin's sitemap
 *  - llms.txt is a markdown document that opens with an H1 and names the page;
 *    llms-full.txt opens with llms.txt
 *
 * Exit 1 with every problem listed. Zero dependencies.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dist = resolve(process.argv[2] ?? "dist");
const problems = [];
const fail = (msg) => problems.push(msg);

const read = (name) => {
  const path = join(dist, name);
  if (!existsSync(path)) {
    fail(`${name} is missing`);
    return null;
  }
  return readFileSync(path, "utf8");
};

const html = read("index.html");
const sitemap = read("sitemap.xml");
const robots = read("robots.txt");
const llms = read("llms.txt");
const llmsFull = read("llms-full.txt");

let canonical = null;
if (html !== null) {
  if (!/<title>[^<]+<\/title>/.test(html)) fail("index.html has no <title>");
  if (!/<meta\s[^>]*name="description"/.test(html)) {
    fail('index.html has no <meta name="description">');
  }
  canonical = /<link\s[^>]*rel="canonical"[^>]*href="([^"]+)"/.exec(html)?.[1];
  if (!canonical) fail('index.html has no <link rel="canonical">');
  const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(
    html,
  )?.[1];
  if (!ld) fail("index.html has no JSON-LD");
  else {
    try {
      const graph = JSON.parse(ld)["@graph"];
      if (!Array.isArray(graph) || graph.length === 0) {
        fail("JSON-LD has no @graph");
      } else if (canonical && !graph.some((n) => n["@id"] === canonical)) {
        fail(`JSON-LD has no node whose @id is the canonical URL ${canonical}`);
      }
    } catch (err) {
      fail(`JSON-LD does not parse: ${err.message}`);
    }
  }
}

const origin = canonical ? new URL(canonical).origin : null;

if (sitemap !== null) {
  if (!sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
    fail("sitemap.xml has no XML declaration");
  }
  if (
    !sitemap.includes(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    )
  ) {
    fail("sitemap.xml is not a sitemaps.org urlset");
  }
  const locs = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  if (locs.length === 0) fail("sitemap.xml lists no URLs");
  if (canonical && locs[0] !== canonical) {
    fail(`sitemap.xml should list the canonical URL first, not ${locs[0]}`);
  }
  for (const loc of locs) {
    if (!/^https:\/\/([\w-]+\.)*growther\.si\//.test(loc)) {
      fail(`sitemap.xml lists a URL off growther.si or not https: ${loc}`);
    }
  }
  if (new Set(locs).size !== locs.length) fail("sitemap.xml repeats a URL");
}

if (robots !== null) {
  if (!/^User-agent: \*\nAllow: \/$/m.test(robots)) {
    fail("robots.txt does not allow every agent");
  }
  if (/^Disallow:/m.test(robots)) fail("robots.txt disallows something");
  if (origin && !robots.includes(`Sitemap: ${origin}/sitemap.xml`)) {
    fail(`robots.txt does not name ${origin}/sitemap.xml`);
  }
  if (origin && !robots.includes(`${origin}/llms.txt`)) {
    fail(`robots.txt does not point at ${origin}/llms.txt`);
  }
}

if (llms !== null) {
  if (!/^# .+\n\n> .+\n/.test(llms)) {
    fail("llms.txt does not open with an H1 and a blockquote summary");
  }
  if (canonical && !llms.includes(`](${canonical})`)) {
    fail(`llms.txt does not link ${canonical}`);
  }
  if (llmsFull !== null && !llmsFull.startsWith(llms)) {
    fail("llms-full.txt does not open with llms.txt");
  }
}

if (problems.length) {
  console.error(`[FAIL] SEO files in ${dist}:`);
  problems.forEach((p) => console.error(`   - ${p}`));
  process.exit(1);
}
console.log(
  `[OK] ${dist}: index.html, sitemap.xml, robots.txt, llms.txt and llms-full.txt agree (${canonical}).`,
);
