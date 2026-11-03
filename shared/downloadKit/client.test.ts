// @vitest-environment jsdom
/**
 * ── SHARED DOWNLOAD KIT ── v1.10.5 ────────────────────────────────────────────
 * Test for the mirrored kit — it runs in BOTH growther-marketing and
 * growther-docs. Edit the canonical copy (growther-marketing) and run
 * `npm run sync:download-kit`; see ./README.md.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cachedRelease,
  cachedVersion,
  configureDownloadKit,
  currentPlatform,
  DOWNLOAD_STARTED_EVENT,
  DOWNLOAD_UNAVAILABLE_EVENT,
  requestDownload,
  type DownloadStartedDetail,
  resolveCurrentDownload,
  warmRelease,
  _resetDownloadKit,
  type DownloadUnavailableDetail,
  downloadDetailsFor,
  downloadTargetFor,
  postDownloadSteps,
  runInstruction,
  verifySteps,
  installerTargetFor,
} from "./client";

const BASE =
  "https://raw.githubusercontent.com/GrowtherSI/release/main/dist/c5/v2026.8.13-v42";

/**
 * What a WORKER serves at /v1/version: one channel, already validated and
 * flattened. NOT the channel-keyed catalog the release pipeline publishes —
 * feeding this the wrong parser is what made every button fall through to the
 * modal, so the fixture here is deliberately the real wire shape. The seam test
 * (src-worker/version-seam.test.ts) proves this fixture matches what the Worker
 * actually returns.
 */
const RELEASE = {
  version: "2026.8.13-v42",
  channel: "stable",
  releasedAt: "2026-08-13T14:22:05.000Z",
  downloads: {
    "macos-arm64": `${BASE}/growther-node22-macos-arm64.tar.gz`,
    "linux-x64": `${BASE}/growther-node22-linux-x64.tar.gz`,
  },
  assets: [
    {
      os: "macos",
      arch: "arm64",
      filename: "growther-node22-macos-arm64.tar.gz",
      url: `${BASE}/growther-node22-macos-arm64.tar.gz`,
      sha256: "a".repeat(64),
      sizeBytes: 68_419_584,
    },
    {
      os: "linux",
      arch: "x64",
      filename: "growther-node22-linux-x64.tar.gz",
      url: `${BASE}/growther-node22-linux-x64.tar.gz`,
      sha256: "b".repeat(64),
      sizeBytes: 70_000_000,
    },
  ],
};

/** Both macOS architectures published, so an `arch` override has something to
 *  prefer over what detection would have picked. */
const RELEASE_BOTH_MACS = {
  ...RELEASE,
  assets: [
    ...RELEASE.assets,
    {
      os: "macos",
      arch: "x64",
      filename: "growther-node22-macos-x64.tar.gz",
      url: `${BASE}/growther-node22-macos-x64.tar.gz`,
      sha256: "c".repeat(64),
      sizeBytes: 71_000_000,
    },
  ],
};

const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";

function setUA(ua: string) {
  Object.defineProperty(navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

/** Records the href of any anchor the kit clicks, instead of navigating. */
function captureClicks(): string[] {
  const seen: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    seen.push(this.href);
  });
  return seen;
}

/** Collects every unavailable announcement for assertions. */
function captureMisses(): DownloadUnavailableDetail[] {
  const seen: DownloadUnavailableDetail[] = [];
  window.addEventListener(DOWNLOAD_UNAVAILABLE_EVENT, (e) => {
    seen.push((e as CustomEvent<DownloadUnavailableDetail>).detail);
  });
  return seen;
}

const okFetch = (body: unknown, status = 200) =>
  vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;

