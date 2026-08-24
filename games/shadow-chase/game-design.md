# Shadow Chase — production game design

**Route:** `games/shadow-chase/`

**Status at handoff:** beta until a real iPad child playtest

**Audience:** ages 5–6

**Category:** sensorial-science

**Canonical art direction:** **Toy** (`toy-table` is the legacy pipeline style id)

**Runtime:** custom vanilla DOM/ES modules; no model calls, build step, or network dependency

**Replaces:** the emoji `observe-journal` prototype currently registered at this same id and route

## Product promise

Shadow Chase is a warm wooden toy theatre where light feels like a thing a child
can grab. Pick a carved animal, find its silhouette, then slide a chunky sun
along the sky and watch every shadow stretch, shrink, and flip direction. The
same playset supports three short modes, each with one clear skill:

1. **Find a Shadow** — visual discrimination: match an object to its silhouette.
2. **Chase the Sun** — physical cause and effect: move the light to create a
   target shadow.
3. **Shadow Show** — comparison across time: visit morning, noon, and evening
   and notice how one shadow changes.

The child should understand the active action within five seconds, without
reading. Every mode is playable with pictures, touch, animation, and recorded
voice. Wrong answers are invitations to keep looking, never failures.

## Why this version

The source materials disagree in a useful way:

- `brief.md` and the concept video promise a draggable sun, continuous shadow
  transformation, and playback controls.
- The UI mockups promise a tactile wooden animal-selection, silhouette-match,
  and star-reveal loop.
- The existing beta instead sends the child outside to fill an emoji shadow
  journal. It does not express either source fantasy and uses the wrong art
  world (`field-journal`).

The production game makes the two strong source ideas complementary. Matching
builds silhouette recognition; the sun modes reveal *why* shadows change. The
old outdoor diary is removed entirely.

The brief's one-off toddler avatar is replaced by a consistent collection of
carved animal toys. The mockups make those animals the visual signature, and a
toy cast lets the child focus on object shape and shadow physics without
introducing a non-canonical human character. Movement remains body-aware through
spoken invitations such as “stretch tall like the rabbit,” but core play stays
on the tablet.

## Experience principles

- **One physical playset.** Walnut proscenium, honey-colored stage, cream
  backdrop, painted-green foliage, carved toys, and soft gold sunlight persist
  through every screen.
- **The sun owns the light.** At every position, the cast-shadow direction,
  length, scale, softness, and scene warmth agree. Low sun makes a long opposite
  shadow; noon makes a short shadow beneath the toy.
- **Raster identity, code interaction.** Every visible primary object is an
  authored raster asset. DOM/CSS supplies layout, safe-area behavior, hit
  regions, transforms, focus, and motion only; it does not draw the toy world.
- **Audio first.** Recorded teacher narration explains the action. Brief HTML
  labels support grown-ups and accessibility but are not required to play.
- **Tiny loops, generous discovery.** Match and Sun modes run four rounds in
  roughly 45–75 seconds. Shadow Show is a one-cycle sandbox that can continue.
- **Delight with restraint.** Wood taps, warm chimes, a raster-star burst, toy
  micro-bounces, and a quiet recorded underscore. No scores, timers, streaks,
  lives, or game-over state.

## Screen map and navigation

```text
catalog
  ↓
splash / mode shelf ── Home → catalog
  ├─ Find a Shadow ─┐
  ├─ Chase the Sun ─┼─ Back → splash
  └─ Shadow Show ───┘
          ↓
      play / round reveal
          ↓
      collection celebration
          ├─ Again → same mode
          └─ Choose → splash
```

- Splash alone uses Home. All play, reveal, and end states use Back to splash.
- Sound is always in the opposite top corner and reflects the game mute state.
- The first real child gesture unlocks voice, BGM, and SFX before starting.
- Starting a mode is latched against double taps.
- Leaving a screen cancels timers, playback, narration, pointer drags, and BGM
  work specific to that screen.

## Splash / mode shelf

The carved `SHADOW CHASE` graphic lockup sits in the proscenium header. Below it,
three generous illustrated wooden plaques show the action instead of relying on
text:

- animal beside its silhouette — Find a Shadow;
- sun opposite a stretched shadow — Chase the Sun;
- three sun positions over one toy — Shadow Show.

