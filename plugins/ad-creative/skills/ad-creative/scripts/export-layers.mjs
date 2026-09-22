#!/usr/bin/env node
/**
 * Export the copy layer on a transparent ground, for compositing over footage.
 *
 *   node export-layers.mjs --campaign ./campaign.json [--out ./layers]
 *                          [--size story-9x16]           # reel slides (default)
 *                          [--variants a,b --sizes meta-1x1]   # statics instead
 *
 * This is a handoff, and deliberately a separate command rather than a flag on
 * render.mjs or reel.mjs. Those two produce finished ads and must keep working
 * for someone who has nothing but ffmpeg and a browser. Compositing over real
 * b-roll or a generated plate needs tools — models, footage, an assembler —
 * that most people running this skill will not have, so it does not belong in
 * the path everybody uses.
 *
 * What this exports is not a picture of an ad. It is the copy layer plus the
 * measurements needed to place it: the type, weights, tracking, palette and the
 * safe-zone-aware footer exactly as the real ad renders them, and a layers.json
 * saying where every element landed. That is the reason the legal line survives
 * the trip. A compositor should never patch `colours.ground` to fake this —
 * reaching into internals breaks the next time template.mjs changes.
 *
 * The ground and the texture are omitted on purpose: both belong to whatever
 * supplies the background now. Legibility does too — white copy over a bright
 * frame needs a scrim, and nothing here can see the footage. layers.json gives
 * the boxes so that scrim can be placed against real coordinates rather than a
 * guess.
 */
import { launchBrowser } from "./browser.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { html, SIZES, loadBrand, markTag } from "./template.mjs";
import { inspectFrame, checkFrame, FrameReport } from "./verify.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const campaignPath = arg("campaign");
if (!campaignPath) {
  console.error(
    "Usage: node export-layers.mjs --campaign ./campaign.json [--out ./layers]\n" +
      "       [--size story-9x16]            export the reel's slides (default)\n" +
      "       [--variants a,b --sizes ...]   export static variants instead",
  );
  process.exit(1);
}

const campaign = JSON.parse(readFileSync(resolve(campaignPath), "utf8"));
const brandRef = arg("brand", campaign.brand);
if (!brandRef) {
  console.error('No brand. Pass --brand <name|path/to/brand.json>, or set "brand" in the campaign file.');
  process.exit(1);
}
const brand = loadBrand(brandRef);

// Same split as the other scripts: --out is relative to the shell, and the
// default sits beside the campaign rather than inside the skill.
const cliOut = arg("out");
const OUT = cliOut ? resolve(cliOut) : resolve(dirname(resolve(campaignPath)), "./layers");
mkdirSync(OUT, { recursive: true });

const variantKeys = arg("variants", "").trim()
  ? arg("variants").split(",").map((v) => v.trim())
  : null;

const mark = markTag(brand);
const browser = await launchBrowser();
const report = new FrameReport();
const layers = [];
// Slide exports add timing here; variant exports have none to add.
const manifestExtras = {};

/** Render one frame with a transparent ground and record where the copy landed. */
async function exportFrame({ file, size, label, copy }) {
  const s = SIZES[size];
  if (!s) throw new Error(`Unknown size "${size}". Known: ${Object.keys(SIZES).join(", ")}`);

  const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
  await page.setContent(html({ size, brand, mark, alpha: true, ...copy }), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const info = await inspectFrame(page);
  report.add(checkFrame(info, label));

  const path = join(OUT, file);
  await page.screenshot({ path, omitBackground: true });
  await page.close();

  layers.push({
    file,
    label,
    width: s.w,
    height: s.h,
    safeTop: s.safeTop ?? 0,
    safeBottom: s.safeBottom ?? 0,
    // Where a scrim has to sit to keep the copy readable. Real coordinates,
    // not a guess — the alternative is a fixed fill that happens to work on
    // one dark plate and buries the disclosure on the next.
    boxes: { head: info.head, sub: info.sub, cta: info.cta, fine: info.fine, foot: info.foot },
  });
  return path;
}

if (variantKeys) {
  const sizes = arg("sizes", "").trim()
    ? arg("sizes").split(",").map((v) => v.trim())
    : campaign.sizes?.length
      ? campaign.sizes
      : Object.keys(SIZES);

  for (const vk of variantKeys) {
    const v = campaign.variants?.[vk];
    if (!v) throw new Error(`Unknown variant "${vk}". Known: ${Object.keys(campaign.variants || {}).join(", ")}`);
    for (const size of sizes) {
      const s = SIZES[size];
      await exportFrame({
        file: `${vk}-${size}-alpha.png`,
        size,
        label: `variant ${vk} / ${size}`,
        copy: {
          eyebrow: campaign.eyebrow,
          headline: s.banner ? v.banner || v.headline.replace(/<br\s*\/?>/gi, " ") : v.headline,
          sub: s.tight || s.banner ? "" : v.sub,
          cta: campaign.cta,
          fine: s.banner ? "" : s.tight ? campaign.fineShort || campaign.fine : campaign.fine,
          loudness: v.loudness,
          scale: v.scale,
          align: v.align,
          vAlign: v.vAlign,
        },
      });
    }
  }
} else {
  const reel = campaign.reel || {};
  const slides = reel.slides;
  if (!slides?.length) {
    console.error(
      "campaign.reel.slides is empty, so there are no slides to export.\n" +
        "Pass --variants a,b to export the static variants instead.",
    );
    process.exit(1);
  }
  const size = arg("size", reel.size || "story-9x16");

  for (const [i, slide] of slides.entries()) {
    await exportFrame({
      file: `slide-${i + 1}-${size}-alpha.png`,
      size,
      label: `slide ${i + 1} / ${size}`,
      copy: {
        eyebrow: slide.eyebrow ?? campaign.eyebrow,
        headline: slide.headline,
        sub: slide.sub || "",
        cta: slide.cta || "",
        // The legal line rides every frame, not just the last: most viewers
        // never reach the end of a short.
        fine: campaign.fine,
        loudness: slide.loudness,
        scale: slide.scale,
        align: slide.align,
        vAlign: slide.vAlign,
      },
    });
  }

  // Timing travels with the layers so a compositor does not re-derive it and
  // land on a different total. Each transition overlaps two slides, so the
  // timeline loses one xfade per cut.
  const xfade = Number(arg("xfade", reel.xfade ?? 0.5));
  const seconds = Number(arg("seconds", reel.seconds ?? 13));
  Object.assign(manifestExtras, {
    seconds,
    xfade,
    transition: reel.transition || "slideleft",
    perSlide: (seconds + xfade * (slides.length - 1)) / slides.length,
  });
}

await browser.close();
const failed = report.finish();

const manifest = {
  _note:
    "Copy layers on a transparent ground, exported by ad-creative for compositing. " +
    "The ground, any texture, and legibility are the compositor's responsibility; " +
    "boxes give real coordinates so a scrim can be placed rather than guessed.",
  campaign: resolve(campaignPath),
  brand: brand.name ?? null,
  ground: brand.colours?.ground ?? null,
  ...manifestExtras,
  layers,
};
const manifestPath = join(OUT, "layers.json");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(layers.map((l) => join(OUT, l.file)).join("\n"));
console.log(`${manifestPath}\n`);
console.log(
  `${layers.length} transparent-ground layer(s). No video: H.264 carries no alpha, so an ` +
    `"alpha MP4" would just be the copy flattened onto black.`,
);
process.exit(failed ? 2 : 0);
