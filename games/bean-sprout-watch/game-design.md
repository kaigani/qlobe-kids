# Bean Sprout Watch — production game design

**Category:** `sensorial-science`
**Audience:** ages 3–6
**Status at handoff:** `beta` until a child succeeds on a real iPad
**Art direction:** **Watercolor / Storybook** (legacy production style id: `field-journal`)
**Route retained:** `games/bean-sprout-watch/`
**Replaces:** the emoji `observe-journal` prototype at this same id and route

## Product promise

Bean Sprout Watch is a tiny, tactile botany journal. A child helps one smiling
bean pot through five visible days of growth: give it water, give it sunshine,
draw the new plant part, and watch the sketch become a living watercolor
sprout. Every day ends with a Nature Explorer badge and a clear comparison to
the day before.

The child should understand the whole fantasy within five seconds: the current
day glows, the pot looks expectant, and the two large care tools invite taps.
The experience is a simulated five-day sequence, not a real-time calendar. No
child waits 24 hours to continue, and no streak, score, timer, or failure state
exists.

## Learning promise

The one core skill is **observing change over time**. The supporting actions
serve that skill:

1. Water and light connect growth to care.
2. A large, forgiving trace asks the child to attend to the *new* structure.
3. The transformation makes before/after change unmistakable.
4. The day journal establishes seed → root → shoot → first leaves → fuller
   plant as an ordered life-cycle sequence.

Fine-motor practice is a benefit, not a precision test. A meaningful attempt
always succeeds with enough coverage; off-guide marks remain playful green
pencil marks and never trigger a red X or buzzer.

## Core loop

```text
five-day journal
  → choose the glowing current day
  → tap WATER and SUN in either order
  → trace the day’s new root/stem/leaf guides
  → sketch blooms into the next authored plant state
  → Nature Explorer badge + spoken observation
  → next day (or completed journal)
```

One day lasts about 35–70 seconds. All five days take about 4–6 minutes. A
completed day remains replayable from the journal; replay does not erase later
progress. The final celebration offers **Watch it grow** (a quick five-stage
time-lapse) and **Grow again** (explicitly resets the local journal).

## Screen map and navigation

### 1. Journal / splash

- Full-bleed sunlit field-journal backdrop.
- Generated `Bean Sprout Watch` watercolor title lockup.
- Five authored day cards arranged as a growth strip. Each card shows the
  correct plant state, not a browser emoji or CSS drawing.
- The next incomplete day gently breathes and carries the large play action.
- Completed days carry a painted leaf badge and can be replayed.
- Future days are visible as pale paper tabs, but do not pretend they are
  failures. Tapping one speaks, “That sprout day is still growing. Start with
  the glowing day.”
- Home is top-left and returns to the catalog. Sound is bottom-left.

### 2. Care and draw

- Back is top-left and returns to the journal without losing saved progress.
- Sound is bottom-left and repeats the current spoken prompt.
- A five-petal/day progress vine is decorative and aria-hidden.
- The authored pot and current plant state sit in the middle of a warm paper
  observation page.
- WATER and SUN are authored watercolor tool tiles with invisible, forgiving
  hit regions of at least 112 px.
- Tools can be tapped in either order. Each becomes visibly “used” for this
  day: water droplets soak into the soil; warm rays and a slight lean show
  phototropism. Tapping a used tool replays its small response but cannot
  corrupt state.
- Water and Sunshine cards also support direct manipulation: drag either card
  toward the observation page and a semi-transparent watercolor ghost follows
  the pointer; dropping on the pot accepts the same care action as a tap.
- After both care actions, dashed pencil guides appear. The guide and the
  narrator identify only what is new that day.
- A real canvas overlays the authored art. The canvas is the interaction
  substrate; the visible plant remains authored raster artwork.

### 3. Growth reward

- The child’s green strokes glow, the dashed guides fade, and the old plant
  cross-grows into the next authored state with a stem stretch and leaf-open
  motion.
- Water bubbles, a soft leaf rustle, a celebratory chime, and a short spoken
  observation layer in that order.
