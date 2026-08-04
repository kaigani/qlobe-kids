# Clay Creature Studio — production game design

**Category:** Art & Music · **Age:** 5–6 · **Status target:** live<br>
**Concept:** `../01-game-concepts/clay-creature-studio/`<br>
**Art direction:** Claymation — warm stop-motion workshop, visible fingerprints,
soft sculpting dents, ceramic turntable, and real photographed depth.

## Product promise

Clay Creature Studio is an open-ended clay toy. A child picks a friendly body,
adds clay eyes and decorations wherever imagination suggests, chooses a talking
mouth, wakes the creature up, and saves the composition to an on-device shelf.
Blob projects begin one step earlier: children assemble the body itself from
different colors and sizes of clay balls before decorating it. There is no wrong creature.

This production pass replaces the generic `build-assemble` emoji prototype. It
makes **freeform composition** reusable and robust: one-pointer strand-proof
dragging from source trays, live z-order, edge-to-edge coordinates, spatial
trash deletion, median-aware part mirroring, serialized snapshots, reload, and
an optional local gallery. The reusable interaction
substrate lives in `shared/js/freeform-board.js`; this game owns the clay-specific
rules, art, choreography, and storage.

## Modes and one skill

1. **Make a Friend** — creative spatial composition. Pick Dino, Monster,
   Unicorn, Blob, Bird, or Dragon, then freely combine faces, top pieces, sides,
   decorations, limbs, and dress-up pieces. An eye, a mouth, and two more pieces
   wake the creature. Blob requires a four-ball body before decoration begins.
2. **Copy a Creature** — visual-spatial observation. A small picture card shows
   a target creature. Place the pictured decoration types on the correct broad
   body zones (head, back, side, belly). Near misses gently snap into the zone;
   other parts remain playful and reversible.

Both loops take roughly 45–90 seconds. Copy mode never scores speed and never
punishes extra decoration.

## Screen map

```text
catalog → splash / project cards → mode choice → clay workbench → alive reveal
               ↑           shelf ↗       ↑             |            |
               └──────────────────────────┴── make another / back ───┘

splash Home → catalog
all deeper Back buttons → splash
Sound → replay the current spoken invitation
```

### Splash

- Full-bleed clay workshop plate, generated clay title lockup, six oversized
  creature project cards, and two pictorial mode buttons.
- Cards use the actual editable body sprites, so promise and play match.
- A small shelf button appears when at least one creature has been saved.
- The concept mockup's separate START button is removed: one tap on a creature
  is the platform-standard reliable action.

### Mode choice

- The chosen creature sits on the ceramic turntable.
- Two 160+ px clay plaques show an open hand (free build) and a picture card
  (copy). Each plaque speaks on tap and starts immediately.

### Workbench

- Back is top-left; prompt/sound is top-right. Both have 96 px hit areas.
- The creature body occupies the calm center of a ceramic turntable.
- A full-width wood-and-clay tray is one continuous horizontal shelf with eight
  eyes, eight talking mouths, eight horns/spikes/manes, eight directional wings,
  eight decorations, eight limbs, and eight dress-up parts. Family plaques mark
  transitions without filtering or hiding anything. A swipe pans the shelf;
  oversized clay arrows page it left and right as a discoverable fallback.
- A tray piece enters the scene only when it is dragged onto the creature. A
  press-and-release does nothing. Placed pieces keep their exact grab offset,
  lift above neighbors, and can reach or slightly cross every stage edge.
- A large clay trash bin sits beside the tray. Dragging a placed part into it
  discards that part. Undo and bulk-clear controls are intentionally absent.
- Asymmetric wings and limbs turn outward during the active drag frame when
  their center crosses the creature's vertical median; the tray ghost follows
  the same rule before a new piece has been dropped.
