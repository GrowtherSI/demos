/**
 * demos.json is the listing's only source of truth, so check it against the
 * repository: every entry is a real demo with its preview, and every demo in
 * the repository is listed.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderCards } from "../demoCards.js";

const HOME = fileURLToPath(new URL("..", import.meta.url));
const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const demos = JSON.parse(readFileSync(`${HOME}/demos.json`, "utf8"));

/** Top-level directories that deploy with their own wrangler.jsonc are demos. */
const demoDirs = readdirSync(REPO, { withFileTypes: true })
  .filter(
    (d) => d.isDirectory() && existsSync(`${REPO}/${d.name}/wrangler.jsonc`),
  )
  .map((d) => d.name)
  .sort();

describe("demos.json", () => {
  it("lists every demo in the repository, once each", () => {
    const slugs = demos.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect([...slugs].sort()).toEqual(demoDirs);
  });

  it.each(demos)(
    "$slug has a title, a concise description and a preview",
    (d) => {
      expect(d.title.trim()).not.toBe("");
      expect(d.description.length).toBeGreaterThan(20);
      // At most ~4 lines on a 240px card.
      expect(d.description.length).toBeLessThanOrEqual(110);
      expect(d.preview).toMatch(/^previews\/[\w-]+\.(webp|png|jpg|avif)$/);
      expect(existsSync(`${HOME}/${d.preview}`)).toBe(true);
    },
  );

  it.each(demos)("$slug links to the subdomain its Worker deploys to", (d) => {
    const wrangler = readFileSync(`${REPO}/${d.slug}/wrangler.jsonc`, "utf8");
    expect(wrangler).toContain(`"pattern": "${d.slug}.demos.growther.si"`);
  });
});

describe("renderCards", () => {
  it("escapes manifest text into the HTML", () => {
    const html = renderCards([
      {
        slug: "x",
        title: "<b>&",
        description: '"quoted"',
        preview: "previews/x.webp",
      },
    ]);
    expect(html).toContain("&#60;b&#62;&#38;");
    expect(html).toContain("&#34;quoted&#34;");
    expect(html).toContain('href="https://x.demos.growther.si/"');
  });
});

describe("renderCards layout", () => {
  const demo = (slug) => ({
    slug,
    title: slug,
    description: `${slug} description`,
    preview: `previews/${slug}.webp`,
  });

  it("renders one card per demo, linking live demo and source", () => {
    const html = renderCards([demo("a"), demo("b")]);
    expect(html.match(/<li class="demo">/g)).toHaveLength(2);
    expect(html).toContain('src="/previews/a.webp"');
    expect(html).toContain(
      'href="https://github.com/GrowtherSI/demos/tree/main/b"',
    );
    expect(html).toContain(
      'aria-label="b source on GitHub (opens in a new tab)"',
    );
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("loads the first four previews eagerly and lazy-loads the rest", () => {
    const html = renderCards(["a", "b", "c", "d", "e", "f"].map(demo));
    const imgs = html.match(/<img [^>]*>/g);
    expect(imgs.map((img) => img.includes('loading="lazy"'))).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  it("renders nothing for an empty listing", () => {
    expect(renderCards([])).toBe("");
  });
});
