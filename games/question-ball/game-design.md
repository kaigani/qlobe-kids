# Game Design Document - Question Ball

## Game title
Question Ball 🏐

## Category
`oral-storytelling`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Understand who, what, where, and why questions through oral prompts.
2. Match spoken questions to picture answers without requiring reading.
3. Hear simple full-sentence models for why answers.

## Mini-games / modes

### Mode 1 - Catch the Question
- **Skill:** Who, what, and where question comprehension.
- **Core loop (30-90s):** The question ball rolls in through a spoken prompt. The child looks at the scene emoji, listens for the question word, and taps the answer picture.
- **Rounds:** 6 with `difficultyRamp: true`.

### Mode 2 - Why Questions
- **Skill:** Matching why questions to simple reasons.
- **Core loop (30-90s):** The voice asks and models a short full-sentence why answer, then the child taps the picture that represents the reason.
- **Rounds:** 4.

## Shared assets used
- `shared/js/engines/choose-one.js` - choose-one interaction loop, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Bouncy ball character or mascot production art to replace `emoji:🏐`.
- Production scene art for question prompts.
- Recorded teacher-voice question and answer-model lines matching every line in `config.js`.

## Interaction model
Tap one answer card after a spoken question. The engine keeps answer cards large, includes a replay button, and never requires the child to read instructional text.

## Feedback model
- **Success:** pop/sparkle SFX, bounce, and spoken praise.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, and the same question again.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, confetti-style burst, spoken cheer, and a real-family question prompt.

## Difficulty progression
`Catch the Question` ramps from two answer cards toward three. `Why Questions` stays short and uses concrete reason pictures.

## Replay variation
The engine shuffles round order and answer order on each play. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