- Blob opens with twelve color-and-size clay balls and no prefab body. Dropped
  balls fall with weight onto a WebGL turntable and, on landing, become part of
  ONE piece of stored clay (`shared/js/clay/field.js`) — not sprites, and no
  longer a list of blendable primitives. A ball that has not welded yet is still
  loose clay and can be moved or binned; the moment it welds it *is* the
  creature and is sculpted, not handled (see below). Four balls unlock an
  explicit Decorate My Blob action, which locks the clay canvas to pointer input
  and only then reveals the continuous part shelf. The body is rasterized to a
  still image for the shelf and Alive screen and saved as a ~2 KB list of the
  gestures that made it, not as pixels and not as geometry. The other five
  bodies never construct a clay field or load three.js.

#### Blob body — one clay, with no pieces in it

The governing rule, and the whole reason this model exists: **the lump is ONE
piece of clay. It is not made of parts, and nothing a child does can find a part
in it.**

That is a change from what shipped before, and it came from a playtest. The
previous body was a blended union of primitives — beautiful, and the blend and
the seams were loved — but every ball a child welded in stayed in a list, stayed
addressable, and could be dragged back out of the finished creature. The product
owner watched that happen and said:

> The intention is that the green clay should now be a part of the whole and
> behave accordingly, not have an atomic identity.

That is not a request for a better blend. The identity was never visible in the
render; it was visible in the *behaviour*. So the representation changed
underneath: the body is now a stored field of (how far am I from the surface,
what colour is the clay here) sampled on a grid, and there is no accessor
anywhere in the engine by which the game could ask for the green ball back —
not because a gesture is refused, but because the question has stopped having an
answer.

Everything below follows from that one fact.

##### The two things a finger can do

A press on the stage means exactly one of two things, decided by where the finger
landed and not by anything a child has to discover:

- **On a ball that has not welded yet** — move it. It is still loose clay.
- **Anywhere on the creature** — take hold of the material there and pull it.
  The body, the end of a limb, the middle of a limb, anywhere. Every square
  millimetre answers the same way.

There is no third mode, no capture radius, no "adjust that arm", and no place
where the same finger means two different things.

##### Weight, and welding

- **A dropped ball falls with weight.** It is born where the child let go and
  falls straight down until something catches it — clay it has pressed into hard
  enough, another loose ball, or the turntable. It lands with one hard squash and
  two decaying bounces along the contact normal, and then it is still. A ball let
  go somewhere already supported skips the fall and just settles. Nothing keeps
  moving afterwards: the stage is render-on-demand and an idle blob costs **zero
  frames** (measured: 0 renders in 3 seconds).
- **Landing on clay IS welding, and welding is permanent.** The moment a ball
  comes to rest against the creature it is written into the material and stops
  existing as an object. This is the same taught moment it has always been — "the
  second blob places ON the first blob" — implemented at last as the thing it
  always meant. Pushing a loose ball sideways into the creature does the same.
- **A ball that lands on the empty table stays loose.** It has not been used yet.
  It slides under a finger, it can be carried to the bin, and it welds the moment
  it presses into anything. Up to four can be loose at once, which is more than
  the game ever needs, because anything a ball lands on welds it.
- **A resting body sits flat on the table.** The underside sinks slightly into
  the turntable plane and the renderer slices that overlap off, so the silhouette
  goes flat-bottomed and a little wider where it meets the wood.
- **Weight presses DOWN before it does anything else.** A ball that comes to rest
  on top of the creature squashes the column under it: the stack shortens a
  little and the clay it displaces spreads out at the base, where the body meets
  the table. The squash is taken out of the bottom half of the column — where a
  standing column is really under the most stress — and everything above rides
  down as a piece, so the part the child is working on does not change shape
  under their finger. It is a few percent, not a collapse — measured, one ball on a
  three-ball body takes 2.6% off the height and widens the foot by 7.4% — and the
  clay is redistributed, never lost (volume holds to 0.006%). A ball set down on
  bare table squashes nothing, because the table is not clay.
- **And the body stiffens as it thickens.** Each stamp's squash is the new
  weight's share of the column carrying it, so eight identical balls stamped one
  after another compress 0.027, 0.023, 0.021, 0.020, 0.019, 0.017, 0.016, 0.016 —
  always less than the last. A deliberate tall build survives a whole session of
  stamping: those same eight balls leave a creature 1.22 world units high, still
  standing, still not leaning.
