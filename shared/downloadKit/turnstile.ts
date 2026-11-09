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
 * Cloudflare Turnstile loader. The site key is public. It arrives one of two
 * ways, in priority order:
 *   1. Build-time: VITE_TURNSTILE_SITEKEY baked into the bundle.
 *   2. Runtime: the Worker injects <meta name="turnstile-sitekey"> into the
 *      served HTML from its own env (wrangler secret/var) — rotate the key
 *      without a rebuild. Both Workers do this.
 * When neither is set, {@link hasTurnstile} is false and forms fall back to a
 * dev token — the marketing Worker then fails the bot-check closed rather than
 * accepting spam, which is the intended unconfigured-preview behavior.
 *
 * Lives in the kit because the newsletter modal needs a human check on BOTH
 * properties; growther.si's contact + newsletter forms re-export it from
 * src/lib/turnstile.ts so there is still only one copy of this logic.
 */
function readSitekey(): string {
  const built =
    (import.meta.env?.VITE_TURNSTILE_SITEKEY as string | undefined) ?? "";
  if (built) return built;
  if (typeof document === "undefined") return "";
  return (
    document
      .querySelector('meta[name="turnstile-sitekey"]')
      ?.getAttribute("content") ?? ""
  );
}
const SITEKEY: string = readSitekey();

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function hasTurnstile(): boolean {
  return SITEKEY.length > 0;
}

interface TurnstileApi {
  render(
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      theme?: "auto" | "light" | "dark";
    },
  ): string;
  reset(id?: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile script failed to load"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Render a Turnstile widget into `el`, resolving each solved token via onToken.
 * Returns a cleanup function. No-ops (and never rejects) when no site key is
 * configured — the caller then submits with a dev token and expects a 503.
 */
export async function renderTurnstile(
  el: HTMLElement,
  onToken: (token: string) => void,
): Promise<() => void> {
  if (!SITEKEY) return () => {};
  await loadScript();
  const id = window.turnstile!.render(el, {
    sitekey: SITEKEY,
    callback: onToken,
    "expired-callback": () => onToken(""),
    theme: "auto",
  });
  return () => {
    try {
      window.turnstile?.reset(id);
    } catch {
      /* ignore */
    }
  };
}

/** Token used when Turnstile is not configured (preview) — the Worker 503s it. */
export const DEV_TOKEN = "dev-no-turnstile";

/** The kit's NewsletterAdapter shape for this loader, ready to spread. */
export const turnstileAdapter = {
  get enabled() {
    return hasTurnstile();
  },
  render: renderTurnstile,
  devToken: DEV_TOKEN,
};
