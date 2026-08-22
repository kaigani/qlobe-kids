# Board Game Reset Ritual — asset log

All authored game art is raster. CSS is limited to layout, focus, raster-edge
masks, shadows, and motion; there are no SVG, emoji, canvas-drawn, or CSS-drawn
game objects.
Generated assets are original QLOBE Kids production material, released with the
repository under CC BY 4.0; no in-game attribution is required.

## Shipped raster art

| Runtime asset | Production lineage | Finalization |
|---|---|---|
| `assets/world/board-table.webp` | GPT Image 2 board master, composed against the concept mockups | 1600×1200 WebP q82, 240 KB |
| `assets/world/splash-table.webp`, `ritual-table.webp` | GPT Image 2 clean tabletop plate | 1600×1200 WebP; ritual plate intentionally reuses the clean plate |
| `assets/world/responsive-portrait.webp`, `responsive-wide.webp` | GPT Image 2 responsive Toy-world outpaints, matched to the accepted ritual plate | 1086×1448 and 1915×821 WebP; edge-authored, interaction-safe center fields |
| `assets/ui/title.webp` | GPT Image 2 exact-spelling green-screen lockup | deterministic chroma removal, alpha crop, WebP |
| `assets/characters/*.webp`, `assets/pieces/pawn-*.webp` | GPT Image 2 Biscuit/Miso identity sheet on green | deterministic chroma removal, fixed cell crops, WebP |
| `assets/ui/{spinner,play-medallion,wood-plaque,breathe-cloud,tidy-basket,together-badge}.webp` | GPT Image 2 prop sheet on green | deterministic chroma removal, cell crops, alpha-tight plaque crop, WebP |
| `assets/pieces/{heart,star,flower}.webp` | Same accepted GPT Image 2 prop sheet | deterministic cell crops, WebP |
| `../../assets/hub/tiles/board-game-reset.jpg` | Krea 2 seed-42 clean Toy board plate + accepted GPT character/spinner cutouts | local raster composite, 640×533 JPEG, 84 KB |
| `assets/og-image.jpg` | Accepted splash plate + title + friends + play cutout | local raster composite, 1200×630 JPEG, 140 KB |

The complete prompt set, parameters, accepted/rejected decisions, and source
filenames are frozen in `assets/source/PROMPTS.md` and adjacent recipe JSON.

## Local API studies

- `qwen-edit-ritual-master.png` tested a direct reset-scene edit. It was
  rejected because it baked duplicate props into the plate.
- `qwen-layered-characters-layer_0.png`, `layer_1.png`, and `layer2.png`
  preserve the completed three-layer Qwen Image Layered job. The separation
  worked, but the extracted layer retained a dark matte; the cleaner
  deterministic green-screen cutouts were promoted.
- `krea2-hub-base-seed42.png` passed visual review and is visibly present in
  the shipped hub tile beneath GPT-authored identity-safe characters.
- Superseded GPT keyed studies remain in `assets/source/` for auditability and
  are not fetched at runtime.

## Voice and sound

All 20 configured lines under `assets/audio/*.m4a` were produced with
`qwen3-tts-voiceclone`, using a project-accessible, already transcript-approved
teacher-voice clip as the authorized reference. Each FLAC result was trimmed,
loudness-normalized to -18 LUFS / -2 dBTP, and encoded as 24 kHz mono AAC at
96 kbps. Whisper `base` then transcribed every final candidate with the expected
line as its initial prompt.

- `assets/audio/manifest.json`: runtime file, duration, and text-hash map.
- `assets/audio/lines.json`: exact text derived from `config.json`.
- `assets/audio/qa.json`: seed, duration, level, transcript, match score, and
  attempt record. Result: **20/20 accepted; minimum transcript score 1.0**.
- `assets/source/local-api/voice/`: accepted source candidates and per-clip
  provenance sidecars.
- `tools/generate-voice.py`: resumable batch generator and strict QA gate.

The inaccessible machine-local reference path and private LAN host are never
serialized into committed provenance.

Runtime SFX come from the shared QLOBE audio modules. Recorded background music
uses the shared library and loops with fades through `shared/js/bgm.js`.

## Shared platform assets

| Asset | Source | License | Use |
|---|---|---|---|
| Fredoka 600 | Fontsource / Fredoka by Milena Brandão and Hafontia | SIL OFL 1.1 | Interface text |
| Shared HUD button PNGs | QLOBE Kids | CC BY 4.0 | Home/back and replay-audio controls |
| `shared/assets/music/whimsical-toy-workshop.mp3` | QLOBE Kids shared music library | Repository license | Quiet optional underscore |

## Regeneration

```bash
python3 games/board-game-reset/tools/generate-voice.py
python3 games/board-game-reset/tools/generate-voice.py --check
node tools/pipeline/capture_og_images.mjs --only board-game-reset
```

Image regeneration uses the built-in GPT Image 2 workflow and the approved
QLOBE local workflows named in `assets/source/PROMPTS.md`. Endpoint and personal
reference configuration stay in ignored local state.
