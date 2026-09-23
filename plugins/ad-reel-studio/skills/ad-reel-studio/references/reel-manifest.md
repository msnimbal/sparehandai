# reel.json

Paths resolve against the manifest's own folder, so the job travels as one directory.

```json
{
  "name": "oct31-anyone",
  "layers": "./layers",
  "beats": "./audio/beats.json",
  "music": { "file": "./audio/music.mp3", "lufs": -24 },
  "transition": { "type": "smoothleft", "duration": 0.4 },
  "shots": [
    { "src": "clips/c1.mp4", "layer": 1 },
    { "src": "clips/c2.mp4", "from": 1.4, "layer": 2, "at": "phrase:3" },
    { "grid": [{ "src": "clips/c1.mp4", "focus": [540, 1050] }], "layer": 6, "at": "phrase:8", "transition": "circleopen" },
    { "card": true, "layer": 7, "at": "phrase:9", "transition": "fade" }
  ],
  "approved": false
}
```

## Top level

| Field | Default | Meaning |
|---|---|---|
| `name` | folder name | Output filename stem. |
| `layers` | `./layers` | Folder from ad-creative's `export-layers.mjs`: RGBA PNGs plus `layers.json`. One placement per folder. |
| `beats` | — | `beats.json` from `beats.mjs`. Needed for `"phrase:N"` shot times; also supplies the voice file. |
| `vo` | from `beats` | Override the voice file. |
| `voLufs` | `-16` | Voice loudness. −16 is right for voice-forward social video. |
| `music` | — | `"path"` or `{ "file", "lufs" }`. Looped if short, ducked under the voice, faded out over the last 1.2s. Default −24 LUFS. |
| `transition` | `fade`, `0.4` | Default transition into each shot. |
| `lead` | `0.25` | Seconds a shot cuts in *before* its phrase is spoken. |
| `voDelay` | `0.15` | Seconds of silence before the first word. |
| `tail` | `0.7` | Seconds held after the last word, for the end card to land. |
| `seconds` | voice + tail | Force a length. Refused as a warning if the voice runs past it. |
| `fps` | `30` | |
| `panels` | on | `false` turns caption panels off everywhere; `{ "colour", "alpha" }` restyles them. Colour defaults to the brand ground. |
| `approved` | `false` | `cut.mjs` renders the MP4 only when this is `true`. Set it after looking at `--propose` frames. |

## Shots

Every shot names the ad-creative `layer` (1-based slide number) that carries its copy, and an `at`:
seconds, or `"phrase:N"` from `beats.json`. The first shot always starts at 0.

| Kind | Fields | Notes |
|---|---|---|
| Clip or still | `src`, `from`, `speed`, `panel` | `src` is an MP4/MOV or a PNG/JPG. `from` skips the model's settling frames. `speed` below 1 slows it. A clip shorter than its shot holds its last frame. `panel: false` drops the caption card for this shot. |
| Grid | `grid: [{ src, focus, crop, from, speed }]` | Up to four tiles in a 2×2 on the brand ground, placed between the upper copy and the footer. `focus` is the `[x, y]` to centre each square crop on — set it on the face, and re-check it, because a push-in moves faces up over the clip. |
| Card | `card: true` | Brand ground plus the layer. Use for the CTA. |

`transition` on a shot overrides the default for the cut *into* it.

## What `cut.mjs` writes

- `--propose`: `proposal/shot-N.png` (the middle frame of each shot, fully composited) and
  `proposal/contact-sheet.png`. Also prints each shot's cut time and length.
- Without it: `out/<name>-<placement>-<seconds>s.mp4`, a stream-copied `-silent.mp4` for editors,
  and `<name>….timeline.json` recording every resolved time and any warnings.

Warnings to act on rather than ignore: a shot shorter than 1.5× its transition (it will flash —
add air after its phrase), and a forced `seconds` shorter than the voice.
