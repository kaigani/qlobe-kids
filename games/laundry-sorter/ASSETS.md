# Laundry Sorter Assets

All current game art is placeholder emoji and color swatches rendered by the shared engine. No image files, generated art, downloaded art, recorded clips, or network assets are added by this game.

## Shared runtime assets

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandao & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/sort-into-bins.js` |
| Placeholder emoji | System emoji font | Platform/device vendors | Varies by platform | No bundled asset attribution | Rendered at runtime by `shared/js/engines/art.js` |
| Color swatches | CSS colors in `config.js` | QLOBE Kids config | MIT | No | Rendered at runtime by `shared/js/engines/art.js` |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

Production art:

- Colored sock card art for red, blue, yellow, and green socks.
- Colored shirt card art for red, blue, yellow, and green shirts.
- Red scarf card art.
- Blue cap card art.
- Blue mitten card art.
- Blue jeans card art.
- Basket art for red, blue, sock, and shirt bins.

Notes:

- Emoji glyph colors vary by platform and may not match the intended item color. The current beta relies on spoken `say` lines and `alt` labels to carry color when the glyph color is ambiguous.

Voice lines:

- Recorded prompts, nudges, praise, round cheers, and final cheer matching `config.js`.
- Recorded item lines for every clothing card in `config.js`.
