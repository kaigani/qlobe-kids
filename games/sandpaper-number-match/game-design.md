# Game Design Document — Sandpaper Number Match

## Product promise

An ages 3–6 child opens a handmade quiet book, traces a huge sandy numeral,
wakes exactly that many sleepy plush stars, and discovers that the written mark
and the quantity belong together. Play is calm, tactile, celebratory, and
pressure-free: no timer, score, lives, loss state, or reading requirement.

- **Category:** `math-number-sense`
- **Canonical art direction:** **Puppet / Cozy felt fabric**
- **Route:** `games/sandpaper-number-match/`
- **Release status:** beta until the intended child completes an iPad playtest

## Capability contribution

The former route was a two-mode `tap-count` placeholder with browser emoji and
no tactile tracing. This production replacement is a custom DOM/Canvas runtime
because its flagship learning loop must preserve the same number across two
different interactions—ordered formation, then one-to-one quantity counting—
inside one round. Existing single-purpose engines do not compose those phases.

The game still uses the shared screen lifecycle, tap routing, narration,
recorded voice, audio unlock, BGM, SFX, timers, idle coaching, celebration,
seeded RNG, preload, DOM safety, and debug harness modules. Canvas is narrowly
used as the live tracing substrate; fixed visual objects are raster assets.

## Modes

| Mode | Rounds | Number pool | Child-facing loop | Primary skill |
|---|---:|---|---|---|
| Trace & Count | 3 | 1–9 | trace one numeral, then wake the matching star set | connect ordered numeral formation to quantity |
| Star Count | 3 | 1–10 | tap each sleepy star once and hear the count | stable order and one-to-one correspondence |
| Find a Match | 4 | 1–9 | compare three stitched quantity cards with a numeral | map a written numeral to a visual set |

Seeded shuffling varies the session while keeping automated and caregiver replay
deterministic. Trace & Count sorts its selected numbers upward so the flagship
journey feels progressive; the practice modes remain mixed.

## Screen map

```text
catalog → quiet-book selection
              ├─ Trace & Count → trace → count → rosette → next / final
              ├─ Star Count ──────────→ count → rosette → next / final
              └─ Find a Match ────────→ choose → rosette → next / final
                       ↑                                  │
                       └──────── Back to selection ───────┘
```

1. **Selection:** a cream felt page framed in coral stitching, a raised
   GPT Image 2 felt-letter title lockup, three large lesson cards with pictorial
   previews, Pencil Buddy, Home, and Sound. A child can choose by picture;
   labels support caregivers and a hidden HTML heading preserves semantics.
2. **Trace:** one oversized sandpaper numeral owns the page. A pulsing coral dot
   and cream dashed path show where and how to begin. The finger lays a glowing
   sandy trail directly on the tactile numeral.
3. **Count:** the numeral becomes a small count target while a set of sleepy
   stars fills the work area. Each tap wakes one star, speaks the next number,
   and advances a visible `count of target` plaque.
4. **Match:** the numeral remains large beside three padded quantity cards.
   The child counts real plush-star sprites and picks a set. A wrong card wiggles
   gently and stays available; earned progress is never removed.
5. **Reward:** a felt rosette and the completed numeral appear with confetti and
   recorded praise. Intermediate rounds offer Next. The final page offers Play
   Again or Pick a Game.

Home appears only on selection and returns to the catalog. Back appears on play
and reward and returns to the in-game selection without reloading the page.

## Core interactions and feedback

### Ordered tracing

- One primary Pointer Event is captured from touch-down through release.
- The first stroke must begin within a generous normalized radius of the glowing
  start dot. Later strokes may resume near the current ordered frontier.
- Dense samples along the authored centerline advance only forward. A short
  look-ahead absorbs fast child motion, while arbitrary mid-path scribbling
  cannot satisfy the numeral.
- Curved glyphs use densely hand-fit centerlines and a small directional arrow.
  Multi-stroke `4` reveals only stroke one at first, rejects the vertical stroke
  out of order, then softens the completed trail and reveals a tactile
  lift-and-restart plaque plus the second start beacon.
