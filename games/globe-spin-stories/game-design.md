# Game Design Document - Globe Spin Stories

## Game title
Globe Spin Stories 🌍

## Category
`culture-geography`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Spark curiosity about world places through broad habitat clues.
2. Hear and use hot, cold, wet, dry, icy, leafy, sandy, and splashy vocabulary.
3. Imagine animals and objects that might belong in different habitats.

## Mini-games / modes

### Mode 1 - Where Did We Land?
- **Skill:** Habitat imagination and place vocabulary.
- **Core loop (30-90s):** The child hears a globe-spin landing prompt, stamps something they imagine there, and hears a delighted fact-line.
- **Rounds:** 4 pages: icy place, jungle, desert, ocean.

## Shared assets used
- `shared/js/engines/observe-journal.js` - journal loop, splash, HUD, accepted stickers, recap, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, whoosh, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Spinning globe art.
- Habitat scene pages: icy, jungle, desert, ocean.
- Sticker art for each habitat animal/object.
- Recorded teacher-voice landing prompts and fact-lines matching `config.js`.

## Interaction model
Tap a sticker to stamp it into the imagined place. The engine accepts every choice because this is curiosity and story-making, not a geography quiz.

## Feedback model
- **Success:** pop and sparkle SFX, a stamp animation, and a spoken fact-line.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** a recap parade retells the places and stickers chosen.

## Difficulty progression
Each round changes the habitat clue, moving across cold, wet, hot/dry, and ocean vocabulary while keeping the interaction stable.

## Replay variation
The child can tell a different globe story each time by choosing different stickers. The engine varies stamp placement slightly and supports deterministic debug seeding for review automation.
