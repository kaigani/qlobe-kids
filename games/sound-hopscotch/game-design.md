# Game Design Document - Sound Hopscotch

## Game title
Sound Hopscotch 🦘

## Category
`reading-phonics`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Connect a spoken consonant sound to the printed letter that represents it.
2. Build quick, playful sound-letter recall.
3. Practice similar-looking and similar-sounding contrasts without requiring word reading.

## Mini-games / modes

### Mode 1 - Hop to the Sound
- **Skill:** Sound-to-letter mapping for b, m, s, t, c, p, d, and g.
- **Core loop (30-90s):** The voice calls a sound, the child sees two to four letter stones, and taps the stone that matches the sound.
- **Rounds:** 6 with `difficultyRamp: true`.

### Mode 2 - Quick Hops
- **Skill:** Fast discrimination of trickier pairs such as b/d, m/n, and c/g.
- **Core loop (30-90s):** Four stones appear each round. The child listens and hops quickly to the matching letter.
- **Rounds:** 5.

## Shared assets used
- `shared/js/engines/choose-one.js` - choose-one interaction loop, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, and tada effects.
- `shared/assets/letter-tiles/` - letter tile PNGs for b, m, s, t, c, p, d, g, and n.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Hopscotch court or stone path production art to replace `emoji:🦘` prompt art.
- Recorded teacher-voice sound-call lines matching every line in `config.js`.

## Interaction model
Tap one letter-tile answer card after a spoken sound clue. The engine keeps answer cards large, includes a replay button, and never requires the child to read instructional text.

## Feedback model
- **Success:** pop/sparkle SFX, bounce, and spoken praise.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, and the same sound prompt again.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, confetti-style burst, spoken cheer, and a real-body hopping prompt.

## Difficulty progression
`Hop to the Sound` starts with two answer cards and ramps toward four. `Quick Hops` keeps four cards and uses tighter contrasts.

## Replay variation
The engine shuffles round order and answer order on each play. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
