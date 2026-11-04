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
 * The browser half: one catalog fetch per page, shared by every Download button
 * on it, and one entry point those buttons call —
 *
 *     requestDownload() → starts the download, or opens the newsletter modal
 *
 * WHY AN EVENT AND NOT A CALLBACK. Download CTAs live in a dozen places on the
 * marketing site (header, five stories, the docs header, prerendered docs
 * pages). Threading an `onUnavailable` prop to each one would couple every
 * story to the modal; instead the miss is announced on `window` and a single
 * <DownloadGate/> mounted at the app root answers it. A button stays a button.
 *
 * React-free on purpose: the docs site hydrates prerendered HTML where some
 * Download buttons are markup from the content pipeline, not components.
 */
import {
  type ReleaseAsset,
  detectPlatform,
  normalizeArchHint,
  normalizeBuild,
  resolveDownload,
  type ArchKey,
  type DownloadResolution,
  type OsKey,
  type Platform,
  type ReleaseBuild,
} from "./release";

/** Detail of the `gw:download-unavailable` event the gate listens for. */
export interface DownloadUnavailableDetail {
  reason: Exclude<DownloadResolution["status"], "ready">;
  platform: Platform;
  /** Story/page the click came from, for analytics parity with download_clicked. */
  source?: string;
}

export const DOWNLOAD_UNAVAILABLE_EVENT = "gw:download-unavailable";

/**
 * Announced on `window` the moment a download is handed to the browser, so
 * the gate can show what was fetched, the SHA-256 to check it against, and
 * the unlock steps a bare binary needs. Same reasoning as the miss event:
 * a dozen buttons, one panel.
 */
export const DOWNLOAD_STARTED_EVENT = "gw:download-started";
export interface DownloadStartedDetail {
  asset: ReleaseAsset;
  /** What the browser was actually handed (raw binary or archive). */
  filename: string;
  url: string;
  /** SHA-256 of THAT file, from the catalog; null if the catalog lacked it. */
  sha256: string | null;
  /** Sidecar `<file>.sha256` beside the file, when the file is a raw binary. */
  sha256Url: string | null;
  /** Verification commands (optional for the user), in order. */
  verify: readonly string[];
  /** How to run it: ONE command where a shell is the natural way (macOS,
   *  Linux), or plain words where a double-click is (Windows). */
  run: RunInstruction;
  /** @deprecated 1.7 shape: verify + run commands, for hosts that read it. */
  steps: readonly string[];
  source?: string;
}

export interface RunInstruction {
  /** Human sentence shown above the command / instead of one. */
  text: string;
  /** A single copyable command, when there is one. */
  command?: string;
}

export interface DownloadKitConfig {
  /** Same-origin proxy of releases.json. Both Workers serve this path. */
  versionUrl: string;
  /**
   * Label used ONLY when the Worker's body omits `channel`. It does NOT select
   * a channel: the Worker serves one channel and decides which — there is no
   * query parameter and no second endpoint. Named for what it does so nobody
   * reaches for it expecting `{ fallbackChannel: "beta" }` to switch channels.
   */
  fallbackChannel: string;
  fetchFn: typeof fetch;
  /** Analytics seam — marketing passes its `track`; docs passes nothing. */
  track?: (event: {
    name: "download_clicked";
    os: string;
    story?: string;
  }) => void;
  /** How long a click waits for a cold catalog before falling back to the modal. */
  timeoutMs: number;
}

const defaults: DownloadKitConfig = {
  versionUrl: "/v1/version",
  fallbackChannel: "stable",
  fetchFn: (...args: Parameters<typeof fetch>) => fetch(...args),
  timeoutMs: 4000,
};

let config: DownloadKitConfig = { ...defaults };
let inflight: Promise<ReleaseBuild | null> | null = null;
let cached: ReleaseBuild | null | undefined;
let cachedAt = 0;
let watchingVisibility = false;
let archHint: string | null = null;

/** A warm (badge, prefetch) reuses a catalog younger than this; a CLICK never
 *  does — it revalidates first and only falls back to the cached copy. */
export const CATALOG_TTL_MS = 60_000;

/** Call once at app start. Later calls merge, so tests can override piecemeal. */
export function configureDownloadKit(cfg: Partial<DownloadKitConfig>): void {
  config = { ...config, ...cfg };
}

