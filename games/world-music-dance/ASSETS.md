# Asset Log - World Music Dance

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandão & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/choose-one.js` |
| Music, place, and movement placeholder art | N/A - Unicode emoji rendered by the browser through `emoji:*` refs | N/A | Platform/browser emoji font license | N/A | Used as temporary placeholders only |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

### Art
- Text-free map-card art for Africa, Mexico, Scotland, India, and Japan.
- Instrument art for West African drums, mariachi trumpet/guitar, bagpipes, sitar, taiko drum, and shaker.
- Movement cards for stomp, sway, spin, and bounce.

### Audio
- Real world-music clip: West African drums.
- Real world-music clip: mariachi from Mexico.
- Real world-music clip: Scottish bagpipes.
- Real world-music clip: Indian sitar.
- Real world-music clip: Japanese taiko.

### Voice
- "Music is traveling around the world! Listen, tap the place, then dance the beat."
- "Good listening. Try another card for this music."
- "World music dance party!"
- Every praise line and `say` line in `config.js`.
