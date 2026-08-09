# Tangram Tales — Production Game Design

**Status:** production rebuild · **Game id:** `tangram-tales`

**Category:** math-number-sense · **Age:** 4–6 · **World:** Paper Garden

**Supersedes:** the seven-round `build-assemble` emoji prototype at the same route

## Product promise

Seven pieces become a fox, a fish, a bird, or anything the child imagines. The
guided tales build spatial composition without requiring manual rotation; the
open paper stage lets a child arrange and turn the same physical-looking pieces
freely. Every action should feel like moving thick, deckle-edged paper on a warm
storybook table.

The production rebuild makes the platform's freeform composition system useful
beyond clay decoration: explicit rotation, normalized state, reload-safe saves,
and the same direct manipulation in landscape and portrait.

## Learning promise

- **Guided tales:** compose a whole from seven geometric parts and compare size,
  direction, and position.
- **My own tale:** plan and revise a spatial arrangement while naming shapes.
- Only one skill is asked at once. Guided play auto-turns a correctly dropped
  piece; free play exposes rotation only after the piece is selected.

## Screen map and navigation

```text
catalog → tale shelf → guided puzzle → living tale → tale shelf
                    ↘ paper stage → saved creation ↗
```

- Splash Home returns to the catalog.
- A Fox, Fish, or Bird card selects that tale; the large Play button begins it.
- The open-paper card starts the free stage directly.
- Play Back returns to this game's tale shelf, never the catalog.
- Living Tale offers Next Tale and Play Again.
- The free stage offers Done, which opens the saved-creation view; Edit returns
  to the same semantic composition.

## Core loops

### Guided tale (30–75 seconds)

1. Choose Fox, Fish, or Bird from three large illustrated paper cards.
2. The storybook opens with three pieces already modeled in place and four
   tactile pieces in the lower tray.
3. Drag a piece near its matching dashed paper ghost. The ghost warms and pulses.
4. A correct drop auto-turns and settles the piece with a paper tap; the narrator
   names the shape. A miss floats home and invites another try.
5. After all seven pieces land, the dashed guide fades, the scene opens behind
   the figure, and the animal performs a small paper-puppet awakening.
6. Continue to the next unfinished tale or replay the current one.

Tap-select then tap-slot is a complete fallback for children who cannot maintain
a drag. Interchangeable pairs (the two large triangles and two small triangles)
accept either sibling piece.

### My own tale (open-ended)

1. Open the blank paper stage. All seven pieces begin in a generous tray band.
2. Move pieces anywhere. Select a piece to expose one large turn button; each tap
   rotates exactly 45 degrees. Undo restores the previous semantic state.
3. Tap Done after moving at least one piece. The composition receives a paper
   frame and is saved locally.
4. Edit, start fresh, or return to the tale shelf.

No score, timer, locked content, punishment, account, upload, or required text.

## Spoken script (verbatim)

| Key | Line |
| --- | --- |
| `welcome` | "Pick a story. Seven shapes can become anything!" |
| `foxStart` | "Finish the fox. Put each paper shape on its matching spot." |
| `fishStart` | "Finish the fish. Find where each paper shape belongs." |
| `birdStart` | "Finish the bird. Build it from all seven shapes." |
| `freeStart` | "Make your own story. Move and turn the seven shapes any way you like." |
| `coralTriangle` | "Coral triangle." |
| `blueTriangle` | "Blue triangle." |
| `orangeTriangle` | "Orange triangle." |
| `violetTriangle` | "Violet triangle." |
| `tealTriangle` | "Teal triangle." |
| `yellowSquare` | "Yellow square." |
| `greenParallelogram` | "Green parallelogram." |
| `nudge` | "Almost. Try its other paper spot." |
| `turnHint` | "Tap the turning arrow to turn your shape." |
| `foxReveal` | "Amazing fox! Your paper fox is awake." |
| `fishReveal` | "Fantastic fish! Your paper fish can swim." |
| `birdReveal` | "Brilliant bird! Your paper bird can fly." |
| `freeDone` | "A brand-new tangram tale, made by you!" |
| `doneNudge` | "Move one shape first, then your story can come alive." |
| `saved` | "Your paper story is saved on this device." |
| `allDone` | "Three tales are awake. You are a tangram storyteller!" |
| `idle` | "Pick up a paper shape and find the spot that glows." |

