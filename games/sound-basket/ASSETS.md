# Sound Basket assets

All shipped media is local and available offline. Generated assets are original project output and are treated as CC BY 4.0. Runtime code is MIT.

## Original production assets

| Asset | Source and workflow | QA / provenance |
|---|---|---|
| `assets/art/title.webp` | gpt-image-2, exact “Sound Basket” toy lockup; flat green key removed locally; resized and encoded WebP | Exact spelling, transparent corners, edge/despill review passed. See `title.webp.recipe.json`. |
| `assets/art/backdrop.webp` | QLOBE Studio `scene-backdrop`, Toy Table, Krea 2 seed 1337; encoded WebP q88 | Seed 42 was rejected for a cropped basket at the top edge. Seed 1337 passed visual review and is 38 KB. See recipe sidecar. |
| `assets/art/basket.png` | QLOBE Studio `prop-cutout`: Krea 2 seed 42 → Qwen Image Layered seed 42 → crop/resize | Magenta-composite review passed; soft edge/shadow explains the partial-alpha band. See recipe and QA composite. |
| `assets/audio/*.m4a` | QLOBE Studio `character-voice-line`, Qwen teacher voice clone, seed 7 | 8/8 intended lines transcribed back at match ratio 1.0. Each clip has its own recipe sidecar. |
| `assets/audio/words/*.m4a` | Qwen teacher voice clone for curated object names missing from the shared word library | 68 direct names accepted by Whisper transcript QA; per-clip recipe sidecars and `word-manifest.json` ship with the game. |
| `assets/audio/manifest.json`, `lines.json` | Project-authored runtime indexes for the accepted clips | Durations measured from final AAC files with `ffprobe`. |

## Shared assets

- `shared/assets/objects/*.webp` — Toy Table picture objects used unchanged.
- `shared/data/letter-objects.json` and `shared/assets/objects/*.webp` — three curated picture choices for every letter A–Z, resolved through `shared/js/content.js`.
- `shared/assets/ui/btn-home.png`, `btn-back.png`, `btn-sound.png`, `btn-play.png` — platform navigation, audio, and standard green Play controls.
- `shared/assets/audio/words/` and `fragments/` — 9 existing curated word names plus complete A–Z initial-sound clips. Together with 68 game-local direct names and the accepted shared “I is for ice cream” pairing, all 78 randomized objects have packaged audio; Web Speech is emergency fallback only.
- `shared/fonts/fredoka-latin-600-normal.woff2` — platform display font.

## Rejected exploration

The initial 1.7 MB gpt-image-2 scene with a one-off kitten is not referenced by the game. It was moved to `tmp/sound-basket-rejected/gpt-image-2-hero-v1.png` so it is recoverable without shipping it.
