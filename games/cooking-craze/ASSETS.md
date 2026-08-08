# Cooking Craze asset provenance

The shipped game is static. Image and voice models are used only during authoring; the runtime makes no model calls.

## Final visual family

The accepted world is polished **Kawaii hand-crafted clay/toy art** based on the Cooking Craze concept mockups. GPT Image 2 was used in image-generation mode for the kitchen, characters, title, plates, sauce mark, pizza parts, six toppings, and dedicated hub tile. The title’s final color correction used GPT Image 2 edit mode with the immediately previous title as its reference.

| Runtime role | Accepted asset |
|---|---|
| Kitchen / oven / work mat | `assets/scenes/kawaii-kitchen-v2.webp` |
| Exact title | `assets/ui/title-kawaii-v3.webp` |
| Tomato, pizza-chef, cheese-star mascots | `assets/ui/mascot-trio-v2.webp` |
| Blank mode and action carriers | `assets/ui/mode-card-v2.webp`, `assets/ui/action-button-v2.webp` |
| Completion reward lockup | `assets/ui/completion-lockup-v2.webp` |
| Replay / serve action pictograms | `assets/ui/action-replay-icon-v2.webp`, `assets/ui/action-serve-icon-v2.webp` |
| Sauce feedback | `assets/ui/sauce-dab-v2.webp` |
| Six topping characters | `assets/ui/ingredient-{tomato,pepperoni,mushroom,basil,olive,cheese}-v2.webp` |
| Pizza, dough, peel | `assets/world/pizza-base-v2.webp`, `dough-blob-v2.webp`, `peel-v2.webp` |
| Catalog art | `../../assets/hub/tiles/cooking-craze-v2.jpg` |
| Social preview | `assets/og-image.jpg` (generated from the final splash) |

Original generation outputs are preserved under `assets/source/gpt-image-2/`. The accepted prompt set is recorded in `assets/source/gpt-image-2/README.md`.

The completion reward lockup and replay/serve action pictograms were generated in create mode and keyed from exact-blue `#0000ff` sources, then finalized with the imagegen skill’s deterministic chroma tool:

```sh
python3 "$CODEX_HOME/skills/.system/imagegen/scripts/remove_chroma_key.py" \
  --input INPUT.png --out OUTPUT.png --auto-key border --soft-matte \
  --transparent-threshold 12 --opaque-threshold 220 --despill
```

Transparent outputs were visually inspected at full size and encoded to WebP. `title-kawaii-v2` was rejected because blue-key removal damaged two purple letters; the accepted v3 edit changed only those two colors while preserving the exact lettering.

## Local LAN explorations

Krea 2 kitchen/tile explorations and Qwen Image Layered extraction experiments are preserved in `shared/media/cooking-craze-*`. They informed composition and tested the Studio pipeline, but their darker palette and extraction debris did not meet the final Kawaii art bar, so they are not referenced by runtime configuration. This decision is intentional, not an incomplete assignment.

## Teacher voice

The game packages 21 clips under `assets/audio/voice-clips/`. Qwen3-TTS VoiceClone used the configured local teacher reference with seed 7. Studio encoded AAC/M4A at 96 kb/s with `+faststart`, then sent the final encoded file to local Whisper (`base`, English). Accepted recipes and transcript evidence remain under `shared/media/cooking-craze-voice-*`.

`assets/audio/lines.json` exactly mirrors `config.json#voice`. `assets/audio/manifest.json` records the relative file, duration rounded to milliseconds, seed, and the first 16 hexadecimal characters of SHA-256 over the exact UTF-8 line.

Final QA corrections:

| Key | Accepted text | Whisper ratio |
|---|---|---:|
| `build-intro` | “Let's make a rainbow pizza!” | 1.0 |
| `build-topping` | “Match each topping to its picture.” | 1.0 |
| `bad-drop` | “Try the matching slice!” | 1.0 |

All other packaged clips retained their previously accepted QA evidence. Missing or undecodable audio safely falls back to the exact local line text through `shared/js/voice-clips.js`.

## Older prototype assets

Unversioned `kitchen.webp`, `title.webp`, ingredient, pizza, dough, oven, and peel files are retained as authoring comparisons from the replaced scaffold. They are not referenced by `config.json` or the final HTML/CSS. Versioned `-v2`/`-v3` files are the runtime source of truth.

## Rights and runtime budget

Code is MIT. Project-created art and audio are recorded as CC BY 4.0 in `game.json`. The final runtime background is about 105 KB, the dedicated hub tile about 140 KB, and individual interaction sprites remain small WebP files; large PNG generation sources are not loaded at runtime.
