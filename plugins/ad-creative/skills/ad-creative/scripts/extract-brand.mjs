#!/usr/bin/env node
/**
 * Sample a live website and propose a brand.json.
 *
 *   node extract-brand.mjs --url https://example.com.au [--out ./brand.json]
 *
 * This is a starting point, not an answer. It reads what the site actually
 * renders — computed colours weighted by how much area they cover, the fonts
 * headings and body are really set in, and the most common button treatment —
 * which beats eyeballing a screenshot. But it cannot know which colour is the
 * brand and which is incidental chrome, and it knows nothing about the legal
 * identity or the claims the client is allowed to make.
 *
 * Always show the result to the person and confirm it before rendering.
 */
import { launchBrowser } from "./browser.mjs";
import { writeFileSync } from "fs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const url = arg("url");
if (!url) {
  console.error("Usage: node extract-brand.mjs --url https://example.com [--out ./brand.json]");
  process.exit(1);
}

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 2000 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });

const sample = await page.evaluate(() => {
  // Resolve any CSS colour by painting it, rather than parsing the string.
  // Modern sites use oklch()/color()/lab(), where digit-scraping a regex
  // produces convincing garbage — "oklch(97% 0.015 75)" yields "#9701575".
  // Painting one pixel makes the browser do the conversion for every format
  // it supports, including whatever replaces oklch next.
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  const cache = new Map();
  const rgb = (v) => {
    const key = String(v);
    if (cache.has(key)) return cache.get(key);
    let hex = null;
    try {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = key;
      // An unparseable value leaves fillStyle at the previous colour; treat a
      // no-op as "no colour" rather than silently recording black.
      if (ctx.fillStyle !== "#000000" || /^(#000000|black|rgb\(0, 0, 0\))$/i.test(key.trim())) {
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        hex = a < 8 ? null : "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase();
      }
    } catch {
      hex = null;
    }
    cache.set(key, hex);
    return hex;
  };

  const bgArea = {};
  const textArea = {};
  const fontUse = {};
  let buttonRadius = null;
  let buttonBg = null;

  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const area = r.width * r.height;
    const cs = getComputedStyle(el);

    const bg = rgb(cs.backgroundColor);
    if (bg) bgArea[bg] = (bgArea[bg] || 0) + area;

    const text = (el.textContent || "").trim();
    if (text && el.children.length === 0) {
      const col = rgb(cs.color);
      if (col) textArea[col] = (textArea[col] || 0) + text.length;
      const fam = cs.fontFamily.split(",")[0].replace(/["']/g, "").trim();
      const tag = el.tagName.toLowerCase();
      const slot = /^h[1-3]$/.test(tag) ? "display" : "body";
      fontUse[slot] = fontUse[slot] || {};
      fontUse[slot][fam] = (fontUse[slot][fam] || 0) + text.length;
    }

    if (!buttonBg && (el.tagName === "BUTTON" || /\bbtn|button|cta\b/i.test(el.className || ""))) {
      const b = rgb(cs.backgroundColor);
      if (b) {
        buttonBg = b;
        buttonRadius = cs.borderRadius;
      }
    }
  }

  const top = (obj, n = 5) =>
    Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ value: k, weight: Math.round(v) }));

  const pick = (obj) => Object.entries(obj || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Ask the page for its ground rather than inferring it from area. A dark
  // footer or hero often covers more pixels than the page background, so the
  // largest-area colour is frequently the one thing it definitely isn't.
  const pageBackground =
    rgb(getComputedStyle(document.body).backgroundColor) ||
    rgb(getComputedStyle(document.documentElement).backgroundColor) ||
    null;

  // Headings carry the brand's ink; body text is usually a muted step off it,
  // and there is more body text, so weighting by volume picks the wrong one.
  const heading = document.querySelector("h1, h2");
  const headingColour = heading ? rgb(getComputedStyle(heading).color) : null;

  return {
    title: document.title,
    pageBackground,
    headingColour,
    backgrounds: top(bgArea),
    textColours: top(textArea),
    displayFont: pick(fontUse.display),
    bodyFont: pick(fontUse.body),
    buttonBg,
    buttonRadius,
  };
});

await browser.close();

// Relative luminance, for telling a page ground from an accent.
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
};

const ground = sample.pageBackground || sample.backgrounds[0]?.value || "#FFFFFF";
// Prefer the heading colour, but only if it actually reads on the ground — a
// site with a dark hero can give a white heading, which would be invisible on
// a light ad.
const headingUsable = sample.headingColour && contrast(sample.headingColour, ground) >= 4.5;
const ink =
  (headingUsable && sample.headingColour) ||
  sample.textColours.map((t) => t.value).find((c) => contrast(c, ground) >= 4.5) ||
  sample.textColours[0]?.value ||
  "#111111";
const accent =
  sample.buttonBg ||
  sample.backgrounds.map((b) => b.value).find((c) => contrast(c, ground) > 1.6 && contrast(c, ink) > 1.6) ||
  "#DD5230";

const proposed = {
  name: sample.title?.split(/[|—-]/)[0].trim() || "Unknown",
  _source: url,
  _confirm:
    "Sampled from the live site — colours are weighted by rendered area, not read from a brand guide. " +
    "Confirm every value with the client, and fill in legal and claims by hand: they cannot be scraped.",
  colours: {
    ground,
    ink,
    accent,
    body: sample.textColours.map((t) => t.value).find((c) => c !== ink && contrast(c, ground) >= 4.5) || ink,
  },
  _observed: {
    pageBackground: sample.pageBackground,
    headingColour: sample.headingColour,
    backgroundsByArea: sample.backgrounds.map((b) => b.value),
    textColoursByVolume: sample.textColours.map((t) => t.value),
    note: "What was actually on the page, in case the picks above are wrong.",
  },
  contrast: {
    accentOnGround: contrast(accent, ground),
    note:
      contrast(accent, ground) < 4.5
        ? "Under 4.5:1 — usable for large headings, buttons and rules, not for body text or fine print."
        : "Passes AA for body text.",
  },
  fonts: {
    displayFamily: sample.displayFont || "Georgia",
    displayWeight: 600,
    bodyFamily: sample.bodyFont || "Helvetica",
    googleFontsHref: `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
      sample.displayFont || "Georgia",
    )}:wght@600&family=${encodeURIComponent(sample.bodyFont || "Helvetica")}:wght@400;600&display=block`,
    displayTracking: "-0.02em",
    displayLineHeight: 1.05,
    _confirm:
      "Font names come from computed styles and may not exist on Google Fonts. Check googleFontsHref loads, " +
      "or bundle the real files and reference them instead.",
  },
  button: { radius: sample.buttonRadius || "0.4em" },
  logo: { markPath: null, _confirm: "Ask the client for an SVG monogram; a scraped PNG will not hold up at 1080px." },
  legal: { line: null, privacyUrl: null, _confirm: "Required for paid social. Ask for legal entity, ABN and privacy URL." },
  voice: { spelling: "en-AU", description: null, bannedWords: [] },
  claims: {
    forbidden: [
      "star ratings, review counts or aggregate rating markup",
      "testimonials or named client claims",
      "'trusted by' or client-roster claims",
      "performance guarantees",
    ],
    note: "Keep these unless the client can evidence the claim. They are ACL and platform-policy matters.",
  },
};

const out = arg("out", "./brand.json");
writeFileSync(out, JSON.stringify(proposed, null, 2) + "\n");
console.log(JSON.stringify({ written: out, sampled: sample }, null, 2));
