# Game Design Document — My Awesome Day

## Product promise

**My Awesome Day: Plan, Do, Review** gives a preschooler one complete, joyful
executive-function ritual in about two minutes: choose an intention, follow it
through with their hands, notice how it felt, name what helped, and place a star
in a day jar. The child is never graded on a feeling. Every reflection is valid.

- **Game id:** `plan-do-review`
- **Category:** `social-emotional`
- **Age:** 3–6
- **Mode:** `awesome-day`
- **Single skill:** connect an intention to action and reflection
- **Canonical art direction:** **Puppet / Cozy felt fabric**
- **Per-game treatment:** a handmade quiet-book room hosted by Barnaby, a
  cheerful purple sock puppet from the supplied concept mockups
- **Target session:** 90–150 seconds for one cycle; 3–7 minutes for several
  different plans

## Why this is a custom game

The former `choose-one` prototype shuffled PLAN, DO, and REVIEW as independent
questions and sent the child away from the tablet. That breaks the fixed
pedagogical sequence and does not deliver the tactile mini-game promised by the
brief. This replacement uses one custom, data-driven drag-to-slot activity
system with three visual variations. The fixed state machine is:

```text
splash → plan → do → feeling → learning → reward → plan or splash
```

## Screen map

### 1. Splash — “My Awesome Day”

- Green felt playroom; generated felt title lockup; Barnaby leans into frame.
- Barnaby’s stitched star jar is visible with the saved number of stars.
- One huge raster felt play button begins the ritual.
- Home is the only route to the catalog. Sound and replay-voice controls are
  visible, safe-area aware, and at least 96 CSS pixels.
- Spoken line: **“Hi, friend! Let’s make an awesome plan.”**

### 2. PLAN — choose an intention

- Green felt room, warm ochre floor, bunting, cream stitched planning board.
- Three large activity cards use authored raster felt art and distinct
  silhouettes: **Build a Tower**, **Grow a Garden**, and **Pack a Picnic**.
- Spoken line: **“First, make a plan. What would you like to do?”**
- Tapping a card lifts it, adds a sewn selection halo, makes Barnaby point, and
  reveals the green START pillow. The child may change the selection.
- Card confirmations:
  - tower: **“You planned to build a tower. Let’s do it!”**
  - garden: **“You planned to grow a garden. Let’s do it!”**
  - picnic: **“You planned to pack a picnic. Let’s do it!”**

### 3. DO — carry out the plan

- Deep blue felt room with a dominant cream play mat and a quiet progress rope.
- Four authored pieces wait in the basket/tray. Four matching raster silhouette
  targets sit on the mat. Pieces are at least 120 CSS pixels on tablet and at
  least 88 pixels at the smallest supported phone layout.
- The child can drag a piece or tap it and then tap its matching place. The
  shared DOM drag controller owns pointer capture, cancellation, blur recovery,
  one-drag-at-a-time behavior, and a generous padded hit area.
- Correct placement lands with a soft bounce, warm chime, raster sparkle, and
  one progress medallion advancing. A near miss floats home with no penalty.
- Opening line: **“Now do your plan. Put each cozy piece where it belongs.”**
- Gentle nudge: **“Almost! Look for the matching cozy outline.”**
- Completion: **“You did it! You followed your plan.”**

The three data variations are:

| Plan | Pieces in completion order | Visual skill |
| --- | --- | --- |
| Build a Tower | blue arch base, green block, yellow arch, red roof | spatial order and matching |
| Grow a Garden | orange pot, green stem and leaves, coral flower, golden sun | part-to-whole assembly |
| Pack a Picnic | woven basket, red apple, yellow sandwich, blue drink | visual matching and organization |

The target location, not the arbitrary sequence, determines correctness. The
progress rope counts completed placements and never marks a mistake.

### 4. REVIEW A — name the feeling

- Lavender felt room; the completed activity rests on the golden display rug;
  Barnaby celebrates without covering the work.
- Four equally weighted, word-and-picture emotion patches: **Happy, Proud,
  Challenged, Calm**. “Challenged” is thoughtful, not sad or wrong.
