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
 * What a Download button opens when there is nothing to download.
 *
 * A dead button is the worst outcome of a missing release: the visitor came to
 * get C5, and the site's answer is silence (or, before this, a GitHub folder
 * listing with no files in it). This turns the miss into the one thing worth
 * having from someone who just tried to download your product — a way to tell
 * them when it exists.
 *
 * Styled as an exact sibling of ContactModal (blur scrim, z-90, 18px raised
 * card, glow brand button, amber mono error line) so it reads as part of the
 * site on both properties.
 *
 * The newsletter POST is INJECTED rather than imported: on growther.si it is
 * the same-origin /v1/newsletter the footer form uses; on docs.growther.si it
 * is a cross-origin call to growther.si. With no adapter at all the modal still
 * does its job — it links to the site's signup and to 𝕏.
 */
import { useEffect, useRef, useState } from "react";
import { OS_LABEL, type ReleaseBuild, type UnavailableReason } from "./release";
import { SocialLinks } from "./Socials";

const MONO = "'IBM Plex Mono',monospace";
const SG = "'Space Grotesk',sans-serif";

/** Re-exported from ./Socials, which is now the one list of where we are. */
export { X_URL, SOCIALS } from "./Socials";

/** Everything the modal needs to really subscribe someone. */
export interface NewsletterAdapter {
  /** Throws on failure; an `err.status` of 503 means "not configured here". */
  subscribe(email: string, turnstileToken: string): Promise<void>;
  turnstile: {
    /** False in preview/unconfigured builds — the form then submits devToken. */
    enabled: boolean;
    render(
      el: HTMLElement,
      onToken: (token: string) => void,
    ): Promise<() => void>;
    devToken: string;
  };
}

export interface DownloadModalProps {
  reason: UnavailableReason;
  /** "macOS" | "Windows" | "Linux" | null — what we think they're running. */
  platformLabel: string | null;
  /** The catalog, when there is one: lets the copy name what DOES exist. */
  build?: ReleaseBuild | null;
  onClose: () => void;
  /** Absent ⇒ the form is replaced by a link to the site's own signup. */
  newsletter?: NewsletterAdapter;
  /** Where that link points (marketing home). */
  siteUrl?: string;
  /** Site logo; omitted on properties that don't serve one. */
  logoSrc?: string;
  /** Fired once when a subscribe succeeds, for the host's analytics. */
  onSubscribed?: () => void;
}

interface Copy {
  kicker: string;
  title: string;
  body: string;
}

function copyFor(
  reason: UnavailableReason,
  platformLabel: string | null,
  build?: ReleaseBuild | null,
): Copy {
  const os = platformLabel ?? "your computer";
  if (reason === "unsupported-platform") {
    return {
      kicker: "DESKTOP APP",
      title: "C5 runs on your desktop",
      // Saying "not supported" would be wrong — the fleet just isn't driven
      // from a phone. Name the machines it does run on so the visit isn't wasted.
      body: "C5 is a desktop application for macOS, Windows and Linux — there's nothing to install on this device. Leave your email and we'll send the download link for the next release; open it from your laptop and you're two minutes from a running fleet.",
    };
  }
  if (reason === "no-build") {
    const others = build
      ? [...new Set(build.assets.map((a) => OS_LABEL[a.os]))]
          .filter((l) => l !== platformLabel)
          .join(" and ")
      : "";
    return {
      kicker: "NOT THIS PLATFORM — YET",
      title: `No ${os} build yet`,
      body: others
        ? `C5 v${build!.version} ships for ${others} today; the ${os} build is on its way. Leave your email and you'll hear the day it lands — that's the only reason we'd write.`
        : `The current release has no ${os} build yet. Leave your email and you'll hear the day it lands — that's the only reason we'd write.`,
    };
  }
  return {
    kicker: "NOT PUBLIC YET",
    title: "C5 hasn't shipped yet",
    // Honest about the state without sounding abandoned: the pipeline is real,
    // the binaries exist, distribution is what's held back.
    body: "The first public build is still in the hangar. Leave your email and you'll hear the moment it's out — launch notes, and nothing else.",
  };
}

const FIELD: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--bg)",
  border: "1px solid var(--line)",
  borderRadius: 9,
  padding: "11px 13px",
  font: "400 13px system-ui",
  color: "var(--ink)",
  outline: "none",
};

