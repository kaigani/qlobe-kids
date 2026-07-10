# Asset Log - Song Story Remix

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandão & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/choose-one.js` |
| Song, animal, and rider placeholder art | N/A - Unicode emoji rendered by the browser through `emoji:*` refs | N/A | Platform/browser emoji font license | N/A | Used as temporary placeholders only |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

### Art
- Toy-style Old MacDonald farm scene.
- Toy-style Wheels on the Bus scene.
- Character cards for T-Rex, octopus, lion, frog, duck, elephant, ghost, robot, and bus riders.

### Audio
- Recorded sung remix line for T-Rex: "Old MacDonald had a T-Rex..."
- Recorded sung remix line for octopus: "Old MacDonald had an octopus..."
- Recorded sung remix line for lion, frog, and duck.
- Recorded sung bus remix lines for elephant, ghost, robot, and T-Rex riders.
- Optional short backing jingles for farm and bus modes.

### Voice
- "Let us remix a song story! Listen for the silly singer, then tap the card."
- "That one makes a funny song too. Listen again and tap this singer."
- "Remix concert complete!"
- Every praise line and `say` line in `config.js`.
