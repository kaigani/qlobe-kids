# Game Design Document — Momma Bear's Storybook

## Product promise

Momma Bear opens a handmade paper storybook and invites a four- or five-year-old
to make three uncommon fairy tales come alive. The child taps every printed word,
hears it in a warm teacher voice, then watches paper pose actors perform the whole
sentence. Six short pages form a clear beginning, middle, and end. The fantasy is
not “complete a reading worksheet”; it is “my finger wakes up the story.”

## Game identity

- **Id:** `momma-bear-storybook`
- **Title:** Momma Bear's Storybook
- **Category:** `reading-phonics`
- **Age:** 4–5
- **Status at first release:** `beta` until the target child succeeds on a real
  iPad without adult coaching
- **Canonical art direction:** **Papercraft**
- **Runtime/template style id:** `paper-garden`
- **Primary skill:** one-to-one print tracking: one visible word maps to one
  spoken word
- **Secondary experiences, not separate assessed skills:** sight-word
  familiarity, story sequence, listening, and gentle literary wonder

## Source and adaptation policy

The source is Andrew Lang's public-domain anthology, locally preserved at
`../../../01-game-concepts/momma-bear-storybook/blue-fairy-book.txt` (Project
Gutenberg eBook 503). This game adapts three lesser-known entries:

1. **“Why the Sea Is Salt”** → **The Little Mill and the Sea**
2. **“Felicia and the Pot of Pinks”** → **Fia and the Pink Flowers**
3. **“The Princess on the Glass Hill”** → **The Glass Hill**

The adaptations retain each tale's memorable image and emotional engine while
removing material inappropriate for ages 4–5. Poverty as humiliation, revenge,
death at sea, threats, forced marriage, body-shaming, and punitive magic are not
retold. Conflict becomes a safe small mishap; generosity, calm courage, and
sharing resolve it. The provenance document names the original tales and the
scope of each transformation.

## Reference synthesis and explicit departures

There are no Momma Bear-specific mockups in the concept folder. The visual and
interaction references are therefore the approved production mockups for:

- `../../../01-game-concepts/_completed/_posted/tiny-reader-theater/output/ui-mockups/`
- `../../../01-game-concepts/_completed/_posted/story-stones/output/ui-mockups/`

The new game will also preserve its own generated four-screen papercraft
production mockup under `assets/source/ui-mockups/` before final asset work.

What is carried forward from **Tiny Reader Theater**:

- large, individually tappable HTML words;
- every word must be touched before the line can perform;
- a completed line is read aloud as characters act it out;
- large visual story cards, two-level navigation, replay, and a warm theatrical
  sense of reveal.

What is carried forward from **Story Stones**:

- an authored three-beat narrative contract;
- whole-image pose actors with `neutral`, `enter`, `notice`, `interact`,
  `react`, and `celebrate` poses;
- backdrop, cast, prop, pose-cue, and narration data that Studio can inspect;
- paper-pop entrances, clear stage marks, and beginning/middle/end progression.

Deliberate departures:

- There is no branch choice inside a tale. Fixed adaptations keep the reading
  load controlled and let the child experience a recognizable complete story.
- Story selection replaces Tiny Reader's world-and-cast setup. Three large
  picture-book tabs are understandable without reading and start play in one
  tap.
- Story Stones' `createStoryStage().play()` is not reused as orchestration; it
  serially narrates full beats and cannot wait for word taps. This game uses the
  same theater/pose contracts but gates each sentence through the shared
  tap-to-read controller.
- Tiny Reader's cozy felt surface is not copied. Every child-facing plate,
  character, word carrier, card, progress token, prop, and reward belongs to the
  Papercraft world. CSS supplies layout, hit areas, responsive transforms, and
  focus states only; it does not draw primary artwork.
- Story Stones' CSS hills, clouds, emoji-like arrows, and generic glossy cards
  are not used as visible final art.

## Learning design

### One skill per mode

