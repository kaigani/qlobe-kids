# Garden Graphers — production game design

**Category:** `math-number-sense`  
**Audience:** ages 5–6  
**Status at handoff:** `beta` until a child succeeds on a real iPad  
**Art direction:** **Watercolor / Storybook** (legacy production style id: `field-journal`)  
**Route:** `games/garden-graphers/`

## Product promise

Garden Graphers turns a picture graph into a garden that the child grows with
their own hands. Ari the armadillo is making a Great Garden Guest Book. Every
visitor the child sorts becomes one countable watercolor picture in the
journal; completed graphs can then be counted and compared, and every solved
page makes a flower bed bloom.

The graph is never introduced as a worksheet. It is the visible record of a
playful garden action: **find, place, see the picture land, then notice what the
garden tells you**. A child should understand the current action within five
seconds from the large moving specimen, the matching painted category keys, and
the spoken prompt.

## Learning promise

The game family practices four connected ideas through three focused modes:

1. Classify visible objects by type.
2. Understand that each picture in a graph stands for one object.
3. Count a picture-graph column with one-to-one correspondence to 6.
4. Compare graph quantities as most, fewest, or the same.

No mode requires reading, speed, scorekeeping, or precision dragging.

## Core world and session loop

```text
catalog
  → splash: Ari invites the child into the garden
  → journal map: choose one of three open activities
      ├─ Sort & Stamp: classify visitors into graph columns
      ├─ Tap & Count: count every picture in one graph column
      └─ Garden Compare: choose most, fewest, or an equal pair
  → three-round mode reward: one journal badge + one flower bed blooms
  → journal map
  → all three badges: the Great Garden Guest Book finale
  → play again or choose any activity
```

A mode lasts about 45–90 seconds. A complete three-mode session lasts about
4–6 minutes. All activities are open immediately; badges show what has been
visited during the current session and never lock content.

## Modes

### 1. Sort & Stamp

**Single skill:** classification by observable object type.

- Four to seven large visitors rest in the watercolor meadow beside an open
  field journal.
- Each journal column has a distinct dark-green raster nameplate below the
  graph baseline. A tiny embedded visitor thumbnail and a large category name
  identify bee, butterfly, or ladybug without resembling another data unit.
- The child drags a visitor to the matching column or uses the equal tap-tap
  path: tap visitor, then tap column.
- A match settles into the next fixed graph cell with a paper-stamp pop. The
  graph grows one picture at a time, but the mode never quizzes quantities.
- A different column gives a warm wobble, briefly glows the matching
  category key, and returns the same visitor without changing progress.
- When every visitor is placed, Ari traces the finished columns with a leaf
  flourish and the page blooms.

Curated progression:

| Round | Categories | Visitors | Design intent |
| --- | ---: | ---: | --- |
| 1 | bee + butterfly | 4 | two very different silhouettes |
| 2 | bee + butterfly + ladybug | 5 | introduce a third category |
| 3 | bee + butterfly + ladybug | 7 | fluent classification, denser graph |

### 2. Tap & Count

**Single skill:** one-to-one counting of graph pictures to 6.

- One graph column is already filled with identical visitor pictures.
- The prompt names the visitor and asks the child to tap each picture.
- Each uncounted picture accepts one tap, gains a small painted leaf halo,
  and speaks the next count through the verified voice-delivery path.
- Tapping an already-counted picture gives a soft tick but never increments
  twice.
- The final picture lifts the whole column, reveals a large live HTML numeral
  on an authored watercolor plaque, and blooms the matching flower cluster.

Curated progression: 3 bees, 4 butterflies, then 6 ladybugs. Replay preserves
the deliberate 3 → 4 → 6 ramp so the relationship remains predictable.

### 3. Garden Compare

**Single skill:** compare quantities in picture graphs.

- Two or three complete picture-graph columns are shown together.
- The spoken prompt asks for **most**, **fewest**, or **the same number**.
- For most/fewest, the whole column is one generous target. A correct choice
  rises and grows flowers at its base.
- For same, the child taps two columns. Selected columns gain a leaf wreath;
  the correct pair celebrates together. A non-matching pair gently releases
  and Ari models, “Look for two columns that reach the same row.”

Curated progression:

| Round | Graph totals | Question |
| --- | --- | --- |
| 1 | 2, 4, 3 | most |
| 2 | 5, 2, 4 | fewest |
| 3 | 3, 3, 5 | same number |

