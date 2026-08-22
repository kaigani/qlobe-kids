# Block Tower Measure Assets

Block Tower Measure uses an original raster-only papercraft art set and 28 recorded teacher-voice clips. CSS is limited to layout, interaction feedback, the ruler-to-tower measurement guide, and transient celebration particles; it does not draw the primary artwork.

## Runtime art

| Runtime asset | Source and production method | Creator / model | License | Modifications |
|---|---|---|---|---|
| `assets/art/workshop.webp` | `assets/source/workshop-gpt-image-2.png`, generated from the approved concept mockup art direction | QLOBE Kids / GPT Image 2 | CC BY 4.0 | Center-cropped to 4:3, resized to 1440×1080, WebP encoded |
| `assets/art/title.webp` | `assets/source/title-chroma-gpt-image-2.png` | QLOBE Kids / GPT Image 2 | CC BY 4.0 | Chroma-matted, alpha-trimmed, normalized to a transparent 1000×600 canvas, WebP encoded |
| `assets/art/robot-cheer.webp` | `assets/source/robot-chroma-gpt-image-2.png` | QLOBE Kids / GPT Image 2 | CC BY 4.0 | Chroma-matted, alpha-trimmed, normalized to a transparent 640×760 canvas, WebP encoded |
| Five equal block sprites (`block-*.webp`) | `assets/source/block-atlas-chroma-gpt-image-2.png` | QLOBE Kids / GPT Image 2 | CC BY 4.0 | Chroma-matted atlas, sliced into equal cells, normalized to transparent 320×320 canvases, WebP encoded |
| Ruler, prompt, mat, star, action button, and mode card | `assets/source/ui-atlas-chroma-gpt-image-2.png` | QLOBE Kids / GPT Image 2 | CC BY 4.0 | Chroma-matted atlas, reviewed coordinate crops, alpha-trimmed and WebP encoded |
| Hub tile (`../../assets/hub/tiles/block-tower-measure.jpg`) | `assets/source/hub-tile-papercraft-gpt-image-2.png`, generated with the workshop, robot, and equal-block sources as references | QLOBE Kids / GPT Image 2 | CC BY 4.0 | Reviewed for exactly 2 blocks versus 4; center-cropped and normalized to the platform 640×533 progressive JPEG contract |

The complete GPT Image 2 prompts and reference relationships are recorded in `assets/source/gpt-image-2-prompts.json`. Chroma sources were extracted with the image-generation skill's `remove_chroma_key.py` helper using an explicit `#ff00ff` key and soft alpha matte. The reviewed version-3 alpha outputs passed the hostile-green contact sheet in `assets/source/final-alpha-qc-green.jpg`.

`tools/finalize-art.py` deterministically rebuilds every runtime WebP, the alpha QC sheet, and the hub JPEG from the committed source images.

## Local API image study

The Studio/LAN pipeline was also used to explore the hub composition:

1. Krea 2 Turbo generated `btm-hub-tile-paperbot-1337.png` from the `menu-game-tile` template, seed 1337.
2. Qwen Image Edit received that exact media item and was asked to correct the left tower from three blocks to two without changing the four-block tower.

The Krea source rendered a glossy three-block-versus-four-block scene. The Qwen correction still showed three blocks on the left and retained the glossy style. Both candidates failed exact-count and papercraft-style review, were rejected from active Studio staging, and were moved to Studio's recoverable trash. Neither candidate is assigned to or shipped with the game.

## Recorded dialogue

| Assets | Production method | QA | License / attribution |
|---|---|---|---|
| `assets/audio/btm-voice-*.m4a` (28 clips) | Studio `character-voice-line` template; Qwen3 TTS voice clone from the project-approved teacher reference; AAC/M4A delivery | Studio Whisper transcription plus the exact semantic, source-text, duration, and volume gate in `tools/build-audio-manifest.mjs`; results recorded in `assets/audio/qa.json` | Original QLOBE Kids dialogue and approved project voice asset, CC BY 4.0; no child-facing attribution required |
| `assets/audio/manifest.json` | Generated locally by `tools/build-audio-manifest.mjs` after all clips pass | Contains only clips that passed the committed QA gate | QLOBE Kids, CC BY 4.0 |

The teacher reference recording is not copied into this game. Each assigned clip keeps its Studio `.recipe.json` sidecar for reproducibility and auditability.

## Shared platform assets

| Asset | Source | Creator / license | Use |
|---|---|---|---|
| `shared/fonts/fredoka-latin-600-normal.woff2` | Fontsource `@fontsource/fredoka@5.0.13`; Fredoka by Milena Brandão and Hafontia | SIL OFL 1.1 | UI text, reused unmodified |
| `shared/assets/ui/btn-home.png`, `btn-back.png`, `btn-sound.png` | Shared QLOBE Kids raster HUD library | QLOBE Kids, CC BY 4.0 | Home, back, and replay-audio controls |
| `shared/js/sfx.js` | Shared QLOBE Kids module | MIT | Short synthesized interaction tones; no downloaded sound files |

## Link preview

| Asset | Source | Creator / license | Regeneration |
|---|---|---|---|
| `assets/og-image.jpg` | Screenshot of this game's own rendered splash screen | QLOBE Kids, CC BY 4.0 | `node tools/pipeline/capture_og_images.mjs --only block-tower-measure --force --base http://127.0.0.1:8000 --settle 1200 --concurrency 1` |
