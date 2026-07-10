# Game Design Document - Sandpaper Number Match

## Game title
Sandpaper Number Match 🔢

## Category
`math-number-sense`

## Engine
`tap-count`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Premise
The child meets each numeral, hears its number word, and taps that many objects. The big numeral card rendered by the `tap-count` engine is the star of every round.

## Learning goals
1. Recognize numerals 1-9.
2. Connect numeral shapes to spoken number words.
3. Match each numeral with a counted quantity.

## Mini-games / modes

### Mode 1 - Meet the Numbers
- **Skill:** Numeral recognition for 1-5.
- **Core loop (30-90s):** A large numeral appears. The voice names it, then the child taps that many round buttons.
- **Rounds:** 5, `type: collect`, `difficultyRamp: true`.
- **Prompt style:** "This is three! Tap three buttons!"
- **Placeholder art:** Engine numeral card plus `emoji:🔘` buttons into `emoji:🧺` tray.

### Mode 2 - Bigger Numbers
- **Skill:** Numeral recognition for 6-9.
- **Core loop (30-90s):** A large numeral appears. The child taps the matching number of stars into a jar.
- **Rounds:** 4, `type: collect`.
- **Prompt style:** "This is seven! Tap seven stars!"
- **Placeholder art:** Engine numeral card plus `emoji:⭐` stars into `emoji:🫙` jar.

## Shared assets used
- `shared/js/engines/tap-count.js` - large numeral card, splash, collect loop, HUD, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, whoosh, sparkle, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Tactile sandpaper-numeral art for numerals 1-9.
- Round button, tray, star, and jar art in the shared visual style.
- Recorded teacher-voice lines matching every prompt and count line in `config.js`.

## Interaction model
Tap the quantity objects that match the big numeral. The engine speaks every count and moves each object into the target, keeping the loop concrete and reversible at the round level.

## Feedback model
- **Success:** sparkle SFX, burst, spoken counted total, and next round.
- **Retry floor:** no red X or buzzer; unavailable taps are ignored, and the sound button or idle prompt repeats the model.
- **Hint:** the visible numeral remains on screen throughout the round.

## Difficulty progression
Meet the Numbers ramps from 1 to 5. Bigger Numbers introduces 6, 7, 8, and 9.

## Future v2 notes
Finger-tracing the sandpaper numeral belongs in a future `trace-path` engine upgrade. The current stub records that need in `ASSETS.md` and keeps this implementation on `tap-count`.
