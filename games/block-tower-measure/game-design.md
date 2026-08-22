# Block Tower Measure — Production Game Design

## Product promise

Build with equal paper blocks, use a ruler to compare height, and discover a
cheerful robot hiding inside the tower. Every mode makes one early-measurement
idea concrete through touch, sound, and visible unit blocks.

- **Audience:** QLOBE Kids ages 5–6. The concept brief says ages 2–5; production
  keeps the platform audience while using picture-led, preschool-friendly play.
- **Category:** Math & Number Sense.
- **Canonical art direction:** **Papercraft** (`paper-garden` is the legacy
  production style id).
- **Status:** beta until a real iPad child playtest succeeds.
- **Session shape:** three 30–90 second modes; no score, timer, loss, or reading
  requirement.

## Learning promise by mode

| Mode | One skill | Loop |
| --- | --- | --- |
| **Build It Tall** (`build`) | Measure height by counting equal-size units | Hear/see a target 2–6, add equal paper blocks, watch the ruler rise, hear the measured height. Four rounds. |
| **Tower Detective** (`compare`) | Compare taller, shorter, and equal heights | Inspect two towers on one baseline, watch the measuring line, tap the tower (or equal bridge) that answers the spoken prompt. Five rounds. |
| **Robot Workshop** (`robot`) | Explore how adding/removing one unit changes height | Freely build 2–6 blocks, then wake the tower and transform it into a paper robot. Replay without penalty. |

Variable-width stacking from the prototype is intentionally removed. Every
visible unit has the same height so “four blocks tall” is mathematically honest.

## Screen map and navigation

```text
catalog → splash / mode cards
             ├─ Build It Tall → four rounds → celebration → splash
             ├─ Tower Detective → five rounds → celebration → splash
             └─ Robot Workshop → build → robot reveal → rebuild / splash
```

- Splash has the only Home control; it returns to the catalog.
- Play and reward screens use Back; it returns to this game's splash.
- Sound repeats the current prompt; automated QA can mute through the debug
  harness without changing the child-facing control.
- Each meaningful action is at least 96 px and supports pointer, keyboard, and
  semantic `QLOBE_DEBUG` input.

## Core interactions

### Build It Tall

1. The child hears “Build a tower that is four blocks tall.” A large numeral
   card, an empty stitched mat, and a low paper ruler communicate the goal.
2. Loose authored block sprites sit in the bottom thumb zone. Tap a block or
   drag it toward the mat. The block snaps to the next legal unit position;
   exact alignment is never required.
3. Each placement makes a soft pop and increments the visual count. A
   ruler marker rises exactly one unit.
4. Reaching the target draws a dotted measure line, names the result aloud,
   and triggers a brief paper-star celebration before the next round.
5. Tapping an already placed top block removes one unit. This is exploration,
   not a wrong answer.

### Tower Detective

1. Two prebuilt towers share one baseline. Counts range from 1–6 and are never
   distinguished by color alone.
2. The prompt asks for **taller**, **shorter**, or **the same height**. The ruler
   and animated horizontal line model how to compare their tops.
3. The two whole towers are oversized answer targets. On equal rounds, tapping
   either tower is accepted so the concept is not hidden behind a small symbol.
4. A wrong tap causes a gentle paper wobble, replays the measuring line, and
   says “Take another look at the ruler.” The round remains intact.
5. A correct tap names the relationship, awards one paper star, and advances.

### Robot Workshop

1. The child adds or removes equal paper blocks with the same build gesture.
2. With 2–6 blocks present, the large “wake” control becomes active and gives a
   visual pulse. No text is required to discover it: the control carries the
   authored robot face and the narrator models it.
3. On activation, the completed tower wakes a friendly segmented paper robot;
   paper scraps burst outward and the reward changes focus from measuring to
   make-believe. Reduced motion uses a direct crossfade.
4. The robot waves while the prompt reports the number of blocks the child
   built, without claiming the fixed mascot body has that many parts. One
   dominant rebuild action follows. The chosen height is preserved in state.

## Difficulty and variation

- Build sequence: 2, then a deterministic shuffle of 3–6 using the seeded RNG.
- Compare cases cover left/right answers, one-unit and multi-unit differences,
  and exactly one equal-height round. `QLOBE_DEBUG.seed(42)` reproduces order.
- No tower exceeds six units, keeping every unit comfortably visible in 4:3,
  wide landscape, and portrait layouts.
- Idle ladder: repeat the prompt once, then pulse the relevant target at a calm
  interval. Any touch resets the ladder.

## Spoken script (verbatim source of truth)

Runtime keys live in `data/lines.json`; recorded clips use the same text.

- `welcome`: “Welcome to the paper tower workshop! Pick a game.”
- `build-intro`: “Build the tower to match the number.”
- `build-2` … `build-6`: “Build a tower that is [two…six] blocks tall.”
- `measured-2` … `measured-6`: “You measured [two…six] blocks tall!”
- `compare-intro`: “Look at the towers. The ruler can help.”
- `find-taller`: “Which tower is taller?”
- `find-shorter`: “Which tower is shorter?”
- `find-same`: “Which towers are the same height?”
- `gentle-retry`: “Take another look at the ruler, and try again.”
- `success-taller`: “Yes! That tower reaches higher. It is taller.”
- `success-shorter`: “Yes! That tower does not reach as high. It is shorter.”
- `success-same`: “Yes! Both towers reach the same height.”
- `robot-intro`: “Build any tower you like. Then wake up your robot.”
- `robot-ready`: “Ready? Wake up your robot!”
- `robot-celebrate`: “Beep beep! Your tower woke up the robot!”
- `finish`: “Amazing measuring! Your paper towers are terrific.”
- `back`: “Pick another tower game.”
- `idle-build`: “Add the next block to your tower.”
- `idle-compare`: “Tap the tower that answers the question.”
- `idle-robot`: “Build your robot tower, then tap the magic button.”

