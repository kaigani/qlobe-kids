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
| Background music (`shared/assets/music/mug-and-sunbeam.mp3`) | Shared QLOBE Kids music library | Recorded (non-seamless) track; looped at runtime with a fade via `shared/js/bgm.js` |
| Sound effects | Shared QLOBE runtime (`shared/js/sfx.js`) | Synthesized at runtime; no sourced SFX clips |
| Link preview (`assets/og-image.jpg`) | Screenshot captured by `tools/pipeline/capture_og_images.mjs` | 1200×630; regenerate with the tool |
| Round-guest portraits (`shared/characters/{leo,nia,sam,ravi}/portrait.png`) | Shared QLOBE Kids character roster | Referenced directly, not copied; one guest cycles in beside Pip each of the 4 rounds and tags its final place setting |

## Audio provenance

The initial 2026-08-20 QLOBE Studio `character-voice-line` / `qwen3-tts-voiceclone` run failed during clone while the configured LAN service was unavailable. After service restoration on 2026-08-21, all 22 exact lines were regenerated with the teacher reference at seed 7, transcript-checked, accepted in Studio, and assigned into `assets/audio/`. Transcript ratios range from 0.941 to 1.0 and measured AAC durations from 0.958 to 4.394 seconds; every file also passed a full `ffmpeg` decode. An objective volume pass found mean levels from -26.0 to -20.2 dB and peaks from -9.8 to -3.3 dB, with no silent, inaudibly quiet, or clipped file. `manifest.json` maps every `data/lines.json` key to its reviewed clip, while Web Speech remains a runtime safety fallback. Each `.m4a.recipe.json` sidecar records exact text, seed, symbolic teacher reference, template provenance, and accepted transcript QA without exposing local configuration. Three media IDs use the shorter `table-setting-voice-*` prefix to satisfy Studio's 40-character ID limit.

- `table-setting-mission-voice-welcome.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-mission-voice-welcome.m4a.recipe.json`, CC BY 4.0.
- `table-setting-mission-voice-choose.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-mission-voice-choose.m4a.recipe.json`, CC BY 4.0.
- `table-setting-mission-voice-picnic-intro.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-mission-voice-picnic-intro.m4a.recipe.json`, CC BY 4.0.
- `table-setting-mission-voice-dinner-intro.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-mission-voice-dinner-intro.m4a.recipe.json`, CC BY 4.0.
- `table-setting-mission-voice-start-place.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-mission-voice-start-place.m4a.recipe.json`, CC BY 4.0.
- `table-setting-mission-voice-next-place.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-mission-voice-next-place.m4a.recipe.json`, CC BY 4.0.
- `table-setting-mission-voice-last-place.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-mission-voice-last-place.m4a.recipe.json`, CC BY 4.0.
- `table-setting-mission-voice-plate-clue.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-mission-voice-plate-clue.m4a.recipe.json`, CC BY 4.0.
- `table-setting-mission-voice-cup-clue.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-mission-voice-cup-clue.m4a.recipe.json`, CC BY 4.0.
- `table-setting-mission-voice-fork-clue.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-mission-voice-fork-clue.m4a.recipe.json`, CC BY 4.0.
- `table-setting-mission-voice-spoon-clue.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-mission-voice-spoon-clue.m4a.recipe.json`, CC BY 4.0.
- `table-setting-mission-voice-knife-clue.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-mission-voice-knife-clue.m4a.recipe.json`, CC BY 4.0.
- `table-setting-mission-voice-napkin-clue.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-mission-voice-napkin-clue.m4a.recipe.json`, CC BY 4.0.
- `table-setting-mission-voice-tap-help.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-mission-voice-tap-help.m4a.recipe.json`, CC BY 4.0.
- `table-setting-voice-breakfast-intro.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-voice-breakfast-intro.m4a.recipe.json`, CC BY 4.0.
- `table-setting-mission-voice-distractor.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-mission-voice-distractor.m4a.recipe.json`, CC BY 4.0.
- `table-setting-mission-voice-gentle-retry.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-mission-voice-gentle-retry.m4a.recipe.json`, CC BY 4.0.
- `table-setting-voice-praise-perfect.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-voice-praise-perfect.m4a.recipe.json`, CC BY 4.0.
- `table-setting-voice-praise-helper.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-voice-praise-helper.m4a.recipe.json`, CC BY 4.0.
- `table-setting-mission-voice-table-ready.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-mission-voice-table-ready.m4a.recipe.json`, CC BY 4.0.
- `table-setting-mission-voice-place-ready.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-mission-voice-place-ready.m4a.recipe.json`, CC BY 4.0.
- `table-setting-mission-voice-again.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `table-setting-mission-voice-again.m4a.recipe.json`, CC BY 4.0.
