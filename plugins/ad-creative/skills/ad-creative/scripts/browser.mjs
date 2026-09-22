/**
 * Playwright, loaded with an error a person can act on.
 *
 * The scripts run from the skill directory, which has its own package.json —
 * a bare "Cannot find package 'playwright'" stack trace tells the reader
 * nothing about which directory to install into, so resolve it here and say.
 */
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function launchBrowser(options = {}) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error(
      `Playwright isn't installed for this skill. Run setup once:\n\n` +
        `  node "${SKILL_ROOT}/scripts/setup.mjs"\n\n` +
        `Installing a plugin copies files but does not run npm install, and a plugin update\n` +
        `lands in a new version directory, so this may be needed again after an update.\n`,
    );
    process.exit(1);
  }
  try {
    return await chromium.launch(options);
  } catch (err) {
    if (/Executable doesn't exist|browserType.launch/.test(err.message)) {
      console.error(`Chromium isn't downloaded yet. Run setup once:\n\n  node "${SKILL_ROOT}/scripts/setup.mjs"\n`);
      process.exit(1);
    }
    throw err;
  }
}
