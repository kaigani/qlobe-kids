# Asset Log — Chalkboard Big Strokes

The production art world is **Toy**, treated as a rough color-chalk classroom
slate. Runtime artwork is raster. Canvas is used only for the changing chalk
guide, child trail, dust, and erase mask that make up the game mechanic.

## Production artwork

| Runtime asset | Authored source and workflow | Deterministic finalization | License |
|---|---|---|---|
| `assets/art/board-backdrop.webp` | `assets/source/gpt-image-2/board-backdrop-master.png`; OpenAI GPT Image 2 through Codex built-in image generation; verbatim prompt and recipe beside source | Pillow/WebP at 1536×1024, quality 80 | CC BY 4.0 |
| `assets/art/title-lockup.webp` | `assets/source/gpt-image-2/title-lockup-master.png`; OpenAI GPT Image 2; spelling reviewed at full size | alpha normalized, trimmed/padded, 1024 px max, WebP; magenta QA retained | CC BY 4.0 |
| Four mode cards, button plaque, eraser, chalk, Chalk Buddy, sparkle, Home/Sound/Replay controls | `assets/source/gpt-image-2/chalk-ui-sheet-master.png`; OpenAI GPT Image 2 coordinated 4×3 contact sheet | `tools/cut-asset-sheet.py` expected-count 12, reading order, close-radius 8; deterministic chroma matte; QLOBE `cutout_finalize.py`; alpha WebP | CC BY 4.0 |
| `assets/hub/tiles/chalkboard-big-strokes.jpg` | `assets/source/gpt-image-2/hub-tile-master.png`; separate GPT Image 2 QLOBE Toy menu composition | composited over warm cream, center-fit 640×533, progressive JPEG quality 91 | CC BY 4.0 |
| `assets/og-image.jpg` | production screenshot of this game | generated after final visual QA; 1200×630 link preview | CC BY 4.0 |

Exact prompts are retained in
`assets/source/gpt-image-2/PROMPTS.md`; each master has a versioned recipe.
`assets/source/final/build-report.json` records SHA-256 hashes and byte sizes for
all deterministic inputs and runtime outputs.

### Required cutter invocation

```sh
python tools/cut-asset-sheet.py \
  games/chalkboard-big-strokes/assets/source/gpt-image-2/chalk-ui-sheet-master.png \
  games/chalkboard-big-strokes/assets/source/crops-opaque \
  --names mode-card-cyan mode-card-yellow mode-card-pink mode-card-white \
    button-plaque felt-eraser chalk-pieces chalk-buddy nav-home nav-sound \
    sparkle nav-replay \
  --expected-count 12 --close-radius 8 \
  --debug-mask games/chalkboard-big-strokes/assets/source/chalk-ui-sheet-mask.png
```

The cutter passed at exactly 12 components. `boxes.json`, its binary mask, all
verbatim crops, transparent finals, and saturated-magenta composites are kept
for audit and edge review.

### LAN extraction note

The production run submitted both accepted masters to the configured
`qwen-image-layered` LAN workflow using
`tools/extract-layered.py` and the documented 42 → 1337 → 9001 seed ladder.
The remote service accepted every job but failed before inference because its
internal image-upload service was unavailable. The flat chroma source made the
documented deterministic fallback safe: the bundled image-generation skill's
`remove_chroma_key.py` produced the alpha matte, then the QLOBE finalizer and
magenta QA verified every edge. No failed LAN output is represented as source
material. The same run also attempted Studio's Krea 2 `menu-game-tile` template;
that workflow returned unavailable, so the separately authored GPT Image 2 hub
master was curated to the identical 6:5 menu grammar.

## Narration and music

| Asset | Source/workflow | QA and runtime treatment | License |
|---|---|---|---|
| `assets/audio/*.m4a` (10 teacher lines) | Edge TTS `en-US-AnaNeural`, explicit release fallback at -8% rate and +2 Hz pitch | mono 44.1 kHz AAC at 96 kbps after EBU loudness normalization; every final clip independently transcribed by local `faster-whisper/base` on CPU int8; exact transcripts, hashes, duration, loudness, codec, and fallback provenance retained in `qa-report.json` | CC BY 4.0 |
| `shared/assets/music/rainy-day-acoustic.mp3` | existing QLOBE Kids recorded music library | reused unmodified at quiet volume through `shared/js/bgm.js`; gesture-started, muted with the game, and ducked by narration | CC BY 4.0 |
| trace, dust, success, and UI SFX | shared `shared/js/sfx.js` | synthesized locally at runtime after audio unlock; no external request | repository license |
| speech fallback | shared `voice-clips.js` / narrator device-speech fallback | used only when an individual recorded clip cannot play; never blocks input | device/browser facility |

The voice script source of truth is `config.json`; `assets/audio/lines.json`,
`manifest.json`, and `qa-report.json` must agree byte-for-byte by key and hash.
The preferred `qwen3-tts-voiceclone` run used the approved shared teacher
reference and the documented 7 → 8 → 9 seed ladder, but the configured LAN
service failed internally before returning usable audio. No failed Qwen output
is represented as shipped narration. The explicit Edge fallback produced all
10 clips; every normalized transcript scored 1.0, and real Chrome separately
decodes and starts the recordings after a child gesture. Device speech remains
the last-resort runtime fallback if a clip cannot play.

## Shared code and fonts

| Asset | Source | License | Use |
|---|---|---|---|
| Fredoka SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | Fontsource / Google Fonts, Milena Brandão and Hafontia | SIL OFL 1.1 | real functional labels |
| Shared audio, narration, BGM, timer, and debug modules listed in `game.json` | QLOBE Kids repository | MIT | reused unmodified |

## Rebuild and QA

```sh
python games/chalkboard-big-strokes/tools/build-assets.py
python games/chalkboard-big-strokes/tools/generate-voice.py --api "$QLOBE_QWEN_URL"
python games/chalkboard-big-strokes/tools/generate-voice.py --edge-fallback
python games/chalkboard-big-strokes/tools/generate-voice.py --check
```

Authoring-time model hosts, LAN addresses, credentials, and personal paths are
never committed. The shipped game is static and offline-capable.