- **A creature only falls over when it is REALLY off balance.** The test is the
  one gravity actually applies: where the centre of mass sits relative to the
  footprint the creature is standing on. If the mass is over the base, nothing
  turns — however lopsided the silhouette is, however much is piled on top, however
  much taller than wide it has become. A creature stacked straight up stays up.
- **When the mass IS outside the base, it rolls over.** A head cantilevered off a
  small foot plans 25 degrees, takes that bite, re-measures the footprint —
  which has moved, because different clay is touching the table now — and takes
  another, until the mass is back inside the foot and it stops. That is a fall
  rather than a snap, and it stops where a real one would: balanced, a few
  degrees short of dead level, not with its axis rotated onto the horizon.
- **You cannot fall over in mid-air.** A body clear of the table plans no
  rotation at all, only the drop. It lands first, and the next settle judges the
  balance of a creature that actually has a footprint.
- **It only ever tips in the plane of the screen.** The turn is about the view
  axis and nothing else: a creature never pitches toward or away from the child.
  A body that leans in DEPTH is left exactly alone, because that lean is not
  something the camera shows — correcting it would read not as a topple but as
  the creature quietly changing shape for no reason.
- **A balanced creature settles not at all.** That is what makes settling a fixed
  point: settle twice and the second one does nothing, so a child who works one
  creature for ten minutes never watches it sag shut. The child watches a topple
  as a *pose* — nothing is recomputed during the animation, so the surface cannot
  smear — and the material is re-baked exactly once per step.

##### The clay stays on the screen

- **The top of a creature is never cut off.** Build as tall as the stage allows
  and the clay runs out gently as it approaches the top of the visible table: each
  upward pull gives a little less than the last, so the build slows to a stop with
  a rounded top instead of running off the frame with a flat shear across it. Sixty
  hard upward drags cannot reach the lid.
- **The same is true of every edge.** Nothing the child does — stamping, dragging,
  flinging clay at a wall — can put material against the boundary of the world.
  The limit is measured off the camera, so it moves with the stage on resize and
  rotation, and the sculpting volume's own margin sits behind it as a second,
  independent guarantee for a portrait stage where the two coincide.

##### Pulling is the clay flowing

- **Press and drag and the material moves.** Not a primitive being re-shaped —
  the actual clay under the finger is carried along, and it takes its colour with
  it, because colour is a property of the material at a place rather than a label
  on an object. The brush is a whole hand, not a fingertip — half the creature
  across, and comfortably more than the 96 px a fingertip needs on any stage this
  game runs on.
- **Clay comes away ROUNDED, never as a spike.** The inner half of the brush
  carries the material rigidly, the way a palm does, so the leading surface of a
  pulled limb keeps the curvature it already had instead of being drawn out to a
  point under the exact centre of the touch. It holds however hard the creature
  is worked: long drags, flung fingers and gestures that keep re-grabbing the
  same tip all leave a front still two and a half voxels thick a voxel behind
  itself, where the first build of this engine narrowed to a tenth of that.
- **It never says no.** There is no primitive budget to exhaust (there are no
  primitives), no clay budget to spend, and no wiggle-and-stop. A child can work
  the same creature for as long as they like. Measured over a 110-gesture soak:
  zero refusals, total clay drifting **0.006%**, and the render cost flat
  throughout. The only thing a press can fail to find is clay, and that is the
  table, not a refusal.
- **There is no lobe cap any more.** The old sixteen-primitive ceiling existed
  because the old renderer re-walked its whole primitive list at every step of
  every ray, so cost climbed about 0.85 ms per lobe. This renderer's inner loop
  is one texture fetch and does not know how much clay is in front of it. The
  constraint has stopped existing rather than been raised.
- **A drag that stays tiny does nothing at all.** Under the platform's drag slop
  nothing moves, so a finger resting on the creature never smears it.

