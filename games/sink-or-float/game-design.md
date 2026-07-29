# Sink or Float Lab — game design

Production rebuild of the `sink-or-float` choose-one stub into the flagship
sensorial-science game. Concept source:
`../01-game-concepts/sink-or-float-lab/` (brief + 3-screen mockup).

## Why this game (capability contribution)

1. **Real-time water simulation** — a new reusable stage capability,
   `shared/js/stage/water.js`: spring-mesh water surface, buoyancy bodies,
   splash/bubble particles. No QLOBE game has live physics yet. Future
   consumers: Pouring Station, Melting Race, any liquid play.
2. **Field Journal art world's first production anchor.** The world is defined
   in `docs/art-direction.md` but no shipped game proves it. This game sets
   its plate style (gouache on warm cream paper).
3. **First live sensorial-science game** — the category shelf is all stubs.

## Product promise

You are a backyard scientist with a big glass jar of water. Guess what each
object will do, drop it in yourself, watch what really happens, and stamp the
discovery into your field journal. The water is the teacher; the game never
says "wrong" — a missed prediction is a *surprise*, and scientists love
surprises.

**The one skill:** predict → test → observe (the scientific method, felt
physically through buoyancy).

## Art world

**Field Journal** (category default — `docs/art-direction.md` §4). Soft
gouache/watercolor on warm cream paper `#f7f1e3`; leaf greens, sky blues,
earth browns. Setting: a sunny garden porch table, not a sterile lab. The
water itself is rendered live by `water.js` in translucent watercolor blues so
simulation and plate art read as one painting.

## Screen map

```
Splash (home→catalog)
  └─ mode picker: Predict & Test | Tricky Ones | Water Playground
Play (back→splash)
  └─ round end: journal page celebration → again / back
```

Landscape: object shelf left, glass jar hero center (~50% width), journal
right. Portrait: object strip top, jar center hero, journal becomes a
pull-tab drawer bottom. HUD: standard shared buttons; home only on splash,
back on play/end.

## Modes (one skill each)

### 1. `predict` — Predict & Test (flagship, build first)
Skill: making and testing a prediction.
Round = 6 objects drawn from the 36-object classic pool, balanced 3 floaters /
3 sinkers (see Objects below).

Core loop (~12s per object, ~75s per round):
1. Object pops onto the focus spot; teacher names it ("A rubber duck!").
2. Predict prompt, spoken as a sequence: "What do you think?" → "Will it
   sink," → "or will it float?" Two big guess badges (≥120px) in spoken
   order — SINK on the left (pebble resting on jar floor), FLOAT on the
   right (cork riding the surface line). As each choice clip starts, its
   badge pops slightly larger (~1.18x then settle) so the child hears AND
   sees which button is which. Tap one — badge glows, gentle pop. The Web
   Speech fallback speaks the same three parts and drives the same pops.
3. Drop: the object dangles over the jar. Child drags it over the water and
   releases (or taps it) — it falls from the release point. The child causes
   the experiment.
4. Physics plays out: splash scaled to impact, ripples, bobbing float or
   bubbling descent. ~2–3s to settle.
5. Result: "It floats! It stays on top of the water." Correct prediction →
   "You predicted it!" + sparkle. Miss → "Ooh, a surprise! Scientists love
   surprises." Identical warmth; the truth gets celebrated either way.
6. Journal stamps the object onto its page (floaters above the painted water
   line, sinkers below). Next object.

