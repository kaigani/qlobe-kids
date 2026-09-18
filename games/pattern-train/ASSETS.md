# Pattern Train asset log

Pattern Train uses one canonical **Toy** art world: hand-painted wooden railway
pieces with rounded silhouettes, visible grain, soft studio light, and a
coral/teal/yellow/green palette. No browser emoji, CSS illustration, or vector
art is used for primary child-facing visuals.

## Original raster artwork

| Runtime asset | Production source | Tool / model | Modifications | License |
|---|---|---|---|---|
| `assets/art/railway-meadow.webp` | `assets/source/gpt-image-2/railway-meadow-master.png` | OpenAI GPT Image 2 | RGB conversion, proportional downscale, WebP encode | CC BY 4.0 |
| `assets/art/title-lockup.webp` | `assets/source/gpt-image-2/title-lockup-master.png` | OpenAI GPT Image 2 | alpha cleanup, trim, Lanczos downscale, quality-88 WebP | CC BY 4.0 |
| `assets/art/{locomotive,wagon,tray,plaque,button-yellow,button-coral}.webp` | `assets/source/gpt-image-2/rail-ui-sheet.png` | OpenAI GPT Image 2 | deterministic repository cutter; alpha cleanup, trim, downscale, quality-88 WebP | CC BY 4.0 |
| `assets/art/tokens/{red-triangle,blue-square,yellow-circle,green-star,clap,stomp,tap,shake}.webp` | `assets/source/gpt-image-2/token-sheet.png` | OpenAI GPT Image 2 | deterministic repository cutter; alpha cleanup, trim, downscale, quality-88 WebP | CC BY 4.0 |
| `assets/art/{mode-shapes,mode-actions,mode-builder,gold-star,spark,whistle}.webp` | `assets/source/gpt-image-2/mode-effects-sheet.png` | OpenAI GPT Image 2 | deterministic repository cutter; alpha cleanup, trim, downscale, quality-88 WebP | CC BY 4.0 |
| `assets/hub/tiles/pattern-train.jpg` | `assets/source/local-api/krea2/hub-tile-master.png` → `hub-tile-qwen-edit.png` | Krea 2 Turbo Text to Image; Qwen Image Edit | Qwen corrected the cargo sequence to red triangle / blue square / red triangle / blue square; centered crop, resize to 640×533, JPEG encode | CC BY 4.0 |
| `assets/og-image.jpg` | production splash screen | real-Chrome capture of this game | 1200×630 screenshot generated after final UI QA | CC BY 4.0 |

All generated art was directed and curated for QLOBE Kids. Exact GPT Image 2
prompts and cutter commands are in
`assets/source/gpt-image-2/PROMPTS.md`. Local model prompts and acceptance notes
are in `assets/source/local-api/README.md`. The `boxes.json` files record source
hashes and crop coordinates. `assets/source/qa/alpha-magenta-contact.png` was
reviewed at full size to catch halos, truncated silhouettes, and inconsistent
scale.

### Rejected authoring candidates

`assets/source/local-api/layered/*.png` are Qwen Image Layered evaluation
outputs. They are retained only as authoring evidence: the generative
decomposition dropped or merged objects and therefore failed semantic QA.
They are never loaded at runtime. The accepted cutouts are deterministic crops
from the GPT Image 2 alpha sheets.

## Narration and sound

| Asset | Source / tool | QA and modifications | License |
|---|---|---|---|
| `assets/audio/*.mp3` (26 teacher lines) | `qwen3-tts-voiceclone` using `shared/assets/refs/voice-teacher.wav`; seed ladder 7 → 8 → 9 | loudness-normalized mono 44.1 kHz MP3; every published line transcribed with `whisper-stt` base/English and compared to the intended script; hashes, transcript ratios, durations, levels, and seeds in `assets/audio/qa-report.json` | CC BY 4.0 |
| `shared/assets/refs/voice-teacher.wav` | shared QLOBE Kids platform teacher reference | reference only; not copied into this game; the QA receipt stores only its SHA-256 | CC BY 4.0 |
| `shared/assets/music/whimsical-toy-workshop.mp3` | shared QLOBE Kids recorded music library | reused unmodified; played quietly through `shared/js/bgm.js`, started after gesture and ducked under narration | CC BY 4.0 |
| placement, wobble, sparkle, whistle, and motor effects | `shared/js/sfx.js` | synthesized at runtime with Web Audio; no sampled source | N/A |

The verbatim script is committed in `assets/audio/lines.json` and
`game-design.md`. `games/pattern-train/tools/generate-voice.py` is fail-closed:
it publishes a manifest only when every configured line has a valid clip and
Whisper receipt. `shared/js/voice-clips.js` provides Web Speech only as an
offline/missing-file fallback.

## Shared UI and typography

| Asset | Source | Creator | License | Use |
|---|---|---|---|---|
| `shared/assets/ui/btn-home.png`, `btn-back.png`, `btn-sound.png` | shared QLOBE Kids UI library | QLOBE Kids | CC BY 4.0 | persistent raster HUD controls |
| `shared/fonts/fredoka-latin-600-normal.woff2` | Fontsource / Google Fonts | Milena Brandão and Hafontia | SIL OFL 1.1 | short labels and accessible fallback text |

## Regeneration

```powershell
python games/pattern-train/tools/finalize-art.py
python games/pattern-train/tools/generate-voice.py --api $env:QLOBE_QWEN_URL
python games/pattern-train/tools/generate-voice.py --check
```

The local endpoint is intentionally never committed. Do not hand-edit generated
runtime derivatives; regenerate them from the retained masters and scripts.