- A generated Nature Explorer badge lands beside the pot.
- The primary action is **Next day**. On Day 5 it becomes **My journal**.
- Reduced motion swaps the stage instantly, keeps the chime and narration, and
  shows the badge without confetti or scaling animation.

### 4. Completed journal

- All five day cards are filled and joined by a painted vine.
- The five-stage plant time-lapse can be replayed without altering progress.
- **Grow again** is an explicit two-step reset: first tap reveals a warm
  confirmation carrier; second tap starts a fresh bean. Back returns to the
  regular journal. No destructive reset is hidden behind the Back button.

## Day-by-day science and trace plan

The pot is always the same recognizable character. “Before” is the saved state
at the start of a day; “after” is the state revealed after tracing.

| Day | Before → after | What care changes | Trace target | Spoken observation |
| --- | --- | --- | --- | --- |
| 1 | bean → pale root | soil darkens; seed warms | one soft curve down from the bean | “A first root reaches down to find water.” |
| 2 | root → hooked shoot | root plumps; shoot leans toward light | one broad hook rising from the soil | “The shoot pushes up and turns toward the light.” |
| 3 | shoot → two seed leaves | stem straightens | **exactly two leaf loops**, matching the concept mockup | “Two seed leaves open like tiny green hands.” |
| 4 | two leaves → two larger true leaves | leaf color deepens | two larger pointed leaf loops | “The first true leaves spread out to catch sunlight.” |
| 5 | two leaves → four-leaf young plant | stem gains height | two new side leaves on the stem | “New leaves make the little bean plant fuller.” |

Day 3 is the visual anchor from the supplied mockup: one stem, exactly two
dashed leaf guides, water at left, sun at right, and the smiling terracotta pot
centered below.

## Forgiving trace recognition

Each day stores one or two normalized target polylines in `config.json`. The
runtime resamples each target into evenly spaced checkpoints. Pointer strokes
are also stored in normalized coordinates, so rotation and resize do not erase
the attempt.

Recognition rules:

- one active primary pointer; Pointer Events with capture;
- pointer cancel, blur, screen exit, and orientation change safely end the
  active stroke;
- an input point covers every target checkpoint inside a generous radius;
- coverage is accumulated across strokes and never taken away;
- each target is complete at 58% coverage, with a 32 px minimum total gesture
  length to reject an accidental dot;
- after three meaningful strokes, the completion floor softens to 45%;
- after two idle nudges, a traveling glow models the next uncovered segment;
- no off-guide stroke is marked wrong;
- the visible drawn line is a textured watercolor brush stamp, not a plain
  vector-looking `canvas.stroke()` line;
- while tracing is active, the canvas is exposed as a focusable button with a
  strong focus ring; Enter, Space, or switch activation follows the authored
  guide through the same recognizer, so fine-motor input remains a benefit
  rather than a barrier to the observation lesson;
- `prefers-reduced-motion` removes traveling and pulsing hints.

This is deliberately “smart enough to notice the child’s intent,” not
handwriting assessment. QA must prove both a close trace and a loose preschool
attempt can finish, while an isolated tap cannot.

## State and persistence

The semantic state is:

```js
{
  version: 1,
  completedDays: [1, 2],
  selectedDay: 3,
  badges: [1, 2],
  lastVisitedAt: 0
}
```

It is saved locally under a versioned key. No account, child name, drawing
image, or microphone input is stored or transmitted. The only remote runtime
request is the platform-wide GA4 pageview loaded by `shared/js/analytics.js`;
the game adds no event tracking and sends no child or save-state data. The
runtime never calls an authoring/model service. Invalid or future-version save
data is ignored safely.

Completed days may be replayed. The current day is the lowest incomplete day.
Future days are preview-visible but not startable, preserving the sequence
without real-time gating. Day 5 completion unlocks the time-lapse and reset.

## Exact voice script

Recorded teacher voice is primary; exact Web Speech text is the offline
fallback. Music ducks under every line.