Round end: full journal page, spoken recap ("The duck, the sponge and the
leaf floated…"), tada + confetti, Play Again / Back.

### 2. `tricky` — Tricky Ones
Skill: reasoning past the "big = sinks" misconception.
Same loop, 6-object tricky pool chosen so size betrays intuition: a whole
watermelon floats, a tiny pebble sinks. Intro line: "Big things can float,
and tiny things can sink!" Watermelon floats *low* (density 0.95) and the egg
sinks *slowly* (1.15) — the sim itself teaches nuance.

### 3. `pond` — Water Playground
Skill: open observation. A random 16-object shelf drawn from all 54 per visit,
no prompts, no rounds.
Drop as many as you like (up to 8 in the jar), scoop them back to the shelf
by dragging them out. Pure sensorial play; also our multi-body stress test.

## Objects (54) — truthful physics only

Rounds are a seeded random draw of 6 from the mode's pool, balanced 3
floaters / 3 sinkers, so every replay is a different experiment set.
Water Playground shows a random 16-object shelf per visit.

Classic pool (mode 1, 36):
float — duck 0.25, wooden-block 0.55, sponge 0.15, cork 0.20, apple 0.85,
leaf 0.10, banana 0.94, lemon 0.90, tennis-ball 0.40, beach-ball 0.08,
pencil 0.50, ice-cube 0.92, candle 0.90, pinecone 0.50, toy-boat 0.30,
flip-flop 0.25, balloon 0.05, stick 0.45;
sink — rock 2.6, key 4.0, coin 6.0, marble 2.5, spoon 5.0, shell 2.2,
fork 5.0, hammer 6.0, magnet 7.0, button 1.35, dice 1.2, toy-car 3.5,
golf-ball 1.15, crayon 1.05 (very slow sinker), domino 1.5, teacup 2.4,
padlock 7.0, bolt 7.0.

Tricky pool (mode 2, 18) — size betrays intuition:
float — watermelon 0.95, log 0.50, orange 0.90, pumpkin 0.90,
coconut 0.85, pineapple 0.95, avocado 0.95, bell-pepper 0.85,
corn-cob 0.70 (big things float);
sink — pebble 2.6, paperclip 5.0, egg 1.15, grape 1.05, cherry 1.05,
raisin 1.4, bean 1.3, screw 6.0, pearl 2.7 (tiny things sink).

Density < 1 floats with equilibrium submersion ≈ density (apple bobs deep,
leaf rests on top); density > 1 sinks with speed scaled by density. Every
value is physically honest — a parent can repeat any experiment in the sink.

## Water simulation (`shared/js/stage/water.js`)

Pure ES module on PixiJS, engine-import rules per `shared/js/engines/README.md`.

- 1D spring column surface (tension/damping/neighbor-spread), rendered as a
  translucent polygon + lighter surface stroke; idle micro-swell.
- Bodies: circle collider, vertical buoyancy `F = (submerged fraction −
  density) · g`, linear drag, gentle rotation wobble; floaters settle to
  bobbing equilibrium, sinkers rest on the floor with a soft landing.
- Splash droplets + rings on entry scaled by impact velocity; bubble trail
  while a sinker descends.
- API: `createWater(container, opts)` →
  `{ addBody(sprite, {density, radius}), removeBody, disturb(x, v),
     update(dt), onSettle(cb), setReducedMotion(bool), destroy() }`.
- Reduced motion: no particles, no bob; object cross-fades to its resting
  position, surface stays calm.

## Complete art list

All generated on the local API, dark-charcoal ground → layered extraction →
trim/resize → webp. Provenance in `ASSETS.md`, sources under `assets/source/`.

| asset | file | size | notes |
| --- | --- | --- | --- |
| Play backdrop | `assets/bg.webp` | 1600×1200 ≤300KB | porch table bottom third, calm center for jar, garden hints at edges |
| Splash hero | `assets/splash.webp` | 1600×1200 ≤300KB | jar + journal + scattered objects tableau, clear title zone |
| Glass jar | `assets/jar.png` | ~900×1100 | empty glass jar cutout, interior mostly transparent |
| Jar highlights | `assets/jar-front.png` | ~900×1100 | glass streak highlights, overlays water |
| Objects ×54 | `assets/objects/<id>.webp` | 400px | gouache style, consistent via style-anchor + qwen-image-edit. A plate that has not landed yet falls back to the object's emoji — never a broken image |
| Guess badge sink | `assets/ui/badge-sink.png` | 300px | pebble below painted waterline |
| Guess badge float | `assets/ui/badge-float.png` | 300px | cork above painted waterline |
| Journal | `assets/journal.png` | ~800×1000 | open notebook page, painted water line splitting float/sink zones |
| Mode icons ×3 | `assets/ui/mode-<id>.png` | 300px | jar+question / watermelon / pond ripples |
| OG image | `assets/og-image.jpg` | 1200×630 | derived from splash |
| Hub tile candidate | `assets/source/hub/tile-candidate.jpg` | 640×533 | Toy Table grammar (krea2, seed 42); staged only — `assets/hub/tiles/` is user-curated |

Style anchor: generate rubber-duck candidates in Field Journal gouache first,
human-approve one, then `qwen-image-edit` every other object from it
("Replace the duck with …, matching the artistic style of the reference").

## Complete voice script (verbatim — the recording list)

Teacher voice clone, seed 7 first, whisper-QA every clip, m4a + manifest.

| key | line |
| --- | --- |
| intro | Welcome to the Sink or Float Lab! Let's find out what the water does. |
| mode-predict | Predict and test! Make a guess, then drop it in. |
| mode-tricky | Tricky ones! Big and small can surprise you. |
| mode-pond | Water playground! Drop in anything you like. |
| tricky-intro | These ones are tricky! Big things can float, and tiny things can sink. |
| pond-intro | This is your water playground. Drop things in, and watch what happens! |
| predict-prompt | What do you think? Will it sink, or will it float? (whole sentence — the idle re-prompt, and the fallback until the two clauses below exist) |
| predict-sink | Will it sink, |
| predict-float | or will it float? |
| drop-cue | Drop it in! Watch closely. |
| result-float | It floats! It stays on top of the water. |
| result-sink | It sinks! Down, down, to the bottom. |
| praise-1 | You predicted it! Great scientist thinking. |
| praise-2 | Yes! Just like you said. |
| surprise-1 | Ooh, a surprise! Scientists love surprises. |
| surprise-2 | Interesting! Now we know something new. |
| journal-stamp | Into your journal it goes. |
| nudge-predict | Pick a guess — sink, or float? |
| nudge-drop | Drag it over the water and let go! |
| end-cheer | Your journal page is full! What wonderful watching. |
| again-prompt | Want to test more things? |
| obj-&lt;id&gt; (54) | One naming line per object, `config.json` → `voice.lines` is the verbatim list ("A rubber duck!", "A rock!", … "A pearl!"). A missing clip falls through to Web Speech with the same words |

Fallback: `voice-clips.js` Web Speech path with the same lines. No clip ships
without a passing transcript.

## Interaction & feedback rules

- Audio unlock (sfx + speech + clips) on first gesture; no speech before it.
- Tap-tap AND strand-proof drag per pattern #11 (window listeners, single
  drag lock, blur = cancel).
