# Asset Log - Chalkboard Big Strokes

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandao & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/trace-path.js` |
| Chalkboard placeholder art | N/A - Unicode emoji rendered by the browser through `emoji:*` refs | N/A | Platform/browser emoji font license | N/A | Used as temporary placeholders only |
| Tracing paths | N/A - authored as simple coordinates in `config.js` | Kaigani | MIT for code/data | No | Stub pre-writing stroke paths |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

### Art
- Chalkboard background art that keeps white stroke paths readable.
- Chalk-dust particle treatment for future engine or custom polish.
- Optional chalk texture for the traced stroke once the engine supports per-game stroke textures.

### Voice
- "Make a giant chalk stroke. Try it in the air too!"
- "Back to the chalk line. Big gentle arm."
- "Chalkboard strokes complete! Try one in the air!"
- "Big chalk move!"
- "Your arm made a strong stroke!"
- "Lovely chalk line!"
- Stroke prompts and completion lines from `config.js`.

### Future notes
- Keep the two-part strokes in the shared trace-path multi-stroke format so QA can complete them through `window.QLOBE_DEBUG.winRound()`.
