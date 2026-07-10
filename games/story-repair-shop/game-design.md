# Game Design Document - Story Repair Shop

## Game title
Story Repair Shop 🔧

## Category
`oral-storytelling`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Predict a logical ending from a short spoken story.
2. Use cause and effect to decide what could happen next.
3. Notice the difference between realistic and silly endings.

## Mini-games / modes

### Mode 1 - Fix the Ending
- **Skill:** Story prediction and cause-and-effect reasoning.
- **Core loop (30-90s):** The child hears a tiny two-sentence story and taps the ending that makes sense. The wrong options are playful, not scary.
- **Rounds:** 5.

### Mode 2 - Silly or Real?
- **Skill:** Identifying intentionally silly endings.
- **Core loop (30-90s):** The prompt flips the goal and asks the child to pick the silly ending on purpose, making role reversal part of the fun.
- **Rounds:** 4.

## Shared assets used
- `shared/js/engines/choose-one.js` - choose-one interaction loop, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Story-scene cards for planting, rain, blocks, toaster, puppy, fishbowl, bedtime, umbrella, and toothbrushing scenes.
- Recorded teacher-voice story lines matching every line in `config.js`.

## Interaction model
Tap one ending card after a spoken story prompt. The answers use large emoji placeholders so the child can respond from listening and picture meaning, without reading.

## Feedback model
- **Success:** pop/sparkle SFX, bounce, and spoken praise.
- **Retry:** gentle wiggle, boing SFX, spoken nudge ("would that really happen?"), and the same story prompt again.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, confetti-style burst, and spoken cheer.

## Difficulty progression
`Fix the Ending` keeps one clearly logical ending and two silly distractors. `Silly or Real?` reverses the rule and asks for the silly ending explicitly.

## Replay variation
The engine shuffles round order and answer order on each play. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
