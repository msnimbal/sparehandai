#!/usr/bin/env node
/**
 * Make a background plate from nothing but the brand palette.
 *
 *   node backgrounds.mjs --brand ./brand.json --generator wash --size story-9x16 --out ./plate.png
 *
 * Generators: wash, phyllotaxis, flow, rings, grid, noise
 *
 * These are procedural, and that is the point rather than a limitation. A
 * diffusion model asked for "abstract brand-coloured texture" returns something
 * plausible in roughly the right colours; asked twice it returns two different
 * things, and it cannot be told #0F1729 and be believed. Geometry can. Every
 * plate here is deterministic from its seed, exact to the hex, and free.
 *
 * `wash` is the one exception — it uses ffmpeg's perlin source for a painterly
 * cloud field, because smooth organic noise is genuinely hard to beat by hand
 * and ffmpeg already ships it.
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { arg, die, readJSON, hexToRgb, clamp, ff, ffmpegAvailable } from "./lib/util.mjs";
import { encodePNG } from "./lib/png.mjs";
import { PLACEMENTS } from "./lib/placements.mjs";

export const GENERATORS = ["wash", "phyllotaxis", "flow", "rings", "grid", "noise"];

/** Deterministic PRNG, so a seed always gives the same plate on any machine. */
function rng(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Two brand colours and a position -> a pixel. Keeps every generator on-palette by construction. */
function ramp(from, to, t) {
  const k = clamp(t, 0, 1);
  return [
    Math.round(from[0] + (to[0] - from[0]) * k),
    Math.round(from[1] + (to[1] - from[1]) * k),
    Math.round(from[2] + (to[2] - from[2]) * k),
  ];
}

function canvas(w, h, base) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = base[0]; buf[i * 4 + 1] = base[1]; buf[i * 4 + 2] = base[2]; buf[i * 4 + 3] = 255;
  }
  return buf;
}

const px = (buf, w, x, y, rgb, alpha = 1) => {
  if (x < 0 || y < 0 || x >= w) return;
  const i = (y * w + x) * 4;
  if (i < 0 || i + 3 >= buf.length) return;
  buf[i] = Math.round(buf[i] * (1 - alpha) + rgb[0] * alpha);
  buf[i + 1] = Math.round(buf[i + 1] * (1 - alpha) + rgb[1] * alpha);
  buf[i + 2] = Math.round(buf[i + 2] * (1 - alpha) + rgb[2] * alpha);
};

function disc(buf, w, h, cx, cy, r, rgb, alpha) {
  const r2 = r * r;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 <= r2) px(buf, w, x, y, rgb, alpha * (1 - Math.sqrt(d2) / r) ** 0.6);
    }
  }
}

/**
 * Phyllotaxis — the arrangement a sunflower head uses, at the golden angle.
 * Reads as organic without being random, which is exactly what a background
 * behind a headline wants: structure you feel rather than notice.
 */
function phyllotaxis(w, h, ground, accent, seed) {
  const buf = canvas(w, h, ground);
  const n = 620;
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const scale = Math.min(w, h) * 0.055;
  const cx = w / 2, cy = h * 0.46;
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = i * GOLDEN + r() * 0.02;
    const d = scale * Math.sqrt(i);
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    const t = i / n;
    disc(buf, w, h, x, y, 2 + t * (Math.min(w, h) / 130), ramp(ground, accent, 0.45 + t * 0.5), 0.34 + t * 0.26);
  }
  return buf;
}

/** A flow field: particles advected through smooth curl noise, leaving faint trails. */
function flow(w, h, ground, accent, seed) {
  const buf = canvas(w, h, ground);
  const r = rng(seed);
  const field = (x, y) =>
    Math.sin(x / (w * 0.21) + seed) * 1.7 + Math.cos(y / (h * 0.17) - seed * 0.6) * 1.7;
  for (let p = 0; p < 240; p++) {
    let x = r() * w, y = r() * h;
    const shade = ramp(ground, accent, 0.45 + r() * 0.45);
    for (let step = 0; step < 300; step++) {
      const a = field(x, y);
      x += Math.cos(a) * 2.2;
      y += Math.sin(a) * 2.2;
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      px(buf, w, Math.round(x), Math.round(y), shade, 0.2);
    }
  }
  return buf;
}

/** Concentric rings, spaced so they thin toward the edge rather than banding evenly. */
function rings(w, h, ground, accent, seed) {
  const buf = canvas(w, h, ground);
  const cx = w * 0.5, cy = h * 0.42;
  const max = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
  for (let i = 1; i < 46; i++) {
    const rad = max * (i / 46) ** 1.35;
    const shade = ramp(ground, accent, 0.4 + (i / 46) * 0.45);
    const steps = Math.max(64, Math.round(rad * 6));
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * Math.PI * 2 + seed;
      px(buf, w, Math.round(cx + Math.cos(a) * rad), Math.round(cy + Math.sin(a) * rad), shade, 0.5);
    }
  }
  return buf;
}