- A stroke shorter than 24 rendered pixels is ignored. Completion requires 68%
  ordered coverage, softened to 58% after three meaningful attempts so motor
  effort wins over precision.
- A miss has no penalty. The field pulses immediately; after the second and
  fifth miss the teacher calmly repeats the start instruction.
- `pointercancel`, window blur, screen exit, and controller destruction always
  release transient input. Only one pointer is accepted at a time.
- Enter or Space on the focusable canvas feeds the exact authored path through
  the same controller for keyboard/switch access.

### Counting

- Stars are separate semantic buttons at least 96 CSS pixels where the viewport
  permits. Each accepts one tap only.
- The selected star changes from sleeping to awake raster art, pops, and gains
  `aria-pressed="true"`; the next number word is spoken from the recorded set.
- Completion waits for the final count word to finish before opening the reward,
  so the most important learning beat is never cut off.

### Matching

- Every round presents exactly three unique quantities: one answer and two close
  distractors within 1–9.
- The three cards reuse the coordinated teal, coral, and mustard felt plaques,
  but card color never encodes correctness.
- Wrong choices wiggle and receive a gentle recorded prompt. The right choice
  pops, sparkles, and speaks praise before the reward.

### Audio and coaching

The first real gesture unlocks the reusable recorded-voice channel, shared SFX,
and quiet recorded music. Mode orientation and the concrete action prompt play
as one interruptible sequence. Narration ducks the music and transitions await
the decisive spoken line. Idle coaching begins after 11 seconds and repeats at
10.5-second intervals without taking control away.

## Art inventory

| Child-facing object | Visible renderer | Interaction role |
|---|---|---|
| Coral-stitched quiet-book world and teal pocket | GPT Image 2 raster plate | responsive full-screen backdrop |
| Sandpaper numerals 0–9 | individually cut GPT Image 2 transparent rasters | trace anchor, target, and reward |
| Teal/coral/mustard lesson and quantity cards | individually cut GPT Image 2 rasters | semantic mode/choice buttons |
| Sleeping and awake plush stars | individually cut GPT Image 2 rasters | count buttons and quantity groups |
| Pencil Buddy and rosette | GPT Image 2 rasters | coach presence and reward |
| Sewn `SANDPAPER NUMBER MATCH` hero lockup | focused GPT Image 2 raster edit | selection hierarchy |
| Home, Back, Sound, Replay controls | generated stitched felt rasters | ≥96 px semantic controls |
| Tracing guide, trail, grain motes, start beacon | Canvas | live mechanic only |
| Confetti | shared celebration layer | brief non-blocking reward |
| Catalog tile | local Krea 2 raster | hub discovery image |

No browser emoji, SVG/vector illustration, CSS-drawn physical object, or runtime
model request is part of the shipped experience.

## Spoken script

| Key | Verbatim line |
|---|---|
| `intro` | “Choose a cozy number game.” |
| `journey` | “Trace the sandy number, then count the stars.” |
| `starCount` | “Wake up the sleepy stars. Count with me!” |
| `match` | “Find the patch with the same number of stars.” |
| `trace` | “Start at the glowing dot. Follow the sandy path.” |
| `traceNudge` | “Find the glowing dot, then follow the path.” |
| `traceDone` | “You traced it! Now let's count.” |
| `count` | “Tap every sleepy star. Count with me!” |
| `countNudge` | “Tap a sleepy star and count along.” |
| `matchNudge` | “Count each patch. Which one matches?” |
| `tryAgain` | “Almost. Count the stars and try another patch.” |
| `correct` | “You found the matching patch!” |
| `roundComplete` | “Wonderful number work!” |
| `sessionComplete` | “You are a number star!” |
| `again` | “Let's play with more numbers.” |
| `choose` | “Choose another cozy number game.” |
| `one`…`ten` | “One!” through “Ten!” |

