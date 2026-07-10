# Game Design Document - Texture Trail

## Game title
Texture Trail 🪨

## Category
`sensorial-science`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Build vocabulary for common textures: soft, hard, bumpy, smooth, fluffy, and prickly.
2. Compare two objects by an imagined feel instead of by color or shape.
3. Carry the concept into the room with a short movement prompt after the round set.

## Mini-games / modes

### Mode 1 - Feels the Same
- **Skill:** Texture vocabulary and comparison.
- **Core loop (30-90s):** The child taps one card, hears the object name, then taps a second card that feels the same. A correct pair names the texture with both examples.
- **Rounds:** 4 with `pairsPerRound: 3` and `difficultyRamp: true`.
- **Pairs:** teddy/cloud, rock/brick, alligator/pineapple, egg/smooth ball, sheep/chick, cactus/hedgehog.

## Shared assets used
- `shared/js/engines/match-pairs.js` - matching loop, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, unpop, sparkle, boing, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Texture close-up card art for soft, hard, bumpy, smooth, fluffy, and prickly examples.
- Recorded teacher-voice lines matching every line in `config.js`.
- Future haptic exploration notes for devices that support safe tactile feedback.

## Interaction model
Tap two cards that feel alike. The engine speaks each selected card and uses large touch targets with no required reading.

## Feedback model
- **Success:** pop/sparkle SFX, matched-card animation, and a spoken texture sentence.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, and the cards remain available.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, confetti-style burst, and a movement prompt to find a soft object in the room.

## Difficulty progression
The first rounds show two pairs, then ramp to three pairs as the child gets comfortable.

## Replay variation
The engine shuffles pair order and card order on each play. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
