# motion.json

Paths are resolved against the manifest file, so the manifest travels with the job.

```json
{
  "brand": "./brand.json",
  "layers": ["./layers", "./layers-1x1"],
  "inventory": "./inventory.json",
  "seconds": [13, 20],
  "fps": 25,
  "budget": { "tier": 0 },
  "background": {
    "kind": "auto",
    "generator": "wash",
    "motion": "warp",
    "files": null
  },
  "audio": { "kind": "bed", "key": "Am", "lufs": -23 },
  "scrim": "auto"
}
```

## Fields

**`brand`** (required) — an ad-creative `brand.json`. The same file, deliberately: two brand
definitions for one business is how the palette drifts.

**`layers`** (required) — folder, or list of folders, each containing `layers.json` and the RGBA
PNGs from `export-layers.mjs`. One folder is one placement; run the exporter once per size into
separate folders, because a second run overwrites `layers.json`.

**`inventory`** — path to `inventory.json`. Omit it and the plan behaves as though there are no
assets, which routes everything to generated plates.

**`seconds`** — a number or a list. Per-slide duration is derived as
`(total + xfade × (slides − 1)) / slides`, which is why `13` produces exactly 13.000s. Planning
refuses a combination that leaves a slide shorter than the transition.

**`fps`** — default 25.

**`budget.tier`** — a ceiling, not a preference. Planning refuses rather than quietly spending past
it. `0` is local-only and is everything this skill does today; `1` is reserved for local models,
`2` for paid services.

### `background`

**`kind`**
- `auto` (default) — real assets where they clear the fitness gate at that placement, generated
  plates where they do not. Decided per placement.
- `assets` — prefer real assets; falls back to generated with a recorded reason if none fit.
- `generated` — always generate.
- `files` — use `background.files`, an explicit list, cycled across slides.

**`generator`** — `wash`, `phyllotaxis`, `flow`, `rings`, `grid`, `noise`. Default `wash`.

**`motion`** — `warp`, `kenburns`, `none`. Default `warp`. A real photograph is drifted rather than
warped whatever you set, and the planner records that it overrode you.

### `audio`

**`kind`** — `bed` (synthesised), `file`, `none`.
**`file`** — path, required for `kind: "file"`. Shorter than the cut is fine; it is boomeranged then
looped.
**`key`** — `Am`, `Cm`, `Dm`. Low pentatonic sets, sparse enough not to imply a progression.
**`lufs`** — default −23. A bed sits under the picture; −16 is voice-forward and will dominate.

### `scrim`

`auto` (default) measures the background and solves for contrast. `none` disables it, which is only
right when the background is already flat and dark.
