# Turn-Taking Tower assets

Turn-Taking Tower uses original raster production art and recorded dialogue. It downloads no third-party art and makes no model or authoring-API request at runtime. Game-owned assets follow the repository's CC BY 4.0 asset license; shared platform media retains its repository license.

## Runtime art

| Runtime path | Source / tool | Production notes |
|---|---|---|
| `assets/scenes/playroom.webp` | GPT Image 2, conditioned on the approved concept mockups | Original empty warm 4:3 wooden playroom plate, cover-cropped to 1280×960 and WebP-encoded by `tools/process-assets.py`. |
| `assets/characters/friend-*.webp` | GPT Image 2 exact-count sprite sheet | Blue and yellow wooden friends in idle and cheering poses. Identity, lighting, grain, and camera angle were established in one sheet. |
| `assets/blocks/*.webp` | GPT Image 2 exact-count sprite sheet | Ten colorful wooden tower pieces, a shared base, and the star turn token. |
| `assets/ui/*.webp` | GPT Image 2 UI sheet plus transparent-background edit | Blank wooden sign, player card, and blue/green button plates. All visible words are live HTML, not baked into art. |

The complete accepted GPT Image 2 source plates, exact prompts, cutter boxes, and debug masks are retained in `assets/source/gpt-image-2/`. The initial opaque UI cuts were not shipped. A local Qwen Image Layered pass was also visually rejected because its layers retained dark rectangular mattes; that decision is recorded in `assets/source/local-api/layered-review.json` without retaining the failed multi-megabyte outputs.

## Asset-sheet cutting and deterministic finalization

The required repository cutter was run against the sixteen-object character/block sheet:

```sh
python tools/cut-asset-sheet.py \
  games/turn-taking-tower/assets/source/gpt-image-2/sprites-charcoal.png \
  games/turn-taking-tower/assets/source/gpt-image-2/sprites \
  --names friend-blue friend-yellow friend-blue-cheer friend-yellow-cheer block-blue-long block-yellow-long block-red-long block-green-long block-blue-square block-yellow-square block-red-square block-green-square block-arch block-roof turn-token tower-base \
  --expected-count 16 \
  --debug-mask games/turn-taking-tower/assets/source/gpt-image-2/sprites-mask.png
```

The accepted true-alpha UI sheet was cut with the same tool and an exact count of four:

```sh
python tools/cut-asset-sheet.py \
  games/turn-taking-tower/assets/source/gpt-image-2/ui-transparent-attempt.png \
  games/turn-taking-tower/assets/source/gpt-image-2/ui-transparent \
  --names sign-plaque player-card button-green button-blue \
  --expected-count 4 \
  --debug-mask games/turn-taking-tower/assets/source/gpt-image-2/ui-transparent-mask.png
```

Shipping derivatives are reproducible with:

```sh
python games/turn-taking-tower/tools/process-assets.py
```

That script rejects missing/empty alpha, trims only transparent bounds, adds deterministic padding, downscales, writes exact-alpha WebP, and records hashes, dimensions, alpha statistics, and byte sizes in `assets/source/processing.json`.

## Hub and link-preview art

| Asset | Source | Notes |
|---|---|---|
| `../../assets/hub/tiles/turn-taking-tower.jpg` | Local Krea 2 (`krea2-turbo-t2i`) | Separate menu-tile composition, 768×640 source, seed 42, no text or UI; curated to 640×533 JPEG. The master and endpoint-free recipe are under `assets/source/krea/`. |
| `assets/og-image.jpg` | Screenshot of the real game setup | 1200×630 JPEG produced by `tools/pipeline/capture_og_images.mjs`; regenerate rather than hand-edit. |

## Voice

The eighteen lines in `assets/audio/lines.json` were produced through the approved local `qwen3-tts-voiceclone` workflow with `shared/assets/refs/voice-teacher.wav`. Seed 7 is the first take; later seeds are used only after transcript rejection. Every shipping M4A was checked by local `whisper-stt`; `assets/audio/qa.json` records intended text, transcript, similarity, coverage, duration, and acceptance. The final set is 18/18 accepted.

| Asset group | Source | QA / provenance |
|---|---|---|
| `assets/audio/*.m4a` | Local Qwen3 TTS voice clone | Mono 24 kHz AAC/M4A teacher prompts. Durations and accepted seeds are in `manifest.json`. |
| `assets/audio/*.recipe.json` | Game-local generator | Endpoint-free text, seed, codec, reference class, and Whisper result for each accepted clip. |
| `assets/audio/qa.json` | Local Whisper STT | Per-seed acceptance evidence; rejected raw candidates are intentionally not committed. |

Generation is reproducible when the private LAN host is supplied through the ignored local state or environment:

```sh
python games/turn-taking-tower/tools/gen-voice.py
```

`tools/gen-voice.py` never writes the LAN host or an external personal path into the repository. `voice-clips.js` retains device-speech fallback if a clip cannot decode.

## Shared platform media

| Asset | Source / license | Use |
|---|---|---|
| `shared/assets/music/whimsical-toy-workshop.mp3` | Existing QLOBE Kids shared music library | Quiet looping toy-workshop bed through `bgm.js`; ducked beneath dialogue. |
| `shared/assets/ui/btn-home.png`, `btn-back.png`, `btn-sound.png` | Existing QLOBE Kids shared UI library | Raster navigation and narration controls with 96 px hit areas. |
| Shared procedural SFX | Existing QLOBE Kids `sfx.js` | Tick, whoosh, pop, and gentle error feedback. |

## Non-shipping concept references

`01-game-concepts/turn-taking-tower/brief.md` and its four UI mockups define the Toy art world, turn handoff, tower composition, and shared celebration. They are reference material, not copied runtime assets. The production game follows the mockups' warm playroom treatment while preserving the brief's ages 2–5, drag-and-place play, AI buddy, two-player option, and cooperative learning goal.
