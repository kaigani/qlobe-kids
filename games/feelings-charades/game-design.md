# Game Design Document - Feelings Charades

## Game title
Feelings Charades 🎭

## Category
`social-emotional`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Name emotions from body, voice, and situation cues.
2. Match feelings like proud, frustrated, calm, and worried to everyday experiences.
3. Encourage playful acting of feelings without any harsh failure state.

## Mini-games / modes

### Mode 1 - Guess the Feeling
- **Skill:** Naming emotions from acted cues.
- **Core loop (30-90s):** A cast portrait appears while the voice acts a feeling with body clues. The child taps the matching emoji face.
- **Rounds:** 6 with `difficultyRamp: true`.

### Mode 2 - Show the Feeling
- **Skill:** Matching a named feeling to a likely situation.
- **Core loop (30-90s):** The voice names a feeling and asks when it might happen. The child taps the situation picture, then hears a prompt to act the feeling big.
- **Rounds:** 4.

## Shared assets used
- `shared/js/engines/choose-one.js` - choose-one interaction loop, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.
- `shared/characters/` - Maya, Leo, Nia, Sam, and Ravi placeholder cast portraits.

## New assets needed
- Emotion-pose art for each cast member showing the target feelings.
- Recorded acted prompts with clear, playful feeling performances.

## Interaction model
Tap one large answer card after an acted spoken clue. The prompt art is a character portrait or feeling emoji; answers are emoji faces or concrete situations.

## Feedback model
- **Success:** pop/sparkle SFX, card bounce, spoken praise, and an invitation to show the feeling.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, then the clue repeats.
- **Celebration:** end-of-mode tada, confetti-style burst, spoken cheer, and play-again button.

## Difficulty progression
The guessing mode ramps from two answer cards toward four. Situation matching stays at three concrete choices.

## Replay variation
Round order and answer order shuffle each play. Review automation can seed the engine with `window.QLOBE_DEBUG.seed(n)`.
