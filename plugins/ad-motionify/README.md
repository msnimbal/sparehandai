# ad-motionify

Motion for ads whose words are already right.

[`ad-creative`](../ad-creative) produces the ad — copy, palette, type, legal line, every placement.
This gives it a background, movement and sound, without re-rendering a single character of the copy.

```bash
node <ad-creative>/scripts/export-layers.mjs --campaign ./campaign.json --out ./layers
node scripts/inventory.mjs --assets ./assets --out ./inventory.json
node scripts/plan.mjs      --manifest ./motion.json --out ./timeline.json
node scripts/propose.mjs   --timeline ./timeline.json     # look at the frames
node scripts/assemble.mjs  --timeline ./timeline.json     # once approved
```

## Why it is a separate plugin

`ad-creative` has to keep working for someone with nothing but a browser and ffmpeg. Compositing
over footage assumes more — b-roll, or a model, or an assembler — so it lives here instead of as a
flag there. Nothing in this plugin can break a plain static render.

## What it needs

**node and ffmpeg.** That is the whole list — there are no npm dependencies, including no image
library: the procedural plates are written by a PNG encoder built on node's own zlib.

## What it does

- **Routes on what you actually have.** Real footage where it fits the placement, generated plates
  where it does not — decided per placement, because a landscape photo library is usable at 1:1 and
  unusable at 9:16.
- **Gates assets on fitness, not presence.** Resolution, crop retention, vector exemption, and
  excluding last month's finished ads from becoming this month's backgrounds.
- **Generates brand-exact plates** — wash, phyllotaxis, flow, rings, grid, noise. Deterministic from
  a seed, exact to the hex, about a second each.
- **Measures the scrim** rather than picking one, using the element boxes ad-creative exports.
- **Loops seamlessly**, so one short plate fills any duration.
- **Synthesises a bed** at a level that sits under the picture.
- **Refuses to render** until a human has looked at proposal frames.

## What it will not do

Generate a photograph of something that did not happen. Texture and abstraction claim nothing and
are generated freely; premises, teams, events, products and customers are factual claims about a
business and have to be real. The missing feature is the point.

MIT.
