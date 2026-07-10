# Game Design Document - Then & Now Sort

## Game title
Then & Now Sort 🕰️

## Category
`culture-geography`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Build the then/now concept through concrete object pairs.
2. Notice that tools can change while their job stays the same.
3. Hear simple function language: make light, write, travel, send messages, hear music, sweep.

## Mini-games / modes

### Mode 1 - Old and New
- **Skill:** Then-and-now comparison and object function.
- **Core loop (30-90s):** The child taps an old object, hears its name, then finds the newer object that does the same job. A correct pair speaks the shared function.
- **Rounds:** 4 with `pairsPerRound: 3` and `difficultyRamp: true`.
- **Pairs:** candle/lightbulb, quill/pencil, horse/car, letter/phone, radio/headphones, broom/cleaning robot.

## Shared assets used
- `shared/js/engines/match-pairs.js` - matching loop, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, unpop, sparkle, boing, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Paired then/now card art for each old object and new object.
- Recorded teacher-voice lines matching every line in `config.js`.

## Interaction model
Tap two cards that do the same job across time. The engine speaks each selected card and keeps the task picture-and-sound driven.

## Feedback model
- **Success:** pop/sparkle SFX, matched-card animation, and a spoken function sentence.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, and the cards remain available.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, confetti-style burst, and spoken cheer.

## Difficulty progression
The first rounds show two pairs, then ramp to three pairs as the child gets comfortable.

## Replay variation
The engine shuffles pair order and card order on each play. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
