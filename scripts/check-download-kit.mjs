#!/usr/bin/env node
/**
 * Verify shared/downloadKit against its committed MANIFEST.sha256.
 *
 * Ported from growther-docs/scripts/check-download-kit.mjs, which verifies the
 * same kit the same way; this repository carries only the download kit.
 *
 * Why a manifest and not a diff: the canonical copy lives in another
 * repository (growther-marketing), so no job here can see it. The checked-in
 * hash list turns "this copy matches the canonical one" into something this
 * repository can prove alone. A mismatch means exactly one thing: these files
 * were changed somewhere other than the canonical copy.
 *
 * The accident this catches: lint-staged runs `prettier --write` over staged
 * files. .prettierignore excludes the kit, but if that ever slips, a file is
 * silently reformatted on commit: same behaviour, different bytes.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.resolve(HERE, "..", "shared", "downloadKit");
const MANIFEST = path.join(KIT, "MANIFEST.sha256");
const FIX =
  "Do not edit this copy: change growther-marketing/shared/downloadKit/ and copy it over this directory.";

function kitFiles(dir, rel = "") {
  const out = [];
  for (const entry of fs.readdirSync(path.join(dir, rel), {
    withFileTypes: true,
  })) {
    const next = rel ? path.join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) out.push(...kitFiles(dir, next));
    else if (entry.name !== "MANIFEST.sha256" && entry.name !== ".DS_Store")
      out.push(next);
  }
  return out.sort();
}

const problems = [];

if (!fs.existsSync(MANIFEST)) {
  console.error(
    "check-download-kit: shared/downloadKit/MANIFEST.sha256 is missing.",
  );
  process.exit(1);
}

const expected = new Map();
for (const line of fs.readFileSync(MANIFEST, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const [hash, ...rest] = line.split(/\s+/);
  expected.set(rest.join(" "), hash);
}

for (const [name, hash] of expected) {
  const file = path.join(KIT, name);
  if (!fs.existsSync(file)) {
    problems.push(`${name} — listed in the manifest but missing here`);
    continue;
  }
  const actual = crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
  if (actual !== hash)
    problems.push(`${name} — content differs from the manifest`);
}
for (const name of kitFiles(KIT)) {
  if (!expected.has(name))
    problems.push(`${name} — present here but not in the manifest`);
}

if (problems.length > 0) {
  console.error(
    `check-download-kit: shared/downloadKit does not match its manifest:\n` +
      problems.map((p) => `  - ${p}`).join("\n") +
      `\n${FIX}`,
  );
  process.exit(1);
}

console.log(
  `check-download-kit: ${expected.size} files match MANIFEST.sha256 ✓`,
);
