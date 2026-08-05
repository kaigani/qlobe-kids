# Garden Delivery assets

All Garden Delivery artwork and narration are project-owned and released under
CC BY 4.0 with QLOBE Kids. No third-party character, prop, font, or music asset
is shipped. Model calls were authoring-time only; all game assets are static and
there are no game-owned off-origin media or model requests. The standard shared
QLOBE analytics shim remains platform-level traffic and is excluded from that
asset-dependency claim.

## Production inventory

| Runtime asset | Production source | Creator | License | Processing / QA |
| --- | --- | --- | --- | --- |
| `assets/backgrounds/garden-{map,path,party}.webp` | `assets/source/gpt-image-2/*-master.png` | QLOBE Kids with OpenAI GPT Image 2 | CC BY 4.0 | Generated 4:3 clay plates; resized to 1440×1080 and encoded WebP q84/m6; inspected full-size |
| `assets/title.webp` | `assets/source/gpt-image-2/title-magenta-master.png` | QLOBE Kids with OpenAI GPT Image 2 | CC BY 4.0 | Exact “Garden Delivery” lockup, spell-checked; imagegen chroma helper, alpha review, trim/pad, WebP q90/m6 |
| `assets/characters/*.webp`, `assets/props/bucket.webp`, `assets/ui/garden-helper.webp` | GPT Image 2 character/prop contact sheet and precise-background edit | QLOBE Kids with OpenAI GPT Image 2 | CC BY 4.0 | Cropped, imagegen chroma helper, deterministic alpha finalizer, full-size saturated-magenta QA, WebP q90/m6 |
| `assets/flowers/*.webp` | GPT Image 2 paired thirsty/bloom contact sheet and precise-background edits | QLOBE Kids with OpenAI GPT Image 2 | CC BY 4.0 | Same paired identities; rose/daisy use the general magenta key, while purple tulip states use a subject-safe red key; helper/finalizer, full-size saturated-magenta QA, WebP q90/m6 |
| `assets/ui/flower-card.webp` | `assets/source/gpt-image-2/flower-card-isolated.png` | QLOBE Kids with OpenAI GPT Image 2 | CC BY 4.0 | Clean isolated flat-key rerender; chroma helper/finalizer, magenta QA, WebP q90/m6 |
| `assets/ui/{pour-rail,clay-button,petal}.webp`, `assets/props/{water-drop,water-stream,water-splash}.webp` | `assets/source/gpt-image-2/ui-effects-sheet.png` | QLOBE Kids with OpenAI GPT Image 2 | CC BY 4.0 | Flat-key contact sheet; cropped, chroma helper/finalizer, magenta QA, WebP q90/m6 |
| `assets/ui/balance-rail.webp` | `assets/source/gpt-image-2/balance-rail-rounded-edit.png` | QLOBE Kids with OpenAI GPT Image 2 | CC BY 4.0 | Precise-object repair of the contact-sheet cell's cropped left cap; chroma helper/finalizer, magenta QA, WebP q90/m6 |
| `../../assets/hub/tiles/garden-delivery-game.jpg` | `assets/source/local-api/hub-krea2-seed42.png` | QLOBE Kids with local Krea 2 | CC BY 4.0 | Studio `menu-game-tile` / `toy-table`, seed 42; crop-safe 640×533 JPEG |
| `assets/audio/*.m4a` | local Qwen3-TTS voice clone of the approved canonical teacher reference | QLOBE Kids | CC BY 4.0 | AAC 96 kbps; every exact line passed local Whisper transcript comparison at ≥0.8; selected plant-name rerenders reached 1.0 |
| Shared home, back, and sound controls | `../../shared/assets/ui/` | QLOBE Kids | CC BY 4.0 | Reused unchanged through shared HUD CSS |

The authored foregrounds are real transparent raster sprites. HTML/CSS supplies
layout, transforms, hit areas, accessibility, and state masks only; no emoji,
SVG, canvas, or CSS-gradient illustration substitutes for primary art.

## Image prompts and lineage

`assets/source/gpt-image-2/recipe-index.json` records the complete prompt set,
generation/edit mode, concept-reference directory, output mapping, postprocess,
creator, and license. The set comprises three clean clay environment plates,
the exact clay title, a 2×2 Sunny/props sheet, a 3×2 paired-flower sheet, a 4×2
UI/effects sheet, one clean isolated card rerender, and two precise edits that
changed only dark backdrops to the flat removable chroma key. Browser review
rejected the first card cell because a neighboring contact-sheet object crossed
its edge; it is retained as evidence but is not a runtime asset. The first
magenta-key tulip pass was also rejected after green-background review exposed
partial purple petals. Only its red-key rerender is packaged.

The original plan considered the approved LAN Qwen layered-image workflow for
the most complex cutouts. The authoring boundary did not permit those project
masters to be uploaded, so no layered result was used. Instead, the safe GPT
Image precise-edit route changed only the background, followed by the installed
imagegen chroma helper and the repository's deterministic cutout finalizer. Raw
masters, edited masters, cell crops, alpha finals, and saturated-magenta QA
panels remain under `assets/source/`; runtime derivatives are built by
`tools/process-assets.py`.

The hub recipe is preserved at
`assets/source/local-api/hub-krea2-recipe.json`. Its full prompt is a cheerful
sunflower carrying a silver bucket across five stones toward a drooping red rose,
staged as bright preschool toy-table objects with no child, title, UI, or text.

## Narration provenance

`assets/audio/lines.json` is byte-for-text equivalent to `config.json`'s 17
fallback lines. `assets/audio/manifest.json` records each file, decoded duration,
and text hash. Per-line Studio recipes and Whisper evidence live at
`assets/source/local-api/voice/<key>/`; `qa-index.json` records the selected media
id, seed, heard transcript, score, and pass state. The private teacher reference
and local service address are never copied into the repository.

`tools/package-voice.py` reproducibly packages only accepted Studio jobs. Rose
intro and tulip bloom use seed-8 rerenders because their transcripts were exact;
the remaining selected clips use seed 7. The controls clip scored 0.969 because
Whisper rendered “and tilt” as the homophone “until”; it still exceeds the 0.8
gate and preserves the intended meaning and fallback text.

## Link preview (`og:image`)

| Asset | Source | Creator | License | Attribution required | Modifications |
| --- | --- | --- | --- | --- | --- |
| `assets/og-image.jpg` | Screenshot of this game's final splash screen, captured at 1200×630 by `tools/pipeline/capture_og_images.mjs` | QLOBE Kids | CC BY 4.0 | No | Regenerate with the capture tool rather than editing by hand |
