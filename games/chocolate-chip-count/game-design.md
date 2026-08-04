# Chocolate Chip Count — production game design

**Game id:** `chocolate-chip-count`

**Category:** `math-number-sense`

**Ages:** 4–6

**Status at first child playtest:** `beta`

**Art world:** Claymation

**Cast:** Ravi, restyled as a clay mini-chef without changing his canonical face,
skin tone, black wavy hair, or star motif

**Replaces:** the registered `number-line-jump` emoji prototype, which moves to
`archived` when this game is registered

## Product promise

Pop a balloon, sweep Ravi's baking tray under every falling chocolate chip, and
hear the count grow one catch at a time. In 30–70 seconds the child turns an
empty cookie into a real, exactly countable batch and gets a joyful bakery
payoff.

This is QLOBE Kids' first arcade-style action game. Its reusable capability is a
small, deterministic falling-object play loop with touch-follow control,
forgiving recovery, authored raster sprites, and a debug surface that can drive
the physics without relying on wall-clock timing.

## Learning promise

The single skill is **one-to-one counting through movement**: one caught chip,
one landing sound, one spoken number, one visible pip added to the cookie.

- `tiny-batch` — count reliably to 3 while learning the tray gesture.
- `baker-batch` — sustain the count to 6 across three short drops.
- `super-batch` — sustain the count to 10 while scanning a wider play band.

The game also exercises hand-eye coordination and horizontal spatial planning,
but those are interaction demands, not additional assessed skills. There are no
numeral questions, timers, lives, scores, misses, or failure states.

## Screen map and navigation

```text
catalog
  └─ splash / choose a recipe
       ├─ Tiny Batch (3) ─┐
       ├─ Baker Batch (6) ├─> play: pop -> catch -> count -> reward
       └─ Super Batch (10)┘        ├─ Again -> same recipe
                                  ├─ Next -> next recipe (10 wraps to 3)
                                  └─ Back -> splash
```

- Splash has the platform Home control at top left. It is the only link to the
  catalog.
- Play and reward use Back at top left. Back returns to the in-page splash and
  stops the round, physics, timers, narration, and celebration.
- Sound is at top right on splash and play/reward and replays the current
  instruction or praise.
- The three recipe cards are the mode controls. Each shows a clay cookie with
  exactly 3, 6, or 10 authored chip sprite instances. No reading is required.
- A large clay Play control starts the selected recipe. Selecting a card speaks
  its quantity; the 3-chip card is selected initially.
- Reward has two large picture-led controls: Again (replay icon) and Next
  (right arrow). Their accessible labels contain the words.

## Core loop, moment by moment

1. **Choose (3–8 s).** Ravi waves beside the three countable recipe cards. The
   child taps a cookie and hears “Three chips. A tiny batch,” etc. The selected
   card lifts and glows; Play pulses once.
2. **Model (2–4 s).** On first entry only, a clay hand-and-arrows cue glides over
   the tray while the voice says, “Slide the tray to catch every chocolate
   chip.” The cue disappears on the child's first tray movement.
3. **Pop (1–5 s).** Exactly one balloon bobs more than the others. The voice says,
   “Pop the bouncy balloon!” The target is at least 112 px and accepts the shared
   one-press path. Other balloons wait quietly.
4. **Catch (6–20 s per cluster).** The popped balloon releases 1–3 chips. The
   child can touch anywhere inside the playfield and slide horizontally; the
   chef-and-tray sprite follows the finger with a clamped, lightly eased motion.
   Keyboard left/right and A/D are supported for review and accessibility.
5. **Count.** A tray overlap catches the chip. It compresses onto the tray, flies
   to the progress cookie, adds one visible chip pip, and speaks the next count.
   No two count lines overlap; catches that occur together queue in arrival
   order.
6. **Gentle recovery.** A chip that reaches the counter squashes with a soft
   “boing,” then floats back into the open sky after a short beat. It is never
   removed from the target count and never called wrong. After two returns, its
   lateral speed falls and its collision radius grows invisibly by 18%.
7. **Next cluster.** When every chip from the current balloon is caught, the next
   balloon begins bobbing. Counts continue rather than restarting.
8. **Reward (6+ s).** The completed cookie pops forward with exactly the selected
   quantity, Ravi cheers, three clay star medallions land, and restrained clay
   crumb confetti falls. The voice says the cardinal total: “You caught six
   chocolate chips. Great counting!” Again and Next become available after the
   cookie reveal. Reduced motion shows the same final tableau without falling or
   bouncing animation.

