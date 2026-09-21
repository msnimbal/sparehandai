# Ad creative

Turns an offer into the creative needed to run it: static ads at every Meta and Google placement,
and a short silent video for vertical feeds.

Everything is rendered from HTML in headless Chromium. An ad carries a date, sometimes a price, and
a legal line — an image model can't be trusted to render any of those character-accurate, or to hit
an exact hex. Rendering from code means the brand colour is the brand colour, the type is the real
typeface, and a copy change is a re-run rather than a redraw.

## What it produces

- 1080×1080, 1080×1350 and 1080×1920 for Meta
- 300×250, 336×280, 300×600 and 728×90 for Google Display
- a silent MP4 for Reels, Stories and Shorts, with configurable length and transition
- a contact sheet of the whole set on one page

## Install

```bash
npm install --prefix skills/ad-creative
npx --prefix skills/ad-creative playwright install chromium
```

`ffmpeg` is needed for **video only** — statics render without it. `reel.mjs` checks for it before
rendering anything and prints the install command for your platform:

| | |
|---|---|
| macOS | `brew install ffmpeg` |
| Windows | `winget install Gyan.FFmpeg`, then open a **new** terminal |
| Debian/Ubuntu | `sudo apt install ffmpeg` |

**On Windows**, `~` doesn't expand in cmd or PowerShell — use `$env:USERPROFILE`, or `cd` into the
skill folder and drop `--prefix`. Everything else works; it just hasn't been tested there yet.

## Use

Ask for ads and the skill will interview you for the offer, write the copy against platform limits,
and render. Directly:

```bash
cd skills/ad-creative
node scripts/render.mjs --campaign ./campaign.json
node scripts/reel.mjs   --campaign ./campaign.json --seconds 13 --transition slideleft
node scripts/contact-sheet.mjs --out ./out
```

## Brands

`brands/sparehand.json` ships complete. For another business, derive a starting point from their
site and confirm it with them:

```bash
node scripts/extract-brand.mjs --url https://theirsite.com --out ./brand.json
```

It samples the live page — resolving colours through the browser, so `oklch()` and friends work —
and reports what it observed alongside what it picked. It cannot scrape the legal identity, a
vector logo, or what the client is allowed to claim. Those have to be asked for.

## Why some of this is not style preference

`references/copy-rules.md` carries claim rules that exist because the alternative is consumer-law
exposure or a platform manual action: no invented review signals, no unevidenced client claims, no
performance guarantees, and scarcity that stays true for as long as the ad runs.
