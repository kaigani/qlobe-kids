# Game Design Document - Number Line Jump

## Game title
Number Line Jump 🐸

## Category
`math-number-sense`

## Engine
`tap-count`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Premise
Help the frog hop. Each tapped lily pad is one jump, and the game counts each jump aloud.

## Learning goals
1. Link movement words with counting.
2. Practice one-to-one counting from 2 to 6.
3. Notice "how many are left" after hopping back from five.

## Mini-games / modes

### Mode 1 - Frog Hops
- **Skill:** Movement-linked counting 2-6.
- **Core loop (30-90s):** The child hears a jump target, taps that many lily pads, and watches each pad fly to the frog while the count is spoken.
- **Rounds:** 5, `type: collect`, `difficultyRamp: true`.
- **Prompt style:** "Can you do three big frog jumps?"
- **Placeholder art:** `emoji:🪷` lily pads into `emoji:🐸` frog.
- **Engine note:** The collect flight animation reads as the frog hop for this stub.

### Mode 2 - Hop Home
- **Skill:** Take away 1, 2, or 3 from five and count what remains.
- **Core loop (30-90s):** Five lily pads appear. The child taps the number of pads the frog hops back, then the engine counts the remaining pads aloud.
- **Rounds:** 3, `type: takeaway`.
- **Prompt style:** "Hop back two pads! How many pads are left?"
- **Placeholder art:** `emoji:🪷` lily pads and `emoji:🐸` frog.

## Shared assets used
- `shared/js/engines/tap-count.js` - collect and takeaway loops, counting voice, HUD, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, silly, whoosh, sparkle, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Frog character art with hop poses.
- Lily pad object art.
- Optional pond/number-line backdrop if the engine later supports a spatial line layout.
- Recorded teacher-voice lines matching every prompt and count line in `config.js`.

## Interaction model
Tap lily pad cards. In Frog Hops, each tapped pad flies to the frog as a hop. In Hop Home, tapped pads are removed and the engine counts the pads left.

## Feedback model
- **Success:** sparkle SFX, burst, spoken total or remainder, and automatic next round.
- **Retry floor:** no harsh failure; unavailable taps are ignored, and prompts can be replayed by the HUD or idle timer.
- **Hint:** the target number remains visible in the large numeral card.

## Difficulty progression
Frog Hops ramps from 2 to 6. Hop Home keeps the start fixed at five and varies the hop-back amount from 1 to 3.

## Future v2 notes
A future custom layer or number-line engine could place lily pads on a true line and move the frog along it. The current stub stays within the `tap-count` contract.
