#!/usr/bin/env node
/**
 * Turn a timeline into finished MP4s.
 *
 *   node assemble.mjs --timeline ./timeline.json [--out ./out] [--only story-9x16]
 *
 * This is the only module that knows ffmpeg's filter graph, on purpose: filter
 * strings are the ugliest thing here and they stay in one file.
 *
 * It refuses to run on a timeline that has not been approved. That is not
 * ceremony — the two defects worth catching in this pipeline, a line that reads
 * wrong and a background that fights the copy, are both invisible in config and
 * obvious in a rendered frame. propose.mjs renders those frames; this waits.
 */
import { mkdirSync, existsSync } from "fs";
import { join, resolve, basename } from "path";
import { fileURLToPath } from "url";
import { arg, flag, die, readJSON, ff, probe, ffmpegAvailable } from "./lib/util.mjs";
import { generate } from "./backgrounds.mjs";
import { warp, kenburns, stillClip, clipSegment, boomerang, durationOf } from "./motion.mjs";
import { bed, mux, loudness } from "./audio.mjs";

/**
 * The scrim as a filter fragment: a full-frame base, plus a soft-edged band
 * wherever copy actually sits.
 *
 * The bands are feathered rather than drawn as boxes. A hard-edged rectangle of
 * 40% fill across a plate leaves a visible seam on anything that is not flat,
 * and the seam reads as a rendering fault rather than a design choice.
 */
function scrimFilter(scrim, w, h) {
  const c = scrim.colour.replace("#", "0x");
  const parts = [`drawbox=x=0:y=0:w=${w}:h=${h}:color=${c}@${scrim.base}:t=fill`];
  for (const band of scrim.bands ?? []) {
    if (!scrim.boost) break;
    const top = Math.max(0, band.top);
    const height = Math.min(h - top, band.bottom - top);
    if (height <= 0) continue;
    const feather = Math.max(8, Math.round(height * 0.22));
    // Three stacked passes approximate a vertical falloff without needing a
    // gradient source: weak and wide, then stronger and tighter.
    const steps = [[0, 0.34], [feather, 0.33], [feather * 2, 0.33]];
    for (const [inset, share] of steps) {
      const y = top + inset;
      const bh = height - inset * 2;
      if (bh <= 0) continue;
      parts.push(`drawbox=x=0:y=${y}:w=${w}:h=${bh}:color=${c}@${(scrim.boost * share).toFixed(4)}:t=fill`);
    }
  }
  return parts.join(",");
}

function backgroundFor({ slide, render, brand, work, index }) {
  const bg = slide.background;
  const w = render.width, h = render.height;
  const secs = render.perSlide;
  const fps = render.fps;
  const clip = join(work, `bg-${render.placement}-${render.seconds}s-${index}.mp4`);

  if (bg.source === "generated") {
    const plate = join(work, `plate-${render.placement}-${bg.generator}-${bg.seed}.png`);
    if (!existsSync(plate)) {
      generate({ generator: bg.generator, brand, size: render.placement, seed: bg.seed, out: plate });
    }
    return slide.motion.kind === "warp"
      ? warp({ src: plate, w, h, seconds: secs, fps, seed: 11 + index * 7, out: clip })
      : slide.motion.kind === "kenburns"
        ? kenburns({ src: plate, w, h, seconds: secs, fps, direction: index % 2 ? "out" : "in", out: clip })
        : stillClip({ src: plate, w, h, seconds: secs, fps, out: clip });
  }

  if (bg.source === "clip") {
    // Boomerang once per source so a short clip can fill any duration with an
    // invisible loop point, then read a different moment for each slide.
    const loopSrc = join(work, `loop-${basename(bg.file).replace(/\W+/g, "-")}.mp4`);
    if (!existsSync(loopSrc)) boomerang({ src: bg.file, out: loopSrc, stream: "v" });
    const len = durationOf(loopSrc) || secs;
    return clipSegment({ src: bg.file, loopSrc, w, h, seconds: secs, fps, start: (index * secs) % len, out: clip });
  }

  // A real still.
  return slide.motion.kind === "warp"
    ? warp({ src: bg.file, w, h, seconds: secs, fps, seed: 11 + index * 7, out: clip })
    : slide.motion.kind === "none"
      ? stillClip({ src: bg.file, w, h, seconds: secs, fps, out: clip })
      : kenburns({ src: bg.file, w, h, seconds: secs, fps, direction: index % 2 ? "out" : "in", out: clip });
}

