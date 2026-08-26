# Shape Detective — asset production register

Status: production assets accepted 2026-08-26. Canonical art direction is a
rough color-chalk sketch on real charcoal classroom slate, framed with tactile
warm oak. All visible game artwork is authored raster imagery; CSS supplies
only layout, hit areas, focus treatment, and motion. The shipped game performs
no model, LAN API, CDN, microphone, or upload request at runtime.

Unless noted otherwise, these are original QLOBE Kids assets covered by the
repository's `LICENSE-ASSETS` (CC BY 4.0). No third-party visual or voice source
was used.

## Visual sources and finalization

The exact GPT Image 2 prompts, references, acceptance states, and rejected
experiments are preserved in
`assets/source/gpt-image-2/prompts.json`. Original PNG masters remain beside
that receipt.

| Runtime asset | Accepted source and process | Evidence |
|---|---|---|
| `assets/board.webp` | GPT Image 2 `caseboard-master.png`; opaque 4:3 master downsampled and encoded to 1600×1200 WebP. | Source SHA-256 `fb49c05a…`; runtime `fc9204d4…`; prompt receipt in `prompts.json`. |
| `assets/search-scene.webp` | GPT Image 2 `search-scene-master.png`; opaque 4:3 master downsampled and encoded to 1600×1200 WebP. | Source SHA-256 `f735e1c6…`; runtime `2a508206…`; prompt receipt in `prompts.json`. |
| `assets/map-board.webp` | GPT Image 2 reference edit `chalk-map-board-master.png`, generated from the approved visual direction, caseboard, and oak slab; near-black outer ground trimmed, then fit to 1600×900 WebP. | `tools/build-map-assets.py`; full hashes and crop parameters in `assets/source/qa/map/processing.json`; `board-at-640.png`. |
| `assets/title.webp` | GPT Image 2 title master; the exact `SHAPE` and `DETECTIVE` rows were separately isolated by Qwen Image Layered at seed 42, alpha-normalized, canonically trimmed, and composed without redrawing. | `tools/extract-assets.py --title-fragments`; `tools/finalize-title.py`; `assets/source/qa/title/processing.json`; magenta QA composites. |
| `assets/cards/*.webp` | GPT Image 2 three-card sheet, cropped deterministically; all three Qwen Image Layered seed-42 `layer_2` cutouts passed canonical alpha checks and were finalized. | `tools/extract-assets.py`; `tools/finalize-assets.py`; per-asset entries and hashes in `assets/source/qa/final/processing.json`. |
| `assets/shapes/*.webp` | GPT Image 2 token sheet, cropped deterministically. Qwen Image Layered seed-42 output was accepted for `circle`. Triangle, square, rectangle, oval, pentagon, hexagon, and star Layered outputs retained opaque ground, so their source crops were isolated by the deterministic contiguous-ground key and canonically finalized. | Source crops and rejected Layered candidates are retained; selection, rejection reason, alpha metrics, and hashes are in `assets/source/qa/final/processing.json`. |
| `assets/ui/*.webp` and `assets/rewards/rosette-*.webp` | GPT Image 2 prop sheet. Qwen Layered candidates failed alpha checks, so the accepted crops use deterministic contiguous-ground isolation, edge feathering, and saturated-magenta de-spill before canonical WebP finalization. `case-closed.webp` comes from its accepted GPT Image 2 master plus deterministic alpha normalization. | `tools/finalize-assets.py`; black/white inspection and `assets/source/qa/final/contact-sheet.png`; full per-asset processing receipt. |
| `assets/rewards/badge-*.webp` | Deterministic raster composites of the accepted rosettes, tokens, and magnifier: property shapes, search magnifier, and placement shapes. | `tools/build-badges.py`; `assets/source/qa/badges/processing.json`; contact sheet and magenta QA plates. |
| `assets/ghosts/*.webp` | Deterministic raster chalk-outline derivatives of the accepted triangle, circle, rectangle, and square tokens. Source luminance preserves rough chalk texture; no SVG or CSS-drawn shape is used. | `tools/build-map-assets.py`; source/output hashes and parameters in `assets/source/qa/map/processing.json`; black, white, and magenta contact sheets. |
| `assets/hub/tiles/shape-detective.jpg` | Krea 2 Turbo text-to-image through the approved local authoring API, seed 42, 768×640 candidate; human-accepted after full-size and 320 px inspection, then crop-safe fit to 640×533 JPEG. | `tools/generate-hub.py`; exact prompt/settings and hash-bound acceptance in `assets/source/local-api/hub/shape-detective-krea2-seed-42.recipe.json`. |
| `assets/og-image.jpg` | Deterministic 1200×630 capture of the final game splash screen. | `node tools/pipeline/capture_og_images.mjs --only shape-detective --force`; runtime SHA-256 `57a3209e…`. |

