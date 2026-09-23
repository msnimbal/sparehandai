# ad-reel-studio

A voiced short-form video ad, from hook to MP4.

[`ad-creative`](../ad-creative) makes the words right. [`ad-motionify`](../ad-motionify) gives them a
background. This chains both and adds what neither does: hook research, stock sourcing, animated
stills, an AI voiceover, and a cut timed to the voice.

```bash
node scripts/beats.mjs --vo ./audio/take.mp3 --out ./audio --air 2:0.4,3:0.4   # phrases + air
node <ad-creative>/scripts/export-layers.mjs --campaign ./campaign.json --out ./layers
node scripts/cut.mjs --reel ./reel.json --propose                               # look at the frames
node scripts/cut.mjs --reel ./reel.json                                         # once approved
```

## Why a separate plugin

Each sibling keeps a promise this one would break. ad-creative works with nothing but a browser and
ffmpeg; ad-motionify works without any paid model. A voiced, animated reel needs a voice, usually a
generator, and a clock that ad-motionify's equal-length slides can't express. So it lives here, and
both siblings stay as they were.

It is the first of a family — `ad-<format>-studio` — each chaining the same two for a longer format.

## What it does

- **Times picture to the voice.** Shots start on phrases (`"at": "phrase:3"`), found from the take's own
  pauses. Short list items get air opened after them instead of a re-record.
- **Composites the copy unchanged.** ad-creative's transparent layers go on top as-is, so the date,
  CTA and legal line are the pixels that were verified.
- **Sizes caption cards from the copy's alpha**, so every block — eyebrow included — sits on a card
  in the brand ground over any scene.
- **Builds a grid shot** of up to four animated tiles between the upper copy and the footer.
- **Ducks the bed under the voice** and writes a silent copy for editors.
- **Refuses to render** until a human has approved proof frames.

## What it needs

**node and ffmpeg**, plus ad-creative. Connectors for stock media, a video generator and a voice are
optional — see [CONNECTORS.md](CONNECTORS.md). No npm dependencies.

## Tests

```bash
cd skills/ad-reel-studio && npm test
```

Timing, retime, panel and PNG logic are pure and tested without ffmpeg or files.

MIT.
