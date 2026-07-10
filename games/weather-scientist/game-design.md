# Game Design Document - Weather Scientist

## Game title
Weather Scientist 🌦️

## Category
`sensorial-science`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Observe real weather by looking out a window.
2. Use sky, temperature-feel, and wind vocabulary.
3. Record simple daily data in a journal format.

## Mini-games / modes

### Mode 1 - Today's Weather
- **Skill:** Weather observation and recording.
- **Core loop (30-90s):** The child hears a prompt to look out a real window, then stamps the sky, feel, and wind onto three journal pages.
- **Rounds:** 3 pages: sky, feels-like, wind.

### Mode 2 - What to Wear?
- **Skill:** Connect clothing choices to weather conditions.
- **Core loop (30-90s):** The child looks outside, stamps an outfit helper, and hears why that choice can help in that weather.
- **Rounds:** 2 outfit pages with all choices affirmed.

## Shared assets used
- `shared/js/engines/observe-journal.js` - journal loop, splash, HUD, accepted stickers, recap, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, whoosh, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Weather sticker art set: sunny, cloudy, rainy, snowy, warm, chilly, freezing, breezy, windy, still, shorts, coat, umbrella, scarf.
- Recorded teacher-voice lines matching every spoken line in `config.js`.

## Interaction model
Tap a large sticker to stamp it onto the current journal page. The engine accepts every observation, because weather recording is about noticing, not quizzing.

## Feedback model
- **Success:** pop and sparkle SFX, a sticker stamp animation, and a spoken observation or why-line.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** the recap parade reads back the finished weather report with a short tada.

## Difficulty progression
The first mode moves from direct observation (sky) to inference (air feel) to a slightly subtler clue (wind movement). The dress mode asks the child to apply weather thinking to a practical choice.

## Replay variation
The child can make a different daily report each time. The engine varies stamp placement slightly and supports deterministic debug seeding for review automation.
