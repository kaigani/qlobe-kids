# Silly Swap Words — Game Design

## North star

Tap one clay letter, hear its sound, and watch the whole object squish into something new. The transformation—not a score—is the reward. The game should feel like a tiny stop-motion word workshop where experimentation is always safe.

**Audience:** ages 3–6

**Learning focus:** phoneme substitution, CVC blending, sound-to-letter mapping

**Art world:** handcrafted Claymation with fingerprints, soft seams, matte-satin plasticine, warm studio light, turquoise sky and lavender workbench

**Input:** one-finger tap; no drag precision, timer, lives, reading prerequisite, or fail state

## Screens

### 1. Workshop chooser

The generated clay title is the hero. Three authored clay medallions start Guided Swaps, Word Trails, or Silly Word Lab. The shared Home control appears only here; Sound replays the welcome. Peripheral word objects establish the transformation fantasy without competing with the choices.

### 2. Word workbench

The top clay plaque gives one short instruction. A large generated object occupies the visual center. Three 96px-or-larger cream clay wells carry live, accessible letter text; in guided modes only the changing well glows. Magic Swap performs the same legal action for a child who wants help. Progress pips are decorative and the spoken prompt carries the meaning.

### 3. Celebration

The final transformed object, its three-letter word, an authored purple ribbon, clay confetti, and two clear actions close the mode. Play Again restarts the same mode. Choose Mode and Back both return in-page to the chooser, preserving the platform navigation rule.

## Modes

### Guided Swaps

Six authored rounds teach that one sound can change the whole word. Some rounds deliberately include a valid intermediate discovery so exploration is rewarded instead of treated as a mistake.

| Round | Path | Changing slot | Learning beat |
|---|---|---:|---|
| 1 | CAT → HAT | first | onset substitution |
| 2 | HAT → HOT | middle | short-vowel contrast |
| 3 | HOT → HOP → HOG | last | valid intermediate word |
| 4 | DOG → FOG → LOG | first | two valid onset discoveries |
| 5 | LOG → LEG | middle | short-vowel contrast |
| 6 | PIG → DIG → WIG | first | two valid onset discoveries |

A tap on a non-changing well produces a soft boing, a wobble, and “That sound is staying put”—never a red X or loss.

### Word Trails

One of two deterministic, seeded trails appears per session:

- CAT → HAT → HOT → HOG → DOG
- BUG → MUG → RUG → RAG → RAT

Each step changes exactly one phoneme. The next target is shown and spoken by the cloned teacher voice. Four successful changes reach the Trail Blazer celebration.

### Silly Word Lab

All three wells are active. Tapping cycles that position’s curated letter wheel; Magic Swap prefers a known one-letter neighbor. A known word reveals its generated clay object and shared recorded pronunciation. An invented CVC reveals the friendly lab blob, speaks the blended letters, and responds warmly: invented words are discoveries, not errors. Eight discoveries earn a Silly Genius celebration.

## Interaction and feedback choreography

1. Pointer-down immediately unlocks all audio and gives a small tactile tick.
2. The changed phoneme plays from the shared recorded fragment library.
3. The well flips while the old object compresses.
4. The new generated object pops in with clay sparkles.
5. A shared recorded word clip names real words; invented words use pronunciation fallback followed by a cloned-teacher celebration.
6. Background music ducks under every spoken line and restores afterward.

Inputs lock only for the short transformation beat. Screen exits cancel timers, narration, nudges, and confetti through the shared screen/timer modules.

## Audio

- **Narration:** 29 game-local Qwen3 voice-clone AAC clips using the approved shared teacher reference; each clip has a recipe and Whisper transcript QA.
- **Phonemes and words:** shared QLOBE recorded libraries, resolved through `shared/js/content.js`.
- **Music:** `shared/assets/music/whimsical-toy-workshop.mp3` at low volume, preloaded before the first-gesture iOS unlock and ducked under voice.
- **Effects:** shared synthesized pop, sparkle, boing, silly, whoosh, tick, and tada cues.
- **Mute:** gates narration, word clips, effects, music, and Web Speech fallback together.

## Accessibility and device behavior

- Semantic buttons and explicit accessible labels back every raster control.
- Gameplay controls and their effective HUD hit areas meet the 96px platform target.
- Live regions announce prompts and feedback; muted game audio does not mute assistive technology.
- Portrait, landscape, short-landscape, safe-area insets, and reduced motion are first-class layouts.
- No SVG, canvas, emoji, or CSS-generated primary artwork; HTML/CSS is limited to layout, text, focus, shadow, and motion around authored raster assets.
- iPad callouts and gesture zoom are suppressed by the shared kiosk guard.

## Runtime and QA contract

The game is a static custom DOM module. `window.QLOBE_DEBUG` v1 exposes mode listing/start, semantic state, visible targets, real input taps, round completion, seeded randomness, timer scaling, mute, audio logs, Magic Swap, and a guarded one-letter Lab override. Automated Chrome QA covers all modes, intermediate words, gentle misses, responsive layouts, reduced motion, offline runtime behavior, decoded narration, image integrity, and production screenshots.

The shipping status remains **beta** until an in-hand child/iPad playtest, per platform policy.