| Key | Verbatim line |
| --- | --- |
| `welcome` | “Come watch a little bean grow. Tap the glowing day to begin.” |
| `choose-day` | “Pick the glowing sprout day.” |
| `future-day` | “That sprout day is still growing. Start with the glowing day.” |
| `day-1-intro` | “Day one. The bean is resting in the soil. Give it water and sunshine.” |
| `day-2-intro` | “Day two. A tiny root is awake. Give it water and sunshine.” |
| `day-3-intro` | “Day three. A green shoot is reaching up. Give it water and sunshine.” |
| `day-4-intro` | “Day four. Two little leaves are open. Give them water and sunshine.” |
| `day-5-intro` | “Day five. Our bean plant is getting tall. Give it water and sunshine.” |
| `water` | “Drip, drop. The roots drink a little water.” |
| `sun` | “Warm sunshine helps the leaves make food.” |
| `care-ready` | “Now draw what is new. Follow the glowing garden line.” |
| `trace-1` | “Draw the bean’s first root reaching down.” |
| `trace-2` | “Draw the little shoot pushing up.” |
| `trace-3` | “Trace the two seed leaves.” |
| `trace-4` | “Trace the two bigger true leaves.” |
| `trace-5` | “Draw two new leaves on the stem.” |
| `trace-nudge` | “Start where the light is twinkling, then follow the garden line.” |
| `care-nudge` | “Our bean is waiting for water and warm sunshine.” |
| `success-1` | “Look! The bean’s first root reaches down to find water.” |
| `success-2` | “Look! The shoot pushes up and turns toward the light.” |
| `success-3` | “Look! Two seed leaves opened like tiny green hands.” |
| `success-4` | “Look! The first true leaves spread out to catch sunlight.” |
| `success-5` | “Look! New leaves made our little bean plant fuller.” |
| `badge` | “Nature Explorer badge!” |
| `all-grown` | “You watched a bean become a young plant, one careful day at a time.” |
| `reset-check` | “Grow a brand-new bean? Tap the seed one more time.” |
| `reset-done` | “A new bean is ready for day one.” |

## Audio design

- Teacher voice: `qwen3-tts-voiceclone`, seed ladder 7 → 8 → 9, every output
  checked by unconditioned Whisper and published only when the normalized
  transcript matches the intended line exactly.
- Music: a quiet 72 BPM plucked-string garden loop built with the shared
  licensed guitar sample through `shared/js/music.js`. Its short, high-register
  picking pattern evokes the brief’s gentle ukulele bed without adding a
  network or runtime dependency. It begins only after a child gesture, ducks
  to 22% under speech, and respects mute/page visibility.
- Water: game-local WebAudio bubbles and droplets, played only on a water tap.
- Sun: a soft warm two-note shimmer.
- Growth: filtered leaf-rustle texture followed by the shared sparkle/chime.
- Reward: shared `tada`/celebration chime, with authored badge landing.

## Art direction and production asset list

All child-facing primary objects are authored raster art. CSS and canvas are
limited to layout, clipping, state transitions, invisible hit regions, the
texture-stamped drawing substrate, and reduced-motion fallbacks. There is no
vector/CSS plant, pot, leaf, watering can, sun, badge, journal card, or title.

| Asset | Working size | Visible renderer | Interaction substrate / notes |
| --- | ---: | --- | --- |
| garden backdrop | 1344×768 | opaque WebP from Krea 2, field-journal style | full-bleed `<img>`, calm center and crop-safe edges |
| title lockup | up to 1100×420 | transparent WebP from GPT Image 2 | accessible image name; spell-checked at full size |
| growth states 0–5 | normalized 720×840 each | transparent WebP from coordinated GPT Image 2 sheet | stacked `<img>` plates; DOM controls transform/crossfade |
| water tool | 360×420 | transparent WebP | `<button>` with 112 px+ hit area |
| sun tool | 360×420 | transparent WebP | `<button>` with 112 px+ hit area |
| day card carrier | 480×560 | transparent WebP | reused five times with real HTML numeral |
| Nature Explorer badge | 320×320 | transparent WebP, no baked text | reward plate; semantic label in HTML |
| play/next carrier | 680×230 | transparent WebP, blank | button text remains HTML |
| reset seed carrier | 320×320 | transparent WebP | two-step reset target |
| journal vines/flourish | 1200×300 | transparent WebP | decorative, noninteractive |
| hub tile | 640×533 | curated JPEG from Krea 2 menu template | root `games.json` icon; Toy hub grammar, no text |
| OG image | 1200×630 | screenshot of the shipped splash | regenerate with platform capture tool |

