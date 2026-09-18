# Game Design Document — Chalkboard Big Strokes

## Product promise

An ages 2–5 child can choose a giant mark, sweep it with their whole arm, make
the chalkboard sparkle, and physically wipe the slate clean. There is no loss
state, timer, score pressure, or reading dependency. The fantasy is a beloved
classroom chalkboard made into a responsive toy.

- **Category:** `writing-fine-motor`
- **Canonical art direction:** **Toy**
- **Per-game treatment:** rough color-chalk classroom slate
- **Route:** `games/chalkboard-big-strokes/`
- **Release status:** beta until the intended child completes an iPad playtest

## Capability contribution

The old route was a two-mode `trace-path` engine stub with emoji art. This
replacement is a custom DOM/Canvas game because drag-to-erase, material chalk
feedback, direct mode choice, and a persistent finished mark are the central
fantasy rather than cosmetic variants of a generic tracer. It still composes
the platform's shared narration, voice-clip, audio-unlock, BGM, timer, SFX, and
debug modules.

## One skill per mode

| Mode | Child-facing gesture | Skill |
|---|---|---|
| Wave | Sweep left to right through broad rises and dips | Smooth shoulder-led direction changes |
| Loop | Travel continuously around a large loop | Circular motion and midline crossing |
| Star | Visit five far-apart points in order | Controlled corners and direction changes |
| Letter S | Curve from the top around and back | Giant top-to-bottom S formation |

Each mode has three normalized path variants. The selected seed plus round
chooses the variant deterministically, so repetition feels fresh while QA and
replay remain exact.

## Screen map and navigation

```text
catalog → selection → trace → success → erase → fresh-slate replay
              ↑          back                   ├─ same mode / next variant
              └─────────────────────────────────└─ choose another mode
```

1. **Selection / splash:** generated title, four large physical slate plaques,
   animated Canvas samples, Start prompt, Chalk Buddy, chalk and eraser props.
   Home returns to the catalog.
2. **Trace:** one huge guide owns the central slate. A glowing start beacon and
   arrow model the direction. The child lays down a thick colored dusty trail.
   Back returns to selection.
3. **Success:** the completed stroke becomes bright chalk, raster chalk dust
   and Chalk Buddy appear, and spoken praise plays.
4. **Erase:** the child drags the generated felt eraser. A broad circular brush
   removes the finished stroke and sheds dust; clearing 70% completes the wipe.
5. **Replay:** the clean slate offers the same mode's next variant or all four
   choices. This makes mistakes and repetition feel consequence-free.

The sound control is present in every state. All child targets are at least
96 CSS pixels where the viewport permits; the drawing surface itself has a
large forgiving hit region.

## Core loop (30–75 seconds)

1. Tap Wave, Loop, Star, or Letter S.
2. Touch near the pulsing start. A miss causes no loss; after two misses the
   narrator gently repeats the start hint.
3. Sweep forward. Ordered progress can look ahead across several samples to
   absorb fast toddler motion, but cannot jump backward or skip the shape.
4. Reach the end; see the entire mark glow and burst with chalk magic.
5. Tap or grab the felt eraser, wipe across the mark, and reveal a fresh slate.
6. Repeat the next variant or choose a different gesture.

## Interaction and feedback rules

- Pointer Events and pointer capture keep tracing/erasing alive when a finger
  drifts outside the element.
- One active pointer is accepted at a time. Cancel, blur, and screen changes
  always release the gesture.
- Start tolerance is broader than the visible beacon; path tolerance is broad
  enough for full-arm motion, and misses never subtract progress.
- Canvas is the interaction substrate and the world-appropriate procedural
  renderer for changeable chalk, guide dots, dust, and erasure. It is not used
  to replace the physical raster props.
- Success is materially different from the guide: full colored line, glow,
  raster sparkle burst, mascot arrival, warm praise, and a gentle SFX chord.
- Eraser position follows the child's pointer with its original grab offset.
- Reduced-motion mode removes bobbing, burst travel, and long fades while
  preserving guide, progress, completion, erasing, and voice.

## Art inventory

