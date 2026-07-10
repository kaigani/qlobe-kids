# Game Design Document - Smell Jars

## Game title
Smell Jars 👃

## Category
`sensorial-science`

## Age target
5-6 (platform default).

## Concept video
_None yet._

## Learning goals
1. Build smell vocabulary with safe real kitchen items and a grown-up helper.
2. Practice gentle sniffing, guessing, revealing, and comparing clues.
3. Affirm that liking, disliking, or feeling neutral about a smell is personal.

## Mini-games / modes

### Mode 1 - Be the Nose
- **Skill:** Connect real smells to vocabulary and preference.
- **Core loop (30-90s):** A grown-up offers a safe smell, the child sniffs gently, stamps a guess, then stamps a like-meter feeling.
- **Rounds:** 4 pages: lemon, leafy herb, cocoa/chocolate, open-ended kitchen mystery.

### Mode 2 - Sniff and Guess
- **Skill:** Make and revise sensory guesses.
- **Core loop (30-90s):** A grown-up hides a safe smell, the child stamps a guess, then the grown-up reveals it and the child stamps a reaction.
- **Rounds:** 3 mystery jar pages.

## Shared assets used
- `shared/js/engines/observe-journal.js` - journal loop, splash, HUD, accepted stickers, recap, and debug hook.
- `shared/js/speech.js` - Web Speech voice for all beta lines.
- `shared/js/sfx.js` - synthesized pop, sparkle, whoosh, tick, and tada effects.
- `shared/fonts/fredoka-latin-600-normal.woff2` - display font.

## New assets needed
- Jar scene art, safe kitchen smell cards, and like-meter stickers.
- Recorded teacher-voice prompts, including the no-nose joke.
- Optional grown-up helper iconography for safety prompts.

## Interaction model
Tap a large sticker to stamp the smell journal. The engine accepts every guess and feeling because sensory preference is personal and guesses are part of learning.

## Feedback model
- **Success:** pop and sparkle SFX, a sticker stamp animation, and a spoken smell clue, preference affirmation, or reveal line.
- **Hint:** idle replay after a pause, plus the HUD sound button.
- **Celebration:** the recap flips through the smell notes and mystery reveals.

## Difficulty progression
The first mode offers suggested real smells with broad vocabulary. The second mode removes the prompt clue and adds a reveal step so the child can compare guess to answer without a harsh failure state.

## Replay variation
A grown-up can bring different safe kitchen smells each time. The engine varies stamp placement slightly and supports deterministic debug seeding for review automation.
