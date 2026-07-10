# Asset Log - Sandpaper Number Match

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandão & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/tap-count.js` |
| Numeral placeholder art | N/A - `text:*` refs rendered by the engine with Fredoka | N/A | N/A | N/A | Used as temporary placeholders only |
| Button, tray, star, and jar placeholder art | N/A - Unicode emoji rendered by the browser through `emoji:*` refs | N/A | Platform/browser emoji font license | N/A | Used as temporary placeholders only |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

### Art
- Tactile sandpaper-numeral cards for 1 through 9
- Round button objects
- Number tray target
- Star objects
- Jar target
- Future trace-path data for each numeral when v2 moves to finger tracing

### Voice
- "Meet each number, then tap that many."
- "This is one! Tap one button!"
- "This is two! Tap two buttons!"
- "This is three! Tap three buttons!"
- "This is four! Tap four buttons!"
- "This is five! Tap five buttons!"
- "This is six! Tap six stars!"
- "This is seven! Tap seven stars!"
- "This is eight! Tap eight stars!"
- "This is nine! Tap nine stars!"
- Count lines from "One!" through "Ten!"
- "You matched the numbers!"
