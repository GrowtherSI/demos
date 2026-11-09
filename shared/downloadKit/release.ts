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
 * The pure half: read the release catalog growther-c5's release.yml publishes to
 * GrowtherSI/release (dist/c5/releases.json), and answer ONE question —
 *
 *     "is there a build this visitor's computer can actually run?"
 *
 * Two callers, deliberately the same code:
 *   • the Workers, which proxy the catalog same-origin (CSP connect-src 'self')
 *   • the browser, which decides between starting a download and opening the
 *     newsletter modal
 *
 * Nothing here touches the DOM, `fetch`, or React, and it imports nothing — that
 * is what lets the file be mirrored verbatim into another repo.
 *
 * EVERYTHING IS UNTRUSTED. The catalog is written by a different repo's CI, and
 * its `url` field ends up in `<a href>`. So a field is either recognized and
 * allowlisted, or the asset is dropped; a channel whose every asset is dropped
 * is reported as having no build, which routes the visitor to the modal rather
 * than to a link we could not vouch for.
 */

/** OS tokens as build-releases-json.mjs writes them (NOT "windows"). */
export type OsKey = "macos" | "win" | "linux";
export type ArchKey = "arm64" | "x64";

const OS_KEYS: readonly OsKey[] = ["macos", "win", "linux"];
const ARCH_KEYS: readonly ArchKey[] = ["arm64", "x64"];

/** One downloadable archive. */
export interface ReleaseAsset {
  os: OsKey;
  arch: ArchKey;
  filename: string;
  url: string;
  /** "" when the pipeline omitted it — display only; the installer does the real check. */
  sha256: string;
  /** 0 when unknown. */
  sizeBytes: number;
  /**
   * The RAW executable published beside the archive, when the pipeline shipped
   * one. Present only as a pair (url + filename) — a bare binary is only a
   * better download where there is no exec bit to lose and the icon travels
   * inside the file, i.e. Windows; the archive stays primary elsewhere. The
   * auto-updater never reads this: it consumes `url` as an archive.
   */
  binaryUrl?: string;
  binaryFilename?: string;
  /** The executable inside the raw zip (versioned name; `.exe` on Windows). */
  binaryEntry?: string;
  /** "" when omitted, like sha256. */
  binarySha256?: string;
  /** 0 when unknown, like sizeBytes. */
  binarySizeBytes?: number;
  /**
   * The macOS INSTALLER package, when the release signed one.
   *
   * This is the download a PERSON should take on macOS. A bare executable
   * cannot pass the Finder double-click path at all: `spctl -a -t open` in its
   * default context answers "source=Insufficient Context", because
   * LaunchServices assesses a double-clicked file as a document and never
   * reaches the signature — true even of a fully notarized binary. The .pkg is
   * stapled (a single-file executable cannot be), so it also opens offline.
   *
   * Never `url`: the in-app updater treats `url` as an archive and extracts it.
   * The pipeline only advertises a SIGNED package, so a release built without
   * the Developer ID Installer certificate carries none of these fields rather
   * than linking one Gatekeeper refuses to open.
   */
  installerUrl?: string;
  installerFilename?: string;
  installerSha256?: string;
  installerSizeBytes?: number;
}

/** One channel of the catalog, normalized and validated. */
export interface ReleaseBuild {
  channel: string;
  version: string;
  /** ISO timestamp, or "" when absent. */
  releasedAt: string;
  /** At least one asset — a channel with none is not a ReleaseBuild. */
  assets: ReleaseAsset[];
}

/** What the browser is running, as far as we can tell. */
export interface Platform {
  /** null when this is not a computer C5 ships a build for (phone, tablet, ChromeOS…). */
  os: OsKey | null;
  /** null when the browser won't say — see pickAsset for the fallback. */
  arch: ArchKey | null;
  /** What a person calls it: "macOS" | "Windows" | "Linux", or null. */
  label: string | null;
}

export type DownloadResolution =
  /** A real asset for this platform — hand `asset.url` to the browser. */
  | {
      status: "ready";
      asset: ReleaseAsset;
      version: string;
      platform: Platform;
    }
  /** No catalog at all: not published yet, unreachable, or malformed. */
  | { status: "no-catalog"; platform: Platform }
  /** The catalog exists but ships nothing for this OS (e.g. no Windows build yet). */
  | { status: "no-build"; platform: Platform }
  /** C5 has no build for this KIND of device (phone, tablet, ChromeOS). */
  | { status: "unsupported-platform"; platform: Platform };

