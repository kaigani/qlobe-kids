# Game Design Document - Chalkboard Big Strokes

## Game title
Chalkboard Big Strokes 🖍️

## Category
`writing-fine-motor`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Practice large-arm pre-writing strokes.
2. Build control across loops, waves, lines, circles, and zigzags.
3. Sequence two-part strokes for cross, T, and X forms.

## Mini-games / modes

### Mode 1 - Big Strokes
- **Skill:** Large pre-writing stroke control.
- **Core loop (30-90s):** The child follows the chalk path with one finger, then hears a short prompt to try the stroke in the air too.
- **Rounds:** 5.
- **Paths:** tall line, big loop, wave, mountain zigzag, giant circle.

### Mode 2 - Two-Part Strokes
- **Skill:** Multi-stroke sequencing.
- **Core loop (30-90s):** The child traces one stroke, then the engine moves the active marker to the next stroke. Completion celebrates the full two-part shape.
- **Rounds:** 3.
- **Paths:** cross, T, X.

## Shared assets used
- `shared/js/engines/trace-path.js` - tracing loop, multi-stroke support, splash, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.
- `shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png` - engine HUD buttons.

## New assets needed
- Chalkboard background art.
- Chalk-dust particle idea or texture treatment.
- Recorded teacher-voice lines matching every line in `config.js`.

## Interaction model
Finger tracing on oversized paths. For the double-stroke mode, the trace-path engine advances from the first stroke to the second with a new start marker.

## Feedback model
- **Success:** pop/sparkle SFX, confetti-style burst, and a spoken movement line.
- **Retry:** off-path tracing pulses the guide and speaks a gentle nudge.
- **Hint:** idle replay and HUD sound replay.
- **Celebration:** end-of-mode tada and a prompt to try a stroke in the air.

## Difficulty progression
The first mode uses broad single gestures. The second mode adds sequencing and direction changes without adding reading.

## Replay variation
The stroke set is fixed for motor familiarity. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` if shuffle is enabled later.
