# Color Mixing Lab — production game design

**Category:** art-music · **Ages:** 5–6 · **Status:** beta
**Art world:** Field Journal watercolor laboratory
**Engine:** custom DOM game on the shared screen, HUD, audio, timer, drag, and debug modules
**Concept:** `../01-game-concepts/color-mixing-lab/`
**Supersedes:** the registered `build-assemble` Color Mixing Lab prototype in place

This document is the production contract for replacing the swatch-and-emoji
prototype with the full fantasy promised by the concept mockups: lift a painted
glass flask, pour two colors into a beaker, watch them swirl, and meet the color
that hatches from the mixture.

## 1. Product promise and learning goals

**Promise:** “I can make a new color with my own hands.”

The game teaches one relationship in three increasingly active ways:

| mode | one skill | child-sized question |
| --- | --- | --- |
| `discover` | observe cause and effect | “What happens when these two pour together?” |
| `predict` | predict before testing | “Which color do you think they will make?” |
| `recipe` | recall the two-color recipe | “Which two colors make this friend?” |

The three canonical mixtures are intentionally repeated across every mode:

- red + yellow → orange
- yellow + blue → green
- red + blue → purple

Each mode contains three 25–45 second experiments and finishes in about two
minutes. A child who plays all three has a 5–7 minute session. There is no timer,
score, loss state, or consumable reward.

## 2. Why this concept and what it strengthens

The existing registered route is a genuine prototype: flat `swatch:` pieces and
an emoji pot in the generic build engine. This production pass keeps the route,
title, category, and color-learning promise, but replaces the interaction and
visual system completely.

The capability contribution is a production reference for **expressive DOM
direct manipulation** using the existing strand-proof
`shared/js/stage/drag-to-slot-dom.js` lifecycle. One semantic `pour(color)` path
must serve drag-to-beaker, tap-flask/tap-beaker, keyboard activation, and
`QLOBE_DEBUG`. The flask remains anchored until a real attempt is accepted;
pointer cancel, blur, or leaving the screen restores it without changing the
mixture.

The style contribution is the first complete Field Journal watercolor game in
which the foreground manipulatives, vessels, mode cards, reaction effects,
mascots, title, and full-bleed room all share the same paper grain, painted edge,
ink line, light direction, and glass treatment. It must not become a watercolor
background around generic CSS controls.

## 3. Screen map and navigation

```text
boot → SPLASH → PLAY / experiment → REVEAL → next PLAY
          ↑          │                   │
          └── back ──┴──── round 3 ───→ END

SPLASH home → ../../ catalog
PLAY / REVEAL / END back → SPLASH in-page
END big play button → SPLASH
```

The reveal is a state within the play screen so the beaker never jumps between
layouts. Input is temporarily gated only for the short reaction choreography.
The next button and a six-second auto-advance both leave reveal; either is safe
to trigger once.

### 3.1 Splash

The splash is a warm, full-bleed watercolor laboratory with the generated title
lockup near the top and three authored experiment cards across the bench. Cards
stack vertically in portrait. Each card has a unique picture-only affordance:

- Discover: two tiny flasks flowing into a sparkling beaker.
- Predict: two flasks, a question-shaped paint blot, and three small droplets.
- Recipe: one smiling color droplet pointing toward three primary flasks.

Real HTML labels sit below the pictures for grown-ups and accessibility, but the
child can identify the modes from their art and spoken line. The splash home
button is the only catalog link.

The first real gesture unlocks every audio channel. If it lands on empty splash
space, the welcome line plays. If it selects a mode, the mode line replaces the
welcome so two clips never overlap.

### 3.2 Play workbench

The workbench is one stable composition in every mode:

- back button at top-left;
- three progress pips at top-right;
- sound/repeat button at bottom-left;
- a calm watercolor laboratory plate behind everything;
- a large empty beaker on a painted metal tray in the center;
- red, yellow, and blue authored flask sprites in a generous dock;
- a pictorial prompt panel above the beaker;
- an invisible padded pour zone at least 360 × 320 CSS px around the beaker.

