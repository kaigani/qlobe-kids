# Instrument Detective — asset production record

This game uses raster artwork throughout; no CSS, SVG, emoji, or canvas illustration is primary art.

## Shipped files

| Role | Final path |
|---|---|
| Scenes | `assets/backgrounds/theater.webp`, `assets/backgrounds/finale.webp` |
| Owl poses | `assets/characters/owl-listening.webp`, `owl-presenting.webp`, `owl-celebrating.webp`, `owl-conducting.webp` |
| Instruments | `assets/instruments/maracas.webp`, `drum.webp`, `bell.webp`, `piano.webp`, `guitar.webp`, `flute.webp` |
| UI | `assets/ui/title.webp`, `card-green.webp`, `card-purple.webp`, `card-blue.webp`, `listen-button.webp`, `primary-button.webp`, `progress-plaque.webp` |
| Preview | `assets/og-image.jpg` |

Masters are under `assets/source/gpt-image-2/`; magenta composites, mattes, and crops are under `assets/source/qa/`. `assets/source/finalize-report.json` records source hashes, alpha QA, dimensions, and final sizes. The hub source is `assets/source/krea2/hub-tile-source.png`; the final 640×533 tile is `../../assets/hub/tiles/instrument-detective.jpg`.

## Generation and prompts

GPT Image 2 generated the instrument, owl, theater, finale, UI, and title masters. The exact production prompt set is preserved in [`assets/source/PROMPTS.md`](assets/source/PROMPTS.md). The direction is a cozy painted-paper children’s theater: plum curtains, teal stage light, cream sticker edges, jewel-tone toy instruments, and a friendly owl detective.

The hub tile used Krea 2 text-to-image with seed `42`; its prompt is also in `PROMPTS.md`.

## Cutting and finalization

From the repository root, the canonical sheet cutter is run with exact-count gates:

```powershell
python tools/cut-asset-sheet.py games/instrument-detective/assets/source/gpt-image-2/instrument-sheet.png games/instrument-detective/assets/source/gpt-image-2/instrument-crops --names maracas drum bell piano guitar flute --expected-count 6 --debug-mask games/instrument-detective/assets/source/gpt-image-2/instrument-crops-mask.png --force
python tools/cut-asset-sheet.py games/instrument-detective/assets/source/gpt-image-2/owl-pose-sheet.png games/instrument-detective/assets/source/gpt-image-2/owl-pose-crops --names listening presenting celebrating conducting --expected-count 4 --debug-mask games/instrument-detective/assets/source/gpt-image-2/owl-pose-crops-mask.png --force
python tools/cut-asset-sheet.py games/instrument-detective/assets/source/gpt-image-2/ui-sheet.png games/instrument-detective/assets/source/gpt-image-2/ui-crops --names card-green card-purple card-blue listen-button primary-button progress-plaque --expected-count 6 --debug-mask games/instrument-detective/assets/source/gpt-image-2/ui-crops-mask.png --force
python tools/cut-asset-sheet.py games/instrument-detective/assets/source/gpt-image-2/title-source.png games/instrument-detective/assets/source/gpt-image-2/title-crop --names title --expected-count 1 --debug-mask games/instrument-detective/assets/source/gpt-image-2/title-mask.png --force
python games/instrument-detective/tools/finalize-assets.py
```

`finalize-assets.py` creates deterministic contiguous mattes from the flat charcoal source, invokes the canonical `tools/pipeline/cutout_finalize.py`, writes runtime WebP files and magenta QA composites, and emits `finalize-report.json`. Source-alpha UI plates use their opaque plateau with near-opaque normalization.

Qwen Image Layered was attempted on the instrument, owl, and title sheets through the approved local resource. The outputs are retained under `assets/source/local-api/layered/` for audit but rejected: the instrument pass retained only the drum, while owl and title passes were empty. The deterministic matte is the selected fallback.

## Audio and voice

The six mystery samples are shared platform recordings referenced in `config.json`: maracas, drum, agogo-b, piano, guitar, and flute. `agogo-b.m4a` is intentionally the closest available preschool hand-bell proxy; the game still presents the bell visual and language. Listening rounds have no background music so the timbre is clear.

Spoken lines are keyed by `data/lines.json`. `tools/produce-voice.py` uses Qwen 3 TTS voice clone with the rights-cleared shared reference `shared/assets/refs/voice-teacher.wav`, then verifies every final AAC candidate with Whisper. Accepted clips ship under `assets/audio/`; candidate takes and the transcript report are retained under `assets/source/local-api/voice/`. Runtime delivery is all-or-none, with normalized transcript similarity ≥ 0.92 and word coverage ≥ 0.95 for every line. The shared voice-clips module remains a device-speech safety fallback. No private voice path or LAN address is committed.

Shared platform SFX provide tap, retry, sparkle, and celebration feedback. Fredoka 600 is `shared/fonts/fredoka-latin-600-normal.woff2` under SIL OFL 1.1.

## Provenance

GPT Image 2, Krea 2, and approved local image outputs are project-generated assets treated as CC BY 4.0 for this project; no third-party attribution is required for those generated files. Shared QLOBE Kids assets retain their platform licenses. `og-image.jpg` is a generated capture of the splash screen and should be regenerated with `tools/pipeline/capture_og_images.mjs` after major visual changes.
