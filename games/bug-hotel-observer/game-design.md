# Game Design Document - Bug Hotel Observer

## Game title
Bug Hotel Observer 🐞

## Category
`sensorial-science`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Practice patient observation of tiny creatures.
2. Learn names for common small garden visitors.
3. Notice simple behaviors such as munching, resting, and marching.

## Mini-games / modes

### Mode 1 - Who's Home?
- **Skill:** Identify common tiny garden guests.
- **Core loop (30-90s):** The child hears a quiet observation prompt, stamps who they notice, and hears a gentle fact-line.
- **Rounds:** 4 pages: ladybug, caterpillar, ant, spider/snail.

### Mode 2 - What Are They Doing?
- **Skill:** Observe simple animal behaviors.
- **Core loop (30-90s):** The child looks at a bug scene, stamps an action or gentle-observer habit, and hears a fact.
- **Rounds:** 3 pages: munching, resting, marching.

## Shared assets used
- `shared/js/engines/observe-journal.js` - journal loop, splash, HUD, accepted stickers, recap, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, whoosh, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Bug hotel scene art and guest sticker art.
- Behavior art for munching, resting, and marching.
- Recorded teacher-voice prompts and bug fact-lines matching `config.js`.

## Interaction model
Tap a large sticker to stamp the bug journal. The engine accepts every sticker because the learning goal is patient looking and naming, not testing.

## Feedback model
- **Success:** pop and sparkle SFX, a sticker stamp animation, and a spoken bug fact or gentle-observer line.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** the recap flips through the bug hotel guest book.

## Difficulty progression
The guest mode starts with obvious named visitors. The behavior mode shifts attention toward what a small creature is doing and how to observe it gently.

## Replay variation
The child can choose different guests or behaviors on replay. The engine varies stamp placement slightly and supports deterministic debug seeding for review automation.