| Child-facing object | Visible renderer | Interaction substrate |
|---|---|---|
| Framed slate and ledge | `assets/art/board-backdrop.webp` GPT Image 2 raster | full-screen responsive image layer |
| Title | `assets/art/title-lockup.webp` generated transparent raster | accessible `<img>` name |
| Four mode plaques | generated cyan/yellow/pink/white raster sprites | real buttons with HTML labels and Canvas path samples |
| Start/replay plaque | `button-plaque.webp` raster | button and HTML functional text |
| Felt eraser | `felt-eraser.webp` raster | pointer-captured drag target plus broad erase brush |
| Chalk Buddy, chalk sticks, sparkles | generated raster sprites | decorative/reward layers |
| Home, sound, replay icons | generated raster sprites | 96 px buttons/links with accessible names |
| Guides and child mark | dusty Canvas strokes and particles | normalized ordered-path sampler |
| Hub tile | separately authored 6:5 toy tableau | catalog card image |

No browser emoji, SVG illustration, CSS-drawn physical prop, or external asset
request is part of the shipped experience.

## Spoken script

| Key | Verbatim line |
|---|---|
| `welcome` | “Pick a big stroke, then move your finger nice and wide.” |
| `wave` | “Ride the wave. Start at the glowing dot.” |
| `loop` | “Loop around and cross the middle.” |
| `star` | “Make a big star, corner to corner.” |
| `letterS` | “Start at the top and sweep a giant S.” |
| `nudge` | “Find the glowing dot, then follow the chalk.” |
| `great1` | “Big, easy strokes!” |
| `great2` | “You filled the board with chalk magic!” |
| `erase` | “Now grab the eraser and wipe it clean.” |
| `again` | “Fresh board! Choose another big stroke.” |

The recorded platform-teacher clips are primary. `speechSynthesis` through the
shared narrator/voice layer is the per-line fallback. Quiet recorded
`rainy-day-acoustic.mp3` uses shared `bgm.js`, begins only after a real child
gesture, follows mute, and never blocks input.

## Responsive and accessibility behavior

- The 3:2 source board covers the viewport; safe-area padding protects HUD and
  active controls. Portrait preserves the central trace field and compresses
  decoration before shrinking interaction targets.
- Selection becomes a 2×2 shelf in portrait and remains a four-card row on
  roomy landscape tablets.
- Canvas dimensions track CSS pixels and device-pixel ratio without changing
  normalized hit testing.
- Every interactive object has a real semantic control, visible focus state,
  and accessible name. Narration is mirrored to a polite live region.
- The game prevents page scroll, zoom gestures, image dragging, text selection,
  and stranded pointers while remaining keyboard-operable for adult QA.

## Privacy, persistence, and fallback

The game requests no permission, records nothing, stores no child data, and
makes no gameplay or model-service network call; the platform's existing
privacy-conscious analytics script remains enabled. A missing recorded clip
falls back to device speech. Missing BGM or muted audio never blocks play.
Asset load failure keeps semantic controls usable and is treated as a QA
failure rather than a child-facing crash.

## `QLOBE_DEBUG` v1

The serializable QA surface exposes readiness, mode listing, deterministic
seed/mode/round starts, truthful state/target/path, real trace-point and
erase-point handlers, complete-round/complete-erase helpers, mute, fast timers,
audio log, and reduced-motion state. Automated completion exercises the same
progress and screen transitions as pointer input.

## Explicit departures

- The concept's selection screen and exact Wave/Loop/Star/S vocabulary are
  preserved, but functional labels are HTML over blank authored plaques so
  spelling is always correct and localization remains possible.
- The old “Two-Part Strokes” cross/T/X mode is removed; it diluted the brief's
  gross-motor promise and displaced the featured Star and Letter S choices.
- The eraser is not merely a reset button: the child must move the physical
  raster prop across enough of the mark to clear it.
- The frame may crop at narrow portrait edges so the trace field and targets
  remain large; the bottom ledge, slate texture, and tactile props preserve the
  art world.

## Release gate and known risks

- Static validator and registry sync add no new error.
- Browser QA completes all four modes, a wrong-start probe, success, erasing,
  replay, navigation, mute, landscape, portrait, short viewport, and reduced
  motion with no unexpected console error, failed request, or missing asset.
- Visual QA captures selection, live trace, success, erasing, and replay at
  tablet landscape and portrait sizes.
- Production is tested from `https://qlo.be/games/chalkboard-big-strokes/`
  after the Pages run succeeds.
- Remaining non-automatable risk: only a real child playtest can validate that
  the tolerance feels effortless on the target iPad; status remains `beta`
  until that observation occurs.
