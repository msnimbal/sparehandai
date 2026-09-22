# How assets become decisions

Everything here is `plan.mjs`, which is pure. No files are read, no ffmpeg runs. That is what makes
routing testable against fixture inventories instead of only testable by rendering.

## The decision, per placement

```
for each placement:
  ├─ manifest names explicit files?      -> use them, cycled
  ├─ assets clear the fitness gate here? -> use them (video -> cut, still -> drift)
  └─ otherwise                           -> generate a plate, and record why
```

Per placement, never per campaign. A landscape photo library is usable at 1:1 and unusable at 9:16,
and one decision for the whole campaign gets half the outputs wrong.

## The fitness gate

An asset is usable at a placement when its verdict is `ok` or `marginal`.

| Verdict | Condition | Meaning |
|---|---|---|
| `ok` | upscale ≤ 1.15 and retain ≥ 0.6 | fine |
| `marginal` | upscale ≤ 1.4 or retain ≥ 0.4 | acceptable, worth looking at |
| `too-soft` | upscale > 1.4 | visibly an upscale |
| `wrong-shape` | retain < 0.4 | most of the shot is outside the crop |

`upscale` is the factor needed to cover the target. `retain` is the share of the source frame that
survives the crop.

These are two independent failures. A 2400×1020 photo is high-resolution *and* wrong for 9:16 —
sharpness cannot fix composition, and whatever the shot was about is now off-frame.

## Exemptions

**Vectors** have no native resolution; the upscale gate cannot apply. **Logos** are overlays that
sit at a few percent of the frame width, so scoring a wordmark for full-frame coverage says only
that it is not a photograph. Both are marked `overlay` and scored as such.

A raster with a vector sibling of the same name is dropped in favour of the vector.

## Exclusions

Finished creative is excluded from the input pool:

- inside a `build`, `out`, `output`, `exports`, `renders`, `final` or `layers` folder
- named like a deliverable — `final-*`, `*-Cover.jpg`
- sized within 8px of a known ad placement

The tolerance earns its place: a real finished ad came out of its editor at 1080×1352 and passed an
exact-match check against 1080×1350. Two pixels is the difference between excluding last month's ad
and using it as this month's background.

`--include-finished` overrides, which is occasionally right — a hero still cut from a previous
campaign can be legitimate source material.

## What gets recorded

Every fallback lands in `timeline.json` as a sentence, not a flag:

> `story-9x16: generating a "wash" plate because nothing in the asset folder clears the fitness gate at story-9x16.`

That is what `propose.mjs` prints for approval. A boolean would render identically and tell the
person nothing about whether the decision was right.