/** Why the modal opened — every non-ready resolution. */
export type UnavailableReason = Exclude<DownloadResolution["status"], "ready">;

/** Human labels, keyed by OS token. */
export const OS_LABEL: Record<OsKey, string> = {
  macos: "macOS",
  win: "Windows",
  linux: "Linux",
};

/**
 * Hosts a release asset may live on.
 *
 * The catalog is ours, but "ours" is not a security property once its contents
 * become an `href` — a compromised or mis-templated pipeline could otherwise
 * point every Download button on both sites at an arbitrary origin. The
 * pipeline writes raw.githubusercontent.com URLs today and GitHub release
 * URLs when BASE_URL is unset; both are listed, plus our own domains for a
 * future self-hosted mirror.
 */
const ASSET_HOSTS: readonly string[] = [
  "raw.githubusercontent.com",
  "github.com",
  "objects.githubusercontent.com",
  "growther.si",
];

/** Filename allowlist — it is shown to the visitor and may reach a save dialog. */
const SAFE_FILENAME = /^[A-Za-z0-9._-]{1,128}$/;
/** Version allowlist — it is rendered into the page ("v2026.8.13-v42"). */
const SAFE_VERSION = /^[A-Za-z0-9._+-]{1,64}$/;
/** Channel allowlist ("stable" | "beta" | "dev" today). Bounded like the rest:
 *  it is the one field an upstream catalog could otherwise hand us unbounded,
 *  and this file's whole contract is that nothing arrives unchecked. */
const SAFE_CHANNEL = /^[A-Za-z0-9._-]{1,32}$/;

/**
 * True when `raw` is an https URL on an allowlisted host.
 *
 * Deliberately a reject, not a repair: a URL we cannot recognize is dropped
 * with its asset, so the worst case is the newsletter modal — never a download
 * button pointing somewhere we did not publish. `new URL` also rejects
 * `javascript:` and `data:` by protocol, but the host check is what makes the
 * guarantee, since https on an arbitrary host is still an arbitrary binary.
 */
export function isSafeAssetUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048)
    return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return ASSET_HOSTS.some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
  );
}

function asOs(v: unknown): OsKey | null {
  return typeof v === "string" && (OS_KEYS as readonly string[]).includes(v)
    ? (v as OsKey)
    : null;
}
function asArch(v: unknown): ArchKey | null {
  return typeof v === "string" && (ARCH_KEYS as readonly string[]).includes(v)
    ? (v as ArchKey)
    : null;
}

/**
 * Validate one channel of releases.json into a ReleaseBuild.
 *
 * THE CATALOG IS KEYED BY CHANNEL: `{ "stable": {version, assets…} }`. That is
 * the shape the release pipeline publishes and the shape both Workers read.
 * What the Workers SERVE is one channel, already validated and flattened — so
 * the browser must not run this function on a Worker response (it would look
 * for a "stable" key that isn't there and report "nothing published"). Use
 * {@link normalizeBuild} for that; the two share every rule below.
 *
 * Returns null for "there is no build to offer" — an absent file, an absent
 * channel, a missing version, or a channel whose assets were all rejected.
 * Callers treat null and a fetch failure identically, which is the point: the
 * visitor's experience of "nothing to download" should not depend on WHY.
 */
export function normalizeCatalog(
  raw: unknown,
  channel = "stable",
): ReleaseBuild | null {
  if (raw === null || typeof raw !== "object") return null;
  const build = normalizeBuild(
    (raw as Record<string, unknown>)[channel],
    channel,
  );
  // In a CATALOG the key names the channel; an entry does not get to relabel
  // itself as another one. (A Worker response is the other way round — it has
  // no key, so it names its own channel.)
  return build && { ...build, channel };
}

/**
 * Validate ONE build entry — a channel's value from the catalog, or the flat
 * `ReleaseBuild` a Worker serves at /v1/version.
 *
 * Validating the Worker's own answer again in the browser is not paranoia
 * theatre: it is the same code path, so the two halves cannot drift into
 * disagreeing about what a usable build is, and a stale cached response from a
 * previous deploy is held to today's rules.
 *
 * `fallbackChannel` is only used when the value doesn't name its own channel —
 * a catalog entry doesn't, a Worker response does.
 */
