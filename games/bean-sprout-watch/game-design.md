# Game Design Document - Bean Sprout Watch

## Game title
Bean Sprout Watch 🌱

## Category
`sensorial-science`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Observe growth over time through a simple day-by-day journal.
2. Use plant words such as bean, root, sprout, stem, leaf, water, and sunlight.
3. Connect plant needs to gentle real-world care.

## Mini-games / modes

### Mode 1 - Sprout Diary
- **Skill:** Observe plant growth over time.
- **Core loop (30-90s):** The child hears a day prompt, looks at the sprout scene, stamps what changed, then stamps a care need.
- **Rounds:** 5 pages: bean, root, sprout, leaves, bigger plant.

### Mode 2 - What Does It Need?
- **Skill:** Match plant cues to care needs.
- **Core loop (30-90s):** The child sees a plant care scene, stamps a helper, and hears a gentle care explanation.
- **Rounds:** 3 pages: thirsty, needs light, dry paper.

## Shared assets used
- `shared/js/engines/observe-journal.js` - journal loop, splash, HUD, accepted stickers, recap, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, whoosh, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Bean-in-jar growth stage art and care-state scene art.
- Sticker art for plant parts and plant needs.
- Recorded teacher-voice lines matching every spoken line in `config.js`.

## Interaction model
Tap a large sticker to stamp it onto the current journal page. Every sticker is valid because the goal is careful noticing and care language, not right/wrong quiz behavior.

## Feedback model
- **Success:** pop and sparkle SFX, a sticker stamp animation, and a spoken observation or care line.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** the recap flips through the sprout growth story.

## Difficulty progression
The diary moves from obvious visible change to applying care thinking. The care mode focuses the same observation loop on plant needs.

## Replay variation
The child can stamp different observations each time. The engine varies stamp placement slightly and supports deterministic debug seeding for review automation.
