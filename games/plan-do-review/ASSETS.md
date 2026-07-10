# Asset Log - Plan-Do-Review

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandao & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/choose-one.js` |
| Character portrait (`char:maya`) | Shared QLOBE Kids character library | QLOBE Kids project | CC BY 4.0 | No | Reused unmodified |
| Planning and review placeholder art | N/A - Unicode emoji rendered by the browser through `emoji:` refs | N/A | Platform/browser emoji font license | N/A | Used as temporary placeholder only |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

### Art
- Planning-board art for the PLAN phase.
- Active real-world mini-activity art for the DO phase.
- Reflection board art for the REVIEW phase.
- Tomorrow planning card art.

### Voice
- Reflective voice lines for every `say` prompt in `config.js`.
- Affirmations for build, draw, book, dance, loved-it, okay, tricky, and tell-someone choices.
- A future recorded timing prompt if this grows beyond the choose-one stub.
