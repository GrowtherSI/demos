/**
 * ── SHARED DOWNLOAD KIT ── v1.11.0 ─────────────────────────────────
 * CANONICAL: growther-marketing/shared/downloadKit/   (edit here)
 * MIRROR:    growther-docs/shared/downloadKit/        (never edit — generated)
 * PAIRED: these two directories are ONE component with two deployments and are
 *         byte-identical; changing one without the other is a bug. Version and
 *         changelog live in ./VERSION.ts — bump it. Rules: ./README.md.
 * SYNC:  npm run sync:download-kit     (growther-marketing)
 * CHECK: npm run check:download-kit    (either repo; runs in lint + CI)
 * ──────────────────────────────────────────────────────────────────
 *
 * The "now what?" card. Shown by DownloadGate the moment a download is handed
 * to the browser: which file, its SHA-256 (with the sidecar link), and the
 * commands that make a bare binary runnable. Every line has a copy button —
 * the point is to paste, not to read. Rendered by the gate, never mounted by
 * a host directly.
 */
import { useCallback, useState, type CSSProperties } from "react";
import type { DownloadStartedDetail } from "./client";

const mono: CSSProperties = {
  font: "12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace",
  color: "var(--ink)",
  background: "var(--bg)",
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "6px 8px",
  overflowX: "auto",
  whiteSpace: "pre",
  flex: 1,
  minWidth: 0,
};

function CopyLine({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(text).then(() => {
      setDone(true);
      window.setTimeout(() => setDone(false), 1500);
    });
  }, [text]);
  return (
    <div
      style={{ display: "flex", gap: 6, alignItems: "stretch", minWidth: 0 }}
    >
      <code style={mono}>{text}</code>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy"
        style={{
          font: "600 11px 'Space Grotesk',sans-serif",
          color: "var(--brand-ink)",
          background: "var(--brand)",
          border: 0,
          borderRadius: 6,
          padding: "0 10px",
          cursor: "pointer",
          flex: "none",
        }}
      >
        {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function DownloadStartedPanel({
  detail,
  onClose,
}: {
  detail: DownloadStartedDetail;
  onClose: () => void;
}) {
  const canVerify = Boolean(detail.sha256) || detail.verify.length > 0;
  return (
    <aside
      role="status"
      aria-live="polite"
      data-testid="download-started"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 89,
        width: "min(560px, calc(100vw - 32px))",
        background: "var(--bg-raised)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        boxShadow: "0 20px 60px rgba(0,0,0,.35)",
        padding: 16,
        color: "var(--ink)",
        font: "14px/1.45 system-ui,sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <strong style={{ font: "600 15px 'Space Grotesk',sans-serif" }}>
          Downloading {detail.filename}
        </strong>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "transparent",
            border: 0,
            color: "var(--ink)",
            opacity: 0.7,
            cursor: "pointer",
            font: "18px/1 system-ui",
          }}
        >
          ×
        </button>
      </div>

      {/* The one thing to do. */}
      <p style={{ margin: "8px 0 6px" }}>{detail.run.text}</p>
      {detail.run.command && (
        <div style={{ marginBottom: 4 }}>
          <div
            style={{
              font: "600 11px system-ui",
              opacity: 0.7,
              marginBottom: 4,
            }}
          >
            Run it
          </div>
          <CopyLine text={detail.run.command} />
        </div>
      )}

      {/* Everything else is optional and says so. */}
      {canVerify && (
        <details style={{ marginTop: 10 }}>
          <summary
            style={{
              cursor: "pointer",
              font: "600 12px system-ui",
              opacity: 0.75,
              listStyle: "revert",
            }}
          >
            Want to check the download first? (optional)
          </summary>
          <div style={{ marginTop: 8, display: "grid", gap: 8, minWidth: 0 }}>
            {detail.sha256 && (
              <div>
                <div
                  style={{
                    font: "600 11px system-ui",
                    opacity: 0.7,
                    marginBottom: 4,
                  }}
                >
                  SHA-256
                  {detail.sha256Url && (
                    <>
                      {" · "}
                      <a
                        href={detail.sha256Url}
                        style={{ color: "var(--brand)" }}
                        target="_blank"
                        rel="noreferrer"
                      >
                        .sha256 file
                      </a>
                    </>
                  )}
                </div>
                <CopyLine text={detail.sha256} />
              </div>
            )}
            {detail.verify.length > 0 && (
              <ol
                // Grid items default to min-width:auto; minmax(0,1fr) + minWidth:0
                // keep each line scrolling inside its box with Copy in view.
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr)",
                  gap: 6,
                  minWidth: 0,
                }}
              >
                {detail.verify.map((s) => (
                  <li key={s} style={{ minWidth: 0 }}>
                    <CopyLine text={s} />
                  </li>
                ))}
              </ol>
            )}
          </div>
        </details>
      )}
    </aside>
  );
}
