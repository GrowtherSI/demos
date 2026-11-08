import { describe, expect, it } from "vitest";
import { DEMOS_URL, DOCS_URL, SITE_URL } from "../chrome/DemoChrome";
import {
  AI_ANSWER_AGENTS,
  AI_TRAINING_AGENTS,
  decodeEntities,
  demoUrl,
  escapeXml,
  jsonLd,
  jsonLdGraph,
  readPageMeta,
  renderLlmsFullTxt,
  renderLlmsTxt,
  renderRobots,
  renderSitemap,
  REPO_URL,
  DEMOS_URL as SEO_DEMOS_URL,
  DOCS_URL as SEO_DOCS_URL,
  SITE_URL as SEO_SITE_URL,
} from "./render.js";

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <title>Fibonacci Visualizer &amp; friends · Growther.si demos</title>
    <meta
      name="description"
      content="Fibonacci patterns in 3D. An OpenSource demo."
    />
    <link rel="canonical" href="https://fibonacci-vis.demos.growther.si/" />
    <meta property="og:site_name" content="Growther.si demos" />
    <meta property="og:title" content="Fibonacci Visualizer" />
  </head>
</html>`;

const site = {
  name: "Fibonacci Visualizer",
  description: "Fibonacci patterns in 3D.",
  canonical: "https://fibonacci-vis.demos.growther.si/",
  origin: "https://fibonacci-vis.demos.growther.si",
  siteName: "Growther.si demos",
  sourceUrl: `${REPO_URL}/tree/main/fibonacci-vis`,
  readmeUrl: `${REPO_URL}/blob/main/fibonacci-vis/README.md`,
};

const demos = [
  { slug: "fibonacci-vis", title: "Fibonacci Visualizer", description: "3D." },
  { slug: "other", title: "Other <demo>", description: "Another." },
];

const listing = {
  name: "OpenSource Demos",
  description: "Every demo.",
  canonical: "https://demos.growther.si/",
  origin: "https://demos.growther.si",
  siteName: "Growther.si demos",
  sourceUrl: REPO_URL,
  readmeUrl: `${REPO_URL}/blob/main/README.md`,
  demos,
};

describe("the Growther.si URLs", () => {
  it("are the ones the chrome links to", () => {
    expect(SEO_SITE_URL).toBe(SITE_URL);
    expect(SEO_DOCS_URL).toBe(DOCS_URL);
    expect(SEO_DEMOS_URL).toBe(DEMOS_URL);
  });

  it("place a demo on its own subdomain, the same rule as its Worker route", () => {
    expect(demoUrl("fibonacci-vis")).toBe(
      "https://fibonacci-vis.demos.growther.si/",
    );
  });
});

describe("escaping", () => {
  it("escapes the five XML specials", () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe("a&amp;b&lt;c&gt;d&quot;e&#39;f");
  });

  it("decodes named and numeric entities and leaves unknown ones alone", () => {
    expect(decodeEntities("&amp;&lt;&gt;&quot;&apos;&#183;&#8212;")).toBe(
      "&<>\"'·—",
    );
    expect(decodeEntities("&nosuch; stays")).toBe("&nosuch; stays");
  });
});

describe("readPageMeta", () => {
  it("reads title, description, canonical, og:title and og:site_name", () => {
    expect(readPageMeta(PAGE)).toEqual({
      title: "Fibonacci Visualizer & friends · Growther.si demos",
      name: "Fibonacci Visualizer",
      description: "Fibonacci patterns in 3D. An OpenSource demo.",
      canonical: "https://fibonacci-vis.demos.growther.si/",
      origin: "https://fibonacci-vis.demos.growther.si",
      siteName: "Growther.si demos",
    });
  });

  it("falls back to the <title> and the Growther.si site name without og tags", () => {
    const html = PAGE.replace(/<meta property="og:[^>]*>/g, "");
    const meta = readPageMeta(html);
    expect(meta.name).toBe(
      "Fibonacci Visualizer & friends · Growther.si demos",
    );
    expect(meta.siteName).toBe("Growther.si demos");
  });

  it("reads attributes in any order", () => {
    const html = PAGE.replace(
      /<meta\s+name="description"\s+content="([^"]*)"\s*\/>/,
      '<meta content="$1" name="description">',
    ).replace(
      '<link rel="canonical" href="https://fibonacci-vis.demos.growther.si/" />',
      '<link href="https://fibonacci-vis.demos.growther.si/" rel="canonical">',
    );
    expect(readPageMeta(html)).toMatchObject({
      description: "Fibonacci patterns in 3D. An OpenSource demo.",
      canonical: "https://fibonacci-vis.demos.growther.si/",
    });
  });

  it("names every missing essential at once", () => {
    expect(() => readPageMeta("<html></html>")).toThrow(
      'index.html is missing <title>, <meta name="description">, <link rel="canonical">',
    );
    expect(() =>
      readPageMeta(PAGE.replace(/<link rel="canonical"[^>]*>/, "")),
    ).toThrow('index.html is missing <link rel="canonical">');
    expect(() =>
      readPageMeta(PAGE.replace(/<meta\s+name="description"[^>]*>/, "")),
    ).toThrow('index.html is missing <meta name="description">');
    expect(() => readPageMeta(PAGE.replace(/<title>.*<\/title>/, ""))).toThrow(
      "index.html is missing <title>",
    );
  });
});

describe("renderSitemap", () => {
  it("lists each URL once, escaped, with no lastmod", () => {
    const xml = renderSitemap([
      "https://demos.growther.si/",
      "https://x.demos.growther.si/?a=1&b=2",
    ]);
    expect(xml).toBe(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://demos.growther.si/</loc></url>
  <url><loc>https://x.demos.growther.si/?a=1&amp;b=2</loc></url>
</urlset>
`);
    expect(xml).not.toContain("lastmod");
  });
});

