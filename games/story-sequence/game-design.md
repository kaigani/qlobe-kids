# First, Next, Last — production game design

**Status:** beta

**Audience:** ages 2–6

**Category:** oral language and storytelling
**Core learning:** chronological order, cause and effect, and the spoken sequence words *first*, *next*, and *last*.

## Promise

The child chooses a tiny watercolor story, makes it make sense by arranging three picture cards, then watches the pictures come alive as a narrated mini-story. The reward is not a score screen: it is hearing the story they built and earning a Storyteller Star.

## Child-facing loop

1. **Choose a story.** Four large covers live in a sunny reading nook: Slide, Bake, Plant, and Brush.
2. **Look and reason.** Three shuffled pictures appear beneath clearly labeled `FIRST → NEXT → LAST` spaces.
3. **Place the cards.** Drag a picture or tap a picture and then its story space. Correct cards settle with a check and a short spoken confirmation. A mismatch returns gently and invites another try.
4. **Watch the story.** Once all three pictures are placed, `Watch My Story` starts a paced three-beat playback. Each full-size picture receives focus while the teacher says its sentence.
5. **Celebrate and choose again.** Confetti, a Storyteller Star, replay, and another-story actions remain on screen. Completed stories are remembered locally.

No child has to read to understand the activity. The visible labels reinforce language already introduced by narration.

## Story decks

| Story | First | Next | Last |
|---|---|---|---|
| Slide | Kai climbs the ladder | Kai zooms down | Kai cheers at the bottom |
| Bake | Maya mixes blueberry batter | A grown-up bakes safely | Maya shares warm muffins |
| Plant | Nia tucks in a sunflower seed | Nia waters the sprout | A sunflower blooms |
| Brush | Leo adds a little toothpaste | Leo brushes in circles | Leo's clean smile sparkles |

The baking sequence deliberately shows an adult handling the oven. The four decks use distinct children and settings while sharing one watercolor storybook grammar.

## Interaction model

- Pointer Events drive a single active drag.
- The pointer-to-card offset is preserved; dragging does not snap the card under the finger.
- Pointer capture and window-level cancel/blur cleanup prevent stranded cards.
- Tap-card then tap-slot uses the same placement handler as drag/drop.
- Every available child target is at least 96 CSS pixels in its intended layout.
- Only the correct temporal slot accepts a card. Incorrect attempts are warm and self-correcting, never punitive.
- Input locks during narration and playback transitions so a fast second tap cannot duplicate state.

## Feedback and delight

- Lift, tilt, and a restrained shadow make the dragged raster card feel tactile.
- A selected card and hovered slot receive high-contrast state outlines.
- Correct placement shows the painted green check medallion and speaks the relevant sequence word.
- The completed board holds long enough to be understood before the child chooses playback.
- Playback spotlights one ordered panel at a time with large, readable movement over the painted meadow. Reduced-motion mode swaps movement for immediate opacity/state changes.
- The fourth distinct completed deck unlocks a special Storyteller Star line; no content is locked behind progress.

## Screen architecture

This is a game-local DOM runtime rather than a reskin of the generic `sequence-order` engine. The original engine proved the mechanic but could not provide the brief's story library or held playback payoff without changing every engine consumer.

The game still composes platform modules:

- `voice-clips.js` for recorded narration with Web Speech fallback;
- `sfx.js` for lightweight interaction sounds;
- `timers.js` for cancellable and QA-scalable beats;
- `rng.js` for deterministic shuffling;
- `debug-harness.js` for the required review contract.

The static production page makes no model or LAN calls.

## Persistence

Only the set of completed story IDs is stored under `qlobe:first-next-last:v1`. Storage failure falls back to the current session. No names, recordings, analytics payloads, or child-authored content are stored.

## Visual direction

The interior follows the concept's **Watercolor / Storybook** art world: cold-press paper texture, gouache color, soft ink edges, warm ivory cards, sky blue, garden green, sunflower gold, and coral accents. GPT Image 2 source sheets are the canonical art; functional copy remains HTML for legibility and accessibility. CSS is used for layout and interaction state, never to draw illustrative objects. There are no emoji or vector stand-ins in the game.

The hub tile intentionally follows the platform's separate soft-3D Toy Table menu grammar so it belongs beside other catalog tiles.

## Audio

Twenty-two concise teacher lines are cloned from the rights-cleared platform teacher reference with local Qwen TTS. Every encoded AAC/M4A clip is transcribed with local Whisper before acceptance. `lines.json` remains the exact fallback script.

## Debug and QA contract

`window.QLOBE_DEBUG` format version 1 exposes readiness, the four story modes, deterministic start/seed, serializable state, truthful targets, semantic tap input, instant round completion, mute, fast timers, navigation home, and the audio log. The game-local Chrome driver exercises wrong and correct paths, physical drag and tap, complete playback, recorded voice, navigation, landscape, portrait, short landscape, reduced motion, target sizes, overflow, failed requests, and console errors.

## Release boundary

The game ships as `beta` after automated local and production QA. It remains beta until a real child completes at least two different decks on the target iPad without adult explanation.