Source generations, final prompts, seed/workflow, deterministic crop boxes,
alpha/magenta QA, and accepted/rejected decisions live below
`assets/source/` and in `ASSETS.md`. Opaque scenes target ≤300 KB; ordinary
sprites target 30–100 KB; the title may reach 150 KB when paper texture needs
it. The entire first-paint visual payload targets under 1.2 MB.

## Responsive composition

- Landscape is the primary tablet layout; journal cards run in one row.
- Portrait keeps the pot and trace page large, moves WATER and SUN below it,
  and wraps the five day cards into a shallow arc/2-row composition.
- `100dvh`, all four safe-area insets, and no document scroll.
- Controls remain ≥96 px at every tested viewport. Art can scale down; hit
  regions do not.
- The playable canvas preserves its normalized coordinate system on resize.
- The center pot never sits behind the top HUD or bottom replay control.

## Shared modules

- `shared/js/screens.js` — journal / play / reward / completed routing.
- `shared/js/hud.js` and `shared/css/hud.css` — home, back, sound grammar.
- `shared/js/tap.js` — one press path for every button.
- `shared/js/audio-unlock.js` — iOS first-gesture and resume behavior.
- `shared/js/voice-clips.js` + `shared/js/narrator.js` — recorded voice,
  fallback, cancellation, aria-live.
- `shared/js/sfx.js` + `shared/js/celebrate.js` — tactile feedback and reward.
- `shared/js/music.js` — sampled plucked-string loop and voice ducking.
- `shared/js/timers.js` + `shared/js/idle-nudge.js` — cancellable choreography
  and gentle help.
- `shared/js/debug-harness.js` — stable production QA surface.

The trace recognizer, trace canvas, plant state machine, and botany sounds stay
game-local. They are concept-specific until a second real game proves a shared
API. The old `observe-journal` engine remains untouched for its sticker-based
consumers.

## `QLOBE_DEBUG` v1 contract

The game exposes:

- `ready`, `listModes()` and `startMode('sprout-week')`;
- `getState()` including screen, selected day, care actions, target coverage,
  completed days, animation phase, reduced-motion observation, and save state;
- truthful `getTargets()` for current day cards, tools, canvas, navigation, and
  reward actions;
- `tap(id)` through the same handlers used by real input;
- `trace(points)` through the same normalized trace ingestion path used by
  Pointer Events;
- `winRound()` to complete only the current semantic day;
- `selectDay(day)`, `clearSaved()`, `snapshot()` and `restore(snapshot)`;
- `mute(on)`, `seed(value)`, and `fastTimers(scale)`;
- voice/audio logs proving recorded clips play after a gesture.

Debug completion must render the same reward state and persistence writes as a
child trace. It may shorten animation time; it may not teleport around game
handlers or fabricate impossible UI state.

## Explicit departures

### From the supplied concept brief

- **No 24-hour lock.** “Daily” becomes a visible five-step sequence so a child
  can finish a satisfying session and replay it. Real waiting would create
  abandonment and make production QA nondeterministic.
- **2D watercolor texture, not “3D realistic” fill.** The explicit canonical
  Watercolor / Storybook direction and supplied mockups are stronger visual
  evidence. Trace completion reveals vibrant authored watercolor texture.
- **No flower on Day 5.** A bean normally does not flower after only five days.
  Day 5 ends as a fuller four-leaf young plant, keeping the science plausible.
- **The badge is visible in the reward state.** The written brief requires it
  even though the mockup omitted it.
- **Narration varies by day.** The brief’s “Draw what you see, watch it grow!”
  remains the interaction promise, while shorter concrete recorded lines tell
  a pre-reader what to do now.

### From the supplied mockups and concept video

