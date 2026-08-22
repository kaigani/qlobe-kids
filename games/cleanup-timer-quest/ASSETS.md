# Clean-Up Timer Quest asset production log

Canonical art world: **Toy** — tactile painted wood, soft woven baskets,
plush fabric, molded forms, warm household light, and preschool-safe chunky
proportions. Runtime gameplay art is raster. CSS supplies layout, hit areas,
focus/selection feedback, masks, and particles only; it does not draw toys,
rooms, bins, timer furniture, or the title.

## Runtime set

| Runtime path | Role | Production and retained source | QA |
|---|---|---|---|
| `assets/title.webp` | Generated title lockup | GPT Image 2 `assets/source/title-gpt-image-2.png`; chroma matte in `title-alpha.png`; deterministic 1100 px WebP | Exact “Clean-Up Timer Quest” spelling reviewed at full size; 85,782 bytes |
| `assets/scenes/{playroom,bedroom,living-room}.webp` | Full-bleed 4:3 room plates | Three GPT Image 2 sources under `assets/source/`; deterministic 1600×1200 crops | Calm play center, HUD clearance, no baked text/UI, no loose category objects |
| `assets/rooms/{playroom,bedroom,living-room}.webp` | Room chooser previews | Deterministic 520×420 crops of the accepted scene plates | All three remain distinct and readable at card size |
| `assets/items/*.webp` | 18 sortable objects | Three coordinated GPT Image 2 3×2 sheets; Qwen Image Layered seed 42 sources and recipes in `assets/source/qwen-layered/`; saturated composites in `assets/source/qa/` | Every source cell and every 320×320 transparent cutout reviewed; deterministic connected-island cleanup removes sheet bleed without merging pairs |
| `assets/bins/*.webp` | Six picture-marked homes | GPT Image 2 3×2 sheet, then Qwen Image Layered seed 42 and deterministic 440×340 finalization | Badges depict teddy, blocks, shirt, books, wheel, and drum without text |
| `assets/timer-track.webp` | Eight-bead wind-up music timer | GPT Image 2 source, Qwen Image Layered seed 42, deterministic 900×180 finalization | Exactly eight colored beads, two music-note marks, wind-up key; no failure/urgency color state |
| `assets/audio/*.m4a` | 20 warm teacher lines | Qwen3 TTS Voice Clone from the approved shared teacher reference; accepted recipes and Whisper receipts under `assets/source/voice-*` | All final Whisper comparisons match; 0.2–9 s duration bounds; AAC files decode in production Chrome |
| `assets/audio/{manifest,lines}.json` | Recorded voice lookup and exact fallback copy | Deterministic packaging from accepted Studio outputs | SHA-256, exact-text hash, and measured duration retained per clip |
| `../../assets/hub/tiles/cleanup-timer-quest.jpg` | 6:5 hub tile | Krea 2 `menu-game-tile` seed 42, corrected through Qwen Image Edit seed 42; both sources/recipes in `assets/source/hub/` | Right badge corrected from a repeated teddy to blocks; final 640×533 JPEG, 57,192 bytes |
| `assets/og-image.jpg` | Link preview | Captured from the final splash after browser visual QA | Regenerated after final UI integration |

The deterministic build is:

```sh
python3 games/cleanup-timer-quest/tools/finalize_assets.py \
  --game-dir games/cleanup-timer-quest
```

It alpha-trims and pads Qwen Layered outputs, encodes runtime WebP files,
prunes disconnected sheet bleed, encodes transparent sprites at visually
reviewed WebP quality 88, derives room previews, and curates the accepted hub
source to 640×533. It is safe to rerun from the retained sources. Full GPT
Image 2 prompt records and reference paths are in `assets/source/PROMPTS.md`.

## Local Studio provenance

- Hub base: Studio template `menu-game-tile`, workflow `krea2-turbo-t2i`,
  legacy style slug `toy-table`, canonical world `Toy`, seed 42, 768×640.
- Hub correction: `qwen-image-edit`, seed 42, derived from
  `menu-cleanup-timer-quest`; only the right-hand badge was changed to blocks.
- Separation: `qwen-image-layered`, two layers, seed 42. Runtime slicing uses
  the retained `layer_2` RGBA sheets, never the composite.
- Voice: Studio template `character-voice-line`, workflow
  `qwen3-tts-voiceclone`. Eighteen accepted lines use seed 7. `blocks-home` and
  `clothes-home` use clear revised wording at seed 9 after adversarial Whisper
  review found the original homophone-heavy wording ambiguous.
- Whisper receipts retain intended text, heard text, ratio, and match status.
  Materially mismatched candidates were not shipped.

## Rights and runtime policy

The imagery is project-generated from the project-owned concept mockups and
prompts. The voice derives from the repository's approved rights-cleared
teacher reference. No licensed character, stock art, emoji, SVG, canvas-drawn
toy, baked functional label, CDN, or runtime generation endpoint is used.
All gameplay art, voice, music, and logic are local static files and remain
functional offline; the platform's optional analytics transport is not
gameplay-dependent.
