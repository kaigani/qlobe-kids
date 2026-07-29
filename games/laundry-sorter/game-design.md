# Laundry Sorter — production game design

Status: production implementation · 2026-07-28
Category: practical life · Ages 5–6 · Art world: Storybook Rooms

## Product promise

Laundry Sorter turns three familiar household chores into short, satisfying
touch games. A child can sort socks by colour, fold large towels with broad
swipes, or find matching sock pairs. The fantasy is being a capable home
helper: every action makes the bright laundry room calmer and tidier.

Each mode has one skill:

1. **Sort the Socks** — visual colour categorisation.
2. **Fold the Towels** — broad directional swipes and two-step sequencing.
3. **Find the Pairs** — visual matching and working memory.

There are no scores, timers, locked content, ratings, or failure states.

## Why this concept

The beta was a two-mode `sort-into-bins` config with a generic engine splash.
The external concept promises a complete little laundry world with sorting,
folding, matching, and a strong visual identity. The repository's art canon
also names Laundry Sorter as the reference for **Storybook Rooms**, a world
that existed in documentation and a small shared sprite set but did not yet
have a polished flagship.

This replacement makes that style complete and reusable:

- a safe-area-aware full-bleed room plate;
- cut-out props that visibly belong to it;
- coherent glossy DOM furniture over a real environment;
- a strand-proof drag plus equal tap-tap path;
- a reusable interaction recipe for large directional household gestures;
- a complete three-mode practical-life family rather than one repeated engine.

Custom code is justified because no one engine can combine classification,
directional folding, and pair matching under one coherent splash and reward
loop. The existing engines and `shared/js/stage/drag-to-slot.js` remain
unchanged.

## Screen map

```text
catalog → splash / chore chooser
             ├─ Sort the Socks → mode celebration ─┐
             ├─ Fold the Towels → mode celebration ├─ again / another chore
             └─ Find the Pairs → mode celebration ─┘
```

- Splash Home returns to the catalog.
- Every play and celebration screen uses Back to return to the game splash.
- Sound repeats the current spoken prompt.
- Each mode has three large progress bubbles. Progress is local to the current
  round and resets on replay.

## Core loops

### Sort the Socks (45–75 seconds)

Six socks sit on the shelf. Red and blue baskets sit on the floor. A child may
drag a sock into a basket or tap the sock and then tap the basket. A correct
sock arcs and shrinks into the basket; a wrong basket gives a soft wiggle and
returns the sock without changing progress. Three progress bubbles fill after
two, four, and six socks.

### Fold the Towels (35–60 seconds)

One large towel fills the clear work area. A bright dotted fold guide and moving
arrow model a broad horizontal swipe. The towel halves with a soft fabric squash,
then a vertical guide asks for one more fold. The finished towel flies to the
dresser stack. The same large guide is tappable as an equal path. Three towels
complete the round.

### Find the Pairs (35–70 seconds)

Six face-up socks form three colour pairs. The child taps one, then another.
Matching socks clip onto the window line together. Different socks wobble
playfully, remain visible, and are ready for another choice. Three pairs complete
the round.

## Spoken script (verbatim)

| Key | Line |
| --- | --- |
| `welcome` | “It is laundry day! Choose a chore.” |
| `sort-prompt` | “Match each sock to the basket with the same color.” |
| `sort-nudge` | “Almost. Find the basket with the same color.” |
| `sort-cheer` | “Every sock found its basket!” |
| `fold-prompt` | “Swipe across the towel to fold it.” |
| `fold-again` | “One more fold.” |
| `fold-nudge` | “Start on the towel, and follow the arrow.” |
| `fold-cheer` | “Three towels, folded and tidy!” |
| `pairs-prompt` | “Find two socks that match.” |
| `pairs-nudge` | “Those are different. Find the same color.” |
| `pairs-cheer` | “You found every matching pair!” |

Recorded teacher-voice clips are the primary channel. Web Speech uses these
exact lines when a clip is missing or cannot play.

## Art list

| Asset | Runtime role | Intended production |
| --- | --- | --- |
| `assets/room.webp` | Full-bleed play/splash plate | GPT Image 2, 4:3, optimized WebP |
| `assets/towels/*-flat.webp` | Three fold-start towels | Krea 2 Storybook prop → Qwen Image Layered `layer_2` → deterministic WebP |
| `assets/towels/*-folded.webp` | Three finished towels | Same pipeline |
| shared Storybook socks | Sorting and pair cards | Existing QLOBE cutouts |
| shared Storybook baskets | Sort targets and splash set dressing | Existing QLOBE cutouts |
| `assets/hub/tiles/laundry-sorter.jpg` | Catalog tile | Studio `menu-game-tile`, Krea 2 Toy Table |
| CSS bubbles, fold guides, clothespins | Feedback and instructional overlays | Deterministic runtime graphics |
| shared Home, Back, Sound, Play buttons | Navigation | Existing QLOBE UI |

