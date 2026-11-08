/**
 * The crawler-facing surfaces every demo site publishes, as pure functions of
 * what the site already says about itself. Nothing here is hand-maintained:
 * vite.mjs reads each app's index.html (title, description, canonical),
 * package.json (where its source lives) and README.md, and renders
 *
 *  - renderSitemap()      /sitemap.xml   the page(s) on this origin
 *  - renderRobots()       /robots.txt    crawl policy, named AI agents, the
 *                                        sitemap(s), and a pointer to llms.txt
 *  - renderLlmsTxt()      /llms.txt      the llmstxt.org map: what this is,
 *                                        where it runs, where its source is,
 *                                        and how it relates to Growther.si
 *  - renderLlmsFullTxt()  /llms-full.txt llms.txt plus the README, so an AI
 *                                        answer pipeline that fetches once has
 *                                        the whole story
 *  - jsonLdGraph()        the structured data injected into <head>
 *
 * Every demo is its own origin (<slug>.demos.growther.si), so every demo gets
 * its own copy of each file; the listing's sitemap also names every demo, and
 * each demo's robots.txt names the listing's sitemap back, which is how a
 * sitemap earns the right to list URLs on another host.
 *
 * The same renderers serve growther.si (growther-marketing/src-worker/seo.ts);
 * the robots.txt policy below is that file's, verbatim in spirit.
 */

export const SITE_NAME = "Growther.si";
export const SITE_URL = "https://growther.si";
export const DOCS_URL = "https://docs.growther.si";
export const DEMOS_URL = "https://demos.growther.si";
export const REPO_URL = "https://github.com/GrowtherSI/demos";
export const LICENSE_URL = "https://opensource.org/license/mit";

/** How growther.si describes C5 to crawlers — one sentence, kept in step with
 *  growther-marketing's SITE.description. */
export const C5_DESCRIPTION =
  "C5, the local-first SI harness orchestration platform: 200+ trained SI specialists across 17 divisions on your machine, encrypted at rest, working offline.";

/** The one-line footer every demo's llms.txt opens with. */
export const DEMOS_DESCRIPTION =
  "OpenSource web apps built by Growther.si C5, each from a single prompt. Run them live, read the source, copy the project.";

/** The URL a demo deploys to: the same rule as the listing's cards and as
 *  every demo's wrangler.jsonc route. */
export function demoUrl(slug) {
  return `https://${slug}.demos.growther.si/`;
}

export function escapeXml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Undo the escaping index.html needs in attribute values. */
export function decodeEntities(s) {
  return s.replace(/&(#\d+|\w+);/g, (m, e) =>
    e[0] === "#"
      ? String.fromCodePoint(Number(e.slice(1)))
      : (NAMED_ENTITIES[e] ?? m),
  );
}

/** The attributes of every `<tag …>` in the HTML, as objects. */
function tags(html, tag) {
  const re = new RegExp(`<${tag}\\b([^>]*)>`, "g");
  return [...html.matchAll(re)].map((m) =>
    Object.fromEntries(
      [...m[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [
        k,
        decodeEntities(v),
      ]),
    ),
  );
}

/**
 * What a page says about itself: its <title>, meta description, canonical
 * URL, og:title (the short name without the brand suffix) and og:site_name.
 * Throws when title, description or canonical are missing — a demo without
 * them has no business being deployed, and the build is the place to say so.
 */
export function readPageMeta(html) {
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
  const metas = tags(html, "meta");
  const meta = (attr, value) => metas.find((m) => m[attr] === value)?.content;
  const description = meta("name", "description");
  const canonical = tags(html, "link").find((l) => l.rel === "canonical")?.href;
  const missing = [
    !title && "<title>",
    !description && '<meta name="description">',
    !canonical && '<link rel="canonical">',
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`index.html is missing ${missing.join(", ")}`);
  }
  const url = new URL(canonical);
  return {
    title: decodeEntities(title),
    name: meta("property", "og:title") ?? decodeEntities(title),
    description,
    canonical: url.href,
    origin: url.origin,
    siteName: meta("property", "og:site_name") ?? `${SITE_NAME} demos`,
  };
}

// ── sitemap.xml ──────────────────────────────────────────────────────────────

/** Absolute URLs only. No <lastmod>: a single-page app that redeploys on every
 *  push would claim a change on every push, and a lastmod that is not true is
 *  worse than none (Google ignores a sitemap's dates once it catches one). */
export function renderSitemap(urls) {
  const entries = urls.map((u) => `  <url><loc>${escapeXml(u)}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>
`;
}

// ── robots.txt ───────────────────────────────────────────────────────────────

/** The AI agents named explicitly, in two groups: the ones that put a site into
 *  AI answers (search and on-demand fetchers), and the training crawlers. Same
 *  permission as the wildcard, but on the record — any one can be revoked
 *  later without touching the rest. To keep the answer surface but leave the
 *  training corpus, Disallow just the second group. */
export const AI_ANSWER_AGENTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "MistralAI-User",
];
export const AI_TRAINING_AGENTS = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "Applebot-Extended",
  "meta-externalagent",
  "CCBot",
];

