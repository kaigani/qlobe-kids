# Asset Log - Letter Road Driving

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandao & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/trace-path.js` |
| Road and car placeholder art | N/A - Unicode emoji rendered by the browser through `emoji:*` refs | N/A | Platform/browser emoji font license | N/A | Used as temporary placeholders only |
| Tracing paths | N/A - authored as simple coordinates in `config.js` | Kaigani | MIT for code/data | No | Stub uppercase road paths |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

### Art
- Road-texture stroke art or a trace-path engine option for road-style strokes.
- Tiny car sprites for regular and race modes.
- Optional start/finish markers once the road art exists.

### Voice
- "Drive along the letter road. Beep beep!"
- "Steer back to the road and keep driving."
- "You drove every letter road!"
- "Beep beep! Nice driving!"
- "You stayed on the road!"
- "Letter road complete!"
- Letter-road prompts and completion lines from `config.js`.

### Future notes
- Engine noises are intentionally omitted in beta because the allowed SFX set does not include recorded or file-based car sounds.
