# Laundry Sorter Assets

This game is the pilot of the **Storybook Rooms** art world
(`docs/art-direction.md`): a full-bleed laundry-room backdrop with cut-out
clothing and basket sprites.

## Game + shared art (generated)

| Asset | Source | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| `assets/room.jpg` (laundry-room backdrop) | Generated locally (text-to-image) | QLOBE Kids project | CC BY 4.0 | No | Downscaled to 1600×1200 JPEG |
| `shared/assets/storybook/sock-*.png`, `shirt-*.png`, `scarf-red.png`, `cap-blue.png`, `mitten-blue.png`, `jeans-blue.png` (12 clothing sprites) | Generated locally (text-to-image, layer-extracted to alpha PNG) | QLOBE Kids project | CC BY 4.0 | No | Trimmed, 512px, PNG-8 |
| `shared/assets/storybook/basket-{red,blue,socks,shirts}.png` (4 bins) | Generated locally (same pipeline) | QLOBE Kids project | CC BY 4.0 | No | Trimmed, 512px, PNG-8 |

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

Voice lines:

- Recorded prompts, nudges, praise, round cheers, and final cheer matching `config.js`.
- Recorded item lines for every clothing card in `config.js`.
