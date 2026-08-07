# Weather Scientist asset log

Weather Scientist ships only local raster art, local narration clips, shared
QLOBE raster HUD assets, and runtime-synthesized sound. There are no emoji,
placeholder illustrations, remote fonts, remote media requests, or CSS/vector
substitutes for primary artwork. Four scenes (meadow, desert, arctic,
rainforest) share one universal UI kit and each contribute their own
background + world production sheet.

## Universal UI kit (one production pass, reused by every scene)

| Runtime assets | Retained master | Creation and processing | Creator / license | Attribution |
| --- | --- | --- | --- | --- |
| `assets/title.webp` | `assets/source/gpt-image-2/title.png` and `assets/source/qwen-layered/title.png` | GPT Image 2 exact-title master; semantic alpha separation with local Qwen Image Layered job `5f0a4d819cc1`; deterministic inset/resize/lossless WebP | Generated for QLOBE Kids; repository asset license CC BY 4.0 | No |
| `assets/ui/*.webp` (control tray, prompt banner, wind slider, four weather controls, four badges, play/explore/reset carriers) | `assets/source/gpt-image-2/ui-kit.png` and `assets/source/qwen-layered/ui-kit.png` | GPT Image 2 4×4 production sheet; semantic alpha separation with local Qwen Image Layered job `c36179a8d9fd`; explicit semantic regions exclude neighboring overhang before inset, normalization, and lossless-WebP encoding by `tools/process-art.py` | Generated for QLOBE Kids; repository asset license CC BY 4.0 | No |
| `../../assets/hub/tiles/weather-scientist.jpg` | `assets/source/gpt-image-2/hub-tile.png` | GPT Image 2 catalog emblem derived from the production meadow/world references; deterministic 640×533 crop in `tools/process-art.py` | Generated for QLOBE Kids; repository asset license CC BY 4.0 | No |
| `assets/backgrounds/splash.webp` | `assets/source/krea2/splash-background-wide.png` | LAN `krea2-turbo-t2i`, wide 3:2, a twilight observatory "home" scene distinct from any destination scene — the child sees this before picking a place. `tools/process-art.py`'s `build_splash_background` finalizes it under the same 300 KB budget | Generated for QLOBE Kids; repository asset license CC BY 4.0 | No |

The visual references were the original concept mockups in
`01-game-concepts/weather-scientist/output/ui-mockups/`. Reproduction prompts,
sheet cell maps, and imagegen output IDs for this original pass are retained
in `assets/source/PROMPTS.md`.

## Per-scene world content

Each scene contributes its own background (LAN `krea2-turbo-t2i`, wide 3:2,
1536×1024) and its own 4×4 world production sheet (`krea2-turbo-t2i`, cream
paper backdrop) covering: landmark, 3-stage growth character, 6 weather-state
layers (sun/cloud/rain-cloud/rainbow/puddle/shade), and particles — extracted
to alpha with the same LAN `qwen-image-layered` workflow used for the original
UI/world kits (async job flow, explicit-subject prompt, `layer_2` output).
`tools/process-art.py --scene <id>` (or no flag, for all scenes) crops each
sheet's 16 cells against the same `WORLD_BOXES` grid used by the original
meadow sheet, normalizes, downscales, and WebP-encodes.

| Scene | Background source | World-sheet source | Notes |
| --- | --- | --- | --- |
| meadow | `assets/source/krea2/observatory-meadow-wide.png` | `assets/source/qwen-layered/world-kit.png` (original GPT Image 2 + Qwen Image Layered pass, see original prompts below) | Background regenerated wide (was a 4:3 GPT Image 2 crop) to fix full-bleed edge-to-edge coverage; world sheet is the original production pass, unchanged |
| desert | `assets/source/krea2/desert-background-wide.png`, flat sheet `assets/source/krea2/desert-world-kit-flat.png` | `assets/source/qwen-layered/desert-world-kit.png` | Cell remap `{8:9, 9:8}` — the model's "puddle"/"shade" cells read semantically reversed from the prompt order (a gray dry patch vs. a blue wet-look oval); swapped to match conventional icon meaning |
| arctic | `assets/source/krea2/arctic-background-wide.png`, flat sheet `assets/source/krea2/arctic-world-kit-flat.png` | `assets/source/qwen-layered/arctic-world-kit.png` | No cell remap needed — every cell landed in its prompted position |
| rainforest | `assets/source/krea2/rainforest-background-wide.png`, flat sheet `assets/source/krea2/rainforest-world-kit-flat.png` | `assets/source/qwen-layered/rainforest-world-kit.png` | Cell remap `{4:5, 5:4, 8:9, 9:10, 10:11, 11:8}` — sun/cloud cells swapped, and puddle/shade/raindrop/leaf1 cells came back rotated by one position |