- Spoken line: **“You did your plan. How did it feel?”**
- Every choice depresses like a fabric button and receives an affirming line:
  - happy: **“Happy! Your work brought a smile.”**
  - proud: **“Proud! You kept going and finished.”**
  - challenged: **“Challenged! Tricky work helps your brain grow.”**
  - calm: **“Calm! You found your steady feeling.”**

### 5. REVIEW B — notice what helped

- The room stays stable so this feels like the second half of one reflection.
- Three large raster skill patches: **Patience**, **Problem Solving**,
  **Creativity**. All are valid self-observations.
- Spoken line: **“What helped you do it?”**
- Affirmations:
  - patience: **“Patience helped you take your time.”**
  - problem-solving: **“Problem solving helped you find a way.”**
  - creativity: **“Creativity helped you make it your way.”**

### 6. REWARD — fill the Awesome Day jar

- A gold felt star visibly travels into Barnaby’s large stitched-appliqué jar.
- The jar shows up to five persistent stars. At five it gains a gentle rainbow
  stitch glow; later completions still trigger the arrival and shimmer.
- Barnaby cheers for 1–2 seconds; reduced motion uses the filled final state
  without travel.
- Spoken line: **“Plan, do, review! You made your day awesome.”**
- Huge actions: **Choose Another Plan** and **Back to My Awesome Day**.

## Interaction and feedback rules

- Child-facing primary targets are at least 96 CSS pixels except the smallest
  phone layout, where HUD controls may be 56 pixels and primary actions remain
  at least 88 pixels.
- All controls work with pointer, keyboard, and assistive-technology click.
- One press path is used for each control; real interaction and debug automation
  call the same semantic handlers.
- A drag preserves the finger-to-object relationship, lifts above the mat,
  cannot be stranded by `pointercancel`, app switch, blur, or re-render, and
  always returns home after an invalid drop.
- Misses never remove progress, play a harsh sound, or say “wrong.”
- Every instruction is spoken, depicted, repeatable, and represented by live
  HTML for accessibility. No required instruction is baked into generated art.
- Transitions are soft fabric slides/fades, 250–450 ms. Reduced motion removes
  travel, float, parallax, and confetti while preserving selected and success
  states.
- Background music is the shared recorded acoustic track at a quiet volume,
  starts only after a real gesture, ducks under narration, follows mute, and
  stops on teardown.

## State, replay, and persistence

Runtime state is serializable:

```text
screen, selectedActivity, placedPieceIds, feeling, skill, stars,
muted, busy, reducedMotion, seed
```

Only the star count is persisted in `localStorage`, under a game-scoped key and
clamped from 0 to 5. No child name, speech, recording, account, or network data
is collected. Gameplay remains complete when storage is unavailable.

## Spoken script keys

The exact lines above are source of truth. Runtime keys are:

```text
intro, plan-prompt, plan-tower, plan-garden, plan-picnic,
do-prompt, do-nudge, do-complete, feeling-prompt,
feeling-happy, feeling-proud, feeling-challenged, feeling-calm,
skill-prompt, skill-patience, skill-problem-solving, skill-creativity,
reward, again
```

The `again` line is **“Let's make another awesome plan!”**

Primary delivery is the approved teacher voice clone, converted to AAC/M4A and
Whisper-checked against these lines. `voice-clips.js` falls back to Web Speech
for any absent or rejected clip.

## Complete art list

Every item below is authored raster art. DOM/CSS supplies layout, hit areas,
focus, masks, opacity, and motion only; it does not illustrate the world.

| Asset family | Visible renderer | Interaction substrate |
| --- | --- | --- |
| plan, do, review room plates | opaque 4:3/landscape WebP felt environments | full-screen responsive image layer |
| title lockup | transparent WebP spelling “MY AWESOME DAY” | labelled image |
| Barnaby idle, point, cheer | transparent WebP pose sprites sharing identity/scale | responsive pose container |
| plan cards and board | transparent WebP stitched panels + 3 activity emblems | buttons and selected state |
| green start pillow | transparent WebP | button |
| 12 activity pieces | transparent WebP cut from three coordinated source sheets | draggable/tappable buttons |
| play mat, basket, progress rope/medallions | transparent WebP | board, slots, progress values |
| 4 emotion patches | transparent WebP | all-valid review buttons |
| 3 skill patches | transparent WebP | all-valid review buttons |
| star, empty jar, five-star jar overlays | transparent WebP | reward animation and saved count |
| back, home, sound, replay carriers | transparent WebP sewn controls | safe-area HUD buttons |
| sparkle cluster / stitched glow | transparent WebP | short success effect |
| hub tile | separate Krea Toy-menu tableau, 640×533 JPEG | root catalog entry |
| social preview | production screenshot or authored 1200×630 JPEG | Open Graph metadata |

