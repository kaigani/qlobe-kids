# Asset Log - Sound Painting

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandão & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/observe-journal.js` |
| Color placeholder art | N/A - CSS color chips rendered by the engine through `swatch:*` refs | N/A | N/A | N/A | Used as temporary placeholders only |
| Picture placeholder art | N/A - Unicode emoji rendered by the browser through `emoji:*` refs | N/A | Platform/browser emoji font license | N/A | Used as temporary placeholders only |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

### Music clips
- Prominently needed: real short music clips per mood in a future shared asset category such as `shared/assets/sounds/music-moods/`.
- Slow-soft clip.
- Big-boomy clip.
- Fast-tickly clip.
- Gentle-sleepy clip.

### Art
- Painterly swatch sticker art for each color option.
- Mood picture sticker art: wave, butterfly, elephant, lightning, moon, and related options.
- Sound-painting journal scene art.

### Voice
- "Listen with your imagination. There are no wrong feelings."
- The four mood prompts: slow and soft, big and boomy, fast and tickly, gentle and sleepy.
- All color and picture affirmation lines from `config.js`.
