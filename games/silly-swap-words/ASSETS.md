# Silly Swap Words Assets

Silly Swap Words adds no image files, recorded clips, downloaded assets, generated art, or network assets. The current beta uses shared letter-tile PNGs and emoji/text rendering from the build-assemble engine.

## Shared runtime assets

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandao & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified for UI |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/build-assemble.js` |
| Letter tiles (`shared/assets/letter-tiles/c.png`, `h.png`, `s.png`, `b.png`, `d.png`, `l.png`, `p.png`, `w.png`, `m.png`, `t.png`, `at.png`, `un.png`, `og.png`, `ig.png`, `op.png`, `am.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared:letter-tiles/<tile>.png` refs |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

- swap-arrow animation art
- recorded transformation lines