All generated sources, exact prompts/recipes, cutter boxes, masks, and magenta
alpha-QA composites remain under `assets/source/`. The shared bounding-box
cutter must be run with `--expected-count` for every contact sheet.

## Responsive composition

- **1440×900 / 1024×768 landscape:** the action owns at least 55% of the frame;
  Barnaby lives in a side rail; plan cards fit three across; do pieces stay
  120px or larger.
- **768×1024 portrait:** Barnaby becomes a shoulder-height corner guide; cards
  use a 2+1 grid; the review panel never covers the completed work.
- **390×844 portrait:** intentional stacked layout, not a scaled desktop;
  primary choices remain 88–96px, no body scroll during drag.
- **844×390 landscape:** compact HUD and shallow header; tray and mat remain in
  the first viewport; safe-area insets protect every control.

## Shared modules

- `shared/js/audio-unlock.js`
- `shared/js/bgm.js`
- `shared/js/debug-harness.js`
- `shared/js/preload.js`
- `shared/js/rng.js`
- `shared/js/sfx.js`
- `shared/js/stage/drag-to-slot-dom.js`
- `shared/js/tap.js`
- `shared/js/timers.js`
- `shared/js/voice-clips.js`
- shared recorded background music from `shared/assets/music/`

No shared implementation change is required.

## QLOBE_DEBUG v1 contract

`window.QLOBE_DEBUG` exposes the platform standard plus semantic helpers:

- `ready`, `listModes()`, `startMode('awesome-day')`
- `getState()`, `getTargets()`, `tap(id)`
- `selectPlan(id)`, `placePiece(id)`, `selectFeeling(id)`, `selectSkill(id)`
- `completeRound()` / `winRound()`, `home()`, `mute(on)`
- seeded randomness and scaled timers

Automation can deterministically reach every screen without bypassing the real
handlers.

## Deliberate departures

- The prototype’s shuffled engine and “go do it in the real room” step are
  replaced by a fixed, fully playable tactile loop, because the concept brief
  explicitly promises an on-screen drag-and-drop DO phase.
- The mockup’s three ambiguous feeling faces become the brief’s four named
  feelings. All remain equally valid.
- The brief’s “what did you learn?” and star jar are added as dedicated screens;
  the supplied mockups stop before these required beats.
- Three cohesive plan activities replace the brief’s broad category list. They
  all use one learned interaction, keep the session short, and create replay
  variation without becoming unrelated mini-games.
- Barnaby is retained as the concept’s distinctive puppet host rather than
  substituting a platform cast member. His design is treated as the game’s
  authored mascot and kept consistent across every pose.

## Release gate

- Zero runtime model calls, console errors, or failed asset requests. The only
  approved remote request is the platform-wide analytics tag.
- Full flow passes in real Chrome at all viewport classes and reduced motion.
- Narration is observed through `voice-clips.js`: accepted recordings must log
  as `kind: 'clip'`; when no voice-clone take survives Whisper validation, all
  19 exact lines may log as `kind: 'speech'` through the built-in Web Speech
  fallback, with the sanitized LAN failure receipt retained. Unverified takes
  never ship.
- Screenshots cover splash, selected plan, mid-do, completed do, both review
  screens, reward, portrait, narrow landscape, and reduced motion.
- Foreground material fidelity passes separately from layout/usability.
- The adversarial ART DIRECTOR has no BLOCKER or MAJOR findings.
- Status remains `beta` until the target child completes the loop on the real
  iPad; automated QA is not a child playtest.
