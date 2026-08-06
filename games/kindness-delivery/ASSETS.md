# Kindness Delivery assets

All shipped art and audio are local at runtime. Model services were used only
during authoring. Original game assets are released with QLOBE Kids under CC BY
4.0 unless a row says otherwise.

## Visual direction and concept gate

Four Krea 2 concepts established the Paper Garden/Papercraft direction before
production rendering. Full prompts, review criteria, seed, and selection notes
are in `assets/source/concepts/krea2/PROMPTS.md`.

| Source assets | Workflow | Seed / size | Runtime use |
| --- | --- | --- | --- |
| `assets/source/concepts/krea2/01-friend-select.png` through `04-delivery.png` | local approved `krea2-turbo-t2i` authoring API | seed 42, 1024×768 | source-only style anchors |
| `assets/source/krea2/hub-tile.png` | local approved `krea2-turbo-t2i` authoring API | seed 42, 768×640 | cropped/resized to `../../assets/hub/tiles/kindness-delivery.jpg` |

## GPT Image 2 production art

Generated with Codex's built-in `imagegen` tool using OpenAI GPT Image 2. The
full saved prompt set is in `assets/source/gpt-image-2/PROMPTS.md`.

| Runtime asset | Preserved source | Processing |
| --- | --- | --- |
| `assets/backgrounds/select.webp` | `assets/source/gpt-image-2/backgrounds/splash-meadow.png` | Krea-guided clean plate; WebP q82, 1448×1086 |
| `assets/backgrounds/studio.webp` | `assets/source/gpt-image-2/backgrounds/studio.png` | Krea-guided clean plate; WebP q82, 1448×1086 |
| `assets/backgrounds/flight.webp` | `assets/source/gpt-image-2/backgrounds/flight.png` | Krea-guided clean plate; WebP q82, 1448×1086 |
| `assets/backgrounds/delivery.webp` | `assets/source/gpt-image-2/backgrounds/delivery.png` | Krea-guided clean plate; WebP q82, 1448×1086 |
| `assets/characters/{fox,bunny,bear}-{idle,reaction}.webp` | `assets/source/gpt-image-2/characters/character-sheet-green.png` | chroma-to-alpha, exact 3×2 split, trim/pad, magenta edge QA, transparent WebP |
| `assets/props/*.webp` (16) | `assets/source/gpt-image-2/props/prop-sheet-green.png` | chroma-to-alpha, exact 4×4 split, trim/pad, magenta edge QA, transparent WebP |
| `assets/ui/friend-card-{fox,bunny,bear}.webp` | `assets/source/gpt-image-2/frames/friend-frames-green.png` | chroma-to-alpha, exact thirds, trim/pad, magenta edge QA, transparent WebP |
| `assets/ui/title.webp` | `assets/source/gpt-image-2/title/title-green.png` | exact-letter review, chroma-to-alpha, trim/pad, magenta edge QA, transparent WebP |

`splash-meadow-v1.png` is retained to document the rejected first cleanup pass.
No generative model is contacted by the shipped game.

## Child-created imagery

The note shown in the fold, flight, and delivery scenes is rendered locally
from the child's own normalized canvas strokes and sticker-board data. It is a
transient in-memory JPEG data URL, is never uploaded, and is discarded on
navigation or reload.

## Narration and sound

| Asset | Source / creator | License | Processing |
| --- | --- | --- | --- |
| `assets/audio/lines.json` | original QLOBE Kids script | CC BY 4.0 | exact fallback and recorded-line source text |
| `assets/audio/*.m4a`, `manifest.json`, `qa.json` | project-internal teacher reference, local Qwen3 voice clone | project-internal reference; generated clips CC BY 4.0 | loudness normalized, AAC mono 24 kHz, local Whisper transcript gate ≥0.72; seeds recorded in `qa.json` |
| tactile sound effects | `shared/js/sfx.js`, QLOBE Kids | MIT | synthesized locally at runtime |
| drawing tones | `shared/js/musical-canvas.js`, QLOBE Kids | MIT | synthesized locally at runtime |
| fallback voice | browser/OS Web Speech API | platform-provided | used only when a recorded clip cannot play |

The private teacher reference is not copied into this game. Raw LAN-authoring
outputs and transcripts stay under ignored `assets/source/local-api/voice/`.

## Shared runtime assets

| Asset | Source | Creator | License | Modifications |
| --- | --- | --- | --- | --- |
| Fredoka SemiBold | Fontsource / Google Fonts | Milena Brandão and Hafontia | SIL OFL 1.1 | reused unchanged from `shared/fonts/` |
| HUD controls | QLOBE Kids shared library | QLOBE Kids | CC BY 4.0 | reused unchanged through `shared/js/hud.js` |

## Link previews

`assets/og-image.jpg` is generated from the finished splash at 1200×630 with
`tools/pipeline/capture_og_images.mjs` after visual QA. It should be regenerated
from the live game rather than edited by hand.
