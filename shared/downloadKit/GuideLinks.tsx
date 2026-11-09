/**
 * ── SHARED DOWNLOAD KIT ── v1.11.0 ────────────────────────────────────────────
 * CANONICAL: growther-marketing/shared/downloadKit/   (edit here)
 * MIRROR:    growther-docs/shared/downloadKit/        (never edit — generated)
 * PAIRED: these two directories are ONE component with two deployments and are
 *         byte-identical; changing one without the other is a bug. Version and
 *         changelog live in ./VERSION.ts — bump it. Rules: ./README.md.
 * SYNC:  npm run sync:download-kit     (growther-marketing)
 * CHECK: npm run check:download-kit    (either repo; runs in lint + CI)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The "Guides:" footer row docs.growther.si and demos.growther.si carry — the
 * component half; the list it renders is ./guides.ts (two files because the
 * canonical repo sits on a case-insensitive filesystem, where Guides.tsx and
 * guides.ts would be one name).
 */
import type { CSSProperties } from "react";
import { guideBySlug, guideUrl, type Guide } from "./guides";

/**
 * A footer row of guide links: "Guides: Local AI agent · Private AI agent · …".
 * `pick` chooses and orders the slugs (a footer wants five or six, not all
 * seventeen); an unknown slug is skipped rather than rendered as a dead link.
 * Plain anchors with the page's `text` as the title, so the link is crawlable
 * and the hover says what the reader gets. Colours are inherited: the footer
 * that mounts it owns them.
 */
export function GuideLinks({
  pick,
  heading = "Guides:",
  className,
  style,
  linkStyle,
}: {
  pick: readonly string[];
  heading?: string;
  className?: string;
  style?: CSSProperties;
  linkStyle?: CSSProperties;
}) {
  const guides = pick
    .map((slug) => guideBySlug(slug))
    .filter((g): g is Guide => g !== undefined);
  if (guides.length === 0) return null;
  return (
    <nav
      aria-label="Guides on growther.si"
      className={className}
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        gap: "2px 0",
        font: "400 11.5px system-ui",
        ...style,
      }}
    >
      <span style={{ opacity: 0.7, padding: "2px 7px" }}>{heading}</span>
      {guides.map((g) => (
        <a
          key={g.slug}
          href={guideUrl(g.slug)}
          title={g.text}
          style={{
            color: "inherit",
            padding: "2px 7px",
            textDecoration: "none",
            ...linkStyle,
          }}
        >
          {g.label}
        </a>
      ))}
    </nav>
  );
}
