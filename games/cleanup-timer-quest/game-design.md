# Clean-Up Timer Quest — production game design

Status: production replacement · 2026-08-21
Category: practical life · Ages 5–6 · Canonical art world: **Toy**

## Product promise

Clean-Up Timer Quest turns tidying into a tiny dollhouse rescue. The child
chooses a bedroom, playroom, or living room, then helps four scattered toy
objects find two visually matching homes. A gentle musical timer adds momentum
without ever becoming a deadline. When the last object lands, the room brightens,
the floor sparkles, and every object peeks proudly from its basket.

The child should understand the first action within five seconds: four large
objects sit between two large picture-marked containers, and the narrator asks
the child to help them find their homes.

Each room practices one concrete categorisation pair:

1. **Playroom** — plush friends and wooden blocks.
2. **Bedroom** — clothes and picture books.
3. **Living room** — wheeled toys and music toys.

The emotional promise is capability, not speed: “I can make a busy space feel
calm, one thing at a time.”

## Why this replaces the prototype

The registered `cleanup-timer-quest` prototype is a `coach-timer` checklist for
a real-world five-minute chore. The external brief and three concept mockups
promise a tablet-native room-selection and sorting game with tactile toys,
category bins, a musical timer, and a sparkling room transformation. Extending
the checklist engine would put item state, drop targets, wrong-bin modeling,
room art, and per-item rewards into an engine designed around one Done button.

This production replacement therefore keeps the existing id, route, and hub
position but moves to a custom static game. It reuses the shared screen, input,
audio, music, drag, timer, celebration, RNG, and QA modules rather than changing
`coach-timer` for unrelated consumers.

## Screen map

```text
catalog → room chooser / splash
             ├─ bedroom ───┐
             ├─ playroom ──┼→ sorting play → sparkling reward
             └─ living room┘                    ├→ rescue this room again
                                                └→ choose another room
```

- Splash Home returns to the catalog.
- Play and reward Back return to the room chooser in-page.
- Sound repeats the current spoken direction.
- The room cards are immediately playable; there is no redundant Start button.
- The reward screen holds until the child chooses replay or another room.

## Core loop (35–70 seconds)

1. The chosen room opens with four scattered objects and two large, picture-
   marked containers. The musical track begins after the room-intro line.
2. The child drags an object into a container, or taps the object and then taps
   its container. Selection lifts and gently rocks the same raster object.
3. A correct placement follows the finger into the container, plays a tactile
   pop/whoosh, lights one room-progress pip, and speaks brief praise.
4. A different container softly rocks while the object returns to its exact
   authored spot. The narrator models the picture match; there is no X, buzzer,
   score loss, or “wrong” label.
5. If the musical timer reaches the end, it winds itself up again and says,
   “The music keeps playing. Take your time.” Nothing resets and no reward is
   reduced.
6. The fourth placement stops the timer, brightens the room, makes the stored
   objects visible in their homes, and layers sparkle, confetti, fanfare, and a
   warm recorded cheer.

Each room owns six objects, three per category. A seeded round deals two from
each category, so replay changes the four-object set and all floor positions
without changing the sorting rule.

## Interaction rules

- Objects and bins have at least a 96 px effective target and remain readable
  at the iPad Mini portrait width.
- Direct drag uses `createDragToSlotDom`: one active pointer, retained grab
  offset, window-level move/up listeners, pointer-cancel and blur as cancel,
  and stray-ghost cleanup.
- Tap–tap is an equal path through the same `attemptPlacement(item, bin)`
  handler. Tapping a selected object again deselects it.
- During selection, the matching bin gains a soft golden halo after the first
  idle nudge. The first nudge repeats the prompt; the second models the matching
  picture.
- Input locks only for the short landing motion; a round epoch cancels stale
  async completion if the child navigates away during that motion.
- Reduced motion replaces travel arcs, rocking, timer bobbing, and confetti
  with immediate state changes, a static gold outline, and the same audio.
- The timer is a pacing companion, never a success gate.

## Musical timer

The timer is an authored wooden music rail with eight inset lights. Runtime
HTML softly extinguishes the lights as the song continues; there is no numeric
countdown or urgent depletion color. The visible material and wind-up key come
from raster art. The shared `music.js` sample engine plays a quiet 16-beat
vibraphone-and-maracas loop. Voice ducks the music, and all channels unlock on
the first real gesture and revive after an iPad app switch.

Production duration is 42 seconds with a 24-second automatic extension. Debug
timer scaling applies to the countdown, idle nudges, landing motion, reward
beats, and auto-light cadence. Timer exhaustion is explicitly non-punitive.