/**
 * @param {object} o
 * @param {string} o.origin     this site's origin, e.g. https://x.demos.growther.si
 * @param {string[]} [o.sitemaps] every sitemap that lists this origin's URLs;
 *   defaults to this origin's own. A demo also names the listing's sitemap, so
 *   that sitemap may list the demo (sitemaps.org cross-submission).
 */
export function renderRobots({ origin, sitemaps = [`${origin}/sitemap.xml`] }) {
  const agents = [...AI_ANSWER_AGENTS, ...AI_TRAINING_AGENTS]
    .map((a) => `User-agent: ${a}\nAllow: /`)
    .join("\n\n");
  return `# ${new URL(origin).host} — humans and machines welcome.
# LLM-readable site map: ${origin}/llms.txt
# The same, with the README inline: ${origin}/llms-full.txt
User-agent: *
Allow: /

# Named AI agents, listed explicitly rather than left to the wildcard above:
# the search and on-demand agents that put this site into AI answers first,
# then the training crawlers. Same permission, stated, so any one of them can
# be revoked later without touching the rest.
${agents}

${sitemaps.map((s) => `Sitemap: ${s}`).join("\n")}
`;
}

// ── llms.txt ─────────────────────────────────────────────────────────────────

/**
 * @param {object} o
 * @param {string} o.name          the page's short name (og:title)
 * @param {string} o.description   the meta description
 * @param {string} o.canonical     the page's URL
 * @param {string} o.sourceUrl     where the source lives on GitHub
 * @param {string} o.readmeUrl     the README on GitHub
 * @param {{slug: string, title: string, description: string}[]} [o.demos]
 *   given for the listing: every demo, in listing order
 */
export function renderLlmsTxt({
  name,
  description,
  canonical,
  sourceUrl,
  readmeUrl,
  demos,
}) {
  const origin = new URL(canonical).origin;
  const about = demos
    ? [
        `## Demos`,
        ``,
        ...demos.map(
          (d) => `- [${d.title}](${demoUrl(d.slug)}): ${d.description}`,
        ),
        ``,
        `## This listing`,
        ``,
        `- [All demos](${canonical}): the listing page`,
        `- [Source](${sourceUrl}): the repository — every demo, and the shared header, footer and Worker`,
        `- [README](${readmeUrl}): layout of the repository and how a demo is added`,
      ]
    : [
        `## This demo`,
        ``,
        `- [Run it](${canonical}): the live demo`,
        `- [Source](${sourceUrl}): the code, MIT-licensed`,
        `- [README](${readmeUrl}): what it does, how it is put together, how to run it locally`,
      ];
  const optional = demos
    ? [
        `- [Full text](${origin}/llms-full.txt): this file plus the repository README`,
        ...demos.map(
          (d) =>
            `- [${d.title} in full](${demoUrl(d.slug)}llms-full.txt): that demo's llms.txt plus its README`,
        ),
      ]
    : [`- [Full text](${origin}/llms-full.txt): this file plus the README`];
  return `# ${name}

> ${description}

${
  demos
    ? "Every demo is a self-contained web app on its own subdomain of demos.growther.si, built by Growther.si C5 from a single prompt and published under the MIT License."
    : `An OpenSource demo by ${SITE_NAME}, built by C5 from a single prompt and published under the MIT License: one of the demos at ${DEMOS_URL}/.`
}

${about.join("\n")}

## Growther.si

${demos ? "" : `- [All demos](${DEMOS_URL}/): ${DEMOS_DESCRIPTION}\n`}- [Growther.si](${SITE_URL}/): ${C5_DESCRIPTION}
- [Growther.si for LLMs](${SITE_URL}/llms.txt): the growther.si site map for LLMs
- [Docs](${DOCS_URL}/): the C5 documentation

## Optional

${optional.join("\n")}
- [License](${LICENSE_URL}): MIT. The Growther.si name and logo, and C5 itself, are not covered: ${REPO_URL}/blob/main/NOTICE
`;
}

