#!/usr/bin/env node
/**
 * Decide what every frame is made of, and write it down where it can be read.
 *
 *   node plan.mjs --manifest ./motion.json [--out ./timeline.json]
 *
 * `plan()` is a pure function of (manifest, inventory, layers, brand) plus an
 * injected sampler. Nothing here touches the filesystem or ffmpeg, so the
 * routing can be tested against fixture inventories — empty, stills-only,
 * has-video — without rendering a single frame. Rendering is the slow part and
 * the part least likely to be wrong; routing is the fast part that decides
 * whether the ad is any good.
 *
 * The output is `timeline.json`: every asset resolved, every duration computed,
 * every fallback recorded with the reason it was taken. That file, not this
 * script, is the thing a human approves.
 */
import { resolve, join, basename } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { arg, die, readJSON, writeJSON, hexToRgb } from "./lib/util.mjs";
import { PLACEMENTS } from "./lib/placements.mjs";
import { planScrim, meanRGB } from "./lib/scrim.mjs";

const FPS = 25;
/** Verdicts good enough to put on screen. "too-soft" and "wrong-shape" never are. */
const USABLE = new Set(["ok", "marginal"]);
/** Extensions in an explicit files list that are footage, not stills. */
const VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;

/**
 * @param {object} o
 * @param {(file:string,opts:object)=>number[]} o.sampler  file -> mean RGB
 * @returns {object} timeline
 */
export function plan({ manifest, inventory, layerSets, brand, sampler }) {
  const decisions = [];
  const note = (m) => decisions.push(m);
  const ceiling = manifest.budget?.tier ?? 0;
  let tierUsed = 0;

  const seconds = Array.isArray(manifest.seconds) ? manifest.seconds : [manifest.seconds ?? 13];
  const renders = [];

  for (const layers of layerSets) {
    const size = guessPlacement(layers);
    const spec = PLACEMENTS[size];
    if (!spec) {
      note(`Skipped a layer set for "${size}": motion is only produced for ${Object.keys(PLACEMENTS).join(", ")}.`);
      continue;
    }

    const pool = choosePool({ manifest, inventory, size, note });
    tierUsed = Math.max(tierUsed, pool.tier);
    if (pool.tier > ceiling) {
      return {
        refused: true,
        reason:
          `Producing this needs tier ${pool.tier} (${pool.tierName}) but the manifest ceiling is ` +
          `tier ${ceiling}. Raise budget.tier to ${pool.tier}, or change background.kind.`,
        decisions,
      };
    }

    for (const secs of seconds) {
      const slides = layers.layers.filter((l) => /^slide-/.test(l.file));
      if (!slides.length) {
        note(`Layer set at ${size} has no slide layers — nothing to animate.`);
        continue;
      }
      const xfade = layers.xfade ?? 0.45;
      const perSlide = (secs + xfade * (slides.length - 1)) / slides.length;
      if (perSlide <= xfade) {
        note(
          `Refused ${size} at ${secs}s: ${slides.length} slides leaves ${perSlide.toFixed(2)}s each, ` +
            `shorter than the ${xfade}s transition.`,
        );
        continue;
      }

      const built = slides.map((layer, i) => {
        const src = pool.pick(i);
        return {
          index: i,
          text: layer.file,
          // Absolute, because the copy layers live in the export folder rather
          // than beside the timeline, and every consumer would otherwise have
          // to re-derive where that was.
          textPath: layer.path ?? null,
          boxes: layer.boxes,
          background: src,
          motion: motionFor(src, manifest, note),
          start: Number((i * (perSlide - xfade)).toFixed(3)),
          duration: Number(perSlide.toFixed(3)),
        };
      });

      renders.push({
        placement: size,
        width: spec.w,
        height: spec.h,
        seconds: secs,
        fps: manifest.fps ?? FPS,
        xfade,
        transition: layers.transition || "slideup",
        perSlide: Number(perSlide.toFixed(3)),
        slides: built,
        audio: planAudio(manifest, secs, note),
        scrim: null, // filled below, once there is something to measure
      });
    }
  }

  if (!renders.length) {
    return { refused: true, reason: "Nothing to render. " + (decisions[0] || "No usable layer sets."), decisions };
  }

  // Scrim last, because it is a measurement of the background that was chosen,
  // not a preference stated in advance.
  for (const r of renders) {
    r.scrim = scrimFor({ render: r, brand, manifest, sampler, note });
  }

  return {
    approved: false,
    generatedAt: new Date().toISOString(),
    brand: brand.name ?? null,
    tier: { ceiling, used: tierUsed, name: ["local", "local models", "paid"][tierUsed] },
    renders,
    decisions,
  };
}

