# Pattern Bracelet Band — asset production record

All runtime art and audio is bundled locally for offline play. Generated assets are authoring outputs; no third-party stock art is shipped. The canonical art world is **Toy**: warm wood, cream fabric, chunky painted beads, and real tabletop objects. This record intentionally replaces the former Claymation/placeholder claims.

## Shipped raster art

| Runtime | Production source and processing |
|---|---|
| `assets/workshop.webp`, `assets/concert.webp` | GPT Image 2 source masters `assets/source/workshop-gpt-image-2.png` and `concert-gpt-image-2.png`; trimmed/encoded by `tools/finalize-assets.py` to 1600×1200 WebP. |
| `assets/title.webp` | GPT Image 2 source `assets/source/title-gpt-image-2.png`, with the exact “PATTERN BRACELET BAND” lockup; trimmed/encoded by `finalize-assets.py`. |
| `assets/beads/bead-*.webp` (6) | GPT Image 2 source `assets/source/bead-sheet-gpt-image-2.png`; local Qwen Image Layered `layer_2` extraction `bead-sheet-qwen-layer2.png` was accepted for cutting. `tools/cut-asset-sheet.py` cut six named beads; `finalize-assets.py` trimmed, padded, and encoded WebP. |
| `assets/ui/{board,cord,tray,mode-plaque,star,play,slower,faster,clear,save,replay}.webp` | GPT Image 2 sources `workshop-parts-sheet-gpt-image-2.png` and `control-sheet-gpt-image-2.png`; `cut-asset-sheet.py` cut 5 parts and 6 controls with debug masks, then `finalize-assets.py` produced runtime WebP. |
| `assets/ui/{slot-well,prompt-plaque,tempo-plaque,jewelry-panel}.webp` | GPT Image 2 image-edit source `assets/source/ui-surfaces-sheet-gpt-image-2.png`, generated with the parts and control sheets as style references. `cut-asset-sheet.py` cut exactly 4 named surfaces with a debug mask; `finalize-assets.py` performed trim/padding, magenta-edge QA, and WebP encoding. These raster surfaces replace visible CSS-drawn wells and panels. |
| `assets/hub/tiles/pattern-bracelet-band.jpg` | Local Krea 2 text-to-image, seed 42, established the cover composition in `assets/source/hub-tile-krea2-seed42.png`. GPT Image 2 then edited that image with the bead sheet as a second reference so the cover uses the six exact in-game shapes; accepted master `hub-tile-gpt-image-2-edit.png`, curated and encoded at 640×533. |

The two Qwen layered attempts on the parts sheet (`workshop-parts-sheet-qwen-layer2.png` and `workshop-parts-sheet-qwen-layer2-v2.png`) are retained as rejected provenance only: they dropped or merged required objects. The surface-sheet attempt (`ui-surfaces-sheet-qwen-layer2.png`) is also rejected because it returned only an organizer fragment. None of those rejected files is used at runtime. Magenta edge/QC outputs and crop artifacts are retained under `assets/source/qa/` and `assets/source/crops/`.

`assets/source/runtime-manifest.json` records shipped filenames, dimensions, byte budgets, and SHA-256 values. Current backgrounds are approximately 329–336 KB (1600×1200), title 130 KB, beads 27–35 KB each, and the hub tile 53 KB; the manifest is authoritative if files change.

## Audio provenance

All 29 spoken clips in `assets/audio/` were generated from `shared/assets/refs/voice-teacher.wav` using the approved local Qwen TTS voice-clone service. Clips are AAC/M4A with fast-start metadata; every referenced recording passes the local Whisper transcript and duration gate recorded in `whisper-qa.json`. `assets/audio/manifest.json` and `lines.json` are the runtime indexes. The generator omits a failed clip from the manifest so the platform voice fallback remains safe, although this production set currently needs no fallback.

The game also uses the shared recorded BGM `shared/assets/music/whimsical-toy-workshop.mp3` at a low duckable volume. Bead pitches are synthesized by the game’s Web Audio mechanic rather than shipped as art assets.

## Authoring tools and provenance

- GPT Image 2 generated the workshop, bead, parts, title, concert, and control source sheets in `text-to-image` mode, plus the UI surface sheet and final hub cover in image-edit modes with local references. Exact prompts, modes, references, local workflows, seed, and accepted/rejected outputs are recorded in `assets/source/generation-prompts.json`.
- Local Krea 2 produced the hub tile's base composition (seed 42); GPT Image 2 supplied the accepted shaped-bead edit.
- Local Qwen Image Layered was used for bead separation; the failed parts separations remain explicitly rejected above.
- `tools/cut-asset-sheet.py` was run with expected component counts of 6 beads, 5 parts, 6 controls, and 4 UI surfaces, including debug masks. `tools/finalize-assets.py` performs magenta QA, trim/padding, and WebP encoding.

All art is original project-generated content and is shipped under the project’s normal QLOBE Kids asset terms; no external attribution is required. AI generation services are not runtime dependencies. No child playtest or live-release claim is made here.
