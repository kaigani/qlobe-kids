# Game Design Document - Joke Workshop

## Game title
Joke Workshop 🤡

## Category
`oral-storytelling`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Anticipate a punchline from a spoken setup.
2. Notice simple wordplay and picture clues.
3. Practice retelling short, kid-classic jokes.

## Mini-games / modes

### Mode 1 - Finish the Joke
- **Skill:** Punchline anticipation and wordplay.
- **Core loop (30-90s):** The child hears a familiar joke setup, taps the picture punchline, and gets a warm joke-workshop payoff.
- **Rounds:** 5.

### Mode 2 - Knock Knock
- **Skill:** Call-and-response joke comprehension.
- **Core loop (30-90s):** The child hears a short knock-knock exchange and taps the picture that completes the joke.
- **Rounds:** 4.

## Shared assets used
- `shared/js/engines/choose-one.js` - choose-one interaction loop, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Joke-card art for each setup and punchline.
- Recorded joke performances for setup lines, wrong-pick nudge, success lines, and full joke retells.

## Interaction model
Tap one large picture card after a spoken joke prompt. The child can replay the prompt with the sound HUD button and does not need to read.

## Feedback model
- **Success:** pop/sparkle SFX, bounce, and spoken praise.
- **Retry:** gentle wiggle, boing SFX, the exact silly nudge, and the same setup again.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, confetti-style burst, and spoken cheer inviting real-world retelling.

## Difficulty progression
The first mode uses clear picture punchlines with very silly distractors. Knock-knock rounds preserve the call-and-response rhythm but keep the picture choice simple.

## Replay variation
The engine shuffles round order and answer order on each play. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
