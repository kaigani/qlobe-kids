# Obstacle Course Builder — production game design

**Category:** movement-outdoor
**Ages:** 3–7 (primary playtest target 5–6)
**Status:** in-design → beta after production replacement; live only after child iPad sign-off
**Art world:** **Papercraft** (legacy runtime alias: `paper-garden`)
**Engine:** custom, game-local DOM/ES-module game
**Cast:** world-specific animal course guides required by the concept; no one-off child cast
**Concept:** `../01-game-concepts/obstacle-course-builder/`
**Replaces:** the registered `games/obstacle-course-builder/` `coach-timer` prototype in place

This document is the production contract. It answers the interaction, art, voice,
state, fallback, and QA questions that the brief and generated mockups intentionally
leave open. The shipped game must reflect this document's final behavior, not the old
household-activity checklist.

## 1. Product promise and learning focus

**Promise:** Pick a handmade world, snap together a course that is truly yours,
then help its animal friend crawl, climb, hop, carry, and slide through exactly what
you built.

The game has two complementary jobs, kept separate:

1. **Build:** spatial sequencing and revision — choose, place, repeat, recolor,
   swap, and connect three to five obstacle modules.
2. **Play:** movement planning — read each obstacle visually and perform its
   matching touch gesture in course order.

The 30–90 second core loop is one course station. A full three-piece course takes
about two minutes; a five-piece course takes three to five minutes. There is no timer,
score pressure, losing state, or irreversible mistake.

## 2. The worlds

All worlds use the same builder and traversal grammar. A child can learn the game in
one world and immediately understand the other two.

| World id | Setting | Guide | Modules | Palette |
| --- | --- | --- | --- | --- |
| `backyard` | Rainbow foam backyard | Puppy | rainbow tunnel, rock wall, lily-pad crossing, foam-block carry | sky, leaf green, coral, sunflower, rainbow accents |
| `jungle` | Vine-covered clearing | Monkey | vine tunnel, boulder wall, log crossing, fruit carry | deep leaf, lime, bark brown, mango, turquoise |
| `arctic` | Layered ice field | Penguin | igloo tunnel, iceberg wall, ice-floe crossing, fish carry, belly-slide ramp | ice blue, white, indigo, violet, warm orange |

The Arctic `slide` is a genuine fifth action. Two or more adjacent slide modules are
one connected super-slide during traversal; its steering beat grows one swipe longer
per connected ramp.

## 3. Screen and navigation map

```text
boot → WORLD SELECT → BUILDER → TRAVERSAL (one station at a time) → COURSE COMPLETE
          ▲               │              │                              │
          │               └── back ──────┘                              │
          └──────── back / choose world / build another ────────────────┘

WORLD SELECT home → catalog
BUILDER / TRAVERSAL / COURSE COMPLETE back → WORLD SELECT, in-page
```

Every transition stops the outgoing voice and disposes drag/pointer listeners.
Home exists only on World Select. Deeper screens expose Back, never a hidden catalog
link.

### 3.1 World Select (the splash)

- Full-bleed Papercraft sky/grass plate with the authored title lockup centered high.
- Three large world cards show a cropped world plate plus its animal guide and one
  signature obstacle. The pictures carry meaning; HTML labels are supplemental.
- First gesture unlocks all audio. If it is not already a world-card press, the narrator
  says `choose-world`.
- Tapping a card selects it with a paper-tab/check asset, speaks its short line, and
  reveals/pulses the large shared Play button. A second tap on the selected card also
  enters the builder.
- The last-played world may start selected from local storage, but never auto-launches.
- Idle ladder: repeat `choose-world`, then gently bob all three guides. No automatic
  choice.

**Five-second read:** three friendly animals in three visibly different places; touch
one. Every large first tap is productive.

### 3.2 Builder

- The selected world plate fills the screen.
- A shallow corrugated-cardboard course board contains a 4×3 authored snap grid. Children
  place up to five obstacle nodes anywhere on its twelve cells; an authored paper ribbon
  stretches and turns between the nodes in course order.
- The guide waits at the start flag. A finish flag sits at the board edge.
- A bottom/side tray contains the world's four or five authored obstacle cutouts.
- A course may contain three to five modules. Tray sources are reusable, so duplicates
  are allowed. Empty grid cells remain quietly available after the minimum is met.