Each plaque contains short HTML mode text for adults but speaks its line on
selection. A rabbit, squirrel, and turtle peek from the bottom shelf. The first
idle nudge makes the mode plaques glow in sequence and says, “Pick a shadow
game.”

## Mode 1 — Find a Shadow

**Skill:** visual discrimination of an object's outer contour.

**Loop:** four matches, 8–15 seconds each.

### Round

1. A toy rises onto the left pedestal and gives a tiny bounce.
2. Three large cream plaques on the right present dark-brown raster silhouette
   images. Exactly one comes from the active toy; distractors are distinct at
   first and more similar in later rounds.
3. Narration asks, “Which shadow belongs to the rabbit?” The active toy and the
   three plaques pulse once in order.
4. A wrong plaque rocks gently, settles, and receives “Good looking. Try another
   shadow.” A second wrong choice softly lights the correct plaque edge as a
   model; there is no lockout.
5. The correct silhouette glides behind the toy, a gold raster star blooms, the
   toy hops, and narration says, “You found the rabbit's shadow!”
6. A large green wooden next button advances. On round four it opens the
   collection celebration.

### Content and variation

Six toys: rabbit, squirrel, turtle, fox, duck, and bear. A seeded shuffle selects
four without replacement and keeps the answer in a different plaque position
each round. Same seed + mode + viewport reproduces the set and ordering.

The first round uses maximally distinct distractors. Later rounds may pair
similar upright silhouettes, but never use tiny or ambiguous differences.

## Mode 2 — Chase the Sun

**Skill:** understand that a light source and cast shadow point in opposite
directions, and that a high light makes a shorter shadow.

**Loop:** four target shadows, 10–18 seconds each.

### Round

1. The selected toy stands at center stage. A small target plaque shows the
   desired cast-shadow state using the same raster silhouette: long-right,
   medium-right, short-noon, medium-left, or long-left.
2. A large raster sun sits on a wooden arc. The whole sun is a forgiving drag
   target. A translucent hand trail models one short drag only on the first
   round or after an idle nudge.
3. Pointer movement maps to normalized `sunT` from 0 to 1. The rendered shadow
   uses the toy's raster silhouette with a bottom-center transform:
   - horizontal direction is opposite the sun;
   - length follows low-at-horizon → long and noon → short;
   - vertical compression, skew, opacity, and softness change continuously;
   - a second small tree shadow follows the same source to make the rule visible.
4. When `sunT` enters the target tolerance, the target plaque glows. Holding for
   450 ms snaps gently to the exact stop, plays a chime, and confirms the round.
   Passing through does not punish or reset progress.
5. Narration names the discovery: “The sun is low, so the shadow stretches
   long!” or “The sun is high, so the shadow tucks in close!”

### Input robustness

- Pointer Events with one active pointer and pointer capture.
- Preserve the pointer-to-sun offset; no snap on pickup.
- Release outside the rail cannot strand the sun.
- `pointercancel`, blur, screen exit, and visibility loss all clean up safely.
- Keyboard/assistive input can use the three large stop buttons exposed through
  the same state-changing handler.
- Drag math derives from rendered rail bounds and survives resize/orientation.

## Mode 3 — Shadow Show

**Skill:** compare one object's shadow across morning, noon, and evening.

**Loop:** one 20-second day cycle plus free replay.

1. Pick one of three large toys from the shelf.
2. The playset opens with the sun at morning. Three large picture stops on the
   rail represent morning, noon, and evening; no reading is needed.
3. Drag freely, tap a stop, or press the raster play button. Playback moves the
   sun left to right with a calm pause at each discovery. Previous, play/pause,
   and next controls use shared HUD imagery or authored raster buttons.
4. Each first visit stamps a small gold raster star beneath that stop and speaks:
   - “Morning sun is low. The shadow stretches away.”
   - “At noon, the sun is high. The shadow tucks in close.”
   - “Evening sun is low on the other side. The shadow stretches back.”
5. After all three stops, the toy bows, the three stars shine, and narration
   says, “You made a whole day of shadows!” Playback remains available; a large
   Done action opens the collection celebration.

Reduced motion turns continuous autoplay into three short cross-fades/stops,
while direct manipulation and comparison remain intact.

## Collection celebration

