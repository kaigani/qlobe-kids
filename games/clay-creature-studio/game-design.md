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
- Blob opens with twelve color-and-size clay balls and no prefab body. Four balls
  unlock an explicit Decorate My Blob action; only then does the continuous part
  shelf appear. The assembled balls remain movable and are saved as the body.
- A tactile green Wake Up button appears only when the mode's completion rule is
  met. Progress is shown as clay beads and spoken encouragement, not a score.

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

Release requires: registry parity; static validation; zero console/page errors
and zero 404s; real tray drag, edge reach, trash discard, and median mirroring;
save/reload; all six bodies and both modes; 96 px targets; landscape, portrait, wide, and
reduced-motion checks; full-size review of every clay sprite on the workshop
background; and production-style screenshots of splash, workbench, alive, and
shelf states.