## Spoken script (verbatim)

| Key | Line |
| --- | --- |
| `welcome` | “The toys need a home! Choose a room to rescue.” |
| `playroom-prompt` | “Help the plush friends and blocks find their baskets.” |
| `bedroom-prompt` | “Help the clothes and books find their homes.” |
| `living-room-prompt` | “Help the wheels and music toys find their baskets.” |
| `plush-home` | “Cuddly friends go in the teddy basket.” |
| `blocks-home` | “Wood blocks go in the block box.” |
| `clothes-home` | “Shirts, socks, and pajamas go in the shirt hamper.” |
| `books-home` | “Books stand together in the book crate.” |
| `wheels-home` | “Wheeled toys park in the wheel garage.” |
| `music-home` | “Music toys rest in the drum basket.” |
| `wrong-bin` | “That basket has a different picture. Try the other home.” |
| `praise-one` | “Perfect landing!” |
| `praise-two` | “You found its home!” |
| `praise-three` | “Cozy and tidy!” |
| `more-time` | “The music keeps playing. Take your time.” |
| `playroom-cheer` | “Playroom rescued! Every toy is home.” |
| `bedroom-cheer` | “Bedroom rescued! Everything is tucked away.” |
| `living-room-cheer` | “Living room rescued! What a sparkling space.” |
| `sparkling` | “You did it! The room is sparkling!” |
| `choose-another` | “Choose another room to rescue.” |

Recorded teacher-voice clips are primary. These exact lines are also the Web
Speech fallback and the Whisper comparison source. Praise rotates through the
three short lines; a correct placement never blocks the next input on a long
sentence.

## Content and art inventory

All child-facing room plates, title art, containers, objects, and timer material
are authored raster assets. CSS/DOM provides layout, hit areas, selection
outlines, masks, functional text, and feedback particles only.

| Asset | Runtime role | Production route | Final target |
| --- | --- | --- | --- |
| `assets/title.webp` | Generated decorative title lockup | GPT Image 2, reference-guided from concept mockup; chroma removal | alpha WebP, about 1000×320, ≤150 KB |
| `assets/scenes/{bedroom,playroom,living-room}.webp` | Full-bleed room plates with open center floor | GPT Image 2, one scene per call, concept screen as style reference | opaque WebP, 1600×1200, ≤300 KB each |
| `assets/rooms/*.webp` | Room-choice card art | deterministic crop from the approved scene plates | opaque WebP, 520×420, ≤90 KB each |
| `assets/items/*.webp` | 18 primary sortable objects | GPT Image 2 coordinated contact sheets on flat key; deterministic cells and alpha cleanup | alpha WebP, 320×320, about 30–70 KB each |
| `assets/bins/*.webp` | Six picture-marked category homes | GPT Image 2 coordinated contact sheet on flat key; deterministic cells and alpha cleanup | alpha WebP, 440×340, about 50–90 KB each |
| `assets/timer-track.webp` | Wooden music rail material | GPT Image 2 Toy UI prop on flat key | alpha WebP, 900×180, ≤100 KB |
| `assets/source/hub/*` | Recognisable hub moment | Studio `menu-game-tile`, Krea 2 `toy-table`, then Qwen Image Edit seed 42 | source retained; curated 640×533 JPEG in the shared hub |
| `assets/audio/*` | 20 recorded teacher lines | Studio/Qwen voice clone, seeds 7→8→9; Whisper QA; AAC final | `.m4a`, manifest, lines JSON |
| shared HUD art | Home, Back, Sound, Play | existing QLOBE raster UI | unchanged |

Room object sets:

- **Playroom / plush:** teddy bear, floppy bunny, little elephant.
- **Playroom / blocks:** red cube, blue arch, yellow roof block.
- **Bedroom / clothes:** star sweater, striped sock pair, moon pajamas.
- **Bedroom / books:** moon picture book, animal picture book, rainbow book.
- **Living room / wheels:** red toy train, yellow toy car, blue toy plane.
- **Living room / music:** small drum, pair of maracas, rainbow xylophone.

Category homes use no generated words. Each carries one large, unmistakable
picture badge: teddy face, three blocks, folded shirt, standing books, wheel,
or drum. Optional HTML room names remain real text for adults and assistive
technology; a child can choose and play from the pictures and spoken prompts.

## Visual direction

The concept mockups are the north star: a handcrafted wooden dollhouse with
painted beech furniture, woven rugs, rounded storage, warm morning light, and
miniature toys. Production follows the canonical **Toy** world, not the current
prototype’s incorrect `storybook-rooms` alias.

