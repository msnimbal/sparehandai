# Media sources

Three connector categories feed a reel. None is required — a reel can be cut from the client's own
photos, a synthesised bed and no voice — but each one, when connected, changes what is possible.
`CONNECTORS.md` at the plugin root lists the products that fill each category.

Before any call that costs money, **show the cost and wait.** A person asking for "use the video
generator" has given permission for the job, not for an unbounded number of retries on their
account. Preflight where the connector supports it, and say the total, not the per-item price.

## `~~stock media` — images, vectors, video, music, sound effects

What to reach for, by job:

| Job | Media type | Notes |
|---|---|---|
| Characters or scenes to animate | Illustrations, vectors | Flat vector art animates cleanly and reads as illustration, which claims nothing. Prefer a set that shares a style. |
| Logos, icons, linework | **SVG** vectors | One file serves every placement with no resampling. |
| B-roll behind copy | Video | Check it clears ad-motionify's fitness gate at the placement before building on it. |
| The bed | Music, ≤ 30s | It will be looped and ducked; pick for energy and key, not for melody. |
| Punctuation | Sound effects | A whoosh on a transition, a pop on a text reveal. Two or three per reel, at most. |

Method:

- **Keep the licence with the file.** Save an attribution sidecar next to every download — source
  page, author, licence, date. The download tool may write it for you; check that it did.
- **Read the licence for the use.** Most stock licences allow commercial use but forbid implying that
  an identifiable person endorses the business, and forbid using trademarks. A photo of a real person
  in an ad is an endorsement by implication; an illustration is not.
- **Private collections need the owner's session.** A collection the person saved while signed in is
  invisible to an API and returns a 404 to a signed-out browser. Read it through their signed-in
  browser, then download by item id.
- **Landscape art for a vertical placement:** extend it (outpaint, via `~~video generator`) rather
  than cropping, when the subject fills the frame. Cropping a 4:3 scene to 9:16 keeps 42% of it.
- **A cutout on a transparent ground needs a ground.** Put it on a flat colour with a floor shadow
  that matches the other scenes' style, before animating — a model given transparency invents a
  background.
- **Music is a download.** Say the filename, source and size, and get a yes before fetching it.

## `~~video generator` — animation, extension, camera and effects

What it is for here:

- **Image-to-video**: animating a still — a character gesturing, hair moving, a camera push-in.
- **Outpaint / reframe**: extending art to the placement's aspect before animating it.
- **Background removal**: isolating a subject to re-ground it.
- **Camera moves and effect presets**: push-in, pull-back, orbit, crane, whip. Cinematic motion that
  ffmpeg cannot make from a still.

Method:

- **Generate 5s, use 1–4s.** Motion models spend their first half-second settling and their last
  second drifting. Pick the window in `reel.json` with `from`.
- **Lock the style in the prompt.** "Flat 2D vector animation; keep the exact illustration style,
  colours, line work and composition; no text, no letters, no new objects, no new people." Each
  clause is there because a model broke it once.
- **Keep the copy zones empty.** Say which part of the frame must stay plain ("the top third stays
  plain wall"). A push-in moves the subject toward the edges; a shot whose copy sits at the top needs
  a subject that starts below centre.
- **Batch, then look.** Submit the shots together, then check every clip as a strip of frames
  (`ffmpeg -i clip.mp4 -vf "fps=1.2,scale=180:-1,tile=6x1" strip.png`) before cutting. You are looking for
  anything the model added: a face, a word, an extra hand, a colour bleed.
- **Decline suggestions, don't accept them silently.** Some connectors answer a request with a preset
  recommendation instead of running the job. Declining keeps the look that was agreed; accepting
  changes the ad.
- **Never photoreal, never evidence.** Animating stock illustration is atmosphere. A realistic
  "customer", a synthetic "workshop in progress", the client's premises or team generated from
  nothing are factual claims the business cannot back. Refuse at any budget.

## `~~voice` — the voiceover

- **Pick from the existing voices first.** Filter by accent, age and energy from the brief ("Australian,
  male, mid-40s, energetic"); a designed or cloned voice is a separate, heavier step.
- **Never clone a real person** without their written consent, and never imitate a named one.
- **Write to the clock.** An energetic read runs about 2.6 words a second. An 18s reel holds roughly 40
  words once the end card has room to breathe. Count before generating.
- **Open on the strongest word.** No "Hey guys", no breath.
- **Two takes, then choose.** Takes differ by a second or more in length; pick by ear and by fit.
- **Direct the delivery** with the model's own tags where it supports them (`[excited]`), sparingly.
- **Short list items read fast.** "Dentist? Accountant?" comes out at 0.7s each — natural, and too fast to
  cut picture to. Fix it with `beats.mjs --air`, not a new take.
- **Disclose it.** A synthetic voice needs the platform's AI label; most publishing APIs cannot set it,
  so it is a manual step after posting. Say so at hand-over.

## Transition vocabulary

`cut.mjs` takes any ffmpeg `xfade` name. Chosen by what the cut means, not by variety:

| Film grammar | `xfade` | Use for |
|---|---|---|
| Tracking / whip pan | `smoothleft`, `smoothright` | Moving between parallel subjects — one business, then the next. Reads as one camera travelling. |
| Iris | `circleopen`, `circleclose` | A cartoon's "and now…" — into a payoff or a summary shot. |
| Dissolve | `fade`, `dissolve` | Into the end card; time passing. |
| Push | `zoomin` | Into detail. |
| Feed scroll | `slideup` | Native-feeling in Reels and Shorts. |

Keep transitions at 0.3–0.5s. The cut is timed to the voice; a slow transition smears the beat.