##### Stirring marbles the clay, and it does not come back

This is the sharpest edge of the new model and the owner accepted it explicitly.

Drag across a boundary between two colours and the boundary is dragged with the
clay. Stir — an orbiting, folding motion rather than a straight sweep — and the
two colours genuinely mix, and **there is no way to unmix them**. Running the
exact same drag backwards, in reverse order, makes the mixing *worse*, not
better: measured on the live stage, an untouched seam sits at 0.004 mixed, a stir
takes it to 0.164, and the exact inverse drag takes it to 0.221.

Two things fall out of that, both good, and one cost, which is real:

- **Unworked seams stay crisp.** Colour ownership is decided over a single voxel
  at the moment a ball welds, so two balls sitting against each other meet along
  a boundary as sharp as the material allows and stay that way indefinitely.
  Crispness is the default; mixing is something a child has to *do*.
- **Only shear mixes.** A straight back-and-forth drag mostly relocates a still-
  crisp interface and barely mixes anything; it takes a stirring, folding motion
  to marble. That is how real clay behaves, and it means a prompt that wants
  colour mixing has to ask for stirring, not smooshing.
- **The cost:** the previous engine's "actually, I wanted that ball over there"
  recovery is gone. Once clay is joined and worked, it is worked. That is real
  clay, and it is what the owner chose when shown the trade.

##### Getting out of a gesture

There is exactly one undo in this toy, and it lives inside the single
press-drag-release that made it.

- **Let go over the bin, or have the gesture taken away** — a pointercancel, the
  window losing focus, an iPad app switch — and the gesture **never happened**.
  Not approximately: the creature comes back bit-for-bit, colour mixing included,
  because the engine snapshots the material it is about to touch when the gesture
  opens and writes it back. "Approximately" would mean re-pulling in the opposite
  direction, and the paragraph above is why that is not an undo.
- **A pull carried to the bin is reverted, not discarded.** A pull makes no new
  material — it only moves material — so there is nothing to throw away, and
  binning one means the same thing as changing your mind about it.
- **A loose ball carried to the bin is discarded**, exactly as it always was.
- **Once the finger comes up anywhere else, the clay is clay.** There is no
  gesture that reaches back to a shape from five minutes ago, because the way to
  change a shape is to work it again — the same gesture as everything else.

##### The surface

A low-frequency displacement is baked into the material as each ball welds, so
every part of the creature stops being geometrically perfect. Because it is baked
into the clay rather than evaluated against a primitive's frame, a later pull
drags the lumps along with the material instead of the clay swimming through a
fixed pattern in space. It is seeded per creature and the seed is saved, so a
creature looks identical every frame, every session, and on its shelf card.

A falling ball wears the exact lumps it will inherit when it welds, so nothing
about it changes shape at the instant it joins the creature.

##### Reduced motion

With `prefers-reduced-motion: reduce` a dropped ball is born at its resting
height with no fall and no bounce, and the settle jumps straight to its end state
— byte for byte where the animation lands, with the motion skipped. Pulling, the
mid-gesture escape and the bin are unchanged: they are direct manipulation, not
animation.

##### Saving, and every creature ever made

The save is **the list of gestures that made the creature** — where each ball
welded and how the clay was pulled — not its geometry and not its pixels. A
worked creature is about 2 KB (25 ops), against 34 KB for a compressed grid of
the same thing. Replaying it is exact to the last bit, which is what lets the
shelf card be re-derived rather than stored, and lets the same file be replayed
at a finer grid later and simply look better.

Every format this game has ever written still loads:

| format | how it loads | fidelity |
|---|---|---|
| **v5** (today) | replayed directly | exact, byte-for-byte |
| **v4, v3, v2, v1** (lobe documents) | each saved ball becomes a weld, each drawn-out limb becomes a weld plus a short scripted pull along its own axis | **approximate by design** |
| **legacy sprite bodies** (the oldest saves, flat ball art on the freeform board) | unchanged — they still render as their own sprite art | exact; they were never 3-D |

