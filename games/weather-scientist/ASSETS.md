# Asset Log - Weather Scientist

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandão & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/observe-journal.js` |
| Weather placeholder art | N/A - Unicode emoji rendered by the browser through `emoji:*` refs | N/A | Platform/browser emoji font license | N/A | Used as temporary placeholders only |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

### Art
- Weather sticker art set: sunny, cloudy, rainy, snowy.
- Temperature-feel sticker art: warm, chilly, freezing.
- Wind sticker art: breezy, windy, still.
- Outfit sticker art: shorts, coat, umbrella, scarf.
- Window/weather journal scene art.

### Voice
- "Be a weather scientist. Look out a real window, then stamp what you notice."
- "Look out a real window. What is the sky doing today?"
- "Think about outside. How does the air feel today?"
- "Look for moving leaves or branches. What is the wind doing?"
- "Look out a real window, then choose something that could help with the weather."
- All sticker affirmation and recap lines from `config.js`.
