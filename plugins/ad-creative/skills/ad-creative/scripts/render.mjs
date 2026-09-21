#!/usr/bin/env node
/**
 * Render every variant × placement to PNG.
 *
 *   node render.mjs --campaign ./campaign.json [--brand sparehand] [--out ./out]
 *                   [--sizes meta-1x1,story-9x16] [--variants a,b]
 *
 * Chromium rather than an image model or a canvas library: real font rendering
 * with optical sizing, exact hex, and text that is never garbled — which for
 * creative carrying a date and a legal line is the whole point.
 */
import { launchBrowser } from "./browser.mjs";
import { mkdirSync, readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { html, SIZES, loadBrand, markTag, textureTag } from "./template.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const campaignPath = arg("campaign");
if (!campaignPath) {
  console.error("Usage: node render.mjs --campaign ./campaign.json [--brand sparehand] [--out ./out]");
  process.exit(1);
}

const campaign = JSON.parse(readFileSync(resolve(campaignPath), "utf8"));
const brand = loadBrand(arg("brand", campaign.brand || "sparehand"));
const OUT = resolve(arg("out", campaign.out || "./out"));
mkdirSync(OUT, { recursive: true });

const sizes = arg("sizes", "").trim()
  ? arg("sizes").split(",").map((s) => s.trim())
  : campaign.sizes?.length
    ? campaign.sizes
    : Object.keys(SIZES);

const variantKeys = arg("variants", "").trim()
  ? arg("variants").split(",").map((s) => s.trim())
  : Object.keys(campaign.variants);

const mark = markTag(brand);
let bg = "";
if (campaign.texture?.file) {
  const texPath = resolve(campaignPath, "..", campaign.texture.file);
  if (existsSync(texPath)) bg = textureTag(texPath, campaign.texture.opacity ?? 0.07);
  else console.warn(`texture not found, rendering on flat ground: ${texPath}`);
}

const browser = await launchBrowser();
const made = [];

for (const vk of variantKeys) {
  const v = campaign.variants[vk];
  if (!v) throw new Error(`Unknown variant "${vk}". Known: ${Object.keys(campaign.variants).join(", ")}`);

  for (const size of sizes) {
    const s = SIZES[size];
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });

    await page.setContent(
      html({
        size,
        brand,
        eyebrow: campaign.eyebrow,
        // A banner cannot wrap, so it uses the flat form of the same line.
        headline: s.banner ? v.banner || v.headline.replace(/<br\s*\/?>/gi, " ") : v.headline,
        // Tight and banner placements have no room for a subline.
        sub: s.tight || s.banner ? "" : v.sub,
        cta: campaign.cta,
        // The banner is too short for the full legal line; the rest carry it.
        fine: s.banner ? "" : s.tight ? campaign.fineShort || campaign.fine : campaign.fine,
        mark: s.banner ? "" : mark,
        bg,
        loudness: v.loudness,
        scale: v.scale,
        align: v.align,
        vAlign: v.vAlign,
      }),
      { waitUntil: "networkidle" },
    );
    await page.evaluate(() => document.fonts.ready);

    const file = `${OUT}/${vk}-${size}.png`;
    await page.screenshot({ path: file });
    made.push(`${file}  ${s.w}x${s.h}`);
    await page.close();
  }
}

await browser.close();
console.log(made.join("\n"));