/**
 * Which placement a layer set belongs to.
 *
 * Matched on the layer's own dimensions rather than its filename: the name is a
 * convention and the pixels are a fact. Falls back to the name only when the
 * dimensions match nothing known.
 */
function guessPlacement(layers) {
  const first = layers.layers?.[0];
  if (first?.width && first?.height) {
    const hit = Object.entries(PLACEMENTS).find(([, s]) => s.w === first.width && s.h === first.height);
    if (hit) return hit[0];
  }
  // Only fall back to the filename when there are no dimensions to go on. If a
  // layer is 1920x1080 and called "...story-9x16-alpha.png", the pixels are
  // right and the name is stale — trusting the name there produces a cut at the
  // wrong shape that looks deliberate.
  if (first?.width && first?.height) return `${first.width}x${first.height}`;
  const f = first?.file || "";
  return Object.keys(PLACEMENTS).find((k) => f.includes(k)) ?? "unknown";
}

/**
 * Which backgrounds this placement gets, and why.
 *
 * The rule that matters: real footage is preferred wherever it fits, and simply
 * not offered where it does not. A landscape workshop photo is not a 9:16
 * background at any resolution — only a quarter of the frame survives — so for
 * vertical the honest answer is a generated plate, not a punishing crop.
 */
function choosePool({ manifest, inventory, size, note }) {
  const want = manifest.background?.kind ?? "auto";
  const files = manifest.background?.files;

  if (Array.isArray(files) && files.length) {
    note(`${size}: using the ${files.length} background file(s) named in the manifest.`);
    return { tier: 0, tierName: "local", kind: "given", pick: (i) => givenFile(files[i % files.length]) };
  }

  const fit = (inventory?.assets ?? []).filter(
    (a) => !a.overlay && a.fitness?.[size] && USABLE.has(a.fitness[size].verdict),
  );

  if (want === "assets" && !fit.length) {
    note(`${size}: asked for real assets but none clear the fitness gate here — falling back to a generated plate.`);
  }
  if ((want === "auto" || want === "assets") && fit.length) {
    const how = fit.map((a) => `${basename(a.file)} (${a.fitness[size].upscale}x, ${a.fitness[size].verdict})`);
    note(`${size}: real assets fit — ${how.join(", ")}.`);
    return {
      tier: 0, tierName: "local", kind: "assets",
      pick: (i) => {
        const a = fit[i % fit.length];
        return { source: a.kind === "video" ? "clip" : "still", file: a.path, fitness: a.fitness[size] };
      },
    };
  }

  const gen = want === "auto" || want === "generated" ? (manifest.background?.generator ?? "wash") : want;
  const reason = fit.length
    ? `manifest asked for "${want}"`
    : (inventory?.counts?.usable ?? 0) === 0
      ? "there are no source assets at all"
      : `nothing in the asset folder clears the fitness gate at ${size}`;
  note(`${size}: generating a "${gen}" plate because ${reason}.`);
  return {
    tier: 0, tierName: "local", kind: "generated",
    pick: (i) => ({ source: "generated", generator: gen, seed: i + 1 }),
  };
}

/**
 * One entry of `background.files`: a path, or `{ file, start }`.
 *
 * Video becomes a clip so it is cut rather than looped as a still. Each clip
 * starts at 0 (or its own `start`): an explicit list names one moment per
 * slide, unlike an inventory asset reused across slides, which assemble.mjs
 * offsets so every slide reads a different part of the same footage.
 */
function givenFile(entry) {
  const { file, start } = typeof entry === "string" ? { file: entry } : entry;
  if (VIDEO_EXT.test(file)) return { source: "clip", file, start: Number(start ?? 0) };
  return { source: "file", file };
}

function motionFor(src, manifest, note) {
  const want = manifest.background?.motion ?? "warp";
  if (src.source === "clip") return { kind: "clip" };
  if (want === "none") return { kind: "none" };
  if (want === "kenburns") return { kind: "kenburns" };
  if (src.source === "still" && want === "warp") {
    // A displacement warp bleeds pigment convincingly on painterly plates and
    // looks like a heat haze on a photograph of people. Photographs get a slow
    // push instead, which is the honest move rather than the clever one.
    note("A real photograph is drifting rather than warping — warping faces reads as a fault, not an effect.");
    return { kind: "kenburns" };
  }
  return { kind: "warp" };
}

function planAudio(manifest, secs, note) {
  const a = manifest.audio ?? { kind: "bed" };
  if (a.kind === "none") return { kind: "none" };
  if (a.kind === "file") {
    if (!a.file) { note("audio.kind is \"file\" but no audio.file given — rendering silent."); return { kind: "none" }; }
    return { kind: "file", file: a.file, lufs: a.lufs ?? -23 };
  }
  return { kind: "bed", seconds: secs, lufs: a.lufs ?? -23, key: a.key ?? "Am" };
}

