/**
 * How dark the scrim has to be, computed rather than guessed.
 *
 * ad-creative hands over exact boxes for the headline, subline, CTA and fine
 * print precisely so this does not have to be a fixed number that happened to
 * look right on one dark plate. A flat 58% fill over a pale fabric photo buries
 * the background; the same 58% over a bright sky still leaves white copy
 * illegible. Both are the same mistake — a constant where a measurement belongs.
 *
 * So: sample what the background actually is, then solve for the alpha that
 * puts the copy at a real contrast ratio.
 */
import { execFileSync } from "child_process";
import { hexToRgb, luminance, clamp } from "./util.mjs";

/** WCAG contrast between two luminances. */
export function contrast(l1, l2) {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Mean colour of an image or a video frame, as RGB.
 *
 * Downscaling to a single pixel with area averaging is the whole trick — it is
 * one ffmpeg call and gives the true mean rather than a sampled guess.
 */
export function meanRGB(file, { seek = null, crop = null, fit = null } = {}) {
  const args = ["-v", "error"];
  if (seek != null) args.push("-ss", String(seek));
  const chain = [];
  // Match how the frame will actually be laid down before measuring it, or the
  // number describes a picture nobody will ever see.
  if (fit) chain.push(`scale=${fit.w}:${fit.h}:force_original_aspect_ratio=increase`, `crop=${fit.w}:${fit.h}`);
  if (crop) chain.push(`crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`);
  chain.push("scale=1:1:flags=area");
  args.push("-i", String(file), "-frames:v", "1",
    "-vf", chain.join(","), "-f", "rawvideo", "-pix_fmt", "rgb24", "-");
  const out = execFileSync("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 20 });
  return [out[0], out[1], out[2]];
}

/** Blend `over` onto `under` at alpha, per channel, the way a fill composites. */
export function blend(under, over, alpha) {
  return under.map((c, i) => Math.round(c * (1 - alpha) + over[i] * alpha));
}

/**
 * Smallest alpha that puts `ink` at >= `target` contrast over `bg` once the
 * scrim is laid on top. Returns null when even a solid scrim cannot get there,
 * which means the copy colour is wrong for this plate, not the scrim.
 *
 * Searched rather than solved: blending happens in sRGB but contrast is defined
 * on linearised luminance, so there is no clean closed form. Sixty iterations
 * of bisection costs nothing and is obviously correct.
 */
export function requiredAlpha(bgRGB, scrimHex, inkHex, target = 4.5) {
  const scrim = hexToRgb(scrimHex);
  const ink = hexToRgb(inkHex);
  const li = luminance(ink);

  const at = (a) => contrast(li, luminance(blend(bgRGB, scrim, a)));
  if (at(0) >= target) return 0;
  if (at(1) < target) return null;

  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) >= target) hi = mid;
    else lo = mid;
  }
  return Number(hi.toFixed(3));
}

/**
 * A scrim spec for one background.
 *
 * `base` covers the whole frame so the plate reads as one image rather than a
 * panel taped over it. `boost` is extra opacity only where copy actually sits,
 * derived from the boxes ad-creative measured, so the background stays visible
 * everywhere it is not competing with words.
 */
export function planScrim({ bgRGB, bandRGB = null, brand, boxes, height, target = 4.5, headroom = 0.06 }) {
  // The copy only cares what is directly behind it. Measuring the whole frame
  // averages in sky the headline never touches, which under-scrims a dark plate
  // with a bright middle. When the band sample is available, it wins.
  //
  // Known limit either way: this is a mean, not a worst case. A small blown
  // highlight inside the band can still undercut a letterform. Widening the
  // target is the cheap defence; the honest fix is looking at the sample frame,
  // which is why propose.mjs renders one.
  const sample = bandRGB || bgRGB;
  const ground = brand.colours.ground;
  const ink = brand.colours.ink;
  const body = brand.colours.body || ink;

  const needHead = requiredAlpha(sample, ground, ink, target);
  const needBody = requiredAlpha(sample, ground, body, target);
  const need = Math.max(needHead ?? 1, needBody ?? 1);

  if (needHead === null || needBody === null) {
    return {
      impossible: true,
      reason:
        `Even a solid ${ground} scrim leaves the copy under ${target}:1 on this background. ` +
        `The copy colour is wrong for this plate, not the scrim.`,
    };
  }

  // Keep some of the plate visible: a full-frame base that is enough on its own
  // is the same as not having a background at all.
  const base = clamp(Number((need * 0.72).toFixed(3)), 0.18, 0.72);
  const boost = clamp(Number((need + headroom - base).toFixed(3)), 0, 1 - base);

  const bands = [];
  for (const key of ["head", "sub", "cta", "foot"]) {
    const b = boxes?.[key];
    if (!b) continue;
    bands.push({ key, top: Math.round(b.top), bottom: Math.round(b.bottom) });
  }
  const merged = mergeBands(bands, Math.round(height * 0.04));

  return {
    colour: ground,
    base,
    boost,
    bands: merged,
    computed: {
      backgroundMeanRGB: bgRGB,
      copyBandMeanRGB: bandRGB,
      measuredOn: bandRGB ? "copy band" : "whole frame",
      requiredAlpha: need,
      target,
      contrastAtBase: Number(contrast(luminance(hexToRgb(ink)), luminance(blend(sample, hexToRgb(ground), base + boost))).toFixed(2)),
    },
  };
}

/** Merge overlapping or near-touching bands so the frame gets one soft region, not four. */
function mergeBands(bands, pad) {
  if (!bands.length) return [];
  const sorted = bands
    .map((b) => ({ top: b.top - pad, bottom: b.bottom + pad, keys: [b.key] }))
    .sort((a, b) => a.top - b.top);
  const out = [sorted[0]];
  for (const b of sorted.slice(1)) {
    const last = out[out.length - 1];
    if (b.top <= last.bottom) {
      last.bottom = Math.max(last.bottom, b.bottom);
      last.keys.push(...b.keys);
    } else out.push(b);
  }
  return out.map((b) => ({ top: Math.max(0, b.top), bottom: b.bottom, covers: b.keys }));
}
