# Puzzle Map Match Assets

All current game art is placeholder emoji rendered by the shared engine. No image files, generated art, downloaded art, recorded clips, or network assets are added by this game.

## Shared runtime assets

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandao & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused by `shared/js/engines/sort-into-bins.js` |
| Placeholder emoji | System emoji font | Platform/device vendors | Varies by platform | No bundled asset attribution | Rendered at runtime by `shared/js/engines/art.js` |
| Sound effects | N/A - synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech voice | N/A - device built-in Web Speech API voices via `shared/js/speech.js` | N/A | N/A | N/A | Used for all beta voice lines |

## Assets needed

Production art:

- Icy habitat bin scene.
- Hot savanna habitat bin scene.
- Ocean habitat bin scene.
- Farm bin scene.
- Wild woods bin scene.
- Animal cards: penguin, polar bear, lion, elephant, giraffe, whale, octopus, fish, cow, pig, hen, fox, deer, owl.

Voice lines:

- Where does each animal live? Find its home place.
- Almost. Listen for that animal's home and try another place.
- Every animal found a home!
- You matched the animal map!
- That is its home!
- Animal explorer!
- You found the right place!
- Sort each animal to its home: icy, hot, or ocean.
- Those animals are home!
- A penguin lives where it is icy cold!
- A polar bear lives where it is icy cold!
- A lion lives in the hot savanna!
- An elephant lives in a hot place!
- A giraffe lives in the hot savanna!
- A whale lives in the ocean!
- An octopus lives in the ocean!
- A fish lives in the ocean!
- Sort each animal to the farm or the wild woods.
- Farm and wild animals are sorted!
- A cow lives on a farm.
- A pig lives on a farm.
- A hen lives on a farm.
- A fox lives in the wild.
- A deer lives in the wild.
- An owl lives in the wild.
