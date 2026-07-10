# Game Design Document - Table Setting Mission

## Game title
Table Setting Mission 🍽️

## Category
`practical-life`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Practice table-setting order and place-zone vocabulary.
2. Sort common table items by everyday function.
3. Build practical-life independence through a short digital rehearsal.

## Mini-games / modes

### Mode 1 - Set the Table
- **Skill:** Table-setting order and spatial placement vocabulary.
- **Core loop (30-90s):** The child hears a table item, then drags or tap-taps it to the plate spot, cup spot, or cutlery spot.
- **Rounds:** 3 with `itemsPerRound: 4`.
- **Bins:** plate spot, cup spot, and cutlery spot.
- **Items:** bowl, bread, salad, milk, juice, cup, spoon, and fork.

## Shared assets used
- `shared/js/engines/sort-into-bins.js` - sorting loop, tap-tap and drag input, HUD, gentle retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, unpop, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Placemat scene art with plate, cup, and cutlery zones.
- Item cards for table-setting objects.
- Recorded teacher-voice lines matching every line in `config.js`.

## Interaction model
Drag one table item into its place zone, with tap-tap available through the engine as an equal path. The engine handles all input and retry behavior.

## Feedback model
- **Success:** pop/sparkle SFX, bin bounce, burst, and short spoken praise.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, and the same item remains available.
- **Hint:** idle prompt replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, burst, and spoken cheer that connects the game to setting a real table.

## Difficulty progression
The mode keeps three clear place zones and varies the item pool across short rounds.

## Replay variation
The engine shuffles item order on each round. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