The approximation for v1–v4 is worth being plain about, because it is a real
loss and not a rounding error. What comes back: every ball's position, size and
colour; the axis and rough proportion of every limb; the ground plane; the
creature's surface seed. What does not: the exact taper of the old cone (a pull
conserves volume where the old taper did not, so a drawn-out limb comes back a
little differently proportioned), and the per-lobe identity — which is the
intended change, not a regression. The bar these have to clear is that they load
clean, they look like the same creature at shelf-card size, and they throw no
errors. They do.

Legacy sprite bodies are deliberately *not* converted. They were flat art on a
board, never geometry; re-rendering them as clay would invent depth the child
never made.

##### Progress, and why a child can never get stuck

Progress toward Decorate My Blob counts **balls brought to the lump**, and it is
read off the save itself — the count of welds that came from the tray. Pulling is
not welding and never will be, so no amount of sculpting can fake progress toward
the four-ball gate, and no amount of sculpting can cost it either. There is no
second copy of that number anywhere to drift from this one.

The trap the previous model could produce — spend the primitive budget on limbs
and then have nowhere to put the fourth ball — cannot occur, because there is no
budget. Proved on the live stage: after 110 sculpting gestures the two remaining
balls still land and still weld, and the gate opens.

The rest of the audit, walked end to end:

- A ball dropped somewhere unwanted, **before it welds** — move it, or bin it. A
  dragged ball is clamped to keep its whole self on the canvas *and* inside the
  material grid. It used not to be, and that was a silent trap: a ball pushed
  past the edge landed with its centre outside the element carrying the pointer
  listener and could never be picked up, moved or binned again.
- A ball that has **already welded** — it is the creature now, and the creature
  is the most workable thing in the toy: every press pulls it. Back on the
  workbench header always returns to the creature cards to start a fresh one, and
  nothing has been saved yet to lose.
- A drag that stays under the drag slop does nothing at all.
- A gesture interrupted, or let go over the bin: it never happened, bit-exactly.
- **Colour, once stirred, does not come back.** This is the one genuinely
  irreversible thing in the blob body, it was chosen deliberately, and the way
  out of a colour a child does not want is to add more clay — which is always
  available, in twelve colours, with no limit.
- **There is no refusal left to audit.** The wiggle-and-stop for "the cap is
  full" and "this clay is spent" is gone entirely, because neither condition can
  exist. Nothing in the blob body answers a child's finger with no.
- A tactile green Wake Up button appears only when the mode's completion rule is
  met. Progress is shown as clay beads and spoken encouragement, not a score.

##### What it costs to run

Measured in real Chrome on the development Mac at the shipped DPR cap, on a
1180x820 stage:

| | |
|---|---|
| raymarch, 4-ball creature | 2.9 ms |
| raymarch, same creature after 110 pulls | 2.6 ms — **flat**, and it has no ceiling |
| pull, per advection | 0.6 ms median, 1.1 ms p95, 7.6 ms worst |
| texture upload during a drag | one coalesced 48x32x24 region, 144 KB, 2.0 ms |
| clay drift over 110 gestures | 0.006% |
| idle | 0 renders in 3 seconds |
| save | 2,145 bytes |

The upload figure is the one worth remembering: uploading the same bytes as one
region rather than as sixty-four individual bricks is a **15x** difference,
because the cost is the number of calls and not the number of bytes.

**Not yet measured on an iPad, and this is the open risk.** The physics moved
from the GPU's problem to the CPU's: a pull touches tens of thousands of voxels
in plain JavaScript. On this Mac that is 0.6 ms; a tablet core five to eight
times slower puts it at 3–9 ms, which straddles the frame budget. The GPU side is
strictly better than what shipped before and is flat, so the risk sits in the one
place there are levers for it — a coarser grid halves the pull cost and costs
only the sharpness of a fine taper.

### Alive reveal

