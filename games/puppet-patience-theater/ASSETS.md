# Puppet Patience Theater — Asset Ledger

All runtime media is committed with the game. The browser makes no generation or model calls.

## Visual art direction

The art bible is **cozy handmade felt puppet theater**: cranberry velvet curtains, apricot felt scenery, honey-colored wood, chunky blanket stitching, softly imperfect cut edges, warm footlights, and expressive preschool-safe animal puppets. Raster artwork carries the visual world; CSS is used only for layout, type, states, and motion.

The canonical generation prompts and shared art bible are preserved in [`assets/source/gpt-image-2/PROMPTS.md`](assets/source/gpt-image-2/PROMPTS.md). The requested authoring model was **GPT Image 2** through the built-in image-generation route.

| Runtime asset | Source / production route | Notes |
| --- | --- | --- |
| `assets/stage.webp` | GPT Image 2 `stage-source.png` | Empty 4:3 felt theater; resized and quality-gated by `tools/process-assets.py`. |
| `assets/title.webp` | GPT Image 2 `title-source.png` | Stitched title lockup; exact-count cut with the QLOBE asset cutter. |
| `assets/characters/*.webp` | GPT Image 2 character sheet → Qwen Image Edit → Qwen Image Layered | Eight pose cutouts. The Edit pass flattened only the source background; Layered produced the transparent foreground sheet. |
| `assets/props/*.webp` | GPT Image 2 prop/UI sheet | Swing, cookie tray, and parade drum, exact-count cut. |
| `assets/ui/*.webp` | GPT Image 2 prop/UI sheet | Felt buttons, story frame, three phase badges, breathing flower, and reward star, exact-count cut. |
| `assets/stories/*.webp` | GPT Image 2 medallion sheet | Three story-selection illustrations, exact-count cut. |
| `../../assets/hub/tiles/puppet-patience-theater.jpg` | Krea 2 text-to-image, seed 42 | Catalog tile; source PNG, preview, and recipe are in `assets/source/krea/`. |
| `assets/og-image.jpg` | Reviewed real-Chrome production splash capture | Deterministically finalized to 1200×630 by `tools/finalize-share-art.py`; receipt in `assets/source/share-finalization.json`. |

The production script is [`tools/process-assets.py`](tools/process-assets.py). It invokes the repository-standard [`tools/cut-asset-sheet.py`](../../tools/cut-asset-sheet.py) with exact expected counts (8 characters, 12 prop/UI pieces, 3 medallions, 1 title), saves deterministic crop manifests, and produces saturated-magenta edge-QC previews under `assets/source/qa/`. The complete output ledger, dimensions, hashes, and byte sizes are in `assets/source/processing.json`.

Qwen workflow recipes are preserved under `assets/source/layered/`. The selected transparent character layer passed an alpha-coverage gate and visual identity/edge review against the GPT Image 2 source sheet.

## Voice and music

Fifteen narrator clips in `assets/audio/*.m4a` were produced from the approved QLOBE teacher reference using the local **Qwen TTS voice-clone** workflow. Every final line was analyzed by local **Whisper STT**; `assets/audio/qa.json` records **15/15 accepted** transcripts. Exact copy is in `assets/audio/lines.json`, runtime metadata is in `assets/audio/manifest.json`, and the generation receipt/source responses are retained under `assets/source/local-api/voice/`.

The quiet underscore is the shared recorded track `shared/assets/music/cozy-starlight-lullaby.mp3`, played through `shared/js/bgm.js`, ducked beneath narration, and controlled by the platform sound state.

## Rights and provenance

- Original generated art and voice outputs were commissioned for this QLOBE Kids game using approved first-party/local production routes.
- Code is MIT; committed game assets are CC BY 4.0 as declared in `game.json`.
- No third-party stock art, icon set, CDN, remote font, or runtime AI service is used.
