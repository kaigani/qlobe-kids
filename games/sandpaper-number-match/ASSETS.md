# Asset Log — Sandpaper Number Match

The production art world is **Puppet / Cozy felt fabric**. Every fixed
child-facing object is authored raster artwork: sandpaper numerals, plush stars,
stitched cards, controls, rewards, pencil mascot, and quiet-book backdrop.
Canvas is limited to the live tracing guide and the child’s changing sandy
trail; CSS is limited to layout, type, focus, and motion.

## Production artwork

| Runtime asset | Authored source and workflow | Deterministic finalization | License |
|---|---|---|---|
| `assets/art/world-backdrop.webp` | `assets/source/gpt-image-2/world-backdrop-master.png`; OpenAI GPT Image 2 using the concept mockups as style/composition references | RGB 1448×1086 WebP, quality 86 | CC BY 4.0 |
| `assets/art/numeral-0.webp` through `numeral-9.webp` | `assets/source/gpt-image-2/numerals-master.png`; OpenAI GPT Image 2 exact 5×2 transparent contact sheet | required QLOBE cutter, alpha trim, 4% pad, ≤480 px, alpha WebP quality 92 | CC BY 4.0 |
| title/button plaques, three mode cards, Home/Back/Sound controls, Pencil Buddy, sleepy/awake stars, rosette | `assets/source/gpt-image-2/ui-props-master.png`; OpenAI GPT Image 2 exact 4×3 transparent contact sheet | required QLOBE cutter, alpha trim, 4% pad, 480–640 px, alpha WebP quality 92 | CC BY 4.0 |
| `assets/art/nav-replay.webp` | `assets/source/gpt-image-2/nav-replay-master.png`; focused GPT Image 2 edit of the accepted felt Back patch | alpha trim, 4% pad, ≤480 px, alpha WebP quality 92 | CC BY 4.0 |
| `assets/art/title-lockup.webp` | `assets/source/gpt-image-2/title-lockup-master.png`; focused GPT Image 2 edit of the accepted blank title plaque with exact inspected lettering | alpha trim, 4% pad, ≤800 px, alpha WebP quality 92 | CC BY 4.0 |
| `assets/hub/tiles/sandpaper-number-match.jpg` | `assets/source/local-api/hub-krea-seed42.png`; local Krea 2 text-to-image, seed 42 | center crop 640×533, JPEG quality 90 | CC BY 4.0 |
| `assets/og-image.jpg` | final production splash screenshot | 1200×630 JPEG generated after browser visual QA | CC BY 4.0 |

The full prompts and disposition notes are retained in
`assets/source/gpt-image-2/PROMPTS.md`. `assets/source/processing.json` records
every accepted source/output pair, dimensions, transformation, and SHA-256.

### Required asset-sheet cutting

The generated sheets were cut with the repository tool, not manual crops:

```sh
python tools/cut-asset-sheet.py \
  games/sandpaper-number-match/assets/source/gpt-image-2/numerals-master.png \
  games/sandpaper-number-match/assets/source/crops/numerals \
  --names numeral-0 numeral-1 numeral-2 numeral-3 numeral-4 \
    numeral-5 numeral-6 numeral-7 numeral-8 numeral-9 \
  --expected-count 10 --alpha-threshold 8 --close-radius 0 --order reading \
  --debug-mask games/sandpaper-number-match/assets/source/qa/numerals-mask.png

python tools/cut-asset-sheet.py \
  games/sandpaper-number-match/assets/source/gpt-image-2/ui-props-master.png \
  games/sandpaper-number-match/assets/source/crops/ui-props \
  --names title-plaque mode-card-teal mode-card-coral mode-card-gold \
    button-plaque nav-home nav-back nav-sound pencil-buddy star-sleepy \
    star-awake rosette \
  --expected-count 12 --alpha-threshold 8 --close-radius 0 --order reading \
  --debug-mask games/sandpaper-number-match/assets/source/qa/ui-props-mask.png
```

Both commands passed their exact expected component counts. Their `boxes.json`
files preserve source hashes and bounding boxes. The 24 transparent runtime
objects, including the separately edited replay icon, each have a saturated
magenta composite under `assets/source/qa/magenta/` for edge and halo review.

### Local image-workflow curation

The approved local API was used in addition to GPT Image 2:

- Krea 2 seed 42 produced the accepted catalog tableau. It contains exactly one
  sandpaper 3 and exactly three plush stars and remains visually distinct from
  the in-game 4:3 world while using the catalog’s airy Toy-style composition.
- Qwen Image Edit was tried on the replay control. Its result
  (`assets/source/local-api/nav-replay-qwen-edit.png`) changed the requested
  circular replay symbol into a play triangle and added an opaque brown scene.
  It is intentionally rejected and never referenced at runtime.
- Qwen Image Layered was unnecessary because both accepted contact sheets had
  clean native alpha and the QLOBE cutter isolated exactly the expected count.

Authoring-time hosts, credentials, and machine-local paths are not committed.

## Narration, music, and sound

| Asset | Source/workflow | QA and runtime treatment | License |
|---|---|---|---|
| `assets/audio/*.m4a` (26 lines) | local `qwen3-tts-voiceclone` using the approved shared teacher reference; canonical seed ladder 7 → 8 → 9 | every clip accepted at seed 7; mono 44.1 kHz AAC 96 kbps after silence trim and EBU loudness normalization; every final clip checked by local `whisper-stt` base/en; 26/26 normalized transcripts scored 1.0; durations 0.406–3.5 s | CC BY 4.0 |
| `shared/assets/music/whimsical-toy-workshop.mp3` | existing QLOBE Kids recorded music library | reused unmodified at volume 0.13 through `shared/js/bgm.js`; begins only after a real gesture, follows mute, and ducks for narration | CC BY 4.0 |
| tap, star wake, retry, and celebration SFX | `shared/js/sfx.js` | synthesized at runtime after audio unlock; no network request | repository license |
| emergency speech fallback | shared `voice-clips.js` and device speech | invoked only if a recorded line fails to load or play; never blocks input | device/browser facility |

The spoken script’s source of truth is `config.json`. Runtime
`assets/audio/lines.json`, `manifest.json`, per-clip recipe sidecars, and
`qa-report.json` bind every line to its text hash, file hash, seed, duration,
loudness, expected text, and heard transcript. Raw accepted FLAC, encoded
candidate, and Whisper response are retained under
`assets/source/local-api/voice/` as reproducible authoring evidence.

## Shared code and font

| Asset | Source | License | Use |
|---|---|---|---|
| Fredoka SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | Fontsource / Google Fonts, Milena Brandão and Hafontia | SIL OFL 1.1 | functional HTML labels only |
| shared screen, narration, audio, input, timer, nudge, celebration, RNG, preload, and debug modules listed in `game.json` | QLOBE Kids repository | MIT | reused platform modules; recorded-clip interruption settlement was hardened so mute can never strand a completion gate |

## Rebuild and verification

```sh
python games/sandpaper-number-match/tools/build-assets.py --force
python games/sandpaper-number-match/tools/generate-voice.py --api "$QLOBE_QWEN_URL"
python games/sandpaper-number-match/tools/generate-voice.py --check
node games/sandpaper-number-match/tools/qa.mjs --base http://127.0.0.1:8765
```

The shipped route is static and offline-capable. No authoring model is contacted
at runtime.