Landscape places the flask dock along the lower edge. Portrait uses a vertical
arc around the beaker without shrinking any flask target below 112 px. The
prompt panel avoids the top HUD safe band and the beaker avoids the bottom HUD.

### 3.3 Reveal

After the second accepted pour:

1. both paint-stream sprites finish inside the beaker;
2. an authored watercolor swirl spins once while the empty beaker crossfades to
   the correct filled-beaker sprite;
3. bubbles rise and the matching droplet mascot springs from behind the rim;
4. the result equation appears as pictures first (flask + flask = mascot), with
   optional HTML color names underneath;
5. voice says the result, then a short confetti burst lands around—not over—the
   mascot;
6. a large shared play button becomes available and auto-advance arms for six
   seconds.

Reduced motion replaces the spring/spin with a 180 ms crossfade and omits
confetti while keeping voice and the filled beaker.

### 3.4 End

The three discovered mascots gather around a rainbow-tinted beaker. The screen
says, “Your color lab is glowing!” and offers one large play button back to the
mode splash. Back also goes to the splash. There is no automatic replay.

## 4. Mode behavior

### 4.1 Discover (`discover`)

Purpose: observe two inputs producing one new color.

The three mixtures are shuffled by the seeded RNG. A picture recipe shows the
two requested flasks. Only those two gently bob; all three remain visible and
touchable. If the child chooses the third color, it makes a friendly paint
“boop,” returns home, and the narrator models the requested color: “That is
blue. We need red and yellow this time.” No red mark or loss is shown.

The two requested flasks may be poured in either order. After each accepted
pour, the matching flask becomes an empty painted silhouette in its dock so the
child can see what remains.

### 4.2 Predict (`predict`)

Purpose: make a hypothesis before seeing the reaction.

The prompt panel shows two flask pictures and three large mascot choice cards.
The child taps one prediction. Every choice is accepted and marked with a small
paint-star; the game never says the prediction was bad. The flask workbench then
opens and both requested colors are poured.

At reveal:

- matching prediction: “You predicted orange—and you were right!”
- different prediction: “You predicted purple. The experiment made orange!”

Both receive the identical reaction, mascot, and celebration. The journal is
teaching that experiments answer questions, not that guesses earn points.

### 4.3 Recipe (`recipe`)

Purpose: recall which pair makes a target secondary color.

One mascot peeks from the prompt panel. All three primary flasks are active.
The child pours any two distinct colors. Every distinct pair makes its true
secondary result:

- if it matches the target, the normal reveal completes the round;
- if it makes another valid color, that mascot pops up briefly and names itself,
  then says which pair the target needs. The beaker rinses to empty and the
  round remains active.

Tapping the same primary flask twice is modeled as “More red stays red. Pick a
different color to make a new one.” The first red pour remains visible; the
second flask returns without consuming an attempt.

## 5. Direct-manipulation contract

Every flask is a real `<button>` with an authored `<img>`, a 112 px minimum
painted size, a 128 px minimum hit area, `touch-action: none`, a color-specific
accessible label, and `data-target="flask-<color>"`.

Two equal input paths call the same attempt function:

1. **Drag:** pointerdown on flask → 10 px slop → watercolor ghost follows the
   pointer with its grab offset → target highlights → release in padded beaker
   zone calls `pour(color)`.
2. **Tap-tap:** tap flask selects and lifts it → tap the beaker calls
   `pour(color)`; tapping another flask changes selection. Keyboard activation
   uses this path.

`drag-to-slot-dom.js` owns one-pointer gating, window listeners, blur/
visibility cancellation, ghost cleanup, and slot hit testing. The game owns the
pour choreography. It must never re-implement pointerup or pointercancel.

An accepted pour sequence is:

- lock new pours for no more than 1.6 seconds;
- move the visible authored flask to the beaker lip;
- rotate it 72 degrees around the spout;
- reveal and extend the matching authored stream sprite;
- play a soft liquid/glug texture plus shared `sfx.whoosh()`;
- tint the beaker only by swapping to an authored partial/full state, not by a
  CSS gradient;
- retract stream, rotate home, and unlock.