## Difficulty data

| Mode | Target | Balloon batches | Fall speed | Horizontal spread | Tray width | Recovery help |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| Tiny Batch | 3 | 1, 2 | 115 px/s | 20% | 38% of play band | immediate wide catch halo |
| Baker Batch | 6 | 2, 2, 2 | 150 px/s | 38% | 33% | wider halo after first return |
| Super Batch | 10 | 2, 3, 2, 3 | 180 px/s | 56% | 29% | slower drift + wider halo after returns |

Speeds are authored in CSS-pixel-equivalent design units and scaled to the live
playfield height. A cluster is intentionally small enough to subitize while the
running count carries cardinality across clusters.

## Physics and input rules

- The visible field is DOM/canvas compositing of authored bitmap sprites. Canvas
  and CSS position the art; they do not draw child-facing cookies, chips,
  balloons, trays, frames, plaques, stars, or buttons.
- Pointer input begins only in the playfield and tracks on `window`, filtered by
  the primary `pointerId`, so leaving the tray or canvas cannot strand control.
- `pointercancel`, blur, visibility loss, Back, and screen teardown all end the
  drag and clear key state. Returning to the foreground re-arms audio unlock.
- Tray position clamps to the actual safe play band. The finger can start
  anywhere; the tray does not jump until horizontal movement exceeds 8 px.
- A chip has a small visible sprite and a larger forgiving circular hit radius.
  Catch detection uses the swept segment between the previous and current
  positions so a low-frame-rate device cannot tunnel through the tray.
- Only the active balloon can pop. It uses `shared/js/tap.js`; HUD taps stop
  propagation and can never pop a balloon behind them.
- First real gesture synchronously unlocks every platform audio channel.

## Responsive layout

- Landscape 4:3 is the visual north star and matches every supplied mockup.
- The bakery plate covers the viewport; the central arched window stays inside a
  normalized safe composition region. Dynamic objects use normalized field
  coordinates, not fixed device pixels.
- Landscape menu: Ravi at left, three cards across the lower middle, title above.
- Portrait menu: Ravi becomes a small bust at upper left, title centers above a
  vertical three-card recipe rail, and Play remains above the home indicator.
- Portrait play: balloons sit below the top HUD, the catch band becomes taller,
  progress cookie moves to the upper center, and the tray uses at least 44% of
  the narrower field in Tiny Batch.
- All action controls have a minimum 96 px target and clear safe-area offsets.
- `devicePixelRatio` is clamped to 2. The canvas resizes without restarting the
  round; normalized positions survive rotation.

## Visual direction

The supplied mockups are the hierarchy and mood reference: warm cream-tile
bakery, wooden counter, arched blue-sky window, saturated balloons, tactile
silver tray, and a delighted mini-chef. Their one-off chef is replaced with Ravi
to follow the recurring-cast rule.

Claymation applies to the entire child-facing field:

- visibly hand-shaped polymer clay with soft fingerprints and tiny edge
  irregularities;
- warm stop-motion studio lighting and compact, toy-safe proportions;
- cookie brown, butter yellow, strawberry red, mint green, powder blue, warm
  cream, and silver-gray;
- no glossy generic CGI, emoji, flat vector objects, CSS-drawn cards, CSS-drawn
  cookies, or procedural balloon/chip shapes;
- runtime text is limited to accessible support and short action words on top of
  authored clay button art. The decorative title is a generated image lockup.

The background remains calm in the center so falling chocolate chips read at a
glance. Shelves and utensils live at the edges. Dynamic chips have a pale baked
highlight and a soft dark underside, giving good contrast against both sky and
cream tile.

## Child-facing art inventory