- The shared Play button is visible but dormant until three nodes are placed. Pressing
  it early speaks `need-three` and makes three suggested empty cells breathe once.
- Back returns to World Select. Sound repeats the current builder instruction.

The builder uses a single semantic operation, `place(kind, targetIndex, sourceIndex?)`,
for real pointer drops, tap-tap, keyboard/AT activation, and `QLOBE_DEBUG`.

### 3.3 Traversal

- The world plate stays visible so play feels like entering the course rather than a
  separate quiz.
- A large authored paper challenge panel presents the current obstacle cutout, guide,
  and gesture cue. Course thumbnails along one edge show completed modules with green
  paper checks and the current module with a gold stitched ring.
- Back abandons traversal and returns to World Select; the saved build remains available.
- Sound repeats the action prompt.
- Inputs are accepted while narration plays. Only the brief payoff animation locks input,
  and the lock is bounded.
- On success: SFX → readable mascot action → paper-confetti burst → check appears → short
  praise → next station. Reduced motion swaps movement for two clear pose/position states.

### 3.4 Course Complete

- The guide reaches an authored checkered paper flag and celebrates.
- The completed module row is shown exactly as built, including duplicates and color
  stamps.
- Three stars appear as three unscored accomplishments: **Built it**, **Played it**,
  **Imagined it**. They are not performance ratings and always appear.
- Primary action: Build Another (keeps the current world and completed pieces, returning
  to the builder so the child can reshape or replace them immediately).
- Secondary action: Replay Course (runs the same authored course again).
- The visible shared Back control returns to World Select; it is the single consistent
  choose-world route on every screen deeper than the splash.
- The final voice invites body-aware off-screen play with adult supervision:
  `real-world-invite`. The digital loop is complete before this invitation.

## 4. Builder interaction contract

### 4.1 Grid, placement, and connection

The board is a logical 4×3 grid with twelve stable cells. It remains 4:3 in every viewport:
landscape places the tray to its right or below; portrait places it below. A saved `cell`
therefore survives orientation without coordinate reinterpretation.

Course order is the order in the `course[]` array, not a left-to-right guess from spatial
position. The visible authored ribbon connects fixed Start → `course[0]` → … → last module
→ Finish. Each connection is the authored raster stitched-paper strip transformed between
node centers; the ordered angled segments make straight, zig-zag, and curved spatial routes.
Small numbered paper tabs and the continuous ribbon make the order visible.

The child authors two different things:

1. **Sequence:** which obstacle kind occupies each ordered course node.
2. **Shape:** which grid cell each node occupies, making a straight, zig-zag, or curvy path.

Accepted input paths:

1. **Drag:** drag a tray module to any grid cell. A padded hit area chooses the nearest cell.
2. **Tap-tap:** tap a tray module, then tap a grid cell. Selection uses `aria-pressed` and a
   visible stitched halo.
3. **Placed edit:** tap a placed module to select it, then tap an empty cell to move that
   course node, another placed module to swap their obstacle kinds/colors, a dye swatch to
   recolor it, or the same module again to deselect.

Placement rules:

- Tray → empty cell: append a new course node at that cell, up to five nodes.
- Tray → occupied node: replace that node's obstacle kind and reset its color to the theme's
  default; its order and cell stay fixed.
- Placed node → empty cell: move that node to the cell; its sequence order stays fixed and
  the ribbon reshapes live.
- Placed node → occupied node: swap their obstacle kinds/colors while route cells and order
  remain fixed. This is a visible “swap the challenges” edit, not a no-op record exchange.
- Drop outside the board/cells: cancel cleanly; nothing changes and no ghost remains.
- Pointer cancel, page blur, hidden tab, orientation change, or rerender: cancel and restore
  the pre-drag snapshot.

Every successful edit updates the stitched route, plays a soft paper
`pop`, saves semantic state, and remains undoable.

### 4.2 Revision controls

- **Undo:** an authored curled-paper arrow restores the previous semantic order/cell/color
  snapshot. It is at least 96px and disappears when unavailable.
- **Scrap basket:** while a placed module is dragged, a large authored paper recycling
  basket appears. Dropping there removes the module and compacts the course.
- **Clear:** a held-for-700ms scrap-basket action clears the board only after a visible
  paper peel animation; a normal tap never destroys a whole course.

### 4.3 Color stamping

