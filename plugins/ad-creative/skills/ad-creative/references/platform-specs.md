# Platform specs

Character limits, placements and the constraints that are easy to discover the hard way.

## Meta — Facebook and Instagram

| Field | Limit | Notes |
|---|---|---|
| Primary text | 125 | Truncates with "… See more" beyond this |
| Headline | 40 | |
| Link description | 30 | Often not shown at all on mobile placements |
| CTA button | Fixed list | Not free text — "Apply Now", "Learn More", "Sign Up", "Get Offer", "Book Now" |

Placements worth rendering: **1080×1080** (1:1, safest default), **1080×1350** (4:5, most feed real
estate), **1080×1920** (9:16, Stories and Reels).

**The 9:16 safe zones are the thing people get wrong.** The top and bottom 250px are covered by
platform UI — the profile row and the swipe affordance. Anything there is invisible in practice, and
the usual casualty is the legal line, which is exactly the element that has to stay readable. The
renderer pins the footer above the bottom safe zone automatically; if you hand-build a frame, do the
same.

**Instant forms vs link ads.** If a campaign collects a phone number and something automated calls
it, a Meta instant form takes the number *without* whatever disclosure the website form carries.
Either run link ads to the landing page, or reproduce the disclosure and the privacy link inside the
instant form first. This is a consent question, not a conversion one.

## Google — responsive search ads

| Field | Limit | Count |
|---|---|---|
| Headline | 30 | up to 15 |
| Description | 90 | up to 4 |
| Display path | 15 | 2 segments |

Headlines are assembled in unpredictable combinations, so each one has to make sense alone and
none may depend on another for grammar.

## Google — video ads

| Field | Limit |
|---|---|
| Headline | 15 |
| Long headline | 90 |
| Description | 90 |

15 characters is brutally short. "Ten seats. Free" is 15. Plan for it rather than trimming a longer
line down.

## Google Display

Highest-inventory sizes, in order: **300×250**, **336×280**, **728×90**, **300×600**, **160×600**,
**320×50**.

A 728×90 is 90px tall — one line of headline plus a button, nothing else. A 320×50 is six words at
most. Both need a flat single-line form of the headline rather than the wrapped version.

## YouTube Shorts

Vertical, under 3 minutes, classified automatically — `#Shorts` in the description is belt and
braces rather than required.

**Shorts render neither end screens nor cards.** The description is the only route out of the video,
so the link belongs in the first two or three lines, above the "…more" fold.

| Field | Limit |
|---|---|
| Title | 100 (about 60 visible) |
| Description | 5000 |
| Tags | 500 total |

## Video encoding

H.264, `yuv420p`, `+faststart`. `yuv420p` matters — other pixel formats play in a desktop player
and then fail to render on a phone or in a browser preview, which is a confusing bug to chase.

**Transitions eat time.** Each crossfade overlaps two slides, so the finished timeline is shorter
than the sum of slide durations by one transition per cut. Five 4s slides with 0.7s fades is 17.2s,
not 20s. `reel.mjs` solves per-slide duration from the target length for this reason.

Useful `xfade` transitions: `slideleft`, `slideright`, `slideup`, `slidedown`, `wipeleft`,
`wiperight`, `fade`, `dissolve`, `circleopen`, `smoothleft`.