export function normalizeBuild(
  entry: unknown,
  fallbackChannel = "stable",
): ReleaseBuild | null {
  if (entry === null || typeof entry !== "object") return null;

  const {
    version,
    releasedAt,
    assets,
    channel: ownChannel,
  } = entry as {
    version?: unknown;
    releasedAt?: unknown;
    assets?: unknown;
    channel?: unknown;
  };
  // A bad label must not cost the visitor their download — fall back, don't
  // reject. (An href would be the opposite call; see isSafeAssetUrl.)
  const channel =
    typeof ownChannel === "string" && SAFE_CHANNEL.test(ownChannel)
      ? ownChannel
      : fallbackChannel;
  if (typeof version !== "string" || !SAFE_VERSION.test(version)) return null;

  const out: ReleaseAsset[] = [];
  for (const a of Array.isArray(assets) ? assets : []) {
    if (a === null || typeof a !== "object") continue;
    const {
      os,
      arch,
      filename,
      url,
      sha256,
      sizeBytes,
      binaryUrl,
      binaryFilename,
      binaryEntry,
      binarySha256,
      binarySizeBytes,
      installerUrl,
      installerFilename,
      installerSha256,
      installerSizeBytes,
    } = a as Record<string, unknown>;
    const osKey = asOs(os);
    const archKey = asArch(arch);
    if (!osKey || !archKey) continue; // a platform we have no button for
    if (typeof filename !== "string" || !SAFE_FILENAME.test(filename)) continue;
    if (!isSafeAssetUrl(url)) continue;
    out.push({
      os: osKey,
      arch: archKey,
      filename,
      url,
      sha256:
        typeof sha256 === "string" && /^[0-9a-f]{64}$/i.test(sha256)
          ? sha256.toLowerCase()
          : "",
      sizeBytes:
        typeof sizeBytes === "number" &&
        Number.isFinite(sizeBytes) &&
        sizeBytes > 0
          ? Math.floor(sizeBytes)
          : 0,
      // The raw binary is optional and must arrive as a valid PAIR. Held to the
      // same rules as the archive: our release hosts only, a plain-token
      // filename. A half-present or malformed pair is dropped, never partially
      // kept — a filename without a URL (or vice versa) is not a download.
      ...(isSafeAssetUrl(binaryUrl) &&
      typeof binaryFilename === "string" &&
      SAFE_FILENAME.test(binaryFilename) &&
      (binaryEntry === undefined ||
        (typeof binaryEntry === "string" && SAFE_FILENAME.test(binaryEntry)))
        ? {
            binaryUrl,
            binaryFilename,
            ...(typeof binaryEntry === "string" ? { binaryEntry } : {}),
            binarySha256:
              typeof binarySha256 === "string" &&
              /^[0-9a-f]{64}$/i.test(binarySha256)
                ? binarySha256.toLowerCase()
                : "",
            binarySizeBytes:
              typeof binarySizeBytes === "number" &&
              Number.isFinite(binarySizeBytes) &&
              binarySizeBytes > 0
                ? Math.floor(binarySizeBytes)
                : 0,
          }
        : {}),
      // The installer is optional and must arrive as a valid PAIR, held to the
      // same rules as the archive and the raw binary: our release hosts only, a
      // plain-token filename. Half-present or malformed is dropped whole — a
      // filename without a URL is not a download.
      ...(isSafeAssetUrl(installerUrl) &&
      typeof installerFilename === "string" &&
      SAFE_FILENAME.test(installerFilename)
        ? {
            installerUrl,
            installerFilename,
            installerSha256:
              typeof installerSha256 === "string" &&
              /^[0-9a-f]{64}$/i.test(installerSha256)
                ? installerSha256.toLowerCase()
                : "",
            installerSizeBytes:
              typeof installerSizeBytes === "number" &&
              Number.isFinite(installerSizeBytes) &&
              installerSizeBytes > 0
                ? Math.floor(installerSizeBytes)
                : 0,
          }
        : {}),
    });
  }
  if (out.length === 0) return null;

  // Stable order so two calls on the same catalog render the same list.
  out.sort((x, y) => `${x.os}-${x.arch}`.localeCompare(`${y.os}-${y.arch}`));

  return {
    channel,
    version,
    releasedAt: typeof releasedAt === "string" ? releasedAt : "",
    assets: out,
  };
}

/**
 * What computer is this?
 *
 * `uaArch` is the answer from userAgentData.getHighEntropyValues(["architecture"])
 * when the browser has provided one; almost none do synchronously, so arch is
 * usually null and pickAsset falls back to the platform default.
 *
 * A device C5 has no build for — phone, tablet, ChromeOS — returns os: null
 * rather than a plausible-looking guess. Guessing here would hand an Android
 * visitor a Linux tarball; saying "no" routes them to the modal, which is the
 * honest answer and the one that captures an email.
 */