The final cutout register contains 18 assets: four direct Qwen Layered passes,
13 deterministic contiguous-ground fallbacks, and one GPT Image 2 finale stamp
with deterministic alpha finalization. Saturated-magenta QA is intentional: it
exposes pale fringes, opaque background remnants, and color spill that can be
invisible on slate.

## Rejected candidates retained for audit

- `title-alpha-edit-candidate.png` returned an opaque checkerboard and was not
  used.
- `title-layer2-seed42.png` and `title-layer2-seed1337.png` dropped or corrupted
  required title letters and were not used. The accepted title uses the two
  separately verified word fragments instead.
- Failed Qwen Layered cutouts remain under `assets/source/layer2/`; the
  corresponding `qwenRejection` entries record why each was rejected and which
  deterministic source replaced it.

## Narration and music

All 45 spoken lines were generated at authoring time with the local
`qwen3-tts-voiceclone` workflow from
`shared/assets/refs/voice-teacher.wav`, the platform's synthetic (not human)
teacher voice created with Qwen voice design seed 7. Each AAC/M4A clip was
loudness-normalized, constrained to 0.2–9 seconds, and accepted only after
Whisper `base` English transcription reached normalized similarity ≥ 0.92.

The completed batch is 45/45 accepted, all at seed 7: minimum/mean/maximum
transcript similarity 0.928/0.998/1.000, duration range 1.677–5.600 seconds,
141.952 seconds total. Runtime entries and text hashes are in
`assets/audio/manifest.json` (`_v: c9aa81acb897`); intended text is in
`assets/audio/lines.json`; transcripts, ratios, durations, rejected transport
attempts, and candidate paths are in `assets/audio/qa.json`. The 45 accepted
authoring candidates are retained under `assets/source/local-api/voice/`.

Background music reuses
`shared/assets/music/quirky-forest-adventure.mp3` from the project library and
is covered by the repository asset license. Runtime playback uses only the
committed local file.

## Reproduction and QA

Run authoring steps from the repository root. Qwen/Krea/TTS commands require the
approved local API configuration and are never called by the game itself.

```sh
python3 games/shape-detective/tools/extract-assets.py --seed 42
python3 games/shape-detective/tools/extract-assets.py --title-fragments --seed 42
python3 games/shape-detective/tools/finalize-assets.py --force
python3 games/shape-detective/tools/finalize-title.py
python3 games/shape-detective/tools/build-badges.py --force
python3 games/shape-detective/tools/build-map-assets.py
python3 games/shape-detective/tools/generate-hub.py --seed 42 --force
# Inspect the candidate, then hash-bind the accepted install:
python3 games/shape-detective/tools/generate-hub.py --seed 42 --accept --install
python3 games/shape-detective/tools/generate-voice.py
node tools/pipeline/capture_og_images.mjs --only shape-detective --force
node games/shape-detective/tools/qa.mjs
```

Final visual review used desktop, phone portrait, reduced-motion, black/white
alpha, and saturated-magenta composites. The independent adversarial art review
approved the release with no P0 or P1 visual findings. The game remains marked
`beta` until a real child/iPad playtest is complete.
