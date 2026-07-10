# Game Design Document - Plan-Do-Review

## Game title
Plan-Do-Review 📋

## Category
`social-emotional`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Connect a chosen intention to real action.
2. Reflect on how work felt after doing it.
3. Practice planning for tomorrow and telling another person.

## Mini-games / modes

### Mode 1 - Plan It, Do It!
- **Skill:** Intention to action to reflection.
- **Core loop (30-90s):** The child taps a plan card, hears an invitation to do it in the real room, then taps a review card.
- **Rounds:** 3: plan, do, review.
- **Correctness:** All answers are valid and accepted.

### Mode 2 - Plan for Tomorrow
- **Skill:** Future planning and sharing the plan with someone.
- **Core loop (30-90s):** The child taps a tomorrow plan, then taps who they might tell.
- **Rounds:** 2.
- **Correctness:** All answers are valid and accepted.

## Shared assets used
- `shared/js/engines/choose-one.js` - choose-one loop, HUD, retry, celebration, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.
- `shared/characters/` - Maya as a temporary planning helper.

## New assets needed
- Planning-board art for plan, do, review phases.
- Recorded reflective voice lines for plan choices, real-world doing prompts, and review affirmations.

## Interaction model
Tap one large card after a spoken plan, do, review, or tomorrow prompt. The answer art uses emoji placeholders until production cards exist.

## Feedback model
- **Success:** all cards pop and sparkle, then a spoken line affirms the child's choice.
- **Retry:** not expected in all-valid rounds, but the engine still supplies gentle nudge behavior if future data adds distractors.
- **Celebration:** end-of-mode tada, confetti-style burst, spoken cheer, and play-again button.

## Difficulty progression
This stub does not increase difficulty. It keeps the loop short and predictable.

## Replay variation
The choose-one engine shuffles round and answer order each play. A future custom layer or engine option would be needed to enforce strict plan-do-review order or a 30-second timer.
