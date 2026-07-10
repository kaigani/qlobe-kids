# Game Design Document - Sand Tray Letters

## Game title
Sand Tray Letters ✍️

## Category
`writing-fine-motor`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Practice early letter formation with large forgiving paths.
2. Link letter shapes to spoken letter sounds.
3. Build pre-writing control through round, wavy, zigzag, and curling motions.

## Mini-games / modes

### Mode 1 - Sand Letters
- **Skill:** Lowercase letter formation and letter-sound link.
- **Core loop (30-90s):** The child follows a sparkle and finger emoji along one sandy letter path. On completion the game speaks the letter sound and celebrates the written letter.
- **Rounds:** 5.
- **Paths:** c, o, s, l, u.
- **Notes:** These are beta, single-stroke-friendly approximations. The production pass needs reviewed formation data for all 26 letters.

### Mode 2 - Sand Shapes
- **Skill:** Pre-writing curves, waves, zigzags, and curls.
- **Core loop (30-90s):** The child traces one large shape path in the sand, hears a short success line, then moves to the next path.
- **Rounds:** 4.
- **Paths:** circle, wavy line, zigzag, spiral-ish arc.

## Shared assets used
- `shared/js/engines/trace-path.js` - splash, mode selection, tracing input, retry, celebration, HUD, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.
- `shared/assets/ui/btn-home.png`, `btn-sound.png`, `btn-play.png` - engine HUD buttons.

## New assets needed
- Sand-texture background art.
- Production-quality letter-formation stroke data for all 26 lowercase letters.
- Recorded teacher-voice lines matching every line in `config.js`.

## Interaction model
Finger tracing on a large path. The shared trace-path engine scales coordinates to portrait and landscape, starts each stroke with a large marker, and keeps the path forgiving for small hands.

## Feedback model
- **Success:** sparkle/pop SFX, confetti-style burst, and a spoken completion line.
- **Retry:** off-path tracing pulses the guide and speaks a gentle nudge.
- **Hint:** the engine replays the prompt after an idle pause, and the HUD sound button repeats it.
- **Celebration:** end-of-mode tada and a spoken cheer.

## Difficulty progression
Letter mode starts with rounded and simple letters, then shape mode broadens motor practice with waves, zigzags, and curls.

## Replay variation
Rounds stay short and predictable. Debug seeding remains available through `window.QLOBE_DEBUG.seed(n)` if shuffle is enabled later.