The authored art is the visible renderer. DOM transforms, clipping, hit zones,
and animation timing are only the interaction substrate.

## 6. Feedback, nudging, and child safety

- There is no failure sound, red X, score, streak, timer, or “game over.”
- A non-requested flask does a short 6-degree wiggle and returns while the voice
  models the correct pair.
- Any pointerdown resets the idle timer.
- At 11 seconds idle, the current prompt repeats.
- At 22 seconds, the next useful flask glows and lifts 12 px; reduced motion
  uses a static watercolor halo.
- At 38 seconds, the game demonstrates only the first half: the useful flask
  glides near the beaker, then returns. It never completes the experiment.
- Audio never blocks input. A new prompt stops the old one.
- All interactive images have text alternatives and focus-visible outlines.
- No microphone, camera, game persistence, model/LAN call, or game-specific
  remote asset is used. The site-wide analytics shim remains the same as every
  other QLOBE page.

## 7. Complete spoken script

These strings are verbatim source-of-truth for `assets/audio/lines.json`.

| key | spoken line |
| --- | --- |
| `welcome` | “Welcome to the color lab! Pick an experiment.” |
| `mode-discover` | “Let’s mix two colors and discover a new one.” |
| `mode-predict` | “Guess what color they will make, then test your idea.” |
| `mode-recipe` | “Can you mix the two colors this little friend needs?” |
| `discover-red-yellow` | “Pour red and yellow into the beaker.” |
| `discover-yellow-blue` | “Pour yellow and blue into the beaker.” |
| `discover-red-blue` | “Pour red and blue into the beaker.” |
| `predict-red-yellow` | “Red and yellow are ready. Which color do you think they will make?” |
| `predict-yellow-blue` | “Yellow and blue are ready. Which color do you think they will make?” |
| `predict-red-blue` | “Red and blue are ready. Which color do you think they will make?” |
| `recipe-orange` | “Can you make orange?” |
| `recipe-green` | “Can you make green?” |
| `recipe-purple` | “Can you make purple?” |
| `pour-red` | “Red.” |
| `pour-yellow` | “Yellow.” |
| `pour-blue` | “Blue.” |
| `result-orange` | “Red and yellow make orange!” |
| `result-green` | “Yellow and blue make green!” |
| `result-purple` | “Red and blue make purple!” |
| `predict-right-orange` | “You predicted orange, and you were right!” |
| `predict-right-green` | “You predicted green, and you were right!” |
| `predict-right-purple` | “You predicted purple, and you were right!” |
| `predict-surprise-orange` | “The experiment made orange!” |
| `predict-surprise-green` | “The experiment made green!” |
| `predict-surprise-purple` | “The experiment made purple!” |
| `nudge-red-yellow` | “We need red and yellow this time.” |
| `nudge-yellow-blue` | “We need yellow and blue this time.” |
| `nudge-red-blue` | “We need red and blue this time.” |
| `same-red` | “More red stays red. Pick a different color to make a new one.” |
| `same-yellow` | “More yellow stays yellow. Pick a different color to make a new one.” |
| `same-blue` | “More blue stays blue. Pick a different color to make a new one.” |
| `rinse` | “A little rinse, and we can try again.” |
| `end` | “Your color lab is glowing!” |

If a recorded clip is missing or fails transcript QA, `voice-clips.js` must use
this exact line as Web Speech fallback. All recorded lines are tested after a
real gesture and every final clip is transcribed.

## 8. Production art list

All art is watercolor-and-ink on warm cotton paper, with translucent painted
glass, visible pigment blooms, slightly imperfect edges, and the same upper-left
daylight. No child-facing primary object is represented by emoji, SVG, CSS
gradient, or generic rounded rectangle.

