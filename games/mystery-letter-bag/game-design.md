# Game Design Document - Mystery Letter Bag

## Game title
Mystery Letter Bag 👜

## Category
`reading-phonics`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Connect a spoken consonant sound to the printed letter that represents it.
2. Practice early sound discrimination without requiring word reading.
3. Hear and contrast similar sounds such as b/p, m/n, and c/g.

## Mini-games / modes

### Mode 1 - What's in the Bag?
- **Skill:** Sound-to-letter mapping for b, s, m, t, c, and p.
- **Core loop (30-90s):** The child hears "Something in the bag says..." with a repeated letter sound, sees two to four letter tiles, and taps the matching tile. Correct taps sparkle and advance; misses wiggle gently and replay the sound.
- **Rounds:** 6 with `difficultyRamp: true`.

### Mode 2 - Tricky Sounds
- **Skill:** Similar-sound discrimination.
- **Core loop (30-90s):** The child hears a letter sound with a smaller set of similar-looking or similar-sounding choices, then taps the letter tile that matches.
- **Rounds:** 4.

## Shared assets used
- `shared/js/engines/choose-one.js` - choose-one interaction loop, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, and tada effects.
- `shared/assets/letter-tiles/` - letter tile PNGs for b, s, m, t, c, p, n, and g.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Mystery bag production art to replace `emoji:👜`.
- Recorded teacher-voice letter-sound prompts matching every line in `config.js`.

## Interaction model
Tap one letter-tile answer card after a spoken sound clue. The engine keeps answer cards large, includes a replay button, and never requires the child to read instructional text.

## Feedback model
- **Success:** pop/sparkle SFX, bounce, and spoken praise.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, and the same sound prompt again.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, confetti-style burst, and spoken cheer.

## Difficulty progression
`What's in the Bag?` starts with two answer cards and ramps toward four. `Tricky Sounds` keeps tighter two and three-card sound contrasts.

## Replay variation
The engine shuffles round order and answer order on each play. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
