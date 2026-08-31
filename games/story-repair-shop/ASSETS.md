# Story Repair Shop — Asset Inventory and Provenance

All game-specific visual media is original project media. Runtime assets are committed; authoring masters, local-API receipts, cutter masks, and alpha QA plates live under `assets/source/`. Exact generation prompts, model/workflow identifiers, hashes, and transformations are recorded in `assets/source/media-provenance.json`.

No emoji, SVG, or CSS-drawn primary artwork is used.

## Runtime visual assets

| Runtime path | Role | Production chain | Alpha |
|---|---|---|---|
| `assets/ui/workshop-backdrop.webp` | 4:3 atelier and open-book world | GPT Image 2 source → LANCZOS/WebP | No |
| `assets/ui/workshop-backdrop-portrait.webp` | full-height portrait atelier and open-book world | GPT Image 2 edit/recomposition of the 4:3 world → WebP | No |
| `assets/ui/title-lockup.webp` | painted title lettering | GPT Image 2 source → local Qwen Image Layered `layer_2` → trim/WebP | Yes |
| `assets/ui/prompt-banner.webp` | parchment prompt plate | GPT Image 2 six-object sheet → semantic asset cutter → enclosed-hole matte fill → 0.8 px inward feather → trim/WebP | Yes |
| `assets/ui/next-button.webp` | stitched green action plate | same cutter/matte pipeline | Yes |
| `assets/ui/repair-mode.webp` | Mend mode medallion | same cutter/matte pipeline | Yes |
| `assets/ui/wild-mode.webp` | Wild mode medallion | same cutter/matte pipeline | Yes |
| `assets/ui/torn-patch.webp` | tappable missing-story patch | same cutter/matte pipeline | Yes |
| `assets/ui/sparkles.webp` | connected reveal sparkles | semantic asset cutter → silhouette matte → 0.8 px inward feather → trim/WebP | Yes |
| `assets/scenes/*.webp` (6) | complete story illustrations | GPT Image 2 scene master → LANCZOS/WebP | No |
| `assets/cards/*.webp` (18) | painted repair choices | two GPT Image 2 nine-card sheets → semantic asset cutter → enclosed-hole matte fill → 0.8 px inward feather → trim/WebP | Yes |
| `assets/og-image.jpg` | social preview | production game capture | No |
| `../../assets/hub/tiles/story-repair-shop.jpg` | platform catalog tile | GPT Image 2 edit/recomposition from accepted atelier + fox-story references → safe 6:5 crop/JPEG | No |

The six scene IDs are `fox-bridge`, `nia-sunflower`, `leo-umbrella`, `fish-bicycle`, `dragon-trumpet`, and `bear-moon-soup`. The eighteen semantic card filenames match `config.json` exactly.

## Audio

| Path | Role | Provenance |
|---|---|---|
| `assets/audio/*.m4a` | keyed teacher-style narration | locally hosted Qwen3 TTS voice clone using the project-approved reference; each line locally transcribed by Whisper and accepted only above the configured normalized-similarity threshold |
| `assets/audio/manifest.json` | recorded clip file/duration map | written by `tools/generate-voice.py` |
| `assets/audio/lines.json` | runtime spoken-text mirror | copied from `data/lines.json` by the voice pipeline |
| `../../shared/assets/music/quirky-forest-adventure.mp3` | low-volume background score | existing QLOBE Kids shared library |
| shared SFX invoked from `shared/js/sfx.js` | tick, return, success and page-turn accents | existing QLOBE Kids shared library |

Voice references and LAN endpoint configuration remain machine-local and are never copied into this game or provenance receipts.

## Shared UI

`shared/css/hud.css` supplies raster Home, Back, and Sound button skins from `shared/assets/ui/`. Their glyphs are visible shared PNG artwork; the HTML controls provide semantics and ≥96 px press targets.

## Authoring masters and QA

- `assets/source/gpt-image-2/` retains the GPT Image 2 masters: landscape and portrait atelier plates, catalog tile, title, UI kit sheet, two card sheets, and six scenes.
- `assets/source/ui-crops/`, `card-crops-repair/`, and `card-crops-silly/` retain semantically named cutter outputs plus box manifests.
- `assets/source/local-api/layered/` retains the accepted Qwen title separation and visually rejected Layered trials; the rejected attempts are explicitly excluded from runtime in `media-provenance.json`.
- `assets/source/local-api/mattes/` retains deterministic alpha mattes made from the cutter silhouettes.
- `assets/source/local-api/finals/` retains canonical transparent PNG masters before WebP delivery.
- `assets/source/qa/` composites every alpha master on magenta so halos and missed backgrounds are visible.
- `assets/source/krea2/` retains the polished but superseded Krea 2 catalog candidate and its Studio recipe. It was rejected for final assignment because its glossy 3D treatment conflicts with the canonical watercolor world. `assets/source/legacy-hub-tile.jpg` preserves the replaced prototype tile.
- `assets/source/*-mask.png` files are diagnostic masks from `tools/cut-asset-sheet.py`.

The asset cutter is a required, recorded part of the pipeline. Sheet regions were first verified with `--dry-run --expected-count`, then exported with semantic names. Runtime code never relies on anonymous crop numbers.

## Models and licensing notes

- GPT Image 2 was used through the Codex image-generation tool for new raster masters.
- The approved local Qwen Image Layered workflow successfully isolated the title lockup. Whole-sheet and per-object trials that lost objects or retained opaque mattes were visually rejected; the semantic cutter/matte path supplies the remaining alpha assets without hiding that decision.
- The approved local Qwen TTS/Whisper workflows were used only during authoring.
- Krea 2 through QLOBE Studio supplied a catalog candidate and exercised the normal Studio recipe/review lifecycle. The final catalog assignment uses the GPT Image 2 watercolor variant; the superseded Krea source and honest rejection reason remain in provenance.
- MiniMax video was evaluated but intentionally not added: the direct page repair/reveal is interactive, lighter, offline-safe, and closer to the concept than a passive cinematic interlude.

Generated media is project-owned for this repository’s use. Shared library media retains its existing repository license. Do not claim generated files are hand-painted by a human or assign a third-party Creative Commons source.
