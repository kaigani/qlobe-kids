# Game Design Document - Grace & Courtesy Theater

## Game title
Grace & Courtesy Theater 🎩

## Category
`social-emotional`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Practice common grace-and-courtesy phrases: please, thank you, excuse me, and sorry.
2. Choose kind actions for waiting, helping, inviting, and sharing.
3. Hear warm spoken models for social problem solving without reading.

## Mini-games / modes

### Mode 1 - What Do We Say?
- **Skill:** Kind social phrases.
- **Core loop (30-90s):** A shared cast portrait appears while the voice performs a short social scene and a kind line. The child taps the matching speech-choice emoji.
- **Rounds:** 6 with `difficultyRamp: true`.

### Mode 2 - Kind or Not?
- **Skill:** Recognizing helpful actions.
- **Core loop (30-90s):** The voice describes a playground or classroom moment. The child taps the picture action that would feel kind.
- **Rounds:** 4.

## Shared assets used
- `shared/js/engines/choose-one.js` - choose-one interaction loop, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.
- `shared/characters/` - Maya, Leo, Nia, Sam, and Ravi placeholder cast portraits.

## New assets needed
- Situation scene art showing the cast in the manners theater.
- Recorded teacher-voice performances for every prompt, nudge, praise, and cheer line in `config.js`.

## Interaction model
Tap one large answer card after a spoken scene. The engine provides the replay button, idle replay, large touch targets, and gentle retry loop.

## Feedback model
- **Success:** pop/sparkle SFX, card bounce, and spoken warm praise.
- **Retry:** gentle wiggle, boing SFX, "Hmm, how would THAT feel?", then the scene repeats.
- **Celebration:** end-of-mode tada, confetti-style burst, spoken cheer, and play-again button.

## Difficulty progression
The manners mode ramps from two answer cards toward three. The helping mode stays short with concrete action pictures.

## Replay variation
Round order and answer order shuffle each play. Review automation can seed the engine with `window.QLOBE_DEBUG.seed(n)`.
