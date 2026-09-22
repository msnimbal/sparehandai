#!/usr/bin/env node
/**
 * Render every variant × placement to PNG.
 *
 *   node render.mjs --campaign ./campaign.json --brand <name|path> [--out ./out]
 *                   [--sizes meta-1x1,story-9x16] [--variants a,b]
 *
 * Chromium rather than an image model or a canvas library: real font rendering
 * with optical sizing, exact hex, and text that is never garbled — which for
 * creative carrying a date and a legal line is the whole point.
 */
import { launchBrowser } from "./browser.mjs";
import { mkdirSync, readFileSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { html, SIZES, loadBrand, markTag, textureTag } from "./template.mjs";
import { inspectFrame, checkFrame, FrameReport } from "./verify.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const campaignPath = arg("campaign");
if (!campaignPath) {
  console.error("Usage: node render.mjs --campaign ./campaign.json --brand <name|path> [--out ./out]");
  process.exit(1);
}

const campaign = JSON.parse(readFileSync(resolve(campaignPath), "utf8"));
const brandRef = arg("brand", campaign.brand);
if (!brandRef) {
  console.error(
    'No brand. Pass --brand <name|path/to/brand.json>, or set "brand" in the campaign file.\n' +
      "There is deliberately no default: rendering against the wrong palette produces a full set of\n" +
      "files that look finished and are all unusable. brands/example.json is a template to fill in,\n" +
      "and scripts/extract-brand.mjs can propose one from a website.",
  );
  process.exit(1);
}
const brand = loadBrand(brandRef);
// `--out` is something the person typed just now, so it resolves against the
// shell. `campaign.out` lives in the campaign file, so it resolves against
// that file — otherwise running the documented command from the skill folder
// drops the whole output set inside the skill instead of beside the job.
const cliOut = arg("out");
const OUT = cliOut
  ? resolve(cliOut)
  : resolve(dirname(resolve(campaignPath)), campaign.out || "./out");
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
const report = new FrameReport();

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

    report.add(checkFrame(await inspectFrame(page), `variant ${vk} / ${size}`));

    const file = join(OUT, `${vk}-${size}.png`);
    await page.screenshot({ path: file });
    made.push(`${file}  ${s.w}x${s.h}`);
    await page.close();
  }
}

await browser.close();
console.log(made.join("\n"));

if (report.finish()) process.exit(2);
