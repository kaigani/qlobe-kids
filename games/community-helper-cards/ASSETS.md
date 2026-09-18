# Community Helper Cards asset log

Community Helper Cards ships as an offline-first cozy felt-puppet game. Models are authoring tools only: production gameplay makes no image, voice, transcription, video, or LAN requests. Exact image recipes live in `PROMPTS.md`; cutter boxes, masks, masters, deterministic processing, hashes, and hostile-magenta QA remain under `assets/source/`.

## Production art

| Family | Source / workflow | Production treatment | Runtime output |
|---|---|---|---|
| Neighborhood theater | GPT Image 2 built-in generation, using the approved mockups as style references | 4:3 crop, 1600×1200, optimized WebP | `assets/art/theater.webp` |
| Decorative title | GPT Image 2, exact spell-checked felt lockup | alpha normalization, trim, resize, lossless WebP | `assets/art/title.webp` |
| Four neutral helpers | GPT Image 2 contact sheet; a targeted second pass separated touching alpha halos | required bounding-box cutter, trim, alpha normalization, max 720 px | `assets/art/firefighter.webp`, `doctor.webp`, `teacher.webp`, `mail-carrier.webp` |
| Four success tableaus | GPT Image 2 coordinated contact sheet | required cutter; each helper and held signature tool remain one connected pose | `assets/art/*-success.webp` |
| Eight tools | GPT Image 2 4×2 transparent contact sheet | required cutter, max 480 px, lossless WebP | `assets/art/hose.webp` through `letters.webp` |
| Felt UI furniture | GPT Image 2 4×2 blank transparent sheet | required cutter; HTML copy overlays authored card/plaque/button/tray art | `assets/art/card-*.webp`, `tool-card.webp`, `prompt-panel.webp`, `action-button.webp`, `tool-tray.webp` |
| Badge, album, star | GPT Image 2 transparent reward sheet | cutter + deterministic trim/resize | `assets/art/badge.webp`, `album.webp`, `star.webp` |
| Four role badges | GPT Image 2 precise edit from the approved rewards/tools masters | required exact-count cutter; one sewn tool emblem per shield | `assets/art/badge-firefighter.webp` through `badge-mail-carrier.webp` |
| Hub tile | LAN-local Krea 2 Turbo text-to-image, seed 42, 768×640 | manually curated to the platform’s separate Toy menu grammar, fitted to 640×533 JPEG | `../../assets/hub/tiles/community-helper-cards.jpg` |

The built-in GPT Image 2 sources are retained in `assets/source/gpt-image-2/`. `helpers-neutral-sheet.png` is the rejected first neutral sheet; two neighboring glow bands joined and produced only three cutter components. `helpers-neutral-sheet-v2.png` is accepted because the exact same four identities have fully separated silhouettes and the cutter returns four components. Nothing was silently overwritten.

The shared cutter was required and run with `--expected-count` for helpers, success poses, tools, UI, reward parts, and title. Each output folder contains `boxes.json`; sibling `*-mask.png` images are the reviewed masks. The runtime promotion script is `tools/build-assets.py`. It writes hashes, sizes, alpha statistics, and the hostile-magenta contact sheet under `assets/source/qa/`.

## Teacher voice

`assets/audio/lines.json` is the exact spoken script. `tools/generate-voice.py` sends only those fixed lines plus the rights-cleared teacher reference to the authorized LAN-local `qwen3-tts-voiceclone` workflow. Seeds 7, 8, and 9 form the retry ladder. Lossless FLAC candidates exist only inside the generator's temporary QA workspace; accepted runtime audio is mono 48 kHz AAC/M4A with `+faststart` and loudness normalization.

Every candidate is transcribed through LAN-local `whisper-stt` (`base`, English). `assets/source/voice/qa-transcripts.json` records expected and heard text, normalized similarity, seed, hashes, duration, loudness, and pass status. No clip below the production threshold ships. `assets/audio/manifest.json` is the runtime map consumed by `shared/js/voice-clips.js`; device Web Speech remains a correct resilience fallback.

## Shared runtime assets

| Asset | Source | License / use |
|---|---|---|
| Fredoka SemiBold | `shared/fonts/fredoka-latin-600-normal.woff2`, Fontsource / Google Fonts | SIL OFL 1.1; functional text |
| Whimsical Toy Workshop | `shared/assets/music/whimsical-toy-workshop.mp3` | platform-owned recorded background track |
| HUD icons | `shared/assets/ui/` through `shared/js/hud.js` | platform-owned; reused unmodified |
| SFX | `shared/js/sfx.js` | synthesized locally at runtime |
| Teacher reference | configured local reference or `shared/assets/refs/voice-teacher.wav` | rights-cleared authoring input; not a runtime network source |

## Deliberate media decision

The concept brief proposed live-action worker biographies. Production instead uses narrated Hero Spotlight tableaus made from the accepted felt poses. The available Studio workflow list had no approved MiniMax H3 route, and presenting generated people as “real workers” would create child-safety, consent, identity, and uncanny-motion problems. This replacement keeps the educational/empathy beat without false documentary framing, runtime networking, or breaking the chosen art world.

## Rights and release notes

- Game code: MIT.
- Game-specific generated art/audio: CC BY 4.0, consistent with `game.json`.
- No downloaded stock imagery, third-party voice material, remote media URL, LAN hostname, credential, or personal source path is committed.
- The game remains `beta` until a real child completes it on the target iPad.
- `assets/og-image.jpg` is regenerated from the production splash with the repository capture workflow; it is never hand-painted.
