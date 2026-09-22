/**
 * The placements motion is worth making, mirroring ad-creative's SIZES so a
 * text layer exported there drops straight onto a background made here.
 *
 * Display banners are deliberately absent. A 728x90 is 90px tall: motion in it
 * is noise, and every ad network that accepts animation there wants HTML5
 * rather than an MP4. They stay static, which ad-creative already does well.
 *
 * There is no 16:9 for the same reason there is no 16:9 in ad-creative — a
 * landscape cut would have no matching text layer to composite. Adding one
 * means adding it there first.
 */
export const PLACEMENTS = {
  "story-9x16": { w: 1080, h: 1920, safeTop: 250, safeBottom: 250, label: "Reels / Stories / Shorts" },
  "meta-4x5": { w: 1080, h: 1350, label: "Feed video, portrait" },
  "meta-1x1": { w: 1080, h: 1080, label: "Feed video, square" },
};

/** Upscale factor needed to COVER a target, and how much of the source survives the crop. */
export function fitness(srcW, srcH, target) {
  const { w, h } = PLACEMENTS[target];
  const upscale = Math.max(w / srcW, h / srcH);
  const srcAspect = srcW / srcH;
  const tarAspect = w / h;
  const retain = srcAspect > tarAspect ? tarAspect / srcAspect : srcAspect / tarAspect;
  return {
    upscale: Number(upscale.toFixed(2)),
    retain: Number(retain.toFixed(2)),
    verdict: verdict(upscale, retain),
  };
}

/**
 * Two independent ways an asset fails, and they are not interchangeable.
 *
 * Resolution: past ~1.15x a photograph visibly softens, and past ~1.4x it looks
 * like what it is — an upscale.
 *
 * Crop retention: a 2400x1020 photo is high-resolution and still wrong for
 * 9:16, because only 24% of the frame survives. That is not a sharpness
 * problem, it is a composition one — whatever the shot was about is now mostly
 * outside the frame. No amount of resolution fixes it.
 */
export function verdict(upscale, retain) {
  if (upscale > 1.4) return "too-soft";
  if (retain < 0.4) return "wrong-shape";
  if (upscale > 1.15 || retain < 0.6) return "marginal";
  return "ok";
}
