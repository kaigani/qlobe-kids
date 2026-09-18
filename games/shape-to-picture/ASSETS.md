# Shape Surprise Studio assets

All primary child-facing art is committed Papercraft raster art. Runtime calls
no generation service. Source images, recipes, extraction QA, and voice QA live
under `assets/source/`; no LAN host, credentials, or personal reference path is
committed. Creator: QLOBE Kids; generated assets are CC BY 4.0.

## Runtime inventory

| Runtime asset(s) | Source / processing | Notes |
|---|---|---|
| `assets/backgrounds/paper-garden.webp` | `source/gpt-image-2/world-backdrop-master.png` → deterministic WebP | 1600×1200, 259,118 B, q86 |
| `assets/backgrounds/reveal-{boat,icecream,home,robot}.webp` | `source/local-api/qwen-edit/*-seed42.png` → WebP | Four Builder completion plates, 1600×1200, 196–223 KB |
| `assets/sprites/*.webp` | GPT Image 2 shape sheet → cutter → chroma/finalize → WebP | Fifteen visible paper manipulatives |
| `assets/reveals/{kitten,house,rocket,sun,balloon,tree}.webp` | GPT Image 2 reveal sheet → cutter → chroma/finalize → WebP | Tap/Stretch characters |
| `assets/ui/{title,banner,tray,build-mat}.webp` | GPT Image 2 title/UI sheet → cutter/chroma/finalize → WebP | Authored paper carriers; functional copy stays HTML |
| `assets/audio/*.m4a` | approved teacher reference → Qwen clone → AAC | 30 clips, 64 kbps AAC + faststart; manifest has measured durations/hashes |
| `../../assets/hub/tiles/shape-to-picture.jpg` | `source/local-api/hub/hub-seed42.png` | Krea 2 `menu-game-tile`, seed 42, 768×640 → curated 640×533 JPEG |
| `assets/og-image.jpg` | game screenshot | 1200×630 social image; regenerate with `tools/pipeline/capture_og_images.mjs` |

Fredoka (SIL OFL 1.1), shared HUD assets, and synthesized interaction SFX are
reused from the platform. Device Web Speech is an error fallback, not primary
voice playback.

## Image provenance and QA

GPT Image 2 masters/prompts are retained at `source/gpt-image-2/`:
`PROMPTS.md` records the Papercraft direction and `recipe-index.json` records
the asset-by-asset production prompts, acceptance state, dimensions, and source
hashes. The accepted master set includes the 4:3 garden, title, shape contact
sheet, reveal contact sheet, and UI sheet.
The required crop tool is `tools/cut-asset-sheet.py`; component coordinates and
debug masks are retained in `source/cuts/`, `source/local-api/cuts/`, and
`source/qa/`.

```text
GPT Image 2 master sheet
→ cut-asset-sheet.py (expected count + debug mask)
→ chroma-key alpha staging
→ tools/pipeline/cutout_finalize.py (alpha floor 4, trim/pad)
→ saturated-magenta review composite
→ optimized alpha WebP runtime sprite
```

`source/qa/art-finalize.json` records alpha histograms, crop boxes, sizes, and
budget checks. Partial-alpha paper-edge warnings were retained and reviewed,
not flattened. Full backgrounds are under the 300 KB default; ordinary sprite
derivatives are kept compact.

Qwen Image Edit created the four Builder plate variants from the accepted garden
at seed 42; receipts are `source/local-api/qwen-edit/*-seed42.recipe.json`.
Qwen Image Layered was attempted for the sheets, but its `layer_2` results were
rejected as opaque composites/no usable subjects. Those attempts and recipes
remain at `source/local-api/layered/`, and the rejection is recorded in
`source/qa/art-finalize.json`; they are not runtime inputs.

The catalog tile is a separate local Krea 2 seed-42 composition, recorded at
`source/local-api/hub/hub-seed42.recipe.json`. It uses the hub Toy menu grammar
while depicting Papercraft objects, never a splash crop.

## Recorded voice provenance

`tools/generate-voice.py` is resumable and contains the exact script. It reads
ignored local configuration only at authoring time, tries Qwen
`qwen3-tts-voiceclone` seeds 7/8/9, encodes FLAC to 64 kbps AAC/M4A with
`+faststart`, and Whisper-checks the result with `language=en`.

`assets/audio/lines.json` is runtime copy and `assets/audio/manifest.json`
contains stable file names, duration, SHA-256, and text hash. Each line has
`source/local-api/voice/<key>/recipe.json` plus `qa-transcript.json`; all 30
current clips have accepted English transcripts. Receipts retain only a voice
reference checksum, never its local path.

```powershell
python games/shape-to-picture/tools/generate-voice.py --check
python tools/cut-asset-sheet.py --help
python tools/pipeline/cutout_finalize.py --help
```