- Functional words and numerals remain HTML, not baked generated text.
- Shared HUD buttons replace generated navigation controls.
- The concept video’s generic green app shell does not override the canonical
  watercolor field-journal world.
- The mockup’s Day 3 composition is kept as the anchor, while Days 1, 2, 4, and
  5 receive equally deliberate tasks and authored states.

### From the old prototype

- The generic emoji/sticker `observe-journal` flow is replaced completely.
- The separate “What Does It Need?” quiz is folded into every day’s direct
  WATER/SUN care beat; it no longer competes with the concept’s core fantasy.
- Two modes become one coherent five-day journal because the supplied concept
  is one ordered observation experience, not a menu of unrelated quizzes.
- Recorded voice, authored raster art, tracing, persistence, transformation,
  and production QA replace placeholder emoji and synthetic-only speech.

## Release gates

- all five real-pointer care/trace/reward loops pass in landscape and portrait;
- all five trace states also complete through the focus-visible
  keyboard/switch alternative;
- Water and Sunshine each accept both tap and real-pointer drag-to-pot input;
  the drag ghost remains semi-transparent and tears down on cancel or exit;
- a loose trace succeeds; an accidental dot does not; cancel/blur strands no
  pointer;
- no title, plant, pot, tool, badge, carrier, or journal card is CSS/vector art
  or emoji;
- every configured image exists, decodes, fits its budget, and passes visual
  review on cream, black, and saturated-magenta grounds where alpha applies;
- every voice key has matching lines/manifest/QA evidence or intentionally uses
  the exact fallback;
- narration plays as a recorded clip after the first gesture in real Chrome;
- no narration or music starts before a gesture;
- home/back/sound routing follows the platform invariant;
- local save survives reload; explicit reset clears it; corrupted save is safe;
- reduced motion preserves meaning without moving confetti or growth scaling;
- `QLOBE_DEBUG` can drive every day and the completed journal;
- zero new validation errors, console errors, failed requests, or case-sensitive
  path problems;
- splash, every representative day, loose-trace peak, reward, complete journal,
  portrait, and reduced-motion screenshots receive human visual review;
- the independent ART DIRECTOR review has no unresolved critical or major
  visual findings;
- production is smoke-tested at `https://qlo.be` after deployment;
- status remains `beta` until the target child succeeds on the real iPad.

## Verification record — 2026-08-19

- `node games/bean-sprout-watch/tools/qa.mjs` passed **37/37** checks in real
  Chrome. The run used a trusted first tap and proved that the decoded teacher
  M4A advanced on the unmuted media timeline, then proved the missing-recording
  Web Speech fallback. It completed all five days through fresh real Pointer
  Events and all five trace states through keyboard/switch activation, rejected
  an accidental dot, recovered malformed local storage, reloaded valid saved
  progress, reset the journal, and exercised landscape, reduced-motion
  portrait, and 390×844 layouts with zero console errors, unintended remote
  requests, or failed responses. It also captured and visually reviewed the
  semi-transparent drag ghost while testing Water drag + Sunshine tap and
  Sunshine drag + Water tap. Cancellation and screen-exit teardown also leave
  no ghost, highlight, or care-state mutation.
- `python3 games/bean-sprout-watch/tools/generate-voice.py --check` passed
  **27/27** teacher lines. Every published clip has exact unconditioned Whisper
  transcript evidence, a matching text/hash receipt, and passing duration and
  loudness bounds in `assets/audio/qa.json`.
- The trace unit suite, JavaScript syntax checks, Python compilation, generated
  art check, registry sync check, JSON parsing, and `git diff --check` passed.
  The platform validator reported **0 errors and 0 warnings**.
- Fresh splash, trace, reward, completed-journal, portrait, and narrow captures
  were visually reviewed. The independent adversarial art-director review
  found no critical, important, or polish findings and returned **Go** with
  9/10 scores for visual coherence, child/touch legibility, gameplay
  correctness, and production readiness.
- Deployment was not performed as part of this implementation pass. The
  production-route smoke check and successful target-child iPad playtest remain
  promotion gates, so the registered status intentionally stays `beta`.
