import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SKILL_ROOT = resolve(HERE, "..");

/**
 * Placement specs. `pad`, `head`, `eyebrow`, `body`, `btn` and `rule` are in
 * px at that canvas size — they are not a responsive scale, because an ad is a
 * fixed canvas and type should be tuned per placement rather than derived.
 *
 * `safeTop`/`safeBottom` are the regions platform UI covers. On a 9:16 story
 * Instagram puts the profile row over the top band and the swipe affordance
 * over the bottom one, so anything there is invisible in practice — which
 * matters most for the legal line, the one thing that has to stay readable.
 *
 * `tight` placements drop the subline; `banner` ones lay out horizontally and
 * keep the headline on a single line, because 90px of height cannot wrap.
 */
export const SIZES = {
  "meta-1x1": { w: 1080, h: 1080, pad: 88, head: 104, eyebrow: 22, body: 26, btn: 26, rule: 64 },
  "meta-4x5": { w: 1080, h: 1350, pad: 92, head: 112, eyebrow: 23, body: 27, btn: 27, rule: 68 },
  "story-9x16": { w: 1080, h: 1920, pad: 96, head: 132, eyebrow: 26, body: 30, btn: 30, rule: 80, safeTop: 250, safeBottom: 250 },
  "disp-300x250": { w: 300, h: 250, pad: 22, head: 30, eyebrow: 9, body: 10, btn: 11, rule: 22, tight: true },
  "disp-336x280": { w: 336, h: 280, pad: 24, head: 33, eyebrow: 9, body: 11, btn: 11, rule: 24, tight: true },
  "disp-300x600": { w: 300, h: 600, pad: 28, head: 40, eyebrow: 10, body: 12, btn: 12, rule: 28 },
  "disp-728x90": { w: 728, h: 90, pad: 20, head: 26, eyebrow: 8, body: 10, btn: 11, rule: 0, banner: true },
};

/**
 * How hard a line lands. This is a type treatment, not a colour change: size,
 * weight and letter-spacing are what make a headline read as calm or urgent,
 * and keeping the palette fixed means a loud slide is still on-brand.
 *
 * `emotion` is deliberately absent — it belongs to the words. A line reads as
 * urgent because of what it says; type can amplify that but cannot create it.
 */
export const LOUDNESS = {
  whisper: { scale: 0.78, weight: -100, tracking: "0.01em", caps: false },
  quiet: { scale: 0.9, weight: -50, tracking: "0", caps: false },
  normal: { scale: 1, weight: 0, tracking: null, caps: false },
  loud: { scale: 1.12, weight: 50, tracking: "-0.025em", caps: false },
  shout: { scale: 1.26, weight: 100, tracking: "-0.03em", caps: true },
};

export function loadBrand(brandPath) {
  const p = brandPath.includes("/") ? brandPath : resolve(SKILL_ROOT, "brands", `${brandPath}.json`);
  const brand = JSON.parse(readFileSync(p, "utf8"));
  brand._dir = dirname(resolve(p));
  return brand;
}

/** Inline the monogram so a rendered frame needs no file server. */
export function markTag(brand, className = "mark") {
  if (!brand.logo?.markPath) return "";
  const svg = readFileSync(resolve(SKILL_ROOT, brand.logo.markPath), "utf8");
  const uri = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
  return `<img class="${className}" src="${uri}" alt="">`;
}

export function textureTag(svgPath, opacity) {
  const svg = readFileSync(svgPath, "utf8");
  const uri = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
  return `<img class="bg bg-img" style="opacity:${opacity}" src="${uri}" alt="">`;
}

/**
 * One ad frame as a complete HTML document.
 *
 * Everything is inline style rather than a stylesheet because these render one
 * frame per page load in headless Chromium — there is nothing to cache, and
 * keeping it in one string makes the whole frame greppable when a layout is
 * wrong.
 */
