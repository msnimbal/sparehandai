#!/usr/bin/env node
/**
 * Render the frames a human has to look at before any of this is worth cutting.
 *
 *   node propose.mjs --timeline ./timeline.json [--slides 1,4] [--out ./proposal]
 *
 * This exists because of what approval actually catches. Running this pipeline
 * on three real businesses, the two defects that mattered were a headline that
 * read as bossy and a background that had quietly grown a shape nobody asked
 * for. Neither is visible in a manifest, a timeline, or a table of decisions.
 * Both are obvious in one still frame.
 *
 * So the gate is a picture, not a diff. assemble.mjs refuses to run until this
 * has been looked at and the timeline marked approved.
 */
import { mkdirSync, existsSync, writeFileSync } from "fs";
import { join, resolve, basename } from "path";
import { fileURLToPath } from "url";
import { arg, die, readJSON, ff, ffmpegAvailable } from "./lib/util.mjs";
import { generate } from "./backgrounds.mjs";
import { PLACEMENTS } from "./lib/placements.mjs";

/** One composited still: background, scrim, copy. The real thing, one frame of it. */
function frame({ slide, render, brand, work, out }) {
  const w = render.width, h = render.height;
  const bg = slide.background;
  let plate;

  if (bg.source === "generated") {
    plate = join(work, `plate-${render.placement}-${bg.generator}-${bg.seed}.png`);
    if (!existsSync(plate)) generate({ generator: bg.generator, brand, size: render.placement, seed: bg.seed, out: plate });
  } else {
    plate = bg.file;
  }

  const c = render.scrim.colour.replace("#", "0x");
  const bands = (render.scrim.bands ?? [])
    .filter(() => render.scrim.boost)
    .map((b) => {
      const top = Math.max(0, b.top);
      const bh = Math.min(h - top, b.bottom - top);
      return bh > 0 ? `drawbox=x=0:y=${top}:w=${w}:h=${bh}:color=${c}@${render.scrim.boost.toFixed(4)}:t=fill` : null;
    })
    .filter(Boolean);

  ff([
    "-i", String(plate),
    "-i", String(slide.textPath),
    "-filter_complex",
    `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h},format=rgba,` +
      [`drawbox=x=0:y=0:w=${w}:h=${h}:color=${c}@${render.scrim.base}:t=fill`, ...bands].join(",") +
      `[base];[1:v]format=rgba[txt];[base][txt]overlay=0:0:format=auto,format=rgb24[v]`,
    "-map", "[v]", "-frames:v", "1", String(out),
  ], `proposal frame ${slide.index + 1}`);
  return String(out);
}

/* ---------------------------------------------------------------- CLI ---- */
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const tlPath = arg("timeline");
  if (!tlPath) die("Usage: node propose.mjs --timeline ./timeline.json [--slides 1,4] [--out ./proposal]");
  if (!ffmpegAvailable()) die("ffmpeg not found. Install it (brew install ffmpeg).");

  const timeline = readJSON(tlPath);
  const base = resolve(tlPath, "..");
  const brand = readJSON(resolve(base, timeline.brandPath || "./brand.json"));
  const outDir = resolve(arg("out", join(base, "proposal")));
  const work = resolve(arg("work", join(base, ".motion-work")));
  mkdirSync(outDir, { recursive: true });
  mkdirSync(work, { recursive: true });

  const wanted = arg("slides", "")
    .split(",").map((n) => Number(n.trim())).filter((n) => Number.isInteger(n) && n > 0);

  const made = [];
  for (const render of timeline.renders) {
    // The first slide and the last one: the hook, and the frame carrying the
    // call to action and the legal line. If either is wrong, nothing else
    // matters.
    const idxs = wanted.length
      ? wanted.map((n) => n - 1).filter((i) => i >= 0 && i < render.slides.length)
      : [...new Set([0, render.slides.length - 1])];

    for (const i of idxs) {
      const slide = render.slides[i];
      slide.textPath = slide.textPath || resolve(base, slide.text);
      if (!existsSync(slide.textPath)) die(`Copy layer missing: ${slide.textPath}`);
      const out = join(outDir, `${render.placement}-${render.seconds}s-slide-${i + 1}.png`);
      made.push(frame({ slide, render, brand, work, out }));
    }
  }

  console.log("Proposal frames — look at these before approving:\n");
  for (const f of made) console.log(`  ${f}`);

  console.log("\nWhat was decided, and why:\n");
  for (const d of timeline.decisions ?? []) console.log(`  - ${d}`);

  console.log("\nPer render:\n");
  for (const r of timeline.renders) {
    const s = r.scrim;
    console.log(
      `  ${r.placement} ${r.seconds}s — ${r.slides.length} slides x ${r.perSlide}s, ` +
        `${r.transition} ${r.xfade}s, audio ${r.audio.kind}`,
    );
    console.log(
      `      scrim ${s.base} + ${s.boost} over ${s.measuredOnFile}` +
        (s.computed ? `, measured on the ${s.computed.measuredOn} -> ${s.computed.contrastAtBase}:1` : ""),
    );
    const bgs = [...new Set(r.slides.map((sl) =>
      sl.background.source === "generated" ? `generated:${sl.background.generator}` : basename(sl.background.file || "?")))];
    console.log(`      backgrounds ${bgs.join(", ")} | motion ${[...new Set(r.slides.map((s2) => s2.motion.kind))].join(", ")}`);
  }

  // Only worth offering when the plate is synthetic. If real footage is already
  // carrying the ad there is nothing to buy, and offering anyway just invites
  // spending for its own sake.
  const anyGenerated = timeline.renders.some((r) =>
    r.slides.some((s2) => s2.background.source === "generated"));
  if (anyGenerated) {
    console.log(
      `\nThese backgrounds are generated locally, for nothing. If you want to try a paid\n` +
        `generator instead, say so and Claude will check which connectors are available,\n` +
        `price it, and show you the prompts before anything is spent. The frames above are\n` +
        `the comparison — sometimes the free one wins.`,
    );
  }

  console.log(
    `\nFive things to check, because config cannot show them:\n` +
      `  assets    — is the background the right thing to be showing at all?\n` +
      `  business  — would this be recognised as theirs without the logo?\n` +
      `  language  — read the headline aloud. Does it sound like a person?\n` +
      `  emotions  — is the tone right for the category, and not bossy?\n` +
      `  blurb     — is the fine print correct, and still true today?\n\n` +
      `Then set "approved": true in ${basename(tlPath)} and run assemble.mjs.`,
  );
}
