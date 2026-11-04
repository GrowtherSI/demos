/**
 * ── SHARED DOWNLOAD KIT ── v1.10.5 ────────────────────────────────────────────
 * CANONICAL: growther-marketing/shared/downloadKit/   (edit here)
 * MIRROR:    growther-docs/shared/downloadKit/        (never edit — generated)
 * PAIRED: these two directories are ONE component with two deployments and are
 *         byte-identical; changing one without the other is a bug. Version and
 *         changelog live in ./VERSION.ts — bump it. Rules: ./README.md.
 * SYNC:  npm run sync:download-kit     (growther-marketing)
 * CHECK: npm run check:download-kit    (either repo; runs in lint + CI)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Where Growther.si is, off Growther.si — the one list, and the one component
 * that renders it.
 *
 * It lives in the kit because FOUR surfaces across TWO repositories show these
 * links: the newsletter modal (both sites), the footer (both sites, which are
 * meant to be the same footer), and the marketing About tab. A handle that
 * changes — or a network that gets added — must not need four edits in two
 * repos, three of which someone will forget.
 *
 * One geometry, scaled. `scale` multiplies every dimension, so the About tab's
 * 4× buttons are literally the modal's button at four times the size rather
 * than a second set of styles that drifts from the first.
 */
import type { CSSProperties } from "react";

export type SocialKey = "x" | "instagram" | "youtube" | "linkedin" | "github";

export interface Social {
  key: SocialKey;
  /** The network, as a person says it. */
  name: string;
  /** The account, for labels that show one. */
  handle: string;
  href: string;
}

/**
 * Order is deliberate: 𝕏 first because it is where releases are announced
 * first, then the two most visual, then the professional one, then the
 * open code repository.
 */
export const SOCIALS: readonly Social[] = [
  {
    key: "x",
    name: "𝕏",
    handle: "@GrowtherAI",
    href: "https://x.com/GrowtherAI",
  },
  {
    key: "instagram",
    name: "Instagram",
    handle: "@GrowtherSI",
    href: "https://www.instagram.com/GrowtherSI/",
  },
  {
    key: "youtube",
    name: "YouTube",
    handle: "@GrowtherSI",
    href: "https://www.youtube.com/@GrowtherSI",
  },
  {
    key: "linkedin",
    name: "LinkedIn",
    handle: "GrowtherSI",
    href: "https://www.linkedin.com/company/GrowtherSI",
  },
  {
    key: "github",
    name: "GitHub",
    handle: "GrowtherSI",
    href: "https://github.com/GrowtherSI/release",
  },
];

/** Kept for the one place that linked to 𝕏 before the others existed. */
export const X_URL = SOCIALS[0]!.href;

/**
 * The marks, drawn rather than imported: five inline SVGs cost nothing, load
 * with the page, and need no icon dependency in either repo. `currentColor`
 * throughout, so each surface's own ink applies.
 */
function Icon({
  social,
  size,
  fluid,
}: {
  social: SocialKey;
  size: number;
  /** CSS width that caps `size` against the viewport on narrow screens. */
  fluid: string;
}) {
  const common = {
    // The attribute is the nominal size; the CSS width is what actually
    // applies, and it shrinks the mark when the viewport cannot afford it.
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
    focusable: "false" as const,
    style: { display: "block", flex: "none", width: fluid, height: fluid },
  };
  switch (social) {
    case "x":
      return (
        <svg {...common} fill="currentColor">
          <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.22-6.82-5.96 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z" />
        </svg>
      );
    case "instagram":
      return (
        <svg
          {...common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="5.25" />
          <circle cx="12" cy="12" r="4.25" />
          <circle
            cx="17.4"
            cy="6.6"
            r="1.15"
            fill="currentColor"
            stroke="none"
          />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common} fill="currentColor">
          <path d="M23.5 6.9a3.02 3.02 0 0 0-2.12-2.14C19.5 4.25 12 4.25 12 4.25s-7.5 0-9.38.51A3.02 3.02 0 0 0 .5 6.9C0 8.79 0 12 0 12s0 3.21.5 5.1a3.02 3.02 0 0 0 2.12 2.14c1.88.51 9.38.51 9.38.51s7.5 0 9.38-.51a3.02 3.02 0 0 0 2.12-2.14C24 15.21 24 12 24 12s0-3.21-.5-5.1ZM9.6 15.57V8.43L15.82 12 9.6 15.57Z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...common} fill="currentColor">
          <path d="M20.45 2H3.55A1.53 1.53 0 0 0 2 3.51v16.98A1.53 1.53 0 0 0 3.55 22h16.9A1.53 1.53 0 0 0 22 20.49V3.51A1.53 1.53 0 0 0 20.45 2ZM8.02 18.34H5.08V9.5h2.94v8.84ZM6.55 8.29a1.7 1.7 0 1 1 0-3.41 1.7 1.7 0 0 1 0 3.41Zm12.4 10.05h-2.94v-4.3c0-1.03-.02-2.35-1.43-2.35-1.44 0-1.66 1.12-1.66 2.28v4.37H9.98V9.5h2.82v1.21h.04a3.1 3.1 0 0 1 2.78-1.53c2.98 0 3.53 1.96 3.53 4.5v4.66Z" />
        </svg>
      );
    case "github":
      return (
        <svg {...common} viewBox="1 1 22 22" fill="currentColor">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"
          />
        </svg>
      );
  }
}

