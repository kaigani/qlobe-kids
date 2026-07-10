# Asset Log - Feelings Charades

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandão & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/choose-one.js` |
| Character portraits (`char:maya`, `char:leo`, `char:nia`, `char:sam`, `char:ravi`) | Shared QLOBE Kids character library | QLOBE Kids project | CC BY 4.0 | No | Reused unmodified |
| Feeling and situation placeholder art | N/A - Unicode emoji rendered by the browser through `emoji:` refs | N/A | Platform/browser emoji font license | N/A | Used as temporary placeholder only |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

### Art
- Cast emotion-pose art for proud, frustrated, calm, worried, happy, and sad.
- Production situation cards for puzzle success, lost toy, quiet breathing, and tricky puzzle moments.

### Voice
- "Let us play feelings charades. Listen to the acting voice, then tap the feeling face."
- "That face does not match yet. Listen to the acting voice again."
- "Feelings charades finished! Now act one feeling with your whole body."
- All praise lines in `voice.yums`.
- Every acted `say` line in `config.js`, performed with clear emotional tone.
