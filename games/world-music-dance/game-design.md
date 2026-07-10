# Game Design Document - World Music Dance

## Game title
World Music Dance 💃

## Category
`culture-geography`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Build curiosity about music traditions from around the world.
2. Match broad place symbols to narrated music clues.
3. Move to rhythm words: stomp, sway, spin, and bounce.

## Mini-games / modes

### Mode 1 - Where's That Music?
- **Skill:** Music-place awareness.
- **Core loop (30-90s):** The child hears a lively music description, sees an instrument prompt, and taps the place card where that music clue belongs.
- **Rounds:** 5.

### Mode 2 - Dance Along
- **Skill:** Rhythm vocabulary and movement matching.
- **Core loop (30-90s):** The child hears a rhythm description and taps the movement card that best fits. Success praise includes a dance instruction.
- **Rounds:** 4.

## Shared assets used
- `shared/js/engines/choose-one.js` - choose-one interaction loop, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, boing, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Text-free map-card art for Africa, Mexico, Scotland, India, and Japan.
- Production instrument art for drum, trumpet, bagpipes, sitar, taiko drum, and shaker.
- Real music clips for West African drumming, mariachi, bagpipes, sitar, and taiko.
- Recorded teacher-voice lines matching every line in `config.js`.

## Interaction model
Tap one answer card after a spoken music or movement clue. The engine keeps answer cards large, offers a replay-sound button, and requires no reading for gameplay.

## Feedback model
- **Success:** pop/sparkle SFX, a brief bounce, and spoken praise that invites a movement.
- **Retry:** gentle wiggle, boing SFX, spoken nudge, and the same prompt again.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** end-of-mode tada, confetti-style burst, and spoken cheer.

## Difficulty progression
The place mode uses five short fixed rounds. The movement mode keeps four clear movement choices so the challenge stays about listening to rhythm words.

## Replay variation
The engine shuffles round order and answer order on each play. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` for review automation.
