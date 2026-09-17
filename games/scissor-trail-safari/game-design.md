# Scissor Trail Safari — production design

## Promise

A child chooses a favorite paper animal, puts the scissors on the golden start, and
cuts a glowing trail through a tactile jungle. Every clean little motion produces a
soft snip. Reaching the animal turns practice into a rescue rather than a worksheet.

The experience is designed for ages 3–6, with the original concept's scissor-readiness
goal preserved while making the browser interaction safely finger-first.

## Core loop

1. Choose one of three oversized, illustrated trail cards.
2. Begin at the gold start marker; an animated ghost scissors demonstrates direction.
3. Keep one finger near the blue paper dots. Earned progress never disappears after a
   wobble, pointer cancel, app switch, or interrupted gesture.
4. Passed checkpoints make a paper snip and the traced cut becomes a thick golden seam.
5. Reach the waiting animal. The route shimmers, confetti appears, the animal bounces,
   and a short named celebration plays.
6. Complete the small set to reach the three-animal safari tableau, then replay freely.

There is no score, timer, failure state, lives counter, or text-heavy instruction.

## Modes and progression

| Mode | Rounds | Motor pattern | Friends |
|---|---:|---|---|
| Straight Trails | 3 | horizontal, diagonal, and two-turn paths | Leo Lion, Zuri Zebra, Gigi Giraffe |
| Curvy Trails | 3 | S-curve, wave, and broad arch | Pippa Parrot, Silly Snake, Momo Monkey |
| Spiral Trails | 2 | long inward clockwise/counter-clockwise spirals | Ellie Elephant, Tavi Tiger |

The modes are separate invitations, not locked levels. Within each, path complexity
rises gently and a full session remains short enough for a preschool attention span.

## Interaction rules

- One primary pointer owns the trace; window-level move/up/cancel listeners prevent a
  strand if the child leaves the canvas.
- The start target, forgiving path tolerance, and all visible controls meet the
  platform's 96 px touch-floor intent at production tablet sizes.
- Progress searches slightly ahead and behind the nearest accepted sample, which
  accommodates small fingers without allowing a jump to the destination.
- Off-path movement fades the current ink and prompts gently after sustained wandering;
  it does not erase completed work.
- Reduced-motion mode removes the demo comet, destination bounce, and decorative burst
  while preserving all information, feedback, and completion transitions.
- Physical dual-blade scissors input is deliberately not required: browser/iPad pointer
  APIs do not expose it reliably. The game prepares the steering motion without
  pretending to supervise real scissors.

## Visual direction

The canonical world is **Paper Garden / Papercraft** from `docs/art-direction.md`:

- layered construction paper and felt with visible fibers;
- deckled, scissor-cut silhouettes and stitched borders;
- warm stacked shadows rather than glossy digital gradients;
- a dense leafy frame with a calm central play clearing;
- blue stitched-dash uncut trails, an irregular authored cardstock work mat, and a golden finished seam;
- expressive full-body animals large enough to read before the first gesture.

The splash follows the concept mockup's hierarchy: generated title lockup first, three
tall illustrated choice cards second, uninterrupted jungle world behind them. The play
screen keeps the animal visible at the route's destination. The success screen uses a
single joyful tableau rather than a generic badge. Every primary visible object is a
raster asset; CSS is limited to layout, type, hit areas, and shadows.

## Sound and voice

- A recorded shared jungle-adventure music bed begins only after the first card gesture,
  fades between screens, and ducks below narration.
- Checkpoints use the shared `snip()` Web Audio effect: a tiny triangle blade click and
  filtered paper hush, intentionally soft and non-metallic.
- Completion uses the shared sparkle/pop/boing vocabulary.
- Spoken lines are short, directional, and name the rescued friend. `voice-clips.js`
  prefers verified recordings but guarantees Web Speech fallback from the same exact
  `lines.json` copy. The approved Qwen clone/Whisper production path is scripted and its
  current LAN backend failure is documented in `ASSETS.md`.

## Runtime architecture

`config.json` is the Studio-editable source of game content. `config.js` is the standard
fetch shim. The shared `trace-path` engine owns screen routing, Pixi stage lifecycle,
path sampling, pointer safety, debug control, and accessibility fallbacks. This project
adds reusable engine capabilities for raster destination visuals, recorded background
music, per-checkpoint sound selection, destination-bounds QA, and audio/SFX telemetry.

Important debug hooks:

- `QLOBE_DEBUG.listModes()` / `startMode(id)`
- `QLOBE_DEBUG.getState()` including board and destination bounds
- `QLOBE_DEBUG.tracePoints()` / `traceStrokes()` for real pointer QA
- `QLOBE_DEBUG.winRound()` for deterministic full-session smoke tests
- `QLOBE_DEBUG.getAudioLog()` / `getSfxStats()`
- `QLOBE_DEBUG.fastTimers()` / `mute()` / `seed()`

## Acceptance criteria

- All three card choices launch the correct mode.
- At least one complete round is passed using real browser pointer movement.
- A clearly wrong drag cannot advance the path.
- Every mode renders a destination animal at a minimum 96×96 on production landscape.
- A full mode reaches the authored end screen and can replay or return.
- Landscape 1280×800, portrait 768×1024, and reduced motion remain usable with no
  clipped controls, page errors, missing assets, or unexpected service requests.
- Source sheets pass exact-count cutting and every cutout passes the shared finalizer.
- Production deployment receives the same smoke and screenshot inspection as local.
