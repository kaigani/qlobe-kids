# Game Design Document - Calm Corner Cards

## Game title
Calm Corner Cards 🧘

## Category
`social-emotional`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Recognize calm-down tools for big feelings.
2. Practice slow breath, self-hug squeeze, counting, and quiet drawing as regulation strategies.
3. Experience calm choices as supportive tools rather than right-or-wrong tests.

## Mini-games / modes

### Mode 1 - Pick a Calm Tool
- **Skill:** Choosing self-regulation tools.
- **Core loop (30-90s):** A cast member has an overwhelmed moment. The child taps a calm tool card, and the voice guides a short body-settling practice.
- **Rounds:** 4.

### Mode 2 - Balloon Breathing
- **Skill:** Slow paced breathing.
- **Core loop (30-90s):** The voice guides one balloon breath. The child chooses the next balloon size/color to keep the breathing practice playful.
- **Rounds:** 3.

## Shared assets used
- `shared/js/engines/choose-one.js` - choose-one interaction loop, splash, HUD, all-correct answer support through config data, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.
- `shared/characters/` - Maya, Leo, Nia, and Ravi placeholder cast portraits.

## New assets needed
- Calm-corner scene art for overwhelmed moments and tool practice.
- Production calm tool cards for balloon breaths, self-hug squeeze, count to five, and quiet drawing.
- Recorded guided-breathing lines with slow, spacious pacing.

## Interaction model
Tap one large tool or balloon card after a spoken scenario. In the tools mode, every offered tool is marked correct so the engine accepts all choices gently.

## Feedback model
- **Success:** pop/sparkle SFX, card bounce, and a short guided calming line.
- **Retry:** not used in the tools mode because all calm tools are accepted. The engine nudge remains configured for future off-target variants.
- **Celebration:** end-of-mode tada, confetti-style burst, spoken cheer, and play-again button.

## Difficulty progression
The tools mode offers four concrete regulation choices. Balloon Breathing keeps the loop short with three follow-along rounds.

## Replay variation
Round order and answer order shuffle each play. Review automation can seed the engine with `window.QLOBE_DEBUG.seed(n)`.