The warm star tableau from the mockup appears inside the same theatre. The four
matched or created shadow stamps sit on a wooden shelf, the last active toy is
centered in front of a large raster gold star, and small raster stars float up
without obscuring the character. Recorded praise and a restrained `tada` SFX
play, then large Again and Choose actions appear.

## Complete spoken script

`assets/audio/lines.json` is the exact runtime source of truth. These are the
intended recordings; punctuation is deliberate.

| Key | Verbatim line |
| --- | --- |
| `welcome` | “Ready to chase some shadows? Pick a shadow game!” |
| `choose-match` | “Find a shadow! Look closely, then tap the matching shape.” |
| `choose-sun` | “Chase the sun! Slide the sun until your shadow matches the picture.” |
| `choose-show` | “Make a shadow show! Move the sun, or press play to watch a whole day.” |
| `match-rabbit` | “Which shadow belongs to the rabbit?” |
| `match-squirrel` | “Which shadow belongs to the squirrel?” |
| `match-turtle` | “Which shadow belongs to the turtle?” |
| `match-fox` | “Which shadow belongs to the fox?” |
| `match-duck` | “Which shadow belongs to the duck?” |
| `match-bear` | “Which shadow belongs to the bear?” |
| `try-again` | “Good looking. Try another shadow.” |
| `look-closer` | “Look at the outside shape. You can find it!” |
| `found` | “You found it! That shadow fits perfectly.” |
| `sun-intro` | “Move the sun. Watch the shadow stretch, shrink, and switch sides!” |
| `sun-nudge` | “Try sliding the big sun along its wooden track.” |
| `sun-long` | “The sun is low, so the shadow stretches long!” |
| `sun-short` | “The sun is high, so the shadow tucks in close!” |
| `sun-opposite` | “You did it! The shadow points away from the sun.” |
| `show-intro` | “Choose a toy for your shadow show.” |
| `show-morning` | “Morning sun is low. The shadow stretches away.” |
| `show-noon` | “At noon, the sun is high. The shadow tucks in close.” |
| `show-evening` | “Evening sun is low on the other side. The shadow stretches back.” |
| `show-complete` | “You made a whole day of shadows!” |
| `all-done` | “Shadow star! You chased every shadow.” |
| `idle` | “The shadows are waiting. Tap a toy or move the sun.” |

Dynamic accessibility text may name the active toy, but runtime narration does
not splice recorded fragments. Each spoken line is one complete clip or the
same complete Web Speech fallback.

## Audio design

- Primary voice: approved teacher reference through `qwen3-tts-voiceclone`,
  batch seed 7, retry 8 then 9 only for failed lines.
- QA: every final clip is transcribed by `whisper-stt`; normalized intended and
  heard text are recorded in `assets/audio/qa.json`. A material mismatch is
  retried or omitted in favor of correct device speech.
- Encoding: AAC/M4A with sane loudness and `+faststart`; one manifest records
  filenames and durations.
- Fallback: `shared/js/voice-clips.js` uses Web Speech if a clip cannot decode.
- SFX: shared `sfx.js` pop, boing, whoosh, sparkle, and tada; a quiet rising
  tone may accompany drag only while the pointer is down.
- BGM: `shared/assets/music/whimsical-toy-workshop.mp3` through `bgm.js`, quiet
  normal volume, preloaded before first gesture, unlocked in the common gesture
  fan-out, ducked during narration, muted with the game, and stopped on exit.

## Art direction and asset inventory

### Visual north star

“A sunlit wooden toy theatre where a child discovers that light makes shadows
move.” The mockup's walnut proscenium, cream panel, honey stage, leaf-green side
scenery, carved animals, dark silhouettes, warm star reveal, and chunky controls
are mandatory. Lighting is soft studio daylight with visible wood grain and
rounded safe edges—not photoreal furniture and not generic glossy app UI.

### Runtime art list

