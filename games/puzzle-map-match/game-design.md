# Game Design Document - Puzzle Map Match

## Game title
Puzzle Map Match 🗺️

## Category
`culture-geography`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Connect animals with simple home-place categories.
2. Build hot, cold, ocean, farm, and wild vocabulary.
3. Practice first geography through concrete animal examples.

## Mini-games / modes

### Mode 1 - Animal Homes
- **Skill:** Habitat matching and hot-cold-ocean vocabulary.
- **Core loop (30-90s):** The child hears an animal's home clue and sorts it to icy places, the hot savanna, or the ocean.
- **Rounds:** 3 with `itemsPerRound: 4`.
- **Bins:** icy, hot savanna, and ocean.
- **Items:** penguin, polar bear, lion, elephant, giraffe, whale, octopus, and fish.

### Mode 2 - Farm or Wild?
- **Skill:** Farm and wild animal classification.
- **Core loop (30-90s):** The child listens for an animal and sorts it to the farm or the wild woods.
- **Rounds:** 3 with `itemsPerRound: 4`.
- **Bins:** farm and wild.
- **Items:** cow, pig, hen, fox, deer, and owl.

## Shared assets used
- `shared/js/engines/sort-into-bins.js` - sorting loop, tap-tap and drag input, HUD, gentle retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, unpop, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Habitat scene bin art for icy places, hot savanna, and ocean.
- Farm and wild scene bin art.
- Animal cards for each item in the modes.
- Recorded teacher-voice lines matching every line in `config.js`.

## Interaction model
Drag one animal into its home bin, with tap-tap available through the engine as an equal path. Spoken lines explain each home, so no reading is required.

## Feedback model
- **Success:** pop/sparkle SFX, bin bounce, burst, and short spoken praise.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, and the same animal remains available.
- **Hint:** idle prompt replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, burst, and spoken cheer.

## Difficulty progression
Animal Homes uses three broad habitat categories. Farm or Wild narrows the decision to two familiar categories for a quicker classification round.

## Replay variation
The engine shuffles item order on each round. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
