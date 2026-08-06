# Button-Zipper Lab — Production Game Design

**Status:** production rebuild · **Game id:** `button-zipper-lab`

**Category:** practical-life · **Age:** 4–7 · **World:** Paper Garden, cozy felt quiet-book variant

**Supersedes:** the two-mode `coach-timer` emoji prototype at the same route

## Product promise

Button-Zipper Lab turns a tablet into a warm wool-felt dressing book. A child
does the real motion—not a quiz about the motion—to zip a jacket, guide buttons
through holes, align and press snaps, and peel then fasten a fuzzy tab. Four
short tactile activities end by stitching a new patch onto a celebratory skill
quilt.

The production rebuild makes a missing platform capability real: forgiving,
strand-safe constrained gestures that understand a path, accept two-finger
support where it helps, and always offer an equal tap-assisted path. The fantasy
is a physical quiet book; every child-facing object must look cut, sewn, woven,
or fastened rather than browser-drawn.

## Learning promise

- **Zipper:** coordinate a steadying hand with a controlled upward pull.
- **Button:** align a round object with a narrow opening and move through it.
- **Snap:** bring two halves into alignment, then apply a deliberate press.
- **Velcro:** use opposite pull directions to peel and refasten a fabric tab.

Each mode asks for one practical-life motion. There is no timer, score,
punishment, precision penalty, or locked content. The screen models the motion,
then lets the child repeat it three times. Button placement moves down the
cardigan while the other fasteners repeat an identical large target so practice,
not increasing difficulty, builds confidence.

## Screen map and navigation

```text
catalog → felt activity shelf → fastener play → stitched reward
                       ↑             │              │
                       └─────────────┴──────────────┘
```

- Splash Home returns to the catalog. It is the only catalog link.
- Four large authored felt cards start Zipper, Button, Snap, or Velcro directly;
  the mode name is spoken on first contact, so reading is unnecessary.
- Play Back returns to the felt activity shelf in-page. Sound repeats the
  current prompt. Three stitched progress dots show the short loop.
- Reward Back and “choose another” return to the activity shelf. Again repeats
  the same three-round fastener practice.
- Completed skill patches remain visible on the splash quilt between visits.
  They celebrate practice but never gate a mode.

## Core loops

Every mode has three rounds and takes roughly 30–75 seconds. A large modeled
path remains visible throughout each active gesture. All repetitions keep the
same generous scale; buttoning advances to the next buttonhole.

### Zipper — steady and pull

1. An open felt jacket fills the play page. The zipper pin at the bottom glows.
2. Preferred two-hand path: one finger rests on the generous “steady here” felt
   patch while another drags the oversized zipper pull upward.
3. The pull is projected onto the authored zipper track. A warm joined-seam
   progress highlight grows from bottom to top beneath it.
4. Releasing before the 84% completion threshold lets the pull settle at the
   nearest reached stable notch. It never slams to the beginning. Reaching the
   collar completes the round.
5. After two incomplete attempts, or after the idle nudge interval, a stitched
   helper paw appears and holds the base. The child may continue one-handed;
   using the optional support finger dismisses the helper.

Tap-assisted path: tap the zipper pull three times. Each tap advances to the
next stable notch through the same progress handler.

### Button — line up and push through

1. One responsive 100–113px felt-covered button sits beside an oversized
   stitched buttonhole while its touch target remains at least 96px.
2. Drag the button toward the hole; the motion is projected onto a short curved
   path so small sideways errors do not matter.
3. Near the slit, the button tilts as it passes through, then settles flat on
   the other side. This is one continuous gesture and one visible explanation.
4. A miss floats to the nearest stable point and the slit breathes warmly. The
   round completes only after the button passes the far threshold.

Tap-assisted path: tap the same large button three times. Each activation moves
it to the next stable point along the curved path; keyboard activation follows
the identical path.

### Snap — align and press

1. A short fabric flap begins open with one metal snap half visible on its end;
   the matching half sits on the garment.
2. Drag or tap the flap onto the generous magnetic alignment area. It settles
   only when the two authored snap centers overlap.
3. Press and hold the now-large aligned snap for 720ms. A stitched ring fills,
   the snap clicks, and the fabric compresses visibly before springing flat.
