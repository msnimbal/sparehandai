#!/usr/bin/env node
/**
 * Describe what is actually in an assets folder.
 *
 *   node inventory.mjs --assets ./assets [--out ./inventory.json] [--include-finished]
 *
 * This knows nothing about brands, campaigns or ads. It describes files, so the
 * same output serves any business. Everything that decides what to DO with
 * them lives in plan.mjs.
 *
 * The reason this exists as its own step: "has b-roll" and "has USABLE b-roll"
 * are different questions, and answering the first one is how you end up
 * building a vertical ad out of a 478x850 clip that WhatsApp already destroyed.
 * Every asset is scored against every placement before anything is chosen.
 */
import { readdirSync, statSync } from "fs";
import { extname, join, relative, resolve, basename, sep } from "path";
import { arg, flag, die, writeJSON, probe, ffmpegAvailable } from "./lib/util.mjs";
import { PLACEMENTS, fitness } from "./lib/placements.mjs";

const IMAGE = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".tif", ".tiff", ".bmp"]);
const VIDEO = new Set([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"]);
const VECTOR = new Set([".svg", ".pdf", ".eps", ".ai"]);
const AUDIO = new Set([".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg"]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".cache", "dist", ".DS_Store",
  ".worktrees", ".claude", "__pycache__", ".composite",
]);

/**
 * Folders that hold finished creative rather than source material. Including
 * these is how last month's ad becomes this month's background — it renders
 * perfectly and is quietly absurd, an ad inside an ad.
 */
const OUTPUT_DIRS = new Set(["build", "out", "output", "exports", "export", "renders", "final", "layers"]);

/**
 * Placement dimensions, matched with a few pixels of tolerance. A file at
 * 1080x1920 was almost certainly made rather than shot.
 *
 * The tolerance is not fussiness: a real finished ad in the test set came out
 * of its editor at 1080x1352 and sailed straight through an exact-match check
 * against 1080x1350. Two pixels is the difference between excluding last
 * month's ad and using it as this month's background.
 */
const PLACEMENT_DIMS = [
  [1080, 1920], [1080, 1350], [1080, 1080], [1200, 628],
  [300, 250], [336, 280], [300, 600], [728, 90], [1920, 1080],
];
const DIM_TOLERANCE = 8;

function matchesPlacement(w, h) {
  return PLACEMENT_DIMS.find(
    ([pw, ph]) => Math.abs(w - pw) <= DIM_TOLERANCE && Math.abs(h - ph) <= DIM_TOLERANCE,
  );
}

const ROLE_HINTS = [
  [/logo|wordmark|monogram|brand[-_]?mark|favicon/i, "logo"],
  [/founder|team|portrait|headshot|staff/i, "founder"],
  [/texture|pattern|wash|paper|grain|noise|bg|background/i, "texture"],
  [/hero|cover|main|feature/i, "hero"],
  [/broll|b-roll|clip|footage|process|workshop|factory|atelier|making|install|session|site/i, "broll"],
];

function walk(dir, root, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, root, out);
    } else if (e.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function classify(file) {
  const ext = extname(file).toLowerCase();
  if (IMAGE.has(ext)) return "image";
  if (VIDEO.has(ext)) return "video";
  if (VECTOR.has(ext)) return "vector";
  if (AUDIO.has(ext)) return "audio";
  return null;
}

function guessRole(relPath) {
  for (const [re, role] of ROLE_HINTS) if (re.test(relPath)) return role;
  return "unknown";
}

/** Why an asset looks like output rather than input. Returns a reason or null. */
function finishedReason(relPath, dims) {
  const parts = relPath.split(sep).slice(0, -1).map((p) => p.toLowerCase());
  const inOutputDir = parts.find((p) => OUTPUT_DIRS.has(p));
  if (inOutputDir) return `sits in a "${inOutputDir}" folder`;
  if (/^final[-_]|[-_]final[-_.]|-cover\.|_cover\./i.test(basename(relPath))) {
    return "named like a finished deliverable";
  }
  if (dims) {
    const hit = matchesPlacement(dims.w, dims.h);
    if (hit) {
      const exact = hit[0] === dims.w && hit[1] === dims.h;
      return exact
        ? `is exactly ${dims.w}x${dims.h}, an ad placement size`
        : `is ${dims.w}x${dims.h}, within a few px of the ${hit[0]}x${hit[1]} placement size`;
    }
  }
  return null;
}

const assetsDir = arg("assets");
if (!assetsDir) {
  die(
    "Usage: node inventory.mjs --assets ./assets [--out ./inventory.json] [--include-finished]\n\n" +
      "Describes every usable file and scores it against each placement. Pass an empty\n" +
      "or non-existent folder and it will say so plainly — that is a valid answer, and\n" +
      "plan.mjs routes to generated backgrounds when it happens.",
  );
}
if (!ffmpegAvailable()) die("ffprobe/ffmpeg not found. Install ffmpeg (brew install ffmpeg).");

const ROOT = resolve(assetsDir);
let exists = true;
try { statSync(ROOT); } catch { exists = false; }

const files = exists ? walk(ROOT, ROOT) : [];
const assets = [];
const skipped = [];

for (const full of files) {
  const rel = relative(ROOT, full);
  const kind = classify(full);
  if (!kind) continue;

  let width = null, height = null, duration = null, hasAudio = false;
  if (kind === "image" || kind === "video") {
    const dims = probe(full, "stream=width,height");
    width = Number(dims[0]) || null;
    height = Number(dims[1]) || null;
  }
  if (kind === "video" || kind === "audio") {
    duration = Number(probe(full, "format=duration")[0]) || null;
    hasAudio = probe(full, "stream=codec_type").includes("audio");
  }

  const dims = width && height ? { w: width, h: height } : null;
  const finished = finishedReason(rel, dims);
  const role = guessRole(rel);

  // Fitness measures one thing only: can this asset fill a frame. So it is
  // meaningless for anything that was never going to fill one.
  //
  // Vectors have no native resolution, so the upscale gate cannot apply. A logo
  // is an overlay — it sits at 5% of the width in a corner, and scoring a
  // wordmark as "3.07x too soft" says nothing except that it is not a
  // photograph. Both get scored as overlays instead, which keeps them usable
  // without pretending they are candidate backgrounds.
  const overlay = kind === "vector" || role === "logo";
  const scores = {};
  if (!overlay && kind !== "audio" && dims) {
    for (const p of Object.keys(PLACEMENTS)) scores[p] = fitness(dims.w, dims.h, p);
  }

  const asset = {
    file: rel,
    path: full,
    kind,
    width, height, duration,
    hasAudio: kind === "video" || kind === "audio" ? hasAudio : undefined,
    role,
    overlay,
    finished: Boolean(finished),
    finishedReason: finished,
    resolutionIndependent: kind === "vector",
    fitness: scores,
  };

  if (finished && !flag("include-finished")) skipped.push(asset);
  else assets.push(asset);
}

// A raster that has a vector sibling of the same name should never be chosen:
// the SVG is the same artwork without a ceiling.
const vectorStems = new Set(
  assets.filter((a) => a.kind === "vector").map((a) => basename(a.file, extname(a.file)).toLowerCase()),
);
for (const a of assets) {
  if (a.kind === "image") {
    const stem = basename(a.file, extname(a.file)).toLowerCase().replace(/[-_]\d+$/, "");
    if (vectorStems.has(stem)) a.supersededByVector = true;
  }
}

const usable = assets.filter((a) => !a.supersededByVector);
const inventory = {
  generatedAt: new Date().toISOString(),
  root: ROOT,
  rootExists: exists,
  counts: {
    usable: usable.length,
    byKind: usable.reduce((m, a) => ((m[a.kind] = (m[a.kind] || 0) + 1), m), {}),
    excludedAsFinished: skipped.length,
    supersededByVector: assets.length - usable.length,
  },
  assets: usable,
  excluded: skipped.map((a) => ({ file: a.file, reason: a.finishedReason })),
};

const outPath = writeJSON(arg("out", "./inventory.json"), inventory);

// Printed as a table because this is one of the things a human approves, and a
// JSON blob is not something anyone actually reads before saying yes.
if (!exists) {
  console.log(`No such folder: ${ROOT}\nNothing to inventory — plan.mjs will route to generated backgrounds.\n`);
} else if (!usable.length) {
  console.log(`No usable source assets under ${ROOT}\n`);
}

if (usable.length) {
  const names = Object.keys(PLACEMENTS);
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad("asset", 38)}${pad("native", 11)}${pad("role", 9)}${names.map((n) => pad(n, 16)).join("")}`);
  console.log("-".repeat(38 + 11 + 9 + names.length * 16));
  for (const a of usable) {
    const native = a.resolutionIndependent ? "vector" : a.width ? `${a.width}x${a.height}` : "-";
    const cells = names.map((n) => {
      if (a.overlay) return pad(a.resolutionIndependent ? "any (vector)" : "overlay", 16);
      const f = a.fitness[n];
      return pad(f ? `${f.upscale}x ${f.verdict}` : "-", 16);
    });
    console.log(`${pad(a.file.slice(0, 37), 38)}${pad(native, 11)}${pad(a.role, 9)}${cells.join("")}`);
  }
}

if (skipped.length) {
  console.log(`\nExcluded ${skipped.length} file(s) that look like finished creative rather than source:`);
  for (const a of skipped.slice(0, 8)) console.log(`  ${a.file} — ${a.finishedReason}`);
  if (skipped.length > 8) console.log(`  ...and ${skipped.length - 8} more`);
  console.log("  Pass --include-finished to keep them.");
}

console.log(`\n${outPath}`);
