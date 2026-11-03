/**
 * ── SHARED DOWNLOAD KIT ── v1.10.5 ────────────────────────────────────────────
 * The pairing contract, enforced. This test runs in BOTH growther-marketing and
 * growther-docs (it is part of the mirrored directory), so each repo proves its
 * own copy is intact and correctly labelled without being able to see the other.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The three things a future agent needs to be true, and would otherwise have to
 * take on trust:
 *   1. every file here is listed in MANIFEST.sha256 and matches its hash
 *      (byte-identity with the canonical copy — see scripts/check-download-kit.mjs)
 *   2. every file carries the header naming this directory as one half of a
 *      pair, so you cannot open one in isolation and not know
 *   3. the version in VERSION.ts, the headers and README.md agree
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DOWNLOAD_KIT_VERSION } from "./VERSION";

const KIT = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = "MANIFEST.sha256";

const files = fs
  .readdirSync(KIT)
  .filter((f) => f !== MANIFEST)
  .sort();

describe("download kit pairing contract", () => {
  it("ships the reference a future agent needs, in the directory itself", () => {
    expect(files).toContain("README.md");
    expect(files).toContain("VERSION.ts");
    expect(fs.existsSync(path.join(KIT, MANIFEST))).toBe(true);
  });

  /** The machine half: same check CI runs, as a test, in both repos. */
  it("matches MANIFEST.sha256 byte for byte", () => {
    const manifest = fs.readFileSync(path.join(KIT, MANIFEST), "utf8");
    const listed = new Map<string, string>();
    for (const line of manifest.split("\n")) {
      if (!line.trim()) continue;
      const [hash, ...rest] = line.split(/\s+/);
      listed.set(rest.join(" "), hash!);
    }

    expect([...listed.keys()].sort()).toEqual(
      files.filter((f) => f !== MANIFEST),
    );
    for (const [name, hash] of listed) {
      const actual = crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(KIT, name)))
        .digest("hex");
      expect(actual, `${name} differs from the manifest`).toBe(hash);
    }
  });

  it("labels every source file as one half of a mirrored pair", () => {
    for (const name of files.filter(
      (f) => f.endsWith(".ts") || f.endsWith(".tsx"),
    )) {
      const head = fs.readFileSync(path.join(KIT, name), "utf8").slice(0, 700);
      expect(head, `${name} is missing the kit header`).toContain(
        "SHARED DOWNLOAD KIT",
      );
      expect(head, `${name} does not carry the kit version`).toContain(
        DOWNLOAD_KIT_VERSION,
      );
    }
  });

  it("keeps the version in VERSION.ts, the headers and README.md in agreement", () => {
    const readme = fs.readFileSync(path.join(KIT, "README.md"), "utf8");
    expect(readme.split("\n")[0]).toContain(DOWNLOAD_KIT_VERSION);
    const version = fs.readFileSync(path.join(KIT, "VERSION.ts"), "utf8");
    // A bumped constant with no changelog line is a bump nobody can read.
    expect(version).toContain(`${DOWNLOAD_KIT_VERSION}  `);
    expect(DOWNLOAD_KIT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  /**
   * The kit must not reach into either host: that is what makes it copyable.
   *
   * The allowlist is short on purpose. `react` and the two testing-library
   * packages are on it because BOTH repos carry them at the same major
   * (package.json in each) — anything else, and most of all a `../src/…` path,
   * would resolve in the canonical repo and break in the mirror, which is the
   * failure this whole pairing exists to prevent.
   */
  it("imports nothing its mirror cannot resolve", () => {
    for (const name of files.filter(
      (f) => f.endsWith(".ts") || f.endsWith(".tsx"),
    )) {
      // Comments are stripped first: this file's own prose contains the word
      // `from "…"`, and a regex that cannot tell code from a sentence would
      // fail on documentation.
      const src = fs
        .readFileSync(path.join(KIT, name), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const m of src.matchAll(
        /^\s*(?:import|export)\b[^;]*?\bfrom\s+"([^"]+)"/gm,
      )) {
        const spec = m[1]!;
        const shared = [
          "react",
          "vitest",
          "@testing-library/react",
          "@testing-library/dom",
        ];
        const ok =
          spec.startsWith("./") ||
          shared.includes(spec) ||
          spec.startsWith("node:");
        expect(
          ok,
          `${name} imports ${spec}, which the mirror cannot resolve`,
        ).toBe(true);
      }
    }
  });
});
