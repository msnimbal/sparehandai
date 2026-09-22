#!/usr/bin/env node
/**
 * Render the campaign's slides and cut them into a silent MP4.
 *
 *   node reel.mjs --campaign ./campaign.json --brand <name|path> [--out ./out]
 *                 [--seconds 13] [--transition slideleft] [--xfade 0.5]
 *                 [--size story-9x16]
 *
 * Silent on purpose: music is laid over the cut in an editor, and a baked-in
 * track cannot be swapped without re-encoding.
 */
import { launchBrowser } from "./browser.mjs";
import { ffmpegAvailable, ffmpegInstallHint, STATICS_STILL_WORK } from "./ffmpeg.mjs";
import { execFileSync } from "child_process";
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
  console.error("Usage: node reel.mjs --campaign ./campaign.json [--seconds 13] [--transition slideleft]");
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
// Same split as render.mjs: --out is relative to the shell, campaign.out is
// relative to the campaign file.
const cliOut = arg("out");
const OUT = cliOut
  ? resolve(cliOut)
  : resolve(dirname(resolve(campaignPath)), campaign.out || "./out");
const FRAMES = join(OUT, ".reel-frames");
mkdirSync(FRAMES, { recursive: true });

const reel = campaign.reel || {};
const slides = reel.slides;
if (!slides?.length) {
  console.error("campaign.reel.slides is empty — nothing to cut.");
  process.exit(1);
}

/**
 * --sample 1,5 renders only those slides as PNGs and stops before ffmpeg.
 *
 * This exists because a Markdown slide table cannot show that a headline is
 * about to wrap into a four-line stack, or that a line reads as bossy. Showing
 * one real frame before asking for approval is the difference between an
 * approval that means something and one that gets reversed after the render.
 */
const sample = arg("sample", arg("stills", ""))
  .split(",")
  .map((n) => Number(n.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);

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

if (!sample.length && !ffmpegAvailable()) {
  console.error(`${ffmpegInstallHint()}\n\n${STATICS_STILL_WORK}`);
  process.exit(1);
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
const report = new FrameReport();

const chosen = sample.length
  ? sample.map((n) => n - 1).filter((i) => i >= 0 && i < slides.length)
  : slides.map((_, i) => i);

if (sample.length && !chosen.length) {
  console.error(`No slide matches --sample ${sample.join(",")}. There are ${slides.length} slides, numbered from 1.`);
  process.exit(1);
}

for (const i of chosen) {
  const slide = slides[i];
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

  report.add(checkFrame(await inspectFrame(page), `slide ${i + 1} / ${SIZE}`));

  // Samples go beside the other deliverables; full-run frames are scratch.
  const file = sample.length ? join(OUT, `slide-${i + 1}-${SIZE}.png`) : join(FRAMES, `slide-${i}.png`);
  await page.screenshot({ path: file });
  stills.push(file);
  await page.close();
}
await browser.close();

const failed = report.finish();

if (sample.length) {
  console.log(stills.join("\n"));
  console.log("\nSample frames only — no video cut. Show these before asking for approval.");
  process.exit(failed ? 2 : 0);
}

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

const mp4 = join(OUT, `${reel.name || "reel"}-${SIZE}-${TARGET}s.mp4`);
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
    console.error(`${ffmpegInstallHint()}\n\n${STATICS_STILL_WORK}`);
  } else if (/xfade/.test(stderr) && /transition/.test(stderr)) {
    console.error(`ffmpeg rejected transition "${TRANSITION}". Try slideleft, slideup, wipeleft or fade.`);
  } else {
    console.error(stderr.split("\n").slice(-12).join("\n"));
  }
  process.exit(1);
}

console.log(mp4);
if (failed) process.exit(2);