- The turntable rotates subtly while the finished creature bounces. The selected
  mouth speaks one of five authored phrases in one of eight cloned caller voices;
  nine canonical viseme sprites (`a o e wr ts ln uq mbp fv`) follow locally
  generated faster-whisper + CMUdict cue timings and return to `mbp` at rest.
- Clay confetti falls; a generated clay banner reads “ALIVE!” while functional
  button labels remain HTML.
- Save stores only a compact semantic composition in localStorage. Nothing is
  uploaded. Make Another returns to the project cards.

### My Shelf

- Up to six saved creatures appear as miniature live compositions on clay cards.
- Tapping a card reopens it on the alive turntable. A parent-facing clear control
  is intentionally absent from the child flow; `QLOBE_DEBUG.clearSaved()` exists
  for QA and local maintenance.

## Core interaction and feedback

1. Child selects a creature and hears its invitation.
2. The tray gently pulses the first useful part (eyes in free mode; the first
   target part in copy mode).
3. A mostly horizontal tray gesture pans; a vertical/diagonal pull gives an
   immediate lift/ghost. Dropping on the stage gives the squish/pop. Releasing
   without travel does not create a piece.
4. A released part keeps its chosen edge-to-edge position. Copy-mode parts remain
   movable and get a warm spoken hint after a pause when a needed kind is absent.
5. Every choice can be moved, discarded, or recreated from the tray. No red X,
   buzzer, timer, or score.
6. When the rule is met, the Wake Up plaque rises and glows. The child chooses
   when to trigger the payoff.

Pointer behavior follows the platform contract: one active pointer, window-level
move/up/cancel listeners, pointer capture when available, actual rendered bounds,
blur cancel, and `touch-action: none`. Reduced motion removes bobbing, turntable
rotation, travel arcs, and confetti drift while preserving state changes.

## Spoken script and mouth dialogue

The UI prompts in `config.json` use the device voice as a fallback. Wake Up
dialogue is authored in `tools/generate-mouth-voices.py`: five phrases for each
of eight mouths, cloned from Growlie, Twinkle, Bolt, Gilly, Ember, Pip, Zoom,
and Luna in Red Green Light. `assets/audio/mouths/manifest.json` is the runtime
source of truth for the 40 local clips and cue timelines.

- `welcome`: “Welcome to Clay Creature Studio! Pick a clay friend to make.”
- `dino`: “A stompy dinosaur. Let’s make it yours!”
- `monster`: “A silly monster. There is no wrong way to make it!”
- `unicorn`: “A sparkly unicorn. Let’s add some clay magic!”
- `blob`: “A bouncy blue blob. Make it as silly as you like!”
- `bird`: “A sunny little bird. Let’s give it a big personality!”
- `dragon`: “A lavender dragon. Let’s build its magical details!”
- `choose-mode`: “Make your own, or copy my creature card.”
- `free-intro`: “Drag clay parts from the tray onto your friend.”
- `copy-intro`: “Look at the little card, then add the same kinds of clay parts.”
- `eyes-first`: “Every clay friend needs eyes. Pick some googly eyes!”
- `decorate`: “Wonderful! Add any clay decorations you like.”
- `copy-nudge`: “Look closely at the picture card. Which clay part comes next?”
- `ready`: “Your creature is ready. Tap the green clay button to wake it up!”
- `dino-alive`: “Stomp, stomp, roar! Your dinosaur is alive!”
- `monster-alive`: “Wibble wobble, giggle! Your monster is alive!”
- `unicorn-alive`: “Twinkle, prance, neigh! Your unicorn is alive!”
- `blob-alive`: “Boing, wobble, pop! Your blue blob is alive!”
- `bird-alive`: “Peep, hop, flap! Your little bird is alive!”
- `dragon-alive`: “Whoosh, sparkle, roar! Your lavender dragon is alive!”
- `saved`: “Safe on your clay shelf. You can visit anytime.”

## Art list