describe("download kit client", () => {
  beforeEach(() => {
    _resetDownloadKit();
    setUA(MAC_UA);
  });
  afterEach(() => vi.restoreAllMocks());

  it("announces the started download — file, hash, steps — so the gate can show 'now what'", async () => {
    configureDownloadKit({ fetchFn: okFetch(RELEASE) });
    const seen: DownloadStartedDetail[] = [];
    const onStart = (e: Event) =>
      seen.push((e as CustomEvent<DownloadStartedDetail>).detail);
    window.addEventListener(DOWNLOAD_STARTED_EVENT, onStart);
    try {
      await expect(requestDownload({ story: "hero" })).resolves.toBe(
        "download",
      );
    } finally {
      window.removeEventListener(DOWNLOAD_STARTED_EVENT, onStart);
    }
    expect(seen).toHaveLength(1);
    const d = seen[0]!;
    expect(d.filename).toBe(d.asset.binaryFilename ?? d.asset.filename);
    expect(d.url).toBe(d.asset.binaryUrl ?? d.asset.url);
    expect(d.source).toBe("hero");
    expect(Array.isArray(d.steps)).toBe(true);
    expect(Array.isArray(d.verify)).toBe(true);
    expect(typeof d.run.text).toBe("string");
    if (d.asset.binaryUrl)
      expect(d.sha256Url).toBe(`${d.asset.binaryUrl}.sha256`);
  });

  it("a CLICK revalidates: a tab opened before a release hands over the NEW one", async () => {
    // Page loaded on v42 …
    const calls: RequestInit[] = [];
    let body: unknown = RELEASE;
    const fetchFn = vi.fn(async (_u: unknown, init?: RequestInit) => {
      calls.push(init ?? {});
      return { ok: true, json: async () => body } as Response;
    });
    configureDownloadKit({ fetchFn: fetchFn as unknown as typeof fetch });
    await warmRelease();
    expect(cachedVersion()).toBe("2026.8.13-v42");
    // … then v43 is published while the tab sits there.
    body = { ...RELEASE, version: "2026.8.14-v43" };
    const clicks = captureClicks();
    await requestDownload({ story: "hero" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(calls[1]!.cache).toBe("no-cache");
    expect(cachedVersion()).toBe("2026.8.14-v43");
    expect(clicks).toHaveLength(1);
  });

  it("a click whose revalidation FAILS falls back to the cached catalog, never a false miss", async () => {
    let fail = false;
    const fetchFn = vi.fn(async () => {
      if (fail) throw new Error("offline");
      return { ok: true, json: async () => RELEASE } as Response;
    });
    configureDownloadKit({ fetchFn: fetchFn as unknown as typeof fetch });
    await warmRelease();
    fail = true;
    const clicks = captureClicks();
    await expect(requestDownload()).resolves.toBe("download");
    expect(clicks).toHaveLength(1);
    expect(cachedVersion()).toBe("2026.8.13-v42");
  });

  it("a warm within the TTL reuses the catalog; after the TTL it refetches", async () => {
    const fetchFn = okFetch(RELEASE);
    configureDownloadKit({ fetchFn });
    await warmRelease();
    await warmRelease();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 61_000);
      await warmRelease();
      expect(fetchFn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fetches the catalog once, however many buttons ask", async () => {
    const fetchFn = okFetch(RELEASE);
    configureDownloadKit({ fetchFn });
    await Promise.all([warmRelease(), warmRelease(), warmRelease()]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(cachedVersion()).toBe("2026.8.13-v42");
    expect(cachedRelease()?.assets).toHaveLength(2);
  });

  it("starts the build for the detected platform", async () => {
    const clicks = captureClicks();
    configureDownloadKit({ fetchFn: okFetch(RELEASE) });
    await expect(requestDownload({ story: "fleet" })).resolves.toBe("download");
    expect(clicks).toEqual([`${BASE}/growther-node22-macos-arm64.tar.gz`]);
  });

  it("reports the click to analytics before it knows the outcome", async () => {
    const track = vi.fn();
    captureClicks();
    configureDownloadKit({ fetchFn: okFetch(RELEASE), track });
    await requestDownload({ story: "day" });
    expect(track).toHaveBeenCalledWith({
      name: "download_clicked",
      os: "macOS",
      story: "day",
    });
  });

  it("honours an explicit per-OS button over detection", async () => {
    const clicks = captureClicks();
    configureDownloadKit({ fetchFn: okFetch(RELEASE) });
    await requestDownload({ os: "linux" });
    expect(clicks).toEqual([`${BASE}/growther-node22-linux-x64.tar.gz`]);
  });

  it("announces a miss instead of downloading when the OS has no build", async () => {
    const clicks = captureClicks();
    const misses = captureMisses();
    configureDownloadKit({ fetchFn: okFetch(RELEASE) });
    await expect(requestDownload({ os: "win", story: "org" })).resolves.toBe(
      "modal",
    );
    expect(clicks).toEqual([]);
    expect(misses).toHaveLength(1);
    expect(misses[0]!.reason).toBe("no-build");
    expect(misses[0]!.source).toBe("org");
  });

  it("announces a miss when there is no catalog at all", async () => {
    const misses = captureMisses();
    configureDownloadKit({ fetchFn: okFetch({}, 404) });
    await expect(requestDownload()).resolves.toBe("modal");
    expect(misses[0]!.reason).toBe("no-catalog");
  });

  it("announces a miss when the catalog fetch throws", async () => {
    const misses = captureMisses();
    configureDownloadKit({
      fetchFn: vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });
    await expect(requestDownload()).resolves.toBe("modal");
    expect(misses[0]!.reason).toBe("no-catalog");
  });

  /** A phone visitor must never be handed a desktop tarball. */
  it("announces an unsupported device rather than guessing a build for it", async () => {
    setUA(IPHONE_UA);
    const clicks = captureClicks();
    const misses = captureMisses();
    configureDownloadKit({ fetchFn: okFetch(RELEASE) });
    await requestDownload();
    expect(clicks).toEqual([]);
    expect(misses[0]!.reason).toBe("unsupported-platform");
    expect(misses[0]!.platform.label).toBeNull();
  });

  /** A hanging catalog fetch must not hang the button. */
  it("gives up waiting and offers the modal, without cancelling the fetch", async () => {
    vi.useFakeTimers();
    let release!: (r: Response) => void;
    const fetchFn = vi.fn(
      () => new Promise<Response>((res) => (release = res)),
    ) as unknown as typeof fetch;
    configureDownloadKit({ fetchFn, timeoutMs: 50 });

    const misses = captureMisses();
    const pending = requestDownload();
    await vi.advanceTimersByTimeAsync(60);
    await expect(pending).resolves.toBe("modal");
    expect(misses[0]!.reason).toBe("no-catalog");

    // The in-flight fetch still lands, so the NEXT click gets the real answer.
    release(new Response(JSON.stringify(RELEASE), { status: 200 }));
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    expect(cachedVersion()).toBe("2026.8.13-v42");
  });

  /** The click is the intent; whether we had a binary is a separate fact. A
   *  Download button that reported nothing on a miss would hide exactly the
   *  demand this feature exists to measure. */
  it("reports the click to analytics on a miss too", async () => {
    const track = vi.fn();
    configureDownloadKit({ fetchFn: okFetch({}, 404), track });
    await expect(requestDownload({ story: "org" })).resolves.toBe("modal");
    expect(track).toHaveBeenCalledWith({
      name: "download_clicked",
      os: "macOS",
      story: "org",
    });
  });

  it("every click revalidates, and clicks in flight together share ONE fetch", async () => {
    // 1.7.0: a click is never answered from a catalog fetched earlier in the
    // page's life (that is the "refresh to see the new version" bug). Three
    // sequential clicks = three revalidations; three simultaneous ones = one.
    const clicks = captureClicks();
    const fetchFn = okFetch(RELEASE);
    configureDownloadKit({ fetchFn });
    await requestDownload();
    await requestDownload();
    await requestDownload();
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(clicks).toHaveLength(3);
    vi.mocked(fetchFn).mockClear();
    await Promise.all([
      requestDownload(),
      requestDownload(),
      requestDownload(),
    ]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(clicks).toHaveLength(6);
  });

  /** Chromium's high-entropy hint is the only thing that can tell an Intel Mac
   *  from an Apple Silicon one; without it the default (arm64) would send an
   *  Intel visitor a binary their machine cannot run. */
  it("uses the browser's architecture hint when it arrives", async () => {
    const both = {
      ...RELEASE,
      assets: [
        RELEASE.assets[0]!,
        {
          ...RELEASE.assets[0]!,
          arch: "x64",
          filename: "growther-node22-macos-x64.tar.gz",
          url: `${BASE}/growther-node22-macos-x64.tar.gz`,
        },
      ],
    };
    Object.defineProperty(navigator, "userAgentData", {
      value: { getHighEntropyValues: async () => ({ architecture: "x86" }) },
      configurable: true,
    });
    const clicks = captureClicks();
    configureDownloadKit({ fetchFn: okFetch(both) });
    await warmRelease();
    await requestDownload();
    expect(clicks).toEqual([`${BASE}/growther-node22-macos-x64.tar.gz`]);
    Reflect.deleteProperty(navigator as object, "userAgentData");
  });

  /** A browser that refuses the hint (or has none) must not break the click. */
  it("survives a browser that will not answer the architecture question", async () => {
    Object.defineProperty(navigator, "userAgentData", {
      value: {
        getHighEntropyValues: async () => {
          throw new Error("nope");
        },
      },
      configurable: true,
    });
    const clicks = captureClicks();
    configureDownloadKit({ fetchFn: okFetch(RELEASE) });
    await expect(requestDownload()).resolves.toBe("download");
    expect(clicks).toEqual([`${BASE}/growther-node22-macos-arm64.tar.gz`]);
    Reflect.deleteProperty(navigator as object, "userAgentData");
  });

  it("reads the platform label a button can display", () => {
    expect(currentPlatform().label).toBe("macOS");
    expect(currentPlatform("win").os).toBe("win");
  });

  /**
   * A surface that NAMES the build it offers — the docs download table has a
   * row per triple — must get that build and not a detected one. Without this,
   * clicking the "macOS · Intel" row on an Apple-silicon Mac fetches the arm64
   * .pkg, which Installer then refuses QUIETLY: no payload, no receipt, and a
   * window that still reads as a completed install.
   */
  it("honours an explicit arch over detection", async () => {
    const clicks = captureClicks();
    configureDownloadKit({ fetchFn: okFetch(RELEASE_BOTH_MACS) });
    await expect(requestDownload({ os: "macos", arch: "x64" })).resolves.toBe(
      "download",
    );
    expect(clicks).toEqual([`${BASE}/growther-node22-macos-x64.tar.gz`]);
  });

  it("still detects the arch when a button names only the OS", async () => {
    const clicks = captureClicks();
    configureDownloadKit({ fetchFn: okFetch(RELEASE_BOTH_MACS) });
    await requestDownload({ os: "macos" });
    expect(clicks).toEqual([`${BASE}/growther-node22-macos-arm64.tar.gz`]);
  });

  it("reports an explicit arch on the platform it resolves against", async () => {
    expect(currentPlatform("macos", "x64").arch).toBe("x64");
    // Nothing stated: this UA volunteers no architecture, and the kit says so
    // rather than inventing one — pickAsset applies its own per-OS default.
    expect(currentPlatform().arch).toBe(null);
    configureDownloadKit({ fetchFn: okFetch(RELEASE_BOTH_MACS) });
    const r = await resolveCurrentDownload("macos", "x64");
    expect(r.status).toBe("ready");
    if (r.status === "ready") expect(r.asset.arch).toBe("x64");
  });

  it("resolves without side effects for UI that asks before the click", async () => {
    const clicks = captureClicks();
    configureDownloadKit({ fetchFn: okFetch(RELEASE) });
    const r = await resolveCurrentDownload();
    expect(r.status).toBe("ready");
    if (r.status === "ready")
      expect(r.asset.filename).toBe("growther-node22-macos-arm64.tar.gz");
    // Nothing downloaded, nothing announced — it only answers the question.
    expect(clicks).toEqual([]);
  });
});

describe("downloadTargetFor — which file a click fetches", () => {
  const base = (os: "win" | "macos" | "linux", arch: "x64" | "arm64") => ({
    os,
    arch,
    filename: `growther-node22-${os}-${arch}.${os === "win" ? "zip" : "tar.gz"}`,
    url: `${BASE}/growther-node22-${os}-${arch}.${os === "win" ? "zip" : "tar.gz"}`,
    sha256: "",
    sizeBytes: 0,
  });
  const raw = {
    binaryUrl: `${BASE}/growther-c5-win-x64-v1.exe`,
    binaryFilename: "growther-c5-win-x64-v1.exe",
  };

  it("Windows with a raw .exe published gets the .exe — icon in the PE, no exec bit to lose", () => {
    expect(downloadTargetFor({ ...base("win", "x64"), ...raw })).toEqual({
      url: raw.binaryUrl,
      filename: raw.binaryFilename,
    });
  });

  it("Windows without one still gets the zip", () => {
    const a = base("win", "x64");
    expect(downloadTargetFor(a)).toEqual({ url: a.url, filename: a.filename });
  });

  it("macOS: ONE run line (ditto + unquarantine + start); checks are separate and optional", () => {
    const a = {
      ...base("macos", "arm64"),
      binaryUrl: `${BASE}/growther-c5-macos-arm64-v2026.9.3-v239.zip`,
      binaryFilename: "growther-c5-macos-arm64-v2026.9.3-v239.zip",
      binaryEntry: "growther-c5-macos-arm64-v2026_9_3-v239",
    };
    expect(downloadTargetFor(a)).toEqual({
      url: a.binaryUrl,
      filename: a.binaryFilename,
    });
    const run = runInstruction(a);
    expect(run.text).toMatch(/installs itself/);
    expect(run.command).toContain(
      "ditto -x -k growther-c5-macos-arm64-v2026.9.3-v239.zip",
    );
    expect(run.command).toContain(
      "xattr -d com.apple.quarantine growther-c5-macos-arm64-v2026.9.3-v239/growther-c5-macos-arm64-v2026_9_3-v239",
    );
    expect(run.command).toMatch(
      /; growther-c5-macos-arm64-v2026\.9\.3-v239\/growther-c5-macos-arm64-v2026_9_3-v239$/,
    );
    const verify = verifySteps(a);
    expect(verify).toHaveLength(1); // no catalog hash → only the sidecar check
    expect(verify[0]).toContain(
      "shasum -a 256 -c growther-c5-macos-arm64-v2026_9_3-v239.sha256",
    );
    expect(postDownloadSteps(base("macos", "arm64"))).toEqual([]);
    expect(runInstruction(base("macos", "arm64")).command).toBeUndefined();
  });

  it("derives the entry from the zip name when the catalog lacks binaryEntry — underscored on macOS/Linux, .exe on Windows", () => {
    const mac = verifySteps({
      ...base("macos", "arm64"),
      binaryUrl: `${BASE}/growther-c5-macos-arm64-v2026.9.3-v239.zip`,
      binaryFilename: "growther-c5-macos-arm64-v2026.9.3-v239.zip",
    });
    expect(mac[0]).toContain(
      "cd growther-c5-macos-arm64-v2026.9.3-v239 && shasum -a 256 -c growther-c5-macos-arm64-v2026_9_3-v239.sha256",
    );
    const win = runInstruction({
      ...base("win", "x64"),
      binaryUrl: `${BASE}/growther-c5-win-x64-v2026.9.3-v239.zip`,
      binaryFilename: "growther-c5-win-x64-v2026.9.3-v239.zip",
    });
    expect(win.command).toBeUndefined(); // a double-click, in words
    expect(win.text).toContain(
      "double-click growther-c5-win-x64-v2026.9.3-v239.exe",
    );
    expect(win.text).toContain("Extract All");
  });

  it("with a catalog hash the FIRST check verifies the ZIP — shasum on macOS, sha256sum on Linux, Get-FileHash on Windows", () => {
    const sha = "a".repeat(64);
    const mac = verifySteps({
      ...base("macos", "arm64"),
      binaryUrl: `${BASE}/growther-c5-macos-arm64-v2026.9.3-v239.zip`,
      binaryFilename: "growther-c5-macos-arm64-v2026.9.3-v239.zip",
      binarySha256: sha,
    });
    expect(mac).toHaveLength(2);
    expect(mac[0]).toBe(
      `echo "${sha}  $HOME/Downloads/growther-c5-macos-arm64-v2026.9.3-v239.zip" | shasum -a 256 -c`,
    );
    const linux = verifySteps({
      ...base("linux", "x64"),
      binaryUrl: `${BASE}/growther-c5-linux-x64-v2026.9.3-v239.zip`,
      binaryFilename: "growther-c5-linux-x64-v2026.9.3-v239.zip",
      binarySha256: sha,
    });
    expect(linux).toHaveLength(2);
    expect(linux[0]).toContain("sha256sum -c");
    const win = verifySteps({
      ...base("win", "x64"),
      binaryUrl: `${BASE}/growther-c5-win-x64-v2026.9.3-v239.zip`,
      binaryFilename: "growther-c5-win-x64-v2026.9.3-v239.zip",
      binarySha256: sha,
    });
    expect(win).toHaveLength(2);
    expect(win[0]).toContain("Get-FileHash");
    expect(win[0]).toContain(sha);
    // The deprecated shape still exists for hosts that read it: checks, then run.
    const legacy = postDownloadSteps({
      ...base("linux", "x64"),
      binaryUrl: `${BASE}/growther-c5-linux-x64-v2026.9.3-v239.zip`,
      binaryFilename: "growther-c5-linux-x64-v2026.9.3-v239.zip",
      binarySha256: sha,
    });
    expect(legacy).toHaveLength(3);
    expect(legacy[2]).toMatch(
      /&& growther-c5-linux-x64-v2026\.9\.3-v239\/growther-c5-linux-x64-v2026_9_3-v239$/,
    );
  });

  it("Linux likewise — one run line with unzip + chmod, no quarantine anywhere", () => {
    const a = {
      ...base("linux", "x64"),
      binaryUrl: `${BASE}/growther-c5-linux-x64-v2026.9.3-v239.zip`,
      binaryFilename: "growther-c5-linux-x64-v2026.9.3-v239.zip",
      binaryEntry: "growther-c5-linux-x64-v2026_9_3-v239",
    };
    expect(downloadTargetFor(a).url).toBe(a.binaryUrl);
    const run = runInstruction(a);
    expect(run.command).toContain(
      "unzip -oq growther-c5-linux-x64-v2026.9.3-v239.zip && chmod +x",
    );
    expect(run.command).not.toContain("quarantine");
    expect(verifySteps(a).join("\n")).not.toContain("quarantine");
  });
});

/**
 * macOS takes the INSTALLER when the catalog carries one.
 *
 * The raw download cannot work on macOS no matter how well it is signed: a bare
 * executable double-clicked in Finder is assessed as a DOCUMENT, so
 * `spctl -a -t open` in its default context answers "source=Insufficient
 * Context" and never reaches the signature — measured on the fully notarized
 * v2026.9.12-v277 binary. The .pkg is the only artifact a person can
 * double-click, and being stapled it opens offline too.
 */
describe("downloadTargetFor — macOS prefers the signed installer", () => {
  const macBase = {
    os: "macos" as const,
    arch: "arm64" as const,
    filename: "growther-node22-macos-arm64.tar.gz",
    url: `${BASE}/growther-node22-macos-arm64.tar.gz`,
    sha256: "",
    sizeBytes: 0,
  };
  const rawZip = {
    binaryUrl: `${BASE}/growther-c5-macos-arm64-v2026.9.12-v278.zip`,
    binaryFilename: "growther-c5-macos-arm64-v2026.9.12-v278.zip",
    binaryEntry: "growther-c5-macos-arm64-v2026_9_12-v278",
  };
  const pkg = {
    installerUrl: `${BASE}/growther-c5-2026.9.12-v278-arm64.pkg`,
    installerFilename: "growther-c5-2026.9.12-v278-arm64.pkg",
    installerSha256: "a".repeat(64),
    installerSizeBytes: 74_000_000,
  };

  it("beats BOTH the raw binary and the archive", () => {
    expect(downloadTargetFor({ ...macBase, ...rawZip, ...pkg })).toEqual({
      url: pkg.installerUrl,
      filename: pkg.installerFilename,
    });
  });

  it("falls back to the raw zip when the release signed no package", () => {
    // A release built without the Developer ID Installer certificate names its
    // output `…-unsigned.pkg`, which the pipeline refuses to advertise — so the
    // fields are absent rather than pointing at something Gatekeeper blocks.
    expect(downloadTargetFor({ ...macBase, ...rawZip })).toEqual({
      url: rawZip.binaryUrl,
      filename: rawZip.binaryFilename,
    });
  });

  it("is a PAIR — a URL with no filename is not a download", () => {
    const halfA = { ...macBase, installerUrl: pkg.installerUrl };
    const halfB = { ...macBase, installerFilename: pkg.installerFilename };
    expect(installerTargetFor(halfA)).toBeNull();
    expect(installerTargetFor(halfB)).toBeNull();
    expect(downloadTargetFor(halfA)).toEqual({
      url: macBase.url,
      filename: macBase.filename,
    });
  });

  /**
   * The hash and the size have to describe the file the link points at. Any
   * surface that shows all three together — the docs download table prints a
   * filename, a size and a SHA-256 in one row — mixes files the moment this
   * decision is made twice.
   */
  it("carries the hash and size of the file it picked, not the archive's", () => {
    const full = {
      ...macBase,
      ...rawZip,
      ...pkg,
      binarySha256: "b".repeat(64),
    };
    expect(downloadDetailsFor(full)).toEqual({
      kind: "installer",
      url: pkg.installerUrl,
      filename: pkg.installerFilename,
      sha256: pkg.installerSha256,
      sizeBytes: pkg.installerSizeBytes,
      // Signed and stapled: Installer does the real check, and no sidecar is
      // published, so offering one would be offering a 404.
      sha256Url: null,
    });

    const zipOnly = {
      ...macBase,
      ...rawZip,
      binarySha256: "b".repeat(64),
      binarySizeBytes: 76_000_000,
    };
    expect(downloadDetailsFor(zipOnly)).toEqual({
      kind: "binary",
      url: rawZip.binaryUrl,
      filename: rawZip.binaryFilename,
      sha256: "b".repeat(64),
      sizeBytes: 76_000_000,
      sha256Url: `${rawZip.binaryUrl}.sha256`,
    });

    const archiveOnly = {
      ...macBase,
      sha256: "c".repeat(64),
      sizeBytes: 68_000_000,
    };
    expect(downloadDetailsFor(archiveOnly)).toEqual({
      kind: "archive",
      url: macBase.url,
      filename: macBase.filename,
      sha256: "c".repeat(64),
      sizeBytes: 68_000_000,
      sha256Url: null,
    });
  });

  it("agrees with downloadTargetFor about which file that is", () => {
    for (const a of [
      { ...macBase, ...rawZip, ...pkg },
      { ...macBase, ...rawZip },
      macBase,
    ]) {
      const { url, filename } = downloadDetailsFor(a);
      expect({ url, filename }).toEqual(downloadTargetFor(a));
    }
  });

  it("never displaces the archive on Linux or Windows", () => {
    // installerUrl is macOS-only by construction, but the rule is asserted here
    // rather than assumed, because the catalog is data we do not control.
    for (const os of ["linux", "win"] as const) {
      const a = {
        ...macBase,
        os,
        filename: "growther-node22-x.tar.gz",
        url: `${BASE}/growther-node22-x.tar.gz`,
      };
      expect(downloadTargetFor(a)).toEqual({
        url: a.url,
        filename: a.filename,
      });
    }
  });

  it("tells a person to double-click, and offers the signature check — no unzip, no unquarantine", () => {
    const a = { ...macBase, ...rawZip, ...pkg };
    const run = runInstruction(a);
    expect(run.text).toMatch(/[Dd]ouble-click/);
    expect(
      run.command,
      "a .pkg is a GUI flow, not a shell one",
    ).toBeUndefined();
    const steps = postDownloadSteps(a);
    expect(steps).toEqual([
      `pkgutil --check-signature ~/Downloads/${pkg.installerFilename}`,
    ]);
    for (const s of steps) {
      expect(s).not.toMatch(/xattr|ditto|unzip/);
    }
  });
});
