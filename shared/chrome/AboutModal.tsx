/**
 * "How this was made" — the header's info button and the modal it opens.
 *
 * Every demo in this repository was built by Growther.si C5 from a single
 * prompt, so the modal tells that story from numbers the demo supplies
 * (DemoAbout). The copy is shared; only the facts change per demo.
 *
 * The modal is portalled to <body>: the header's backdrop-filter makes it the
 * containing block for fixed-position descendants, so a modal rendered inside
 * it would be clipped to the header bar.
 */
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { requestDownload } from "../downloadKit";
import logoUrl from "./assets/logo.png";

/** The facts behind one demo's build. */
export interface DemoAbout {
  /** The prompt C5 was given, verbatim. */
  prompt: string;
  /** Wall-clock time, start to finish, for "under N hours". */
  hours: number;
  /** Total inference spend in US dollars. */
  costUsd: number;
  /** Agent steps that passed C5's quality gates. */
  passedSteps: number;
  /** Agent steps that failed a gate and were sent back for rework. */
  reworkSteps: number;
  /** Tokens processed, as displayed, e.g. "1.1M". */
  tokens: string;
  /** Where the models ran — shown as chips, cloud first. */
  inference: { where: "Cloud" | "Local"; via: string }[];
  /**
   * The human comparison: how long a skilled developer might take, and at what
   * hourly rate. Both are stated in the copy, so the reader sees the assumption.
   */
  humanHours: number;
  humanRateUsd: number;
}

const usd = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });

/** Lucide "info" (ISC License, https://lucide.dev). */
export function InfoIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

/** The header pill plus the modal it controls. */
export function AboutButton({
  about,
  story,
}: {
  about: DemoAbout;
  story: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="gw-pill gw-about"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="How this demo was made"
        title="How this demo was made"
        onClick={() => setOpen(true)}
      >
        <InfoIcon />
        <span className="gw-about-label">How it was made</span>
      </button>
      {open && (
        <AboutModal
          about={about}
          story={story}
          onClose={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        />
      )}
    </>
  );
}

function portalRoot(): HTMLElement {
  let el = document.getElementById("gw-modal-root");
  if (!el) {
    el = document.createElement("div");
    el.id = "gw-modal-root";
    el.className = "gw-chrome";
    document.body.append(el);
  }
  return el;
}

function AboutModal({
  about,
  story,
  onClose,
}: {
  about: DemoAbout;
  story: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  // Dialog keyboard contract: focus moves in, Escape closes, Tab stays inside.
  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog.current) return;
      const focusable = dialog.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const totalSteps = about.passedSteps + about.reworkSteps;
  const humanCost = about.humanHours * about.humanRateUsd;
  const times = Math.round(humanCost / about.costUsd);
  const c5Share = Math.max(4, (about.costUsd / humanCost) * 100);

  return createPortal(
    <div
      className="gw-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="gw-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button
          ref={closeBtn}
          type="button"
          className="gw-modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>

        <p className="gw-kicker">
          <img src={logoUrl} alt="" width={18} height={18} />
          How this demo was made
        </p>
        <h2 id={titleId} className="gw-modal-title">
          One sentence in. A finished app out.
        </h2>

        <figure className="gw-prompt">
          <figcaption>The entire brief</figcaption>
          <blockquote>“{about.prompt}”</blockquote>
        </figure>

        <p className="gw-lede">
          That’s all <strong>Growther.si C5</strong> was given. Its automated
          harness took it from there — planning, coding, testing and fixing — by
          running a team of AI models that worked on the job together:
        </p>
        <ul className="gw-chips" aria-label="Where the models ran">
          {about.inference.map((m) => (
            <li
              key={`${m.where}-${m.via}`}
              className={`gw-chip gw-chip-${m.where.toLowerCase()}`}
            >
              <span>{m.where}</span>
              {m.via}
            </li>
          ))}
        </ul>
        <p className="gw-note">
          C5 decides which model takes each step — the cloud when a step needs
          it, models on your own machine when they’ll do, where there’s no
          per-token bill at all.
        </p>

        <dl className="gw-stats">
          <div>
            <dt>Built in</dt>
            <dd>&lt; {about.hours} hrs</dd>
          </div>
          <div>
            <dt>Total cost</dt>
            <dd>{usd(about.costUsd)}</dd>
          </div>
          <div>
            <dt>Agent steps</dt>
            <dd>{totalSteps}</dd>
          </div>
          <div>
            <dt>Tokens</dt>
            <dd>{about.tokens}</dd>
          </div>
        </dl>

        <h3 className="gw-h3">Quality control, built in</h3>
        <p>
          Every step had to pass C5’s quality checks before it counted.{" "}
          <strong>{about.passedSteps}</strong> passed. The{" "}
          <strong>{about.reworkSteps}</strong> that fell short were sent back
          and redone automatically — the way a good lead reviews a team’s work
          before it ships.
        </p>

        <h3 className="gw-h3">Could a person do it cheaper?</h3>
        <p>
          Say a skilled developer could build this in {about.humanHours} hours.
          Even at a modest {usd(about.humanRateUsd)} an hour, that’s{" "}
          <strong>{usd(humanCost)}</strong> — about {times}× C5’s bill, and
          their whole afternoon. C5 did it for{" "}
          <strong>{usd(about.costUsd)}</strong>, and the work runs on its own
          while you get on with your day.
        </p>
        <div className="gw-compare" aria-hidden="true">
          <div className="gw-bar-row">
            <span>C5</span>
            <span
              className="gw-bar gw-bar-c5"
              style={{ width: `${c5Share}%` }}
            />
            <b>{usd(about.costUsd)}</b>
          </div>
          <div className="gw-bar-row">
            <span>Developer</span>
            <span className="gw-bar gw-bar-human" style={{ width: "100%" }} />
            <b>{usd(humanCost)}</b>
          </div>
        </div>

        <div className="gw-mothership">
          <h3 className="gw-h3">And it gets better with every run</h3>
          <p>
            C5 works on its own, forever. Add the optional{" "}
            <strong>Mothership</strong> service and every C5 learns from the
            proven wins of every other C5 — so the next build starts smarter.
            Your secrets stay yours, and you approve what comes in.
          </p>
        </div>

        <div className="gw-modal-actions">
          <a
            className="gw-cta"
            href="https://growther.si"
            onClick={(e) => {
              e.preventDefault();
              void requestDownload({ story: `${story}-about` });
            }}
          >
            Download C5
          </a>
          <a className="gw-pill" href="https://growther.si/#modal=mothership">
            Explore Mothership
          </a>
        </div>
      </div>
    </div>,
    portalRoot(),
  );
}
