#!/usr/bin/env node
/**
 * Render the campaign's slides and cut them into a silent MP4.
 *
 *   node reel.mjs --campaign ./campaign.json [--brand sparehand] [--out ./out]
 *                 [--seconds 13] [--transition slideleft] [--xfade 0.5]
 *                 [--size story-9x16]
 *
 * Silent on purpose: music is laid over the cut in an editor, and a baked-in
 * track cannot be swapped without re-encoding.
 */
import { launchBrowser } from "./browser.mjs";
import { execFileSync } from "child_process";
import { mkdirSync, readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { html, SIZES, loadBrand, markTag, textureTag } from "./template.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const campaignPath = arg("campaign");
if (!campaignPath) {
  console.error("Usage: node reel.mjs --campaign ./campaign.json [--seconds 13] [--transition slideleft]");
  process.exit(1);
}

const campaign = JSON.parse(readFileSync(resolve(campaignPath), "utf8"));
const brand = loadBrand(arg("brand", campaign.brand || "sparehand"));
const OUT = resolve(arg("out", campaign.out || "./out"));
const FRAMES = `${OUT}/.reel-frames`;
mkdirSync(FRAMES, { recursive: true });

const reel = campaign.reel || {};
const slides = reel.slides;
if (!slides?.length) {
  console.error("campaign.reel.slides is empty — nothing to cut.");
  process.exit(1);
}

const SIZE = arg("size", reel.size || "story-9x16");
const TARGET = Number(arg("seconds", reel.seconds ?? 13));
const TRANSITION = arg("transition", reel.transition || "slideleft");
const XFADE = Number(arg("xfade", reel.xfade ?? 0.5));
const FPS = Number(arg("fps", reel.fps ?? 30));

/**
 * Each transition overlaps two slides, so the finished timeline is shorter
 * than the sum of the slide durations by one XFADE per cut. Solving for the
 * per-slide duration is why `--seconds 13` actually produces 13.000s; setting
 * a round number per slide instead silently yields a shorter file.
 */
const perSlide = (TARGET + XFADE * (slides.length - 1)) / slides.length;
if (perSlide <= XFADE) {
  console.error(
    `Each slide would be ${perSlide.toFixed(2)}s, shorter than the ${XFADE}s transition. ` +
      `Raise --seconds, lower --xfade, or use fewer slides.`,
  );
  process.exit(1);
}

// Time a slide is fully on screen, not mid-transition. Under about a second
// nobody finishes reading a headline, so the cut looks busy and says nothing.
// A warning rather than an error: a deliberately frantic cut is a real choice.
const hold = perSlide - XFADE;
if (hold < 1) {
  console.warn(
    `Warning: each slide holds for only ${hold.toFixed(2)}s between transitions, which is too ` +
      `short to read a headline. For ${slides.length} slides, try --seconds ` +
      `${Math.ceil(slides.length * (1 + XFADE) - XFADE * (slides.length - 1))} or more.`,
  );
}

const mark = markTag(brand);
let bg = "";
if (campaign.texture?.file) {
  const texPath = resolve(campaignPath, "..", campaign.texture.file);
  if (existsSync(texPath)) bg = textureTag(texPath, campaign.texture.opacity ?? 0.07);
}

const s = SIZES[SIZE];
const browser = await launchBrowser();
const stills = [];

for (const [i, slide] of slides.entries()) {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
  await page.setContent(
    html({
      size: SIZE,
      brand,
      eyebrow: slide.eyebrow ?? campaign.eyebrow,
      headline: slide.headline,
      sub: slide.sub || "",
      cta: slide.cta || "",
      // The legal line rides every frame, not just the last one: most viewers
      // never reach the end of a short, and the disclosure has to be on screen
      // wherever they drop off.
      fine: campaign.fine,
      mark,
      bg,
      // Per-slide type treatment. A reel is a sequence, so varying loudness
      // across it is what gives the cut a shape rather than five flat cards.
      loudness: slide.loudness,
      scale: slide.scale,
      align: slide.align,
      vAlign: slide.vAlign,
    }),
    { waitUntil: "networkidle" },
  );
  await page.evaluate(() => document.fonts.ready);

  const file = `${FRAMES}/slide-${i}.png`;
  await page.screenshot({ path: file });
  stills.push(file);
  await page.close();
}
await browser.close();

const inputs = [];
for (const f of stills) inputs.push("-loop", "1", "-t", String(perSlide), "-i", f);

let filter = "";
let prev = "0:v";
for (let i = 1; i < stills.length; i++) {
  const offset = perSlide * i - XFADE * i;
  const out = i === stills.length - 1 ? "v" : `x${i}`;
  filter += `[${prev}][${i}:v]xfade=transition=${TRANSITION}:duration=${XFADE}:offset=${offset}[${out}];`;
  prev = out;
}
filter = filter.replace(/;$/, "");

const mp4 = `${OUT}/${reel.name || "reel"}-${SIZE}-${TARGET}s.mp4`;
try {
  execFileSync(
    "ffmpeg",
    [
      "-y", ...inputs,
      "-filter_complex", filter,
      "-map", "[v]",
      "-r", String(FPS),
      "-c:v", "libx264", "-preset", "slow", "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      mp4,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
} catch (err) {
  const stderr = err.stderr?.toString() || "";
  if (/ENOENT/.test(err.message)) {
    console.error("ffmpeg is not installed. `brew install ffmpeg`, or skip the reel and ship statics.");
  } else if (/xfade/.test(stderr) && /transition/.test(stderr)) {
    console.error(`ffmpeg rejected transition "${TRANSITION}". Try slideleft, slideup, wipeleft or fade.`);
  } else {
    console.error(stderr.split("\n").slice(-12).join("\n"));
  }
  process.exit(1);
}

console.log(mp4);