Replay draws from a curated bank with exactly one unambiguous answer and no
totals above 6.

## Screen design

### Splash

- Full-bleed, richly painted morning garden with a quiet central clearing.
- Generated `Garden Graphers` watercolor title lockup, spell-checked at full
  size, with a tiny leaf-and-picture-graph flourish.
- Ari's canonical pose and identity appear as a constrained GPT Image 2
  watercolor/gouache edit, with the untouched canonical source retained for
  comparison and rollback.
- One large blank watercolor action carrier holds the live HTML invitation.
  Home is top-left; Sound is top-right.

### Journal map

- Three authored seed-packet/card carriers form one readable row in landscape
  and one vertical stack in portrait.
- Each card is composed from raster art: visitor trio for Sort & Stamp, a
  countable vertical bug stack for Tap & Count, and unequal/equal picture
  columns for Garden Compare.
- Mode names remain live HTML for adults, but pictures and spoken lines carry
  the choice for a pre-reader.
- Earned journal badges sit on the cards. Back returns to the splash.

### Play

- The open field-journal graph is the dominant object, never a generic panel.
- Landscape places the specimen meadow/tray at left and the graph at right.
  Portrait places the meadow above the graph. The journal preserves a fixed
  normalized coordinate system so graph icons stay aligned to painted rows.
- A short live HTML prompt sits on an authored torn-paper banner; Sound replays
  it. Text is supplementary.
- Back returns to the journal map without completing the round.

### Mode reward

- The completed graph remains visible; the relevant flower cluster grows from
  its base and Ari appears beside the page.
- A painted badge lands in the journal. One large action returns to the map or
  advances to the next unvisited activity.
- Reduced motion swaps directly to the final tableau while preserving voice,
  chime, and the fully bloomed image.

### Great Garden Guest Book finale

- All three finished activity badges surround a large open journal.
- Bee, butterfly, and ladybug columns are countable and three flower clusters
  form one coherent garden tableau.
- Ari holds the journal badge. `Grow another graph` starts a fresh session;
  Back returns to the map and preserves the current badges.

## Exact voice script

These exact lines are the source of truth for both teacher-voice generation and
the Web Speech fallback. The current all-or-none manifest intentionally uses
device speech because no complete Whisper-verified clip set was available.

| Key | Verbatim line |
| --- | --- |
| `welcome` | “Ari is making a garden guest book. Come grow a picture graph!” |
| `choose-mode` | “Choose a garden page.” |
| `menu-sort` | “Sort and stamp the garden visitors.” |
| `menu-count` | “Tap each picture and count.” |
| `menu-compare` | “Find which garden group has more, fewer, or the same.” |
| `sort-prompt` | “Put each garden visitor with the matching picture.” |
| `sort-nudge` | “Look at the visitor, then find the same picture.” |
| `sort-success` | “Every garden visitor is in the graph!” |
| `count-bee` | “Tap each bee and count with me.” |
| `count-butterfly` | “Tap each butterfly and count with me.” |
| `count-ladybug` | “Tap each ladybug and count with me.” |
| `count-nudge` | “Tap a picture that has not grown a leaf yet.” |
| `number-1` | “One.” |
| `number-2` | “Two.” |
| `number-3` | “Three.” |
| `number-4` | “Four.” |
| `number-5` | “Five.” |
| `number-6` | “Six.” |
| `count-success` | “You counted every picture in the column!” |
| `compare-most` | “Which column has the most?” |
| `compare-fewest` | “Which column has the fewest?” |
| `compare-same` | “Tap the two columns with the same number.” |
| `compare-nudge` | “Look at how high each picture column grows.” |
| `compare-same-nudge` | “Find two columns that reach the same row.” |
| `compare-most-success` | “Yes! That column has the most.” |
| `compare-fewest-success` | “Yes! That column has the fewest.” |
| `compare-same-success` | “Yes! Those two have the same number.” |
| `mode-sort-complete` | “Your sorting page is blooming!” |
| `mode-count-complete` | “Your counting page is blooming!” |
| `mode-compare-complete` | “Your comparing page is blooming!” |
| `finale` | “Ari’s Great Garden Guest Book is full of pictures, numbers, and blooms. Beautiful graphing!” |
| `again` | “A fresh garden is ready.” |

## Audio design

- `qwen3-tts-voiceclone`, using the committed rights-cleared teacher voice,
  seed ladder 7 → 8 → 9.
