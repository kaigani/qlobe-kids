# Teen Bead Builder Assets

Teen Bead Builder adds no image files, recorded clips, downloaded assets, generated art, or network assets. The current beta uses emoji bead placeholders and text numeral cards rendered by the build-assemble engine.

## Shared runtime assets

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandao & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified for UI and text cards |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/build-assemble.js` |
| Emoji placeholder bead art (`emoji:🟨`, `emoji:🟡`) | Rendered by local system emoji through `shared/js/engines/art.js` | Platform/browser emoji font vendors | Varies by device | No in-game attribution required for placeholder use | Used as temporary art refs only |
| Text numeral cards (`text:11`, `text:12`, `text:13`, `text:14`, `text:15`) | N/A - local text rendered by `shared/js/engines/art.js` | N/A | N/A | N/A | Numerals supplied in config |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

- golden bead-bar art
- golden unit bead art
- Montessori teen board/numeral card art
- recorded count-on voice lines
