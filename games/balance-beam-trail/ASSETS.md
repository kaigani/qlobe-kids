# Balance Beam Trail assets

All shipped child-facing artwork is raster. Original nondeterministic generations are retained under `assets/source/gpt-image-2/`; the deterministic runtime outputs are under `assets/art/`. Generated game art is licensed CC BY 4.0 and the processing code is MIT.

## Runtime inventory

| Runtime asset | Source and treatment |
|---|---|
| `select-backdrop.webp` | GPT Image 2 selection-room master; opaque 1448x1086 WebP |
| `log-stage.webp`, `lava-stage.webp`, `hop-stage.webp` | GPT Image 2 mode masters; opaque 1448x1086 WebP |
| `complete-stage.webp` | GPT Image 2 dedicated finish-stage master; opaque 1448x1086 WebP |
| `title-lockup.webp` | Exact-spelling GPT Image 2 transparent title; alpha-cleaned, trimmed, and visually spell-checked |
| `fern-*.webp` | Six GPT Image 2 poses from one coordinated sheet, followed by a GPT Image 2 alpha edit, shared cutter extraction, alpha cleanup, and normalization to 520x640 |
| `card-*.webp`, `action-button.webp`, `star.webp`, `finish-flag.webp`, `sound.webp` | Coordinated GPT Image 2 UI sheet, followed by a GPT Image 2 alpha edit and shared cutter extraction |
| `balance-rail.webp` | Coordinated UI-sheet rail; the visually competing fixed blue pointer was removed in a targeted GPT Image 2 edit, then alpha-cleaned and optimized |
| `assets/hub/tiles/balance-beam-trail.jpg` | Dedicated GPT Image 2 catalog composition, center-cropped to the platform's 640x533 6:5 tile grammar; it is not a splash crop |
| `assets/og-image.jpg` | Generated from the final in-game selection screen for link previews |

Prompts and edit instructions are recorded in `assets/source/gpt-image-2/PROMPTS.md`. Magenta alpha-check composites and cutter masks live in `assets/source/qa/`.

## Required shared cutter commands

These are the exact extraction commands used. `--expected-count` makes a merged or missing component a hard failure.

```powershell
python tools/cut-asset-sheet.py games/balance-beam-trail/assets/source/gpt-image-2/fern-poses-alpha-master.png games/balance-beam-trail/assets/source/cuts/fern --names ready left-step right-step wobble-left wobble-right celebrate --expected-count 6 --alpha-threshold 224 --close-radius 6 --min-area 12000 --order reading --debug-mask games/balance-beam-trail/assets/source/qa/fern-alpha-mask.png

python tools/cut-asset-sheet.py games/balance-beam-trail/assets/source/gpt-image-2/ui-sheet-alpha-master.png games/balance-beam-trail/assets/source/cuts/ui --names card-log card-lava card-hop action-button balance-rail star finish-flag sound --expected-count 8 --alpha-threshold 224 --close-radius 4 --min-area 5000 --order reading --debug-mask games/balance-beam-trail/assets/source/qa/ui-alpha-mask.png
```

The cutter locates authored components; it does not invent equal grid cells. Every cut was checked on saturated magenta for fringe, missing extremities, and transparent corners.

## Deterministic finalization

Run from the repository root:

```powershell
python games/balance-beam-trail/tools/build-assets.py
```

The script cleans partial alpha, trims and pads cutouts, gives every Fern pose the same 520x640 canvas, encodes opaque stages at 1448x1086, writes the hub JPEG at 640x533, generates alpha-QA composites, atomically replaces WebP outputs, and decodes every result as a final integrity check. The known detached divider in the source action-button cut is removed by an explicit 18 px source-strip correction before finalization.

## Local authoring API and voice

QLOBE Studio jobs were submitted for Krea 2 backdrops/tile, Qwen Image Layered extraction, and Qwen voice cloning with the repository's approved `shared/assets/refs/voice-teacher.wav` reference. The reachable LAN wrapper's downstream generation routes returned 404/500 errors. Exact job IDs and error stages are retained in `assets/source/local-api/FAILED-JOBS.md`; no failed or unverified output is shipped.

`assets/audio/lines.json` is the dialogue source of truth. `assets/audio/manifest.json` is intentionally empty because the cloned clips did not pass through the failed service. The shared `voice-clips.js` player therefore uses its correct Web Speech fallback, and runtime production makes no model or LAN requests. When the authoring backend is repaired, regenerate seed 7 first, transcribe each encoded clip with Whisper, and add only transcript-approved M4A entries to the manifest.

## Attribution

- Art model: OpenAI GPT Image 2, generated for QLOBE Kids on 2026-09-18.
- Creative direction and deterministic processing: QLOBE Kids with Codex.
- Code: MIT.
- Generated game artwork: CC BY 4.0.
- No attribution-bearing third-party visual or audio asset is bundled.
