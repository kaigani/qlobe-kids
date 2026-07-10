# Game Design Document - Problem-Solving Puppets

## Game title
Problem-Solving Puppets 🤝

## Category
`social-emotional`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Practice conflict repair strategies: share, take turns, use words, ask for help, say sorry, and include others.
2. Name feelings during a conflict before choosing an action.
3. Hear warm modeled language for common classroom friendship problems.

## Mini-games / modes

### Mode 1 - Make Peace
- **Skill:** Choosing a kind repair strategy for a conflict.
- **Core loop (30-90s):** The voice performs a two-puppet argument. The child taps a large strategy card such as share, take turns, use words, or ask for help.
- **Rounds:** 5.
- **Correctness:** All constructive repair cards are accepted so the mode stays exploratory and gentle.

### Mode 2 - How Do They Feel?
- **Skill:** Naming the feeling in a mid-conflict freeze frame.
- **Core loop (30-90s):** A cast portrait appears with a spoken freeze-frame clue. The child taps the matching feeling face.
- **Rounds:** 4 with `difficultyRamp: true`.

## Shared assets used
- `shared/js/engines/choose-one.js` - splash, modes, HUD, card choice loop, gentle retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta puppet lines.
- `shared/js/sfx.js` - synthesized tick, pop, sparkle, boing, and tada sounds.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.
- `shared/characters/` - Maya, Leo, Nia, Sam, and Ravi as temporary puppet stand-ins.

## New assets needed
- Puppet duo art for crayon, tower, turn-taking, bump, and left-out scenes.
- Recorded argument and resolution performances with two distinct puppet voices.

## Interaction model
Tap one large answer card after a spoken scene. Cards are emoji placeholders on the shared choose-one engine's soft rounded card surface.

## Feedback model
- **Success:** pop/sparkle SFX, card bounce, spoken repair modeling.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, then the scene repeats.
- **Celebration:** end-of-mode tada, confetti-style burst, spoken cheer, and play-again button.

## Difficulty progression
Make Peace keeps all repair choices valid. How Do They Feel ramps from fewer feeling choices toward four.

## Replay variation
The engine shuffles round and answer order each play. Review automation can seed the engine with `window.QLOBE_DEBUG.seed(n)`.