/** llms.txt, then the README under a rule — one fetch, the whole story. */
export function renderLlmsFullTxt(llmsTxt, readme) {
  return `${llmsTxt}
---

${readme.trim()}
`;
}

// ── JSON-LD ──────────────────────────────────────────────────────────────────

/** Serialize for a <script type="application/ld+json">: `<` escaped so no
 *  value can close the element. */
export function jsonLd(graph) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": graph,
  }).replace(/</g, "\\u003c");
}

const ORG_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${DEMOS_URL}/#website`;

function organization() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/logo.png`,
    sameAs: ["https://github.com/GrowtherSI", "https://x.com/GrowtherAI"],
  };
}

function website(siteName) {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: siteName,
    url: `${DEMOS_URL}/`,
    description: DEMOS_DESCRIPTION,
    publisher: { "@id": ORG_ID },
  };
}

function breadcrumbs(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, item], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item,
    })),
  };
}

/**
 * The structured data for one page. The listing is a CollectionPage whose
 * main entity is the ItemList of demos; a demo is a free WebApplication with
 * its SoftwareSourceCode. Both carry the Organization, the demos WebSite and
 * the breadcrumb the header draws: Growther.si › Demos › this demo.
 *
 * @param {ReturnType<typeof readPageMeta> & {
 *   sourceUrl: string,
 *   demos?: {slug: string, title: string, description: string}[],
 *   app?: Record<string, unknown>,
 * }} o  `app` adds to the WebApplication (applicationCategory,
 *   browserRequirements, …) — the facts only the demo knows.
 */
export function jsonLdGraph({
  name,
  description,
  canonical,
  siteName,
  sourceUrl,
  demos,
  app = {},
}) {
  if (demos) {
    return [
      organization(),
      website(siteName),
      {
        "@type": "CollectionPage",
        "@id": canonical,
        url: canonical,
        name,
        description,
        isPartOf: { "@id": WEBSITE_ID },
        mainEntity: {
          "@type": "ItemList",
          itemListElement: demos.map((d, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: d.title,
            url: demoUrl(d.slug),
          })),
        },
      },
      breadcrumbs([
        [SITE_NAME, `${SITE_URL}/`],
        ["Demos", canonical],
      ]),
    ];
  }
  return [
    organization(),
    website(siteName),
    {
      "@type": "WebApplication",
      "@id": canonical,
      url: canonical,
      name,
      description,
      operatingSystem: "Any",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      license: LICENSE_URL,
      author: { "@id": ORG_ID },
      publisher: { "@id": ORG_ID },
      isPartOf: { "@id": WEBSITE_ID },
      ...app,
    },
    {
      "@type": "SoftwareSourceCode",
      "@id": sourceUrl,
      name: `${name} source`,
      url: sourceUrl,
      codeRepository: sourceUrl,
      programmingLanguage: "JavaScript",
      license: LICENSE_URL,
      author: { "@id": ORG_ID },
      targetProduct: { "@id": canonical },
    },
    breadcrumbs([
      [SITE_NAME, `${SITE_URL}/`],
      ["Demos", `${DEMOS_URL}/`],
      [name, canonical],
    ]),
  ];
}