describe("renderRobots", () => {
  const robots = renderRobots({ origin: "https://x.demos.growther.si" });

  it("allows everyone and points at llms.txt and the sitemap", () => {
    expect(robots).toMatch(
      /^# x\.demos\.growther\.si — humans and machines welcome\./,
    );
    expect(robots).toContain("User-agent: *\nAllow: /\n");
    expect(robots).toContain("https://x.demos.growther.si/llms.txt");
    expect(robots).toContain("https://x.demos.growther.si/llms-full.txt");
    expect(robots.trimEnd().split("\n").at(-1)).toBe(
      "Sitemap: https://x.demos.growther.si/sitemap.xml",
    );
  });

  it("names every AI agent explicitly, answer agents before training crawlers", () => {
    const named = [...robots.matchAll(/^User-agent: (.+)$/gm)].map((m) => m[1]);
    expect(named).toEqual(["*", ...AI_ANSWER_AGENTS, ...AI_TRAINING_AGENTS]);
    expect(robots.match(/^Allow: \/$/gm)).toHaveLength(named.length);
    expect(robots).not.toContain("Disallow");
  });

  it("lists every sitemap it is given", () => {
    const multi = renderRobots({
      origin: "https://x.demos.growther.si",
      sitemaps: [
        "https://x.demos.growther.si/sitemap.xml",
        "https://demos.growther.si/sitemap.xml",
      ],
    });
    expect(multi).toContain(
      "Sitemap: https://x.demos.growther.si/sitemap.xml\nSitemap: https://demos.growther.si/sitemap.xml\n",
    );
  });
});