All three modes practice the same single skill: touch one printed word and hear
that exact word. The narrative changes; the interaction grammar does not.

| Mode | Story value | Reading loop |
| --- | --- | --- |
| `little-mill` | generosity and remembering the gentle stop word | 6 pages, 3 acts, 39 displayed word tokens |
| `pink-flowers` | care, help, and a comic talking cabbage | 6 pages, 3 acts, 44 displayed word tokens |
| `glass-hill` | calm courage and sharing the reward | 6 pages, 3 acts, 38 displayed word tokens |

### Print-tracking behavior

- One whitespace-delimited token becomes one real `<button>` with a minimum
  96px press area.
- The leftmost untouched word has a gentle paper-glow and the story-thread points
  toward it. This models left-to-right order without turning a different tap
  into an error.
- Any visible word may be tapped. A first tap fills its paper tile and counts it;
  every later tap freely replays it.
- Every distinct position must be tapped, including repeated words. The line
  cannot be skipped and never advances on a timer.
- The final word's audio finishes before the full sentence narration begins.
- During sentence narration, the word row is locked so a replay cannot cut the
  narrator off mid-line.
- An idle ladder first repeats “Find the glowing word,” then enlarges the next
  untapped tile, then models that one word. It never completes the word for the
  child.

### Controlled language

Lines are 5–9 tappable tokens, primarily high-frequency sight words and simple
concrete nouns. A small number of story words—`captain`, `cabbage`, `copper`,
`silver`, `sparkles`—are intentionally included because the picture and spoken
word make them meaningful and memorable. Onomatopoeia supplies pleasure and
rhythm. Punctuation remains attached visually but is stripped from audio keys.

## Full story script and staging contract

Each story owns six pages. Pages 1–2 are `beginning`, 3–4 are `middle`, and 5–6
are `ending`. A page has one line, one primary pose cue per on-stage actor, an
optional prop action, and an environment detail. The line below is verbatim for
both the displayed print and the recorded whole-line narration.

### Story 1 — The Little Mill and the Sea

Adapted from “Why the Sea Is Salt.” Pip's gift is earned by sharing, the captain's
mistake is harmless, the ship remains safe, and the sea receives only a sparkling
spill of salt.

| Page | Act | Verbatim line | Visual action |
| --- | --- | --- | --- |
| 1 | beginning | **Pip has one warm bun.** | Pip enters a paper harbor carrying one bun. |
| 2 | beginning | **Pip gives half to a kind man.** | Pip reaches out; the woodcarver accepts half. |
| 3 | middle | **The man gives Pip a magic mill.** | The little mill paper-pops between them. |
| 4 | middle | **“Make salt!” says a ship captain.** | A captain waves from a layered paper boat. |
| 5 | ending | **Whirr, whirr! Salt spills in the sea.** | A white paper salt ribbon curls safely overboard. |
| 6 | ending | **Pip says, “Rest!” and the sea sparkles.** | Mill settles; water glitters; Pip celebrates. |

Story-complete line: **“Pip shared, listened, and helped the sea.”**

### Story 2 — Fia and the Pink Flowers

Adapted from “Felicia and the Pot of Pinks.” The violent royal backstory and
marriage ending are omitted. Fia's patient care, a friendly Wood Queen, and the
source tale's wonderfully absurd talking cabbage carry the story.

| Page | Act | Verbatim line | Visual action |
| --- | --- | --- | --- |
| 1 | beginning | **Fia loves her pot of pinks.** | Fia kneels beside drooping paper flowers. |
| 2 | beginning | **She walks to get fresh water.** | Fia enters a moonlit paper-forest path. |
| 3 | middle | **The Wood Queen gives her a gold cup.** | Queen offers a layered gold-paper cup. |
| 4 | middle | **A silly cabbage says, “Look by the bed!”** | Cabbage bounces and points toward the cottage. |
| 5 | ending | **Fia finds the pinks and shares the water.** | Water arcs from cup; blossoms lift. |
| 6 | ending | **Pop, pop, pop! The pinks wake and bloom.** | Flowers unfold in three paper-pop beats. |

