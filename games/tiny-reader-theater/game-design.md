# Game Design Document - Tiny Reader Theater

## Game title
Tiny Reader Theater 🎭

## Category
`reading-phonics`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Use context to select a decodable word.
2. Connect short printed word cards to familiar object pictures.
3. Join the story through movement and oral retelling.

## Mini-games / modes

### Mode 1 - Fill the Story
- **Skill:** Context-based decoding of short CVC words.
- **Core loop (30-90s):** The child hears a one-line story with a missing word and taps the word card that completes it.
- **Rounds:** 5.

### Mode 2 - Act It Out
- **Skill:** Story participation and character comprehension.
- **Core loop (30-90s):** The child hears an action question, chooses who did it, and is invited to act it out.
- **Rounds:** 4.

## Shared assets used
- `shared/js/engines/choose-one.js` - choose-one interaction loop, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.
- `shared/assets/objects/cat.png`, `sun.png`, `bus.png`, `dog.png`, `hat.png`, `mud.png` - existing shared object cards.

## New assets needed
- Theater-stage frame art.
- Recorded story lines and dramatic acting prompts.

## Interaction model
Tap one large card after a spoken theater line. In `stories`, the answers are text cards; in `act`, the answers are animal/character picture cards.

## Feedback model
- **Success:** pop/sparkle SFX, bounce, and spoken praise inviting acting.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, and the same story prompt again.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, confetti-style burst, and spoken curtain-call cheer.

## Difficulty progression
`Fill the Story` uses familiar CVC word cards with clear picture context. `Act It Out` shifts from word completion to listening for who performed an action.

## Replay variation
The engine shuffles round order and answer order on each play. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
