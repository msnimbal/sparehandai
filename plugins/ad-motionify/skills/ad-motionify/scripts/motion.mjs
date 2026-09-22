#!/usr/bin/env node
/**
 * Give a still plate movement, or cut a usable segment out of real footage.
 *
 *   node motion.mjs --src ./plate.png --kind warp --size story-9x16 --seconds 5 --out ./clip.mp4
 *
 * The warp is the interesting one. It drives ffmpeg's `displace` with two
 * slowly-evolving perlin fields, so pixels flow like wet pigment. What makes it
 * worth preferring over a video model is not the cost: `displace` can only
 * relocate pixels that already exist, so it is structurally incapable of
 * inventing a colour, a shape or a face. Asked to animate a painting, a
 * generative model produced a cyan bleed, a pale bloom and a blank-faced figure
 * that were not in the source. This cannot do that, by construction.
 *
 * It is fluid motion, not narrative motion — it bleeds paint, it cannot turn a
 * head or push a camera. For abstract plates that is the whole requirement.
 */
import { resolve } from "path";
import { fileURLToPath } from "url";
import { arg, die, ff, probe } from "./lib/util.mjs";
import { PLACEMENTS } from "./lib/placements.mjs";

export const MOTIONS = ["warp", "kenburns", "none", "clip"];

const cover = (w, h) => `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h}`;

/** Wet-pigment drift. `amount` is the displacement in pixels at full deflection. */
export function warp({ src, w, h, seconds, fps = 25, amount = 0.09, seed = 11, out }) {
  const p = `octaves=3:persistence=0.6:xscale=0.004:yscale=0.004:tscale=0.12:random_mode=seed`;
  const squeeze = (c) => `${c}='128+(val-128)*${amount}'`;
  ff([
    "-loop", "1", "-t", String(seconds), "-i", String(src),
    "-f", "lavfi", "-i", `perlin=size=${w}x${h}:rate=${fps}:${p}:random_seed=${seed}`,
    "-f", "lavfi", "-i", `perlin=size=${w}x${h}:rate=${fps}:${p}:random_seed=${seed + 66}`,
    "-filter_complex",
    `[0:v]${cover(w, h)},format=rgb24[src];` +
      `[1:v]format=rgb24,lutrgb=${squeeze("r")}:${squeeze("g")}:${squeeze("b")}[xm];` +
      `[2:v]format=rgb24,lutrgb=${squeeze("r")}:${squeeze("g")}:${squeeze("b")}[ym];` +
      `[src][xm][ym]displace=edge=smear,format=yuv420p[v]`,
    "-map", "[v]", "-r", String(fps), "-t", String(seconds),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", String(out),
  ], "warp");
  return String(out);
}

/**
 * A slow push. Used for photographs, where a warp reads as a fault rather than
 * an effect — a rippling face looks like a broken file, not a style.
 */
export function kenburns({ src, w, h, seconds, fps = 25, direction = "in", out }) {
  const frames = Math.max(1, Math.round(seconds * fps));
  const z = direction === "in" ? `1+0.06*on/${frames}` : `1.06-0.06*on/${frames}`;
  ff([
    "-loop", "1", "-t", String(seconds), "-i", String(src),
    "-vf",
    `${cover(w * 2, h * 2)},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${w}x${h}:fps=${fps},format=yuv420p`,
    "-r", String(fps), "-t", String(seconds),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", String(out),
  ], "kenburns");
  return String(out);
}

export function stillClip({ src, w, h, seconds, fps = 25, out }) {
  ff([
    "-loop", "1", "-t", String(seconds), "-i", String(src),
    "-vf", `${cover(w, h)},fps=${fps},format=yuv420p`,
    "-r", String(fps), "-t", String(seconds),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", String(out),
  ], "still");
  return String(out);
}

/**
 * Forward then reversed, so the first and last frames are identical and the
 * loop point is invisible.
 *
 * This is what makes duration independent of the source: a 5s plate fills 13s,
 * 20s or 30s with no visible seam, which matters because most video models cap
 * out around 15s and charge by the second. Reversed pigment drift still reads
 * as pigment drift.
 */
export function boomerang({ src, out, stream = "v" }) {
  if (stream === "v") {
    ff(["-i", String(src), "-an", "-filter_complex",
      "[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0[v]",
      "-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
      "-pix_fmt", "yuv420p", String(out)], "boomerang video");
  } else {
    ff(["-i", String(src), "-vn", "-filter_complex",
      "[0:a]asplit[a][b];[b]areverse[r];[a][r]concat=n=2:v=0:a=1[a]",
      "-map", "[a]", "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", String(out)], "boomerang audio");
  }
  return String(out);
}

/** Take `seconds` of real footage, looping seamlessly when the source is shorter. */
export function clipSegment({ src, w, h, seconds, fps = 25, start = 0, loopSrc = null, out }) {
  const source = loopSrc || src;
  ff([
    "-stream_loop", "-1", "-ss", String(start), "-t", String(seconds), "-i", String(source),
    "-vf", `${cover(w, h)},fps=${fps},format=yuv420p`,
    "-an", "-r", String(fps), "-t", String(seconds),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", String(out),
  ], "clip segment");
  return String(out);
}

export function durationOf(file) {
  return Number(probe(file, "format=duration")[0]) || 0;
}

/* ---------------------------------------------------------------- CLI ---- */
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const src = arg("src");
  if (!src) die(`Usage: node motion.mjs --src <file> --kind <${MOTIONS.join("|")}> --size <placement> --seconds 5 [--out clip.mp4]`);
  const size = arg("size", "story-9x16");
  const spec = PLACEMENTS[size] || die(`Unknown placement "${size}"`);
  const kind = arg("kind", "warp");
  const seconds = Number(arg("seconds", 5));
  const fps = Number(arg("fps", 25));
  const out = arg("out", `./motion-${kind}.mp4`);
  const common = { src, w: spec.w, h: spec.h, seconds, fps, out };
  const made =
    kind === "warp" ? warp({ ...common, seed: Number(arg("seed", 11)) })
    : kind === "kenburns" ? kenburns(common)
    : kind === "clip" ? clipSegment({ ...common, start: Number(arg("start", 0)) })
    : stillClip(common);
  console.log(`${made}  ${probe(made, "format=duration")[0]}s`);
}
