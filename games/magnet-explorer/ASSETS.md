# Magnet Explorer Assets

All current game art is placeholder emoji rendered by the shared engine. No image files, generated art, downloaded art, recorded clips, or network assets are added by this game.

## Shared runtime assets

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandao & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/sort-into-bins.js` |
| Placeholder emoji | System emoji font | Platform/device vendors | Varies by platform | No bundled asset attribution | Rendered at runtime by `shared/js/engines/art.js` |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

Production art:

- Magnet bin art.
- Does-not-stick basket art.
- Object card art for paperclip, key, bolt/nail, scissors, spoon, leaf, crayon, teddy, plastic duck, and wood block.

Voice lines:

- Recorded prompts, nudges, praise, round cheers, and final cheer matching `config.js`.
- Recorded explanatory item lines for every object card in `config.js`.
