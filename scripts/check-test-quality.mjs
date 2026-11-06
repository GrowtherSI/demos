#!/usr/bin/env node
/**
 * check-test-quality.mjs — pre-push / CI guard (ported from growther-admin,
 * which ported it from growther-c5).
 *
 *  1. No @ts-nocheck in test files — real tests must typecheck.
 *  2. No "pure-hollow" tests — a file whose EVERY expect() matcher is
 *     existence-only (toBeDefined/toBeTruthy/toBeNull/toBeFalsy) passes no
 *     matter how broken the code is.
 *
 * Scans every demo and shared/ (JS and TS test files alike — most of this
 * repository is plain JS). Exit 1 on violation. Zero dependencies.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKIP = new Set([
  "node_modules",
  ".git",
  ".claude",
  "dist",
  "coverage",
  ".wrangler",
]);

const WEAK_MATCHERS = new Set([
  "toBeDefined",
  "toBeTruthy",
  "toBeNull",
  "toBeFalsy",
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.test\.[cm]?[jt]sx?$/.test(name)) out.push(p);
  }
  return out;
}

function isPureHollow(src) {
  // Files using node:test assert.* (or fast-check fc.assert) are substantive.
  if (/\bassert\s*\.|fc\.assert/.test(src)) return false;
  const matchers = [
    ...src.matchAll(/expect\s*\([^;]*?\)\s*\.\s*(?:not\s*\.\s*)?(\w+)/gs),
  ].map((m) => m[1]);
  if (matchers.length === 0) return false;
  return matchers.every((m) => WEAK_MATCHERS.has(m));
}

const nocheck = [];
const hollow = [];
const files = walk(ROOT);
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  if (src.includes("@ts-nocheck")) nocheck.push(rel);
  else if (isPureHollow(src)) hollow.push(rel);
}

let failed = false;
if (nocheck.length) {
  failed = true;
  console.error(
    "[FAIL] @ts-nocheck in test files (real tests must typecheck):",
  );
  nocheck.forEach((v) => console.error("   - " + v));
}
if (hollow.length) {
  failed = true;
  console.error("[FAIL] pure-hollow tests (only existence assertions):");
  hollow.forEach((v) => console.error("   - " + v));
  console.error("   Every test file needs at least one substantive assertion.");
}
if (failed) process.exit(1);
console.log(`[OK] Test-quality guard passed (${files.length} test files).`);