All 26 lines are primary recorded teacher clips created through the approved
Qwen voice-clone workflow and verified by Whisper. Device speech is a per-line
fallback only. Music is `shared/assets/music/whimsical-toy-workshop.mp3` at a
quiet 0.13 volume.

## Responsive and accessibility behavior

- The 4:3 felt plate covers the viewport; decoration may crop, but the working
  area and controls stay within safe-area insets.
- Landscape shows three lesson cards in one row. Portrait keeps the same simple
  row at child-scale, gives the trace board more vertical room, stacks match
  target above cards, and keeps reward actions reachable.
- A fixed-aspect trace stage keeps normalized guides registered to the raster
  numeral across landscape, portrait, and short-tablet layouts.
- Functional prompts and control text remain live HTML with strong contrast
  over blank raster plaques. The decorative generated title is mirrored by a
  screen-reader-only heading. Every control has an accessible name and visible
  keyboard focus.
- Spoken prompts mirror to a polite live region. Muting silences game audio,
  not assistive technology semantics.
- Reduced-motion mode collapses decorative animation and transitions while
  retaining trace marks, state changes, voice, and all inputs.

## Privacy, persistence, and failure behavior

The game requests no permission, records nothing, stores no child data, and
makes no authoring-service request. Missing recorded audio falls back to device
speech. Muted or unavailable music never blocks play. A missing visual asset is
an automated release failure, while its semantic button remains operable.

## `QLOBE_DEBUG` v1

The serializable QA surface exposes:

- `ready`, `listModes()`, `startMode(id)`, `getState()`, `getTargets()`, `tap()`;
- standard `round`, `roundsTotal`, screen, mode, phase, number, lock, mute,
  reduced-motion, and seed state;
- deterministic `seed()`, scaled `fastTimers()`, in-page `home()`, and full mute;
- `trace(points)` and `completeTrace()` through the real trace controller;
- `winRound()` through real trace/count/match completion handlers;
- recorded `getAudioLog()` / `clearAudioLog()` and viewport `getLayout()`.

Automated helpers do not set state directly; they invoke the same child-facing
handlers and transition gates.

## Explicit departures from the concept

- The concept’s main trace→count promise and featured number-three composition
  are preserved. The production game expands that promise into three replayable
  practice modes rather than implementing the brief’s vague hidden-silhouette
  “Feel Shapes” mode.
- Free Count is bounded to authored sets 1–10 instead of 20. Ten fills a tablet
  clearly without shrinking the stars below the interaction floor; higher
  cardinalities would turn the tactile page into a dense worksheet.
- Numerals 1–9 are traceable; 10 is count-only and rendered as coordinated `1`
  and `0` assets. This avoids teaching an invented single-stroke path across two
  separate glyphs.
- Interactive plaques intentionally contain no baked labels. HTML provides
  exact, localizable caregiver text while pictures and recorded voice keep play
  pre-reader-friendly. The one exception is the non-interactive hero title,
  purpose-made as an exact, inspected stitched-felt graphic lockup.
- The backdrop keeps sewing props at the edges instead of filling the mockup’s
  table, protecting a calm central work area across non-4:3 screens.

## Release gate and remaining risk

- Static validation, registry sync, voice integrity, and source/provenance checks
  add no errors.
- Real-Chrome QA completes every round of all three modes, genuine pointer
  traces including ordered two-stroke `4`, keyboard trace access, wrong-match
  retry, real star taps, completion-line mute interruption, navigation,
  recorded voice, landscape, portrait, short landscape, and reduced motion with
  no unexpected runtime error or failed local asset.
- Visual QA captures selection, smooth `2`, staged `4` before and after its
  first stroke, one- and three-star count layouts, match, retry, replay, and
  reward states.
  An independent adversarial Art Director reviews those captures and full-size
  source/alpha sheets against the concept mockups before release.
- Production is re-tested at `https://qlo.be/games/sandpaper-number-match/`
  after the Pages deployment succeeds.
- Remaining non-automatable risk: only a real child using the target iPad can
  establish whether the trace tolerance and three-round pacing feel effortless;
  status remains `beta` until that observation.