- Painted beech edges, wool/fabric softness only where the object calls for it,
  molded and wooden toy surfaces, restrained contact shadows, and generous
  open floor space.
- Sky blue, warm cream, honey wood, moss green, denim blue, coral, and plum.
- No emoji, SVG, CSS-drawn toy, flat vector illustration, photoreal person,
  licensed character, baked functional text, watermark, or glossy casino UI.
- Splash composition echoes the first mockup: large title above three room
  dioramas. Play echoes the second: prompt/timer above, objects in the room,
  two large homes along the lower edge. Reward preserves the real cleaned room
  instead of replacing it with an unrelated card.
- The backdrop center stays calm; important furniture stays out of the HUD and
  portrait crop zones.

## Difficulty and replay variation

- Each room deals four of its six objects, always two per category.
- Seeded shuffle changes object choice, left/right home order, object floor
  positions, praise order, and sparkle positions.
- The first ever Playroom deal is fixed to the mockup’s teddy, bunny, red cube,
  and blue arch so the external concept and first child experience agree.
- Later replays can include the elephant, roof block, alternate items, and
  swapped bin sides. The rule never becomes harder through time pressure.

## Privacy, persistence, permissions, and fallback

The game asks for no permission, records nothing, stores no child data, and
makes no model or content-network dependency part of gameplay. The platform's
optional analytics transport is non-blocking. A tiny local preference may
remember the last room only if the platform already supplies such a service;
it is not required for completion. Missing recorded audio falls back to device
speech, missing music falls back to SFX, and silent play remains understandable
from picture badges, selection halos, and object motion.

## Explicit departures

- **From the prototype:** replace the real-world Done-button checklist and
  five-minute mode with the tablet-native room sorting promised by the brief.
- **From the brief:** “beat the timer” becomes musical pacing with automatic
  bonus time. A deadline is unnecessary pressure for a practical-life routine.
- **From the brief:** omit badge and room-customisation economies. The room’s
  transformation is the intrinsic reward; collectible reward loops are outside
  QLOBE’s no-loot guardrail.
- **From the mockups:** room cards start play directly; the redundant Start
  Quest button is removed. Functional labels are HTML/audio rather than baked
  into generated art.
- **From the mockups:** use picture badges instead of relying on children to
  read PLUSH/BLOCKS.
- **From the drag-only concept:** add an equal tap–tap path for small hands and
  accessibility.
- **From the current config:** canonicalise the world from Storybook Rooms to
  Toy (`toy-table` remains only a local generation-style id).

## Shared modules

- `shared/js/audio-unlock.js`
- `shared/js/celebrate.js`
- `shared/js/debug-harness.js`
- `shared/js/hud.js` and `shared/css/hud.css`
- `shared/js/idle-nudge.js`
- `shared/js/music.js` and `shared/assets/instruments/`
- `shared/js/narrator.js` and `shared/js/voice-clips.js`
- `shared/js/preload.js`, `rng.js`, `screens.js`, `tap.js`, and `timers.js`
- `shared/js/stage/drag-to-slot-dom.js`

No shared module requires a behavior change for this game.

## `QLOBE_DEBUG` v1

The game exposes:

- `ready`, `listModes()`, deterministic `startMode(id)`, `getState()`,
  `getTargets()`, `tap(id)`, `winRound()`, `mute()`, `seed(n)`, and
  `fastTimers(scale)`;
- `wrong()` to exercise the gentle-return branch;
- `expireTimer()` to exercise automatic bonus time without waiting;
- serialisable state: screen, room, phase, item ids/category/placed state,
  home order/counts, selected item, elapsed/remaining time, extension count,
  seed, muted, and reduced-motion status.

Debug taps call the same selection and placement handlers as child input.
`winRound()` places the remaining objects through the same accepted-placement
path rather than mutating completion state directly.

## Release gates

- First action is clear within five seconds and needs no reading.
- Every visible primary object is approved Toy-world raster art; no emoji or
  CSS/vector placeholder survives.
- Drag, tap–tap, deselect, wrong-home return, timer extension, three rooms,
  replay variation, reward, and both navigation loops pass in real Chrome.
- Recorded AAC voice is heard after a gesture and all clips pass intended-vs-
  Whisper transcript comparison.
- Landscape, portrait, 1180×520 short landscape, and reduced-motion captures
  pass visual QC at full useful detail.
- No unexpected page errors, 404s, failed local requests, or runtime model calls.
- Manifest/registry sync, usage index, syntax checks, full validation, and
  game-local smoke suite add zero errors.
- Status remains `beta` until a real child playtest on the target iPad succeeds.
