# Game Design Document - Letter Treasure Hunt

## Game title
Letter Treasure Hunt 🏴‍☠️

## Category
`reading-phonics`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Hear the initial sound in familiar CVC words.
2. Connect a target letter tile with a real object whose word begins with that sound.
3. Practice close contrasts such as b/p, c/g, and m/n through picture choices.

## Mini-games / modes

### Mode 1 - Sound Treasure
- **Skill:** Initial-sound identification for b, s, m, c, p, and t.
- **Core loop (30-90s):** The child hears "Find something that starts with..." while seeing the target letter tile, then taps the object-card treasure that starts with that sound.
- **Rounds:** 6 with `difficultyRamp: true`.

### Mode 2 - Two Treasures
- **Skill:** Initial-sound discrimination with plausible distractors.
- **Core loop (30-90s):** The child hears a target first sound and chooses among object cards with closer sound contrasts, such as b vs p or c vs g.
- **Rounds:** 4.

## Shared assets used
- `shared/js/engines/choose-one.js` - choose-one interaction loop, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, and tada effects.
- `shared/assets/letter-tiles/` - letter tile PNGs for b, s, m, c, p, and t.
- `shared/assets/objects/` - object cards for bat, sun, map, cat, pig, top, pan, bun, gum, gem, net, and nut.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Treasure chest frame art for the prompt area or future themed card treatment.
- Recorded teacher-voice prompt lines matching every line in `config.js`.

## Interaction model
Tap one picture-card answer after a spoken initial-sound prompt. The target letter tile is visual support; the child can play from sound and pictures without reading instructions.

## Feedback model
- **Success:** pop/sparkle SFX, bounce, and spoken praise.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, and the same prompt again.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, confetti-style burst, and spoken cheer.

## Difficulty progression
`Sound Treasure` starts with two answer cards and ramps toward three. `Two Treasures` keeps three choices but uses closer initial-sound distractors.

## Replay variation
The engine shuffles round order and answer order on each play. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