4. Lifting early counts as one gentle press and invites one more. There is no
   error sound or lost alignment progress.

Tap-assisted path: tap the same flap three times to advance through the
alignment notches, then use two short presses on the aligned snap instead of a
hold. Keyboard activation follows the same two-stage fallback.

### Velcro — peel and smooth

1. An orange felt tab begins fastened across a cream hook-and-loop strip.
2. Drag the free corner away from the strip. The projected path curls outward;
   the tab rotates slightly while a soft ripping texture plays.
3. At the open notch the tab rests, showing both fuzzy surfaces.
4. Drag it back across the strip and continue past the final notch to “smooth”
   it down. The fabric nap settles and the round completes.

Tap-assisted path: tap the same large tab three times to peel it open, then
three more times to smooth it closed. Both beats use the same semantic progress
states as dragging.

## Spoken script (verbatim)

The keys below are the source of truth for recorded teacher voice. Device speech
uses the exact same text when a clip is absent or cannot decode.

| Key | Line |
| --- | --- |
| `welcome` | “Welcome to the Button-Zipper Lab. Pick a fastener to practice.” |
| `mode-zipper` | “Zipper time!” |
| `mode-button` | “Button time!” |
| `mode-snap` | “Snap time!” |
| `mode-velcro` | “Hook-and-loop time!” |
| `zipper-start` | “Hold the jacket steady, then pull the zipper up.” |
| `zipper-nudge` | “Slow and steady. Follow the glowing track upward.” |
| `zipper-help` | “My helper paw can hold the jacket with you.” |
| `button-start` | “Guide the button across and through its buttonhole.” |
| `button-nudge` | “Follow the curved stitches toward the buttonhole.” |
| `snap-start` | “Slide the flap onto the shiny snap.” |
| `snap-press` | “Now press and hold until it clicks.” |
| `snap-nudge` | “Bring the two shiny snap parts together.” |
| `velcro-start` | “Peel the orange tab away from the fuzzy strip.” |
| `velcro-nudge` | “Keep peeling along the glowing stitches.” |
| `round-one` | “One fastener finished. Beautiful patient hands!” |
| `round-two` | “Two fasteners finished. You are getting smoother!” |
| `round-three` | “Three fasteners finished. You did the whole set!” |
| `mode-complete` | “You earned a brand-new fastener patch!” |
| `all-complete` | “Every patch is yours. You are a getting-dressed champion!” |
| `idle` | “Touch the glowing fastener and follow the stitched path.” |
| `again` | “Ready to practice that fastener again.” |

## Art direction and complete art list

Chosen direction: **Puppet / cozy felt fabric**, implemented as the platform’s
Paper Garden world. The supplied mockups are the visual north star: sky-blue
wool pages, cream felt labels, chunky blanket stitching, denim weave, fuzzy hook
and loop, real metal fasteners, soft physical shadows, and rounded handmade
forms. Palette anchors are deep navy, cobalt, orange, leaf green, lavender,
cream, and sunflower yellow.

No visible emoji, SVG, browser-drawn garment, or generic rounded card belongs
in the production play field. HTML/CSS supplies layout, masks, hit areas,
progress clipping, responsive transforms, focus, and the small cream stitched
instruction/action surfaces; authored raster art supplies every character,
garment, fastener, mode card, patch, and background.