Tapping a placed module selects it, gives it a stitched halo, and exposes three large
authored paper-dye swatches. Tray selection is cleared when a placed node is selected and
placed selection is cleared when a tray source is selected. Tapping outside the board or the
selected node again dismisses the palette. Choosing a swatch sets its `color` to `sunny`,
`berry`, or `ocean` directly. The visible renderer
remains the generated raster obstacle; a bounded hue/saturation transform creates the
paper-dye variant without replacing its fibers, edges, shadows, or silhouette. Each theme
maps the three semantic colors to tuned filter values so ice never turns muddy and foliage
never becomes skin-toned.

Color is cosmetic and never changes traversal logic. It is stored with the module and
preserved in completion thumbnails.

### 4.4 Arctic slide connections

Consecutive slide modules in course order gain an authored snow-stitch connector between
them. Their grid positions determine the visible turns and the smoothed glide path; placing
them in a zig-zag makes a curvier run than placing them in a row. In traversal,
the maximal adjacent slide run is grouped into one station with `length = run.length`.
One slide asks for two steering swipes; each additional connected ramp adds one swipe and a
small safe speed increase. The penguin follows a Catmull-Rom interpolation through the
authored ramp-node centers, while raster ramp/connector art supplies the visible material.
A slide separated by another obstacle starts a new slide station.

## 5. Traversal action contract

Each obstacle kind maps to one direct micro-interaction. The same action works in every
world; only art, carried object, and guide change.

### 5.1 Crawl

- Visual: guide at the tunnel entrance; a stitched floor trail passes visibly through it.
- Action: drag the guide along the horizontal/vertical trail to the exit. Pointer offset is
  preserved and progress is clamped to the trail.
- Tap alternative: tap entrance, then exit.
- Early release: the guide stays at the achieved progress and the exit gently glows. No
  reset, buzzer, or failure.
- Complete at 88% progress.

Voice: `crawl-prompt`.

### 5.2 Climb

- Visual: three or four large authored handholds are part of the climbing-wall art.
- Action: tap holds bottom-to-top. The guide springs to each hold.
- Out-of-order tap: the correct next hold pulses and the guide gives a tiny encouraging
  wiggle; progress is never removed.
- Complete on the top flag.

Voice: `climb-prompt`.

### 5.3 Hop and balance

- Visual: three stepping surfaces cross water/ground with large invisible hit pads matching
  the visible stones/logs/floes.
- Action: tap them in route order. Each tap produces one readable hop arc. The final landing
  holds for 500ms as the guide balances, then celebrates.
- Out-of-order tap models the next surface without negative feedback.

Voice: `hop-prompt`.

### 5.4 Carry and place

- Visual: one themed loose object (foam block, fruit, or fish/snowball) and an authored goal
  basket/platform.
- Action: drag the object to the goal with a generous padded target.
- Tap alternative: tap object, then goal.
- Missed drop returns the object with a playful paper bounce and leaves the goal glowing.

Voice: `carry-prompt`.

### 5.5 Slide (Arctic only)

- Visual: belly-down penguin on the connected purple paper slide, with alternating left/right
  snowflake gates and a large landing badge.
- Action: horizontal swipes steer. A swipe counts only after 48 CSS px and alternates toward
  the next visible gate. When all gates are collected, the landing badge pulses; tap it to
  hop the landing.
- Tap-only alternative: large left and right paper arrow targets perform identical steering.
- Swiping the same direction twice is not failure; the unmet gate simply stays visible and
  the correct side glows.
- Reduced motion changes discrete pose/position states and skips continuous glide.

Voice: `slide-prompt` or `super-slide-prompt` for a connected run.

## 6. Replay variation and progression

- Worlds differ visually but never hide a learned control behind a new rule.
- Tray modules are reusable; courses may repeat a favorite action.
- A new empty course starts with one of three seedable suggested three-node routes ghosted
  faintly on grid cells. The ghost is a hint, not a requirement, and vanishes after the first
  placement.
- Builder state is saved per world. Returning from another world restores the last course.
- Build Another returns to the same completed pieces, ready to reshape, replace, recolor, or
  replay. A fresh course is deliberately available through the builder's held scrap-basket
  control; completion never hides a destructive routing choice behind a responsive fallback.
- No score, timer, lives, or star withholding.

## 7. Papercraft visual system

The entire child-facing field uses layered construction paper/cardstock: visible fibers,
scissor-cut or deckled edges, corrugated board depth, folded tabs, occasional stitching,
and soft physical shadows. The mockups are the visual north star; the glossy concept video
is a gameplay reference only.