Recorded teacher voice is the primary channel. `voice-clips.js` falls back to
device speech when a clip is missing or cannot play. Every generated clip must
pass Whisper transcript comparison before it enters the manifest.

## Art list and visible renderers

All primary child-facing objects are authored raster art. CSS/DOM supplies only
layout, hit areas, focus, safe-area transforms, the measurement guide, and
animation; it does not draw blocks, robots, rulers, panels, or reward icons.

| Asset | Final intent | Visible renderer | Interaction substrate |
| --- | --- | --- | --- |
| Workshop backdrop | 1440×1080 WebP, calm center, rich edge dressing | full-bleed raster | background `<img>` |
| Title lockup | transparent PNG/WebP, exact title | raster image | noninteractive `<img>` |
| Five equal unit blocks | transparent 320 px sprites: coral, mustard, teal, lime, violet | raster `<img>` instances | DOM buttons / drag proxies |
| Paper robot | transparent 640 px neutral/cheerful pose | raster `<img>` | reward container |
| Ruler | transparent 128×700-ish prop without numerals | raster `<img>` | inert measure layer |
| Stitched paper panel/mat | reusable transparent blank carrier | raster background image | buttons/cards/mats |
| Paper star and robot-face token | transparent reward/control sprites | raster `<img>` | buttons/particles |
| Hub tile | 640×533 JPEG in existing hub grammar | curated raster | hub link |
| OG image | 1200×630 JPEG captured from final splash | screenshot | metadata only |

Material rules: visible paper fibers, deckled/scissor-cut edges, layered folds,
small stitch details, and soft physical shadows. Palette follows the mockups:
ink blue, warm cream, coral, mustard, teal, lime, and jewel violet. Functional
text remains HTML over blank authored carriers for accuracy and accessibility.

## Motion and feedback

- Block pick-up: 1.04× lift; place: short compression and a soft pop.
- Measure: ruler marker and dotted line travel over 450 ms; line rests long
  enough to inspect before answer input.
- Retry: one bounded ±4° paper wobble; never red flash, buzzer, or removal.
- Reward: authored paper star plus shared confetti. Reduced motion replaces
  travel/bounce with opacity and static star states.
- Robot reveal: semantic tower height is retained; animation is presentation
  only and never blocks Back or replay.

## Responsive and accessibility contract

- Designed around the 4:3 concept screens, then reflows for wide landscape and
  portrait without cropping the towers, ruler, or HUD safe areas.
- Pointer events have one active drag, pointer-to-object offset, window-level
  move/up/cancel handling, and cancel restores the pre-drag state.
- Keyboard/assistive tech can activate every block, tower, and control. Spoken
  prompts mirror to a polite live region. Color is never the only relationship
  cue; count, baseline, top line, and position remain visible.
- `prefers-reduced-motion` suppresses bouncing/confetti-heavy motion.
- The full loop remains playable muted and when recorded audio fails.
- Compact phone layouts keep an inspectable ruler beside the tower and reserve
  the whole live area around the top block below the prompt.

## Shared modules

- `screens.js`, `mode-select.js`, `tap.js`, `hud.js`
- `audio-unlock.js`, `voice-clips.js`, `sfx.js`
- `timers.js`, `idle-nudge.js`, `rng.js`
- `celebrate.js`, `preload.js`, `debug-harness.js`

No runtime model/network calls are allowed; all generated media ships locally.

## `QLOBE_DEBUG` v1

The hook exposes `ready`, `listModes`, `startMode`, `getState`, `getTargets`,
`tap`, `winRound`, `home`, `mute`, `seed`, `fastTimers`, `getAudioLog`, plus
domain helpers `setTowerHeight(height)`, `setCompareCase(left,right,relation)`,
and `revealRobot()`. State is semantic and serializable.

## Departures from source material

- The glossy 3D video is used only for interaction beats. The canonical
  Papercraft mockups control the production world.
- The engine prototype's size-ordering pyramid is replaced by equal-size units;
  mixing width order with height measurement would teach two rules at once.
- Free Stack becomes the bounded Robot Workshop so the fantasy has a satisfying
  payoff and still fits tablet layouts.
- The existing generic `build-assemble` engine is replaced with a custom game;
  it has no evidenced compare-answer phase or free-build/robot state. Shared
  platform modules remain reused.
- Runtime copy is not baked into generated screens. Mockup text is recreated as
  accessible HTML over authored paper carriers.

## Release gate

- No emoji, SVG, canvas/CSS primary artwork, remote assets, or model calls.
- Recorded lines exist, decode in Chrome/Safari-compatible AAC, and pass Whisper.
- Correct and retry paths work for taller/shorter/equal; drag cancel cannot
  strand a block; double taps cannot double-advance.
- No new validator errors, registry drift, console errors, failed requests, or
  missing assets.
- Meaningful screenshots reviewed at 1024×768, wide landscape, and portrait,
  including build, measure, retry, success, robot reveal, and reduced motion.
- Production route and hub launch are smoke-tested after deployment. Status
  remains beta until the target child completes all three modes on a real iPad.
