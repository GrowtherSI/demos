/**
 * ── SHARED DOWNLOAD KIT ── v1.10.5 ────────────────────────────────────────────
 * Test for the mirrored kit — it runs in BOTH growther-marketing and
 * growther-docs. Edit the canonical copy (growther-marketing) and run
 * `npm run sync:download-kit`; see ./README.md.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  detectPlatform,
  isSafeAssetUrl,
  normalizeArchHint,
  normalizeBuild,
  normalizeCatalog,
  pickAsset,
  resolveDownload,
  type ReleaseBuild,
} from "./release";

const BASE =
  "https://raw.githubusercontent.com/GrowtherSI/release/main/dist/c5/v2026.8.13-v42";

const asset = (
  os: string,
  arch: string,
  over: Record<string, unknown> = {},
) => ({
  os,
  arch,
  filename: `growther-node22-${os}-${arch}.tar.gz`,
  url: `${BASE}/growther-node22-${os}-${arch}.tar.gz`,
  sha256: "a".repeat(64),
  sizeBytes: 68_419_584,
  ...over,
});

/** Exactly the shape growther-c5's build-releases-json.mjs writes. */
const CATALOG = {
  stable: {
    version: "2026.8.13-v42",
    releasedAt: "2026-08-13T14:22:05.000Z",
    minSupportedVersion: "2026.1.0",
    commitHash: "deadbeef",
    notes: "C5 v2026.8.13-v42",
    assets: [
      asset("win", "x64"),
      asset("macos", "arm64"),
      asset("linux", "x64"),
    ],
  },
};

const build = (): ReleaseBuild => normalizeCatalog(CATALOG)!;

describe("normalizeCatalog", () => {
  it("reads the pipeline's own catalog shape", () => {
    const b = build();
    expect(b.version).toBe("2026.8.13-v42");
    expect(b.channel).toBe("stable");
    expect(b.releasedAt).toBe("2026-08-13T14:22:05.000Z");
    expect(b.assets.map((a) => `${a.os}-${a.arch}`)).toEqual([
      "linux-x64",
      "macos-arm64",
      "win-x64",
    ]);
  });

  it("reads a non-default channel on request", () => {
    const raw = {
      beta: { version: "2026.9.1-v3", assets: [asset("macos", "arm64")] },
    };
    expect(normalizeCatalog(raw, "beta")?.version).toBe("2026.9.1-v3");
    expect(normalizeCatalog(raw)).toBeNull(); // no stable channel
  });

  it("is null for every flavour of 'nothing published'", () => {
    expect(normalizeCatalog(null)).toBeNull();
    expect(normalizeCatalog("not json")).toBeNull();
    expect(normalizeCatalog({})).toBeNull();
    expect(normalizeCatalog({ stable: {} })).toBeNull();
    expect(normalizeCatalog({ stable: { version: "1.0.0" } })).toBeNull();
    expect(
      normalizeCatalog({ stable: { version: "1.0.0", assets: [] } }),
    ).toBeNull();
  });

  it("drops a malformed asset but keeps the rest", () => {
    const b = normalizeCatalog({
      stable: {
        version: "1.0.0",
        assets: [
          { os: "macos" }, // no arch/filename/url
          asset("plan9", "riscv"), // platform we have no button for
          asset("linux", "x64"),
        ],
      },
    })!;
    expect(b.assets).toHaveLength(1);
    expect(b.assets[0]!.os).toBe("linux");
  });

  /** The catalog is written by another repo's CI and its `url` becomes an href.
   *  A host we did not publish to is dropped, not rendered. */
  it("refuses an asset hosted off our release hosts", () => {
    expect(
      normalizeCatalog({
        stable: {
          version: "1.0.0",
          assets: [
            asset("macos", "arm64", { url: "https://evil.example/c5.tar.gz" }),
          ],
        },
      }),
    ).toBeNull();
  });

  it("refuses a version or filename that isn't a plain token", () => {
    expect(
      normalizeCatalog({
        stable: {
          version: "1.0.0'; rm -rf /",
          assets: [asset("macos", "arm64")],
        },
      }),
    ).toBeNull();
    expect(
      normalizeCatalog({
        stable: {
          version: "1.0.0",
          assets: [asset("macos", "arm64", { filename: "../../etc/passwd" })],
        },
      }),
    ).toBeNull();
  });

  it("keeps a partial asset usable: a bad digest or size is blanked, not fatal", () => {
    const b = normalizeCatalog({
      stable: {
        version: "1.0.0",
        assets: [asset("macos", "arm64", { sha256: "nope", sizeBytes: -4 })],
      },
    })!;
    expect(b.assets[0]).toMatchObject({ sha256: "", sizeBytes: 0 });
  });
});

