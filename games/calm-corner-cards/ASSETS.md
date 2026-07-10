# Asset Log - Calm Corner Cards

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandão & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/choose-one.js` |
| Character portraits (`char:maya`, `char:leo`, `char:nia`, `char:ravi`) | Shared QLOBE Kids character library | QLOBE Kids project | CC BY 4.0 | No | Reused unmodified |
| Calm tool and balloon placeholder art | N/A - Unicode emoji rendered by the browser through `emoji:` refs | N/A | Platform/browser emoji font license | N/A | Used as temporary placeholder only |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

### Art
- Calm-corner scene art with the cast showing overwhelmed moments.
- Production tool cards for balloon breaths, self-hug squeeze, count to five, and quiet drawing.
- Balloon-breathing follow-along art with clear size changes.

### Voice
- "Welcome to the calm corner. Big feelings need tools. Pick one calm tool."
- "That helps sometimes. Right now, let us try a calm tool together."
- "Your calm corner is ready. Use one slow breath whenever you need it."
- All guided practice lines in `voice.yums`.
- Every scenario and balloon-breathing `say` line in `config.js`, recorded slowly and spaciously.
