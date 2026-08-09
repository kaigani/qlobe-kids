# Rhythm Copycat — asset provenance

Canonical art-direction label: **Claymation**. All art generated locally on the
QLOBE LAN pipeline (never committed hostnames/IPs). Original generations
retained under `assets/source/`; deterministically finalized runtime sprites in
`assets/{bg,ui,pads,dots,kiki}`.

## Pipeline

| stage | workflow | hosts |
|---|---|---|
| concept screen QA | `../../../01-game-concepts/rhythm-copycat/output/ui-mockups/*.png` | reference only |
| background / prop / hub tile / star / button / card / tray | `krea2-turbo-t2i` | LAN |
| title lockup | `ideogram4-t2i` | LAN |
| Kiki neutral + pad master | `krea2-turbo-t2i` | LAN |
| Kiki poses (6 derives) + embossed pads + plaque | `qwen-image-edit` (neutral/pad master as identity reference) | LAN |
| transparent cutouts | `qwen-image-layered` (2 layers, `output=layer_2`) | LAN |
| deterministic finalize | `tools/finalize.py` (PIL) + `tools/pipeline/pose_actor_assemble.py` | local |
| voice | `qwen3-tts-voiceclone` (platform teacher reference, seed 8) | LAN |
| voice QA | `whisper-stt` (`model_size=small`) | LAN |
| voice encode | ffmpeg AAC-LC 64k, `+faststart` | local |

Seed ladder used: 42 → 1337 → 9001 (retries on malformed results).

## Character — Kiki the clay kitten

Ginger-orange clay kitten, cream muzzle/chest/belly, tabby stripes, big amber
eyes, pink nose, whiskers, black-tipped stubby tail. Pose pack
`assets/kiki/poses.json` (qlobe-pose-actor v1), 7 poses: neutral, notice, clap,
stomp, tap, shake, celebrate. Shared scale/baseline/anchor [0.5, 0.949],
normalized by `pose_actor_assemble.py`. `kiki-stomp` was rerolled twice (1337,
9001) until the pose read as a bouncing stomp-dance hop instead of a passive
stand.

## Assets

| runtime file | source | notes |
|---|---|---|
| `bg/splash.webp` | `source/splash-bg.png` | 1600×1200 cover-crop, opaque q82 |
| `bg/play.webp` | `source/play-bg.png` | 1600×1200 cover-crop, opaque q82 |
| `ui/title.webp` | `source/title.png` → layered | alpha, ≤150 KB, OCR-checked "Rhythm ♪ Copycat" |
| `ui/tray.webp` | `source/tray.png` → layered | alpha |
| `ui/plaque.webp` | edit of tray (wells smoothed) → layered | alpha |
| `ui/button.webp` | `source/button.png` → layered | alpha |
| `ui/card.webp` | `source/card.png` → layered | alpha |
| `ui/star.webp` | `source/star.png` → layered | alpha |
| `ui/djembe.webp` | `source/djembe.png` → layered | alpha |
| `pads/{clap,stomp,tap,shake}.webp` | `source/pad-*.png` (master + 4 emboss edits) → layered | alpha, 512² |
| `dots/{coral,teal,mustard,lilac}.webp` | `source/dot-sheet.png` → layered, sliced 4× | alpha, 160² |
| `kiki/poses/*.webp` | `source/kiki-*.png` → layered → assembler | 1024² canvas |
| `../assets/hub/tiles/rhythm-copycat.jpg` | `source/hub-tile.png` | 640×533 curated, no text |
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