| Asset | Runtime target | Visible renderer | Interaction substrate |
| --- | --- | --- | --- |
| Krea concept set | four 1344×768 source PNGs | style-consistency gate for shelf, zipper, alternate fastener, and reward screens | authoring only; retained under `assets/source/concepts/` |
| splash backdrop | 1448×1086 WebP, about ≤350 KB | full-bleed stitched felt sky, rolling patchwork hills, calm center | cover-fit background layer |
| title lockup | 1048×544 alpha WebP, about ≤150 KB | exact felt lettering “Button-Zipper Lab” on a cream stitched plaque | accessible image; no functional text baked into buttons |
| four mode cards | four 520×520 alpha WebPs | blue zipper, green button, lavender snap, orange Hook & Loop quiet-book tiles | 96px+ HTML buttons with real text + spoken labels |
| zipper board | 1024×1024 opaque WebP | felt bear in the blue jacket with a clear vertical zipper track | base board beneath the constrained pull and joined-seam feedback |
| zipper pull + helper paw | alpha WebPs from ≤512px reviewed extracts | oversized metal pull and stitched felt helper paw, responsively scaled | constrained pointer handle / inert assist overlay |
| button board + button | board WebP plus one alpha button sprite | woven cardigan, three stitched slits, felt-covered button | path projection and large hit handle |
| snap board + flap | board WebP plus aligned alpha flap and snap state | lavender felt with real metal snap halves | constrained drag followed by press-hold target |
| Velcro board + tab | board WebP plus open alpha orange tab | visible fuzzy hook-and-loop nap and stitched fabric | two-phase projected drag path |
| four skill patches | four alpha WebPs from ≤512px reviewed extracts | zipper, button, snap, and fuzzy-tab emblems | persistent completion marks |
| stitched path glow | CSS dashed seam and progress fill | white modeled-motion stitches and three progress notches | inert responsive overlay aligned to each raster board |
| reward plate + felt friend | 1448×1086 WebP backdrop | cream quilt page, celebratory dressed bear, loose felt confetti | destination screen and reduced-motion-safe static payoff |
| hub tile | 640×533 JPEG | the same felt bear and zipper jacket, no title/UI | deterministic crop of the approved zipper board |
| Open Graph image | 1200×630 JPEG | real production game capture | metadata only |
| narration | AAC/M4A + manifest + transcript QA | approved warm teacher voice | `voice-clips.js` with exact Web Speech fallback |

Production sequence is explicit: four Krea 2 concept frames first; GPT Image 2
for the accepted coherent raster system and title/character sources; Qwen Image
Edit for identity-consistent state variants; Qwen Image Layered `layer_2` for
semantic extraction; deterministic trim/resize/WebP conversion; magenta alpha
inspection; Qwen teacher-voice clone followed by Whisper transcript QA.

## Interaction and feedback rules

- All child-facing controls and draggable handles expose at least a 96×96 CSS px
  hit area; artwork may be smaller inside it.
- Pointer streams end on `window`, filtered by pointer id. Removal/re-rendering
  of a source element cannot strand a gesture.
- `pointercancel`, blur, page hide, orientation change, and navigation cancel
  without committing.
- One manipulator pointer is active at a time. Zipper alone may also track one
  support pointer; any third pointer is ignored safely.
- A pointer-to-object offset prevents snapping. A 9px slop keeps taps from
  turning into accidental drags. Progress is normalized so rotation and resize
  preserve semantic state.
- Every drag has an equal tap-assisted route through the same semantic attempt
  function. Debug actions call that function too.
- Wrong motion never buzzes, reddens, or resets a completed semantic step. The
  nearest stable state holds, the stage gives one gentle wiggle, and the
  narrator models the next motion.
- Soft local pops, ticks, whooshes, sparkles, and the Snap click reinforce the
  material actions. Voice never overlaps itself. Mute gates every audio channel.
- Reduced motion collapses bounces, pulsing, confetti, and movement transitions;
  progress, state swaps, glow, and audio remain.
- Functional text is real HTML. The child can play from pictures, modeling, and
  speech without parsing it.

## Variation and persistence

- Each mode contains three repetitions. Target size never shrinks; the three
  buttonholes vary placement while zipper, snap, and hook-and-loop deliberately
  repeat one stable geometry.
- A deterministic seed controls felt-confetti positions for reproducible QA.
- Four completed skill patches persist as a bounded localStorage record. Storage
  failure degrades to session-only progress with no broken UI.
- Nothing is locked. Clearing saved patches is available through `QLOBE_DEBUG`
  for review and can later be exposed to grown-ups without changing gameplay.

## Privacy, permissions, and offline behavior

No camera, microphone, motion sensor, location, login, upload, runtime model
request, or file-system permission is used. All generation is authoring-time.
Saved patches remain on the device. If recorded audio cannot play, exact device
speech plus visible modeling preserves the complete loop.

## Explicit departures from the brief, mockups, and old prototype

