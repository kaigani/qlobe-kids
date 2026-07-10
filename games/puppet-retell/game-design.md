# Game Design Document - Puppet Retell

## Game title
Puppet Retell 🧸

## Category
`oral-storytelling`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Recall familiar story moments.
2. Correct mixed-up narrative details.
3. Practice confident oral retelling with real toys.

## Mini-games / modes

### Mode 1 - Fix the Story
- **Skill:** Story recall and narrative correction.
- **Core loop (30-90s):** A puppet retells a famous tale badly, and the child taps what really happened.
- **Rounds:** 5.

### Mode 2 - Whose Line?
- **Skill:** Matching famous story lines to characters.
- **Core loop (30-90s):** The child hears a familiar line or clue and taps the character who said or did it.
- **Rounds:** 4.

## Shared assets used
- `shared/js/engines/choose-one.js` - choose-one interaction loop, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.
- `shared/assets/objects/pig.png` - existing shared pig card.

## New assets needed
- Puppet character art.
- Story scene cards for Goldilocks, Three Pigs, Red Riding Hood, Gingerbread Man, and Three Bears.
- Recorded puppet voices with comic retell performances.

## Interaction model
Tap one large picture card after a spoken puppet prompt. The prompt and card pictures carry the interaction, so reading is not required.

## Feedback model
- **Success:** pop/sparkle SFX, bounce, and spoken praise inviting retell.
- **Retry:** gentle wiggle, boing SFX, spoken puppet-mix-up nudge, and the same prompt again.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, confetti-style burst, and spoken cheer inviting toy retelling.

## Difficulty progression
`Fix the Story` asks for concrete story events with silly distractors. `Whose Line?` asks the child to match short oral lines to characters.

## Replay variation
The engine shuffles round order and answer order on each play. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