- Targets ≥96px (guess badges ≥120px). Wrong-input = gentle wiggle + spoken
  nudge; idle re-prompt once per step.
- A missed prediction is NEVER an error state: same celebration energy,
  "surprise" framing, journal stamps the truth.
- Reduced motion honored throughout (water calm mode, no confetti burst).
- Portrait + landscape; safe areas respected; jar stays the hero.

## Persistence, privacy, fallbacks

No persistence, no camera/microphone, no network at runtime. All audio is
committed clips with Web Speech fallback. Nothing to delete or export.

## Departures from brief / mockup / stub

- Mockup's baked English labels ("Predict", "Sink", "Float", stepper header)
  → replaced by pictorial badges + spoken prompts (pre-reader rule).
- Mockup's clinical lab → Field Journal garden-porch (category art world;
  warmer, and the journal makes the "record your observation" step real).
- Mockup's measurement-marked beaker → simple glass jar; numbers taught
  nothing here and cluttered the hero.
- Stub's choose-one tap-only loop → full drag-drop-simulate loop; the child
  performs the experiment instead of answering a quiz about it.
- Stub's 2 modes → 3 (playground added as free sensorial play + capability
  stress test).

## `QLOBE_DEBUG` (format v1 + extensions)

`ready`, `listModes()`, `startMode(id)`, `getState()`, `getTarget()` (current
object + truth), `predict('sink'|'float')`, `drop()`, `settleNow()` (fast
water), `winRound()`, `setSeed(n)`, `mute()`, `fastTimers(bool)`, plus
`water()` → serializable body/surface state for QA.

## Release gate & risks

- Gate: validator zero new errors; local + production Playwright suite green
  (all modes, both orientations, reduced motion, wrong-input probe, zero
  console errors/404s); screenshots visually reviewed at splash, predict,
  drag-peak, splash-impact, settle, journal, end; stays `beta` until the
  real-iPad child playtest.
- Risks: glass jar transparency in generated art (fallback: draw jar rim in
  code over a simpler art plate); gouache water vs. code water cohesion
  (tune alpha/palette against the backdrop screenshot, not in isolation);
  multi-body pond performance on iPad (cap 8 bodies, pool particles).
