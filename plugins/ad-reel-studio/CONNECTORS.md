# Connectors

## How tool references work

Plugin files use `~~category` as a placeholder for whatever tool you connect in that category. The
skill describes the workflow in terms of categories, so it works with whatever you already use.

## Connectors for this plugin

All optional. Each one widens what a reel can contain; none is needed for a cut to exist.

| Category | Placeholder | Used for | Options |
| --- | --- | --- | --- |
| Stock media | `~~stock media` | Images, illustrations, **SVG vectors**, video b-roll, **music**, **sound effects** | Pixabay, Pexels, Unsplash (images), Freesound (SFX), Epidemic Sound, Artlist |
| Video generator | `~~video generator` | Animating stills, outpainting to 9:16, background removal, camera moves and effect presets | Higgsfield, Runway, Kling, Luma, Pika |
| Voice | `~~voice` | AI voiceover from a script; picking or designing a voice | ElevenLabs, PlayHT, Cartesia |
| Publisher | `~~publisher` | Posting the finished reel | Meta Graph API (Instagram + Facebook), YouTube Data API, TikTok Content Posting API |

## Required

- **ad-creative** (this marketplace) — brand, copy and the verified copy layers.
- **node** and **ffmpeg**.

**ad-motionify** is recommended: its fitness gate decides whether stock and client assets are usable
at a placement, and its generated plates fill shots that have no asset at all.

## If a category is missing

| Missing | What happens |
| --- | --- |
| Stock media | Use the client's own assets, or ad-motionify's generated plates. |
| Video generator | Stills move with ad-motionify's drift instead of animating. Still a finished reel. |
| Voice | A silent cut with the words on screen — how most feeds are watched anyway. Or a human-recorded take through `beats.mjs`, which works on any audio file. |
| Publisher | Hand the MP4 over; the person posts it. |