| Asset | Runtime use | Visible renderer | Interaction substrate |
| --- | --- | --- | --- |
| `workshop.webp` | all full-bleed screens | opaque GPT Image 2 clay workshop | responsive CSS background |
| `title.webp` | splash brand lockup | generated clay lettering, alpha PNG/WebP | accessible heading image |
| `dino.webp`, `monster.webp`, `unicorn.webp` | project cards and workbench bodies | authored claymation cutouts | DOM image with body-zone overlay |
| `parts/*.webp` | every manipulable decoration | authored claymation cutout sprites | freeform-board items |
| `mouths/*/*.webp` | eight nine-viseme mouth rigs | fixed-cell GPT Image 2 / Qwen Layered sprites | shared lipsync driver |
| `audio/mouths/*` | five Wake Up lines per mouth | Qwen caller voice clones + local cue generation | HTML Audio + canonical visemes |
| `blob.webp`, `bird.webp`, `dragon.webp` | additional project cards and workbench bodies | authored claymation cutouts | DOM image with body-zone overlay |
| `trash.webp` | discard drop zone | authored claymation cutout | semantic board removal target |
| `alive.webp` | reveal banner | authored clay plaque cutout | decorative image |
| `assets/hub/tiles/clay-creature-studio.jpg` | catalog tile | existing curated toy tile | hub link |

All primary play objects are raster clay art. CSS is reserved for layout, hit
areas, selection rings, prompt plates, progress beads, confetti, and invisible
zone logic. Generated sources remain under `assets/source/`; deterministic
chroma removal, trim, resize, and WebP encoding produce runtime assets.

## Mockup departures

- The DINO / MONSTER / UNICORN cards remain and BLOB / BIRD / DRAGON extend the
  silhouette range; LETTER moves to the existing
  Playdough Letter Factory, which already owns clay letter formation and avoids
  overloading this game's single creative-composition promise.
- The mockup's fixed instruction “Give your dino two eyes” becomes an initial
  audio model followed by genuine free creation.
- Separate green/blue target boards are removed; large body zones and a parts
  tray keep the creature itself as the visual focus.
- Generated celebratory sentences are not baked into the scene. Only the
  decorative `ALIVE!` plaque is raster; all functional labels are real HTML.
- Saving means local semantic composition, not account/cloud storage.

## Persistence, privacy, and failure behavior

- Saves stay in `localStorage` under `qlobe-clay-creatures-v1`, capped at six.
- Storage failure silently degrades to session play; saving is never required.
- No microphone, camera, upload, analytics, network call, or personal data.
- Missing generated art falls back to labeled clay-color discs in development;
  production QA rejects any missing runtime asset or 404.

## Debug and release gate

`window.QLOBE_DEBUG` exposes `ready`, modes, semantic state, targets, programmatic
tap/place/move, `winRound`, mute, fast timers, seed, and gallery clearing.
`adjustProtrusion`, `squashProtrusion` and `pinchOffProtrusion` are gone — no
gesture in the game can do those things any more, and a review hook that
pretended otherwise would stop being a description of the toy. The Blob verbs
are `pullAt(nx, ny, dx, dy, steps)` (the workhorse: it presses at a board point
and RESHAPES the mass under it, reporting `mode` — `reshape` or `branch` —
`created` (how many primitives the gesture cost, almost always 0), and the full
resulting shape including the `tipRatio` that decides the rounded read),
`pullOnLobe(id, t, dx, dy, steps)` (the same gesture aimed along a known mass —
t near 1 keeps elongating, t near 0 pulls the far end, a mid-shaft t with a
sideways delta branches), `binPull(id)`, `settleBlob()` / `blobSettle()`,
`blobSettleLog()` (every settle this stage has run: when, how far the clay
travelled in world units AND in CSS pixels, and whether a merge rode along),
`blobShapes()` (per-mass length / elongation / ra / rb / tipRatio / law),
`blobMergeCandidate()`, `consolidateBlob()`, `blobSeed()` and `lobeVolume()`.
Gravity and the welds are readable too, so neither defect can come back
unnoticed: `blobRest()` reports, per welded component, its centre of mass, the
patch of table it stands on, how far outside that patch the centre of mass hangs
(negative when it is inside), and whether the pose is one clay holds — `stable:
false` means the next release topples it. `blobRestPose(u)` gives the pose that
topple passes through at u in [0, 1], so a driver can prove the rotation is
RIGID rather than a lerp that shears the creature on the way down. `blobWelds()`
lists every join with the contact it is HELD to; a `contact` below its `floor`
would BE the levered-out defect. The settle log carries `resting` and
`restAngle` alongside the travel figures.
State reports `lobes` (the budget), `balls` (what progress counts) and
`protrusions` separately. There is exactly one failure a gesture can report and
it is `no-surface` — the finger is on the table, not on clay. `at-cap` and
`spent` are gone because the conditions they described can no longer stop a
gesture.

