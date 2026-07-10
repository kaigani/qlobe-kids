# Game Design Document - Counting Treasure Cups

## Game title
Counting Treasure Cups 🏴‍☠️

## Category
`math-number-sense`

## Engine
`tap-count`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Premise
Pirate treasure! The child puts exactly the asked number of treasures into the cup or chest.

## Learning goals
1. Count quantities from 1 to 10.
2. Practice one-to-one correspondence: one tap, one object, one spoken count.
3. Build cardinality: the final spoken count is the amount collected.

## Mini-games / modes

### Mode 1 - Fill the Cup
- **Skill:** Count 2, 3, 4, 5, and 6 gems into a treasure cup.
- **Core loop (30-90s):** The child hears the target number, taps that many gem cards, and watches each gem fly into the cup while the engine counts aloud.
- **Rounds:** 5, `type: collect`, `difficultyRamp: true`.
- **Prompt style:** "Can you put three gems in the treasure cup?"
- **Placeholder art:** `emoji:💎` gems into `emoji:🏆` cup.

### Mode 2 - Big Treasure
- **Skill:** Count larger quantities: 6, 7, 8, and 10.
- **Core loop (30-90s):** The child taps coins into a chest, hearing the count after every tap.
- **Rounds:** 4, `type: collect`.
- **Prompt style:** "Big treasure! Put seven coins in the chest."
- **Placeholder art:** `emoji:🪙` coins into `emoji:🧰` chest.

## Shared assets used
- `shared/js/engines/tap-count.js` - splash, mode menu, tap-to-collect loop, HUD, retry-safe input, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, whoosh, sparkle, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Gem, coin, treasure cup, and treasure chest art in the shared visual style.
- Recorded teacher-voice prompt and count lines matching `config.js`.

## Interaction model
Tap treasure cards. Each accepted tap animates the card into the target, plays tactile SFX, and speaks the next count. The engine locks input during each short flight so rapid tapping cannot over-count.

## Feedback model
- **Success:** sparkle SFX, burst, spoken total, and automatic next round.
- **Retry floor:** the engine ignores unavailable targets and replays the prompt from the HUD or idle timer without harsh failure states.
- **Hint:** the sound button and idle prompt repeat the target number.

## Difficulty progression
Fill the Cup ramps from 2 to 6. Big Treasure introduces larger totals up to 10.

## Future v2 notes
Production art can replace emoji refs in `config.js`. No code change should be needed.