Story-complete line: **“Fia cared for a small thing, and it grew.”**

### Story 3 — The Glass Hill

Adapted from “The Princess on the Glass Hill.” Cinderlad becomes Ash, ridicule is
not repeated, and marriage is not a prize. Ash calmly watches the hay, meets the
three wondrous horses, climbs to collect apples, and brings them home for all.

| Page | Act | Verbatim line | Visual action |
| --- | --- | --- | --- |
| 1 | beginning | **Ash keeps watch by the hay.** | Ash sits calmly at a moonlit paper barn. |
| 2 | beginning | **Boom! A bright copper horse comes near.** | Copper horse enters through trembling hay layers. |
| 3 | middle | **Then silver and gold horses come.** | Copper silhouette fans into silver and gold variants. |
| 4 | middle | **Ash rides up the glass hill.** | Ash and horse climb a translucent vellum spiral. |
| 5 | ending | **Three gold apples shine at the top.** | Apples reveal one by one above the stage. |
| 6 | ending | **Ash brings them home to share.** | Village silhouettes gather; Ash celebrates. |

Story-complete line: **“Ash stayed calm, climbed high, and shared.”**

## Fixed spoken UI script

All lines below are recorded with the approved teacher-voice reference and
retain Web Speech fallback. The story lines and completion lines above are part
of the same source-of-truth audio manifest.

| Key | Verbatim line |
| --- | --- |
| `ui:welcome` | Come close, little reader. Pick a story for us. |
| `ui:how-to` | Tap each word to hear it. The glowing word can go first. |
| `ui:next-word` | Find the glowing word. |
| `ui:line-ready` | Now watch the words come alive. |
| `ui:beginning-done` | That was the beginning. Turn the page for the middle. |
| `ui:middle-done` | That was the middle. Turn the page for the ending. |
| `ui:story-done` | You read the whole story! |
| `ui:again` | Shall we read it again? |
| `ui:new-story` | Pick another story from the shelf. |
| `ui:audio-fallback` | I can still read with you. |

Individual word clips use keys `word:<normalized-word>`. Whole page clips use
`line:<story-id>:<page-number>`. Completion clips use
`complete:<story-id>`. UI clips use the keys above.

## Screen map and navigation

```text
Story Shelf (splash)
  ├─ story card → Read Page 1 → … → Read Page 6 → Story Complete
  │                   └─ act-page turn at pages 2 and 4
  ├─ saved charm tap → Story Complete for that tale
  └─ Home → catalog

Read / Complete Back → Story Shelf
Complete Again → same story Page 1
Complete Shelf → Story Shelf
```

### 1. Story Shelf

- Full-bleed papercraft reading nook, a large open book, Momma Bear as a pose
  actor, generated title lockup, and three oversized picture tabs.
- Cards show a mill by the sea, pink flowers with a cabbage, and a translucent
  hill with three apples. Runtime labels remain HTML below the image for adult
  clarity; spoken selection and pictures make reading unnecessary.
- Each completed tale adds one authored paper charm to Momma Bear's bookmark.
- Home is top-left. Sound is bottom-left. No other screen contains Home.
- Optional quality-gated intro video may animate Momma Bear opening the book
  after the first real gesture. Its static poster is the complete fallback and
  reduced-motion/data-saver path.

### 2. Read Page

- A 4:3 paper theater fills the viewport. Opaque story backdrop is the rear
  layer; transparent pose actors and props occupy a broad performance clearing.
- The sentence lives on authored torn-paper word carriers as exact HTML text.
  The row is above the actor action band in landscape and wraps to two centered
  rows on portrait.
- Back is top-left. Sound is bottom-left and replays the current untapped word,
  or the whole current line after completion. Three authored act tabs sit at
  the top-right and six tiny page stitches show progress.