| Asset | Final size / format | Visible renderer | Interaction substrate |
| --- | --- | --- | --- |
| Bakery backdrop | 1600×1200 WebP/JPEG, ≤300 KB target | authored clay bakery plate with Ravi-free central window and counter | full-bleed responsive image |
| Title lockup | ~1100×430 alpha WebP/PNG | cookie-plaque “Chocolate Chip Count” lettering | noninteractive image |
| Ravi chef + tray | ~900×900 alpha WebP | canonical Ravi in clay chef clothing holding wide tray | positioned DOM image controlled by pointer/keys |
| Balloon set | 3 × ~300×400 alpha WebP | red, butter-yellow, powder-blue clay balloons | 112+ px buttons, active-state animation |
| Chocolate chip | ~144×144 alpha WebP | single chunky clay baking chip | repeated canvas/DOM sprite + physics body |
| Cookie base | ~520×520 alpha WebP | plain baked clay cookie, no chips | composed with exact chip instances |
| Recipe frames | 3 × ~620×620 alpha WebP | mint, yellow, blue clay-rimmed cream cards | 96+ px mode buttons |
| Progress plaque | ~520×220 alpha WebP | cream cookie-dough plaque with brown edge | count pips positioned above it |
| Red action button | ~720×230 alpha WebP | blank strawberry-red clay button | HTML button + runtime label/icon |
| Star medallion | ~240×240 alpha WebP | gold clay star coin | repeated reward image |
| Gesture cue | ~620×240 alpha WebP | green arrow, clay hand, blue arrow | first-play instructional overlay |
| Pop puff | ~260×260 alpha WebP | white/blue clay starburst crumbs | short-lived pop effect image |
| Hub tile | 640×360 JPEG | custom crop/tableau with title and chip action | catalog image |
| Social card | 1200×630 JPEG | custom crop/tableau with title and Ravi | metadata image |

Every final cutout is checked on magenta and on the bakery plate at gameplay
size. Source generations and final prompts are retained in `assets/source/`.

## Complete spoken script

These lines are verbatim and become `assets/audio/lines.json`.

| Key | Spoken line |
| --- | --- |
| `welcome` | “Welcome to Chocolate Chip Count! Pick a cookie.” |
| `pick` | “Pick how many chocolate chips to catch.” |
| `mode-3` | “Three chips. A tiny batch.” |
| `mode-6` | “Six chips. A bigger batch.” |
| `mode-10` | “Ten chips. Super chef challenge.” |
| `move` | “Slide the tray to catch every chocolate chip.” |
| `pop` | “Pop the bouncy balloon!” |
| `pop-next` | “Pop the next balloon!” |
| `count-1` | “One!” |
| `count-2` | “Two!” |
| `count-3` | “Three!” |
| `count-4` | “Four!” |
| `count-5` | “Five!” |
| `count-6` | “Six!” |
| `count-7` | “Seven!” |
| `count-8` | “Eight!” |
| `count-9` | “Nine!” |
| `count-10` | “Ten!” |
| `boing` | “Boing! That chip is coming back.” |
| `idle-pop` | “Tap the wiggly balloon.” |
| `idle-catch` | “Slide the tray under the chocolate chip.” |
| `complete-3` | “You caught three chocolate chips. Great counting!” |
| `complete-6` | “You caught six chocolate chips. Great counting!” |
| `complete-10` | “You caught ten chocolate chips. Great counting!” |
| `again` | “Bake another one!” |
| `next` | “Ready for the next recipe?” |

Count clips are short and never interrupted by praise. If two catches arrive in
one animation frame, their numbers are queued and the visual pips appear in the
same order. Recorded teacher voice is preferred; `shared/js/voice-clips.js`
falls back to Web Speech from the same line table.

## Sound and music

- Balloon pop: shared `sfx.pop()` layered with a short low paper/clay thump.
- Catch: shared tick/pop at a pitch that rises very slightly with count; spoken
  number supplies the semantic feedback.
- Return: shared silly/boing sound, never a buzzer.
- Reward: shared tada plus clay crumb confetti.
- Backing music is optional and low. If used, it starts only after a gesture,
  ducks under voice, and stops on Back or hidden page. The first production pass
  prioritizes voice intelligibility and tactile effects over a generic loop.

## Replay variation

- Balloon colors shuffle deterministically with the game RNG.
- Cluster spawn x positions vary inside the mode's band while preserving at
  least one catchable route.
- Chips use one of three small rotations and two fall wobbles from code applied
  to the same authored sprite.
- The target count never varies away from the chosen cookie; visual and spoken
  quantity always agree.

## Privacy, persistence, and permissions

No microphone, camera, network request, account, analytics, personal data, or
saved media. Authoring-time model calls never ship. The game runs offline from
committed files. No local storage is required; the default selection resets to
three on reload.

## Shared modules

- `shared/js/audio-unlock.js` — audio fan-out and kiosk guards.
- `shared/js/tap.js` — one press path for recipe, balloon, and action controls.
- `shared/js/hud.js` + `shared/css/hud.css` — platform navigation and replay.
- `shared/js/voice-clips.js` + `shared/js/speech.js` — recorded voice with safe fallback.
- `shared/js/sfx.js` — tactile feedback.
- `shared/js/celebrate.js` — reduced-motion-aware confetti and tada.
- `shared/js/timers.js` — idle nudges, recovery beats, and QA time scaling.
- `shared/js/rng.js` — deterministic variation.
- `shared/js/debug-harness.js` — standard review hook.