| final asset | target | visible renderer | interaction substrate / notes |
| --- | --- | --- | --- |
| `assets/lab-splash.webp` | 1600×1200, ≤300 KB | full-bleed watercolor lab, calm card zone | cover-fit background |
| `assets/lab-play.webp` | 1600×1200, ≤300 KB | full-bleed bench and shelves, calm center | cover-fit background |
| `assets/title.webp` | ~900×360 alpha, ≤150 KB | painted “Color Mixing Lab” lockup | `<img>` with accessible title |
| `assets/ui/mode-discover.webp` | 420×360 alpha | two flasks + sparkling beaker card | mode button image |
| `assets/ui/mode-predict.webp` | 420×360 alpha | flasks + mystery blot + droplets | mode button image |
| `assets/ui/mode-recipe.webp` | 420×360 alpha | mascot requesting two flasks | mode button image |
| `assets/flasks/red.webp` | 420 px alpha | red paint in glass flask | draggable button image |
| `assets/flasks/yellow.webp` | 420 px alpha | yellow paint in glass flask | draggable button image |
| `assets/flasks/blue.webp` | 420 px alpha | blue paint in glass flask | draggable button image |
| `assets/flasks/empty.webp` | 420 px alpha | same vessel empty | poured/dock state |
| `assets/beakers/empty.webp` | 600 px alpha | empty glass beaker and painted tray | padded slot button |
| `assets/beakers/orange.webp` | 600 px alpha | orange mixture in same beaker | reveal swap |
| `assets/beakers/green.webp` | 600 px alpha | green mixture in same beaker | reveal swap |
| `assets/beakers/purple.webp` | 600 px alpha | purple mixture in same beaker | reveal swap |
| `assets/mascots/orange.webp` | 420 px alpha | joyful orange droplet | prediction/reveal image |
| `assets/mascots/green.webp` | 420 px alpha | joyful green droplet | prediction/reveal image |
| `assets/mascots/purple.webp` | 420 px alpha | joyful purple droplet | prediction/reveal image |
| `assets/effects/stream-red.webp` | 128×640 alpha | painted red liquid ribbon | scaled/rotated DOM image |
| `assets/effects/stream-yellow.webp` | 128×640 alpha | painted yellow liquid ribbon | scaled/rotated DOM image |
| `assets/effects/stream-blue.webp` | 128×640 alpha | painted blue liquid ribbon | scaled/rotated DOM image |
| `assets/effects/swirl-orange.webp` | 520 px alpha | orange watercolor vortex | rotating reveal overlay |
| `assets/effects/swirl-green.webp` | 520 px alpha | green watercolor vortex | rotating reveal overlay |
| `assets/effects/swirl-purple.webp` | 520 px alpha | purple watercolor vortex | rotating reveal overlay |
| `assets/source/hub/tile-candidate.png` | 768×640 | separate Toy Table hub tableau | accepted Studio source |
| `../../assets/hub/tiles/color-mixing-lab.jpg` | 640×533 | approved hub tile | hub registry image |
| `assets/og-image.jpg` | 1200×630 | deterministic game screenshot | social card |

Generation groups may begin as inspected contact sheets so the glass treatment
and mascot anatomy stay coherent. Every cell must be checked before slicing.
The Qwen Image Layered path remains implemented, but the production run's
direct artwork upload was denied by the execution safety gate. The accepted
fallback uses precise gpt-image-2 background-only edits to flat magenta, the
installed hard color-distance chroma helper (never flood fill), then the same
alpha-trim/pad/resize and magenta-composite QA. A soft-despill attempt was
visually rejected because it damaged orange, purple, and cream pigment. All
original generations, prompts, processing parameters, crops, and QA evidence
remain under `assets/source/` and are recorded in `ASSETS.md`.

## 9. Audio and motion assets

- Recorded teacher voice: `assets/audio/*.m4a`, `lines.json`, and
  `manifest.json`; Qwen voice clone from the rights-cleared platform reference,
  seed 7 then 8/9 only for rejected lines; every final encoded clip passes
  Whisper comparison.
- Paint-pour/glug uses a small local WebAudio texture plus shared SFX. There is
  no autoplaying music and no runtime download.
- The local runtime art set preloads and decodes before `QLOBE_DEBUG.ready`
  resolves, preventing cold-cache sessions from revealing partially painted
  screens while keeping all authoring masters out of the runtime request path.
  Each preload has an eight-second guard and records a debug-visible failure
  instead of blocking boot; production QA requires the failure list to be empty.
