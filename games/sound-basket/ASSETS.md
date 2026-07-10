# Sound Basket Assets

All current game art comes from the shared QLOBE Kids library. No image files, generated art, downloaded art, recorded clips, or network assets are added by this game.

## Shared runtime assets

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandao & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/sort-into-bins.js` |
| Letter tiles (`shared/assets/letter-tiles/b.png`, `c.png`, `m.png`, `p.png`, `s.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused unmodified |
| Object cards (`shared/assets/objects/*.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused unmodified |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

Production art:

- None new for art; the game already uses existing shared object cards and letter tiles.

Voice lines:

- Recorded word lines for every item in `config.js`.
- Recorded letter-sound and basket lines for b, c, m, p, and s.
- Recorded prompts, nudges, praise, round cheers, and final cheer matching `config.js`.