/** Test seam: forget the cached catalog, the in-flight fetch and the config. */
export function _resetDownloadKit(): void {
  config = { ...defaults };
  inflight = null;
  cached = undefined;
  cachedAt = 0;
  watchingVisibility = false;
  archHint = null;
}

interface UserAgentData {
  getHighEntropyValues?: (
    hints: string[],
  ) => Promise<{ architecture?: string }>;
}

/**
 * Ask the browser for the CPU architecture. Chromium-only, asynchronous, and
 * frequently absent — so it is kicked off at warm time and merely IMPROVES a
 * later pick rather than gating it. Failure is silent by design.
 */
function warmArch(): void {
  if (typeof navigator === "undefined") return;
  const uaData = (navigator as Navigator & { userAgentData?: UserAgentData })
    .userAgentData;
  void uaData
    ?.getHighEntropyValues?.(["architecture"])
    .then((h) => {
      archHint = h.architecture ?? null;
    })
    .catch(() => {});
}

/**
 * Fetch + validate the release ONCE per page load, shared by every caller.
 *
 * `versionUrl` is a WORKER endpoint, and a Worker serves ONE channel already
 * flattened — `{version, channel, releasedAt, assets}` — not the channel-keyed
 * catalog the release pipeline publishes. So this validates with normalizeBuild,
 * not normalizeCatalog; running the catalog parser here looks for a "stable"
 * key that a Worker response does not have, which reports "nothing published"
 * on every click no matter what has shipped. The seam test in each repo feeds a
 * real Worker response through this path so the two halves cannot drift apart
 * again.
 *
 * Every failure — network, non-2xx, unparseable body, no valid asset — becomes
 * `null`, which resolveDownload reports as no-catalog. A Download button must
 * never throw at a visitor.
 */
export function warmRelease(
  opts: { fresh?: boolean } = {},
): Promise<ReleaseBuild | null> {
  if (inflight) return inflight; // one fetch, however many callers
  if (
    !opts.fresh &&
    cached !== undefined &&
    Date.now() - cachedAt < CATALOG_TTL_MS
  ) {
    return Promise.resolve(cached);
  }
  warmArch();
  watchVisibility();
  const had = cached;
  inflight = config
    .fetchFn(config.versionUrl, {
      headers: { accept: "application/json" },
      // A click must not be answered from the browser's HTTP cache: revalidate
      // with the edge (the Worker answers 304/200 in one round trip).
      cache: opts.fresh ? "no-cache" : "default",
    } as RequestInit)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      const next = normalizeBuild(data, config.fallbackChannel);
      // A failed revalidation keeps what we had: stale beats "nothing published".
      cached = next ?? had ?? null;
      cachedAt = Date.now();
      return cached;
    })
    .catch(() => {
      cached = had ?? null;
      return cached;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** A tab left open across a release re-warms when it comes back into view, so
 *  the version line and the button agree with what is published NOW. */
function watchVisibility(): void {
  if (watchingVisibility || typeof document === "undefined") return;
  watchingVisibility = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible")
      void warmRelease({ fresh: true });
  });
}

/** The catalog if it has already arrived; undefined while unknown. */
export function cachedRelease(): ReleaseBuild | null | undefined {
  return cached;
}

/** Current version string for the "v… · platforms" line, or null. */
export function cachedVersion(): string | null {
  return cached?.version ?? null;
}

/** The platform we think the visitor is on (arch improves after warmArch). */
export function currentPlatform(
  osOverride?: OsKey,
  archOverride?: ArchKey,
): Platform {
  const ua =
    typeof navigator === "undefined" ? "" : (navigator.userAgent ?? "");
  const detected = detectPlatform(ua, archHint);
  if (!osOverride && !archOverride) return detected;
  const os = osOverride ?? detected.os;
  // An explicit per-OS button ("Download for Linux") overrides detection but
  // keeps the detected arch only when it is still meaningful for that OS.
  //
  // An explicit ARCH overrides even that, and nothing may second-guess it: it
  // comes from a surface that NAMES the build it is offering — the docs
  // download table has a row per triple — so detection is not a better guess,
  // it is the wrong answer. Silently resolving a "macOS · Intel" row to arm64
  // on an Apple-silicon Mac is precisely the wrong-.pkg mistake that page warns
  // readers about, and Installer refuses a wrong-arch package quietly.
  const arch =
    archOverride ??
    (detected.os === os ? detected.arch : normalizeArchHint(archHint));
  return { os, arch, label: osOverride ? null : detected.label };
}

