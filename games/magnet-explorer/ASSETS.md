# Magnet Explorer asset provenance

Magnet Explorer uses a deliberately unified raster art system. All generated material was made for this game from project-owned design references; no downloaded third-party artwork or remote runtime dependency is used. Private LAN endpoints, credentials, job state, and temporary outputs are not committed.

## Production inventory

| Family | Final assets | Production source | License |
|---|---|---|---|
| Environments | `assets/backgrounds/splash.webp`, `workbench.webp`, `maze.webp` | local Krea 2 Turbo text-to-image; seed 42; recipe next to each file | CC BY 4.0 |
| Object cutouts | 16 PNGs in `assets/objects/` | GPT Image 2 style-locked contact sheet, chroma removal, project asset cutter, alpha finalizer | CC BY 4.0 |
| Interface cutouts | 9 PNGs in `assets/ui/` | GPT Image 2 style-locked contact sheet, chroma removal, project asset cutter, alpha finalizer | CC BY 4.0 |
| Hub tile | `assets/hub/tiles/magnet-explorer.jpg` | local Krea 2 source in `assets/source/`, then curated 640×533 crop | CC BY 4.0 |
| Narration | 24 M4A clips in `assets/audio/` | local Qwen3 TTS voice clone from the approved QLOBE teacher reference; seed 7 | CC BY 4.0 |
| Music | `shared/assets/music/whimsical-toy-workshop.mp3` | existing QLOBE shared library | project shared-asset terms |
| HUD controls | `shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png` | existing QLOBE shared library | CC BY 4.0 |
| Typeface | `shared/fonts/fredoka-latin-600-normal.woff2` | Fredoka / Fontsource | SIL OFL 1.1 |

The `.recipe.json` companions are the authoritative machine-readable records for Krea and Qwen generations. `assets/audio/manifest.json` maps narration keys to files and measured durations. `assets/objects/boxes.json` and `assets/ui/boxes.json` preserve every detected cut box.

## GPT Image 2 object family

**References:** the supplied Magnet Explorer Test Lab and Success mockups.
**Source:** `assets/source/magnet-object-sheet-gpt-image-2.png`.
**Working matte:** `assets/source/magnet-object-sheet-alpha.png`.

Prompt:

> Create a production-ready 4×4 asset contact sheet for the QLOBE Kids “Magnet Explorer” game, matching the supplied premium handcrafted Montessori toy mockups. Exactly sixteen isolated objects, one centered per equal cell, no overlap and generous empty margin: row 1 red horseshoe magnet, chrome steel ball, steel paperclip, chunky steel bolt; row 2 steel washer, child-safe steel nail, small silver steel can, closed steel safety pin; row 3 maple wood block, yellow rubber duck, red four-hole plastic button, soft blue wool pom-pom; row 4 cork stopper, green leaf, tiny red wooden toy car, golden wooden star token. Consistent three-quarter top-down camera, tactile painted wood and brushed metal, softly rounded preschool-safe forms, subtle navy outline and warm studio shadow. Flat uniform dark charcoal background only. No labels, words, letters, hands, frames, dividers, extra objects, cropping, logos, or watermark.

Final named cuts:

`magnet`, `steel-ball`, `paperclip`, `bolt`, `washer`, `nail`, `steel-can`, `safety-pin`, `wood-block`, `rubber-duck`, `plastic-button`, `pom-pom`, `cork`, `leaf`, `toy-car`, `star-token`.

## GPT Image 2 interface family

**References:** the supplied Magnet Explorer Title and Success mockups.
**Source:** `assets/source/magnet-ui-sheet-gpt-image-2.png`.
**Working matte:** `assets/source/magnet-ui-sheet-alpha.png`.

Prompt:

> Create a production-ready 3×3 asset contact sheet for the QLOBE Kids “Magnet Explorer” game in the same premium handcrafted Montessori toy style. Exactly nine isolated pieces, one centered per equal cell, no overlap and generous margin: row 1 a layered wooden title plaque that clearly reads “MAGNET EXPLORER”, a circular Test Lab medallion with magnet and paperclip, a circular Treasure Sweep medallion with magnet lifting steel treasures; row 2 a circular Magnet Maze medallion with steel ball and star, a pale maple testing pedestal, a blue rope-rimmed magnetic collection tray; row 3 a warm tan rope-rimmed non-magnetic tray, a gold-and-blue Explorer star badge, a cluster of golden celebration sparkles. Consistent straight-on or gentle top-down camera as appropriate, painted maple, visible grain, chunky child-safe bevels, cherry red, cobalt, turquoise, and sunflower yellow. Flat uniform dark charcoal background only. No text except the exact title, no extra objects, hands, frames, cell dividers, cropping, logo, or watermark.

Final named cuts:

