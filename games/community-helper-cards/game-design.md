# Game Design Document - Community Helper Cards

## Game title
Community Helper Cards 🚒

## Category
`culture-geography`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Name familiar community helpers and helper tools.
2. Connect a role with the object, vehicle, or living thing they use or help.
3. Build spoken who-helps-how vocabulary with gentle repetition.

## Mini-games / modes

### Mode 1 - Who Uses What?
- **Skill:** Community helper tools and roles.
- **Core loop (30-90s):** The child taps a helper card, hears the helper name, then taps the tool or vehicle that belongs with that helper.
- **Rounds:** 4 with `pairsPerRound: 3` and `difficultyRamp: true`.
- **Pairs:** firefighter/extinguisher, doctor/stethoscope, chef/pan, teacher/books, farmer/tractor, police officer/police car, mailbox/letter, builder/hammer.

### Mode 2 - Where Do They Work?
- **Skill:** Helper work contexts and vehicles.
- **Core loop (30-90s):** The child matches a helper with a vehicle, tool, or work buddy. This stays visual and concrete while hinting at work settings.
- **Rounds:** 3 with `pairsPerRound: 3`.
- **Pairs:** astronaut/rocket, dentist/tooth, pilot/plane, veterinarian/dog.

## Shared assets used
- `shared/js/engines/match-pairs.js` - matching loop, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, unpop, sparkle, boing, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Cast-style helper character art for firefighter, doctor, chef, teacher, farmer, police officer, mail carrier or mailbox, builder, astronaut, dentist, pilot, and veterinarian.
- Matching tool, vehicle, and work-buddy card art.
- Recorded teacher-voice lines matching every line in `config.js`.

## Interaction model
Tap two cards that belong together. Tapping any card names it first, so the game can teach vocabulary before the child finishes the pair.

## Feedback model
- **Success:** pop/sparkle SFX, matched-card animation, and a spoken helper sentence.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, and the cards remain available.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, confetti-style burst, and spoken cheer.

## Difficulty progression
The first helper rounds show two pairs, then ramp to three pairs. The work-context mode keeps three pairs per round with a smaller pair set.

## Replay variation
The engine shuffles pair order and card order on each play. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
