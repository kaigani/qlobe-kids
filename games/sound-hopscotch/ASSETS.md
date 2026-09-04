# Sound Hopscotch asset record

All shipping game art is raster. Live HTML is used only for accessible copy,
letters, numbers, layout, and interaction; no SVG or CSS-drawn artwork is used.
Original generated project assets are released under CC BY 4.0. Game code is
MIT.

## Original GPT Image 2 art

The definitive meadow, four bunny poses, five pad colors, listening plaque,
play button, reward star, progress flower, title, paw landing marker, and color
palette were generated with `gpt-image-2`. The first four sheets used new or
referenced `stylized-concept` generation. The interaction-cue sheet used
referenced generation from the approved meadow and prop sheets. Exact prompts,
references, modes, decisions, and output paths are preserved in
`assets/source/PROMPTS.md`.

| Source | Shipping result |
|---|---|
| `assets/source/gpt-image-2/meadow-world-master.png` | `assets/backgrounds/meadow.webp` |
| `assets/source/gpt-image-2/bunny-poses-sheet.png` | `assets/characters/bunny-{ready,hop,land,cheer}.webp` |
| `assets/source/gpt-image-2/kawaii-kit-sheet.png` | `assets/pads/*.webp`, `assets/ui/{sound-plaque,play-button}.webp`, `assets/effects/*.webp` |
| `assets/source/gpt-image-2/title-lockup-master.png` | `assets/title.webp` |
| `assets/source/gpt-image-2/interaction-cues-sheet.png` | `assets/ui/{landing-marker,theme-palette}.webp` |

## Required asset cutting and finalization

Every isolated source sheet was run through the repository asset cutter with
an exact expected count. The commands were:

```text
python tools/cut-asset-sheet.py bunny-poses-sheet.png crops/bunny --names bunny-ready bunny-hop bunny-land bunny-cheer --expected-count 4
python tools/cut-asset-sheet.py kawaii-kit-sheet.png crops/kawaii-kit --names pad-coral pad-yellow pad-blue pad-lime pad-violet sound-plaque play-button reward-star progress-flower --expected-count 9
python tools/cut-asset-sheet.py title-lockup-master.png crops/title --names title-lockup --expected-count 1
python tools/cut-asset-sheet.py interaction-cues-sheet.png crops/interaction-cues --names landing-marker theme-palette --expected-count 2 --distance-threshold 42 --chroma-threshold 20 --order x
```

The concrete commands used full repository-relative input/output paths plus
`--debug-mask`; authoritative boxes and masks are retained in
`assets/source/crops/`. `tools/process-assets.py` applies those exact masks,
normalizes bunny canvases, resizes/encodes WebP, writes
`assets/source/finalize-report.json`, and builds the magenta-background alpha
QC sheet at `assets/source/qa/alpha-contact-sheet.png`.

The hub tile (`../../assets/hub/tiles/sound-hopscotch.jpg`) and social card
(`assets/og-image.jpg`) are deterministic Pillow composites of the approved
runtime art. Rebuild them with `tools/build-social-assets.py`; the recipe is
`assets/source/local-api/social-assets.recipe.json`.

## Approved local API experiments

- Krea 2 (`krea2-turbo-t2i`), seed 42, job
  `7aa9aaee41744585927ced0331fec8ea`, produced
  `assets/source/local-api/krea-hub-seed42.png`. It was retained as exploration
  but not shipped because the bow moved from Bunny's neck to her head.
- Qwen Image Layered processed all 14 original cut sprites at seed 42. The
  batch was inconsistent: some objects had opaque cores, while representative
  bunny, pad, and effect foreground layers were nearly empty (maximum alpha
  3–17). The entire experimental batch was rejected in favor of the exact
  cutter masks. All outputs, job IDs, and alpha findings are retained in
  `assets/source/qwen-layered/REPORT.md`.
- Qwen3 TTS Voice Clone uses the approved committed reference
  `shared/assets/refs/voice-teacher.wav`. `tools/generate-voice.py` records
  async job IDs, seed, text hash, AAC settings, and Whisper acceptance results.
  All 16 shipping seed-7 lines passed Whisper with exact normalized transcripts
  (score 1.0 and word coverage 1.0).
  Runtime clips and per-line recipes live in `assets/audio/`; raw generations,
  transcripts, and resumable LAN job state stay under
  `assets/source/local-api/voice/`. `assets/audio/qa.json` is the acceptance
  record and `assets/audio/manifest.json` is the runtime index.

## Shared QLOBE Kids resources

| Asset | Source / license | Use |
|---|---|---|
| `shared/assets/ui/btn-{home,back,sound}.png` | QLOBE Kids generated project art, CC BY 4.0 | Shared HUD controls through `shared/css/hud.css` |
| `shared/assets/audio/fragments/*.m4a` | QLOBE Kids recorded phonics library | Exact target-letter sounds through `shared/js/content.js` |
| `shared/assets/music/upbeat-playground-pop.mp3` | QLOBE Kids project music | Low-volume, ducked background music |
| `shared/fonts/fredoka-latin-600-normal.woff2` | Fredoka by Milena Brandão and Hafontia, SIL OFL 1.1 | Accessible live UI type |

## Reproduction and review

```text
python games/sound-hopscotch/tools/process-assets.py --check
python games/sound-hopscotch/tools/build-social-assets.py
python games/sound-hopscotch/tools/generate-voice.py
```

Do not silently replace a final with an experimental source. Regenerate from
the prompt/job record, run the cutter with `--expected-count`, inspect the alpha
contact sheet, and repeat visual QA in both orientations before shipping.