/** A plain modular grid, faint. The quietest option, and often the right one. */
function grid(w, h, ground, accent, seed) {
  const buf = canvas(w, h, ground);
  const step = Math.round(Math.min(w, h) / 14);
  const shade = ramp(ground, accent, 0.6);
  for (let x = step; x < w; x += step) for (let y = 0; y < h; y++) px(buf, w, x, y, shade, 0.3);
  for (let y = step; y < h; y += step) for (let x = 0; x < w; x++) px(buf, w, x, y, shade, 0.3);
  return buf;
}

/** Fine film grain over the ground. Almost nothing, which is sometimes exactly right. */
function noise(w, h, ground, accent, seed) {
  const buf = canvas(w, h, ground);
  const r = rng(seed);
  for (let i = 0; i < w * h; i++) {
    const n = (r() - 0.5) * 30;
    buf[i * 4] = clamp(buf[i * 4] + n, 0, 255);
    buf[i * 4 + 1] = clamp(buf[i * 4 + 1] + n, 0, 255);
    buf[i * 4 + 2] = clamp(buf[i * 4 + 2] + n, 0, 255);
  }
  return buf;
}

const PROCEDURAL = { phyllotaxis, flow, rings, grid, noise };

/**
 * `wash` goes through ffmpeg rather than pixel loops: a multi-octave perlin
 * field tinted from ground to accent. This is the painterly one, and the only
 * generator whose look would be hard to write by hand.
 */
function washPlate({ w, h, ground, accent, seed, out }) {
  const [gr, gg, gb] = ground;
  // Ramp toward a MIX of ground and accent, never the accent itself. Perlin is
  // centred on mid-grey, so a ground->accent ramp puts the average pixel half
  // way to the accent and the "subtle wash" comes out a flat sheet of brand
  // blue. The top of the ramp has to be a hint of accent, not the accent.
  const [ar, ag, ab] = ramp(ground, accent, 0.42);
    // xscale is the noise frequency, and it is far larger than it looks like it
  // should be. At 0.0055 the whole 1080x1920 frame sits inside a few noise
  // cells and comes out a smooth gradient — technically a wash, visually a flat
  // navy card, which is no better than the free flat ground ad-creative already
  // gives you. Around 0.6 the frame holds enough cells to read as pigment.
  const p = `octaves=5:persistence=0.6:xscale=0.62:yscale=0.62:random_mode=seed:random_seed=${seed}`;
  ff([
    "-f", "lavfi", "-i", `perlin=size=${w}x${h}:${p}`,
    "-frames:v", "1",
    "-vf",
    // Perlin comes out full-range grey; compress it toward the middle so the
    // plate stays a quiet ground rather than a high-contrast cloudscape, then
    // map that single channel onto the brand ramp. The tint is a lookup, so the
    // darkest pixel is exactly the brand ground.
    `format=gray,lutyuv=y='128+(val-128)*1.15',format=rgb24,` +
      `lutrgb=r='${gr}+(${ar}-${gr})*val/255':g='${gg}+(${ag}-${gg})*val/255':b='${gb}+(${ab}-${gb})*val/255'`,
    String(out),
  ], "wash plate");
}

export function generate({ generator, brand, size, seed = 1, out }) {
  const spec = PLACEMENTS[size];
  if (!spec) throw new Error(`Unknown placement "${size}". Known: ${Object.keys(PLACEMENTS).join(", ")}`);
  if (!GENERATORS.includes(generator)) {
    throw new Error(`Unknown generator "${generator}". Known: ${GENERATORS.join(", ")}`);
  }
  const ground = hexToRgb(brand.colours.ground);
  const accent = hexToRgb(brand.colours.accent);
  mkdirSync(dirname(resolve(out)), { recursive: true });

  if (generator === "wash") {
    if (!ffmpegAvailable()) throw new Error("The wash generator needs ffmpeg. Try --generator flow.");
    washPlate({ w: spec.w, h: spec.h, ground, accent, seed, out });
  } else {
    const buf = PROCEDURAL[generator](spec.w, spec.h, ground, accent, seed);
    writeFileSync(resolve(out), encodePNG(spec.w, spec.h, buf));
  }
  return resolve(out);
}

/* ---------------------------------------------------------------- CLI ---- */
import { fileURLToPath } from "url";
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const brandPath = arg("brand");
  if (!brandPath) {
    die(
      `Usage: node backgrounds.mjs --brand ./brand.json --generator <${GENERATORS.join("|")}> ` +
        `--size <${Object.keys(PLACEMENTS).join("|")}> [--seed 1] [--out ./plate.png]`,
    );
  }
  const gen = arg("generator", "wash");
  const size = arg("size", "story-9x16");
  const out = generate({
    generator: gen, brand: readJSON(brandPath), size,
    seed: Number(arg("seed", 1)), out: arg("out", `./plate-${gen}-${size}.png`),
  });
  console.log(out);
}
