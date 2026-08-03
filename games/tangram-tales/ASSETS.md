# Tangram Tales — asset manifest and provenance

All model work is authoring-time only. The shipped game is static and makes no
runtime network request. Runtime art is original QLOBE Kids papercraft produced
with the built-in GPT Image 2 workflow, then sliced, masked, composited, and
encoded deterministically by `tools/build-assets.py`.

## Production assets

| Runtime asset | Source / workflow | Finalization and QA |
| --- | --- | --- |
| `assets/theatre.webp` | `assets/source/theatre-gpt-image-2.png`; GPT Image 2 with the approved concept overview as style reference | cover crop to 1600×1200; WebP q82; 203 KB; calm central play field inspected |
| `assets/splash.webp` | accepted theatre + Qwen `title-layer2.png` | deterministic raster composite; 1600×1200 WebP q82, 228 KB; exact title spell-checked in landscape and portrait |
| `assets/title.webp` | `title-chroma-magenta-gpt-image-2.png` → Qwen Image Layered `layer_2`, seed 1337 | true-alpha papercraft lockup; near-transparent model residue below alpha 16 removed deterministically before trim; 61 KB; transparent corners and final composite inspected |
| `assets/scenes/{fox,fish,bird}.webp` | exact thirds of `reveal-scenes-gpt-image-2.png` | deterministic cell crop; 1200×1200 WebP q82; 127–136 KB; no text or unintended animal baked in |
| `assets/pieces/*.webp` ×7 | `paper-atlas-gpt-image-2.png` exact seven swatches | authored texture clipped into exact seeded raster tangram masks; paper shadow/edge baked; 512×512 alpha WebP; transparent corners checked |
| `assets/pieces/ghost-*.webp` ×7 | same accepted exact raster masks | low-alpha warm-paper target sprites; no CSS geometry |
| `assets/ui/*.webp` | accepted paper atlas + the accepted theatre's cream paper | deterministic raster plates for cards, tray, prompt, badges, and large actions; functional labels remain HTML |
| `assets/ui/{completion-star,turn-clockwise}.webp` | `ui-icons-gpt-image-2.png`; GPT Image 2 exact two-cell contact sheet | chroma-key helper matte, exact deterministic halves, alpha trim and 256×256 WebP; replaces the last font-glyph symbols |
| `assets/ui/{face-eye,face-nose}.webp` | `face-details-gpt-image-2.png`; GPT Image 2 exact two-cell contact sheet | chroma-key helper matte, deterministic halves, alpha trim and 256×256 WebP; makes card and reveal silhouettes immediately readable |
| `assets/og-image.jpg` | real game splash captured by `tools/pipeline/capture_og_images.mjs` | 1200×630 JPEG q82, 125 KiB, luma/blank gate passed |
| `assets/hub/tiles/tangram-tales.jpg` | pre-existing QLOBE Kids hub tile | retained: recognizable seven-piece toy-table fox, no text, correct hub grammar |
| `assets/audio/manifest.json` + 22 `.m4a` clips | `tools/gen-voice.py`; approved teacher-voice clone → AAC loudness/trim → same-host Whisper transcript QA | 22/22 current script hashes accepted; 640 KB total; seed and duration recorded per clip; exact device-speech fallback remains available |

Every runtime WebP's dimensions, byte size, alpha presence, and transparent-
corner result are recorded in `assets/source/finalize-report.json`.

## GPT Image 2 source history

Full prompts and exact source filenames are retained in
`assets/source/gpt-image-2-prompts.json`.

1. `theatre-gpt-image-2.png` — accepted on first generation.
2. `title-chroma-gpt-image-2.png` — title correctly spelled, but rejected as a
   matte source because a model-created green letter conflicted with the green key.
3. `title-chroma-magenta-gpt-image-2.png` — targeted background-only edit;
   correctly preserved green letters, but local chroma matting failed full-size
   edge/color QC. `title-alpha.png` is retained as a rejected intermediate and is
   not consumed by the finalizer.