No final primary object may be emoji, SVG, a CSS-drawn illustration, or a generic gradient
card. CSS may position authored raster art, animate it, provide invisible hit areas, apply
the reviewed color-stamp filters, and lay HTML text over authored paper carriers.

### 7.1 Layer stack

1. Authored 1600×1200 world plate, cover-fit.
2. Authored course board/challenge panel.
3. Authored module, guide, item, route, and reward cutouts.
4. Runtime selection/interaction state (halo, transforms, opacity), using raster halo assets
   where visible.
5. Shared raster HUD buttons and DOM accessibility text.

### 7.2 New production assets

| Asset family | Files / count | Working source | Final renderer and budget |
| --- | --- | --- | --- |
| Title | `assets/ui/title.webp` | GPT Image 2, exact title lockup, spell-checked | raster `<img>`, ≤180KB |
| Completion masthead | `assets/ui/course-complete.webp` | GPT Image 2, exact “COURSE COMPLETE!” lockup, spell-checked | transparent raster `<img>`, ≤180KB |
| World plates | `assets/worlds/{backyard,jungle,arctic}.webp` (3) | GPT Image 2, 4:3 plates derived from mockup style | full-bleed raster, each ≤300KB |
| Course furniture | 4×3 grid board, stitched ribbon strip, blank challenge panel, numbered tabs, start/finish flags | GPT Image 2 UI sheet → flat-chroma removal → deterministic crop/finalize | raster, ≤90KB each |
| Guides | puppy/monkey/penguin pose sets: idle, crawl, climb, hop, carry, cheer (18), plus penguin belly-slide (1) | three GPT Image 2 contact sheets → flat-chroma removal | transparent WebP/PNG, 30–100KB each |
| Core obstacles | 4 Backyard + 4 Jungle + 5 Arctic (13) | GPT Image 2 theme sheets → flat-chroma removal | transparent WebP/PNG, 30–100KB each |
| Carry props | loose block, fruit, fish; three goals (6) | same theme sheets | transparent WebP/PNG, 20–70KB each |
| Interaction/UI | paper check, gold halo, 3 stars, 3 dye swatches, undo, scrap basket, slide arrows/gates, snow connector | GPT Image 2 UI sheet → flat-chroma removal | transparent raster, 10–70KB each |
| Audio | all §8 keys | non-identifying `qwen3-tts-voicedesign`, text-only, seeds 7→8→9 | mono AAC M4A, transcript QA ≥0.90 |
| OG image | `assets/og-image.jpg` | production World Select capture | 1200×630 JPEG |

Source sheets, prompts, generation receipts, extraction recipes, QA composites, and rejected
variants live under `assets/source/`; runtime only loads compact finals.

### 7.3 Shared assets

- `shared/assets/ui/btn-home.png`
- `shared/assets/ui/btn-back.png`
- `shared/assets/ui/btn-play.png`
- `shared/assets/ui/btn-sound.png`
- shared Fredoka through `shared/css/base.css`
- shared DOM confetti and SFX; no one-off audio files for taps

### 7.4 Visual acceptance

At full-size 4:3, portrait, and 1180×520:

- every primary object reads as physical paper at first glance;
- foreground cutouts match the plates in fibers, edge treatment, shadow softness, scale,
  and lighting direction;
- no alpha halo is visible on magenta or dark-blue composites;
- tray pieces are large enough to identify before reading labels;
- HUD never covers a grid node, guide, gate, or completion action;
- the unselected world cards remain inviting, not greyed out;
- the selected/current state is legible without relying on color alone.

### 7.5 Casting decision

The brief makes the Puppy, Monkey, and Penguin mechanical: changing world changes the avatar
that physically traverses the child-authored course. They are animal course guides, not
one-off human cast members replacing Maya, Leo, Nia, Sam, or Ravi. No new child/person is
introduced. Adding a canonical child beside each animal would crowd the small builder,
weaken the direct “help this friend through your course” read, and contradict the three
world/three mascot promise. If a future grown-up layer depicts a child, it must use the
canonical cast unchanged; this build keeps the safe physical-play invitation voice-only.