export function detectPlatform(ua: string, uaArch?: string | null): Platform {
  const s = ua.toLowerCase();
  const arch = normalizeArchHint(uaArch);

  // Phones and tablets first: an Android UA also contains "linux", and
  // "iphone"/"ipad" appear alongside "mac os x".
  if (/android|iphone|ipad|ipod|windows phone|mobile safari/.test(s))
    return { os: null, arch, label: null };
  // ChromeOS reports "cros x86_64" and cannot run a plain Linux binary.
  if (s.includes("cros")) return { os: null, arch, label: null };

  if (s.includes("win")) return { os: "win", arch, label: OS_LABEL.win };
  if (s.includes("mac")) return { os: "macos", arch, label: OS_LABEL.macos };
  if (s.includes("linux") || s.includes("x11"))
    return { os: "linux", arch, label: OS_LABEL.linux };

  // Something we don't recognize (a bot, a console, a new OS). No build claim.
  return { os: null, arch, label: null };
}

/** userAgentData architecture strings → our tokens. */
export function normalizeArchHint(hint?: string | null): ArchKey | null {
  if (!hint) return null;
  const h = hint.toLowerCase();
  if (h === "arm" || h === "arm64" || h === "aarch64") return "arm64";
  if (h === "x86" || h === "x86_64" || h === "x64" || h === "amd64")
    return "x64";
  return null;
}

/**
 * Default architecture when the browser won't say: Apple ships ARM, everyone
 * else still ships mostly x64. Both fallbacks are safe in the direction that
 * matters — Apple Silicon runs x64 under Rosetta and Windows-on-ARM emulates
 * x64, whereas an ARM machine handed nothing at all would just fail.
 */
const DEFAULT_ARCH: Record<OsKey, ArchKey> = {
  macos: "arm64",
  win: "x64",
  linux: "x64",
};

/** The best asset for a platform, or null when the OS has no build at all. */
export function pickAsset(
  build: ReleaseBuild,
  platform: Platform,
): ReleaseAsset | null {
  if (!platform.os) return null;
  const forOs = build.assets.filter((a) => a.os === platform.os);
  if (forOs.length === 0) return null;
  const wanted = platform.arch ?? DEFAULT_ARCH[platform.os];
  const exact = forOs.find((a) => a.arch === wanted);
  if (exact) return exact;
  // Better a runnable other-arch build (Rosetta / x64 emulation) than nothing —
  // but WITHOUT its installer. An executable for the other architecture still
  // runs under emulation; a .pkg does not install at all. Installer honours the
  // `hostArchitectures` in the package's Distribution file and declines a
  // mismatch, and it declines it QUIETLY: no payload is written, no receipt is
  // recorded, and the window still reads as a completed install. That was
  // mistaken for a broken package once already. Offering the archive here is
  // the honest fallback; offering the .pkg would be offering a dead end.
  const fallback = forOs[0];
  if (!fallback) return null;
  if (!fallback.installerUrl) return fallback;
  const {
    installerUrl: _u,
    installerFilename: _f,
    installerSha256: _s,
    installerSizeBytes: _z,
    ...withoutInstaller
  } = fallback;
  return withoutInstaller;
}

/**
 * THE function: given whatever catalog we managed to load and whoever is
 * asking, either name the file to download or say precisely why we can't.
 *
 * `build === null` covers every catalog failure — never published, 404, network
 * down, malformed JSON, all assets rejected. The distinction the visitor cares
 * about is preserved separately: "we have no builds yet" (no-catalog) reads
 * differently in the modal from "we have builds, none for Windows" (no-build).
 */
export function resolveDownload(
  build: ReleaseBuild | null,
  platform: Platform,
): DownloadResolution {
  if (!build) return { status: "no-catalog", platform };
  if (!platform.os) return { status: "unsupported-platform", platform };
  const asset = pickAsset(build, platform);
  if (!asset) return { status: "no-build", platform };
  return { status: "ready", asset, version: build.version, platform };
}

// No formatSize here on purpose. The docs site already has one, with different
// empty-value semantics, in scripts/releases.mts where its download TABLE is
// rendered; a second copy in the kit had no consumer and two functions with the
// same name and different behaviour is how a "68.4 MB" becomes a "—".
