# Game Design Document - Picture Word Match

## Game title
Picture Word Match 🃏

## Category
`reading-phonics`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Match object pictures to printed CVC words.
2. Connect spoken word, visual meaning, and print.
3. Invite early decoding while keeping audio support available for pre-readers.

## Mini-games / modes

### Mode 1 - Match the Word
- **Skill:** Picture-to-print matching with familiar CVC words.
- **Core loop (30-90s):** The child taps a picture card and a word card. Both speak the same word, so the child can solve by listening while seeing the printed form.
- **Rounds:** 4 with `pairsPerRound: 2` and `difficultyRamp: true`.
- **Words:** cat, dog, sun, bus, hat, box, pig, cup.

### Mode 2 - More Words
- **Skill:** Picture-to-print matching with additional CVC words.
- **Core loop (30-90s):** Three picture-word pairs appear per round. The child hears and sees each card, then matches the picture to its printed word.
- **Rounds:** 4 with `pairsPerRound: 3`.
- **Words:** fox, jet, mop, hen, bug, van, log, net.

## Shared assets used
- `shared/js/engines/match-pairs.js` - matching loop, HUD, gentle retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, and tada effects.
- `shared/assets/objects/` - real CVC word picture cards.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font and word-card rendering.

## New assets needed
- Recorded teacher-voice word lines and prompts matching every line in `config.js`.

## Interaction model
Tap two cards that represent the same word: one picture and one printed word. The printed word is not required reading because every card speaks on tap.

## Feedback model
- **Success:** pop/sparkle SFX, a paired animation, and a spoken picture-word match line.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, and the same cards remain available.
- **Hint:** idle prompt replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, burst, and spoken cheer.

## Difficulty progression
Easy mode ramps from two visible pairs and stays focused on high-familiarity words. More Words uses three pairs per round for a slightly denser visual field.

## Replay variation
The engine shuffles pair order and card positions on each play. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
