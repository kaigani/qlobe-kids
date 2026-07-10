# Asset Log - Problem-Solving Puppets

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandao & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/choose-one.js` |
| Character portraits (`char:maya`, `char:leo`, `char:nia`, `char:sam`, `char:ravi`) | Shared QLOBE Kids character library | QLOBE Kids project | CC BY 4.0 | No | Reused unmodified |
| Puppet prop and feeling placeholder art | N/A - Unicode emoji rendered by the browser through `emoji:` refs | N/A | Platform/browser emoji font license | N/A | Used as temporary placeholder only |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

### Art
- Puppet duo art for "both want the red crayon."
- Puppet duo art for "tower knocked over."
- Puppet duo art for "both want first turn."
- Puppet duo art for "accidental bump."
- Puppet duo art for "one feels left out."

### Voice
- Performed argument lines for every `say` prompt in `config.js`.
- Happy resolution performances for sharing, taking turns, using words, asking for help, saying sorry, and inviting a friend in.
- Warm nudge and celebration lines from `voice.nudge`, `voice.cheer`, and `voice.yums`.
