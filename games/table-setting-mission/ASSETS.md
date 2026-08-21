# Table Setting Mission — asset provenance

Production art was generated 2026-08-20 with `gpt-image-2`. Originals, chroma renders, alpha cutouts, QA plates, and recrops are retained under `assets/source/gpt-image-2/`.

## Authored runtime art

- Kitchen background (`kitchen-source.png`) and tabletop background (`tabletop-source.png`).
- Exact title treatment (`title-*`; the only generated text is the exact game title).
- Pip helper (`pip-*`) and canonical Maya thumbs-up derivative (`maya-thumbs-up-*`), derived from shared `characters/maya/portrait.png`.
- Breakfast, picnic, and dinner mode cards (`mode-breakfast-source.png`, `mode-picnic-source.png`, `mode-dinner-source.png`).
- Banner, guide card, tray, placemat, and UI kit (`banner-*`, `guide-card-*`, `tray-*`, `placemat-*`, `ui-kit-chroma.png`).
- Item sprites: 5 breakfast (plate, toast, cup, spoon, fork), 6 picnic (plate, sandwich, apple, tumbler, napkin, fork), and 8 dinner (dinner plate, cup, carrot, peas, roll, spoon, fork, knife). Sheet sources are `items-breakfast-sheet.png`, `items-picnic-sheet.png`, and `items-dinner-sheet.png`.

All briefs preserve the kawaii food-toy/cardboard look: chunky friendly forms, warm printed texture, clean readable silhouettes, and no baked text except the exact title “Set the Table.” Transparent assets use chroma-key -> `remove_chroma_key.py` -> `cutout_finalize.py` -> WebP (`cwebp`, `-q 88`, `-alpha_q 100`). Object-specific recrops are explicitly retained as `*-recrop-*`: all dinner items, the picnic plate and tumbler, and the guide card. These correct sheet-cell clipping or neighboring-pixel contamination discovered during live screenshot review; every revised cutout passed the saturated-magenta alpha plate before runtime encoding.

## Shared runtime assets

| Asset | Provenance | Notes |
|---|---|---|
| Fredoka SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | Fontsource `@fontsource/fredoka@5.0.13`, Google Fonts | SIL OFL 1.1; reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-back.png`, `btn-sound.png`) | Shared QLOBE Kids library | Reused shared raster UI |
| Instrument samples | Shared QLOBE library (`shared/assets/instruments/`) | Piano, vibraphone, and flute samples arranged at runtime by `shared/js/music.js` |
| Sound effects | Shared QLOBE runtime (`shared/js/sfx.js`) | Synthesized at runtime; no sourced SFX clips |
| Link preview (`assets/og-image.jpg`) | Screenshot captured by `tools/pipeline/capture_og_images.mjs` | 1200×630; regenerate with the tool |

## Audio provenance

QLOBE Studio `character-voice-line` / `qwen3-tts-voiceclone` was attempted for all 22 lines on 2026-08-20 with configured LAN API seed 7. Every job failed during clone with HTTP 500; the direct endpoint then became unreachable. The audio manifest is therefore intentionally empty (`assets/audio/manifest.json`), and the exact `lines.json` copy is spoken through the voice-clips Web Speech fallback. No generated audio is claimed.