Recorded teacher voice is the primary channel. Device speech repeats the exact
line when a clip is missing or cannot decode.

## Art direction and complete art list

Chosen world: **Papercraft / Paper Garden**. The approved concept mockups are the
visual north star: warm cream paper, jewel-color cardstock, visible fibers,
slightly irregular scissor-cut edges, folded physical shadows, scalloped theatre
curtains, and layered garden foliage. No visible vector, emoji, CSS-gradient, or
browser-drawn substitute is part of the final game.

| Asset | Runtime target | Visible renderer | Interaction substrate |
| --- | --- | --- | --- |
| story theatre backdrop | 1600×1200 WebP/JPEG, ≤350 KB | authored full-bleed papercraft room | cover-fit background layer |
| title lockup | alpha WebP, ≤150 KB | authored torn-paper lettering, exact “Tangram Tales” | accessible image |
| fox/fish/bird card plates | three 512×620 alpha WebPs plus the exact seven piece and face sprites | authored textured paper cards with runtime-composed silhouettes | 96px+ HTML radio buttons |
| construction-paper texture atlas | retained source PNG | authored fibers and color variation | deterministic alpha masks |
| seven tangram pieces | alpha WebP/PNG, 160–360 px | texture-clipped raster sprites with irregular paper edges | pointer-enabled HTML images |
| seven ghost pieces | alpha WebP/PNG | desaturated paper reverse of the same raster silhouettes | inert target overlays |
| forest/ocean/sky reveal plates | 1600×1200 WebP/JPEG | authored calm layered story scenes | cover-fit reveal layer |
| face-detail contact sheet | alpha PNG/WebP | authored paper eye and nose accents | inert card/reveal overlays after the seven-piece composition |
| open-stage frame | baked into theatre plate | authored cream paper and deckled frame | freeform board container |
| completion/rotate/undo/done/play/home/back/play-again controls | shared authored platform UI plus authored paper control plates and paper icon sprites | raster artwork | HTML buttons |
| hub tile | 640×533 JPEG | one toy-like tangram fox moment, no text | catalog card |
| Open Graph image | 1200×630 JPEG | real game screenshot | metadata only |
| narration | AAC/M4A + manifest | approved teacher voice clone | `voice-clips.js` with speech fallback |

The seven final piece silhouettes are deterministic raster masks filled from the
accepted GPT Image 2 paper atlas. This preserves exact tangram geometry while
keeping the visible medium authored and tactile. Code controls placement,
rotation, hit testing, and responsive transforms only.

## Puzzle geometry

Every animal uses one canonical seven-piece set: two large right-isosceles
triangles, one medium triangle, two small triangles, one square, and one
parallelogram. Puzzle definitions store normalized center, quarter-size, and
rotation in 45-degree steps. The renderer uses those definitions for ghost,
placed piece, debug target, persistence, portrait relayout, and reveal, so the
visible and interactive geometry cannot drift apart.

Snap acceptance requires both:

- the dragged center falls within the target's forgiving radius; and
- its piece family is accepted by that slot.

Guided mode always resolves to the authored target rotation. Free mode retains
the child's own rotation.

## Interaction and feedback rules

- Every child-facing control and tray piece hit area is at least 96×96 CSS px.
- Pointer events keep the pointer-to-piece offset and finish at window level.
- One active guided drag prevents crossed streams. Pointer cancel/blur restores
  the piece home. Orientation change safely cancels an active drag before layout.
- Correct placement uses a soft paper tap, short settle, warm slot glow, and the
  piece's color plus shape name. Completion adds authored drifting paper stars.
- Incorrect placement never buzzes. The piece floats home and the relevant
  ghost briefly breathes.
