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
 * Mount ONCE per app, near the root. It listens for the miss that
 * requestDownload() announces and puts the newsletter modal on screen, and
 * for the start it announces and shows the file, its SHA-256 and the unlock
 * steps a bare binary needs (chmod, quarantine) — the answer to "I clicked
 * Download, now what?" without a second page.
 *
 * Rendering nothing until then is what makes it safe on the prerendered docs
 * site: the server-rendered markup and the first client render agree (both
 * empty), so hydration never tears.
 */
import { useCallback, useEffect, useState } from "react";
import {
  cachedRelease,
  DOWNLOAD_STARTED_EVENT,
  DOWNLOAD_UNAVAILABLE_EVENT,
  type DownloadStartedDetail,
  type DownloadUnavailableDetail,
} from "./client";
import { DownloadModal, type NewsletterAdapter } from "./DownloadModal";
import { DownloadStartedPanel } from "./DownloadStartedPanel";

export interface DownloadGateProps {
  /** Omit to render a link to the site's signup instead of a working form. */
  newsletter?: NewsletterAdapter;
  siteUrl?: string;
  logoSrc?: string;
  /** Host analytics: the modal opened (and why), and a signup completed. */
  onOpen?: (detail: DownloadUnavailableDetail) => void;
  onSubscribed?: (detail: DownloadUnavailableDetail) => void;
}

export function DownloadGate({
  newsletter,
  siteUrl,
  logoSrc,
  onOpen,
  onSubscribed,
}: DownloadGateProps) {
  const [miss, setMiss] = useState<DownloadUnavailableDetail | null>(null);
  const [started, setStarted] = useState<DownloadStartedDetail | null>(null);

  useEffect(() => {
    const onStart = (e: Event) => {
      const detail = (e as CustomEvent<DownloadStartedDetail>).detail;
      if (detail) setStarted(detail);
    };
    window.addEventListener(DOWNLOAD_STARTED_EVENT, onStart);
    return () => window.removeEventListener(DOWNLOAD_STARTED_EVENT, onStart);
  }, []);

  useEffect(() => {
    const onMiss = (e: Event) => {
      const detail = (e as CustomEvent<DownloadUnavailableDetail>).detail;
      if (!detail) return;
      setMiss(detail);
      onOpen?.(detail);
    };
    window.addEventListener(DOWNLOAD_UNAVAILABLE_EVENT, onMiss);
    return () => window.removeEventListener(DOWNLOAD_UNAVAILABLE_EVENT, onMiss);
  }, [onOpen]);

  const close = useCallback(() => setMiss(null), []);
  const closeStarted = useCallback(() => setStarted(null), []);

  if (!miss) {
    return started ? (
      <DownloadStartedPanel detail={started} onClose={closeStarted} />
    ) : null;
  }
  return (
    <DownloadModal
      reason={miss.reason}
      platformLabel={miss.platform.label}
      build={cachedRelease() ?? null}
      onClose={close}
      {...(newsletter ? { newsletter } : {})}
      {...(siteUrl ? { siteUrl } : {})}
      {...(logoSrc ? { logoSrc } : {})}
      onSubscribed={() => onSubscribed?.(miss)}
    />
  );
}