**Recorded exception, approved at production-design review on 2026-08-16:** the user's
selected source brief explicitly binds each world to its own animal mascot. The primary
orchestrator therefore treats those animal avatars as themed gameplay objects, not a new
human cast, and approves the animal-only traversal. This is a narrow exception for this
concept; it does not authorize alternate designs for Maya, Leo, Nia, Sam, or Ravi. The final
Art Director must still reject any mascot whose rendering drifts from the common Papercraft
material language.

## 8. Spoken script — verbatim recording manifest

All lines are warm, playful, concise, and unhurried. Runtime HTML labels are supplemental;
these lines plus pictures carry the game for a pre-reader.

| Key | Exact line |
| --- | --- |
| `choose-world` | “Choose a world to build in. Puppy, monkey, or penguin?” |
| `world-backyard` | “Backyard adventure! Puppy is ready.” |
| `world-jungle` | “Jungle adventure! Monkey is ready.” |
| `world-arctic` | “Arctic adventure! Penguin is ready to slide.” |
| `builder-intro` | “Build your course. Tap an obstacle, then tap a glowing spot. Or drag it there.” |
| `need-three` | “Add three obstacles so your friend has a course to explore.” |
| `builder-ready` | “Your course is ready! Move pieces, stamp colors, or press play.” |
| `tunnel-picked` | “A tunnel for crawling!” |
| `climb-picked` | “A wall for climbing!” |
| `hop-picked` | “Stepping stones for hopping and balancing!” |
| `carry-picked` | “A treasure to carry!” |
| `slide-picked` | “A slide ramp! Put slides together for a longer glide.” |
| `play-intro` | “Here we go! Help your friend through the course you built.” |
| `crawl-prompt` | “Drag your friend through the tunnel.” |
| `climb-prompt` | “Tap the handholds from bottom to top.” |
| `hop-prompt` | “Tap each stepping stone. Hop and balance!” |
| `carry-prompt` | “Carry the treasure to the basket.” |
| `slide-prompt` | “Swipe left and right to steer. Then tap the landing.” |
| `super-slide-prompt` | “Super slide! Swipe left and right through every snowflake gate.” |
| `gentle-hint` | “You’re close. Follow the glowing paper trail.” |
| `station-cheer-1` | “You made it!” |
| `station-cheer-2` | “Great course move!” |
| `station-cheer-3` | “On to the next adventure!” |
| `course-complete` | “Course complete! You built it, then played it!” |
| `real-world-invite` | “Ask a grown-up to help make a safe floor course with pillows and tape. Grown-ups check every piece before you move.” |
| `build-another` | “Let’s build another course!” |

The final manifest may split a long line at a natural pause, but the audible wording cannot
change without updating this table, `assets/audio/lines.json`, and transcript QA together.

### 8.1 Voice triggers, interruption, and idle ladders

- World Select: `choose-world` after the first non-card gesture and at idle nudge 0; a world
  card interrupts it with that world's line. Entering Builder interrupts all splash audio.
- Builder first entry per session: `builder-intro`. Selecting a tray kind interrupts with its
  `*-picked` line. When the third node is first added, `builder-ready` plays once for that
  course. Early Play always interrupts with `need-three`.
- Builder idle: at 12s replay the current instruction; at 24s glow three suggested empty
  cells and speak `gentle-hint`; repeat every 18s without adding or moving anything.
- Traversal entry: `play-intro`, immediately followed by the first action prompt. Later
  stations speak only their action prompt. Sound replays the current action, debounced.
- Traversal idle: at 10s repeat the current prompt; at 20s model only the next gesture/target
  and speak `gentle-hint`. Modeling never completes an action.
- Success interrupts hints, plays one seedable `station-cheer-*`, then advances after the
  bounded payoff. `course-complete` interrupts the last station line.
- Completion: after `course-complete`, wait for its actual clip duration plus 300ms, then say
  `real-world-invite`. Build Another interrupts and speaks `build-another` in the builder.
- Narrator's monotonic token governs every sequence. Screen transitions, sound replay, and
  new child actions may interrupt older lines; no delayed promise may resume stale speech.

## 9. Feedback, accessibility, and robustness

