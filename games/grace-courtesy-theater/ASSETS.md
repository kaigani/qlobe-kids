# Asset Log - Grace & Courtesy Theater

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandão & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/choose-one.js` |
| Character portraits (`char:maya`, `char:leo`, `char:nia`, `char:sam`, `char:ravi`) | Shared QLOBE Kids character library | QLOBE Kids project | CC BY 4.0 | No | Reused unmodified |
| Answer placeholder art | N/A - Unicode emoji rendered by the browser through `emoji:` refs | N/A | Platform/browser emoji font license | N/A | Used as temporary placeholder only |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

### Art
- Situation scene art with the cast in a small theater or playground scene.
- Production speech-choice illustrations for please, thank you, excuse me, sorry, waiting, and helping.

### Voice
- "Welcome to the tiny manners theater. Listen to the scene, then tap the kind choice."
- "Hmm, how would THAT feel? Listen again and choose the kind way."
- "Curtain call for kind words! Try one today with your family."
- "That sounds kind and gentle."
- "Warm words help everyone feel safe."
- "Yes, that is grace and courtesy."
- "Kind choice. The theater claps softly."
- Every `say` line in `config.js`, performed warmly with the quoted kind phrase.
