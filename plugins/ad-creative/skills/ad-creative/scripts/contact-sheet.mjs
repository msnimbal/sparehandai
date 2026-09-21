#!/usr/bin/env node
/**
 * Lay every rendered PNG onto one page, grouped by variant, so the set can be
 * judged together. Reviewing 28 files one at a time hides inconsistency; a
 * contact sheet makes an odd one out obvious in a glance.
 *
 *   node contact-sheet.mjs --out ./out [--title "Campaign name"]
 */
import { launchBrowser } from "./browser.mjs";
import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const OUT = resolve(arg("out", "./out"));
const TITLE = arg("title", "Ad creative");

const files = readdirSync(OUT)
  .filter((f) => f.endsWith(".png") && !f.startsWith("contact-sheet"))
  .sort();

if (!files.length) {
  console.error(`No PNGs in ${OUT} — run render.mjs first.`);
  process.exit(1);
}

const groups = {};
for (const f of files) (groups[f.split("-")[0]] ||= []).push(f);

const cell = (f) => {
  const uri = "data:image/png;base64," + readFileSync(join(OUT, f)).toString("base64");
  const label = f.replace(/^[^-]+-/, "").replace(".png", "");
  return `<figure style="margin:0"><img src="${uri}" style="display:block;width:100%;border:1px solid #ddd">
    <figcaption style="font:400 11px/1.4 -apple-system,sans-serif;color:#888;padding-top:5px">${label}</figcaption></figure>`;
};

const body = Object.entries(groups)
  .map(
    ([v, fs]) => `<section style="margin-bottom:34px">
      <h2 style="font:600 15px/1 -apple-system,sans-serif;margin:0 0 12px">Variant ${v}</h2>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;align-items:start">${fs.map(cell).join("")}</div>
    </section>`,
  )
  .join("");

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
await page.setContent(`<body style="margin:0;padding:34px;width:1400px;background:#fff">
  <h1 style="font:600 20px/1 -apple-system,sans-serif;margin:0 0 6px">${TITLE}</h1>
  <p style="font:400 12px/1.5 -apple-system,sans-serif;color:#888;margin:0 0 26px">
    ${files.length} creatives · ${Object.keys(groups).length} variants</p>
  ${body}</body>`);
await page.screenshot({ path: join(OUT, "contact-sheet.png"), fullPage: true });
await page.close();
await browser.close();

console.log(join(OUT, "contact-sheet.png"));
