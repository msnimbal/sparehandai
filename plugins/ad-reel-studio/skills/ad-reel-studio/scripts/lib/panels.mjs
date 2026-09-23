/**
 * Caption panels: a rounded card in the brand ground colour behind each block
 * of copy, sized from where the copy's pixels actually are.
 *
 * Why a card and not ad-motionify's measured scrim: a scrim is a wash across
 * the whole band, which is right over a photograph and wrong over an animated
 * cartoon — it dims the characters that are the point of the shot. A card
 * keeps the scene at full colour and the copy at full contrast, and reads as a
 * title card from an animated film rather than a filter.
 *
 * Why from the alpha rather than layers.json boxes: the boxes carry headline,
 * subline, CTA and fine print, but not the eyebrow, and a card that stops
 * short of the eyebrow leaves the date floating over a busy background.
 */

/** Rows that carry copy, grouped into bands. A gap under `gap` px joins two rows into one band. */
export function bandsFromAlpha(rgba, width, height, { gap = 70, threshold = 20 } = {}) {
  const bands = [];
  let cur = null, empty = 0;
  for (let y = 0; y < height; y++) {
    let l = width, r = -1;
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] > threshold) { if (x < l) l = x; r = x; }
    }
    if (r < 0) { empty++; continue; }
    if (cur && empty < gap) { cur.bottom = y; cur.left = Math.min(cur.left, l); cur.right = Math.max(cur.right, r); }
    else { cur = { top: y, bottom: y, left: l, right: r }; bands.push(cur); }
    empty = 0;
  }
  return bands;
}

/** Pixel buffer for rounded cards behind the given bands. Colour is [r,g,b]; alpha 0-1. */
export function panelRGBA(width, height, bands, { colour = [251, 244, 234], alpha = 0.93, pad = 34, radius = 36, margin = 40 } = {}) {
  const out = Buffer.alloc(width * height * 4);
  const a = Math.round(alpha * 255);
  for (const b of bands) {
    const x0 = Math.max(margin, Math.round(b.left - pad * 1.6)), x1 = Math.min(width - margin, Math.round(b.right + pad * 1.6));
    const y0 = Math.max(0, b.top - pad), y1 = Math.min(height, b.bottom + pad);
    const r = Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        // distance outside the rounded corner, for a one-pixel antialiased edge
        const dx = Math.max(x0 + r - x - 0.5, 0, x + 0.5 - (x1 - r));
        const dy = Math.max(y0 + r - y - 0.5, 0, y + 0.5 - (y1 - r));
        const cover = Math.max(0, Math.min(1, r + 0.5 - Math.hypot(dx, dy)));
        if (!cover) continue;
        const i = (y * width + x) * 4;
        out[i] = colour[0]; out[i + 1] = colour[1]; out[i + 2] = colour[2];
        out[i + 3] = Math.max(out[i + 3], Math.round(a * cover));
      }
    }
  }
  return out;
}

/** A square rounded mask for grid tiles: white inside, transparent outside. */
export function tileMaskRGBA(size, radius = 34) {
  return panelRGBA(size, size, [{ top: 0, bottom: size, left: 0, right: size }], {
    colour: [255, 255, 255], alpha: 1, pad: 0, radius, margin: 0,
  });
}
