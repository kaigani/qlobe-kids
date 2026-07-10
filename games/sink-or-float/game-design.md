# Game Design Document - Sink or Float

## Game title
Sink or Float 🛁

## Category
`sensorial-science`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Predict whether familiar objects sink or float.
2. Build early buoyancy intuition about weight, shape, air, and water pushing up.
3. Treat science ideas as testable predictions.

## Mini-games / modes

### Mode 1 - Sink or Float?
- **Skill:** Buoyancy prediction for familiar objects.
- **Core loop (30-90s):** The child sees a big object, hears a short clue about why it might sink or float, and taps the sink or float answer card.
- **Rounds:** 6.

### Mode 2 - Tricky Ones
- **Skill:** Reasoning through surprising examples.
- **Core loop (30-90s):** The child hears a clue for an object that may surprise them, then chooses sink or float.
- **Rounds:** 4.

## Shared assets used
- `shared/js/engines/choose-one.js` - choose-one interaction loop, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Bathtub scene production art to replace `emoji:🛁`.
- Splash/plop recorded sound clips if this game later gets custom sound design.
- Recorded teacher-voice why-lines matching every line in `config.js`.

## Interaction model
Tap one of two answer cards after a spoken object clue. The engine keeps cards large, includes a replay button, and never requires the child to read instructional text.

## Feedback model
- **Success:** pop/sparkle SFX, bounce, and spoken science praise.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, and the same object clue again.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, confetti-style burst, spoken cheer, and a real-world experiment prompt.

## Difficulty progression
The tub mode uses direct examples. The tricky mode includes objects where weight alone is not enough, such as apples and boats.

## Replay variation
The engine shuffles round order and answer order on each play. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
