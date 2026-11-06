#!/usr/bin/env node
/**
 * Run an npm command in every app of this repository.
 *
 *   node scripts/apps.mjs run test    # each app's `npm run test`
 *   node scripts/apps.mjs ci          # each app's `npm ci`
 *   node scripts/apps.mjs list        # print the app directories
 *
 * Every app keeps its own package.json, lockfile and node_modules, so a demo's
 * directory can be copied out of the repository and still work on its own.
 * The apps are the demos (top-level directories that deploy with their own
 * wrangler.jsonc, the same rule shared/home's tests use to find them) plus
 * shared/home, the demos.growther.si listing. Nothing to register when a demo
 * is added: it is found the same way.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function apps(root = ROOT) {
  const demos = readdirSync(root, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        existsSync(join(root, d.name, "wrangler.jsonc")) &&
        existsSync(join(root, d.name, "package.json")),
    )
    .map((d) => d.name)
    .sort();
  return [...demos, "shared/home"];
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node scripts/apps.mjs <npm args…> | list");
  process.exit(2);
}

if (args[0] === "list") {
  console.log(apps().join("\n"));
  process.exit(0);
}

const failed = [];
for (const app of apps()) {
  const cwd = join(ROOT, app);
  if (
    args[0] !== "ci" &&
    args[0] !== "install" &&
    !existsSync(join(cwd, "node_modules"))
  ) {
    console.error(
      `\n❌ ${app} has no node_modules. Run \`npm run apps:install\` at the repository root first.`,
    );
    failed.push(app);
    continue;
  }
  console.log(
    `\n── ${app}: npm ${args.join(" ")} ${"─".repeat(Math.max(0, 50 - app.length))}`,
  );
  const res = spawnSync("npm", args, { cwd, stdio: "inherit" });
  if (res.status !== 0) failed.push(app);
}

if (failed.length) {
  console.error(`\n❌ npm ${args.join(" ")} failed in: ${failed.join(", ")}`);
  process.exit(1);
}
