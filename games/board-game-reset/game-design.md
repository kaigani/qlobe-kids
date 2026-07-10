# Game Design Document - Board Game Reset

## Game title
Board Game Reset 🎲

## Category
`social-emotional`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Practice good-sport words for winning and losing.
2. Choose warm repair moves when games feel disappointing or get bumped.
3. Treat cleanup as part of playing a board game.

## Mini-games / modes

### Mode 1 - Good Sport
- **Skill:** Winning and losing graciously.
- **Core loop (30-90s):** The voice describes a board-game ending. The child taps the good-sport move.
- **Rounds:** 5 with `difficultyRamp: true`.

### Mode 2 - Clean-Up Crew
- **Skill:** Cleaning up pieces, box, and shelf.
- **Core loop (30-90s):** The voice asks what belongs in the reset step. The child taps pieces, box, or shelf.
- **Rounds:** 3.

## Shared assets used
- `shared/js/engines/choose-one.js` - choose-one loop, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.
- `shared/characters/` - Nia as a temporary friend portrait.

## New assets needed
- Board-game scene art for winning, losing, knocked board, and cleanup.
- Recorded voice lines that warmly model "good game," "rematch please," "it is okay," and cleanup narration.

## Interaction model
Tap one large answer card after a spoken scenario. The current art is emoji-only placeholder art.

## Feedback model
- **Success:** pop/sparkle SFX, card bounce, and a spoken good-sport model.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, then the scenario repeats.
- **Celebration:** end-of-mode tada, confetti-style burst, spoken cheer, and play-again button.

## Difficulty progression
Good Sport ramps from fewer choices toward three. Clean-Up Crew has three concrete cleanup prompts.

## Replay variation
The engine shuffles round and answer order each play. A future engine option would be needed to enforce strict cleanup-step order without custom code.
