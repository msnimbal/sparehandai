/**
 * Routing tests. No ffmpeg, no filesystem, no rendering.
 *
 * This is the point of keeping plan() pure: the decisions that determine
 * whether an ad is any good are made here, and they can be checked in
 * milliseconds against inventories that would take a photo shoot to produce.
 *
 *   node --test tests/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { plan } from "../scripts/plan.mjs";

const brand = {
  name: "Test",
  colours: { ground: "#0F1729", ink: "#FFFFFF", body: "#C7D2E4", accent: "#3B82F6" },
};

const layerSet = (n = 3, w = 1080, h = 1920) => ({
  seconds: 13, xfade: 0.45, transition: "slideup",
  layers: Array.from({ length: n }, (_, i) => ({
    file: `slide-${i + 1}-story-9x16-alpha.png`,
    path: `/layers/slide-${i + 1}.png`,
    width: w, height: h,
    boxes: { head: { top: 700, bottom: 1100 }, foot: { top: 1560, bottom: 1620 } },
  })),
});

const asset = (over = {}) => ({
  file: "a.jpg", path: "/assets/a.jpg", kind: "image", role: "broll",
  overlay: false, width: 2000, height: 3000,
  fitness: { "story-9x16": { upscale: 1.0, retain: 1.0, verdict: "ok" } },
  ...over,
});

/** A stub sampler: mid-grey for anything, so contrast maths runs without a file. */
const sampler = () => [90, 90, 90];
const run = (manifest, inventory, sets = [layerSet()]) =>
  plan({ manifest, inventory, layerSets: sets, brand, sampler });

test("no assets at all routes to a generated plate, and says so", () => {
  const t = run({ seconds: [13], background: { kind: "auto" } }, { assets: [], counts: { usable: 0 } });
  assert.equal(t.refused, undefined);
  assert.equal(t.renders[0].slides[0].background.source, "generated");
  assert.match(t.decisions.join(" "), /no source assets at all/);
});

test("a fitting asset is used instead of generating", () => {
  const t = run({ seconds: [13], background: { kind: "auto" } }, { assets: [asset()], counts: { usable: 1 } });
  assert.equal(t.renders[0].slides[0].background.source, "still");
  assert.equal(t.renders[0].slides[0].background.file, "/assets/a.jpg");
});

test("an asset that fails the fitness gate is not used, and the reason is recorded", () => {
  const unfit = asset({ fitness: { "story-9x16": { upscale: 2.13, retain: 0.32, verdict: "too-soft" } } });
  const t = run({ seconds: [13], background: { kind: "auto" } }, { assets: [unfit], counts: { usable: 1 } });
  assert.equal(t.renders[0].slides[0].background.source, "generated");
  assert.match(t.decisions.join(" "), /clears the fitness gate/);
});

test("asking for assets when none fit falls back rather than forcing a bad crop", () => {
  const unfit = asset({ fitness: { "story-9x16": { upscale: 3, retain: 0.2, verdict: "wrong-shape" } } });
  const t = run({ seconds: [13], background: { kind: "assets" } }, { assets: [unfit], counts: { usable: 1 } });
  assert.equal(t.renders[0].slides[0].background.source, "generated");
  assert.match(t.decisions.join(" "), /asked for real assets but none clear/);
});

test("logos and vectors are never chosen as backgrounds", () => {
  const logo = asset({ file: "logo.svg", kind: "vector", role: "logo", overlay: true, fitness: {} });
  const t = run({ seconds: [13], background: { kind: "auto" } }, { assets: [logo], counts: { usable: 1 } });
  assert.equal(t.renders[0].slides[0].background.source, "generated");
});

test("a photograph drifts rather than warps, even when warp is asked for", () => {
  const t = run({ seconds: [13], background: { kind: "auto", motion: "warp" } },
    { assets: [asset()], counts: { usable: 1 } });
  assert.equal(t.renders[0].slides[0].motion.kind, "kenburns");
  assert.match(t.decisions.join(" "), /drifting rather than warping/);
});

test("a generated plate does warp", () => {
  const t = run({ seconds: [13], background: { kind: "generated", motion: "warp" } }, { assets: [], counts: { usable: 0 } });
  assert.equal(t.renders[0].slides[0].motion.kind, "warp");
});

test("per-slide duration is derived so the cut lands on the requested length", () => {
  const t = run({ seconds: [13, 20] }, { assets: [], counts: { usable: 0 } });
  const [a, b] = t.renders;
  assert.equal(a.perSlide, 4.633);  // (13 + 0.45*2)/3
  assert.equal(b.perSlide, 6.967);  // (20 + 0.45*2)/3
  const total = a.perSlide * 3 - a.xfade * 2;
  assert.ok(Math.abs(total - 13) < 0.01, `timeline totals ${total}, not 13`);
});

test("a duration too short for its slides is refused, not silently shortened", () => {
  // perSlide tends toward xfade as slides increase, so the guard bites when the
  // whole cut is shorter than a single transition.
  const t = run({ seconds: [0.3] }, { assets: [], counts: { usable: 0 } }, [layerSet(3)]);
  assert.equal(t.refused, true);
  assert.match(t.decisions.join(" "), /shorter than the 0.45s transition/);
});

test("a placement with no matching text layer is skipped rather than guessed at", () => {
  const t = run({ seconds: [13] }, { assets: [], counts: { usable: 0 } }, [layerSet(3, 1920, 1080)]);
  assert.equal(t.refused, true);
  assert.match(t.decisions.join(" "), /motion is only produced for/);
});

test("the scrim is computed from the background, not fixed", () => {
  const dark = plan({
    manifest: { seconds: [13] }, inventory: { assets: [], counts: { usable: 0 } },
    layerSets: [layerSet()], brand, sampler: () => [10, 12, 20],
  });
  const bright = plan({
    manifest: { seconds: [13] }, inventory: { assets: [], counts: { usable: 0 } },
    layerSets: [layerSet()], brand, sampler: () => [220, 215, 210],
  });
  assert.ok(
    bright.renders[0].scrim.base > dark.renders[0].scrim.base,
    "a bright plate must get more scrim than a dark one",
  );
});

test("audio defaults to a bed at bed level, and honours none", () => {
  const withBed = run({ seconds: [13] }, { assets: [], counts: { usable: 0 } });
  assert.equal(withBed.renders[0].audio.kind, "bed");
  assert.equal(withBed.renders[0].audio.lufs, -23);
  const silent = run({ seconds: [13], audio: { kind: "none" } }, { assets: [], counts: { usable: 0 } });
  assert.equal(silent.renders[0].audio.kind, "none");
});