describe("renderLlmsTxt", () => {
  it("describes a demo: H1, blockquote, its links, Growther.si, the full text", () => {
    const txt = renderLlmsTxt(site);
    expect(txt.split("\n").slice(0, 3)).toEqual([
      "# Fibonacci Visualizer",
      "",
      "> Fibonacci patterns in 3D.",
    ]);
    expect(txt).toContain("## This demo");
    expect(txt).toContain(`- [Run it](${site.canonical}): the live demo`);
    expect(txt).toContain(`- [Source](${site.sourceUrl})`);
    expect(txt).toContain(`- [README](${site.readmeUrl})`);
    expect(txt).toContain(`- [All demos](${DEMOS_URL}/)`);
    expect(txt).toContain(`- [Growther.si](${SITE_URL}/)`);
    expect(txt).toContain(`- [Growther.si for LLMs](${SITE_URL}/llms.txt)`);
    expect(txt).toContain(`- [Docs](${DOCS_URL}/)`);
    expect(txt).toContain(
      `- [Full text](${site.origin}/llms-full.txt): this file plus the README`,
    );
    expect(txt).toContain(`${REPO_URL}/blob/main/NOTICE`);
    expect(txt).not.toContain("## Demos");
  });

  it("describes the listing: every demo, the repository, each demo's full text", () => {
    const txt = renderLlmsTxt(listing);
    expect(txt).toMatch(/^# OpenSource Demos\n\n> Every demo\.\n/);
    expect(txt).toContain(
      "## Demos\n\n- [Fibonacci Visualizer](https://fibonacci-vis.demos.growther.si/): 3D.\n- [Other <demo>](https://other.demos.growther.si/): Another.\n",
    );
    expect(txt).toContain(`- [Source](${REPO_URL}): the repository`);
    expect(txt).toContain(`- [README](${REPO_URL}/blob/main/README.md)`);
    expect(txt).toContain(
      "- [Full text](https://demos.growther.si/llms-full.txt): this file plus the repository README",
    );
    expect(txt).toContain(
      "- [Other <demo> in full](https://other.demos.growther.si/llms-full.txt)",
    );
    // The listing is "All demos"; it does not list itself under Growther.si too.
    expect(txt.match(/\[All demos\]/g)).toHaveLength(1);
    expect(txt).not.toContain("## This demo");
  });
});

describe("renderLlmsFullTxt", () => {
  it("appends the README under a rule", () => {
    expect(renderLlmsFullTxt("# A\n", "\n# README\n\nBody.\n\n")).toBe(
      "# A\n\n---\n\n# README\n\nBody.\n",
    );
  });
});

describe("jsonLd", () => {
  it("wraps the graph and escapes < so no value can close the script", () => {
    const out = jsonLd([{ "@type": "Thing", name: "</script>" }]);
    expect(JSON.parse(out)).toEqual({
      "@context": "https://schema.org",
      "@graph": [{ "@type": "Thing", name: "</script>" }],
    });
    expect(out).not.toContain("<");
  });
});

describe("jsonLdGraph", () => {
  const byType = (graph, type) => graph.find((n) => n["@type"] === type);

  it("gives a demo a free WebApplication, its source, the site and the breadcrumb", () => {
    const graph = jsonLdGraph({
      ...site,
      app: { applicationCategory: "EducationalApplication" },
    });
    expect(graph.map((n) => n["@type"])).toEqual([
      "Organization",
      "WebSite",
      "WebApplication",
      "SoftwareSourceCode",
      "BreadcrumbList",
    ]);
    const org = byType(graph, "Organization");
    expect(org).toMatchObject({
      "@id": `${SITE_URL}/#organization`,
      name: "Growther.si",
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/logo.png`,
      sameAs: ["https://github.com/GrowtherSI", "https://x.com/GrowtherAI"],
    });
    expect(byType(graph, "WebSite")).toMatchObject({
      "@id": `${DEMOS_URL}/#website`,
      name: "Growther.si demos",
      url: `${DEMOS_URL}/`,
      publisher: { "@id": org["@id"] },
    });
    expect(byType(graph, "WebApplication")).toEqual({
      "@type": "WebApplication",
      "@id": site.canonical,
      url: site.canonical,
      name: "Fibonacci Visualizer",
      description: "Fibonacci patterns in 3D.",
      operatingSystem: "Any",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      license: "https://opensource.org/license/mit",
      author: { "@id": org["@id"] },
      publisher: { "@id": org["@id"] },
      isPartOf: { "@id": `${DEMOS_URL}/#website` },
      applicationCategory: "EducationalApplication",
    });
    expect(byType(graph, "SoftwareSourceCode")).toMatchObject({
      "@id": site.sourceUrl,
      codeRepository: site.sourceUrl,
      programmingLanguage: "JavaScript",
      license: "https://opensource.org/license/mit",
      targetProduct: { "@id": site.canonical },
    });
    expect(byType(graph, "BreadcrumbList").itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Growther.si",
        item: `${SITE_URL}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Demos",
        item: `${DEMOS_URL}/`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Fibonacci Visualizer",
        item: site.canonical,
      },
    ]);
  });

  it("adds nothing to the WebApplication when the demo states no extra facts", () => {
    const app = byType(jsonLdGraph(site), "WebApplication");
    expect(app).not.toHaveProperty("applicationCategory");
    expect(Object.keys(app)).toHaveLength(12);
  });

  it("gives the listing a CollectionPage whose ItemList is every demo, in order", () => {
    const graph = jsonLdGraph(listing);
    expect(graph.map((n) => n["@type"])).toEqual([
      "Organization",
      "WebSite",
      "CollectionPage",
      "BreadcrumbList",
    ]);
    expect(byType(graph, "CollectionPage")).toEqual({
      "@type": "CollectionPage",
      "@id": listing.canonical,
      url: listing.canonical,
      name: "OpenSource Demos",
      description: "Every demo.",
      isPartOf: { "@id": `${DEMOS_URL}/#website` },
      mainEntity: {
        "@type": "ItemList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Fibonacci Visualizer",
            url: "https://fibonacci-vis.demos.growther.si/",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Other <demo>",
            url: "https://other.demos.growther.si/",
          },
        ],
      },
    });
    expect(byType(graph, "BreadcrumbList").itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Growther.si",
        item: `${SITE_URL}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Demos",
        item: listing.canonical,
      },
    ]);
  });
});
