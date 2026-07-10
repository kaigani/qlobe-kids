# Game Design Document - Song Story Remix

## Game title
Song Story Remix 🎤

## Category
`art-music`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Play with rhyme, rhythm, and repeated verse structure.
2. Match sound words to animals and silly riders.
3. Encourage call-and-response singing without requiring reading.

## Mini-games / modes

### Mode 1 - Remix the Farm
- **Skill:** Song verse and animal sound play.
- **Core loop (30-90s):** The child hears an Old MacDonald-style remix clue and taps the animal that completes the verse.
- **Rounds:** 5.

### Mode 2 - Remix the Bus
- **Skill:** Song verse and rider sound play.
- **Core loop (30-90s):** The child hears a Wheels on the Bus-style remix clue and taps the rider making that sound on the bus.
- **Rounds:** 4.

## Shared assets used
- `shared/js/engines/choose-one.js` - choose-one interaction loop, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Toy-style remix cards for T-Rex, octopus, lion, frog, duck, elephant, ghost, robot, and bus.
- Recorded sung remix lines for every animal and rider verse.
- Optional backing jingle loops for farm and bus modes.

## Interaction model
Tap one answer card after a spoken song clue. The engine keeps answer cards large, offers a replay-sound button, and requires no reading for gameplay.

## Feedback model
- **Success:** pop/sparkle SFX, a brief bounce, and spoken remix praise.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, and the same prompt again.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, confetti-style burst, and spoken cheer.

## Difficulty progression
Both modes use short fixed rounds with four answer choices. The challenge is hearing the character and sound word inside the song clue.

## Replay variation
The engine shuffles round order and answer order on each play. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