function scrimFor({ render, brand, manifest, sampler, note }) {
  if (manifest.scrim === "none") return { colour: brand.colours.ground, base: 0, boost: 0, bands: [] };

  const first = render.slides[0];
  const bg = first.background;
  const fit = { w: render.width, h: render.height };

  // A generated plate is made from the brand ground, so its mean is known
  // without rendering it — which keeps planning free of a chicken-and-egg with
  // the thing it is planning.
  if (bg.source === "generated") {
    const rgb = sampler(null, { generated: bg.generator, brand });
    return withMeta(planScrim({ bgRGB: rgb, brand, boxes: first.boxes, height: render.height }), "generated plate");
  }

  const band = bandFor(first.boxes, render);
  const whole = sampler(bg.file, { fit });
  const bandRGB = band ? sampler(bg.file, { fit, crop: band }) : null;
  const s = planScrim({ bgRGB: whole, bandRGB, brand, boxes: first.boxes, height: render.height });
  if (s.impossible) note(`${render.placement}: ${s.reason}`);
  return withMeta(s, bg.file ? basename(bg.file) : "background");
}

function withMeta(scrim, measuredOn) {
  return { ...scrim, measuredOnFile: measuredOn };
}

/** The vertical strip the copy occupies, which is the only part legibility depends on. */
function bandFor(boxes, render) {
  const tops = [], bottoms = [];
  for (const k of ["head", "sub", "cta"]) {
    if (boxes?.[k]) { tops.push(boxes[k].top); bottoms.push(boxes[k].bottom); }
  }
  if (!tops.length) return null;
  const y = Math.max(0, Math.round(Math.min(...tops)));
  const h = Math.min(render.height - y, Math.round(Math.max(...bottoms) - y));
  return h > 8 ? { x: 0, y, w: render.width, h } : null;
}

/* ---------------------------------------------------------------- CLI ---- */
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const manifestPath = arg("manifest");
  if (!manifestPath) die("Usage: node plan.mjs --manifest ./motion.json [--out ./timeline.json]");
  const manifest = readJSON(manifestPath);
  const base = resolve(manifestPath, "..");
  const rel = (p) => (p ? resolve(base, p) : null);

  const brand = readJSON(rel(manifest.brand));
  const brandPath = manifest.brand;
  const inventory = manifest.inventory && existsSync(rel(manifest.inventory))
    ? readJSON(rel(manifest.inventory))
    : { assets: [], counts: { usable: 0 } };

  const dirs = Array.isArray(manifest.layers) ? manifest.layers : [manifest.layers];
  const layerSets = dirs.map((d) => {
    const p = join(rel(d), "layers.json");
    if (!existsSync(p)) {
      die(
        `No layers.json in ${rel(d)}\n\n` +
          `ad-motionify composites ad-creative's copy layers; it does not render type itself.\n` +
          `Produce them first:\n  node <ad-creative>/scripts/export-layers.mjs --campaign ./campaign.json --out ${d}`,
      );
    }
    const set = readJSON(p);
    // Resolve layer files to absolute paths so assemble.mjs need not re-derive them.
    for (const l of set.layers) l.path = join(rel(d), l.file);
    return set;
  });

  const timeline = plan({
    manifest, inventory, layerSets, brand,
    sampler: (file, opts) => {
      // A generated plate is built from the brand ground by backgrounds.mjs, so
      // its mean is known without rendering it first.
      if (opts?.generated) return hexToRgb(opts.brand.colours.ground);
      return meanRGB(file, opts);
    },
  });

  if (timeline.refused) {
    console.error(`Refused to plan.\n\n${timeline.reason}\n`);
    for (const d of timeline.decisions) console.error(`  - ${d}`);
    process.exit(1);
  }

  timeline.brandPath = brandPath;
  const out = writeJSON(arg("out", "./timeline.json"), timeline);
  for (const d of timeline.decisions) console.log(`  - ${d}`);
  console.log(`\n${timeline.renders.length} render(s) planned:`);
  for (const r of timeline.renders) {
    console.log(
      `  ${r.placement} ${r.seconds}s — ${r.slides.length} slides x ${r.perSlide}s, ` +
        `scrim ${r.scrim.base}+${r.scrim.boost} on ${r.scrim.measuredOnFile}` +
        (r.scrim.computed ? ` (${r.scrim.computed.contrastAtBase}:1)` : ""),
    );
  }
  console.log(`\n${out}\nNot approved yet — run propose.mjs and look at the frames.`);
}