- The old prototype asks a child to fetch real clothes and tap “done” through
  long 20–90 second timers. That is a real-world coach, not the concept’s tactile
  tablet simulation, and it uses emoji placeholders. The rebuild removes the
  coach-timer engine and implements the promised digital motions directly.
- The brief’s ages 2–5 broadens to 4–7. Motions remain forgiving for younger
  players while the two-hand coordination still rewards older beginners.
- The mockup’s separate START button is removed. A large mode card starts play
  directly, shortening the pre-reader path and matching the shared shelf idiom.
- Mockup labels and prompts become real HTML and recorded speech. Only the title
  remains authored lettering, so functional spelling and accessibility are
  reliable.
- “Level Complete” and unlockable jackets become a non-gating skill quilt.
  Practice is celebrated; content is never withheld.
- The mockup’s one zipper screen expands to four equally polished fasteners and
  three repetitions each. The interaction promise, not a static screen copy, is
  the production target.
- A stuffed felt bear is an activity-board toy rather than a speaking new cast
  member. The teacher narrator remains the guide, avoiding an unnecessary new
  platform character identity and voice.

## Shared modules used or strengthened

- `shared/js/stage/constrained-gesture-dom.js` — new reusable DOM controller for
  normalized path projection, stable notches, one manipulator plus optional
  support pointer, window-level cleanup, tap-vs-drag slop, cancel semantics, and
  testable semantic input. Button-Zipper Lab is its first consumer.
- `shared/js/audio-unlock.js`, `voice-clips.js`, `narrator.js`, `sfx.js` — one
  gesture unlock, recorded narration, cancellation-safe speech, and feedback.
- `shared/js/screens.js`, `mode-select.js`, `hud.js`, `idle-nudge.js`,
  `celebrate.js`, `timers.js`, and `rng.js` — shared navigation, controls,
  nudging, celebration, deterministic timing, and feedback.
- `shared/js/debug-harness.js` — stable `QLOBE_DEBUG` version 1 surface.

Fastener state machines, garment geometry, and skill-quilt persistence remain
game-local because they are product semantics rather than a generic gesture
contract.

## `QLOBE_DEBUG` v1

The surface exposes `ready`, `listModes`, `startMode`, `getState`, `getTargets`,
`tap`, `winRound`, `gestureProgress`, `gestureRelease`, `mute`, `seed`,
`fastTimers`, `home`, `getAudioLog`, `clearAudioLog`, `clipInfo`, and
`resetProgress`.

Debug actions feed the same semantic handlers as real pointers. State reports
screen, mode, round, phase, normalized progress, stable checkpoint, support
readiness, miss count, completed patches, mute, reduced motion, seed,
transition state, and outstanding timer count.

## Known risks and release gate

- GPT/Qwen state variants must retain the same bear, garment proportions,
  camera, and light. A changed face, missing limb, or wandering fastener is a
  reroll, not a crop fix.
- Qwen Layered extraction must use `layer_2`. Alpha is inspected at 2–4× on a
  saturated magenta composite; flood-fill or luminance keying is forbidden.
- The raster board, constrained handle, and semantic path must stay registered
  at every supported aspect ratio.
- Two-finger support must survive reversed pointer order, extra fingers,
  pointercancel, release outside, navigation mid-drag, resize, and app blur.
- Every tap-assisted route, repeated-miss assist, localStorage failure, recorded
  clip fallback, and muted path requires explicit browser QA.
- Portrait 820×1180 and short landscape 1180×520 must keep the working fastener,
  HUD, prompt, and 96px handles visible without scrolling.
- The generated title must spell “Button-Zipper Lab” exactly at full size.

Production acceptance requires: all four Krea concepts created and reviewed
before GPT production; every listed runtime asset present, coherent, budgeted,
and provenance-logged; every voice clip transcript-QA’d; zero new validator,
console, request, or runtime-network errors; all four modes completed through
real pointer and debug paths in real Chrome; landscape, portrait, short-
landscape, and reduced-motion captures reviewed against the supplied mockups;
the deployed `https://qlo.be` route smoke-tested with the same suite. Status
remains `beta` until the real iPad child playtest passes.
