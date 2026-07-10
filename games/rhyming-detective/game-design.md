# Game Design Document - Rhyming Detective

## Game title
Rhyming Detective 🔍

## Category
`reading-phonics`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Hear when two spoken CVC words rhyme.
2. Notice shared ending sounds without needing to read.
3. Build phonological awareness through picture matching and spoken modeling.

## Mini-games / modes

### Mode 1 - Find the Rhymes
- **Skill:** Rhyme awareness with familiar CVC pictures.
- **Core loop (30-90s):** The child taps two picture cards. Each card speaks its word, and matching cards celebrate with a spoken line such as "Cat rhymes with hat!"
- **Rounds:** 4 with `pairsPerRound: 3` and `difficultyRamp: true`.
- **Pairs:** cat/hat, dog/log, sun/bun, pig/wig, van/pan, box/fox, jet/net, mop/top, bug/rug, hen/pen.

### Mode 2 - Tricky Rhymes
- **Skill:** Rhyme discrimination with less obvious CVC pictures.
- **Core loop (30-90s):** Four rhyme pairs appear per round. The child relies on tap-to-hear card speech and matching ending sounds.
- **Rounds:** 3 with `pairsPerRound: 4`.
- **Pairs:** rat/bat, jam/ham, cot/pot, cub/tub, bag/tag, cap/nap, hug/mug, sad/mad.

## Shared assets used
- `shared/js/engines/match-pairs.js` - matching loop, HUD, gentle retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, and tada effects.
- `shared/assets/objects/` - real CVC word picture cards.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Recorded teacher-voice lines matching every line in `config.js`.

## Interaction model
Tap two cards that rhyme. The engine keeps all cards at large touch sizes, speaks each card on tap, and provides the HUD sound button for a repeated prompt.

## Feedback model
- **Success:** pop/sparkle SFX, a paired animation, and the rhyme sentence.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, and the same cards remain available.
- **Hint:** idle prompt replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, burst, and spoken cheer.

## Difficulty progression
Classic mode ramps from two visible pairs toward three. Tricky mode uses four pairs per round from the start for children ready for a denser auditory-memory challenge.

## Replay variation
The engine shuffles pair order and card positions on each play. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
