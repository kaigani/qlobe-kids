# Game Design Document - Sound Painting

## Game title
Sound Painting 🎶

## Category
`art-music`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Notice how musical qualities can create feelings.
2. Use synesthetic vocabulary connecting sound, color, and image.
3. Practice creative response without right or wrong answers.

## Mini-games / modes

### Mode 1 - Paint the Sound
- **Skill:** Emotional response to musical mood.
- **Core loop (30-90s):** The voice describes a musical mood, the child stamps a color it feels like, then stamps a picture it feels like. Every choice is affirmed.
- **Rounds:** 4 pages: slow-soft, big-boomy, fast-tickly, gentle-sleepy.

## Shared assets used
- `shared/js/engines/observe-journal.js` - journal loop, splash, HUD, accepted stickers, recap, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, whoosh, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Real short music clips per mood in a future shared sound category.
- Painterly color swatches and picture sticker art for each mood.
- Recorded teacher-voice lines matching every spoken line in `config.js`.

## Interaction model
Tap a color swatch, then tap a picture sticker. The engine accepts every response because the game is expressive, not corrective.

## Feedback model
- **Success:** pop and sparkle SFX, a stamp animation, and a spoken line that validates the child's feeling.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** a recap parade reads back the finished sound painting.

## Difficulty progression
The mode cycles through contrasting moods so children hear and name different qualities: soft, big, quick, and sleepy.

## Replay variation
The same mood can receive different colors and pictures on later plays. The engine varies stamp placement slightly and supports deterministic debug seeding for review automation.
