# Tweezer Rescue Assets

All current game art is placeholder art rendered by the shared engine: emoji pom-poms, emoji nests, and `swatch:<color>` chips. No image files, generated art, downloaded art, recorded clips, or network assets are added by this game.

## Shared runtime assets

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandao & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/sort-into-bins.js` |
| Placeholder emoji and swatches | System emoji font and engine-rendered color chips | Platform/device vendors and QLOBE engine | Varies by platform for emoji; engine code MIT | No bundled asset attribution | Rendered at runtime by `shared/js/engines/art.js` |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

Production art:

- Fluffy pom-pom card art.
- Big fluffy pom-pom variant.
- Small fluffy pom-pom variant.
- Red, yellow, and green nest art.
- Big nest and small nest art.

Voice lines:

- Rescue the pom-poms! Pick one up with two fingers, like tiny tweezers.
- Almost. Give that pom-pom a tiny wiggle and try another nest.
- Pom-poms safe in their nests!
- You rescued every pom-pom!
- Tiny tweezer fingers!
- Gentle pinch and place!
- That pom-pom is safe!
- Pick up each pom-pom with two fingers and match its color nest.
- Listen for big or small, then tuck the pom-pom into the right nest.
- A red pom-pom! Put it in the red nest.
- Another red pom-pom! Red nest.
- A yellow pom-pom! Put it in the yellow nest.
- Another yellow pom-pom! Yellow nest.
- A green pom-pom! Put it in the green nest.
- Another green pom-pom! Green nest.
- A big pom-pom! It goes in the big nest.
- This pom-pom is big. Big nest.
- A small pom-pom! It goes in the small nest.
- This pom-pom is small. Small nest.
- Big pom-pom. Big nest.
- Small pom-pom. Small nest.