| Runtime path | Target | Visible job | Production path |
| --- | --- | --- | --- |
| `assets/stage.webp` | 1600×1200, opaque, ≤350 KB | full-bleed empty wooden theatre with calm central field and HUD-safe corners | GPT Image 2 source, deterministic crop/encode |
| `assets/stage-{morning,noon,evening}.webp` | opaque, ≤350 KB each | cross-faded theatre light that follows the draggable sun | deterministic raster grades of the accepted GPT Image 2 stage |
| `assets/title.webp` | alpha WebP, ~1100×360, ≤150 KB | correctly spelled carved `SHADOW CHASE` lockup only | GPT Image 2 on flat charcoal, layered extraction, spell-check |
| `assets/toys/{rabbit,squirrel,turtle,fox,duck,bear}.webp` | alpha WebP, max 640 px, 30–90 KB each | one coherent carved-toy set | GPT Image 2 contact sheet, deterministic cells, Qwen Layered `layer_2`, finalizer + magenta QA |
| `assets/shadows/<toy>.webp` | alpha WebP matching toy canvas | dark umber raster silhouette from the accepted toy alpha | deterministic raster derivation; no CSS filter or vector silhouette |
| `assets/ui/sun-track.webp` | alpha WebP, ~1100×260 | arched wooden rail | dedicated GPT Image 2 master → Qwen Layered `layer_2` |
| `assets/ui/{sun,star,choice-plaque,button-green,pedestal,button-round}.webp` | alpha WebP, max 640 px | physical sun, rewards, plaques, actions, pedestals, and controls | GPT Image 2 UI sheet → deterministic charcoal-matte cells → finalizer + magenta QA |
| `assets/ui/pause.webp` | alpha WebP, 272 px | physical pause state inside the round show control | project-owned raster control, palette-warmed and resized |
| `assets/og-image.jpg` | 1200×630 | captured final splash for link previews | `capture_og_images.mjs`, never hand edited |

The existing curated hub tile remains because it already follows the hub's
6:5 Toy-object grammar and depicts the essential shadow moment. It is reviewed
in context but not overwritten by the game asset pipeline.

### Source and provenance

- Accepted and rejected raw sources live under `assets/source/` and are never
  overwritten.
- `assets/source/gpt-image-2-prompts.json` stores exact prompts, references,
  roles, and final selections.
- Qwen outputs and recipe sidecars identify the source crop, workflow, seed,
  `layer_2` output, and deterministic processing.
- Every alpha asset is inspected over saturated magenta and the real stage.
- `ASSETS.md` records creator, license, model/workflow, prompt/seed or derived
  source, modifications, runtime path, and rejection notes.
- No generated runtime asset contains baked functional text except the
  spell-checked decorative title graphic.

## Responsive layout

The background is composed at 4:3 and uses cover only when a protected central
safe rectangle remains visible. Layout variables derive from actual viewport
and safe-area insets.

- **Landscape/tablet:** toy at left or center, three choices across the right;
  sun rail spans the lower third with at least 120 px clear drag height.
- **Portrait:** proscenium header becomes shallower; toy sits above a 3-column
  (or 2+1) choice row; the sun rail stays horizontal below it rather than being
  cropped. The prompt plaque may condense but the action never shrinks below
  the touch minimum.
- **Short landscape:** title/prompt reduces before toys or controls do. No
  gameplay object hides behind the HUD.
- All child targets are at least 96 CSS px, with forgiving hit padding that does
  not visually enlarge the asset.

## Interaction and feedback rules

- Use `tap.js` for one press path on buttons and silhouette choices.
- A pressed state moves the raster object a few pixels and darkens it slightly;
  CSS does not invent a new visible button or illustration.
- Wrong choices wobble once and return. No red X, buzzer, score loss, or locked
  answer.
- Correct choices visibly connect object and shadow before a reward appears.
- New narration cancels old narration; screen exit cancels all pending work.
- The idle ladder begins after 10 seconds, repeats at 18 seconds, and resets on
  any touch. First nudge animates/model-highlights; later nudge speaks `idle`.
- Reduced motion replaces bounce, glide, and continuous particles with a short
  opacity/scale settle while preserving state changes.

## State and determinism

Serializable runtime state:

```js
{
  screen: 'splash' | 'play' | 'reveal' | 'end',
  mode: null | 'match' | 'sun' | 'show',
  round: 0,
  roundsTotal: 4,
  toyId: null | 'rabbit' | 'squirrel' | 'turtle' | 'fox' | 'duck' | 'bear',
  choiceIds: [],
  targetToyId: null,
  targetSunT: null,
  sunT: 0.5,
  sunPlayback: false,
  showVisited: { morning: false, noon: false, evening: false },
  wrongAttempts: 0,
  complete: false,
  muted: false,
  seed: 42
}
```

