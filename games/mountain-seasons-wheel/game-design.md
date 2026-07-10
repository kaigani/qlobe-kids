# Game Design Document - Mountain Seasons Wheel

## Game title
Mountain Seasons Wheel 🏔️

## Category
`culture-geography`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Recognize season cues for winter, spring, summer, and autumn.
2. Match weather to clothing and outdoor objects.
3. Build vocabulary for seasonal nature: snow, blossoms, sun, leaves, rain, and pumpkins.

## Mini-games / modes

### Mode 1 - What Season?
- **Skill:** Seasonal nature and activity matching.
- **Core loop (30-90s):** The child hears the season wheel land on a season, sees the season emoji as the prompt, and taps the object that belongs in that season.
- **Rounds:** 6 with `difficultyRamp: true`.

### Mode 2 - Dress for It
- **Skill:** Choosing clothing for weather.
- **Core loop (30-90s):** The child hears a weather clue such as snow, rain, sun, or autumn wind and taps the clothing or tool that fits.
- **Rounds:** 4.

## Shared assets used
- `shared/js/engines/choose-one.js` - choose-one interaction loop, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Toy-style season wheel art showing winter, spring, summer, and autumn wedges.
- Toy-style cards for snowman, scarf, blossoms, rain, sandals, watermelon, leaves, pumpkin, coat, umbrella, sun hat, and jacket.
- Recorded teacher-voice lines matching every line in `config.js`.

## Interaction model
Tap one answer card after a spoken season or weather clue. The engine keeps answer cards large, offers a replay-sound button, and requires no reading for gameplay.

## Feedback model
- **Success:** pop/sparkle SFX, a brief bounce, and spoken season praise.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, and the same prompt again.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, confetti-style burst, and spoken cheer.

## Difficulty progression
`What Season?` starts with fewer choices and ramps toward four choices. `Dress for It` uses three stable choices for focused clothing practice.

## Replay variation
The engine shuffles round order and answer order on each play. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
