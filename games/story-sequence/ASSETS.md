# First, Next, Last asset log

First, Next, Last is an offline-first watercolor storybook game. Generative models are authoring tools only; production gameplay makes no image, voice, transcription, video, or LAN requests. Exact image prompts live in `PROMPTS.md`. Immutable masters, cutter geometry, masks, deterministic processing receipts, and visual QA remain under `assets/source/`.

## Production art

| Family | Source / workflow | Production treatment | Runtime output |
|---|---|---|---|
| Reading-nook backdrop | GPT Image 2 using concept mockup 01 as a style/composition reference | 4:3 fit, 1600×1200 optimized WebP | `assets/art/backdrops/library.webp` |
| Story-meadow backdrop | GPT Image 2 using concept mockup 02 as a style/composition reference | 4:3 fit, 1600×1200 optimized WebP | `assets/art/backdrops/meadow.webp` |
| Four three-card story sheets | GPT Image 2; coherent child, setting, palette, and camera within each deck | required shared bounding-box cutter, exact count 3 per sheet, mask-derived alpha, max 720 px, optimized WebP | `assets/art/cards/*.webp` |
| Book, Storyteller Star, check, confetti | GPT Image 2 transparent four-object contact sheet | required shared cutter with `--expected-count 4`; alpha trim/resize | `assets/art/decor/*.webp` |
| Hub tile | LAN-local Krea 2 Turbo text-to-image, seed 42, 768×640 | curated for the platform's separate Toy Table grammar and fitted to 640×533 JPEG | `../../assets/hub/tiles/story-sequence.jpg` |

GPT Image 2 sources are retained in `assets/source/gpt-image-2/`. Runtime assets are never exported by equal-grid slicing. These exact-count cuts are recorded in sibling `boxes.json` files and debug masks:

```powershell
python tools/cut-asset-sheet.py games/story-sequence/assets/source/gpt-image-2/plant-story-sheet.png games/story-sequence/assets/source/cuts/plant --names plant-first plant-next plant-last --expected-count 3 --debug-mask games/story-sequence/assets/source/cuts/plant-mask.png --close-radius 0
python tools/cut-asset-sheet.py games/story-sequence/assets/source/gpt-image-2/slide-story-sheet.png games/story-sequence/assets/source/cuts/slide --names slide-first slide-next slide-last --expected-count 3 --debug-mask games/story-sequence/assets/source/cuts/slide-mask.png --close-radius 0
python tools/cut-asset-sheet.py games/story-sequence/assets/source/gpt-image-2/bake-story-sheet.png games/story-sequence/assets/source/cuts/bake --names bake-first bake-next bake-last --expected-count 3 --debug-mask games/story-sequence/assets/source/cuts/bake-mask.png --close-radius 0
python tools/cut-asset-sheet.py games/story-sequence/assets/source/gpt-image-2/brush-story-sheet.png games/story-sequence/assets/source/cuts/brush --names brush-first brush-next brush-last --expected-count 3 --debug-mask games/story-sequence/assets/source/cuts/brush-mask.png --close-radius 0
python tools/cut-asset-sheet.py games/story-sequence/assets/source/gpt-image-2/decorations-sheet.png games/story-sequence/assets/source/cuts/decor --names storybook storyteller-star correct-check confetti --expected-count 4 --debug-mask games/story-sequence/assets/source/cuts/decor-mask.png --close-radius 0 --min-area 5000
```

`tools/build-assets.py` promotes the accepted cuts and full backdrops, writes hashes and dimensions, and produces `assets/source/qa/contact-sheet-magenta.jpg`. The source card sheets intentionally use a flat charcoal isolation ground; the cutter mask, not a guessed crop, supplies runtime alpha.

## Teacher voice

`assets/audio/lines.json` is the exact spoken script. `tools/generate-voice.py` sends only those fixed lines plus `shared/assets/refs/voice-teacher.wav` to the authorized LAN-local `qwen3-tts-voiceclone` workflow. Seeds 7, 8, and 9 are the retry ladder. Accepted runtime files are mono 48 kHz AAC/M4A with loudness normalization and `+faststart`.

Every candidate is transcribed through LAN-local `whisper-stt` in English. `assets/audio/qa.json` records the seed, heard transcript, and normalized similarity. No rejected candidate is referenced by `manifest.json`. Device Web Speech remains the correct fallback if a clip cannot decode.

## Shared runtime modules

| Module / asset | Purpose |
|---|---|
| `shared/fonts/fredoka-latin-600-normal.woff2` | functional text |
| `shared/js/voice-clips.js` | recorded voice playback and fallback |
| `shared/js/sfx.js` | touch, snap, and celebration sounds |
| `shared/js/timers.js` | cancellable playback timing and QA speed-up |
| `shared/js/rng.js` | deterministic card order |
| `shared/js/debug-harness.js` | `QLOBE_DEBUG` v1 |
| `shared/assets/refs/voice-teacher.wav` | rights-cleared authoring reference; not fetched by the runtime |

## Provenance and rights

- Game code: MIT.
- Game-specific generated art/audio: CC BY 4.0, consistent with `game.json`.
- No stock imagery, remote media URL, personal reference path, LAN hostname, credential, or model endpoint is committed.
- `assets/og-image.jpg` is a captured production screen, regenerated with the repository workflow rather than painted by hand.
- The game remains `beta` pending a real target-child iPad playtest.