export interface SocialLinksProps {
  /**
   * Multiplies every dimension. 1 = the newsletter modal's chip; the About
   * tab asks for 4.
   */
  scale?: number;
  /** "chip" = bordered button (modal, About). "bare" = icon only (footer). */
  variant?: "chip" | "bare";
  /**
   * "row" wraps at whatever width the buttons happen to be — right for a
   * footer or a modal line, wrong for a block of large buttons: the labels are
   * not the same length, so the LABEL ends up deciding the layout. At scale 4
   * that produced 491px chips in a 975px container, where two need 1000px and
   * only the shortest handle ever shared a row.
   *
   * "grid" lays them in equal columns instead, as many as fit, so a block is a
   * block at any width — two-up on a modal, one-up on a phone — and the buttons
   * are the same size as each other regardless of handle length.
   */
  layout?: "row" | "grid";
  /** Show the handle beside the mark. Off where space is tight. */
  labels?: boolean;
  /** Extra style for the row itself (margins, justification). */
  style?: CSSProperties;
  /** Analytics/host hook — fires with the network key on click. */
  onSelect?: (key: SocialKey) => void;
}

const SG = "'Space Grotesk',sans-serif";

/**
 * The row. Every link opens in a new tab with `rel="noopener noreferrer"` —
 * these leave our origin, and `target="_blank"` without `noopener` hands the
 * destination a handle on our window.
 */
export function SocialLinks({
  scale = 1,
  variant = "chip",
  labels = false,
  layout = "row",
  style,
  onSelect,
}: SocialLinksProps) {
  const icon = Math.round(13 * scale);
  const chip = variant === "chip";
  const gap =
    (style?.gap as number | undefined) ?? Math.round((chip ? 8 : 4) * scale);
  /**
   * Every dimension capped against the viewport.
   *
   * A 4× button is ~480px of icon, gap, handle and padding. On a phone the grid
   * gives it a ~315px column, and fixed pixels simply overflowed it — the block
   * scrolled sideways. `min(px, vw)` picks the fixed size everywhere there is
   * room and scales the whole button down where there isn't, with no media
   * query, which an inline style cannot carry. At scale 1 the px value always
   * wins, so the modal and footer rows are untouched.
   */
  const fluid = (n: number, vw: number) =>
    `min(${Math.round(n * scale)}px, ${vw}vw)`;
  const iconCss = fluid(13, 9);
  // Widest a button gets is roughly icon + gap + a handle + padding; 95 per
  // unit of scale sits just under that, so `auto-fit` packs two into a modal
  // and one into a phone without a media query an inline style cannot carry.
  const column = `minmax(min(100%, ${Math.round(95 * scale)}px), 1fr)`;
  const isOdd = SOCIALS.length % 2 === 1;
  const twoColThreshold = Math.round(95 * scale) * 2 + gap;
  const lastKey = SOCIALS[SOCIALS.length - 1]?.key;

  return (
    <span
      data-testid="social-links"
      style={{
        ...(layout === "grid"
          ? {
              display: "grid",
              gridTemplateColumns: `repeat(auto-fit, ${column})`,
              alignItems: "stretch",
              containerType: "inline-size",
            }
          : { display: "inline-flex", alignItems: "center", flexWrap: "wrap" }),
        gap,
        ...style,
      }}
    >
      {layout === "grid" && isOdd && lastKey && (
        <style>{`
          @container (min-width: ${twoColThreshold}px) {
            [data-testid="social-${lastKey}"] {
              grid-column: 1 / -1;
              justify-self: center;
              width: calc((100% - ${gap}px) / 2);
            }
          }
        `}</style>
      )}
      {SOCIALS.map((s) => (
        <a
          key={s.key}
          href={s.href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`social-${s.key}`}
          aria-label={`Growther.si on ${s.name}`}
          title={`Growther.si on ${s.name}`}
          onClick={() => onSelect?.(s.key)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: fluid(7, 3),
            fontFamily: SG,
            fontWeight: 600,
            fontSize: fluid(12, 8),
            color: chip ? "var(--ink)" : "inherit",
            textDecoration: "none",
            // Grid items are min-content wide by default, which is what let a
            // 4× button push past its column instead of shrinking into it.
            minWidth: 0,
            ...(chip
              ? {
                  border: `${Math.max(1, Math.round(scale))}px solid var(--line)`,
                  borderRadius: Math.round(8 * scale),
                  padding: `${fluid(7, 2.5)} ${fluid(12, 4)}`,
                  background: "var(--bg)",
                }
              : { padding: Math.round(3 * scale) }),
          }}
        >
          <Icon social={s.key} size={icon} fluid={iconCss} />
          {labels && <span>{s.handle}</span>}
        </a>
      ))}
    </span>
  );
}