- Touch targets are at least 96px including invisible padding.
- Pointer Events only. Gameplay drags use the shared window-level drag controller.
- Every drag action has a tap-tap equivalent.
- Core play requires no reading; text remains for adults, localization, and screen readers.
- Native buttons carry accurate `aria-label`, `aria-pressed`, and `data-target` state.
- A polite live region announces selection, course length, current action, and completion.
- First gesture unlocks voice, speech fallback, and SFX. Visibility/page-show reopens audio.
- Sound control mutes every channel but keeps the live region active.
- Idle nudges repeat/model; they never time out, advance, or scold.
- `prefers-reduced-motion` removes confetti/moving ghosts and uses discrete action poses.
- Safe-area variables protect corner controls; orientation change cancels active drags and
  rerenders semantic state without losing order.
- During traversal, pointer cancellation/rotation/visibility loss restores the last committed
  action checkpoint: crawl keeps normalized progress, climb/hop keep completed targets, slide
  keeps collected gates, and carry returns the loose prop to its start. A payoff already
  committed stays committed and resumes at the next station. On visible/pageshow the current
  prompt repeats after audio is re-unlocked by the next gesture.
- Landscape, portrait, and 1180×520 share the same state and interaction semantics.
- Storage failure falls back to session state. Clearing storage never blocks play.
- Runtime makes no model, LAN, analytics-beyond-platform, or other network requests.

## 10. State and persistence

Serializable state shape:

```js
{
  version: 1,
  selectedWorld: 'backyard' | 'jungle' | 'arctic',
  courses: {
    backyard: [{ id: 'node-id', kind: 'tunnel', color: 'sunny', cell: 'c0-r1' }, ...],
    jungle:   [...],
    arctic:   [...]
  }
}
```

Transient state (`screen`, selected tray/piece, active drag, station index, action progress,
busy, muted, RNG) is never persisted. Course arrays contain zero to five validated module
records; three is only the traversal threshold. Unknown kinds/colors/cells are dropped on
load, duplicate/occupied cells keep the earliest valid record, and node ids are repaired.
Every edit, including partial 0/1/2-node work, saves immediately. Saved state is bounded and
local-only.

## 11. Runtime architecture

Game-local files:

```text
games/obstacle-course-builder/
├── index.html
├── config.js                 # thin fetch shim
├── config.json               # themes, asset refs, lines, color maps
├── styles.css
├── js/main.js                # screen/state orchestration
├── game.json
├── game-design.md
├── ASSETS.md
├── assets/
└── tools/qa.mjs
```

Shared modules:

- `screens.js`, `hud.js`, `tap.js`
- `audio-unlock.js`, `voice-clips.js`, `narrator.js`, `sfx.js`
- `timers.js`, `celebrate.js`, `rng.js`, `preload.js`
- `stage/drag-to-slot-dom.js`
- `debug-harness.js`

The course builder and traversal remain game-local because their sequence grouping,
challenge gestures, and visual state are specific to this fantasy. No new shared API is
introduced unless a second real consumer appears.

## 12. `window.QLOBE_DEBUG` contract

Required v1 floor:

- `ready`, `listModes()`, `startMode(id)`, `getState()`, `getTargets()`
- `tap(targetId)`, `winRound()`, `home()`, `mute()`, `seed(n)`, `fastTimers(scale)`

Game-specific additions:

- `selectWorld(id)`
- `getCourse(world?)`
- `place(kind, index, fromIndex?)`
- `remove(index)`, `swap(a, b)`, `setColor(index, color)`, `undo()`
- `startTraversal()`
- `completeAction()` and `nextStation()`
- `getActionState()` including slide-run length/gates, carry/drop state, and current hold
- `clearSavedState()` and `loadSavedState(snapshot)`
- `getAudioLog()` / `clearAudioLog()`

For the v1 vocabulary, the three worlds are the game's modes:
`listModes()` returns `backyard`, `jungle`, and `arctic`; `startMode(id)` selects that world
and resolves when its builder awaits input. `winRound()` completes the current traversal
action, or fills a minimum valid sample course and starts traversal when called in Builder.

`tap()` and semantic helpers must call the same action functions as real touch. The QA suite
must still exercise at least one actual pointer drag per builder/traversal drag type.

## 13. Explicit departures and reasons

### From the concept brief

1. The unspecified “3D grid” becomes a shallow 4×3 Papercraft snap grid. It preserves real
   spatial layout, route reshaping, and curvy connected slides while avoiding precision-heavy
   free-pixel placement. Course order remains explicit and every sequence is runnable.
2. Tilt steering is not required. Horizontal swipe plus large tap arrows provides the same
   Arctic steering fantasy without sensor permission, device-orientation ambiguity, or an
   inaccessible mandatory control.