Cell remaps are recorded in `tools/process-art.py`'s `CELL_REMAP` constant
with the verified per-cell reasoning; verify any new scene's sheet cell-by-cell
(crop into a 4×4 grid and inspect each cell) before assuming the prompt order
was followed — LAN Krea2 sheet generation does not always honor cell order
exactly, especially for near-adjacent or semantically-close subjects.

Runtime paths (all under `assets/`): `backgrounds/{observatory-meadow,desert,arctic,rainforest}.webp`,
`world/<scene>/{landmark,growth-seedling,growth-bud,growth-bloom,sun,cloud,rain-cloud,rainbow,puddle,shade}.webp`,
`particles/<scene>/{raindrop,leaf-1,leaf-2,leaf-3}.webp`, `ui/scene-<scene>.webp`
(splash card thumbnail — a deterministic center crop of that scene's own
background, no separate generation).

Qwen processing was an authoring-time LAN operation only. It performed semantic
foreground extraction; no flood fill or chroma-key algorithm was used. The
shipping game has no model or network dependency. The generated alpha plates
are reviewed over saturated magenta in `assets/source/qa-magenta/`; the machine
report is `assets/source/process-art-qa.json`.

## Narration and sound

| Asset | Source / tool | Processing and QA | License / attribution |
| --- | --- | --- | --- |
| `assets/audio/<scene>-<key>.m4a` (60 clips: 4 scenes × 15 lines) | Exact authored lines in `config.json`'s per-scene `voice` blocks (mirrored into `assets/audio/lines.json`), cloned from the platform's shared teacher-voice reference (`voice_teacher.wav`) with the LAN `qwen3-tts-voiceclone` workflow | `tools/generate-voice.py` clones each line, converts the FLAC output to AAC 96 kbps M4A (`loudnorm=I=-18:TP=-2:LRA=9`), and Whisper-QA's the transcript against the source text (space/punctuation-insensitive compare, retried across seeds 7→42→1337→9001 on mismatch or failed audio QA) before shipping. Results: `manifest.json` and `qa.json`. | Generated locally for this project from the platform's shared voice reference; CC BY 4.0 |
| Interface feedback | `shared/js/sfx.js` | Synthesized at runtime with Web Audio | QLOBE Kids code, MIT |
| Rain/wind/snow/sand ambience | `weather-world.js` (local, `games/weather-scientist/js/`) | Synthesized at runtime with Web Audio; muted/suspended with the game | QLOBE Kids code, MIT |
| Missing-clip fallback | `shared/js/voice-clips.js` → `shared/js/speech.js` | Device speech only when a committed clip cannot play — not exercised in normal operation (60/60 clips ship valid) | Device/browser supplied; no bundled third-party file |

An earlier build of this game generated its "recorded" clips entirely offline
with the installed macOS `Samantha` voice, explicitly avoiding the platform's
shared teacher-voice reference to keep the generator network-free. That
approach was reversed — see `game-design.md`'s Departures section — and every
line now matches the platform standard used by every other shipped game.

## Shared presentation assets

| Asset | Source | Creator / license | Use |
| --- | --- | --- | --- |
| HUD Home, Back, and Sound buttons in `shared/assets/ui/` | QLOBE Kids shared raster library | QLOBE Kids, CC BY 4.0 | Standard tablet navigation and mute controls |
| `shared/fonts/fredoka-latin-600-normal.woff2` | Fredoka via Fontsource 5.0.13 | Milena Brandão and Hafontia, SIL OFL 1.1 | Accurate runtime labels and prompts |

## Link preview

`assets/og-image.jpg` is a 1200×630 crop of this game's own production splash,
captured after integration. Regenerate it from the rendered game with
`tools/pipeline/capture_og_images.mjs`; do not paint over it by hand.

## Rebuild and release checks

```sh
python3 games/weather-scientist/tools/process-art.py            # all scenes
python3 games/weather-scientist/tools/process-art.py --scene desert
python3 games/weather-scientist/tools/process-art.py --check
python3 games/weather-scientist/tools/generate-voice.py --check
node games/weather-scientist/js/weather-world.test.mjs
```

Current status: all 4 scenes' backgrounds, world sheets, and UI kit rebuild
cleanly from source; 60/60 narration clips are valid, real teacher-voice
clones (`engine: "qwen3-tts-voiceclone"` in `assets/audio/qa.json`).

## Original meadow production prompts (first pass, superseded background only)

The original meadow world/UI kit prompts, sheet cell maps, and imagegen output
IDs are retained in `assets/source/PROMPTS.md`. Its background prompt is
superseded by the wider 3:2 `krea2-turbo-t2i` regeneration described above;
the world/UI kit prompts and outputs are unchanged and still canonical.
