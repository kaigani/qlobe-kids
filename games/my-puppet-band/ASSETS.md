# Assets — My Puppet Band

All original assets CC BY 4.0 (see LICENSE-ASSETS). Provenance below.

## Reused from shared/ (no copies)

- `shared/characters/<id>/` — rigged puppet cast (8 characters).
- `shared/characters/acting-clips.json` — incl. the `groove` clip added for
  this game (portable, reusable by any theater game).
- `shared/assets/instruments/` — NEW shared library added with this game:
  12 real instrument samples (m4a, one sustained note per tonal instrument,
  hit pairs for percussion) + manifest.json with measured base pitches.
  Source recordings supplied by the project owner
  (00-reference/instruments/), converted/normalized 2026-07-20.
- `shared/js/music.js` engine, `shared/assets/ui/` buttons, Fredoka font.

## Game-local assets

| Asset | Path | Status | Provenance |
|---|---|---|---|
| Original rainbow stage reference | `assets/bg/rainbow-stage.png` | retained | local GenAI (krea2, seed 42), center-clear QA, 2026-07-20 |
| Song stage backdrops ×12 | `assets/bg/stage-*-gpt-image-2.png` | done | GPT Image 2 edits of the original stage reference; song-specific scenery with a consistent empty performance zone, 2026-07-20 |
| Title-screen music sky | `assets/bg/menu-sky-gpt-image-2.png` | done | GPT Image 2, generated from the approved UI concept as a style/composition reference; no baked UI, text, characters, or instruments, 2026-07-20 |
| Band-builder blue field | `assets/bg/builder-blue-gpt-image-2.png` | done | GPT Image 2, generated from the approved UI concept as a style/composition reference; peripheral decoration and center-clear grid area, 2026-07-20 |
| Instrument props ×12 | `assets/props/*.png` | done | local GenAI (krea2 dark-bg seed 42 + qwen-image-layered), edge-flood alpha cleanup, magenta/alpha QA, PNG-8, 2026-07-20. clarinet regenerated sky-blue (black-on-charcoal extracts ambiguously) |
| Narrator voice ×12 | `assets/audio/*.m4a` + manifest/lines | done | teacher-voice clone (seed 7), 12/12 whisper-QA first pass, 2026-07-20 |
| Hub tile | `../../assets/hub/tiles/my-puppet-band.jpg` | done | local GenAI (krea2, seed 42), 640×533 JPEG, 2026-07-20 |

Until pending assets land the game runs on documented fallbacks (emoji
instrument badges, tinted-shape props, gradient backdrop, Web Speech
narrator) — every swap is config-only.

## Songs

All twelve songs are original compositions authored as note data in
`config.js` (no external melodies).