export function html({
  size, brand, headline, sub, eyebrow, cta, fine, mark, bg,
  loudness = "normal", scale = 1, align = "center", vAlign = "center",
}) {
  const s = SIZES[size];
  if (!s) throw new Error(`Unknown size "${size}". Known: ${Object.keys(SIZES).join(", ")}`);
  const c = brand.colours;
  const f = brand.fonts;
  const banner = Boolean(s.banner);
  const footBottom = (s.safeBottom || 0) + Math.round(s.pad * 0.5);

  const L = LOUDNESS[loudness] || LOUDNESS.normal;
  // A brand can forbid all-caps display type — many serif faces are drawn for
  // mixed case and look amateurish shouted — so `shout` raises weight and size
  // instead unless the brand opts in.
  const caps = L.caps && f.allowDisplayCaps !== false;
  const headSize = Math.round(s.head * L.scale * scale);
  const headWeight = Math.min(900, (f.displayWeight || 600) + L.weight);

  const justify =
    vAlign === "top" ? "flex-start" : vAlign === "bottom" ? "flex-end" : "center";
  const items = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  // Leave room for the footer when text is pushed to the bottom, or it collides.
  const vPad = vAlign === "bottom" ? `${footBottom + Math.round(s.body * 2.4)}px` : `${s.pad}px`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${f.googleFontsHref}" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${s.w}px;height:${s.h}px;background:${c.ground};font-family:'${f.bodyFamily}',sans-serif;overflow:hidden}
  .bg{position:absolute;pointer-events:none}
  .bg-img{inset:0;width:100%;height:100%;object-fit:cover}
  .frame{position:relative;width:100%;height:100%;padding:${s.pad}px ${s.pad}px ${vPad};display:flex;
    ${banner
      ? "flex-direction:row;align-items:center;gap:28px"
      : `flex-direction:column;align-items:${items};justify-content:${justify};text-align:${align}`}}
  .eyebrow{font-size:${s.eyebrow}px;font-weight:600;letter-spacing:.12em;color:${c.accent};text-transform:uppercase;white-space:nowrap}
  .head{white-space:${banner ? "nowrap" : "normal"};font-family:'${f.displayFamily}',serif;font-weight:${headWeight};
    font-size:${banner ? s.head : headSize}px;line-height:${f.displayLineHeight};
    letter-spacing:${L.tracking ?? f.displayTracking};color:${c.ink};
    ${caps ? "text-transform:uppercase;" : ""}
    margin:${banner ? 0 : Math.round(headSize * 0.16)}px 0}
  .rule{align-self:${items};width:${s.rule}px;height:${Math.max(2, Math.round(s.w / 360))}px;background:${c.accent};margin-bottom:${Math.round(s.body * 0.9)}px}
  .sub{font-size:${s.body}px;line-height:1.5;color:${c.body};max-width:${banner ? "none" : "78%"}}
  .cta{display:inline-block;background:${c.accent};color:#fff;font-size:${s.btn}px;font-weight:600;
    padding:${Math.round(s.btn * 0.62)}px ${Math.round(s.btn * 1.5)}px;border-radius:${brand.button?.radius || "0.4em"};
    margin-top:${banner ? 0 : Math.round(s.body * 1.1)}px;white-space:nowrap}
  .foot{position:absolute;left:${s.pad}px;right:${s.pad}px;bottom:${footBottom}px;
    display:flex;align-items:flex-end;gap:${Math.round(s.pad * 0.4)}px}
  .fine{flex:1;text-align:right;font-size:${Math.max(9, Math.round(s.body * 0.6))}px;color:${c.ink};opacity:.6;line-height:1.45}
  .mark{width:${Math.round(s.w * (s.tight || banner ? 0.075 : 0.05))}px;flex:none;display:block}
</style></head><body>
<div class="frame">
  ${bg || ""}
  ${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ""}
  <div class="head">${headline}</div>
  ${s.rule ? '<div class="rule"></div>' : ""}
  ${sub ? `<div class="sub">${sub}</div>` : ""}
  ${cta ? `<div class="cta">${cta}</div>` : ""}
  <div class="foot">${mark || ""}${fine ? `<div class="fine">${fine}</div>` : ""}</div>
</div></body></html>`;
}
