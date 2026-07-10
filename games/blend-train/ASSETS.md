# Blend Train Assets

Blend Train adds no image files, recorded clips, downloaded assets, generated art, or network assets. The current beta uses shared letter-tile PNGs and text cards rendered by the build-assemble engine.

## Shared runtime assets

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandao & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified for UI and text cards |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/build-assemble.js` |
| Letter tiles (`shared/assets/letter-tiles/m.png`, `at.png`, `c.png`, `s.png`, `un.png`, `d.png`, `og.png`, `p.png`, `ig.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared:letter-tiles/<tile>.png` refs |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

- train-car frames wrapping the letter tiles
- blend voice lines