- LTX video is deliberately not used: the promised action is child-driven and
  reads more clearly when the real flask sprites move under the child’s finger.
  A passive video would weaken—not strengthen—the interaction.

## 10. Data, randomness, and replay variation

`config.json` is the canonical editable content: mixtures, voice keys, prompts,
asset paths, round counts, and mode metadata. `config.js` is only a fetch shim.

Each mode shuffles the three mixtures using one seeded RNG. The same mixture
cannot repeat within a mode run. Prediction choices shuffle independently so
the correct mascot is not consistently in one position. `QLOBE_DEBUG.seed(42)`
must reproduce both orders.

No persistent collection is necessary for a satisfying session, so the game
does not use localStorage or IndexedDB. Progress resets when the child leaves.

## 11. Shared modules

The custom game imports, rather than copies:

- `shared/js/audio-unlock.js`
- `shared/js/voice-clips.js`
- `shared/js/narrator.js`
- `shared/js/sfx.js`
- `shared/js/hud.js`
- `shared/js/screens.js`
- `shared/js/timers.js`
- `shared/js/rng.js`
- `shared/js/idle-nudge.js`
- `shared/js/celebrate.js`
- `shared/js/stage/drag-to-slot-dom.js`
- `shared/js/debug-harness.js`

## 12. `QLOBE_DEBUG` v1

The hook exposes:

- `ready`
- `listModes()`
- `startMode(id)`
- `getState()` with screen, mode, round, phase, selected/poured colors,
  prediction, target/result, busy, and reduced-motion state
- truthful `getTargets()`
- `tap(targetId)` routed through the same semantic attempt handlers
- `pour(color)` routed through the same production pour path
- `predict(color)` routed through the real choice handler
- `winRound()` using valid remaining inputs rather than a state shortcut
- `home()` to the game splash
- `mute(on)`
- `seed(n)` wired before deck/choice shuffles
- `fastTimers(scale)` wired to every reaction and auto-advance timer
- `getAudioLog()` for recorded-clip QA

## 13. Explicit departures

- The brief says bright 3D laboratory; the mockups are a much stronger,
  internally consistent watercolor storybook direction. The production game
  follows the mockups and names that direction Field Journal.
- The prototype’s fourth red + white → pink recipe is removed. The concept and
  learning promise are specifically the three secondary colors made from the
  three primaries; adding tint theory dilutes that loop.
- The mockup bakes instructional words into the paintings. Production keeps the
  visual equation but renders functional color names as HTML and voice so the
  game is readable, accessible, and localizable.
- The concept suggests device tilt. Production uses drag/tap flask pouring,
  which is available without motion permission, works on a table or in a case,
  and gives direct control over the promised action.
- The old generic build engine is replaced by a custom DOM runtime because the
  authored pour/reaction choreography and prediction state are the game, not a
  decorative wrapper around slot placement.

## 14. Risks and release gates

1. **The pour feels canned.** Gate: capture press, airborne drag, tilt, stream,
   swirl, mascot peak, and rest. The flask must visibly respond before release
   and the stream must meet the beaker rim at every supported aspect ratio.
2. **Watercolor foreground becomes CSS UI.** Gate: full-size visual audit of
   flasks, beakers, prompt panel, mode cards, mascots, stream, and reward—not
   only backgrounds.
3. **Cutout fringes disappear on white.** Gate: inspect every alpha asset over
   saturated magenta at 2–4×.
4. **A cancelled drag strands the lab.** Gate: automated pointercancel, blur,
   off-target drop, and second-finger probes followed by a successful pour.
5. **Voice silently falls back.** Gate: real Chrome after a gesture; audio log
   must report `kind: "clip"` for every sampled mode and result line.
6. **Small screens crop the experiment.** Gate: screenshots at 1180×820,
   820×1180, 1180×520, and phone-landscape 568×320 plus safe-area assertions
   for the splash choices, HUD, prompt, beaker, and dock.
7. **Production differs from local.** Gate: after deployment, rerun the complete
   driver against `https://qlo.be`, require zero unexpected requests/errors,
   and visually inspect production captures.

The game remains `beta` until the target child completes a mode on the real iPad.