The source room render and every generated media recipe are retained. Text and
controls are HTML/CSS, never baked into generated art.

## Visual and interaction system

- **Storybook Rooms:** yellow stripes, aqua wainscoting, checkerboard floor,
  coral curtains, glossy navy-outlined props.
- The room is cover-fitted; gameplay content stays inside a clamped
  `min(1180px, 92vw)` safe stage so portrait and short landscape crops remain
  usable.
- White/cream control surfaces use chunky navy outlines, layered blue/coral
  shadows, and Fredoka.
- Touch targets are at least 96 px. Gameplay never depends on small text.
- Dragging uses one active pointer, a retained grip offset, window-level move/up
  listeners, pointer-cancel/blur cleanup, and a tap-tap alternative.
- Reduced motion removes bobbing, flying arcs, bubbles, and repeated guide motion
  while preserving immediate state changes and all feedback.
- Wrong actions use a soft wobble and spoken model. No red X, buzzer, score loss,
  or “try again” screen.

## Difficulty and replay variation

- Sort and pair layouts use deterministic seeded shuffles.
- Pair mode chooses three colours from four on each round.
- Fold order rotates orange, aqua, and purple towels.
- The interaction itself stays constant; variation comes from arrangement, not
  surprise rules.

## Privacy, permissions, persistence, and fallback

The game requests no permission, stores no child data, records nothing, and
makes no runtime network call. There is no persistence because every mode is a
short complete routine. Recorded audio falls back to on-device speech; silent
play remains fully understandable from motion guides and picture relationships.

## Departures from the brief, mockups, and beta

- The brief's three-star rating became three neutral progress bubbles. Stars as
  ratings add performance pressure; the bubbles simply show how close the basket
  is to tidy.
- The mockup's text-heavy bottom command bars became a replayable spoken prompt,
  pictorial mode cards, and a shared Sound button.
- The mockup's settings button was removed. The platform has no child-facing
  settings screen; reduced motion follows the device setting and sound repeats
  or mutes through the debug surface.
- The beta's “sort by clothing kind” mode was replaced with the promised folding
  and pair modes. Colour sorting already teaches categorisation more clearly;
  repeating the same engine with different labels was less valuable.
- Exact generated-screen layouts are not copied. The room, hierarchy, palette,
  and tactile fantasy are preserved while safe areas and portrait are rebuilt
  for real UI.

## Shared modules

- `shared/js/sfx.js`
- `shared/js/speech.js`
- `shared/js/voice-clips.js`
- `shared/js/tap.js`
- shared Storybook cutouts and platform HUD art

## `QLOBE_DEBUG` v1

The game exposes:

- `ready`, `listModes()`, `startMode(id)`, `getState()`, `getTargets()`,
  `tap(id)`, `winRound()`, `mute()`, and `seed(n)`;
- `setFastTimers(boolean)` for compressed QA;
- `wrong()` for the current mode's gentle-retry branch;
- serializable state including screen, mode, progress, selected item, fold step,
  and `awaitingInput`.

Debug taps use the same handlers as real child input.

## Release gates

- Every mode, retry, replay, and navigation path passes in real Chrome.
- Recorded voice is heard after a gesture and every clip's Whisper transcript
  matches the script.
- Landscape, portrait, reduced motion, and 1180×520 screenshots pass visual QC.
- No unexpected console error, failed request, missing asset, clipping, or
  target smaller than 96 px.
- Root and per-game manifests agree; usage index and validator pass.
- Production is re-tested at `https://qlo.be/`.
- Status remains `beta` until a real iPad child playtest succeeds.

## Production QA evidence

2026-07-28 local production candidate:

- real Chrome game-local suite: **33/33** checks;
- hub launch, all three modes, real pointer drag, real directional swipes,
  gentle-retry branches, celebrations, recorded AAC teacher voice, replay
  navigation, portrait, 1180×520 short landscape, and reduced motion covered;
- zero unexpected page errors, failed requests, HTTP errors, remote runtime
  requests, or 404s;
- full validator: 154 subjects, 0 errors (23 pre-existing catalog warnings);
- registry sync and usage-index drift checks pass;
- full-detail screenshots reviewed for splash, each play field, success, portrait,
  and short landscape. QC fixed pair-board clipping, trivial same-column pair
  dealing, celebration text overlap, and a debug fast-path readiness race before
  release.