/** Resolve without side effects — used by tests and by pre-click UI copy. */
export async function resolveCurrentDownload(
  osOverride?: OsKey,
  archOverride?: ArchKey,
): Promise<DownloadResolution> {
  const platform = currentPlatform(osOverride, archOverride);
  // Revalidate on every click — a page opened before a release must still hand
  // over the release that is published NOW. A slow or failed revalidation falls
  // back to the cached copy rather than a spinner or a false "nothing published".
  const fresh = await withTimeout(
    warmRelease({ fresh: true }),
    config.timeoutMs,
  );
  const build = fresh ?? cached ?? null;
  return resolveDownload(build, platform);
}

/**
 * A cold catalog must not hang a click.
 *
 * The fetch keeps running (a later click gets the real answer); this click just
 * stops waiting and shows the modal, which is the same thing the visitor would
 * see if the catalog were genuinely missing. A spinner on a Download button is
 * a worse outcome than an honest "not yet — want to hear when?".
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  if (!Number.isFinite(ms) || ms <= 0) return p;
  return new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    void p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/**
 * The macOS installer package, when the catalog carries one.
 *
 * Its own helper because three things key off it — which file a click fetches,
 * which hash is shown, and which instructions appear — and they must agree.
 */
export function installerTargetFor(
  asset: ReleaseAsset,
): { url: string; filename: string } | null {
  if (!asset.installerUrl || !asset.installerFilename) return null;
  return { url: asset.installerUrl, filename: asset.installerFilename };
}

/**
 * What a click should actually fetch for this asset.
 *
 * macOS takes the INSTALLER when there is one. A bare executable cannot pass
 * the Finder double-click path at all — `spctl -a -t open` in its default
 * context answers "source=Insufficient Context", because LaunchServices
 * assesses a double-clicked file as a document and never reaches the
 * signature. That is true even of a fully notarized binary, so no amount of
 * signing fixes the raw download; the .pkg is the fix, and being stapled it
 * opens offline too.
 *
 * Otherwise the raw binary when the catalog carries one — one click, one file,
 * the version in its name — and the archive as the fallback (older catalogs,
 * or a release whose raw upload failed). A browser download of a bare
 * Mach-O/ELF arrives without the exec bit and quarantined, so the surface that
 * renders the button shows the unlock next to it — see POST_DOWNLOAD_STEPS.
 *
 * Exported so the rule is tested as a rule, not inferred from which URL an
 * anchor happened to get.
 */
export function downloadTargetFor(asset: ReleaseAsset): {
  url: string;
  filename: string;
} {
  const installer = installerTargetFor(asset);
  if (installer) return installer;
  if (asset.binaryUrl && asset.binaryFilename) {
    return { url: asset.binaryUrl, filename: asset.binaryFilename };
  }
  return { url: asset.url, filename: asset.filename };
}

/** Which of the three files `downloadTargetFor` landed on. */
export type DownloadKind = "installer" | "binary" | "archive";

/** The chosen file AND the facts that describe THAT file, never another. */
export interface DownloadDetails {
  kind: DownloadKind;
  url: string;
  filename: string;
  /** "" when the pipeline omitted it, matching ReleaseAsset.sha256. */
  sha256: string;
  /** 0 when unknown, matching ReleaseAsset.sizeBytes. */
  sizeBytes: number;
  /** Sidecar `<file>.sha256` beside the file — raw binaries only. */
  sha256Url: string | null;
}

/**
 * downloadTargetFor, plus the hash and size belonging to the file it picked.
 *
 * An asset carries up to three files with three digests and three sizes, so
 * "which file" and "which hash" are one decision, not two — and every surface
 * that shows a download has to make it identically. It is exported because a
 * SECOND surface needs the answer without clicking anything: the docs download
 * table is rendered at build time by growther-docs/scripts/releases.mts, which
 * prints a filename, a size and a SHA-256 in one row and must not mix files.
 *
 * That script previously derived all of this itself, from a private copy of the
 * catalog's shape — which is why it kept linking the archive for a year after
 * macOS started shipping a signed .pkg. One function, one answer.
 */
