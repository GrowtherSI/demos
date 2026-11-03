/**
 * The header and footer every Growther.si demo shares.
 *
 * Header: linked brand left, the demo's title centred; right, "How it was made"
 * (AboutModal.tsx), Source and Download.
 * Footer: the growther.si footer (growther-marketing/src/components/chrome.tsx)
 * — same links, socials, mark, rotating tagline and legal line — made sticky.
 *
 * Every target lives on another origin, so every nav item is a real <a href>.
 * growther.si opens its sections as hash-routed modals (#modal=<section>), the
 * same addressing docs.growther.si uses for its own footer.
 *
 * The Download button is the docs site's pattern: an <a> to growther.si for
 * anyone without JS, and with JS a call into the shared download kit, which
 * matches the visitor's OS against the published release and either starts it
 * or opens the newsletter modal — the same behaviour as every Download button on
 * growther.si and docs.growther.si.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { requestDownload, SocialLinks } from "../downloadKit";
import { AboutButton, type DemoAbout } from "./AboutModal";
import logoUrl from "./assets/logo.png";

export const SITE_URL = "https://growther.si";
export const DOCS_URL = "https://docs.growther.si";
const modalUrl = (section: string) => `${SITE_URL}/#modal=${section}`;

/**
 * Publish an element's rendered height as a custom property on <html>, so the
 * demo can lay itself out between the fixed header and footer. Kept current
 * as the footer wraps on resize or expands on a phone.
 */
function useHeightVar<T extends HTMLElement>(prop: string) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const set = () =>
      root.style.setProperty(prop, `${el.getBoundingClientRect().height}px`);
    const ro = new ResizeObserver(set);
    ro.observe(el);
    set();
    return () => ro.disconnect();
  }, [prop]);
  return ref;
}

export interface DemoHeaderProps {
  /** Centred in the header and used as the page's <h1>. */
  title: string;
  /** Analytics/source label passed to the download kit, e.g. "demo-fibonacci-vis". */
  story: string;
  /** Where this demo's source lives; omit to hide the Source pill. */
  sourceUrl?: string;
  /** How C5 built this demo; omit to hide the info button. */
  about?: DemoAbout;
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

/** Lucide "download" (ISC License, https://lucide.dev). */
function DownloadIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15V3" />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}

export function DemoHeader({
  title,
  story,
  sourceUrl,
  about,
}: DemoHeaderProps) {
  const ref = useHeightVar<HTMLElement>("--gw-header-h");
  return (
    <header ref={ref} className="gw-header">
      <a className="gw-brand" href={SITE_URL} aria-label="Growther.si home">
        <img src={logoUrl} alt="" width={26} height={26} />
        <span className="gw-wordmark" aria-hidden="true">
          Growther<span className="gw-wordmark-accent">.si</span>
        </span>
      </a>
      <h1 className="gw-title">{title}</h1>
      <div className="gw-actions">
        {about && <AboutButton about={about} story={story} />}
        {sourceUrl && (
          <a
            className="gw-pill gw-source"
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Source code on GitHub (opens in a new tab)"
          >
            <GitHubIcon />
            <span className="gw-source-label">Source</span>
          </a>
        )}
        <a
          className="gw-cta"
          href={SITE_URL}
          aria-label="Download C5"
          onClick={(e) => {
            e.preventDefault();
            void requestDownload({ story });
          }}
        >
          <span className="gw-cta-long">Download C5</span>
          <span className="gw-cta-short">
            <DownloadIcon />
          </span>
        </a>
      </div>
    </header>
  );
}

/** Footer tagline pool — growther.si's own, "actually productive" always italic. */
const FOOT_TAGS: { pre: string; em: string; post: string }[] = [
  {
    pre: "You're busy, too busy… achieve more over-the-loop.",
    em: "",
    post: "",
  },
  { pre: "Local Inference 🔥 Over 9000", em: "", post: "" },
  { pre: "Delegate compute and go touch 🧘 grass", em: "", post: "" },
  { pre: "Imagine your LLM agent ", em: "actually productive", post: "" },
];

const FOOT_LINKS: [string, string][] = [
  ["samples", "Samples"],
  ["platform", "Platform"],
  ["agents", "Agents"],
  ["enterprise", "Enterprise"],
  ["mothership", "Mothership"],
  ["pricing", "Pricing"],
  ["about", "About"],
  ["blog", "Blog"],
  ["help", "Help & Feedback"],
  ["terms", "Terms"],
  ["privacy", "Privacy"],
  ["dpa", "DPA"],
];

export function DemoFooter() {
  const [tag] = useState(
    () => FOOT_TAGS[Math.floor(Math.random() * FOOT_TAGS.length)]!,
  );
  // Only consulted under 640px, where the footer collapses (see chrome.css).
  const [open, setOpen] = useState(false);
  const ref = useHeightVar<HTMLElement>("--gw-footer-h");
  return (
    <footer ref={ref} className={`gw-footer${open ? " is-open" : ""}`}>
      <nav
        id="gw-footer-more"
        className="gw-footer-links gw-footer-more"
        aria-label="Growther.si"
      >
        <a href={DOCS_URL}>Docs</a>
        {FOOT_LINKS.map(([id, label]) => (
          <a key={id} href={modalUrl(id)}>
            {label}
          </a>
        ))}
      </nav>
      <span className="gw-footer-more">
        <SocialLinks variant="bare" />
      </span>
      <img
        className="gw-footer-mark gw-footer-more"
        src={logoUrl}
        alt=""
        width={22}
        height={22}
      />
      <span className="gw-tagline gw-footer-more">
        “{tag.pre}
        <i>{tag.em}</i>
        {tag.post}”
      </span>
      <button
        type="button"
        className="gw-footer-toggle"
        aria-expanded={open}
        aria-controls="gw-footer-more"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Less ▾" : "More ▴"}
      </button>
      {/* Trademark attribution, as on growther.si: naming third-party products
          must not read as affiliation or endorsement. */}
      <p className="gw-legal">
        &copy; {new Date().getFullYear()} Growther.si.
        <span className="gw-legal-more">
          {" "}
          <a href={`${SITE_URL}/patent`}>
            U.S. Patent Application No. 64/130,388
          </a>
          {". "}
          All product names, logos and brands are the property of their
          respective owners. Use of these names does not imply affiliation or
          endorsement.
        </span>
      </p>
    </footer>
  );
}