describe("isSafeAssetUrl", () => {
  it("accepts the hosts the pipeline actually publishes to", () => {
    expect(isSafeAssetUrl(`${BASE}/x.tar.gz`)).toBe(true);
    expect(
      isSafeAssetUrl(
        "https://github.com/GrowtherSI/release/releases/download/v1/x.zip",
      ),
    ).toBe(true);
    expect(isSafeAssetUrl("https://objects.githubusercontent.com/x")).toBe(
      true,
    );
    expect(isSafeAssetUrl("https://dl.growther.si/c5.tar.gz")).toBe(true);
  });

  it("rejects other schemes, other hosts, and lookalike domains", () => {
    expect(isSafeAssetUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeAssetUrl("http://raw.githubusercontent.com/x")).toBe(false);
    expect(isSafeAssetUrl("https://growther.si.evil.example/x")).toBe(false);
    expect(isSafeAssetUrl("https://notgrowther.si/x")).toBe(false);
    expect(isSafeAssetUrl(undefined)).toBe(false);
  });
});

describe("detectPlatform", () => {
  const UA = {
    mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    win: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    linux:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    iphone:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    android:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
    cros: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    ipad: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    androidTablet:
      "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  };

  it("names the three desktops C5 ships for", () => {
    expect(detectPlatform(UA.mac).os).toBe("macos");
    expect(detectPlatform(UA.win).os).toBe("win");
    expect(detectPlatform(UA.linux).os).toBe("linux");
    expect(detectPlatform(UA.win).label).toBe("Windows");
  });

  /** An iPhone UA contains "Mac OS X" and an Android UA contains "Linux";
   *  matching on those would hand a phone a desktop binary. */
  it("says 'no build' for phones, ChromeOS and unknown agents rather than guessing", () => {
    expect(detectPlatform(UA.iphone).os).toBeNull();
    expect(detectPlatform(UA.android).os).toBeNull();
    expect(detectPlatform(UA.cros).os).toBeNull();
    expect(detectPlatform("").os).toBeNull();
    expect(detectPlatform(UA.iphone).label).toBeNull();
  });

  it("says 'no build' for tablets that announce themselves as tablets", () => {
    expect(detectPlatform(UA.ipad).os).toBeNull();
    expect(detectPlatform(UA.androidTablet).os).toBeNull();
  });

  /**
   * The honest limit of user-agent sniffing, pinned so nobody assumes more
   * than it does: an iPad in its default "Request Desktop Website" mode sends
   * a Macintosh UA with NO iPad token, so it is indistinguishable from a Mac
   * here and resolves to the macOS build. The download simply fails to open on
   * iPadOS; there is no C5 build to offer it either way, and the alternative —
   * treating every Mac as a possible tablet — would deny real Macs a download.
   */
  it("cannot tell a desktop-mode iPad from a Mac, and says so", () => {
    const iPadDesktopMode =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
    expect(detectPlatform(iPadDesktopMode).os).toBe("macos");
  });

  it("takes the architecture hint when the browser gives one", () => {
    expect(detectPlatform(UA.mac, "arm").arch).toBe("arm64");
    expect(detectPlatform(UA.win, "x86").arch).toBe("x64");
    expect(detectPlatform(UA.win, "sparc").arch).toBeNull();
    expect(normalizeArchHint(null)).toBeNull();
  });
});

describe("pickAsset", () => {
  it("matches the exact os+arch when it exists", () => {
    const b = normalizeCatalog({
      stable: {
        version: "1.0.0",
        assets: [asset("macos", "arm64"), asset("macos", "x64")],
      },
    })!;
    expect(
      pickAsset(b, { os: "macos", arch: "x64", label: "macOS" })!.arch,
    ).toBe("x64");
  });

  it("defaults to arm64 on a Mac and x64 elsewhere when arch is unknown", () => {
    const b = normalizeCatalog({
      stable: {
        version: "1.0.0",
        assets: [
          asset("macos", "arm64"),
          asset("macos", "x64"),
          asset("win", "arm64"),
          asset("win", "x64"),
        ],
      },
    })!;
    expect(
      pickAsset(b, { os: "macos", arch: null, label: "macOS" })!.arch,
    ).toBe("arm64");
    expect(
      pickAsset(b, { os: "win", arch: null, label: "Windows" })!.arch,
    ).toBe("x64");
  });

  /** Apple Silicon runs x64 under Rosetta and Windows-on-ARM emulates x64, so
   *  the other arch is a better answer than nothing at all. */
  it("falls back to the other architecture for the same OS", () => {
    const b = normalizeCatalog({
      stable: { version: "1.0.0", assets: [asset("macos", "x64")] },
    })!;
    expect(
      pickAsset(b, { os: "macos", arch: "arm64", label: "macOS" })!.arch,
    ).toBe("x64");
  });

  it("is null for an OS with no build and for an unknown device", () => {
    const b = normalizeCatalog({
      stable: { version: "1.0.0", assets: [asset("macos", "arm64")] },
    })!;
    expect(
      pickAsset(b, { os: "win", arch: "x64", label: "Windows" }),
    ).toBeNull();
    expect(pickAsset(b, { os: null, arch: null, label: null })).toBeNull();
  });
});

describe("resolveDownload", () => {
  it("names the file to download when there is one", () => {
    const r = resolveDownload(build(), {
      os: "win",
      arch: "x64",
      label: "Windows",
    });
    expect(r.status).toBe("ready");
    if (r.status !== "ready") throw new Error("unreachable");
    expect(r.asset.filename).toBe("growther-node22-win-x64.tar.gz");
    expect(r.version).toBe("2026.8.13-v42");
  });

  /** The three misses stay distinct: the modal says something different for
   *  "nothing is published" than for "nothing for Windows". */
  it("distinguishes no catalog, no build for this OS, and no build for this kind of device", () => {
    const win = { os: "win" as const, arch: null, label: "Windows" };
    expect(resolveDownload(null, win).status).toBe("no-catalog");

    const macOnly = normalizeCatalog({
      stable: { version: "1.0.0", assets: [asset("macos", "arm64")] },
    });
    expect(resolveDownload(macOnly, win).status).toBe("no-build");
    expect(
      resolveDownload(macOnly, { os: null, arch: null, label: null }).status,
    ).toBe("unsupported-platform");
  });

  it("reports no-catalog before anything else, even on a phone", () => {
    expect(
      resolveDownload(null, { os: null, arch: null, label: null }).status,
    ).toBe("no-catalog");
  });
});

describe("normalizeBuild", () => {
  /** What a Worker serves at /v1/version: one channel, already flattened.
   *  Running the CATALOG parser on this is what broke every Download button —
   *  it looks for a "stable" key the flat body does not have. */
  it("reads the flat build a Worker serves, and names its own channel", () => {
    const flat = {
      version: "2026.8.13-v42",
      channel: "beta",
      releasedAt: "2026-08-13T14:22:05.000Z",
      downloads: { "macos-arm64": `${BASE}/x.tar.gz` },
      assets: [asset("macos", "arm64")],
    };
    const b = normalizeBuild(flat)!;
    expect(b.version).toBe("2026.8.13-v42");
    expect(b.channel).toBe("beta");
    expect(b.assets).toHaveLength(1);
    // The catalog parser must NOT accept it — that is the bug this pair exists
    // to keep apart.
    expect(normalizeCatalog(flat)).toBeNull();
  });

  it("falls back to the caller's channel when the value does not name one", () => {
    expect(
      normalizeBuild(
        { version: "1.0.0", assets: [asset("macos", "arm64")] },
        "dev",
      )?.channel,
    ).toBe("dev");
  });

  it("holds a Worker's answer to exactly the same rules as the catalog", () => {
    // An empty release (nothing published) and a hostile one are both null.
    expect(normalizeBuild({ version: null, assets: [] })).toBeNull();
    expect(
      normalizeBuild({
        version: "1.0.0",
        assets: [
          asset("macos", "arm64", { url: "https://evil.example/x.tar.gz" }),
        ],
      }),
    ).toBeNull();
  });

  it("is null for anything that is not an object", () => {
    for (const junk of [null, undefined, "stable", 42, true, []])
      expect(normalizeBuild(junk)).toBeNull();
  });
});

describe("hostile catalog input", () => {
  const withAssets = (assets: unknown[]) =>
    normalizeCatalog({ stable: { version: "1.0.0", assets } });

  it("drops an asset that is not an object at all", () => {
    expect(
      withAssets([null, "x", 7, ["a"], asset("macos", "arm64")])!.assets,
    ).toHaveLength(1);
  });

  it("drops an asset whose url is not a string", () => {
    expect(withAssets([asset("macos", "arm64", { url: 42 })])).toBeNull();
    expect(withAssets([asset("macos", "arm64", { url: null })])).toBeNull();
  });

  it("drops an absurdly long url rather than putting it in an href", () => {
    const long = `https://raw.githubusercontent.com/${"a".repeat(2100)}.tar.gz`;
    expect(withAssets([asset("macos", "arm64", { url: long })])).toBeNull();
  });

  it("ignores an assets field that is not an array", () => {
    expect(
      normalizeCatalog({ stable: { version: "1.0.0", assets: "lots" } }),
    ).toBeNull();
  });

  it("ignores a channel that is not an object", () => {
    expect(normalizeCatalog({ stable: "yes please" })).toBeNull();
    expect(normalizeCatalog({ stable: null })).toBeNull();
  });
});

describe("raw binary beside the archive (binaryUrl pair)", () => {
  const win = () =>
    asset("win", "x64", {
      binaryUrl: `${BASE}/growther-c5-win-x64-v2026.8.13-v42.exe`,
      binaryFilename: "growther-c5-win-x64-v2026.8.13-v42.exe",
      binarySha256: "B".repeat(64),
      binarySizeBytes: 70_123_456,
    });
  const catalog = (a: unknown) => ({
    stable: { version: "2026.8.13-v42", assets: [a] },
  });

  it("carries a valid pair through, normalising the digest like sha256", () => {
    const b = normalizeCatalog(catalog(win()))!;
    const a = b.assets[0]!;
    expect(a.binaryUrl).toBe(`${BASE}/growther-c5-win-x64-v2026.8.13-v42.exe`);
    expect(a.binaryFilename).toBe("growther-c5-win-x64-v2026.8.13-v42.exe");
    expect(a.binarySha256).toBe("b".repeat(64));
    expect(a.binarySizeBytes).toBe(70_123_456);
    // The archive is untouched — it stays what the updater consumes.
    expect(a.url).toBe(`${BASE}/growther-node22-win-x64.tar.gz`);
  });

  it("drops a HALF pair rather than keeping a filename with no download", () => {
    const a = normalizeCatalog(
      catalog(
        asset("win", "x64", {
          binaryFilename: "growther-c5-win-x64.exe", // no binaryUrl
        }),
      ),
    )!.assets[0]!;
    expect(a.binaryUrl).toBeUndefined();
    expect(a.binaryFilename).toBeUndefined();
  });

  it("refuses an off-host binaryUrl while keeping the archive usable", () => {
    const a = normalizeCatalog(catalog(win()))!.assets[0]!;
    const evil = normalizeCatalog(
      catalog(
        asset("win", "x64", {
          binaryUrl: "https://evil.example/growther-c5-win-x64.exe",
          binaryFilename: "growther-c5-win-x64.exe",
        }),
      ),
    )!.assets[0]!;
    expect(a.binaryUrl).toBeDefined();
    expect(evil.binaryUrl).toBeUndefined();
    expect(evil.url).toBe(`${BASE}/growther-node22-win-x64.tar.gz`);
  });

  it("blanks a bad binary digest or size instead of failing the asset", () => {
    const a = normalizeCatalog(
      catalog(
        asset("win", "x64", {
          binaryUrl: `${BASE}/growther-c5-win-x64.exe`,
          binaryFilename: "growther-c5-win-x64.exe",
          binarySha256: "not-a-digest",
          binarySizeBytes: -5,
        }),
      ),
    )!.assets[0]!;
    expect(a.binaryUrl).toBeDefined();
    expect(a.binarySha256).toBe("");
    expect(a.binarySizeBytes).toBe(0);
  });

  it("is absent — not null, not empty — when the catalog has no raw binary", () => {
    const a = normalizeCatalog(catalog(asset("macos", "arm64")))!.assets[0]!;
    expect("binaryUrl" in a).toBe(false);
  });
});

/**
 * An arch fallback must not offer a .pkg.
 *
 * Installer honours `hostArchitectures` from the package's Distribution file
 * and declines a mismatch QUIETLY — no payload written, no receipt recorded,
 * and the window still reads as a completed install. An x64 package handed to
 * an Apple Silicon Mac therefore looks like it worked and does nothing, which
 * was mistaken for a broken package once already. The raw executable is a
 * legitimate fallback because Rosetta runs it; the installer is not.
 */
describe("pickAsset — an other-arch fallback keeps the archive, drops the installer", () => {
  const mac = (arch: "arm64" | "x64") => ({
    os: "macos" as const,
    arch,
    filename: `growther-node22-macos-${arch}.tar.gz`,
    url: `https://github.com/GrowtherSI/release/releases/download/v1/growther-node22-macos-${arch}.tar.gz`,
    sha256: "",
    sizeBytes: 0,
    installerUrl: `https://github.com/GrowtherSI/release/releases/download/v1/growther-c5-1-${arch}.pkg`,
    installerFilename: `growther-c5-1-${arch}.pkg`,
    installerSha256: "b".repeat(64),
    installerSizeBytes: 1,
  });
  const build = (assets: ReturnType<typeof mac>[]) => ({
    channel: "stable",
    version: "1",
    releasedAt: "",
    assets,
  });

  it("an exact arch match keeps its installer", () => {
    const got = pickAsset(build([mac("arm64"), mac("x64")]), {
      os: "macos",
      arch: "arm64",
      label: "macOS",
    });
    expect(got?.arch).toBe("arm64");
    expect(got?.installerFilename).toBe("growther-c5-1-arm64.pkg");
  });

  it("Apple Silicon offered only an x64 build gets the archive, NOT the x64 .pkg", () => {
    const got = pickAsset(build([mac("x64")]), {
      os: "macos",
      arch: "arm64",
      label: "macOS",
    });
    expect(got?.arch).toBe("x64");
    expect(got?.filename).toMatch(/\.tar\.gz$/);
    expect(
      got?.installerUrl,
      "a wrong-arch .pkg installs nothing and reports success",
    ).toBeUndefined();
    expect(got?.installerFilename).toBeUndefined();
  });

  it("still returns null when there is nothing for the OS at all", () => {
    expect(
      pickAsset(build([]), { os: "macos", arch: "arm64", label: "macOS" }),
    ).toBeNull();
  });
});