- Repeated misses widen the snap radius once and model the destination.
- Reduced motion removes float, confetti, animal bob, and parallax; state changes,
  glow, audio, and the completed composition remain.
- Functional labels are real HTML. Child play remains obvious through image,
  modeling, speech, and spatial correspondence.

## Variation and persistence

- Guided cards retain a local completed star after each tale. Completion is
  celebratory, not a prerequisite for any other tale.
- The selected tale and free-stage composition persist as semantic JSON in
  `localStorage`; failure degrades to session-only play.
- The free board keeps one current composition plus three bounded snapshots.
- A debug seed controls only celebratory paper scraps and small reveal motion;
  puzzle geometry never randomizes.

## Privacy, permissions, and offline behavior

No camera, microphone, location, login, upload, network request, or file-system
permission is used at runtime. All model work is authoring-time only. Saves stay
on the device. If audio is unavailable, the visual modeling and shape glow keep
the full loop playable.

## Departures from the brief, mockups, and old prototype

- The brief's separate toddler color-match mode becomes the forgiving behavior
  of every guided tale; a mode menu would add reading before the core fantasy.
- Manual rotation is intentionally absent from guided play. Auto-turning honors
  the brief and isolates spatial placement for ages 4–6. Rotation remains a real
  creative tool in My Own Tale.
- The mockup's baked labels are rebuilt as HTML so spelling, accessibility, and
  localization stay correct. The title remains authored graphic art.
- Exactly three modeled pieces begin placed, rather than five, giving the child
  four meaningful placements while preserving the mockup's mid-round 5-of-7
  composition after two successful moves.
- The four manual pieces are reshuffled from the full seven-piece set each time
  a tale starts, so replaying a story changes the puzzle without changing its
  authored target figure.
- The old unrelated cat, boat, tree, rocket, house, and flower rounds are removed.
  They diluted the standard seven-piece tangram promise and used browser emoji.
- Japanese praise is omitted; warm concise English matches the platform voice.

## Shared modules used or strengthened

- `shared/js/freeform-board.js` — add explicit bounded transform/rotate APIs,
  preserving normalized snapshots and undo history for every future creator.
- `shared/js/audio-unlock.js`, `voice-clips.js`, `speech.js`, `sfx.js` — first-
  gesture audio, recorded narration, fallback speech, and tactile feedback.
- Shared HUD/screen CSS and authored shared UI assets — navigation and safe-area
  grammar.
- `shared/js/debug-harness.js` — stable `QLOBE_DEBUG` version 1 surface.

Puzzle-specific geometry and guided snapping remain game-local because accepting
shape families and awakening a completed silhouette are tangram semantics, not a
generic drag contract.

## `QLOBE_DEBUG` v1

The surface exposes `ready`, `listModes`, `startMode`, `getState`, `getTargets`,
`tap`, `dragPiece`, `placePiece`, `rotatePiece`, `finish`, `completeRound`,
`mute`, `seed`, `fastTimers`, `snapshot`, `loadSnapshot`, and `clearSaved`.
Debug actions call the same handlers as pointer and button input. State reports
screen, tale, placed count, active/selected piece, miss count, free-board item
transforms, reduced motion, mute, clip playback, and persistence status.

## Known risks and release gate

- Tangram piece alpha edges must be inspected at full size on saturated magenta;
  tiny holes or bright key fringes are a reject.
- The generated title must spell “Tangram Tales” exactly at full size.
- Large rotated pieces must remain reachable in the 820×1180 portrait layout
  and the 1180×520 short-landscape stress viewport.
- Interchangeable triangle swaps, pointer cancel, release outside the board,
  repeat-miss assist, tap-tap placement, rotation undo, reload persistence, and
  storage failure all require explicit QA.

Production acceptance requires: every asset listed above present and budgeted;
zero validator errors, console errors, failed requests, or runtime network calls;
all three guided tales and free play complete in real Chrome; recorded audio
proven after a real gesture; landscape, portrait, short-landscape, and reduced-
motion screenshots reviewed against the mockups; real production deployment
smoke-tested; and a final iPad child playtest before status is promoted from
`beta` to `live`.