The local game owns the falling-object controller first. Promotion to
`shared/js/arcade-catch.js` is only justified after this game and a second
consumer prove the abstraction.

## `window.QLOBE_DEBUG` v1

Required surface:

- `ready`, `listModes`, `startMode`, `getState`, `getTargets`, `tap`,
  `winRound`, `mute`, `seed`, `fastTimers`, and `home`.
- `getState()` additionally reports `phase`, `target`, `caught`, `balloonIndex`,
  `activeChips`, `returnedChips`, `trayX`, `reducedMotion`, and audio readiness.
- `tap('balloon-N')` calls the same pop handler as the real button.
- `winRound()` catches every remaining chip through the same `catchChip()` path
  and resolves after the reward screen is awaiting input.
- `setTrayX(normalizedX)` and `dropNext()` let browser QA exercise collision
  edges without synthetic dragging.
- `missActiveChip()` forces one real gentle-return cycle.
- `getAudioLog()` / `clearAudioLog()` expose requested voice keys and whether a
  recorded clip or fallback backed each line.

## Explicit departures

| Source | Departure | Reason |
| --- | --- | --- |
| Brief | One-off mini-chef becomes Ravi | Recurring cast is platform canon; Ravi's warm expression and star shirt translate naturally into a chef coat and star badge. |
| Brief | Difficulty stops at exactly 10, not “10+” | Exact visual/spoken agreement matters more than endless escalation for ages 4–6. |
| Brief/video | Missed chips return instead of being lost | No lives or failure; the target quantity stays concrete and completion is guaranteed. |
| Brief/video | One balloon cluster is active at a time | Prevents divided attention and keeps subitizable groups while retaining arcade motion. |
| Mockups | Recipe cards are composited from a blank cookie plus exact chip sprites | Generated images are unreliable for exact quantities; authored sprite composition guarantees 3/6/10. |
| Mockups | Functional labels remain HTML over blank clay button assets | Preserves readable, accessible controls without making CSS shapes the visible art. |
| Art-direction doc | Claymation is used as the user-selected art world even though it is not yet one of the five catalogued defaults | The task explicitly selects Claymation. The implementation still obeys the common HUD and interaction grammar. |
| Old prototype | Frog/lily-pad collect and takeaway modes are removed | The chosen concept replaces the stub. Its movement-linked one-to-one counting promise survives in a stronger catch-and-count loop; subtraction did not fit the selected brief. |
| Concept video | Glossy 3D UI, nonsense difficulty copy, and device bezel are discarded | Supplied clay mockups are the visual north star and the UI must be readable and platform-native. |

## Known risks and mitigations

- **Exact chip quantities in generated art:** dynamic cookies are composed from
  a plain authored cookie and repeated authored chip sprite. QA asserts DOM and
  debug counts.
- **Transparent clay hair/hat edges:** Ravi is generated on flat magenta with
  hard clay shapes, then locally keyed, despilled, and reviewed on magenta and
  bakery backgrounds. If the cutout fails, regenerate with a simpler silhouette
  before considering a native-transparency model change.
- **Portrait crowding:** menu and play screenshots at 768×1024 are a release
  gate; controls may reflow but no target may shrink below 96 px.
- **Falling-object flakiness:** debug `winRound`, swept collision, normalized
  coordinates, and seeded spawn positions make the mechanic testable.
- **Voice overlap:** a serialized number queue and `voiceClips.stop()` on screen
  transitions prevent cross-screen narration.

## Release gates

1. Every asset above exists, has recorded provenance, fits budget, and passes
   foreground material-fidelity review.
2. Static validators, syntax checks, config/manifest parity, and asset-usage
   index pass.
3. Local and production-like servers report zero console errors, failed
   requests, or case-sensitive path mismatches.
4. Automated Chrome QA drives every mode, one miss/recovery, navigation routes,
   audio log, fast timers, reduced motion, and rotation-safe layout.
5. Landscape and portrait screenshots are compared at full size to the supplied
   mockups, with separate checks for hierarchy, foreground clay fidelity,
   exact counts, safe areas, and readable action.
6. The catalog entry archives `number-line-jump` and registers this game in the
   same math shelf without duplicate live concepts.
7. Status stays `beta` until an iPad child playtest confirms the tray feels good;
   only that sign-off authorizes `live`.
