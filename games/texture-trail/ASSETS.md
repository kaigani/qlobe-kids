# Asset Log - Texture Trail

Texture Trail follows the Studio production chain documented in
`docs/qlobe-studio-v2.md`: brief -> generated source -> exact-count cut ->
magenta/alpha review -> deterministic runtime asset -> browser QA. No generated
service is contacted by the shipped game.

## Authored visual system

| Runtime asset | Source / model | Creator | License | Production notes |
|---|---|---|---|---|
| `assets/world/clay-garden-world.webp` | `assets/source/gpt-image-2/clay-garden-world.png`; GPT Image 2 through the built-in Codex image-generation tool | OpenAI / QLOBE Kids | CC BY 4.0 | 4:3 world plate; resized deterministically to 1200x900 WebP |
| `assets/art/title-lockup.webp` | `assets/source/gpt-image-2/title-lockup.png`; GPT Image 2 | OpenAI / QLOBE Kids | CC BY 4.0 | Exact title spelling visually checked; transparent source retained |
| `assets/characters/snail-*.webp` | `assets/source/gpt-image-2/snail-poses.png`; GPT Image 2 | OpenAI / QLOBE Kids | CC BY 4.0 | Four consistent Pip poses cut from one 2x2 sheet |
| Base `assets/art/card-*.webp`, `marker-*.webp`, `plaque-*.webp`, and Bumpy/star medals | `assets/source/gpt-image-2/texture-kit.png`; GPT Image 2 | OpenAI / QLOBE Kids | CC BY 4.0 | Twelve-item 3x4 sheet cut with exact count; every cut checked on magenta |
| `assets/art/card-soft.webp`, `marker-soft.webp`, `medal-soft.webp`, `plaque-label.webp` | `assets/source/gpt-image-2/soft-revision.png`; GPT Image 2 | OpenAI / QLOBE Kids | CC BY 4.0 | Four-item 2x2 revision sheet; fuzzy stitched Soft system and authored text carrier replace ambiguous/CSS treatments |
| `assets/art/medal-smooth.webp`, `medal-ridged.webp` | `assets/source/gpt-image-2/reward-medals.png`; GPT Image 2 | OpenAI / QLOBE Kids | CC BY 4.0 | Two-item exact-count sheet gives each lesson a material-specific reward |
| `assets/objects/*.webp` | `assets/source/gpt-image-2/object-sheet.png`; GPT Image 2 | OpenAI / QLOBE Kids | CC BY 4.0 | Twelve-item 3x4 clay-object sheet; eight objects ship in rounds and four remain approved expansion art |
| `assets/hub/tiles/texture-trail.jpg` | `assets/source/gpt-image-2/hub-tile-source.png`; GPT Image 2 | OpenAI / QLOBE Kids | CC BY 4.0 | Curated exactly-one-Pip catalog composition; deterministic 640x533 JPEG |
| `assets/og-image.jpg` | Same approved GPT Image 2 hub composition | OpenAI / QLOBE Kids | CC BY 4.0 | Deterministic cover crop to 1200x630 JPEG |

The complete generation prompts, references, output dimensions, and rejection
notes live in `assets/source/PROMPTS.md`. Source hashes, output dimensions,
alpha statistics, size budgets, and QA-composite paths live in
`assets/source/processing.json`.

## Cutting and deterministic processing

The shared cutter was run with an explicit expected count for every source
sheet:

```powershell
python tools/cut-asset-sheet.py games/texture-trail/assets/source/gpt-image-2/snail-poses.png games/texture-trail/assets/source/crops/snails --names snail-wait snail-point snail-cheer snail-hint --expected-count 4 --debug-mask games/texture-trail/assets/source/crops/snails-mask.png
python tools/cut-asset-sheet.py games/texture-trail/assets/source/gpt-image-2/texture-kit.png games/texture-trail/assets/source/crops/texture-kit --names card-bumpy card-smooth card-ridged card-soft marker-bumpy marker-smooth marker-ridged marker-soft plaque-prompt plaque-action medal-bumpy medal-star --expected-count 12 --debug-mask games/texture-trail/assets/source/crops/texture-kit-mask.png
python tools/cut-asset-sheet.py games/texture-trail/assets/source/gpt-image-2/object-sheet.png games/texture-trail/assets/source/crops/objects --names raspberry pinecone sensory-ball gourd egg river-pebble seashell corduroy-cushion cloud-cushion feather pom-pom star-pillow --expected-count 12 --debug-mask games/texture-trail/assets/source/crops/objects-mask.png
python tools/cut-asset-sheet.py games/texture-trail/assets/source/gpt-image-2/soft-revision.png games/texture-trail/assets/source/crops/soft-revision --names card-soft marker-soft medal-soft plaque-label --expected-count 4 --debug-mask games/texture-trail/assets/source/crops/soft-revision-mask.png
python tools/cut-asset-sheet.py games/texture-trail/assets/source/gpt-image-2/reward-medals.png games/texture-trail/assets/source/crops/reward-medals --names medal-smooth medal-ridged --expected-count 2 --debug-mask games/texture-trail/assets/source/crops/reward-medals-mask.png
```

Dry runs and final runs returned exactly 4, 12, 12, 4, and 2 components. The source
already carried usable alpha, so Qwen Image Layered was not applied: an extra
segmentation pass would have degraded the clean GPT Image 2 edges. Instead,
`tools/process-assets.py` crops alpha bounds, pads, downsizes, writes lossless
WebP cutouts, creates 33 saturated-magenta composites under
`assets/source/qa/`, and rebuilds catalog/OG images. The 1200x900 world remains
below its 300 KB budget.

Rebuild command:

```powershell
python games/texture-trail/tools/process-assets.py
```

## Narration and audio

| Asset | Source / model | License | QA / modifications |
|---|---|---|---|
| 19 files in `assets/audio/*.m4a` | Local Qwen3 TTS voice clone using the approved QLOBE teacher reference, seed 7 | QLOBE Kids production asset | Studio encoded AAC/M4A at 96 kbps; runtime mapping and measured durations are in `assets/audio/manifest.json` |
| Transcript and recipe receipts | Local Whisper STT plus Studio recipe output | N/A | Every intended/heard pair passed normalized transcript review; receipts are retained under `assets/source/voice/<line>/` |
| Spoken fallback | Exact strings in `assets/audio/lines.json` through the device Web Speech API | N/A | Used only if a recorded clip cannot load or play |
| Music | `shared/assets/music/quirky-forest-adventure.mp3` | QLOBE Kids shared library, CC BY 4.0 | Reused unmodified; low-volume loop with fades and narration ducking |
| Interaction SFX | `shared/js/sfx.js` | MIT project code | Runtime WebAudio pop, tick, whoosh, boing, sparkle, and tada cues |

The teacher reference itself remains in the shared approved reference library;
it is not duplicated into the game.

## Shared interface assets

| Asset | Source | License | Modifications |
|---|---|---|---|
| Home, Back, Sound, and Play buttons in `shared/assets/ui/` | Shared QLOBE Kids generated UI library | CC BY 4.0 | Reused unmodified |
| Fredoka font in `shared/fonts/` | Fontsource / Google Fonts; Milena Brandao and Hafontia | SIL OFL 1.1 | Reused unmodified |

## Local API trial and rejection

A Krea 2 Turbo concept tile was generated through QLOBE Studio with seed 42
(`texture-trail-krea-hub-trial`). It was rejected in Studio Review because the
snail identity and modeling language drifted from Pip; the rejected output was
moved to Studio's ignored trash and is not shipped. The coherent GPT Image 2
hub composition was retained. MiniMax video was intentionally omitted because
the interaction is communicated more clearly by responsive authored poses and
because no approved MiniMax H3 Studio workflow was available in this checkout.

## QA

- `assets/source/qa/`: 33 cutouts on saturated magenta.
- `qa-shots/texture-trail/`: landscape, portrait, compact-landscape,
  reduced-motion, progress, completion, and hub captures (local QA artifact,
  not shipped).
- `games/texture-trail/tools/qa.mjs`: real-Chrome playthrough of all four modes,
  recorded-clip proof, pointer cancellation, replay, 96 px targets, asset
  loading, offline runtime, and responsive states.