`title`, `mode-test`, `mode-sweep`, `mode-maze`, `test-pedestal`, `tray-magnetic`, `tray-nonmagnetic`, `badge`, `sparkles`.

## Local Krea 2 environment prompts

All four generations used `krea2-turbo-t2i`, seed 42. Exact dimensions, dates, prompts, acceptance notes, and final filenames are retained in their recipes.

**Splash, 1600×1200**

> Premium handcrafted Montessori wooden toy game splash environment, straight-on 4:3 composition. A cheerful turquoise-blue painted wood alcove surrounded by a thick curved honey-maple arch and warm maple tabletop at the bottom, tiny stylized wooden tree and yellow rubber duck tucked at far side edges, subtle carved cloud forms, large calm empty center and upper-center for a title plaque, generous empty lower area for three mode tokens. Tactile rounded joinery, visible wood grain, warm studio light, cherry red cobalt blue sunflower yellow accents, preschool friendly, coherent toy photography illustration. No magnet, no paperclips, no title, no letters, no words, no buttons, no UI, no logos, no watermark, no people.

**Workbench, 1600×1200**

> Premium handcrafted Montessori wooden toy science-table game background, top-down 4:3 composition. Thick cobalt-blue painted wood outer frame with rounded corners, warm honey-maple workbench interior and a large pale sky-blue painted inset testing field in the center, shallow upper shelf and subtle corner joinery, calm open center, wide clear edges for touch controls and object placement. Tactile child-safe bevels, visible wood grain, soft warm studio light, high-end toy product illustration. Completely empty tabletop. No objects, no magnet, no text, no letters, no labels, no buttons, no baskets, no characters, no logo, no watermark.

**Maze, 1600×1200**

> Premium handcrafted Montessori magnetic marble maze board, exact top-down 4:3 game background. Thick rounded honey-maple frame around a cobalt-blue painted board. One simple wide continuous carved groove starts at lower left, winds in four broad gentle turns through the center, and ends at an inset golden wooden star socket at upper right. The groove is wide enough for a large steel marble and never intersects itself. Calm uncluttered composition with generous safe margins, tactile bevels, visible wood grain, warm studio light, high-end toy product illustration. Board only and completely empty: no marble, no magnet, no hands, no text, no letters, no labels, no buttons, no logo, no watermark.

**Catalog tile, 768×640 source**

> Warm premium Montessori wooden toy scene for a preschool game catalog tile, 6:5 landscape. A friendly chunky red horseshoe magnet floats just above a honey-maple science table, attracting three shiny steel paperclips in a delightful upward arc. A yellow rubber duck and maple cube remain calmly on the table to show contrast. Turquoise painted wood backdrop, rounded cobalt-blue frame corners, visible wood grain, tactile hand-painted surfaces, soft golden studio light, clear focal silhouette, cheerful discovery mood. No words, no letters, no title, no UI, no buttons, no logo, no watermark, no people, no hands.

## Extraction and cut pipeline

Qwen Image Layered was tested on both GPT Image 2 sheets through the approved LAN workflow. Its selected layers retained only a single cell instead of the complete isolated family, so those derivatives were rejected during visual review and are not committed.

The accepted workflow used the imagegen skill's border-key remover, followed by the repository's required cutter and finalizer:

```text
python remove_chroma_key.py <sheet> <alpha-sheet> --auto-key border --soft-matte --transparent-threshold 10 --opaque-threshold 58 --edge-feather 0.6 --spill-cleanup --force
python tools/cut-asset-sheet.py <alpha-sheet> <output-dir> --names <ordered names> --expected-count <16 or 9> --padding 10 --close-radius 1 --debug-mask <mask>
python tools/pipeline/cutout_finalize.py <cut> --output <final> --qa-dir <qa-dir>
```

Both cutter runs were dry-run first, then produced exactly the expected 16 and 9 connected components. Every final cut passed alpha-edge QA and was visually inspected at native resolution.

## Narration and transcript QA

The local `qwen3-tts-voiceclone` workflow used the project-approved `shared/assets/refs/voice-teacher.wav` reference and seed 7. Text is centralized in `data/lines.json`; each clip has its own recipe with the intended line and Whisper result. All 24 automatic transcript comparisons returned `match: true`. The browser uses these recorded clips first and retains the exact text as an accessibility/runtime fallback.

Included coverage: welcome, three mode prompts, idle nudge, generic magnetic/non-magnetic feedback, treasure feedback, both multi-step rewards, completion, and one material-specific result for each of the twelve test objects.

Voice cloning was performed under the user's explicit approval for this project. The reference remains a local project asset and is not duplicated into the game directory.

## Open Graph image

`assets/og-image.jpg` is captured from the game itself at 1200×630 using `tools/pipeline/capture_og_images.mjs`. It must be regenerated after a material splash-screen change rather than hand-edited.