export function downloadDetailsFor(asset: ReleaseAsset): DownloadDetails {
  const target = downloadTargetFor(asset);
  if (target.url === asset.installerUrl) {
    return {
      kind: "installer",
      ...target,
      sha256: asset.installerSha256 ?? "",
      sizeBytes: asset.installerSizeBytes ?? 0,
      // The pipeline publishes no .sha256 beside the package — it is signed and
      // stapled, so Installer does the real check. A URL that 404s would be
      // worse than none.
      sha256Url: null,
    };
  }
  if (target.url === asset.binaryUrl) {
    return {
      kind: "binary",
      ...target,
      sha256: asset.binarySha256 ?? "",
      sizeBytes: asset.binarySizeBytes ?? 0,
      sha256Url: `${asset.binaryUrl}.sha256`,
    };
  }
  return {
    kind: "archive",
    ...target,
    sha256: asset.sha256,
    sizeBytes: asset.sizeBytes,
    sha256Url: null,
  };
}

/** The zip's stem and the executable inside it, by the package job's rule. */
function zipParts(
  asset: ReleaseAsset,
): { zip: string; stem: string; entry: string } | null {
  if (!asset.binaryUrl || !asset.binaryFilename) return null;
  const zip = asset.binaryFilename;
  const stem = zip.replace(/\.zip$/, "");
  const entry =
    asset.binaryEntry ??
    (asset.os === "win" ? `${stem}.exe` : stem.replace(/\./g, "_"));
  return { zip, stem, entry };
}

/**
 * How to run what was downloaded. ONE line on macOS/Linux — unzip, unlock,
 * start — because the binary then installs itself and hands over (C5 v239+),
 * so this is genuinely all a person has to do. Windows is a double-click, so
 * it is words, not a command. Empty text when the download is the archive.
 */
export function runInstruction(asset: ReleaseAsset): RunInstruction {
  if (installerTargetFor(asset)) {
    // No command: this is a GUI flow end to end. The package asks for an
    // administrator password, then hands off to the binary's own installer in
    // a Terminal window, which is where the server log appears.
    return {
      text: "Double-click it. It asks for your password, then C5 installs itself and opens in your browser.",
    };
  }
  const p = zipParts(asset);
  if (!p) {
    return { text: "Extract it and run the growther binary inside." };
  }
  const { zip, stem, entry } = p;
  if (asset.os === "macos") {
    return {
      text: "Unzip it and run the app — it installs itself and opens in your browser.",
      // ditto restores the icon; xattr clears the download quarantine so the
      // first launch is not blocked; then run it.
      command: `cd ~/Downloads && ditto -x -k ${zip} . && xattr -d com.apple.quarantine ${stem}/${entry} 2>/dev/null; ${stem}/${entry}`,
    };
  }
  if (asset.os === "linux") {
    return {
      text: "Unzip it and run the app — it installs itself and opens in your browser.",
      command: `cd ~/Downloads && unzip -oq ${zip} && chmod +x ${stem}/${entry} && ${stem}/${entry}`,
    };
  }
  return {
    text: `Unzip it (right-click › Extract All) and double-click ${entry}. It installs itself and opens in your browser. If SmartScreen appears, choose More info › Run anyway.`,
  };
}

/**
 * Optional integrity checks: the zip against the catalog hash (signed
 * upstream), then the executable against the .sha256 that ships inside.
 * Each line is self-contained. Empty when nothing can be checked.
 */
