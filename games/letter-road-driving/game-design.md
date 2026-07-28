# Letter Road Driving — production game design

## Product promise

Steer a cheerful little car along roads shaped like uppercase letters. The child
learns formation through direction and movement: start at the shining marker,
follow the road, then find the next numbered stroke.

Age 5–6 · `writing-fine-motor` · 35–70 second rounds · no reading required.

## Why this concept replaced the beta stub

The concept mockups have a strong, immediate fantasy, while the old registered
prototype was the generic trace-path presentation with an emoji traveler and
dotted guides. This production pass makes Letter Road the flagship for the
shared trace system:

- road rendering with borders and lane dashes;
- game-local raster refs through the shared `game:` art scheme;
- a top-down traveler that rotates with the path tangent;
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
2. **Road** — Back, round dots, spoken direction, square road board, replay
   Voice button.
3. **Road payoff** — the traced lane glows gold, the car honks, teacher names
   the finished letter, next road begins automatically.
4. **Drive complete** — hero car, spoken celebration, replay this mode.

Back from play/end returns to the splash; only splash Home returns to catalog.

## Modes

### Easy Roads

**One skill:** continuous left-to-right/top-to-bottom control on a single stroke.

Four roads: L, U, C, O. Each begins with one large star and a direction arrow.
The car stays where the child touches but progress only advances along the
ordered centerline, so wandering does not accidentally skip the letter.

### Letter Town

**One skill:** uppercase multi-stroke order.

Four letters: A, T, H, K. Every stroke start remains visible and numbered.
Only the current start is fully bright. Completing a stroke prompts the next
number, moves the car there, and preserves the golden road already driven.

## Spoken script

The canonical text and clip keys live in `config.json`; generated copies live in
`assets/audio/lines.json`. Lines cover welcome, both mode prompts, every road
direction, every letter payoff, gentle off-road help, numbered-stroke handoffs,
and the final celebration. `voice-clips.js` plays the locally cloned teacher
voice and falls back to the exact same line through Web Speech.

## Art and sound

- Existing 1600×1200 storybook-neighborhood backdrop is reused as the open play
  world.
- `hero-car.png`: gpt-image-2 tactile three-quarter character render, separated
  with Qwen Image Layered, alpha-QA composite checked, cropped to 640 px.
- `driver-car.png`: gpt-image-2 top-down identity-preserving variant, separated
  and QA'd through the same Studio pipeline.
- Roads, start markers, progress glow, and celebrations are procedural Pixi
  graphics so geometry always matches the trace target.
- `vroom` and `honk` are gentle zero-file WebAudio effects. Desired future
  sourced replacements are a sub-350 ms toy-motor rise and a soft two-note
  beep-beep; gameplay does not depend on them.

## Interaction and feedback

- Minimum 104 px actionable trace start; off-road tolerance 82 CSS px.
- Pointer lifecycle is window-owned and strand-proof. Cancel/blur preserves
  earned progress but releases the active trace.
- Start position and forward progress are ordered; a child can reverse slightly
  without losing progress but cannot jump far ahead.
- A moving demo comet models the route once, then disappears on touch.
- Off-road movement softens the gold trail and pulses the lane. After a gentle
  delay the teacher says, “Oops, a little off road. Follow the white dashes.”
- There is no red X, buzzer, score loss, star economy, lock, or game-over state.

## Replay variation and difficulty

The road set stays stable so motor memory can form. Difficulty changes by mode:
single continuous road first, then two- and three-stroke letters. A future pack
can add lowercase forms as data without engine changes.

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
truthful targets, current screen/round/stroke, tap, `tracePoints()`,
`winRound()`, mute, and deterministic seed. Production gate:

- repository validator has zero errors;
- both modes complete through the real trace path;
- wrong/off-road path is gentle and recoverable;
- no console errors, asset 404s, or unhandled rejections;
- landscape 1024×768 and portrait tablet layouts remain reachable;
- generated alpha is visually checked on magenta;
- every cloned line has a committed Whisper QA record;
- actual child playtest is still required before changing `beta` to `live`.
