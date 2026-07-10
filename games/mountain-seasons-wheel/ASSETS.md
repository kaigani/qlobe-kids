# Asset Log - Mountain Seasons Wheel

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandão & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/choose-one.js` |
| Season and clothing placeholder art | N/A - Unicode emoji rendered by the browser through `emoji:*` refs | N/A | Platform/browser emoji font license | N/A | Used as temporary placeholders only |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

### Art
- Rotating season wheel art with winter, spring, summer, and autumn wedges.
- Winter cards: snowman, scarf, coat.
- Spring cards: blossoms, rain cloud, umbrella.
- Summer cards: sandals, watermelon, sun hat.
- Autumn cards: falling leaves, pumpkin, jacket.

### Voice
- "Spin the mountain seasons wheel! Listen for the season, then tap what belongs."
- "Almost! Look at the season and try another one."
- "The season wheel is complete!"
- "Yes! That belongs in this season."
- "You matched the mountain weather!"
- "Great season thinking!"
- Every `say` line in `config.js` for the `wheel` and `dress` modes.