- Every accepted clip must pass exact normalized `whisper-stt` comparison for
  instruction, category, comparison, and number words. A rejected line falls
  back to correct device speech rather than shipping confidently wrong audio.
- Shared `gentle-country-morning.mp3` plays quietly through `shared/js/bgm.js`,
  starts only after a real gesture, ducks under speech, follows mute, and stops
  when the game is left.
- Shared pop, boing, sparkle, tick, and tada effects support touch. A short
  game-local paper-stamp sound may be added only if it improves the authored
  graph beat and remains below narration.

## Art direction and production asset list

All child-facing primary objects are authored raster art. CSS is limited to
layout, hit areas, clipping, selection rings, responsive transforms, and
animation. There is no SVG, canvas illustration, CSS gradient, CSS-drawn bug,
CSS-drawn flower, CSS card, CSS book, or emoji placeholder.

| Asset | Working size | Renderer and use |
| --- | ---: | --- |
| garden background plate | 2048×1536 source; 1600×1200 WebP | full-bleed `<img>` with calm graph-safe center |
| title lockup | up to 1400×520 source; ≤1000 px WebP | transparent/chroma-extracted image with accessible name |
| open graph journal | 1200×900 source; ≤1000 px WebP | blank six-row picture-graph page; normalized overlay anchor |
| blank seed-packet mode card | 520×620 | reused carrier with live text and raster specimen compositions |
| blank prompt banner | 900×190 | live prompt text overlay |
| blank action carrier | 700×230 | live button text overlay |
| journal badge | 320×320 | leaf + three tiny graph columns, no text |
| bee, butterfly, ladybug | 512×512 each | isolated watercolor visitors; repeated as specimens and graph pictures |
| daisy, coneflower, sunflower clusters | 560×500 each | reward blooms and category color anchors |
| graph category keys | 420×150 each | painted green/gold raster nameplate + tiny embedded visitor icon + category name, below the graph baseline |
| Ari notice + celebrate | ≤640 px WebP | constrained GPT Image 2 watercolor edits from retained canonical poses |
| mode-card compositions | deterministic composition of card + runtime sprites | no extra generated duplicate art |
| hub tile | 640×533 JPEG | Studio `menu-game-tile`, Krea 2 Toy menu grammar, no title/UI |
| OG image | 1200×630 JPEG | generated from the final live splash capture |

GPT Image 2 establishes the coherent background, title, specimen sheet, UI
carrier sheet, hub fallback, and constrained Ari watercolor edits. Qwen Image
Layered and Krea 2 were attempted through the approved LAN API but were
unavailable; the records truthfully retain those failures and the deterministic
local fallbacks. Every source, final prompt, extraction output, magenta QA
composite, accepted/rejected decision, and deterministic crop is retained below
`assets/source/` and recorded in `ASSETS.md`.

Budgets: background ≤300 KB; ordinary sprite 30–100 KB; title ≤150 KB; first
paint visual payload target ≤1.35 MB.

## Responsive and interaction rules

- Primary QA sizes: 1180×820 landscape, 820×1180 portrait, and 1180×520 short
  landscape; production is also checked at current iPad landscape/portrait.
- `100dvh`, safe-area insets, no page scroll, no content under the HUD.
- Every interactive target is at least 96×96 CSS px. A graph column target may
  be visually narrower only when its invisible hit area meets the floor and
  does not overlap a neighbor ambiguously.
- Drag uses `shared/js/stage/drag-to-slot-dom.js`: one primary pointer,
  retained grip offset, window-level move/up, pointer-cancel and blur as cancel,
  and stray-ghost cleanup.
- Tap-tap calls the exact same placement handler as drag.
- Selection is visible through a leaf halo and scale lift, never color alone.
- Graph icons occupy fixed row slots; quantity is never represented by
  incidental overlap or CSS height alone.
- Reduced motion removes floating, stamp travel, bloom scaling, and confetti;
  it keeps immediate state changes, voice, and the final tableau.

## Feedback and idle help

- **Correct:** soft pop, visitor flies/settles into a fixed graph cell, cell
  receives one painted leaf glint.
- **Different category:** warm boing, visitor returns, matching category key
  gently pulses, spoken model; no red X or progress loss.
- **Idle nudge 1:** replay the concise current prompt.
- **Idle nudge 2:** animate the relevant visitor and matching category key or the
  comparable graph row.
- **Idle nudge 3:** model one placement/count/choice without stealing already
  completed progress.