- A first-time-only, 4-second gesture demo points a glowing paper fingertip at
  the first word; it never blocks manual input and is skipped on replay.
- When all words are touched, the row shimmers, the full line is narrated, actors
  perform, and the page turns automatically. At an act boundary, the book holds
  for a short spoken transition with a large page-tab affordance; tapping it
  advances immediately.

### 3. Story Complete

- Momma Bear returns beside the now-complete six-page miniature. The story's
  paper charm drops onto the bookmark and persists locally.
- The story-specific completion line is spoken after “You read the whole
  story!”
- Two ≥96px authored controls: circular Again and open-book Story Shelf.
- Back returns to Story Shelf. A short paper-confetti burst and actor bow are
  disabled under reduced motion, but sound and the static charm payoff remain.

## Interaction and feedback details

- **Word press:** same `onTap` pointer-up path as QLOBE controls; tick + spoken
  word + paper tile fill + small actor acknowledgement.
- **Repeated word press:** replays with the same delight; no penalty.
- **Line completion:** wait for final word audio; shimmer; narrate the exact
  sentence; apply `story` poses and prop motion; settle to `neutral`.
- **Page turn:** layered raster paper-turn sprite sequence or a clipped raster
  page texture. CSS may transform the raster layer but may not draw the page.
- **No wrong-answer state:** every word is a valid invitation. The only
  incomplete state is “some words are still waiting.”
- **Rapid taps:** a word audio token supersedes the previous word, but completion
  is delayed until the final newly-tapped word finishes. Stage narration locks
  the row.
- **App switch / visibility:** audio unlock latch reopens; active narration
  stops; current page and touched indices remain.
- **Orientation change:** story/page state remains; Pixi stage relayouts; words
  reflow without losing pressed state.

## Difficulty, pacing, and replay

- The first story uses the shortest lines and most familiar vocabulary.
- Fia introduces a longer proper noun (`Wood Queen`) and one nine-token line.
- The Glass Hill adds material words (`copper`, `silver`, `gold`) but strong
  color/shape cues make them concrete.
- Story order is a recommendation, not a lock. All three are available at once.
- A tale lasts about 2–4 minutes at child pace; all three form a 7–10 minute
  session.
- Word replay, alternate pose micro-reactions, the three-story charm set, and
  the tactile page turns support repeat play without randomizing the prose.

## Runtime architecture

This is a custom static game, not an archetype engine:

```text
games/momma-bear-storybook/
├── index.html
├── config.js                 thin fetch shim
├── config.json               stories, pages, stage/pose/prop cues, audio text
├── game.json
├── game-design.md
├── ASSETS.md
├── css/style.css
├── js/main.js                screens, state, persistence, audio, debug surface
├── js/storybook-stage.js     Story Stones-style pose actor + prop staging
├── assets/
│   ├── actors/pack.json
│   ├── pose-actors/<id>/poses.json + poses/*.webp
│   ├── props/pack.json + *.webp
│   ├── backdrops/*.webp
│   ├── ui/*.webp
│   ├── audio/{manifest.json,lines.json,*.m4a}
│   ├── video/ (optional accepted intro only)
│   └── source/               generations, prompts, recipes, QA composites
└── tools/{generate-voice.py,qa.mjs}
```

### Shared platform contribution

Tiny Reader Theater's game-local `js/word-tap.js` has now proven a second
consumer. The implementation will promote it behavior-preservingly to
`shared/js/word-tap.js`, update Tiny Reader's import, and let both games style
the predictable `trt-word-*` hooks. This is deliberately the only modification
to the existing game. Its complete QA suite must pass before integration.

The new stage adapter remains game-local until another fixed-page pose-reader
needs it. It imports `createStage`, `createTheater`, pose actors, prop packs,
tween/particles, audio unlock, voice clips, screens, HUD, tap, idle nudge,
timers, RNG, celebration, and debug harness from `shared/`.

## Data contract

`config.json` is editable data and contains:

- game identity and the three modes;
- `actorPack`, `propPack`, `floorY`, and default pose cues;
- each story's id/title/source title/card/backdrop/charm;
- six ordered pages with `act`, `line`, `lineKey`, `actorIds`, `poses`,
  `props`, and optional stage action;
- all fixed spoken UI strings;
- source/bibliographic notes used by Studio and provenance checks.

Structural validation rejects a story unless it has exactly six nonblank pages,
two pages per ordered act, valid actor/pose/prop references, 5–9 tokens per line,
unique line keys, and a completion line.

## Visible art vs. interaction substrate

| Child-facing object | Visible renderer | Interaction substrate |
| --- | --- | --- |
| open book / reading nook | generated opaque Papercraft WebP | screen section and cover-fit image |
| title | generated alpha-trimmed raster lockup | accessible `<img>` |
| story cards | authored paper-collage WebPs | real ≥96px buttons |
| word carriers | authored torn-paper tile sprites | HTML buttons + real HTML text |
| pose characters | six transparent 1024px fixed-canvas WebPs per actor | Pixi pose actor |
| props | transparent authored WebPs | Pixi prop definitions |
| act tabs / page stitches / charms | authored raster UI family | progress state / buttons where interactive |
| page turn | authored raster page layer or accepted video | transform/timer and reduced-motion branch |
| confetti | small authored paper flecks; code positions them | particle system |

Gradient, border, box-shadow, clip-path, SVG, emoji, and canvas-drawn geometry
are not accepted substitutes for the visible objects above. A transparent
focus outline and DOM/Pixi hit rectangle are allowed interaction layers.

## Asset production list and quality gates

### GPT Image generation anchors

- one four-screen Papercraft UI overview/mockup;
- one exact title lockup, spell-checked character by character;
- Momma Bear neutral identity master and six-pose contact sheet;
- Pip, Fia, and Ash identity masters and six-pose contact sheets;
- one coherent secondary-character/prop contact sheet if Studio templates do
  not produce sufficient continuity.

### LAN Studio production

- Krea 2 / `paper-garden`: splash reading nook, harbor, moonlit cottage garden,
  and glass-hill backdrops; first seed 42, retry ladder 1337 → 9001 → 7.
- Qwen Image Edit: carry accepted identity/style into derived poses or repair one
  specific asset only. Every edit receives a real reference.
- Qwen Image Layered: extract contact-sheet/cutout subjects from a plain dark
  ground; fetch `layer_2`, then inspect alpha on saturated magenta.
- Qwen3 TTS voice clone: all fixed UI, whole lines, completion lines, and any
  missing word clips; seed ladder 7 → 8 → 9.
- Whisper: normalized transcript check for every final spoken clip; reject
  material mismatches.
- MiniMax H3: one optional 3–4 second Momma Bear book-opening cue. It ships only
  if identity, paper material, static camera, H.264 decode, loop/end frame,
  transcript, reduced-motion fallback, and ≤1.5MB budget all pass.

### Runtime asset inventory

- 4 opaque backdrops plus optional act variants, each ~1600×1200 and ≤300KB
  where visual quality permits;
- 4 pose actors × 6 poses, fixed 1024×1024, target 30–80KB each;
- 12–16 props/secondary figures, alpha-trimmed WebP/PNG;
- title, 3 story cards, 3 charms, word tile family, act tabs, page-turn layer,
  and action buttons as authored raster assets;
- optional one H.264 `yuv420p +faststart` clip with poster;
- recorded audio as mono AAC/M4A with manifest durations and cache version;
- a separate 6:5 Toy-world hub tile generated with `menu-game-tile`; never a
  crop of the interior splash.

Sources stay under `assets/source/`, deterministic derivatives under runtime
folders, and every final is logged in `ASSETS.md` with creator, workflow, prompt,
seed/reference, processing, QA status, and CC BY 4.0/public-domain source notes.

## Audio and music

