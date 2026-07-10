# Game Design Document - Letter Road Driving

## Game title
Letter Road Driving 🚗

## Category
`writing-fine-motor`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Explore letter shapes through movement and direction.
2. Practice straight and angled uppercase forms.
3. Practice curved uppercase forms through playful racing.

## Mini-games / modes

### Mode 1 - Letter Roads
- **Skill:** Straight and angled uppercase letter shapes.
- **Core loop (30-90s):** The child drives the car emoji along a letter-shaped road, hears a car-themed completion line, then moves to the next road.
- **Rounds:** 5.
- **Paths:** L, Z, V, W, U.

### Mode 2 - Curvy Roads
- **Skill:** Curved uppercase letter shapes.
- **Core loop (30-90s):** The child races along a curvy letter road with the race car traveler, then hears a short celebration.
- **Rounds:** 4.
- **Paths:** S, C, J, O.

## Shared assets used
- `shared/js/engines/trace-path.js` - tracing loop, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.
- `shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png` - engine HUD buttons.

## New assets needed
- Road-texture stroke art.
- Tiny car sprites for road and race modes.
- Recorded teacher-voice lines matching every line in `config.js`.

## Interaction model
Finger tracing on large letter roads. The traveler is a car emoji placeholder, and the shared trace-path engine keeps the interaction forgiving for small hands.

## Feedback model
- **Success:** pop/sparkle SFX, burst animation, and a spoken letter-road line.
- **Retry:** off-road tracing pulses the guide and speaks a steering nudge.
- **Hint:** idle replay and HUD sound replay.
- **Celebration:** end-of-mode tada and a spoken final cheer.

## Difficulty progression
The first mode uses straight and angled roads. The second mode adds curved roads with a race car traveler.

## Replay variation
The road set is fixed for familiarity. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` if shuffle is enabled later.
