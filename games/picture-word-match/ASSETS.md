# Picture Word Match Assets

All current picture art reuses existing shared QLOBE Kids CVC object cards. Word cards are rendered by the engine with `text:<word>` refs in Fredoka. No image files, generated art, downloaded art, recorded clips, or network assets are added by this game.

## Shared runtime assets

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandao & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified for UI and word cards |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/match-pairs.js` |
| Object cards (`shared/assets/objects/*.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared:objects/<word>.png` refs |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

Voice lines:

- Tap a picture and tap the word that says the same thing.
- Hmm, listen again and find the word that sounds the same.
- You matched pictures and words!
- Picture and word match!
- You found the word!
- Great looking and listening!
- Match each picture to its word.
- Match more pictures to words.
- Cat matches cat.
- Dog matches dog.
- Sun matches sun.
- Bus matches bus.
- Hat matches hat.
- Box matches box.
- Pig matches pig.
- Cup matches cup.
- Fox matches fox.
- Jet matches jet.
- Mop matches mop.
- Hen matches hen.
- Bug matches bug.
- Van matches van.
- Log matches log.
- Net matches net.