3. Color customization is a three-state paper-dye stamp, not unrestricted color editing.
   It stays understandable and preserves art-direction quality.
4. The app invites a safe grown-up-assisted physical course only after the digital loop.
   The core remains fully playable on the tablet, matching platform philosophy.

### From the mockups

1. Mockup headings and labels become supplemental HTML/voice rather than baked generated text.
2. “Build 1 of 3” becomes a three-to-five-piece sandbox on a visible twelve-cell grid.
3. The three completion stars are unscored accomplishments, never withheld ratings.
4. Builder and traversal support all three worlds; Arctic is no longer the only fully realized
   state.
5. Generated gear/settings controls that have no product behavior are omitted. Sound remains
   the only global setting.

### From the concept video

The glossy 3D/cartoon rendering and malformed/non-brief characters are rejected. Only the
fast builder→run→celebrate pacing informs production. Papercraft is authoritative.

### From the replaced prototype

The `coach-timer` household checklist, old Field Journal background, emoji construction art,
timers, race-announcer framing, and two mode cards are removed. The safety-aware physical-play
idea survives only in `real-world-invite`; the primary game becomes the promised digital
sandbox and traversal simulation.

## 14. Release and verification gates

### Static/data

- `node --check games/obstacle-course-builder/js/main.js`
- `node tools/pipeline/sync-games-registry.mjs --check --only obstacle-course-builder`
- `node tools/validate/run.mjs obstacle-course-builder`
- `git diff --check`
- every runtime asset path lowercase, relative, present, optimized, and provenance-logged
- every audio clip transcript-QA accepted; fallback lines exactly match §8

### Automated real-Chrome QA

- World Select → each of three worlds → builder → traversal → end → build another/world select
- drag and tap-tap placement; append, replace, swap obstacle kinds, move grid nodes, delete,
  undo, and direct color-stamp selection
- early Play guidance at 0, 1, and 2 modules
- 3- and 5-module courses, duplicates, and every action kind
- one separated slide plus a 2+ connected slide run, swipe and tap-arrow paths, landing tap
- wrong/out-of-order/missed inputs are gentle and never remove progress
- pointercancel, blur, hidden/pagehide, second finger, orientation change, and rerender leave no
  drag ghost or wedged state
- empty and 1–5-node saved builds restore across reload/orientation; malformed storage is
  discarded safely
- Build Another always keeps the finished course and returns to its builder; held Clear is
  the only whole-course destructive action
- every §8.1 voice trigger/idle sequence interrupts cleanly and logs the expected key
- crawl/carry/slide cancellation and rotation preserve the specified committed checkpoints
- recorded clips play as `kind: clip` in real Chrome after a gesture
- landscape 1024×768, portrait 768×1024, short 1180×520, reduced motion
- zero unexpected console errors, warnings, failed requests, or 404s

### Visual QC captures

- World Select selected/unselected
- each world builder with three and five modules
- builder drag peak and color palette
- crawl, climb, hop, carry, single slide, connected super-slide, and landing
- course completion for all three worlds
- portrait/landscape/short landscape and reduced motion
- local and deployed production route

An independent adversarial Art Director compares these captures with the concept mockups and
§7.4, then returns a severity-ranked rejection list. Material-fidelity failures are release
blockers even when DOM and interaction tests pass.

### Production

- commit only task-owned files and the target registry fields
- push the intended branch and wait for GitHub Pages success
- run the same smoke suite against `https://qlo.be/games/obstacle-course-builder/`
- visually inspect deployed captures, not only the workflow result
- keep status `beta` until the target child succeeds on the real iPad

## 15. Known risks

- Generated contact sheets can drift in style/scale between cells; accepted masters must be
  reviewed together before extraction.
- Foreground extraction can leave faint key-color fringes; source comparisons and alpha
  composites are required, and the deterministic chroma settings remain in source QA.
- A readable 4×3 grid plus a five-item tray is height-constrained in short landscape; the
  1180×520 gate is binding, not optional.
- Static guide cutouts must read as action through sufficiently large bounded movement; peak
  frames are part of visual QA.
- CSS hue transforms can break world palettes; values are per-theme and must pass side-by-side
  review on every obstacle.
- A full three-world asset set is larger than a typical game; compact WebP finals are eagerly
  warmed so screen changes never pop, and the production transfer-size gate remains binding.