- Teacher voice is the primary channel; Web Speech is the complete fallback.
- `voiceClips.init()` finishes before the first-gesture welcome.
- Every page line and UI line is transcribed after final AAC encode. The
  intended text remains canonical even if Whisper punctuation differs.
- Recorded supportive BGM comes from `shared/assets/music/` through
  `shared/js/bgm.js`; it is preloaded, unlocked on the first gesture, very quiet,
  ducked during every word/line, follows mute, and stops on exit. Programmatic
  melody is not used.
- Story-specific environmental one-shots—mill whirr, flower pops, soft thunder,
  page turn—may use Web Audio/SFX but never cover a spoken word.

## Persistence and privacy

- No runtime network/model calls, account, camera, microphone, or analytics
  beyond the platform-wide page-view module.
- `localStorage` key `qk:momma-bear-storybook:v1` stores only completed story
  ids, last story/page, and the first-time gesture-demo flag.
- Storage failure degrades to a complete session with no error shown to the
  child.
- Opening a completed story starts from page 1 unless the child explicitly
  resumes an interrupted page from the shelf bookmark.

## `window.QLOBE_DEBUG` v1

Required floor plus domain extras:

- `ready`
- `listModes()` → the three story ids/titles/skill
- `startMode(id)` → first page awaiting word input
- `getState()` → `{screen, storyId, pageIndex, act, tappedWords, lineComplete,
  busy, completedStories, reducedMotion, muted}`
- `getTargets()` with truthful word/card/navigation roles and painted rects
- `tap(targetId)` through the real handler
- `tapWord(index)`, `tapAllWords()`, `performLine()`, `nextPage()`
- `winRound()` completes the current page through real word handlers
- `finishStory()` walks remaining pages through the public interactions
- `mute(on)`, `seed(n)`, `fastTimers(scale)`, `home()`
- `getAudioLog()`, `getStageState()`, `validateContent()`,
  `resetProgress()`

## Automated and visual QA contract

The game-local real-Chrome driver must cover:

1. hub registration and direct boot with zero page errors, failed requests, or
   404s;
2. welcome after a real gesture and a real recorded clip (`kind: "clip"`);
3. all three story cards and all 18 pages;
4. partial word taps, repeats, out-of-order taps, final-word wait, line lock,
   and same-handler debug taps;
5. all three act transitions, all completion screens, Again, Shelf, Back, Home,
   mute, and saved charm reload;
6. app visibility re-unlock behavior;
7. landscape 1180×820, wide-short 1180×520, and portrait 820×1180;
8. reduced motion and optional-video fallback;
9. ≥96px word/card/control targets and no HUD overlap;
10. screenshots of splash, every story's first/middle/final page, partial and
    complete word states, act transition, completion, portrait, wide-short,
    reduced motion, and peak paper-pop/page-turn motion.

Foreground material fidelity is reviewed separately from layout. Every alpha
asset appears on a magenta QA composite; backdrops and title are inspected at
100%; the title must spell **Momma Bear's Storybook** exactly. The configured
independent ART DIRECTOR writes a severity-ranked report under
`qa-shots/momma-bear-storybook/` after the build, and every BLOCKER/MAJOR must be
resolved and re-reviewed. A separate engineering reviewer checks the final diff
for regressions and missing tests.

## Release gate

- GDD and config agree; all scripts are final.
- All visible primary objects are authored Papercraft raster assets.
- Every audio clip is transcript-QA'd or intentionally omitted for correct
  fallback.
- Content, actor, prop, recipe, registry, and head metadata validators add no
  errors.
- Tiny Reader Theater regression QA passes after the shared word module move.
- Local real-Chrome suite and full-size visual review pass.
- No unresolved ART DIRECTOR BLOCKER/MAJOR or engineering-review blocker.
- Commit/push and Pages workflow succeed, then the same suite passes against
  `https://qlo.be/games/momma-bear-storybook/` with production captures reviewed.
- Game remains `beta` until the target child completes a tale on the real iPad.