- **Celebration:** graph remains visible, flower cluster blooms, leaf-and-petal
  burst, recorded praise, badge landing.

## Difficulty and replay variation

- Curated round banks guarantee legible, unambiguous graphs.
- One seeded RNG shuffles visitor tray order, column order, and equivalent
  round variants. `QLOBE_DEBUG.seed(42)` reproduces every deal.
- Counts stay within 1–6 so every icon remains large and individually
  countable in portrait.
- First comparisons have different column heights; equality appears only after
  most and fewest have been modeled.
- Replay changes visitor/category placement, exact totals, and flower color
  pairing while preserving the interaction grammar.

## Privacy, persistence, and fallback

The game requests no permission, records nothing, stores no child data, and
makes no runtime model/API request. Session badges exist only in memory. The
recorded voice falls back to exact device speech; silent play remains possible
from picture matching, one-at-a-time count glows, and graph motion.

## Shared modules

- `shared/js/screens.js`
- `shared/js/hud.js` and `shared/css/hud.css`
- `shared/js/tap.js`
- `shared/js/audio-unlock.js`
- `shared/js/voice-clips.js` and `shared/js/narrator.js`
- `shared/js/bgm.js`
- `shared/js/sfx.js` and `shared/js/celebrate.js`
- `shared/js/timers.js` and `shared/js/idle-nudge.js`
- `shared/js/stage/drag-to-slot-dom.js`
- `shared/js/debug-harness.js`, `shared/js/rng.js`, and `shared/js/preload.js`
- `shared/characters/ari/portrait.png`
- `shared/assets/music/gentle-country-morning.mp3`

The garden graph state machine remains game-local because no current engine
combines live classification placement, one-to-one graph counting, and pairwise
graph comparison. Existing engines remain unchanged.

## `QLOBE_DEBUG` v1

The game exposes:

- `ready`, `listModes()`, `startMode(id)`, `getState()`, `getTargets()`,
  `tap(id)`, `winRound()`, `home()`, `mute(on)`, `seed(n)`, and
  `fastTimers(scale)`;
- `drag(visitorId, columnId)` through the same semantic placement handler as
  real Pointer Events;
- `wrong()` for the current mode's gentle-retry branch;
- `getGraph()` returning ordered, serializable category totals and cell state;
- voice/audio logs proving recorded clips play after a real gesture;
- state including screen, mode, round id/index, selected visitor/columns,
  placed/count-tapped ids, completed modes, current prompt, reduced motion,
  and `awaitingInput`.

Debug completion may compress choreography but must use the same placement,
count, comparison, reward, and navigation handlers as child input.

## Explicit departures and decisions

- No prior Garden Graphers brief, concept video, or mockup folder exists. The
  screen hierarchy is grounded in the platform's Watercolor / Storybook
  mockups (`local-nature-guide`, `bean-sprout-watch`) and rebuilt for this
  concept rather than inventing authority that is not present.
- Classification immediately makes the picture graph. A separate “sort, then
  later graph” worksheet step would hide the relationship between one object
  and one picture.
- Comparison is its own mode rather than an unavoidable quiz after sorting.
  This preserves one skill focus and lets a younger child enjoy classification
  without a second demand.
- Ari uses the canonical shared portrait rather than an unreviewed generated
  redesign. The garden world changes material; the recurring cast identity does
  not.
- MiniMax video is intentionally omitted. A short video would not communicate
  classification, counting, or comparison better than the live graph and would
  add payload without improving the core fantasy.

## Release gates

- Every round, replay, retry, drag, tap-tap, and navigation branch passes in
  real Chrome through the game-local QA suite.
- Recorded teacher clips decode and every intended line has exact normalized
  Whisper evidence; otherwise the whole game uses the correct speech fallback.
- Landscape, portrait, short landscape, and reduced-motion screenshots pass
  full-size human review.
- An independent adversarial ART DIRECTOR reviews every screen, the full-size
  source sheets, all separated assets on magenta, and peak-motion captures;
  all BLOCKER and MAJOR findings are revised and rechecked.
- No console errors, failed runtime requests, missing assets, remote model
  calls, clipping, overlap, or touch target below 96 px.
- `game.json`, `games.json`, usage index, head metadata, and validators agree.
- Production at `https://qlo.be/` is smoke-tested and visually captured after
  deployment when shipping is in scope.
- Status remains `beta` until the target child succeeds on a real iPad.
