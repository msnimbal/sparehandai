---
name: ad-reel-studio
description: "Make a finished, voiced short-form video ad — a Reel, Story, Short or TikTok — end to end: research the hook, write the script to the clock, source stock images, vectors, video, music and sound effects, animate stills with a video generator, record an AI voiceover, and cut picture to the voice with ad-creative's exact copy and legal line on every frame. Use this whenever someone wants a reel, a video ad, an animated ad, a promo with a voiceover or music, wants to animate illustrations or cartoons for an ad, wants hooks for a video, or names a stock library, a video generator or a voice tool for an ad. Chains ad-creative (brand, copy, layers) and ad-motionify (asset fitness, generated plates)."
---

# A voiced reel, from hook to MP4

`ad-creative` makes the words right. `ad-motionify` gives them a background. This skill makes the
thing people mean when they say "a reel": a hook in the first second, moving pictures, a voice, a
bed, and cuts that land on the words — with the date, the CTA and the legal line still exact.

It orchestrates rather than replaces. Brand, copy, character counts, the approval-by-picture habit
and the claims rules all come from `ad-creative`; asset fitness and generated plates from
`ad-motionify`. What is new here is the part neither can do: **the voice is the clock.**

## Order of operations

0. **Locate the sibling skills** and check ffmpeg.
1. **Brand** — from ad-creative.
2. **Hook** — research, then write three.
3. **Script to the clock** — VO lines, shots and on-screen words in one table.
4. **Sources** — what exists, what to fetch, what to generate. Show costs.
5. **Copy layers** — one ad-creative slide per shot, exported transparent.
6. **Voice** — takes, then phrases, then air.
7. **Animate** — the stills that need to move.
8. **Propose** — proof frames; get approval against pictures.
9. **Cut** — the MP4, then look at it at full size.
10. **Hand over** — and publish only on an explicit yes.

## 0. Locate the sibling skills

This skill calls scripts from its siblings. Find the newest installed copy of each rather than
assuming a version, because a plugin update lands in a new versioned folder:

```bash
AC=$(ls -d ~/.claude/plugins/cache/*/ad-creative/*/skills/ad-creative | sort -V | tail -1)
AM=$(ls -d ~/.claude/plugins/cache/*/ad-motionify/*/skills/ad-motionify | sort -V | tail -1)
RS=$(ls -d ~/.claude/plugins/cache/*/ad-reel-studio/*/skills/ad-reel-studio | sort -V | tail -1)
node $AC/scripts/setup.mjs     # Playwright + Chromium for ad-creative; exits fast if present
```

If ad-creative isn't installed, stop and say so: without it there is no verified copy layer, and a
reel whose legal line was typed by hand into an editor is exactly the failure this is built to avoid.

## 1. Brand

Follow ad-creative's section 1 to the letter — there is no default brand. If a `brand.json` already
exists for this business, reuse it and say which one.

**The person may relax the brand for a reel** — keeping illustrations' own colours, say, where the
guidelines forbid cool tones. Record that as their decision. The type, the accent on the CTA, the
caption panels in the brand ground and the end card still carry the brand.

## 2. Hook

Read **`references/hooks.md`**. Spend ten minutes in the sources it lists, note the shapes that recur,
and write **three hooks of different types** — say a callout, a visual hook and a specific-number
line — for this business. Each must work with the sound off in 1.5 seconds.

The hook decides the first shot, so it is chosen before the script, not after.

## 3. Script to the clock

Write one table and get it approved before spending anything:

| # | Shot (what we see) | VO line | On-screen words | ~s |
|---|---|---|---|---|
| 1 | Dentist at work, push-in | "Now calling Sydney business owners! Dentist?" | Dentist? | 2.8 |
| 2 | Office worker looks up | "Accountant?" | Accountant? | 1.2 |
| … | | | | |
| 7 | Brand end card | "Ten seats only. Apply now!" | Ten seats. It's free. + CTA | 3.0 |

- **Budget the words.** An energetic read runs ~2.6 words/second. 18s holds about 40 words.
  Count them programmatically, as ad-creative does for headlines.
- **On-screen words obey ad-creative's 9:16 line budget** (~14 characters a line). Run its copy rules
  over every line — the VO is copy too, and the same claims rules apply to what is spoken.
- **The CTA spoken and the CTA on screen should agree** with the landing page. If they can't all
  match, say which one differs and why.
- **Keep the legal line on every frame.** It rides in the layer footer, so this is automatic as long
  as every shot uses a layer.

## 4. Sources

Read **`references/media-sources.md`**. For every shot, decide: an asset the person already has, a
stock item to fetch, or a generation. Then:

