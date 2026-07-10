# Game Design Document - Instrument Detective

## Game title
Instrument Detective 🕵️

## Category
`art-music`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Practice listening discrimination by matching a sound clue to an instrument.
2. Build familiarity with instrument names and simple instrument icons.
3. Hear and use sound vocabulary: boom, ding, shicka, toot, plink, strum, loud, soft, jingle, low.

## Mini-games / modes

### Mode 1 - Sound Detective
- **Skill:** Listening discrimination and instrument names.
- **Core loop (30-90s):** The child hears a playful detective-style sound clue, sees two or three instrument cards, and taps the matching instrument. Correct picks get sparkle SFX and praise; misses wiggle gently and replay the clue.
- **Rounds:** 6 with `difficultyRamp: true`.

### Mode 2 - Loud or Soft?
- **Skill:** Sound vocabulary and instrument qualities.
- **Core loop (30-90s):** The child hears a sound-quality prompt such as loud, soft, jingly, or low, then chooses the instrument that best matches that quality. Each short round advances after one correct tap.
- **Rounds:** 4.

## Shared assets used
- `shared/js/engines/choose-one.js` - choose-one interaction loop, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Toy-3D instrument art for drum, bell, shaker, trumpet, piano, guitar, violin, and flute.
- Real instrument sound clips for drum, bell, shaker, trumpet, piano, guitar, violin, and flute under the future shared asset type `shared/assets/sounds/instruments/`.
- Recorded teacher-voice lines matching every line in `config.js`.

## Interaction model
Tap one answer card after a spoken clue. The engine keeps answer cards at large touch sizes, uses a sound replay button, and avoids any required reading.

## Feedback model
- **Success:** pop/sparkle SFX, a brief bounce, and spoken detective praise.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, and the same prompt again.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, confetti-style burst, and spoken cheer.

## Difficulty progression
`Sound Detective` starts with two choices and ramps toward three choices as the mode advances. `Loud or Soft?` keeps three choices for stable sound-quality practice.

## Replay variation
The engine shuffles round order and answer order on each play. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
