# Sound Painting — production game design

## Product promise

Touching color makes music visible. A child chooses one of three musical
brushes, paints freely with one finger, and then watches the painting perform
its own path and notes back to her.

The game practices auditory-visual association, expressive mark-making, and
fine-motor control. There is no correct picture and no evaluation.

## Why this concept replaces the beta

The former `observe-journal` prototype described imaginary music, then asked
the child to stamp an emoji and a color. It proved an accepting journal loop
but did not deliver the concept brief's audio-reactive drawing, specialized
brushes, free canvas, save, or replay fantasy.

This custom replacement makes `shared/js/musical-canvas.js` a reusable platform
capability: strand-proof free drawing, high-DPI rendering, WebAudio notes,
semantic stroke capture, deterministic replay, undo/clear, and PNG export.

## Modes

Each mode teaches one expressive movement quality. The child may change color
at any time.

| Mode | Gesture quality | Visual response | Sound response |
| --- | --- | --- | --- |
| Calm River | slow continuous glides | broad layered paper ribbon | soft sine-like pentatonic notes |
| Bouncy Beat | loops, hops, and taps | round paper daubs and rings | short warm triangle-note pops |
| Star Sparkles | quick swishes | luminous line with cut-paper stars | bright bell-like pentatonic notes |

## Screen map

```text
hub → splash
splash home → hub
splash mode card → canvas
canvas back → splash
canvas play → semantic replay → canvas
canvas finish → keepsake
keepsake replay → semantic replay
keepsake picture → local PNG download
keepsake again/back → splash
```

The splash owns Home. Canvas and keepsake use Back to return to the in-game
splash.

## Core loop

1. Pick one of three large mode cards.
2. Hear a one-sentence modeled movement prompt.
3. Pick a color and draw. Each movement emits a coordinated note and visual.
4. Undo, clear, or replay freely.
5. Tap the large finish rosette after at least one stroke.
6. The painting is stored on this device, celebrated, and can be replayed,
   downloaded as a PNG, or replaced by another painting.

A satisfying painting takes 30–90 seconds. Nothing times out and no action is
judged.

## Complete spoken script

- `welcome`: “Welcome to Sound Painting. Pick a sound, then paint what you hear!”
- `choose`: “Which sound shall we paint?”
- `calm-label`: “Calm River.”
- `calm-prompt`: “Glide slowly. Make a peaceful river of color.”
- `bounce-label`: “Bouncy Beat.”
- `bounce-prompt`: “Hop, loop, and tap to make a bouncy beat!”
- `sparkle-label`: “Star Sparkles.”
- `sparkle-prompt`: “Swish fast and make the stars sing!”
- `empty`: “Touch the dark canvas and let your finger make music.”
- `replay`: “Now watch your painting play itself!”
- `clear`: “A fresh canvas, ready for a new song.”
- `saved`: “Your painting is safe on this device.”
- `done`: “Beautiful! You made music we can see.”

Recorded Qwen teacher-voice clips are primary. `voice-clips.js` uses the exact
same `config.json` strings as Web Speech fallback.

## Art direction

This is the first production proof for the existing Paper Garden world, adapted
as a nighttime lighting variant. The plate and controls use stacked
construction paper, cardstock, visible fibers, softly imperfect cut edges, and
small physical shadows. The approved user reference calibrates the material
language; it is a style reference only, not redistributed.

The selected GPT Image 2 plate keeps the middle 60 percent quiet for real UI and
live drawing. Dynamic strokes use code-rendered paper-like bands, daubs, and
stars so they remain responsive and replayable. Exact labels remain HTML.

## Asset list

| Asset | Runtime size | Renderer |
| --- | ---: | --- |
| Papercraft studio plate | 1400×1050 JPEG, ≤300 KB | CSS background |
| Toy Table hub tile | 640×533 JPEG target | Hub image |
| 13 teacher-voice lines | mono AAC/M4A | `voice-clips.js` |
| Musical ribbons, daubs, stars, palette, buttons | resolution-independent | Canvas + HTML/CSS |

The source GPT Image 2 generations and exact prompts remain under
`assets/source/gpt-image-2/`. Local-API sources and QA live under
`assets/source/local-api/`.

## Interaction and feedback

- All child controls are at least 96 CSS pixels on touch layouts.
- Drawing uses one primary pointer, window-level move/up/cancel listeners, and
  blur cancellation; a stroke cannot remain stranded.
- The pointer-to-canvas coordinate is preserved exactly with no snap.
- Every stroke is reversible with Undo; Clear requires no confirmation because
  Undo can restore the removed painting until the next stroke.
- A first idle nudge is spoken once after six seconds.
- Reduced motion removes particles and spring motion; replay remains functional.
- Audio is unlocked on the first real gesture. Muting affects voice and musical
  notes together.

## Persistence and privacy

Only semantic stroke JSON is stored in `localStorage`, capped at six paintings
and downsampled during drawing. No microphone, camera, account, analytics,
network request, or upload is used. PNG export is generated locally from the
canvas. Storage failure falls back to an in-memory keepsake without blocking
play.

## Shared systems

- New: `shared/js/musical-canvas.js`
- Existing: `shared/js/voice-clips.js`, `speech.js`, `sfx.js`, `tap.js`
- Existing: shared HUD art and Fredoka

## `QLOBE_DEBUG` v1

The debug surface exposes `ready`, mode listing/start, semantic state and
targets, same-path control tapping, deterministic stroke injection,
`winRound`, mute, seed, and fast-timer. `getTargets()` truthfully marks all
expressive choices neutral.

## Known risks and release gate

- Some browsers synthesize WebAudio oscillators differently; correctness does
  not depend on exact timbre.
- Download behavior differs in installed iPad web apps; the on-device semantic
  save and replay remain the primary keepsake.
- The game remains `beta` until a real iPad child playtest confirms the mode
  cards, painting sounds, and finish control are understood without coaching.
- Release requires landscape, portrait, reduced-motion, storage reload, replay,
  wrong/empty-action, console, request, and production visual checks.
