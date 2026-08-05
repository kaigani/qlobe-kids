# Little Artist asset production ledger

This ledger records the assets currently shipped by this game. Generation and
extraction used local LAN workflows only; GPT Image 2 was never used. The
production plan, prompts, seeds, and workflow assignments are recorded in
[`assets/source/local-api/plan.json`](assets/source/local-api/plan.json), with
accepted raw sources/recipes and normalized edit recipes retained beside the
QA evidence. Reproducible candidate layers, cell slices, and candidate audio
are authoring caches excluded by `assets/source/local-api/.gitignore`; they are
not runtime dependencies.

## Runtime art

All listed runtime art is present under `assets/` and is committed for offline
play. The per-group QA metrics in `assets/source/local-api/qa/*-metrics.json`
verify dimensions, alpha/edge gates, and the runtime size budget (each runtime
asset is ≤300 KB).

| Runtime group | Provenance / extraction | Status |
|---|---|---|
| `assets/workshop.webp` | Krea 2 (`raw/workshop.png`), composited to planned 1600×1200 cover; `qa/workshop-metrics.json` | Accepted |
| `assets/paper/{cream,sky,blush}.webp` | Krea 2 `raw/paper-sheets.png`; Qwen Image Layered cell extraction; `qa/paper-sheets*` | Accepted |
| `assets/title.webp` | Ideogram 4 typography source (`raw/title.png`) plus Qwen Image Layered cutout; `qa/title-*` | Accepted |
| `assets/teddy/{welcome,peek,celebrate}.webp` | Krea 2 `raw/teddy-sheet.png`; Qwen Image Edit/Layered extraction; `qa/teddy-sheet-*` | Accepted |
| `assets/modes/{collage,yarn,teddy}.webp` | Krea 2 mode art; `qa/mode-*-metrics.json` | Accepted |
| `assets/ui/*` | Krea 2 sheets; Qwen Image Edit chroma normalization for the eight badge cells; Qwen Image Layered cutouts; normalized recipes and `qa/{basket,frame,recycle,ui-sheet}*` | Accepted |
| `assets/pieces/nature/*.webp` (8) | Krea 2 sheet; Qwen Image Layered extraction; magenta/contact evidence and `qa/nature-sheet-*` | Accepted |
| `assets/pieces/paper/*.webp` (8) | Krea 2 sheet; Qwen Image Layered extraction; `qa/paper-shapes-sheet-*` | Accepted |
| `assets/pieces/buttons/*.webp` (6) | Krea 2 sheet; Qwen Image Layered extraction; hole/alpha gates in `qa/buttons-sheet-*` | Accepted |
| `assets/pieces/cozy/*.webp` (6) | Krea 2 sheet; Qwen Image Layered extraction; `qa/cozy-sheet-*` | Accepted |
| `assets/yarn/{coral,cream,gold,mint,plum,sky}.webp` | Krea 2 strand sources/sheet; Qwen Image Layered extraction; `qa/yarn-sheet-*` | Accepted |

Extraction was human-approved after saturated-magenta and contact-sheet review;
durable review images and metrics remain in `assets/source/local-api/qa/`.

The glossy hub candidate is retained only as a rejected record at
`assets/source/local-api/rejected/hub-tile-seed42-glossy.png` (and its recipe).
The final flat-papercraft replacement is the accepted
`assets/hub/tiles/loose-parts-collage.jpg`, with `qa/hub-tile-metrics.json` evidence.

`assets/og-image.jpg` is captured and checked as the 1200×630 Open Graph image;
the capture is not a generation source.

## Teacher audio

The 20 `.m4a` clips listed by `assets/audio/manifest.json` are generated with
the local `qwen3-tts-voiceclone` workflow and tracked by per-line recipes under
`assets/source/local-api/voice/`.
`assets/audio/qa.json` records 20/20 exact unconditioned Whisper verifier v2
accepts (`whisper-stt`, medium model, conditioning `none`, score and coverage
1.0). No human audio listen-through was performed; listening remains an iPad
release check.

The shared teacher voice is a synthetic seed-7 voice, CC BY 4.0, as documented
in [`shared/assets/refs/ASSETS.md`](../../shared/assets/refs/ASSETS.md). It is
not a person or a private reference recording.

## Output license

The generated pictures and voice clips are original QLOBE Kids outputs made
from project-authored prompts and the project-owned synthetic teacher voice.
The QLOBE Kids production team releases those outputs under CC BY 4.0 through
the repository's root `LICENSE-ASSETS`, matching the asset declaration in
`game.json`. No third-party or scraped source material ships in this game.

## Shared runtime licenses

| Asset | License / attribution | Use |
|---|---|---|
| `shared/fonts/fredoka-latin-600-normal.woff2` | SIL OFL 1.1; Fontsource/Fredoka | UI typography |
| Shared QLOBE UI assets | CC BY 4.0; QLOBE Kids | HUD and controls |
| Runtime synthesized sound (`shared/js/sfx.js`) | Project code under MIT | Feedback; no sourced audio |
