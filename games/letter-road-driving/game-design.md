# Letter Road Driving — production game design

## Product promise

Help five named car friends reach letter-linked destinations on roads shaped
like uppercase letters. The child plans the route with a translucent ghost car;
after the full letter is traced, the solid character drives it with a toy motor
and arrival horn.

Age 5–6 · `writing-fine-motor` · 35–70 second rounds · no reading required.

## Why this concept replaced the beta stub

The concept mockups have a strong, immediate fantasy, while the old registered
prototype was the generic trace-path presentation with an emoji traveler and
dotted guides. This production pass makes Letter Road the flagship for the
shared trace system:

- road rendering with borders and lane dashes;
- game-local raster refs through the shared `game:` art scheme;
- expressive elevated three-quarter character cars that rotate with the path;
- data-driven named-car missions, destinations, and town scenery;
- a separate ghost-planning traveler and solid drive-along replay traveler;
- a matching full-body character-action reward for every A–Z destination;
- explicit numbered multi-stroke formation;
- cloned teacher voice with Web Speech fallback;
- optional named drive/finish SFX;
- Studio-editable `config.json`;
- alpha-floor cleanup in the Studio cutout finalizer.

Those additions remain generic and can serve future maze, map, pre-writing,
number-formation, and route-following games.

## Screen map

1. **Splash / garage** — hero car, title, two large picture-led mode buttons,
   catalog Home.
2. **Road** — Back, progress dots, named mission, letter cue, decorated town
   board, destination, and replay Voice button.
3. **Plan route** — the solid car disappears on the child’s first touch, leaving
   only the translucent planning car to follow the finger.
4. **Road payoff** — the solid car drives the completed gold road with a
   sustained motor, honks at the destination, and the teacher names the letter.
   The matching full-body destination pose actor then pops in from the left,
   frameless and overlapping the road board as the visual reward.
5. **Drive complete** — hero car, spoken celebration, replay this mode.

Back from play/end returns to the splash; only splash Home returns to catalog.

## Modes

### Easy Roads

**One skill:** continuous ordered control on a single connected road.

Thirteen roads: B, C, D, G, J, L, O, P, Q, S, U, V, Z. A new four-road deck is
shuffled and selected on every play. Each begins with one large star and a
direction arrow.
The ghost car stays where the child touches but progress only advances along
the ordered centerline, so wandering does not accidentally skip the letter.

### Letter Town

**One skill:** uppercase multi-stroke order.

Thirteen letters: A, E, F, H, I, K, M, N, R, T, W, X, Y. A new four-letter deck
is shuffled and selected on every play. Every stroke start remains visible and
numbered. Only the current start is fully bright. Completing a stroke prompts
the next number, moves the car there, and preserves the golden road already
driven. Together the two modes provide complete A–Z coverage.

## Spoken script

The canonical text and clip keys live in `config.json`; generated copies live in
`assets/audio/lines.json`. Lines cover welcome, both mode prompts, every road
direction, every letter payoff, gentle off-road help, numbered-stroke handoffs,
and the final celebration. `voice-clips.js` plays the locally cloned teacher
voice and falls back to the exact same line through Web Speech.

## Art and sound

- `letter-road-world-v2.jpg`: gpt-image-2 16:9 countryside plate generated from
  the supplied visual direction, with UI kept live and accessible above it.
- `hero-car.png`: gpt-image-2 tactile three-quarter character render, separated
  with Qwen Image Layered, alpha-QA composite checked, cropped to 640 px.
- `assets/cars/*.png`: five new gpt-image-2 expressive character cars derived
  from the supplied scenario direction. Red/yellow/blue/purple use reviewed
  chroma cutouts; green uses Qwen Image Layered to preserve dark and cream parts.
- `assets/map/destinations/*.png`: 26 unique letter-linked destinations plus a
  bonus Town Hall, generated as three yellow-ground 3×3 gpt-image-2 sheets,
  separated as whole sheets with Qwen Image Layered, then deterministically
  sliced and alpha-QC'd.
