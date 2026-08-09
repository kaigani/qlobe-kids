# Rhythm Copycat — asset provenance

Canonical art-direction label: **Kawaii sticker toy** (per
`../../../01-game-concepts/rhythm-copycat/output/ui-mockups/PROMPTS.md`).
All art generated locally on the QLOBE LAN pipeline (never committed
hostnames/IPs). Original generations retained under `assets/source/`
(`kw-*` = kawaii generation set); deterministically finalized runtime sprites
in `assets/{bg,cards,dots,kiki,pads,ui}`.

## Visual language (from the mockups)

Puffy inflated soft-vinyl sticker look: thick rounded WHITE sticker borders on
every object, matte-satin plasticine, soft ambient occlusion, glossy kawaii
eyes with white catchlights + pink blush on characters, high-saturation citrus
palette (turquoise #2DD2D3, coral #FF6E5D, mustard #FFD23F, cream #FFF7DD,
sky blue, lime #8ED152), chunky cocoa-stroked bubble typography, flat
saturated walls, dashed stitch details, star stickers, dashed-stitch
celebration pills. Per-screen worlds: `splash/select` = music-room scene
(window, shelf, rug); `play` = flat aqua stage with corner props and a wavy
water strip; `end` = sky-blue stage with a scalloped podium.

## Pipeline

| stage | workflow | hosts |
|---|---|---|
| concept screen QA | `../../../01-game-concepts/rhythm-copycat/output/ui-mockups/*.png` | reference only |
| backgrounds / pads / tray / cards / plaque / button / star / djembe / dots / Kiki neutral / hub tile | `krea2-turbo-t2i` (style core in `tools/kawaii_gen.py`) | LAN |
| title lockup | `ideogram4-t2i` (bubble letters, cocoa stroke) | LAN |
| Kiki poses (6 derives) | `qwen-image-edit` (neutral as identity reference) | LAN |
| transparent cutouts | `qwen-image-layered` (2 layers, `output=layer_2`, no flood fill) | LAN |
| deterministic finalize | `tools/finalize.py` (PIL) + `tools/pipeline/pose_actor_assemble.py` | local |
| voice | `qwen3-tts-voiceclone` (platform teacher reference, seed 8) | LAN |
| voice QA | `whisper-stt` (`model_size=small`) | LAN |
| voice encode | ffmpeg AAC-LC 64k, `+faststart` | local |

Generation driver: `python3 tools/kawaii_gen.py --stage sources|title|poses|layers`
(idempotent; `--only a,b,c` shards a batch across machines/processes).
Style core prompt is the `STYLE` constant — every asset inherits it.

## Character — Kiki the kawaii kitten

Ginger-orange kitten restyled for kawaii: thick white sticker outline around
the whole body, big glossy black eyes with white catchlights, pink blush
cheeks, cream muzzle/chest/belly, black-tipped stubby tail. Pose pack
`assets/kiki/poses.json` (qlobe-pose-actor v1), 7 poses: neutral, notice,
clap, stomp, tap, shake, celebrate. Shared scale/baseline/anchor
[0.5, 0.949], normalized by `pose_actor_assemble.py`.

## Assets

| runtime file | source | notes |
|---|---|---|
| `bg/splash.webp` | `kw-bg-splash.png` | 1600×1200 cover-crop, opaque q82; used on splash + select |
| `bg/play.webp` | `kw-bg-play.png` | 1600×1200 cover-crop, opaque q82 |
| `bg/end.webp` | `kw-bg-end.png` | 1600×1200 cover-crop, opaque q82 |
| `ui/title.webp` | `kw-title.png` (ideogram) | alpha, ≤150 KB |
| `ui/tray.webp` | `kw-tray.png` → layered | stadium track, 4 chip seats |
| `ui/plaque.webp` | `kw-plaque.png` → layered | cream cloud banner, white+cocoa strokes |
| `ui/button.webp` | `kw-button.png` → layered | coral stadium pill, white border |
| `ui/star.webp` | `kw-star.png` → layered | kawaii star with face |
| `ui/djembe.webp` | `kw-djembe.png` → layered | mode-B badge |
| `cards/{orange,yellow,teal}.webp` | `kw-card-{color}.png` → layered | colored cards with stitch + pill |
| `pads/{clap,stomp,tap,shake}.webp` | `kw-pad-*.png` → layered | cream squircles, cocoa borders |
| `dots/{blue,green,orange,red}.webp` | `kw-dot-{color}.png` → layered | per-action colors (clap/stomp/tap/shake) |
| `kiki/poses/*.webp` | `kw-kiki-*.png` → layered → assembler | 1024² canvas |
| `../assets/hub/tiles/rhythm-copycat.jpg` | `kw-hub-tile.png` | 640×533 curated, no text |
| `assets/og-image.jpg` | browser capture of the splash | 1200×630 |

## Voice

28 lines (full script in `game-design.md`), all cloned from the platform
teacher voice reference (`tools/state/local.json → teacherVoicePath`), seed 8,
Whisper-QA'd (small model) — see the QA log for per-line transcripts. AAC-LC
64k m4a builds `assets/audio/manifest.json` (dur/sha256/textHash) +
`lines.json`.

## Licenses

Original generations: CC-BY-4.0 (QLOBE LAN pipeline). Runtime asset
derivatives: CC-BY-4.0. Code: MIT. Teacher voice: rights-cleared platform
voice, used for all clips.