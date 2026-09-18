# Silly Swap Words — Asset Provenance

All primary game art is raster. No downloaded third-party illustration, SVG, canvas drawing, emoji art, or CSS-generated primary artwork ships in this game.

## Original generated art

| Runtime asset | Authored source | Production process | Creator / license |
|---|---|---|---|
| `assets/backgrounds/clay-sky.webp` | `assets/source/gpt-image-2/clay-sky-master.png` | GPT Image 2 generation; opaque lavender-floor composite; 1600×1200 WebP | OpenAI image generation for QLOBE Kids / CC BY 4.0 |
| `assets/ui/title.webp` | `assets/source/gpt-image-2/title-master.png` | GPT Image 2 generation; Qwen Image Layered `layer_2`; alpha decontamination, crop and WebP | OpenAI + approved local Qwen API / CC BY 4.0 |
| `assets/ui/*.webp` | `assets/source/gpt-image-2/ui-carriers-master.png` | GPT Image 2 contact sheet; official `tools/cut-asset-sheet.py`; deterministic alpha cleanup and WebP | OpenAI image generation for QLOBE Kids / CC BY 4.0 |
| `assets/ui/action-pill-blue.webp`, `clay-sparkles.webp` | Focused sources beside the GPT Image 2 masters | GPT Image 2 style-preserving revisions; deterministic alpha cleanup and WebP | OpenAI image generation for QLOBE Kids / CC BY 4.0 |
| `assets/words/*.webp` | `assets/source/gpt-image-2/words-a-master.png`, `words-b-master.png` | GPT Image 2 contact sheets; official cutter; deterministic alpha cleanup and WebP | OpenAI image generation for QLOBE Kids / CC BY 4.0 |
| `assets/words/fog.webp` | `assets/source/gpt-image-2/fog-clean.png` | GPT Image 2 coherence edit replacing detached wisps; deterministic alpha cleanup and WebP | OpenAI image generation for QLOBE Kids / CC BY 4.0 |
| `assets/characters/silly-blob.webp` | Lab medallion from the generated UI sheet | Reused as the Lab’s familiar nonsense-word character; cleaned and resized | OpenAI image generation for QLOBE Kids / CC BY 4.0 |
| `../../assets/hub/tiles/silly-swap-words.jpg` | `assets/source/local-api/hub/silly-swap-words-krea2-seed-42.png` | Krea 2 Turbo text-to-image, seed 42; reviewed crop to 640×533 JPEG | Approved local Krea API / CC BY 4.0 |

The Qwen Image Layered outputs for the title, UI sheet, and both word sheets, together with their `qlobe-recipe-v1` receipts, are retained under `assets/source/layered/`. The layered title ships. For the wide plaque/ribbon and small object silhouettes, visual QA selected the cutter’s native-alpha GPT Image 2 crops because Qwen’s fixed four-column layer output clipped shared cell boundaries. That curation decision is encoded in `tools/build-assets.py`; no result was silently overwritten.

## GPT Image 2 prompt record

Exact production prompts and reference intent are recorded in [`assets/source/gpt-image-2/PROMPTS.md`](assets/source/gpt-image-2/PROMPTS.md). The generation set comprises:

1. a quiet 4:3 turquoise clay-sky stage with a lavender workbench;
2. the exact “Silly Swap Words” clay title lockup;
3. eight text-free UI carriers on one separated sheet;
4. twelve A-sheet word objects;
5. twelve B-sheet word objects;
6. focused blue-pill, clay-sparkle, and fog-coherence revisions from the adversarial art pass.

The concept’s own three mockup screens were supplied as style/composition references. Every output was inspected at full size before cutting.

## Cutting, layering, and deterministic processing

The required official cutter was run with exact expected-count gates:

```text
python tools/cut-asset-sheet.py .../ui-carriers-master.png .../crops/ui \
  --names letter-well prompt-plaque mode-swap mode-trail mode-lab magic-swap success-ribbon action-pill \
  --expected-count 8 --padding 20 --debug-mask .../qa/ui-mask.png

python tools/cut-asset-sheet.py .../words-a-master.png .../crops/words-a \
  --names cat hat hot hop hog dog fog log leg pig dig wig \
  --expected-count 12 --padding 20 --min-area 3000 --debug-mask .../qa/words-a-mask.png

python tools/cut-asset-sheet.py .../words-b-master.png .../crops/words-b \
  --names bug mug rug hug bun sun rag rat bat cap can fig \
  --expected-count 12 --padding 20 --debug-mask .../qa/words-b-mask.png
```

`tools/extract-layered.py` submits the retained sources to `/workflows/qwen-image-layered` with a deterministic seed ladder and alpha QA. `tools/build-assets.py` keeps the dominant silhouette, removes extraction color spill, rebuilds an antialiased subject-colored edge, produces magenta QA composites under `assets/source/qa/magenta/`, and writes compact WebP runtime files. `assets/source/final/build-report.json` records output dimensions, alpha bands, and byte sizes.

## Narration and shared audio

| Asset | Source / workflow | Notes |
|---|---|---|
| `assets/audio/*.m4a` | `/workflows/qwen3-tts-voiceclone` using `shared/assets/refs/voice-teacher.wav` | 24 kHz mono AAC, 96 kbps; game-local original dialogue |
| `assets/audio/manifest.json` | `tools/generate-voice.py` | Duration, text hash and accepted seed for every narration key |
| `assets/audio/qa.json` and `*.recipe.json` | `/workflows/whisper-stt` | Transcript, similarity/coverage, job receipt and encoding provenance |
| Letter sounds | `shared/assets/audio/fragments/*.m4a` through `shared/js/content.js` | Existing QLOBE Kids recorded phoneme library |
| Word names | `shared/assets/audio/words/*.m4a` through `shared/js/content.js` | Existing QLOBE Kids recorded word library |
| Music | `shared/assets/music/whimsical-toy-workshop.mp3` | Existing QLOBE Kids shared track |
| UI / success effects | `shared/js/sfx.js` | Synthesized at runtime; no source file |

The approved teacher reference is not copied into the game. Local API endpoints are read from ignored machine state and never stored in tracked recipes.

## Shared interface assets

Home, Back, and Sound button rasters come from `shared/assets/ui/` and render through `shared/css/hud.css` / `shared/js/hud.js`. Fredoka comes from the existing shared platform font files under the SIL Open Font License 1.1.

## Link preview

`assets/og-image.jpg` is a 1200×630 screenshot of the game’s own settled splash screen, captured in production Chrome. It contains only the generated/project-owned assets listed above and should be regenerated with the platform capture flow whenever the splash composition changes.
