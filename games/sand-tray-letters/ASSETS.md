# Asset Log - Sand Tray Letters

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandao & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/trace-path.js` |
| Sand tray placeholder art | N/A - Unicode emoji rendered by the browser through `emoji:*` refs | N/A | Platform/browser emoji font license | N/A | Used as temporary placeholders only |
| Tracing paths | N/A - authored as simple coordinates in `config.js` | Kaigani | MIT for code/data | No | Stub single-stroke approximations for beta |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

### Art
- Sand-texture background art that keeps the trace path readable.
- Montessori-style sand tray frame or surface treatment.
- Letter-formation stroke data for all 26 lowercase letters for a v2 expansion.

### Voice
- "Trace the sandy path with one finger."
- "Find the sandy line and keep going."
- "You made sandy letters and shapes!"
- "Soft sand writing!"
- "Your finger made the path!"
- "Lovely tracing in the sand!"
- "Start at the sparkle. Make a sandy c."
- "Cuh! You wrote C!"
- "Round and round. Make a sandy o."
- "O! You wrote O!"
- "Curve this way, then that way. Make a sandy s."
- "Sss! You wrote S!"
- "Slide straight down. Make a sandy l."
- "Lll! You wrote L!"
- "Down, around, and up. Make a sandy u."
- "Uh! You wrote U!"
- Shape prompt and celebration lines from `config.js`.

### Future notes
- Replace the beta letter paths with a full formation dataset once the writing sequence is reviewed by an early-literacy specialist.