export function verifySteps(asset: ReleaseAsset): readonly string[] {
  const installer = installerTargetFor(asset);
  if (installer) {
    // A signed, notarized, STAPLED package carries its own proof: Installer
    // checks the signature and the stapled ticket before it will open, with no
    // network. A hash comparison adds nothing here, so the useful step is the
    // one that names the publisher.
    return [`pkgutil --check-signature ~/Downloads/${installer.filename}`];
  }
  const p = zipParts(asset);
  if (!p) return [];
  const { zip, stem, entry } = p;
  const sha = asset.binarySha256 ?? null;
  if (asset.os === "macos") {
    return [
      ...(sha
        ? [`echo "${sha}  $HOME/Downloads/${zip}" | shasum -a 256 -c`]
        : []),
      `cd ~/Downloads && ditto -x -k ${zip} . && cd ${stem} && shasum -a 256 -c ${entry}.sha256`,
    ];
  }
  if (asset.os === "linux") {
    return [
      ...(sha ? [`echo "${sha}  $HOME/Downloads/${zip}" | sha256sum -c`] : []),
      `cd ~/Downloads && unzip -oq ${zip} && cd ${stem} && sha256sum -c ${entry}.sha256`,
    ];
  }
  return [
    ...(sha
      ? [
          `(Get-FileHash "$env:USERPROFILE\\Downloads\\${zip}").Hash -eq "${sha}"`,
        ]
      : []),
    `Expand-Archive "$env:USERPROFILE\\Downloads\\${zip}" "$env:USERPROFILE\\Downloads" -Force; (Get-FileHash "$env:USERPROFILE\\Downloads\\${stem}\\${entry}").Hash`,
  ];
}

/** @deprecated since 1.8.0 — verify lines followed by the run command. */
export function postDownloadSteps(asset: ReleaseAsset): readonly string[] {
  // The installer needs no unzip and no quarantine unlock; its only optional
  // step is the signature check above.
  if (installerTargetFor(asset)) return verifySteps(asset);
  if (!zipParts(asset)) return [];
  const run = runInstruction(asset);
  return [...verifySteps(asset), ...(run.command ? [run.command] : [])];
}

/**
 * Start a download without navigating away.
 *
 * Assets are cross-origin, so the `download` attribute is ignored by the
 * browser — what actually saves the file is the archive content-type on the
 * response. Kept anyway: it costs nothing and names the file when the asset
 * later moves to our own origin.
 */
export function triggerDownload(asset: {
  url: string;
  filename: string;
}): void {
  if (typeof document === "undefined") return;
  const a = document.createElement("a");
  a.href = asset.url;
  a.rel = "noopener";
  a.download = asset.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export interface RequestDownloadOptions {
  /** Force a platform — the per-OS buttons in the Fleet story do this. */
  os?: OsKey;
  /**
   * Force an architecture. For a surface that names the exact build it offers —
   * the docs download table, one row per triple — where detection would be a
   * guess against a stated fact. Meaningless without `os`.
   */
  arch?: ArchKey;
  /** Story or page the click came from (analytics). */
  story?: string;
}

/**
 * What every Download button calls.
 *
 * Resolves to "download" when a build for this computer was started, "modal"
 * when the newsletter modal was opened instead. The analytics event fires
 * either way and BEFORE the outcome is known — a click on Download is the
 * intent we care about; whether we had a binary to give them is a separate
 * fact, carried by the modal's own event.
 */
export async function requestDownload(
  opts: RequestDownloadOptions = {},
): Promise<"download" | "modal"> {
  const platform = currentPlatform(opts.os, opts.arch);
  config.track?.({
    name: "download_clicked",
    os: platform.label ?? platform.os ?? "unknown",
    ...(opts.story ? { story: opts.story } : {}),
  });

  const resolution = await resolveCurrentDownload(opts.os, opts.arch);
  if (resolution.status === "ready") {
    const asset = resolution.asset;
    const target = downloadDetailsFor(asset);
    triggerDownload(target);
    announceStarted({
      asset,
      filename: target.filename,
      url: target.url,
      sha256: target.sha256 || null,
      sha256Url: target.sha256Url,
      verify: verifySteps(asset),
      run: runInstruction(asset),
      steps: postDownloadSteps(asset),
      ...(opts.story ? { source: opts.story } : {}),
    });
    return "download";
  }

  announceUnavailable({
    reason: resolution.status,
    platform: resolution.platform,
    ...(opts.story ? { source: opts.story } : {}),
  });
  return "modal";
}

/** Tell the gate a download started. No listener (SSR) is a no-op. */
export function announceStarted(detail: DownloadStartedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DownloadStartedDetail>(DOWNLOAD_STARTED_EVENT, { detail }),
  );
}

/** Tell the gate to open. No listener (SSR, a page without one) is a no-op. */
export function announceUnavailable(detail: DownloadUnavailableDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DownloadUnavailableDetail>(DOWNLOAD_UNAVAILABLE_EVENT, {
      detail,
    }),
  );
}
