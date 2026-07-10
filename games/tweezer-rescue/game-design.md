# Game Design Document - Tweezer Rescue

## Game title
Tweezer Rescue 🫳

## Category
`writing-fine-motor`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Practice pincer-grip control through short, careful drags.
2. Match by color and spoken size.
3. Build gentle precision with retry-friendly placement.

## Mini-games / modes

### Mode 1 - Color Nests
- **Skill:** Pincer-grip drag control with color matching.
- **Core loop (30-90s):** The child pinches or tap-selects a pom-pom, hears its color, and places it in the matching color nest.
- **Rounds:** 3 with `itemsPerRound: 4`.
- **Bins:** red, yellow, and green nests rendered as swatches.
- **Items:** red, yellow, and green pom-poms rendered with emoji placeholders.

### Mode 2 - Big and Small
- **Skill:** Pincer-grip drag control with size vocabulary.
- **Core loop (30-90s):** The child listens for "big" or "small" and sorts the pom-pom into the matching nest.
- **Rounds:** 3 with `itemsPerRound: 4`.
- **Bins:** big nest and small nest.
- **Items:** Same placeholder pom-pom art; the spoken line carries the size until production art supports size variants.

## Shared assets used
- `shared/js/engines/sort-into-bins.js` - sorting loop, tap-tap and drag input, HUD, gentle retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, unpop, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Fluffy pom-pom art with big and small variants.
- Nest art with clear color and size treatments.
- Recorded teacher-voice lines matching every line in `config.js`.

## Interaction model
Drag the current pom-pom into a nest, with tap-tap available through the engine as an equal path. The intro explicitly invites a two-finger pincer grip.

## Feedback model
- **Success:** pop/sparkle SFX, bin bounce, burst, and short spoken praise.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, and the same pom-pom remains available.
- **Hint:** idle prompt replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, burst, and spoken cheer.

## Difficulty progression
Color Nests uses three familiar colors. Big and Small reduces the visual categories to two bins and relies on listening for the size word.

## Replay variation
The engine shuffles item order on each round. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