- **Inventory what exists** with ad-motionify's fitness gate before building on it:
  `node $AM/scripts/inventory.mjs --assets ./assets --out ./inventory.json`.
- **Fetch stock** through `~~stock media` — images, SVG vectors, video, music, sound effects — with
  licence sidecars. Downloads of music and SFX are confirmed first: filename, source, size.
- **Plan generations** through `~~video generator` and `~~voice`: the model, the count, the prompt in
  full, and **the total cost, preflighted**, in one message. Wait for a yes.
- **No connector for a category** is a real answer, not a blocker: no voice means a silent cut with
  words on screen; no generator means stills with ad-motionify's drift, or its generated plates.

## 5. Copy layers

In a `campaign.json` for ad-creative, write **one reel slide per shot**, in order — slide N carries
shot N's on-screen words. Put copy where the picture is empty: `vAlign: "top"` over a plain wall,
`"bottom"` when a face fills the top. Then:

```bash
node $AC/scripts/export-layers.mjs --campaign ./campaign.json --out ./layers
```

Its overlap check still runs; a collision with the fine print is a hard failure here as everywhere.

## 6. Voice

Generate **two takes** of the approved VO script through `~~voice`, download both, pick one by ear.
Then find its phrases:

```bash
node $RS/scripts/beats.mjs --vo ./audio/take-a.mp3 --out ./audio
```

It prints each phrase with its time. Read the list against the script. Where a shot has to land on a
short phrase — a list of jobs, a one-word callout — **open air after it** rather than re-recording:

```bash
node $RS/scripts/beats.mjs --vo ./audio/take-a.mp3 --out ./audio --air 2:0.4,3:0.4,4:0.4,5:0.25
```

About 0.4s after each list item gives a 0.4s transition room to land. Check the new total still fits.

## 7. Animate

Only the shots that must move. Extend landscape art to the placement first, then animate, as
`references/media-sources.md` describes. Submit as one batch; when they return, **look at every clip
as a strip of frames** before using it. Save clips to `./clips/`.

## 8. Propose

Write `reel.json` — see **`references/reel-manifest.md`** and `examples/reel.example.json`. Shots
reference layers by slide number and times by phrase (`"at": "phrase:3"`). Then:

```bash
node $RS/scripts/cut.mjs --reel ./reel.json --propose
```

Put the contact sheet in front of the person and ask ad-motionify's five questions — **assets** (right
thing to show?), **business** (recognisably theirs?), **language** (read the VO aloud), **emotions**
(right tone, not bossy?), **blurb** (fine print correct and still true?). Look yourself too, for what
proofs catch here specifically: a caption card over a face, a grid crop that beheads someone, copy on a
colour it can't be read against.

Then set `"approved": true`.

## 9. Cut

```bash
node $RS/scripts/cut.mjs --reel ./reel.json
```

Writes the MP4, a silent copy for editors, and a timeline. Then **watch it**, and pull full-size frames
of the moments that break first: the fine print on the busiest background, every grid tile, the end
card. Loudness should land near −16 LUFS integrated; the bed should be audible in the gaps and gone
under the words.

## 10. Hand over

Say where the files are and what a human still has to do:

- **The AI label.** A synthetic voice or generated animation needs the platform's AI-content label.
  Publishing APIs usually can't set it; it's a manual step after posting.
- **Anything unverified** — a seat count, a date, a claim in the VO.
- **Any brand rule the person chose to relax**, so the next person doesn't "fix" it.

**Publishing is public.** If a publisher is connected, dry-run it, show the exact caption and targets,
and publish only on an explicit yes in this conversation. Taking a post down again is the person's
job in the platform's app — some APIs can post but cannot delete, and deleting is not reversible.

## What this will not do

- **Generate evidence.** No photoreal customers, events, premises or results — see ad-creative's
  *generate atmosphere, never evidence*. Animated stock illustration is atmosphere.
- **Clone or imitate a real person's voice** without their written consent.
- **Spend without showing the number first.**

## Files

```
scripts/beats.mjs           VO take -> phrases, optional air, beats.json + vo.wav
scripts/cut.mjs             reel.json -> proof frames (--propose) or the MP4s
scripts/lib/timeline.mjs    pure: shots + phrases -> cut times, durations, xfade offsets
scripts/lib/beats.mjs       pure: silences -> phrases -> retime plan
scripts/lib/panels.mjs      pure: copy alpha -> rounded caption cards, grid masks
scripts/lib/png.mjs         PNG encode/decode on node's zlib
references/hooks.md         where to find hooks, hook types, measuring them
references/media-sources.md stock, generator, voice: method and failure modes; transition vocabulary
references/reel-manifest.md every reel.json field
examples/reel.example.json  the Oct 31 workshop reel, as cut
```