- `assets/map/props/*.png`: 18 matching map details from two more 3×3 sheets,
  including cottage, fountain, swings, gazebo, plants, street furniture, and
  small ground details. Props are selected around each path without blocking
  the road.
- `assets/rewards/pose/final/{a..z}.png`: 26 Maya-style full-body
  destination-action rewards, generated separately with gpt-image-2 so each
  actor fills its canvas. The accepted individual renders were assembled only
  for efficient Qwen Image Layered separation, then normalized to 512 px and
  alpha-QC'd. The former sheet-cell reward set remains as unused lineage.
- Roads, start markers, progress glow, and celebrations are procedural Pixi
  graphics so geometry always matches the trace target.
- `vroom`, sustained `motor`, and `honk` are audible zero-file WebAudio effects.
  The long motor is aligned to the completion replay; the horn marks arrival.

## Interaction and feedback

- Minimum 104 px actionable trace start; off-road tolerance 82 CSS px.
- Pointer lifecycle is window-owned and strand-proof. Cancel/blur preserves
  earned progress but releases the active trace.
- Start position and forward progress are ordered; a child can reverse slightly
  without losing progress but cannot jump far ahead.
- A translucent ghost car moves during tracing. The opaque car disappears on
  the first drawing touch, then reappears at the route start only after the
  full letter is complete and drives every finished stroke.
- After the arrival, the ghost stays hidden and the letter’s frameless
  destination-action pose actor pops in at roughly board height. In landscape
  it enters from beyond the board’s left edge; portrait moves it inward so the
  complete silhouette remains visible.
- The full named destination mission is spoken once when a round begins.
  Beginning a stroke never repeats it; later strokes use only their short
  numbered cue. The Voice button remains an intentional replay control.
- A moving demo comet models the route once, then disappears on touch.
- Off-road movement softens the gold trail and pulses the lane. After a gentle
  delay the teacher says, “Oops, a little off road. Follow the white dashes.”
- There is no red X, buzzer, score loss, star economy, lock, or game-over state.

## Replay variation and difficulty

Each run samples four roads from a thirteen-road Easy pool or thirteen-road
Town pool. Difficulty changes by mode: one connected road first, then two- to
four-stroke letters. The full alphabet is available without forcing a
26-round session. A future pack can add lowercase forms as data without engine
changes.

## Privacy, persistence, and fallback

No camera, microphone, network, identity, analytics, or account is used at
runtime. No child data is stored. Authoring-time model calls produced committed
offline assets only. Missing voice clips fall back to local Web Speech; missing
generated art degrades through the shared art resolver without blocking input.

## Departures from the concept mockups

- The mockup’s letter grid and star-unlock economy were removed. Two large mode
  choices reduce reading and avoid extrinsic reward pressure.
- The car is dragged directly rather than steered with a virtual wheel.
- Road geometry is procedural instead of baked into background art, keeping the
  visual road and accepted input path identical.
- The mockup’s Home control during play is Back, following platform navigation.
- Letter Town teaches real multi-stroke order, which the concept promised but
  the stub did not implement.

## Debug and QA contract

`window.QLOBE_DEBUG` exposes engine `trace-path`, `ready`, both modes,
truthful targets, current screen/round/stroke/path/deck sequence, ghost/solid
visibility and traveler gap, replay/reward state, tap, `tracePoints()`,
`winRound()`, mute, and deterministic seed. Production gate:

- repository validator has zero errors;
- both modes complete through the real trace path;
- wrong/off-road path is gentle and recoverable;
- no console errors, asset 404s, or unhandled rejections;
- landscape 1024×768 and portrait tablet layouts remain reachable;
- generated alpha is visually checked on magenta;
- every cloned line has a committed Whisper QA record;
- actual child playtest is still required before changing `beta` to `live`.