4. `title-opaque-gpt-image-2.png` — targeted safe fallback with the exact title
   preserved on warm cream paper; accepted as the pre-Qwen fallback and retained
   in source history, but not consumed by the finalizer when `title-layer2.png`
   is present.
5. `reveal-scenes-gpt-image-2.png` — accepted exact forest/ocean/sky contact sheet.
6. `paper-atlas-gpt-image-2.png` — accepted exact seven-color paper atlas.
7. `ui-icons-gpt-image-2.png` — accepted exact completion-star/clockwise-turn
   contact sheet; locally chroma-matted to `ui-icons-alpha.png`, inspected at
   full size, then cropped deterministically into the two runtime sprites.
8. `face-details-gpt-image-2.png` — accepted exact googly-eye/fox-nose contact
   sheet; locally chroma-matted to `face-details-alpha.png`, inspected at full
   size, then cropped deterministically into the two runtime sprites.

After explicit user approval, the generated magenta title source was uploaded to
the configured Qwen Image Layered endpoint. Seed 1337 `layer_2` passed the
transparent-corner, significant-alpha, and subject-coverage gates. The raw
candidate is retained as `title-layer2-seed1337-candidate.png`; the accepted
copy and full prompt/QA record are `title-layer2.png` and
`qwen-layered-title.json`. No flood fill was used.

## Alpha and material QA

- All seven piece sprites and all UI plates report transparent corners.
- Completion and turn affordances use authored raster papercraft sprites; no
  child-facing font glyph remains as an icon.
- The face eye and nose are authored raster paper details; they are overlaid
  only after composition and never replace a tangram piece.
- Piece silhouette alpha comes from deterministic exact geometry; visible fill,
  fiber, mottling, and edge material come from accepted GPT Image 2 raster art.
- The direct chroma matte remains rejected; runtime title transparency comes
  only from the accepted Qwen `layer_2` output.
- Full-size landscape, portrait, short-landscape, and reveal screenshots live in
  `qa-shots/tangram-tales/`.
- Runtime CSS contains no gradients and config contains no `emoji:` art refs.

## Shared assets

| Asset | Source | License | Use |
| --- | --- | --- | --- |
| HUD Home / Back / Sound buttons | `shared/assets/ui/` | QLOBE Kids shared library, CC BY 4.0 | safe navigation and sound control |
| Fredoka SemiBold | `shared/fonts/fredoka-latin-600-normal.woff2` | SIL OFL 1.1 | functional HTML labels |
| Runtime sound effects | `shared/js/sfx.js` WebAudio synthesis | project code, MIT | paper tap, settle, and reveal feedback |
| Device speech fallback | `shared/js/voice-clips.js` + `speech.js` | project code, MIT | exact spoken script when no accepted recording exists |

## Reproduction

```sh
# Reproduce the accepted simple-icon chroma matte (not a flood fill)
python3 ~/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py \
  --input games/tangram-tales/assets/source/ui-icons-gpt-image-2.png \
  --out games/tangram-tales/assets/source/ui-icons-alpha.png \
  --key-color '#f40cf0' --auto-key none --soft-matte \
  --transparent-threshold 18 --opaque-threshold 85 --despill --force

python3 ~/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py \
  --input games/tangram-tales/assets/source/face-details-gpt-image-2.png \
  --out games/tangram-tales/assets/source/face-details-alpha.png \
  --key-color '#fa03f9' --auto-key none --soft-matte \
  --transparent-threshold 18 --opaque-threshold 85 --despill --force

# Accepted sources already present; deterministic local finalization
python3 games/tangram-tales/tools/build-assets.py

# External authoring workflows; these upload only after explicit approval
python3 games/tangram-tales/tools/extract-title.py
python3 games/tangram-tales/tools/gen-voice.py

# Link preview from the locally served finished splash
node tools/pipeline/capture_og_images.mjs \
  --playwright /private/tmp/pw/node_modules \
  --base http://127.0.0.1:8127 --only tangram-tales --force
```
