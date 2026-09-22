#!/usr/bin/env node
/**
 * One-time setup: install Playwright and download Chromium.
 *
 *   node scripts/setup.mjs
 *
 * Needed because installing a plugin copies files — it does not run
 * `npm install`. And because the install path is version-pinned
 * (…/cache/<marketplace>/<plugin>/<version>/…), a plugin update lands in a new
 * directory with no node_modules, so this has to be re-runnable rather than a
 * once-per-machine ritual.
 *
 * Safe to run repeatedly: it checks first and exits immediately if everything
 * is already in place.
 */
import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit", env: process.env });

let ready = false;
if (existsSync(join(ROOT, "node_modules", "playwright"))) {
  try {
    const { chromium } = await import("playwright");
    // executablePath() throws when the browser binary was never downloaded,
    // which is a different failure from the package being absent.
    ready = existsSync(chromium.executablePath());
  } catch {
    ready = false;
  }
}

if (ready) {
  console.log("Already set up — Playwright and Chromium are both present.");
  process.exit(0);
}

console.log(`Setting up ${ROOT}`);
try {
  if (!existsSync(join(ROOT, "node_modules", "playwright"))) {
    console.log("\nInstalling Playwright…");
    run("npm", ["install", "--no-audit", "--no-fund"]);
  }
  console.log("\nDownloading Chromium…");
  run("npx", ["playwright", "install", "chromium"]);
  console.log("\nDone. Statics will render now; the reel also needs ffmpeg.");
} catch {
  console.error(
    "\nSetup failed. Run these by hand:\n" +
      `\n  npm install --prefix "${ROOT}"` +
      `\n  npx --prefix "${ROOT}" playwright install chromium\n` +
      "\nIf the plugin directory isn't writable, copy the skill somewhere you own and run it there.",
  );
  process.exit(1);
}
