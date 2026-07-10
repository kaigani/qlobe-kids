# Asset Log - Bug Hotel Observer

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandão & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/observe-journal.js` |
| Bug hotel placeholder art | N/A - Unicode emoji rendered by the browser through `emoji:*` refs | N/A | Platform/browser emoji font license | N/A | Used as temporary placeholders only |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

### Art
- Bug hotel scene art with sticks, holes, leaves, and damp/shady areas.
- Sticker art for ladybug, caterpillar, ant, spider, snail, leaf, marching, resting, munching, quiet watching, and gentle hands.
- Behavior scene art for munching, resting, and marching pages.

### Voice
- "Shhh. Look closely at the bug hotel and stamp who checked in."
- Four guest prompts for the Who's Home? mode.
- Three behavior prompts for the What Are They Doing? mode.
- All gentle bug fact-lines from `config.js`.