Release requires: registry parity; static validation; zero console/page errors
and zero 404s; real tray drag, edge reach, trash discard, and median mirroring;
save/reload; all six bodies and both modes; 96 px targets; landscape, portrait,
wide, and reduced-motion checks; and for Blob:

- a dropped ball that lands ON the turntable, and a ball dropped beside the body
  that welds on landing;
- a real press-and-drag on the welded lump that ELONGATES the ball under the
  finger — the primitive count unchanged, no new mass appearing, the grabbed
  mass longer and narrower than it was, and total clay conserved across the
  gesture to 1e-12;
- that mass keeping its colour through the reshape;
- **the rounded-elongation silhouette, measured off the rendered pixels**: the
  drawn end at least 0.60 of the shoulder's half-width, and the mass visibly
  longer AND narrower after the drag than before it. A spike is invisible to
  every other assertion in this list, so this one is the whole read;
- a sub-slop press creating nothing;
- dragging the far end of an elongated mass continuing the stretch on the same
  mass, with the primitive count unchanged;
- a clearly-sideways drag off a long shaft spawning exactly one primitive,
  rooted and welded to its parent on the frame it appears, obeying the same
  0.60 rounded bound;
- **a no-refusal soak**: at least forty successive gestures all over the
  creature with zero refusals, the primitive count plateauing rather than
  growing, the four-ball count never dropping, and total clay conserved;
- pushing a reshape back before letting go leaving the lump bit-identical, and a
  bin drag discarding a branch with the clay NOT returned;
- **the settle firing after every release and being VISIBLE**: an activation
  logged for each drop and each release, with the plain (non-merging) ones
  between 4 and 60 CSS pixels of surface travel — a floor because it must be
  seen, a ceiling because it must not be healing;
- the settle finishing in ~600ms to a state that is idempotent (settling twice
  matches settling once — the cumulative-sag regression guard) and never
  shortening a mass past 93% of what the child dragged to;
- **the merge**: a same-colour pair rounding together during a settle with the
  primitive count dropping by exactly one and total clay conserved, a
  different-colour pair never merging however deep the overlap, and the ball
  count invariant across every settle;
- a welded ball that can no longer be picked up or re-aimed — only reshaped;
- **gravity rest**: a creature left balanced on one end reporting `stable:
  false` before the release and `stable: true` after it, the rotation logged in
  the settle log, the composite's pairwise geometry preserved through the whole
  rotation (rigid to 1e-12), a creature already lying down and a loose ball both
  reporting nothing to do, and clay under a live finger never rotated;
- **the lever proof**: a welded mass elongated upward and then hauled round the
  clock two dozen times with real pointer gestures, with no join ever dropping
  below the contact it was made at and the mass still welded into the body at
  the end of it;
- a zero-render idle stage, and the raymarch cost probe inside budget at the
  primitive count a long session actually reaches;
- the creature's noise seed surviving a save/reload byte-for-byte; the live
  field serializing as v4; and v1, v2, v3 and older lobe-less sprite-ball saves
  all still loading and rasterizing — with a v3 spike keeping its ORIGINAL
  tapered geometry rather than being retro-morphed into a capsule;

plus full-size review of every clay sprite on the workshop background, and
production-style screenshots of splash, workbench, alive, and shelf states.
