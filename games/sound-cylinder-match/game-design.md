# Game Design Document - Sound Cylinder Match

## Game title
Sound Cylinder Match 🔊

## Category
`sensorial-science`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Hear whether two sounds are the same or different.
2. Hold a sound in memory while trying another mystery shaker.
3. Match by ear instead of by sight.

## Mini-games / modes

### Mode 1 - Same Sound
- **Skill:** Auditory discrimination and auditory memory.
- **Core loop (30-90s):** Every card looks like the same mystery shaker. Tapping a card speaks its sound. The child finds the second shaker with the same sound.
- **Rounds:** 3 with `pairsPerRound: 3` and `difficultyRamp: true`.
- **Pairs:** shicka shicka, boom boom, ting-a-ling, shhh shhh, clack clack, ping.

## Shared assets used
- `shared/js/engines/match-pairs.js` - matching loop, HUD, gentle retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta sound words and prompts.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Real shaker-cylinder art set where all cards look visually identical.
- Recorded sound-effect clips for each sound category under a future shared `shared/assets/sounds/` category.
- Recorded teacher-voice prompts matching every line in `config.js`.

## Interaction model
Tap two visually identical shakers. The only meaningful differentiator is the spoken sound on tap, so the game practices listening rather than visual matching.

## Feedback model
- **Success:** pop/sparkle SFX, a paired animation, and the matched sound line.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, and the same cards remain available.
- **Hint:** idle prompt replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, burst, and spoken cheer.

## Difficulty progression
The mode ramps from two visible pairs toward three pairs across three rounds. Every visible card uses the same placeholder art intentionally.

## Replay variation
The engine shuffles pair order and card positions on each play. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
