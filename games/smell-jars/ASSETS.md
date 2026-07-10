# Asset Log - Smell Jars

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandão & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/observe-journal.js` |
| Smell jar placeholder art | N/A - Unicode emoji rendered by the browser through `emoji:*` refs | N/A | Platform/browser emoji font license | N/A | Used as temporary placeholders only |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

### Art
- Jar scene art and safe kitchen smell cards.
- Sticker art for lemon, mint/herbs, cocoa/chocolate, spice, fruit, bread, mystery, reveal reactions, and like-meter faces.
- Grown-up helper visual treatment for real-world safety prompts.

### Voice
- "Grown-up helper, open a real kitchen smell. I have no nose! You be the nose!"
- Four smell prompts for the Be the Nose mode.
- Three mystery-jar prompts and reveal prompts for the Sniff and Guess mode.
- All no-nose joke, guess, preference, and reveal lines from `config.js`.
