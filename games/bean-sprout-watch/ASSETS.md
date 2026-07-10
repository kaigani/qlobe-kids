# Asset Log - Bean Sprout Watch

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandão & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/observe-journal.js` |
| Bean sprout placeholder art | N/A - Unicode emoji rendered by the browser through `emoji:*` refs | N/A | Platform/browser emoji font license | N/A | Used as temporary placeholders only |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

### Art
- Sprout growth-stage scene art for bean in jar, root emerging, sprout, leaves, and mature plant.
- Sticker art for root, sprout, leaf, water, sun, window, measuring, jar, gentle hands, and daily check.
- Care-state scene art for droopy, leggy, and dry-paper sprout pages.

### Voice
- "A real bean in a jar can change slowly. Look each day and stamp what changed."
- Five day prompts for the Sprout Diary mode.
- Three care prompts for the What Does It Need? mode.
- All sticker observation and care lines from `config.js`.