export function DownloadModal({
  reason,
  platformLabel,
  build,
  onClose,
  newsletter,
  siteUrl = "https://growther.si",
  logoSrc,
  onSubscribed,
}: DownloadModalProps) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const [token, setToken] = useState(
    newsletter && newsletter.turnstile.enabled
      ? ""
      : (newsletter?.turnstile.devToken ?? ""),
  );
  const [sentTo, setSentTo] = useState("");
  const turnstileRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const copy = copyFor(reason, platformLabel, build);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  // Escape closes: this opens on a click the visitor expected to start a
  // download, so getting out of it must be effortless.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const el = turnstileRef.current;
    if (!el || !newsletter?.turnstile.enabled) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    void newsletter.turnstile.render(el, setToken).then((c) => {
      cleanup = c;
      // render() is async and can resolve after teardown; without this the
      // widget leaks into a detached node and the next token comes back stale.
      if (cancelled) c();
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [newsletter]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletter) return;
    const address = email.trim();
    if (!/.+@.+\..+/.test(address)) {
      setState("error");
      setError("please enter a valid email");
      return;
    }
    if (newsletter.turnstile.enabled && !token) {
      setState("error");
      setError("please complete the human check");
      return;
    }
    setState("sending");
    setError("");
    try {
      await newsletter.subscribe(
        address,
        token || newsletter.turnstile.devToken,
      );
      setSentTo(address);
      setState("done");
      onSubscribed?.();
    } catch (err) {
      setState("error");
      const status = (err as { status?: number } | null)?.status;
      setError(
        status === 503
          ? "the newsletter is being configured — try again soon"
          : status === 429
            ? "too many tries just now — give it a minute"
            : "could not sign you up — try again",
      );
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "4vh 4vw",
      }}
    >
      <div
        onClick={onClose}
        data-testid="download-modal-scrim"
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(4,6,10,.45)",
          backdropFilter: "blur(9px)",
          animation: "fadein .25s ease",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="C5 download"
        data-testid="download-modal"
        style={{
          position: "relative",
          width: "min(460px,94vw)",
          maxHeight: "86vh",
          overflowY: "auto",
          background: "var(--bg-raised)",
          border: "1px solid var(--line)",
          borderRadius: 18,
          padding: "24px 26px",
          boxShadow: "var(--glow),0 30px 90px rgba(0,0,0,.5)",
          animation: "fadein .3s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            marginBottom: 6,
          }}
        >
          {logoSrc && (
            <img
              src={logoSrc}
              alt="Growther.si logo"
              style={{ width: 26, height: 26, marginTop: 2 }}
            />
          )}
          <div style={{ flex: 1 }}>
            <div
              style={{
                font: `500 9.5px ${MONO}`,
                letterSpacing: ".18em",
                color: "var(--accent)",
                marginBottom: 4,
              }}
            >
              {state === "done" ? "ALMOST THERE" : copy.kicker}
            </div>
            <div style={{ font: `700 18px ${SG}`, color: "var(--ink)" }}>
              {state === "done" ? "Check your inbox" : copy.title}
            </div>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: "none",
              color: "var(--ink)",
              fontSize: 14,
              cursor: "pointer",
              flex: "none",
            }}
          >
            ✕
          </button>
        </div>

        <p
          style={{
            font: "400 12.5px/1.6 system-ui",
            color: "var(--ink-soft)",
            margin: "8px 0 16px",
          }}
        >
          {state === "done" ? (
            <>
              {/* NOT "you're subscribed": the address is stored PENDING and a
                  confirmation link is mailed. Telling someone they're done is
                  the one message that guarantees the link never gets clicked. */}
              We&rsquo;ve sent a confirmation link to{" "}
              <span style={{ color: "var(--ink)" }}>{sentTo}</span>.
              You&rsquo;re on the list for launch notes once you click it.
            </>
          ) : (
            copy.body
          )}
        </p>

        {state !== "done" &&
          (newsletter ? (
            <form onSubmit={submit} data-testid="download-modal-form">
              <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                <input
                  ref={emailRef}
                  type="email"
                  aria-label="Email"
                  placeholder="you@work.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ ...FIELD, flex: 1, minWidth: 190, width: "auto" }}
                />
                <button
                  type="submit"
                  disabled={state === "sending"}
                  style={{
                    font: `600 13px ${SG}`,
                    color: "var(--brand-ink)",
                    background: "var(--brand)",
                    padding: "11px 20px",
                    border: "none",
                    borderRadius: 9,
                    cursor: state === "sending" ? "default" : "pointer",
                    boxShadow: "var(--glow)",
                    opacity: state === "sending" ? 0.6 : 1,
                  }}
                >
                  {state === "sending" ? "…" : "Notify me"}
                </button>
              </div>
              {newsletter.turnstile.enabled && (
                <div ref={turnstileRef} style={{ marginTop: 11 }} />
              )}
            </form>
          ) : (
            <a
              href={`${siteUrl}/#newsletter`}
              data-testid="download-modal-signup-link"
              style={{
                display: "inline-block",
                font: `600 13px ${SG}`,
                color: "var(--brand-ink)",
                background: "var(--brand)",
                padding: "11px 20px",
                borderRadius: 9,
                textDecoration: "none",
                boxShadow: "var(--glow)",
              }}
            >
              Sign up for launch notes ↗
            </a>
          ))}

        {state === "error" && (
          <div
            style={{
              font: `400 11.5px ${MONO}`,
              color: "#c98a12",
              marginTop: 10,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            marginTop: 18,
            paddingTop: 14,
            borderTop: "1px solid var(--line)",
            font: "400 12px/1.5 system-ui",
            color: "var(--ink-soft)",
            flexWrap: "wrap",
          }}
        >
          <span>Prefer it in your feed?</span>
          {/* Marks only, no handles: four labelled chips do not fit a 460px
              card, and each link carries the network in its aria-label and
              title so nothing is lost to someone who cannot see the icon. */}
          <SocialLinks />
        </div>
      </div>
    </div>
  );
}
