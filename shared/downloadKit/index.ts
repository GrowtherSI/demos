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
 * One import for the whole kit. Both sites use it the same way:
 *
 *   main/App:  configureDownloadKit({ track, fetchFn }); void warmRelease();
 *              <DownloadGate newsletter={…} />        // once, at the root
 *   buttons:   onClick={() => void requestDownload({ story: "fleet" })}
 *
 * Workers import ONLY ./release (no DOM, no React) to normalize the catalog
 * they proxy, so both halves of the system agree on what a valid build is.
 */
export { DOWNLOAD_KIT_VERSION, DOWNLOAD_KIT_CANONICAL } from "./VERSION";

export {
  detectPlatform,
  isSafeAssetUrl,
  normalizeArchHint,
  normalizeBuild,
  normalizeCatalog,
  OS_LABEL,
  pickAsset,
  resolveDownload,
  type ArchKey,
  type DownloadResolution,
  type OsKey,
  type Platform,
  type ReleaseAsset,
  type ReleaseBuild,
  type UnavailableReason,
} from "./release";

export {
  announceStarted,
  announceUnavailable,
  cachedRelease,
  cachedVersion,
  configureDownloadKit,
  currentPlatform,
  DOWNLOAD_STARTED_EVENT,
  DOWNLOAD_UNAVAILABLE_EVENT,
  downloadDetailsFor,
  downloadTargetFor,
  postDownloadSteps,
  runInstruction,
  verifySteps,
  requestDownload,
  resolveCurrentDownload,
  triggerDownload,
  warmRelease,
  _resetDownloadKit,
  type DownloadDetails,
  type DownloadKind,
  type DownloadKitConfig,
  type DownloadStartedDetail,
  type RunInstruction,
  type DownloadUnavailableDetail,
  type RequestDownloadOptions,
} from "./client";

export {
  DEV_TOKEN,
  hasTurnstile,
  renderTurnstile,
  turnstileAdapter,
} from "./turnstile";

export { DownloadModal, type NewsletterAdapter } from "./DownloadModal";

export {
  SocialLinks,
  SOCIALS,
  X_URL,
  type Social,
  type SocialKey,
  type SocialLinksProps,
} from "./Socials";
export { DownloadGate, type DownloadGateProps } from "./DownloadGate";
export { DownloadStartedPanel } from "./DownloadStartedPanel";