One seeded `mulberry32` source owns selection and shuffling. Time and pointer
position never alter content choice. Resize recomputes geometry but not round
content.

## `QLOBE_DEBUG` v1

The game must expose:

- `ready` — resolves after config, voice manifest, and required splash/play
  imagery are ready or known failed with graceful fallback;
- `modes()` — ids/titles/skills for `match`, `sun`, and `show`;
- `startMode(id)` — starts through the real mode handler;
- `state()` — returns the serializable state above plus voice log and current
  geometry summary;
- `targets()` — truthful visible interactive targets;
- `tap(targetId)` — invokes the same handler used by pointer input;
- `dragSun(t)` — routes normalized position through the real drag update;
- `setSun(t)` — deterministic alias for QA through the same update path;
- `stepSun(direction)` and `togglePlayback()` — real show controls;
- `answer(id)` — real match-choice handler;
- `winRound()` — completes the current round through normal success behavior;
- `mute(on)`;
- `seed(value)` — resets the seeded source for the next mode start;
- `fastTimers(on)` — compresses reveal/hold/playback delays;
- `snapshot()` — semantic alias of `state()` for production QA.

No debug action mutates DOM/state through a private shortcut that real input
cannot reach.

## Privacy and fallback behavior

- No camera, microphone, location, account, analytics beyond the platform's
  shared pageview, persistence, or child-authored data.
- Runtime never calls OpenAI, Qwen, Whisper, Krea, or the LAN host.
- Missing voice clips fall back to device speech; muted play stays fully visual.
- Missing BGM or SFX never blocks readiness.
- Missing nonessential decorative art hides cleanly. Missing stage, sun, toy, or
  silhouette art is a readiness failure surfaced in QA, not replaced by emoji,
  SVG, or CSS drawing.

## Release verification

### Static

```sh
git diff --check
node --check games/shadow-chase/js/main.js
node tools/validate/run.mjs
node tools/pipeline/sync-games-registry.mjs --check --only shadow-chase
```

### Browser matrix

- Direct route and hub launch in real Chrome.
- Every mode start, full loop, Back behavior, end Again/Choose, splash Home.
- Match: every toy can be forced by seed/debug; wrong once, wrong twice/model,
  correct, next, final end.
- Sun: drag endpoints, center, target hold, release outside, pointer cancel,
  orientation change mid-round.
- Show: choose toy, previous/next, play/pause, visit all stops, complete.
- Recorded voice shows `kind: 'clip'` after a real gesture.
- Mute, visibility restore, Web Speech/missing-clip fallback.
- Landscape, portrait, short landscape, touch emulation, reduced motion.
- Zero unexpected page errors, console errors, failed/4xx requests, or remote
  requests.

### Required screenshots

1. splash/mode shelf;
2. Match at round start;
3. Match gentle wrong state;
4. `SHADOW FOUND` star reveal;
5. Sun low-left / noon / low-right states;
6. Sun target success;
7. Shadow Show morning / noon / evening and completed cycle;
8. collection celebration;
9. representative portrait screens;
10. representative compact landscape and reduced-motion screens;
11. magenta and real-stage alpha composites for every cutout family.

The independent ART DIRECTOR reviews all captures at full useful resolution.
P0 findings block release. P1 findings require revision or an explicit recorded
exception. After local acceptance, run the identical suite against `https://qlo.be`
and inspect those production captures. Keep `status: beta` until the target child
completes the game on a real iPad.

## Known risks and release gate

- **AI set inconsistency:** contact-sheet generation is accepted only if all six
  toys share camera, scale, material, lighting, and silhouette clarity. Reroll a
  broken set; do not force it through extraction.
- **Layered redraw:** compare each `layer_2` output to its source crop. Identity
  or anatomy drift is a rejection.
- **Shadow transform legibility:** tune at rendered tablet scale and capture the
  low-left, noon, and low-right extremes. Mathematically changing is not enough;
  the child must see the difference immediately.
- **Portrait squeeze:** protected interaction zones are validated with real
  screenshots, not only CSS inspection.
- **Audio confidence:** a file existing is not a pass; transcript and browser
  playback must agree.

Release requires all runtime art, recorded voice, provenance, debug surface,
static checks, browser paths, responsive screenshots, and adversarial art review
to pass with no unresolved P0 or P1 issue. The game may ship as beta before the
child playtest, but never as live.