/** One slide: background, scrim, then the copy layer on top, untouched. */
export function renderSlide({ slide, render, brand, work, outFile }) {
  const w = render.width, h = render.height;
  const bgClip = backgroundFor({ slide, render, brand, work, index: slide.index });
  ff([
    "-i", bgClip,
    "-loop", "1", "-t", String(render.perSlide), "-i", String(slide.textPath),
    "-filter_complex",
    `[0:v]format=rgba,${scrimFilter(render.scrim, w, h)}[base];` +
      `[1:v]format=rgba[txt];` +
      `[base][txt]overlay=0:0:format=auto,format=yuv420p[v]`,
    "-map", "[v]", "-r", String(render.fps), "-t", String(render.perSlide),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", String(outFile),
  ], `slide ${slide.index + 1}`);
  return String(outFile);
}

export function assembleRender({ render, brand, work, outDir }) {
  mkdirSync(work, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const segs = render.slides.map((slide) =>
    renderSlide({
      slide, render, brand, work,
      outFile: join(work, `seg-${render.placement}-${render.seconds}s-${slide.index}.mp4`),
    }),
  );

  const stem = `${render.name || "reel"}-${render.placement}-${render.seconds}s`;
  const silent = join(outDir, `${stem}-silent.mp4`);

  if (segs.length === 1) {
    ff(["-i", segs[0], "-c", "copy", silent], "single slide");
  } else {
    const inputs = segs.flatMap((s) => ["-i", s]);
    let filter = "", prev = "0:v", offset = 0;
    for (let i = 1; i < segs.length; i++) {
      offset += render.perSlide - render.xfade;
      const label = i === segs.length - 1 ? "v" : `x${i}`;
      filter += `[${prev}][${i}:v]xfade=transition=${render.transition}:duration=${render.xfade}:offset=${offset.toFixed(3)}[${label}];`;
      prev = label;
    }
    filter += "[v]format=yuv420p[vout]";
    ff([...inputs, "-filter_complex", filter, "-map", "[vout]", "-r", String(render.fps),
      "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", silent], "xfade chain");
  }

  const results = [{ file: silent, audio: "silent" }];
  if (render.audio?.kind && render.audio.kind !== "none") {
    let track;
    if (render.audio.kind === "bed") {
      track = join(work, `bed-${render.seconds}s-${render.audio.key}.wav`);
      if (!existsSync(track)) bed({ seconds: render.seconds, out: track, key: render.audio.key });
    } else {
      track = render.audio.file;
      if (!existsSync(track)) die(`audio.file not found: ${track}`);
      // A supplied track shorter than the cut is boomeranged before looping, so
      // the wrap is inaudible rather than a click every few seconds.
      if (durationOf(track) < render.seconds) {
        const looped = join(work, `track-boomerang-${basename(track).replace(/\W+/g, "-")}.wav`);
        if (!existsSync(looped)) boomerang({ src: track, out: looped, stream: "a" });
        track = looped;
      }
    }
    const withAudio = join(outDir, `${stem}-${render.audio.kind}.mp4`);
    mux({ video: silent, audio: track, out: withAudio, seconds: render.seconds, lufs: render.audio.lufs });
    results.push({ file: withAudio, audio: render.audio.kind, lufs: loudness(withAudio) });
  }
  return results;
}

/* ---------------------------------------------------------------- CLI ---- */
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const tlPath = arg("timeline");
  if (!tlPath) die("Usage: node assemble.mjs --timeline ./timeline.json [--out ./out] [--only <placement>]");
  if (!ffmpegAvailable()) die("ffmpeg not found. Install it (brew install ffmpeg).");

  const timeline = readJSON(tlPath);
  const base = resolve(tlPath, "..");

  if (!timeline.approved && !flag("approved")) {
    die(
      `This timeline is not approved.\n\n` +
        `Render the proposal frames and look at them first:\n` +
        `  node propose.mjs --timeline ${tlPath}\n\n` +
        `Then set "approved": true in ${basename(tlPath)}, or re-run with --approved if you\n` +
        `have already seen the frames. Two things go wrong here that config cannot show:\n` +
        `a line that reads badly, and a background that fights the copy.`,
      2,
    );
  }

  const brand = readJSON(resolve(base, timeline.brandPath || "./brand.json"));
  const outDir = resolve(arg("out", join(base, "out")));
  const work = resolve(arg("work", join(base, ".motion-work")));
  const only = arg("only");

  const made = [];
  for (const render of timeline.renders) {
    if (only && render.placement !== only) continue;
    for (const slide of render.slides) {
      slide.textPath = slide.textPath || resolve(base, slide.text);
      if (!existsSync(slide.textPath)) die(`Copy layer missing: ${slide.textPath}`);
    }
    process.stdout.write(`${render.placement} ${render.seconds}s ... `);
    const out = assembleRender({ render, brand, work, outDir });
    console.log(out.map((o) => basename(o.file)).join(", "));
    made.push(...out);
  }

  console.log("");
  for (const m of made) {
    const dur = probe(m.file, "format=duration")[0];
    console.log(`${m.file}  ${Number(dur).toFixed(3)}s  ${m.audio}${m.lufs != null ? `  ${m.lufs} LUFS` : ""}`);
  }
}
