# Rhyming Detective — game design

**Category:** reading-phonics · **Ages:** 3–6 · **Status:** beta (stays beta until a real-iPad child playtest)
**Art world:** Storybook Rooms (`docs/art-direction.md` §2) — full-bleed rooms, cut-out sprites
**Cast:** two game-local mascots — **Detective Cat** (orange tabby in a deerstalker) and **Bat**. Neither is promoted to `shared/characters/` in v1.
**Engine:** custom, game-local (`js/game.js`) on the new shared module `shared/js/hotspot-scene.js`
**Concept:** `01-game-concepts/rhyming-detective/` (brief.md + 4 UI mockups)
**Build plan:** the approved production plan (`deep-orbiting-coral`) — architecture, case table, modes, asset manifest and clip list come from it; this document specifies them.
**Replaces:** the 7-file `rhyming-detective` stub in place today. Same id, same route, same folder.

This is the Phase-0 deliverable. **Everything else in the build cites this document.** It is
written to answer every "what happens when…" six parallel implementation agents would ask,
and §3 doubles as the voice recording manifest.

**Reading order for an implementation agent:** §5 (the frozen module API) and §6 (the frozen
config schema) are contracts — nothing in them changes without a new Phase 0. §2, §4 and §9
are the visual spec. §7 and §11 are the QA surface.

### 0. File tree and who owns what

```
shared/js/hotspot-scene.js                       NEW shared module          WP1a  (§5)
shared/js/hotspot-scene.test.html                harness                    WP1a  (§5.9)
shared/data/usage-index.json                     REGEN via build-usage-index.mjs   Phase 2
games.json                                       via sync tool ONLY, byte-identical Phase 2

games/rhyming-detective/
  index.html                                     shell, meta, font preload  WP1b  (§2, §8.1)
  config.js                                      fetch shim                 WP1b  (§6)
  config.json                                    cases · zones · tuning     WP1c  (§4, §6)
  data/lines.json                                spoken text                WP1c  (§3, §6.3)
  css/style.css                                  HUD, screens, choreography WP1b  (§2.5, §9)
  js/main.js                                     screens, QLOBE_DEBUG       WP1b  (§2, §7)
  js/game.js                                     case loop, rhyme logic     WP1b  (§3.4, §9)
  js/voice.js                                    voice-clips wrapper        WP1b  (§3)
  game.json                                      registry manifest          Phase 2 (§11.1)
  game-design.md                                 THIS FILE                  Phase 0
  ASSETS.md                                      provenance + departures    WP1e  (§8)
  tools/qa.mjs                                   the gate                   Phase 2 (§11.2)
  tools/gen-art.py · tools/gen-voice.py          generation recipes         WP1d/e/f
  assets/…                                       art + audio                WP1d/e/f (§8.2)
```

Hands-off for every work package: `assets/hub/tiles/`, `shared/assets/`, `shared/data/words.json`,
every other game.

---

## 1. Overview & pedagogy

### 1.1 The one skill

**Hearing that two words end with the same sound.** Rhyme detection is the entry point of
phonological awareness — it comes *before* letters, before blending, before reading, and it is
the one phonics skill a three-year-old can genuinely do. A child who can hear that *cat* and
*hat* end alike is doing the analysis that later becomes decoding.

The game turns that into a **search**. A target word is announced ("Find the words that rhyme
with… cat"), and the child scans an illustrated room and taps things. Every tap speaks the
object's name in a speech bubble — so **every tap teaches, whether or not it rhymes**. Three
rhymes are hiding in the room among two non-rhyming distractors; finding all three closes the
case.

Learning goals, in the order the game builds them:

1. Recognize that two spoken words share an ending sound (rhyme detection).
2. Reject a word that shares nothing but a picture-book neighbourhood (rhyme *discrimination* —
   that is what the two distractors are for).
3. Build the four core CVC rime families **-at, -an, -ug, -et** by hearing eight to twelve
   members of each across a session.
4. Connect a spoken word to its printed form (Mode 1 shows the word on every bubble; Mode 2
   withholds it and reveals it at the celebration).
5. Vocabulary: 27 illustrated, spoken household nouns.

### 1.2 One skill per mode

| # | id | Title | The single skill | What is on screen |
|---|---|---|---|---|
| 1 | `rhyme-hunt` | Rhyme Hunt | **rhyme detection with print support** | printed word on the target card and on every speech bubble |
| 2 | `sound-detective` | Sound Detective | **pure auditory rhyme discrimination** | no printed words at all during play; sound-glyph bubbles; words revealed at the celebration |

Same five cases, same rooms, same loop, same controls. Mode 2 additionally re-shuffles where
the objects hide (§4.6), so a child who has memorized *where the hat is* still has to do the
listening.

**Odd-one-out mode is explicitly deferred post-v1.** It is a different skill (rejection rather
than collection) and it needs a different screen. Not in this build.

### 1.3 No-fail, by construction

`docs/philosophy.md` principle 6. There is no score, no timer, no streak, no lives, no "Game
Over", no red X, no buzzer, and nothing is ever removed from the child.

- A tap on a non-rhyme is **not a mistake** — it is a look. The object says its name, a gentle
  line says it does not rhyme, and **the object stays tappable forever**. Nothing is consumed.
- The case cannot be failed. It ends exactly one way: all three rhymes found.
- Wrong taps are unlimited and untracked. `getState()` exposes a wrong count only to escalate
  *helpfulness* (§3.5); it is never shown to the child.
- Every tap makes something happen — a name spoken, a bubble, a wiggle. There is no dead tap in
  the play field except on bare wall, and even bare wall gets nothing rather than a scold.

### 1.4 Session shape (`philosophy.md` principle 5)

| beat | budget |
|---|---|
| case intro (room crossfade + target announced) | 3–5 s |
| the search — tap, hear, judge | 25–45 s, entirely the child's pace, no timer |
| celebration (confetti → Great Job → word pair → They rhyme! → mascots → Next Case) | ~4.5 s, auto-advances at 12 s |
| **one case, end to end** | **≈ 45–60 s** — inside the 30–90 s band |
| one mode (5 cases + end screen) | ≈ 4–5 minutes |

Nothing is timed. The only clocks in the game are the celebration auto-advance and the idle
timers, and both exist so a child who wanders off is not stranded.

### 1.5 Understandable in five seconds

The five-second read is: **there's a room, things in it glow, tapping them makes them talk.**

Three supports, in order, none of them written text:

1. On the first play screen of a session, all five hotspots run one **idle pulse sweep** (§9.8) —
   a soft halo travelling around the room. That is the affordance: *these things are touchable.*
2. The target sprite sits centre-stage on the floor with its word card under it, exactly as in
   mockup 02. It is the one thing that is obviously the subject.
3. At 8 s with no tap at all, `idle-1` says it out loud; at 18 s `hint-look` names the gesture.

---

## 2. Screen map

### 2.1 The five screens and every transition

```
   boot ─▶ SPLASH ──(Play)──▶ mode row expands ──(mode tile)──▶ CASE-INTRO
             ▲   ▲                                                  │  (auto ~3.5s
             │   │                                                  │   or any tap)
             │   └──(back)──────────────────────────────┐           ▼
             │                                          ├──────── PLAY
             │                                          │           │ (3rd rhyme found)
             │                                          │           ▼
             │                                          ├───── CELEBRATION
             │                                          │        │        │
             │                                          │  cases 1-4      case 5
             │                                          │  (Next Case)      │
             │                                          │        │          ▼
             │                                          │        └──▶ CASE-INTRO
             │                                          │                  ...
             │                                          └───────────────── END
             └──(Play Again ── or back)──────────────────────────────────────┘

   SPLASH ──(home, top-left)──▶ ../../   (the catalog — the only navigation in the game)
```

`getState().screen` is exactly one of `'splash' | 'case-intro' | 'play' | 'celebration' | 'end'`.
`'case-intro'` and `'celebration'` are declared v1 extensions (§7).

**Transition table — this is normative.**

| from | trigger | to | what happens |
|---|---|---|---|
| boot | — | `splash` | splash paints; **no audio** (§3.1) |
| `splash` | tap **Play** | `splash` | the mode row slides up under the mascot band (240 ms); `welcome` plays if it has not yet |
| `splash` | tap a mode tile | `case-intro` | `sfx.tick()`; mode intro clip starts; room plate fetched; case-intro mounts under the clip |
| `case-intro` | clip end + 350 ms, **or any tap anywhere** | `play` | dim layer fades out 300 ms, HUD fades in 240 ms, hotspots run the intro pulse sweep |
| `play` | 3rd rhyme lands in the tray | `celebration` | §9.5 |
| `play` | tap **back** (top-left) | `splash` | full teardown (§2.8) |
| `celebration` | tap **Next Case**, or 12 s auto-advance | `case-intro` (cases 1–4) / `end` (case 5) | overlay fades 260 ms; room crossfades (§9.6) |
| `celebration` | tap **back** | `splash` | full teardown |
| `end` | tap **Play Again** | `splash` | returns to the mode menu, **not** into the mode just played |
| `end` | tap **back** | `splash` | full teardown |
| any | `QLOBE_DEBUG.home()` | `splash` | the identical teardown the back button runs |

**Navigation follows `docs/interaction-patterns.md` §8:** home only on the splash (→ `../../`),
back on every deeper screen (→ the splash, in-page, no navigation). A child is never more than
two taps from the catalog. Corner assignment on the play screen follows §8 exactly — see §8.7.9.

### 2.2 Coordinate system — one art space, one transform

Copied verbatim from `games/flashlight-cave/game-design.md` §4.2, because the failure mode is
two coordinate systems:

```
ART = 1600 × 1200
scale   = max(viewW / 1600, viewH / 1200)          // cover-fit
offsetX = (viewW - 1600 * scale) / 2
offsetY = (viewH - 1200 * scale) / 2
screen  = art * scale + offset
art     = (screen - offset) / scale
```

- **Everything in the play field** — room plate, hotspot rects, the target sprite, the magnifier
  prop, the placement zones of §4 — is authored in **art px** and mapped by this one transform.
- **`shared/js/hotspot-scene.js` owns the transform and nothing else may recompute it.** The game
  reads it back through `scene.toScreen()` / `scene.toArt()` / `scene.visibleArt()`.
- **The HUD is not in art space.** Back, sound, prompt banner, target word card, found tray and
  the progress dots are HTML positioned in **CSS px** against the viewport with safe-area insets.
  They are a separate layer above the scene. This is deliberate: HUD is screen furniture
  (`interaction-patterns.md` §13 — "keep the HUD reserve in screen px").
- The two layers are reconciled by `scene.setReserve()` (§5.4): the game hands the scene the live
  screen rects of its HUD, and the scene keeps hotspots out from under them on every reflow.
  **Nothing else bridges the two spaces.**
- `QLOBE_DEBUG` speaks **art space** for placement (`getZones`) and **screen px** for clickable
  rects (`getTargets().rect`), and both are labelled on the object.

### 2.3 SPLASH

```
┌──────────────────────────────────────────────────────────────┐
│ (home)                                              (sound)  │  ← home top-left, sound top-right
│                                                              │
│               ╔══════════════════════════╗                   │
│               ║   [ title lockup art ]   ║                   │  ← assets/title.webp, baked art
│               ║    Rhyming Detective     ║                   │    (the ONE baked wordmark)
│               ╚══════════════════════════╝                   │
│                                                              │
│   ┌────────────────────────────────────────────────────┐     │
│   │  (cat)          ┌──────────┐            (bat)      │     │  ← cream mascot band,
│   │  detective      │   Play   │           flying      │     │    mockup 01 composition
│   │                 └──────────┘                       │     │
│   └────────────────────────────────────────────────────┘     │
│                                                              │
│        ┌───────────────┐        ┌───────────────┐            │
│        │  (magnifier)  │        │ ((( glyph ))) │            │  ← 2 mode tiles, revealed
│        │  Rhyme Hunt   │        │Sound Detective│            │    by the Play button
│        └───────────────┘        └───────────────┘            │
└──────────────────────────────────────────────────────────────┘
   background: assets/splash-bg.jpg (blue triangle-confetti field, no text)
```

**Composition (mockup 01).** Full-bleed `splash-bg.jpg` — the sky-blue field with pale triangle
confetti, **with the wordmark, the Play button, the cat, the bat and the cream band all
removed**. The title is `assets/title.webp`, an alpha-trimmed graphic lockup (`art-direction.md`
— splash titles are generated art, never HTML type), centred, `width: min(72vw, 900px)`, top edge
at `max(96px, 12vh)`.

The cream band beneath it is a CSS rounded panel (radius 44, `#fffdf6`, 6 px `#2f6fd0` border,
soft drop shadow) holding three things in a row: `mascots/cat-present.webp` left (≈ 300 px tall),
the **Play** button centre, `mascots/bat-fly.webp` right (≈ 240 px tall). On portrait the band
becomes a column with the mascots flanking a smaller Play.

**Play** is a glossy blue pill, ≥ 300 × 132 CSS px, Fredoka 600 cream "Play" (HTML text, 64 px).
It is the only text-labelled control in the game and it is aimed at the adult who hands over the
tablet; the child's affordance is the shape and the position.

**The two mode tiles are hidden until Play is tapped.** Tapping Play slides them up from under
the band (240 ms, `cubic-bezier(.22,1.1,.36,1)`) and plays `welcome` if it has not yet been
spoken this session. This keeps the first screen to one obvious control (mockup 01) while still
giving the family its mode menu (`interaction-patterns.md` §8). Each tile is ≥ 320 × 300 CSS px,
cream rounded panel, navy border:

| tile | face | label (Fredoka 600, 34 px, navy) | built from |
|---|---|---|---|
| `rhyme-hunt` | `props/magnifier.webp` over a warm glow disc | "Rhyme Hunt" | one shared prop + CSS |
| `sound-detective` | the sound glyph — three concentric arcs, inline SVG, `#2f6fd0` | "Sound Detective" | inline SVG + CSS, no asset |

**Controls:** home top-left (`shared/assets/ui/btn-home.png`, 112 CSS px) → `../../`; sound
top-right (`btn-sound.png`, 112 CSS px) → re-speaks `welcome`, debounced 600 ms. There is no back
button on the splash.

**If the child does nothing:** at 14 s the cat mascot bobs once and `idle-1` plays; at 32 s
`idle-2`. Nothing else, ever. No attract loop, no auto-start.

### 2.4 CASE-INTRO

A full screen, not an overlay — it owns the transition into a room.

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│              [ room plate, dimmed to 62% ]                   │
│                                                              │
│                        (target sprite)                       │  ← pops in at art (800, 700)
│                             cat                              │
│                                                              │
│                     ┌──────────────────┐                     │
│                     │       cat        │                     │  ← word card slides up
│                     └──────────────────┘                     │
│                                                              │
│                       ● ○ ○ ○ ○                              │  ← the dots are already there
└──────────────────────────────────────────────────────────────┘
```

Beat order:

1. Room plate crossfades in behind a `rgba(11,26,58,.38)` dim layer (§9.6).
2. `t = 0` the target sprite pops in at art `(800, 700)`, 340 art px tall, spring scale (§9.2).
3. `t = 180 ms` the target word card slides up into its HUD slot from +60 px.
4. `t = 260 ms` voice: **`case-stem` → (120 ms gap) → shared `word-<target>`**. In
   `sound-detective`: `sound-listen` → `word-<target>` → 400 ms → `word-<target>`.
5. On clip end + `tuning.caseIntroTailMs` (350 ms) — **or on any tap anywhere**, which is the
   escape hatch — the dim layer fades out over 300 ms, the prompt banner and the rest of the HUD
   fade in over 240 ms, and the screen becomes `play`.

Back (top-left) is live throughout. The five progress dots are already mounted and already
show which case this is — they do not animate in.

### 2.5 PLAY — the mockup-02 composition

```
┌──────────────────────────────────────────────────────────────┐
│ (back)      ╔═══════════════════════════════════╗            │ ← prompt banner, top-CENTRE
│             ║ Find a word that rhymes with cat  ║            │   HTML Fredoka, cream pill
│             ╚═══════════════════════════════════╝            │
│   ( hat )                 ┌───────┐              ( sun )     │ ← hotspots, art space
│    ╭────╮                 │window │               ╭────╮     │   speech bubbles beside them
│    │hat │                 └───────┘               │sun │     │
│    ╰──┬─╯                                         ╰──┬─╯     │
│                        (target sprite)                       │ ← art (800, 700), 340 art px
│  (mop)                       cat                     (mat)   │
│                       ┌────────────────┐             ___     │
│                       │      cat       │            ( O )    │ ← magnifier prop, bottom-right
│                       └────────────────┘             \_|     │   decoration only
│                        [ ▢ ][ ▢ ][ ▢ ]                       │ ← found tray, 3 slots
│  (sound)                 ● ○ ○ ○ ○                           │ ← 5 progress dots
└──────────────────────────────────────────────────────────────┘
```

**Layer stack:**

```
z0   room plate            bg-<room>.jpg, cover-fit, evenly lit, no baked glow
z1   scene props           props/magnifier.webp (decoration, pointer-events:none)
z2   target sprite         sprites/<target>.webp — tappable, but never scores (see below)
z3   hotspots              <button> per object, sprite as a child <img>
z4   bubbles               speech bubbles, always above their own hotspot
--- HTML HUD overlay, CSS px ---
h1   prompt banner (top-centre) · back (top-left) · sound (bottom-left)
h2   target word card (bottom-centre) · found tray · 5 progress dots (bottom-centre)
h3   celebration overlay (mounted only on `celebration`)
```

**HUD geometry, in CSS px, both orientations:**

| element | anchor | size | notes |
|---|---|---|---|
| prompt banner | top-centre, `top: max(18px, env(safe-area-inset-top) + 8px)` | `min(84vw, 940px)` × ≥ 88 | cream `#fff6dc`, radius 44, 5 px `#e8b64a` border. Fredoka 600 **40 px** `#123a6b`; the target word inside it is `#2f6fd0`. Not a button — `pointer-events: none`. |
| back | **top-left**, `max(16px, safe-area)` | 112 × 112 | `shared/assets/ui/btn-back.png` → splash. |
| sound | **bottom-left**, `max(16px, safe-area)` | 112 × 112 | `shared/assets/ui/btn-sound.png`. Re-speaks the full case prompt. Debounced 600 ms. |
| target word card | bottom-centre, above the tray | `min(46vw, 430px)` × 118 | cream `#fffdf6`, radius 32, 8 px `#2f6fd0` border, Fredoka 600 **84 px** `#2f6fd0`. Mode 2 shows the magnifier glyph instead of the word (§10). Tappable → re-speaks the target. |
| found tray | bottom-centre, directly under the card | 3 slots × 96 × 96, gap 16 | dashed cream outline when empty; a found sprite lands in the next free slot. |
| progress dots | bottom-centre, `bottom: max(16px, safe-area)` | 5 × 28 px, gap 18 | filled `#7ac043`, empty `#fff3dd` with a 3 px `#e2c690` ring. **Cases, not rhymes.** |

**HUD reserve.** The game passes the live `getBoundingClientRect()` of the banner, the card, the
tray, the dots, back and sound to `scene.setReserve()` on every reflow. The scene guarantees no
hotspot's hit box overlaps any of them by more than 25 % of its own area (§5.4). **This is the
single mechanism that keeps the art and the HUD from colliding at any aspect ratio.**

**The target sprite is tappable but never scores.** Tapping it re-speaks `word-<target>` and pops
a neutral bubble — a free "what am I looking for again?". It is registered with the scene as
`id: 'target'` and reported by `getTargets()` with `role: 'neutral'`.

**The magnifier prop** sits at art `{x: 1300, y: 870, w: 260, h: 290}`, `pointer-events: none`,
under the hotspot layer. Decoration only — it is never a control. In `compact` layout (§4.7) it
is hidden.

**What the child can touch:** the five hotspots, the target sprite, the word card, back, sound.
Bare room does nothing at all — no sound, no wiggle, no scold.

### 2.6 CELEBRATION — the mockup-03 overlay

Not a new page. An overlay `<div>` mounted above the play screen, which stays underneath and
untouched (so the room is still visible behind the confetti).

```
┌──────────────────────────────────────────────────────────────┐
│  * confetti *        [ great-job.webp lockup ]        *   *  │ ← baked art, drops in
│                                                              │
│      ╭──────────╮                     ╭──────────╮           │
│      │   cat    │          +          │   hat    │           │ ← HTML Fredoka in CSS bubbles
│      ╰────┬─────╯                     ╰─────┬────╯           │
│              [ they-rhyme.webp ribbon ]                      │ ← baked art
│                                                              │
│   (cat-cheer)      [ hat ][ bat ][ mat ]      (bat-cheer)    │ ← the three real found sprites
│                                                              │
│                     ( btn-play.png )                         │ ← the "Next Case" control,
│                                                              │   128 CSS px, no text label
│                          ● ● ○ ○ ○                           │
└──────────────────────────────────────────────────────────────┘
   background: radial gold #ffc93c → #f5a623, plus soft sunburst rays at 6% white
```

The word-pair bubbles show **the target and the last rhyme found**, which is why the pairing feels
earned rather than arbitrary. The three sprites in the middle are the *actual* three the child
collected, lifted out of the tray and enlarged to 132 px.

Full beat list and timings: §9.5. Voice: §3.4.

**Controls:** Next Case (`shared/assets/ui/btn-play.png`, 128 CSS px, centre-bottom,
`aria-label="Next case"`) and back (top-left). Auto-advances at 12 s.

### 2.7 END

```
        [ great-job.webp ]  ·  all five dots filled  ·  cat-cheer + bat-cheer
        the five case targets in a row across the middle, 140 px each
        ( btn-play.png = "Play Again" )        (back)
```

Room plate of the last case, dimmed to 55 %, gold overlay at 40 % — the celebration palette
softened. The five target sprites (`cat pan bug hat jet`) sit in a row, each with its HTML word
label beneath it in Fredoka 600 / 40 px (Mode 2 reveals them here too). Voice: `end`, then after
a 500 ms gap `end-tip`.

**Play Again** (`btn-play.png`, 128 CSS px, centre-bottom) → the **splash**, speaking `again`.
Back → the splash silently.

**If the child does nothing:** nothing. The end screen holds indefinitely; the mascots run a slow
2.4 s bob (suppressed under reduced motion). This is a resting place, not a timeout.

### 2.8 Rules that hold on every screen

**Back, from anywhere.** One handler, always the same: `voice.stop()`, `speech.stop()`, clear
every idle / auto-advance / choreography timer, cancel every in-flight animation via the scene's
own tracker, `scene.clear()`, unmount the HUD, mount the splash. Safe mid-bubble, mid-flight,
mid-celebration. It never navigates. Session state (which welcome lines were spoken, the seed)
survives; case state does not. `QLOBE_DEBUG.home()` runs exactly this.

**Resize and orientation change.** Every authored number is in art space, so a resize recomputes
the cover-fit transform, re-measures the HUD reserve, re-clamps the hotspots and — if the
`wide`/`compact` threshold is crossed — re-places them onto the other lattice (§4.7). The scene
does this itself and fires `onReflow`. Bubbles re-anchor; an open bubble is not closed by a
resize. **A resize never re-jitters placements** — objects must not move under a child's finger.

**Backgrounding the tab.** On `visibilitychange → hidden`: stop voice, pause all timers. On
`visible`: re-arm the idle timers from zero (a child returning after a phone call is not greeted
by three queued hints) and resume. Nothing auto-advances while hidden.

**Total page weight.** Splash ≈ 300 KB (`splash-bg.jpg`) + 150 KB (`title.webp`) + ~180 KB (two
mascots). Starting a mode adds one room plate (≤ 300 KB) + six sprites (≤ 80 KB each). Voice
clips are never preloaded — `voice-clips.js` streams each through its single unlocked element at
~14 KB a line. A full five-case session ≈ 2.6 MB, inside `art-direction.md`'s ~4 MB page target.

---

## 3. Verbatim voice script — this IS the recording manifest

One voice: the platform teacher voice, cloned from `shared/assets/refs/voice-teacher.wav`, a
shade brighter and more playful — a friendly grown-up playing detective *with* the child, never
testing them. Warm, unhurried, close-mic. **Never disappointed, never urgent, never loud.**

Every clip plays through `shared/js/voice-clips.js` (game-local `js/voice.js` wrapper) with its
line text as `fallbackText`. `data/lines.json` is `{ key: "spoken text" }` and is the single
source both for the recording script and for the Web Speech fallback, so a clip and its fallback
can never drift. **A clip that fails Whisper QA on three seeds ships unrecorded and is spoken by
`speech.js` instead. It degrades; it never breaks.**

**24 new clips. 27 shared word clips reused, 0 new files for them.**

### 3.1 The audio-unlock rule — nothing speaks before the first gesture

`index.html` mounts the splash immediately and **plays nothing**. `welcome` is armed, not played.
Every `pointerdown` anywhere in the document runs:

```js
function unlockAudio() {           // idempotent, but CALLED ON EVERY GESTURE, not once
  sfx.unlock(); speech.unlock(); voice.unlock();
}
window.addEventListener('pointerdown', unlockAudio);
```

`voice-clips.js:unlock()` is cheap and safe to call repeatedly; calling it on **every**
`pointerdown` — not just the first — is the platform's iPad hardening, where a single unlock can
be lost to a tab switch or an interrupted gesture. Speaking a recorded line before the unlock is
what silently degrades it to the system speech voice.

If the child's first gesture is the Play button, `welcome` plays then. If their first gesture is a
mode tile (possible only after Play has been tapped), `welcome` is skipped — a greeting the child
has already walked past is noise.

**Interruption is always allowed.** `say()` stops the current clip and cancels Web Speech before
starting the next, so a tap during any line simply replaces it. **Nothing in this game ever waits
for audio before accepting input** — not the welcome, not the case prompt, not a praise line, not
the celebration.

### 3.2 The 24 new clips

**Chrome · 4**

| key | line |
|---|---|
| `welcome` | Hello, detective! Let's find some words that rhyme. |
| `mode-rhyme-hunt` | Rhyme Hunt! Look around the room and find the rhyming words. |
| `mode-sound-detective` | Sound Detective. This time you have to listen very carefully. |
| `again` | Shall we solve some more cases? |

**Prompt stems · 2** — recorded with a **trailing rise and a held breath**, so the word that
follows lands as the end of the same sentence.

| key | line |
|---|---|
| `case-stem` | Find the words that rhyme with… |
| `sound-listen` | Listen closely. Which words rhyme with… |

**Rhyme confirmed · 4** — bright, delighted, a real discovery. `they-rhyme` must sit naturally
**after** two spoken words, so it is recorded with a small lead-in beat.

| key | line |
|---|---|
| `yes-1` | Yes! That's a rhyme. |
| `yes-2` | You found one! Great listening. |
| `yes-3` | That's it — they sound the same at the end. |
| `they-rhyme` | They rhyme! |

**Not a rhyme · 3** — curious, never corrective. They escalate in **helpfulness**, not sternness.
None of them says "no" or "wrong".

| key | line |
|---|---|
| `no-1` | Ooh, that one doesn't rhyme. Keep looking! |
| `no-2` | Not quite — listen to the ending sound. |
| `no-3` | Let's listen again. We want a word that ends the same way. |

**Counters · 2** — spoken *after* a rhyme has landed in the tray, so the child hears their
progress.

| key | line |
|---|---|
| `two-more` | Two more to find! |
| `one-more` | Just one more! |

**Case close · 3**

| key | line |
|---|---|
| `great-job` | Great job, detective! |
| `case-closed` | Case closed! |
| `next-case` | On to the next case! |

**Idle and hints · 3** — quiet, patient, spoken as if leaning in. Never nagging.

| key | line |
|---|---|
| `idle-1` | Take your time. Have a good look around. |
| `idle-2` | Anything in this room could be a clue. |
| `hint-look` | Tap something in the room and I'll tell you what it is. |

**End and replay · 3**

| key | line |
|---|---|
| `end` | You solved every case! What a detective. |
| `end-tip` | Play again — the clues hide in new places each time. |
| `sound-again` | Here it is one more time. |

That is **24**.

### 3.3 Reused verbatim — 27 shared word clips

The object names already exist at `shared/assets/audio/words/<word>.m4a` — **all 27 verified
present on disk at design time** (cat hat bat mat sun mop pan can fan van dog bed bug jug mug rug
hen cap rat pen log jet net vet pet ten fig). They are **not re-recorded and not copied**. They
are registered in the game's own manifest with a `../`-prefixed, document-relative path, which
`voice-clips.js:clipUrl()` passes straight through:

```json
"word-cat": { "file": "../../shared/assets/audio/words/cat.m4a" },
"word-hat": { "file": "../../shared/assets/audio/words/hat.m4a" },
…
"word-fig": { "file": "../../shared/assets/audio/words/fig.m4a" }
```

There is exactly one canonical copy on disk. Precedent: `games/sand-tray-letters/`. The game
refers to a word clip as **`word-<w>`** everywhere in code, config and this document.

**Deliberately NOT reused:**

- `shared/assets/audio/celebrate/<word>.m4a` (all 27 present) — ceremony-shaped phrasing, unverified.
  Not used in v1.
- `shared/assets/audio/prompts/<word>.m4a` (all 27 present) — these are **per-word prompts**
  ("find the cat"-shaped), and no per-word prompt can express *"…that rhymes with cat"*. The
  composed `case-stem` + `word-<target>` is therefore the **primary** design, not a fallback.
  WP1f still transcribes three of these clips and reports the phrasing into `assets/audio/qa.json`,
  because the platform wants that fact recorded — but **nothing in this game depends on the
  answer**. *(Deviation from the plan, which listed the composed stem as the fallback.)*

### 3.4 Runtime composition

The clip count stays **linear, not multiplicative**: prompts and praise are assembled from a stem
plus a shared word token, never recorded as whole sentences. Two-clip sequencing with a **120 ms
gap** has direct precedent in `sand-tray-letters`.

| moment | sequence | gaps |
|---|---|---|
| case prompt (Mode 1) | `case-stem` → `word-<target>` | 120 |
| case prompt (Mode 2) | `sound-listen` → `word-<target>` → `word-<target>` | 120 / 400 |
| sound button, Mode 1 | the case prompt again, in full | 120 |
| sound button, Mode 2 | `sound-again` → `word-<target>` → `word-<target>` | 120 / 400 |
| tap the target sprite or the word card | `word-<target>` | — |
| tap any object | `word-<tapped>` | — |
| tap a **rhyme** | `word-<tapped>` → `yes-N` → *(after the flight lands)* `two-more` or `one-more` | 110 / 260 |
| tap a **non-rhyme** | `word-<tapped>` → `no-N` | 110 |
| celebration | `great-job` → `word-<target>` → `word-<lastFound>` → `they-rhyme` → `case-closed` | 260 / 200 / 200 / 300 |
| Next Case pressed | `next-case` | — |
| end screen | `end` → `end-tip` | 500 |

**Composition rules, stated once:**
- The **case prompt** is always `case-stem` (or `sound-listen`) **followed by the shared
  `word-<target>` clip** — never a recorded whole sentence.
- **`they-rhyme` always follows `word-<target>` + `word-<found>`**, in that order, and never
  appears alone. That ordering is what teaches the comparison.
- The third rhyme's own `yes-N` is **suppressed** — it would collide with `great-job` 400 ms
  later. The third find goes: `word-<tapped>` → flight → celebration.

### 3.5 Voice variant rotation

`yes-1..3` and `idle-1..2` rotate from a **seeded shuffled deck**, drawn without replacement and
reshuffled when exhausted. Two rules on top:

1. **Never the same variant twice in a row**, including across a case boundary — on reshuffle, if
   the new first card equals the last card played, swap it with the second.
2. The deck is seeded from `QLOBE_DEBUG.seed(n)`, so a QA run is reproducible; the default seed is
   `Date.now() & 0xffff`, so two real sessions differ.

`no-N` does **not** use the deck. It is a **ladder within a case**: the first non-rhyme tap of a
case uses `no-1`, the second `no-2`, the third and every one after `no-3`. The lines are written
to escalate in helpfulness, so their order is meaning, not variety. The ladder resets at each
case intro.

### 3.6 Idle timing

All timers are cleared by any `pointerdown` in the play field and restart from zero. All scale
with `QLOBE_DEBUG.fastTimers(scale)`.

| elapsed with no tap | what happens |
|---|---|
| **8 s** (`tuning.idleMs`) | `idle-1` (or `idle-2`, by the deck) **and** one idle pulse sweep across all unfound hotspots (§9.8) |
| 18 s (`tuning.hintMs`) | `hint-look` + a second pulse sweep |
| 30 s (`tuning.repromptMs`) | the case prompt is re-spoken in full |
| every 15 s after (`tuning.idleRepeatMs`) | alternate: pulse sweep + idle line, then prompt |

**There is no tier that points at the answer.** The room is fully visible — the child is not
searching in the dark, they are *listening*, and a hint that highlighted the correct object would
delete the entire skill. This is the deliberate difference from Flashlight Cave's hint ladder.

**After three non-rhyme taps in one case**, the 8 s tier fires immediately on the next settle
instead of waiting — the child gets the sweep and a line sooner, but still no answer.

---

## 4. Case & placement spec

### 4.1 The five cases

All 27 words come from the verified 133-word set in `shared/data/words.json`; every rhyme shares
the target's `rime` field; every word has `shared/assets/objects/<w>.webp` and
`shared/assets/audio/words/<w>.m4a` present on disk (verified at design time).

| # | id | room | target | rime | rhymes (3) | distractors (2) |
|---|---|---|---|---|---|---|
| 1 | `case-1` | study | **cat** | `at` | hat, bat, mat | sun, mop |
| 2 | `case-2` | kitchen | **pan** | `an` | can, fan, van | dog, bed |
| 3 | `case-3` | bedroom | **bug** | `ug` | jug, mug, rug | hen, cap |
| 4 | `case-4` | study | **hat** | `at` | rat, mat, bat | pen, log |
| 5 | `case-5` | kitchen | **jet** | `et` | net, vet, pet | ten, fig |

Cases run in this fixed order in both modes. Three room plates serve five cases; cases 4 and 5
revisit study and kitchen with **a different target and different placements**, which is
`philosophy.md` principle 7 (repeat with variation) at the case grain.

**Distractor rule, and why it is a rule.** A distractor must **not** share the target's rime and
must **not** share a rime with any other object in the same case. Checked case by case: case 1 has
`un` + `op` against `at`; case 2 `og` + `ed` against `an`; case 3 `en` + `ap` against `ug`; case 4
`en` + `og` against `at`; case 5 `en` + `ig` against `et`. No case contains two words that rhyme
with each other but not with the target — that would be a second correct answer to a question the
game allows one answer to, the same class of bug as Flashlight Cave's C/K collision. **QA asserts
this from `words.json`, not from this table** (§11.2).

**The -un and -og families are demoted to distractor duty** (sun, dog, log). Both have too few
depictable CVC nouns in the shared object library to fill a case (a target plus three rhymes).
They still appear — as the things that *don't* rhyme, which is a real job.

### 4.2 Objects belong to the room — a content rule for WP1c and WP1d

Every object must read as *a thing that could plausibly be in this room*, because "hidden object"
only works if nothing looks pasted on. Where a word is not naturally domestic it is placed as a
**picture, toy or model**, and the sprite is generated that way:

| word | how it appears | room |
|---|---|---|
| bat | a toy baseball bat leaning in a corner — **the object, never the animal** | study |
| sun | a sun drawn on a child's picture pinned to the wall | study |
| rat | a toy rat on the floor | study |
| log | a log in a toy farm set / firewood by the hearth | study |
| van, jet | toy vehicles on a shelf or counter | kitchen |
| vet | a framed photo of the family vet holding a puppy | kitchen |
| pet | a small pet in a basket (the shared `pet.webp` cut-out) | kitchen |
| ten | a number **10** fridge magnet or calendar page | kitchen |
| dog | a sleeping dog on the floor | kitchen |
| hen | a china hen ornament | bedroom |

**`bat` is always the object, never the mascot.** The bat mascot appears only on the splash and
the celebration, never in a room, so there is no possible confusion about which bat is tappable.
That is a hard rule for WP1d's art prompts.

### 4.3 Room zones — the wide lattice

Each room defines **eight named anchor zones**. The rects are **identical across all three
rooms** — only the names differ. This is deliberate: one geometry, verified once against every
keep-out band and every supported aspect ratio, means WP1c can author placements without seeing
the art and WP1d can paint three rooms against one known-good layout.

**The wide lattice (art px; `{x, y, w, h}` = top-left + size of the allowed box):**

| # | x | y | w | h | centre |
|---|---|---|---|---|---|
| 0 | 230 | 200 | 250 | 230 | 355, 315 |
| 1 | 500 | 210 | 240 | 190 | 620, 305 |
| 2 | 940 | 210 | 240 | 190 | 1060, 305 |
| 3 | 1240 | 200 | 250 | 230 | 1365, 315 |
| 4 | 150 | 560 | 260 | 250 | 280, 685 |
| 5 | 1220 | 520 | 260 | 250 | 1350, 645 |
| 6 | 290 | 830 | 240 | 240 | 410, 950 |
| 7 | 1060 | 830 | 230 | 230 | 1175, 945 |

**Names, by room** (index order is load-bearing — it is the compact-layout mapping, §4.7):

| # | study | kitchen | bedroom |
|---|---|---|---|
| 0 | `shelf-left` | `upper-shelf-left` | `wall-shelf` |
| 1 | `wall-hook` | `hood-wall` | `poster-wall` |
| 2 | `windowsill` | `window-sill` | `window-ledge` |
| 3 | `shelf-right` | `upper-shelf-right` | `toy-shelf` |
| 4 | `plant-nook` | `counter-left` | `nightstand` |
| 5 | `dresser-top` | `counter-right` | `bed-side` |
| 6 | `floor-left` | `floor-left` | `rug-centre` |
| 7 | `floor-right` | `floor-right` | `toy-box` |

**Every zone clears every keep-out band**, verified:

| keep-out (art px) | what it is |
|---|---|
| `y < 190` | the prompt banner |
| `x 540–1060, y 400–1160` | the target sprite, the word card, the found tray, the dots |
| `x 1300–1560, y 870–1160` | the magnifier prop |
| `x < 260, y > 950` | the back button |
| `x < 260, y < 260` | the sound button |

The zone rects are the **contract**; the keep-out table is the derivation. If a zone rect is ever
edited, re-check it against this table.

### 4.4 Object sizing and jitter

An object is drawn **centred in its zone**, scaled so its **longest edge** equals `size` art px,
then clamped to fit inside the zone box with a 10 px margin. Default `size` is **200**. Per-word
sizes, authored in `config.json` (`sizes`) so the room reads with real object scale:

| size | words |
|---|---|
| **150** | fig, pen, cap, ten |
| **170** | mat, mop, rug, can, mug, jug, net, hen, rat |
| **200** | hat, bat, sun, bed, dog, log, cat, pet, vet |
| **240** | pan, fan, van, jet, bug |

All are inside the required 140–260 art px band. The target sprite is a separate, larger draw at
**340 art px tall** at art `(800, 700)`; it does not use a zone.

**Jitter rule.** Each placement is offset by a **seeded ±20 art px** (`tuning.jitterArtPx`) on
both axes:

```
jx = (hash(seed, caseId, word, 'x') % 41) - 20      // integer, -20..+20
jy = (hash(seed, caseId, word, 'y') % 41) - 20
```

`hash` is a small FNV-1a over the concatenated string — the game's only PRNG, shared with the
Mode-2 shuffle and the voice decks, so `seed(n)` pins everything. Jitter is applied **after** the
clamp-to-zone and then re-clamped, so an object can never leave its zone. Jitter is recomputed
only when the seed or the case changes — **never** on a resize.

### 4.5 Placements — Mode 1 (`rhyme-hunt`)

Authored per case; these are the shipping values.

| case | room | target | placements (word → zone) |
|---|---|---|---|
| 1 | study | cat | hat → `wall-hook` · bat → `floor-right` · mat → `floor-left` · sun → `windowsill` · mop → `plant-nook` |
| 2 | kitchen | pan | can → `upper-shelf-left` · fan → `hood-wall` · van → `counter-right` · dog → `floor-left` · bed → `counter-left` |
| 3 | bedroom | bug | jug → `nightstand` · mug → `wall-shelf` · rug → `rug-centre` · hen → `window-ledge` · cap → `toy-shelf` |
| 4 | study | hat | rat → `floor-right` · mat → `plant-nook` · bat → `shelf-right` · pen → `dresser-top` · log → `floor-left` |
| 5 | kitchen | jet | net → `window-sill` · vet → `upper-shelf-right` · pet → `floor-left` · ten → `hood-wall` · fig → `counter-left` |

Cases 1 and 4 share a room and share three words (hat becomes the target; mat and bat move to
different zones). That is intentional: the child meets the same objects in new places, which is
exactly the repetition-with-variation the family is built on.

### 4.6 Placements — Mode 2 (`sound-detective`): seeded shuffle

Mode 2 uses the same cases, the same rooms and the same five words, but **re-assigns them across
the eight zones**:

```
zones      = the room's 8 zones, in index order
chosen     = shuffle(zones, hash(seed, 'sound', caseId)).slice(0, 5)
assignment = zip([...case.rhymes, ...case.distractors], chosen)
```

The word order is the **authored** order in `config.json`, so the assignment is a pure function of
`(seed, caseId)`. `QLOBE_DEBUG.seed(42)` therefore pins the whole of Mode 2's layout for QA, and
two real sessions differ.

This is why the game needs **eight** zones for **five** objects: the extra three are what make the
shuffle produce a genuinely different room rather than a permutation of the same five spots.

### 4.7 Layout modes — `wide` and `compact`

Cover-fit crops art space differently in every aspect ratio, and the authored lattice does not
survive a portrait crop (at 834 × 1194 only art `x ∈ [381, 1219]` is visible — zones 0, 3, 4, 5, 6
and 7 fall off the screen). So the game has two layouts, chosen from the **visible art rect**,
never from `orientation`:

```
V = scene.visibleArt()                                    // {x, y, w, h} in ART px
layout = (V.w >= 1300 && V.h >= 950) ? 'wide' : 'compact'  // tuning.compactMinArtW / H
```

| viewport | scale | visible art | layout |
|---|---|---|---|
| 1600 × 1200 | 1.000 | 1600 × 1200 | `wide` |
| 1024 × 768 | 0.640 | 1600 × 1200 | `wide` |
| 1194 × 834 (iPad landscape) | 0.746 | 1600 × 1118 | `wide` |
| 1180 × 820 | 0.738 | 1600 × 1112 | `wide` |
| 834 × 1194 (iPad portrait) | 0.995 | 838 × 1200 | `compact` |
| 1180 × 520 | 0.738 | 1600 × 705 | `compact` |

**`compact` is computed, not authored.** Inside the visible art rect, inset by 4 % on each side
and by the HUD reserve converted to art px, the game lays a **4 × 2 grid** (4 columns, 2 rows).
Zone index `i` maps to grid cell `i` — top row `0,1,2,3` left to right, bottom row `4,5,6,7`. Cell
object size is `min(cellW, cellH) × 0.86`, capped at 200 art px. Jitter is **not** applied in
compact (there is no slack to spend). The magnifier prop is hidden; the target sprite drops to
240 art px and moves to art `(V.cx, V.y + 0.30 × V.h)`; the word card and the found tray sit as one
row directly under the prompt banner instead of at the bottom.

The layout switch happens inside the scene's reflow; the game re-places hotspots with
`handle.setRect()` in its `onReflow` callback. **A layout switch never changes which objects are
in the case, which are rhymes, or what has already been found.**

---

## 5. `shared/js/hotspot-scene.js` — FROZEN API

This is a contract. **WP1a implements exactly this; WP1b codes against it blind.** No signature,
option name, default, state name or promise semantic below changes without a new Phase 0.

The module owns: the art↔screen transform, resize/orientation reflow, ≥ 96 CSS px hit inflation,
HUD-reserve avoidance, `prefers-reduced-motion`, bubble geometry, and `<button>` semantics.
**The game owns:** rhyme logic, voice, celebration, HUD, and all content.

The module **loads no assets of its own** — every URL it touches is one the caller passed in. That
keeps it drop-in for any future game with no path audit (`interaction-patterns.md` §10).

### 5.1 Construction

```js
import { createScene } from '../../../shared/js/hotspot-scene.js';

const scene = createScene(mountEl, {
  artW:          1600,       // required, number > 0
  artH:          1200,       // required, number > 0
  background:    null,       // string URL | null   (default null — no plate until setBackground)
  minHit:        96,         // CSS px floor for every hotspot hit box (default 96)
  bubbleMinHit:  0,          // CSS px floor for bubbles; 0 = bubbles are not hit targets (default 0)
  reducedMotion: null,       // true | false | null. null (default) = live-track
                             //   matchMedia('(prefers-reduced-motion: reduce)')
  ariaLabel:     '',         // string, applied to the scene root (default '')
  className:     '',         // extra class on the scene root (default '')
});
```

`mountEl` must be a positioned element the scene may fill; the scene creates its own
`<div class="hs-root">` inside it and never touches `mountEl`'s other children. Throws
`TypeError` on a missing `mountEl` or a non-positive `artW`/`artH`; **nothing else in the module
ever throws.**

**Read-only properties**

| property | type | meaning |
|---|---|---|
| `scene.el` | `HTMLElement` | the scene root (for CSS and for `document.elementFromPoint` debugging) |
| `scene.artW` / `scene.artH` | `number` | as constructed |
| `scene.scale` | `number` | current cover-fit scale |
| `scene.reducedMotion` | `boolean` | resolved value right now |
| `scene.size` | `number` | hotspot count |

### 5.2 Background

```js
scene.setBackground(url, { ms = 420 } = {})   // → Promise<boolean>
```

- Crossfades from the current plate to `url` over `ms`.
- **Instant** (`ms` treated as 0) when `scene.reducedMotion` is true, when `ms <= 0`, or when
  there is no current plate.
- Awaits `img.decode()` before the swap, so the fade never shows a half-painted plate.
- **Never rejects.** Resolves `true` on success; on a 404 or decode error resolves `false` and
  **keeps the current plate** (a missing room must not produce a white screen).
- `setBackground(null)` clears to transparent, instantly.
- Overlapping calls: the later call wins; the earlier promise resolves `false`.

### 5.3 Hotspots

```js
const h = scene.addHotspot({
  id:      'hat',        // required, unique non-empty string. A duplicate id REPLACES the
                         //   existing hotspot in place (same z, new geometry) and returns
                         //   the SAME handle object.
  x:       632,          // required. ART px, the hotspot's CENTRE-x.
  y:       298,          // required. ART px, the hotspot's CENTRE-y.
  w:       170,          // required. ART px, sprite box width.
  h:       170,          // required. ART px, sprite box height.
  sprite:  'assets/sprites/hat.webp',  // string URL | null (default null → an empty but still
                                       //   tappable box; used by the test harness and by QA)
  alt:     'hat',        // string, the button's aria-label (default: the id)
  z:       0,            // integer paint + DOM + tab order, ascending (default 0)
  hitPad:  0,            // ART px added on every side of the hit box (default 0)
  state:   'idle',       // initial state (default 'idle')
  enabled: true,         // default true
});
```

`x, y` are the **centre**, not the top-left. This is the single most likely place for a coordinate
bug and it is stated here once, normatively.

**Hit inflation — the exact rule.** On every reflow, for every hotspot:

```
minArt = minHit / scale                      // CSS px floor converted to ART px
hitW   = max(w + 2*hitPad, minArt)
hitH   = max(h + 2*hitPad, minArt)
```

The `<button>` element **is** the hit box (`hitW × hitH`, centred on `x, y`); the sprite is a child
`<img>` at `w × h` centred inside it with `pointer-events: none`. Therefore `getTargets().rect` is
always ≥ `minHit` CSS px on both axes at every viewport, and QA can assert it directly. Inflation
is symmetric and never resizes the sprite.

**Handle API**

| member | signature | semantics |
|---|---|---|
| `h.id` | `string` | read-only |
| `h.art` | `{x, y, w, h}` | read-only snapshot in ART px |
| `h.state` | `'idle'\|'lit'\|'found'\|'declined'` | read-only |
| `h.setState(s)` | `→ void` | §5.5. An unknown state is a no-op plus one `console.warn`. |
| `h.setRect({x, y, w, h})` | `→ void` | move/resize in ART px; any subset of keys. Immediate, no animation. |
| `h.setSprite(url)` | `→ Promise<boolean>` | swap the `<img>`; resolves `false` on load failure and keeps the previous sprite |
| `h.setEnabled(on)` | `→ void` | toggles `disabled` + `aria-disabled`; a disabled hotspot never fires `onTap` and is still reported by `rects()` |
| `h.bubble(opts)` | `→ Promise<void>` | §5.6. Resolves when the pop-in animation ends. |
| `h.hideBubble({ms = 240} = {})` | `→ Promise<void>` | fade + remove. Instant under reduced motion. Resolved no-op if there is no bubble. |
| `h.pulse({ms = 900, scale = 1.06} = {})` | `→ Promise<void>` | one attract pulse (§9.8) |
| `h.wiggle({ms = 320, deg = 5} = {})` | `→ Promise<void>` | two-cycle rotation wobble (§9.4) |
| `h.pop({ms = 260} = {})` | `→ Promise<void>` | spring scale-in from 0.6, used on mount |
| `h.flyTo(rect, {ms = 620, arc = 120} = {})` | `→ Promise<void>` | see below |
| `h.rect()` | `→ {x, y, w, h}` | the hit box in **SCREEN CSS px**, live |
| `h.remove()` | `→ void` | removes the hotspot and its bubble; the handle becomes inert (every method a resolved no-op) |

**`flyTo(rect, opts)` — an addition to the plan's handle list, and why.** The correct-answer
choreography (§9.3) flies the found sprite into the HUD tray, and only the module knows the
transform, the current sprite box and the reduced-motion state. `rect` is a **screen-px**
`{x, y, w, h}` (a `DOMRect` works) — normally `traySlotEl.getBoundingClientRect()`. The sprite
travels a quadratic arc peaking `arc` CSS px above the straight chord, scaling to fit `rect`, over
`ms`. On resolve the sprite is **returned to its home position instantly** and the hotspot is left
in whatever state the caller set — the module never leaves a floating element behind. **Nothing is
ever cloned or reparented**, so `interaction-patterns.md` §11 rule 5 (stray clones) is
structurally inapplicable rather than defended against. Under reduced motion the flight is a
180 ms opacity fade at the source with no travel, and the promise still resolves.

**Promise semantics, uniformly.** Every animating method returns a promise that:

- resolves when the animation ends;
- resolves **immediately (next microtask)** under reduced motion, having applied the reduced
  variant of §5.7;
- resolves — **never rejects** — if the hotspot is removed, the scene is destroyed, or a competing
  animation supersedes it;
- is safe to ignore. No method requires its promise to be awaited for correctness.

### 5.4 Scene methods

| member | signature | semantics |
|---|---|---|
| `scene.onTap(cb)` | `→ () => void` (disposer) | `cb(id, handle, event)` on every hotspot activation. **Wired through `shared/js/tap.js:onTap`** — feedback on `pointerdown`, action on `pointerup` over the element, `click` reserved for keyboard/AT. **`pointercancel` never fires `cb`.** Multiple subscribers allowed; they fire in registration order. |
| `scene.setEnabled(on)` | `→ void` | scene-wide input gate; per-hotspot `enabled` is preserved underneath |
| `scene.setReserve(fn)` | `→ void` | `fn()` returns `Array<DOMRect \| {x,y,width,height}>` in **screen CSS px** — the HUD boxes to avoid. Called on every reflow. A hotspot whose hit box overlaps any reserve rect by **more than 25 % of the hotspot's own area** is translated along its shorter escape axis until the overlap is ≤ 25 %, then clamped back inside the visible art rect. Translation only — never a resize. `setReserve(null)` clears it. |
| `scene.onReflow(cb)` | `→ () => void` | `cb({scale, offsetX, offsetY, viewW, viewH, visibleArt, layoutHint})` after every reflow. `layoutHint` is `'wide' \| 'compact'` computed with §4.7's rule and is **advisory** — the game decides. |
| `scene.reflow()` | `→ void` | force one now (after a HUD size change) |
| `scene.toScreen(x, y)` | `→ {x, y}` | ART → screen CSS px |
| `scene.toArt(x, y)` | `→ {x, y}` | screen CSS px → ART |
| `scene.visibleArt()` | `→ {x, y, w, h, cx, cy}` | the art-space rect currently on screen |
| `scene.rects()` | `→ [{id, rect, state, enabled}]` | every hotspot; `rect` in **screen CSS px**. This is what feeds `QLOBE_DEBUG.getTargets()`. Roles are the game's business, not the module's. |
| `scene.get(id)` / `scene.has(id)` | `→ handle\|null` / `boolean` | |
| `scene.clear()` | `→ void` | remove every hotspot and bubble; keep the background and the listeners |
| `scene.destroy()` | `→ void` | `clear()` + remove the background, every listener, the `matchMedia` subscription and the root element. Idempotent. |

### 5.5 States

Four, exactly. The module owns the visuals; the game owns when.

| state | visual | tappable | aria |
|---|---|---|---|
| `idle` | full colour, navy outline (baked into the sprite), soft drop shadow `0 6px 14px rgba(11,26,58,.28)`. No halo. | yes | — |
| `lit` | warm halo — `drop-shadow(0 0 22px #ffd24a) drop-shadow(0 0 44px rgba(255,196,74,.6))` — scale 1.03. The mockup-02 "findable" glow. | yes | — |
| `found` | opacity 0.5, `saturate(.35)`, no shadow, `pointer-events: none` | **no** | `aria-disabled="true"` |
| `declined` | grey halo `drop-shadow(0 0 18px rgba(120,130,150,.85))`, opacity 0.9 | **yes** — a non-rhyme is never consumed | — |

State changes are a 180 ms CSS transition on `filter`, `opacity` and `transform`; instant under
reduced motion. **`declined` is not self-clearing** — the game returns it to `idle` after 900 ms
(§9.4).

### 5.6 Bubbles

```js
h.bubble({
  text:  'hat',        // string | '' — rendered as HTML text in Fredoka. '' with a glyph is legal.
  glyph: null,         // null | 'sound' — 'sound' renders the inline three-arc SVG instead of text
  side:  'auto',       // 'auto' | 'top' | 'bottom' | 'left' | 'right'   (default 'auto')
  tone:  'neutral',    // 'neutral' | 'yes' | 'no'                        (default 'neutral')
  ms:    260,          // pop-in duration                                 (default 260)
});
```

- Exactly **one bubble per hotspot**. A second `bubble()` call re-uses the element and cross-fades
  the content over 120 ms rather than stacking.
- The bubble is a DOM element in the scene root, sized in **CSS px** (not art px) so text stays
  legible at every scale: min-width 132, padding 14 / 28, radius 26, Fredoka 600 **44 px**.
- The **tail** always points at the hotspot centre.
- `side: 'auto'` picks the side with the most room, preferring `top`, then `bottom`, then the wider
  horizontal side; it flips if the bubble would cross the viewport edge or any `setReserve()` rect.
  Re-evaluated on reflow.
- Bubbles are `pointer-events: none` unless `bubbleMinHit > 0`.
- Bubbles are never clipped by the scene root (`overflow: visible`).

**Class names the module owns** (frozen, so game CSS can target them and QA can select them):
`.hs-root` · `.hs-bg` · `.hs-hotspot` · `.hs-sprite` · `.hs-bubble` · `.hs-bubble-tail`, plus the
state modifiers `.is-idle` / `.is-lit` / `.is-found` / `.is-declined` and the tone modifiers
`.tone-neutral` / `.tone-yes` / `.tone-no` and side modifiers `.side-top` / `.side-bottom` /
`.side-left` / `.side-right`. The module ships its own styles inline at module scope (one
`<style>` injected once, id `hs-style`) so it has **zero CSS file dependencies**; game CSS may
override any of them by specificity.

**Tones** — the three, exactly:

| tone | fill | text | border | use |
|---|---|---|---|---|
| `neutral` | `#fffdf6` | `#123a6b` | 5 px `#dfe8f5` | every tap: the object's name (mockup 02) |
| `yes` | `#eaf9e0` | `#3c7a1e` | 5 px `#7ac043` | a rhyme, from the moment `yes-N` starts |
| `no` | `#f0f1f4` | `#5a657a` | 5 px `#c6ccd8` | a non-rhyme |

Colour is never the only signal: `yes` also carries the green halo and the flight; `no` carries the
boing and the wiggle.

### 5.7 Reduced motion — module-wide

`prefers-reduced-motion: reduce` (or `reducedMotion: true`) changes exactly this, and nothing else:

| normally | reduced |
|---|---|
| background crossfade 420 ms | instant swap |
| bubble pop-in scale + fade | 120 ms opacity fade, no scale |
| `pulse()` scale + halo breathe | 300 ms halo opacity blink, no scale |
| `wiggle()` ±5° twice | 160 ms opacity dip to 0.7 and back, no rotation |
| `pop()` spring from 0.6 | 120 ms opacity fade-in at full size |
| `flyTo()` arc travel | 180 ms opacity fade at the source, no travel |
| state transition 180 ms | instant |

**Every method still resolves, every state still applies, every tap still works.** Reduced motion
is not a reduced game.

### 5.8 Accessibility

- Each hotspot is `<button type="button" class="hs-hotspot" data-id="<id>" aria-label="<alt>">`.
  Tab order follows `z` ascending. Focus ring: 4 px `#ffd24a` outline, 3 px offset.
- Keyboard `Enter` / `Space` activate through `tap.js`'s `click`-with-`detail === 0` path, so there
  is still exactly one press path.
- The scene root is `role="group"` with the constructor's `ariaLabel`.
- **In Mode 2 the `alt` is still the word.** A screen-reader user gets the answer; a sighted child
  does not. That asymmetry is accepted deliberately — withholding the label from AT would make the
  mode unplayable for that user, and the mode's audience is a hearing child.
- `touch-action: manipulation` on hotspots; `touch-action: none` on the scene root.

### 5.9 The test harness

`shared/js/hotspot-scene.test.html` — a standalone page (no game, no config) that mounts one scene
over a flat-colour plate with six synthetic hotspots and exposes buttons for: every state, every
bubble tone and side, `pulse` / `wiggle` / `pop` / `flyTo`, a reduced-motion toggle, a
reserve-rect toggle, and a live readout of `scene.rects()` and `scene.visibleArt()`. It is how WP1a
proves the module before WP1b ever loads it, and it is the regression surface for every future
consumer. **It must land before WP1b integrates.**

---

## 6. `config.json` — FROZEN schema

Loaded through the `config.js` fetch shim, exactly as `games/snack-chef/config.js` does:

```js
const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Rhyming Detective config failed: ${response.status}`);
export default await response.json();
```

### 6.1 Shape

```jsonc
{
  "id": "rhyming-detective",
  "art": { "w": 1600, "h": 1200 },

  "modes": [
    { "id": "rhyme-hunt",      "title": "Rhyme Hunt",      "intro": "mode-rhyme-hunt",
      "labels": true,  "shuffle": false, "revealAtCelebration": false },
    { "id": "sound-detective", "title": "Sound Detective", "intro": "mode-sound-detective",
      "labels": false, "shuffle": true,  "revealAtCelebration": true }
  ],

  "rooms": {
    "<roomId>": {
      "bg": "assets/bg-<roomId>.jpg",
      "zones": [                        // EXACTLY 8, ordered — index IS the compact-grid slot
        { "name": "<zoneName>", "x": 0, "y": 0, "w": 0, "h": 0 }
      ]
    }
  },

  "cases": [
    {
      "id": "case-1",
      "room": "study",
      "target": "cat",
      "rime": "at",                     // asserted against shared/data/words.json by qa.mjs
      "rhymes": ["hat", "bat", "mat"],
      "distractors": ["sun", "mop"],
      "placements": { "<word>": "<zoneName>" }    // exactly 5 entries, one per word
    }
  ],

  "sizes": { "<word>": 200 },           // ART px longest edge; default 200 when absent

  "sprites": {
    "dir": "assets/sprites/",                       // "<dir><word>.webp"
    "fallbackDir": "../../shared/assets/objects/"   // per-sprite Toy Table fallback (§8.5)
  },

  "voice": {
    "manifest": "assets/audio/manifest.json",
    "lines":    "data/lines.json",
    "wordKey":  "word-",                // shared word clip key = "word-" + word
    "decks":    { "yes": ["yes-1","yes-2","yes-3"], "idle": ["idle-1","idle-2"] },
    "noLadder": ["no-1", "no-2", "no-3"]
  },

  "tuning": {
    "dotCount": 5,
    "jitterArtPx": 20,
    "targetSpriteArtH": 340,
    "targetSpriteArt": { "x": 800, "y": 700 },
    "magnifierArt": { "x": 1300, "y": 870, "w": 260, "h": 290 },
    "minHitCssPx": 96,
    "idleMs": 8000,
    "hintMs": 18000,
    "repromptMs": 30000,
    "idleRepeatMs": 15000,
    "celebrationAutoAdvanceMs": 12000,
    "caseIntroTailMs": 350,
    "bubbleHoldMs": 1400,
    "declinedHoldMs": 900,
    "soundDebounceMs": 600,
    "clipGapMs": 120,
    "compactMinArtW": 1300,
    "compactMinArtH": 950
  }
}
```

**Invariants `qa.mjs` asserts (§11.2):** every room has exactly 8 zones with unique names; every
case's `placements` has exactly 5 keys covering `rhymes ∪ distractors`; every zone name used by a
case exists in that case's room; every rhyme's `rime` in `words.json` equals the case `rime` and
the target's; no distractor shares a rime with the target **or with the other distractor**; every
word has a sprite file and a `word-<w>` manifest entry; `tuning.dotCount === cases.length`.

### 6.2 Worked example — case 1, complete and shippable

```jsonc
{
  "id": "rhyming-detective",
  "art": { "w": 1600, "h": 1200 },

  "modes": [
    { "id": "rhyme-hunt", "title": "Rhyme Hunt", "intro": "mode-rhyme-hunt",
      "labels": true, "shuffle": false, "revealAtCelebration": false },
    { "id": "sound-detective", "title": "Sound Detective", "intro": "mode-sound-detective",
      "labels": false, "shuffle": true, "revealAtCelebration": true }
  ],

  "rooms": {
    "study": {
      "bg": "assets/bg-study.jpg",
      "zones": [
        { "name": "shelf-left",  "x":  230, "y": 200, "w": 250, "h": 230 },
        { "name": "wall-hook",   "x":  500, "y": 210, "w": 240, "h": 190 },
        { "name": "windowsill",  "x":  940, "y": 210, "w": 240, "h": 190 },
        { "name": "shelf-right", "x": 1240, "y": 200, "w": 250, "h": 230 },
        { "name": "plant-nook",  "x":  150, "y": 560, "w": 260, "h": 250 },
        { "name": "dresser-top", "x": 1220, "y": 520, "w": 260, "h": 250 },
        { "name": "floor-left",  "x":  290, "y": 830, "w": 240, "h": 240 },
        { "name": "floor-right", "x": 1060, "y": 830, "w": 230, "h": 230 }
      ]
    }
  },

  "cases": [
    {
      "id": "case-1",
      "room": "study",
      "target": "cat",
      "rime": "at",
      "rhymes": ["hat", "bat", "mat"],
      "distractors": ["sun", "mop"],
      "placements": {
        "hat": "wall-hook",
        "bat": "floor-right",
        "mat": "floor-left",
        "sun": "windowsill",
        "mop": "plant-nook"
      }
    }
  ],

  "sizes": { "cat": 200, "hat": 200, "bat": 200, "mat": 170, "sun": 200, "mop": 170 }
}
```

**Resolved geometry for `hat` at seed 42** — worked so WP1b can unit-test the whole pipeline:

```
zone wall-hook   = {x:500, y:210, w:240, h:190}        → centre (620, 305)
size(hat)        = 200 (longest edge)
sprite box       = 200 × 200, clamped to zone − 10px margin → 170 × 170
jitter (seeded)  = (+12, −7)
final art centre = (632, 298)

scene.addHotspot({ id:'hat', x:632, y:298, w:170, h:170,
                   sprite:'assets/sprites/hat.webp', alt:'hat', z:2 })

at 1194×834: scale 0.746 → hitW = max(170, 96/0.746) = 170 art px = 127 CSS px   ✓ ≥ 96
```

### 6.3 `data/lines.json`

```json
{
  "welcome":              "Hello, detective! Let's find some words that rhyme.",
  "mode-rhyme-hunt":      "Rhyme Hunt! Look around the room and find the rhyming words.",
  "mode-sound-detective": "Sound Detective. This time you have to listen very carefully.",
  "case-stem":            "Find the words that rhyme with",
  "sound-listen":         "Listen closely. Which words rhyme with",
  "yes-1":                "Yes! That's a rhyme.",
  "no-1":                 "Ooh, that one doesn't rhyme. Keep looking!",
  "word-cat":             "cat",
  "word-hat":             "hat"
}
```

Flat `{ key: "spoken text" }` — the shape `voice-clips.js` reads natively. **It contains an entry
for every one of the 24 new keys and every one of the 27 `word-<w>` keys**, so the game still
speaks correctly with `assets/audio/` entirely absent. `gen-voice.py` reads this file as its
script, so it is never hand-desynced from §3.2. The two stem lines drop their trailing ellipsis in
the fallback text (Web Speech reads "…" as a pause of unpredictable length).

---

## 7. `window.QLOBE_DEBUG` — v1 spec

v1 per `shared/js/engines/README.md`, plus five declared extensions. **Everything routes through
the real handlers — there is no test-only code path.** Installed in `js/main.js` at module scope,
before `ready` resolves.

```js
window.QLOBE_DEBUG = {
  version: 1,
  gameId: 'rhyming-detective',
  engine: 'rhyming-detective (game-local js/game.js + shared/js/hotspot-scene.js)',
  ready,                     // Promise — resolves after boot + config + voice manifest load

  listModes,                 // () => [{ id, title }]
  startMode,                 // (id) => Promise — resolves when case 1 is on `play` awaiting input
  getState,                  // see 7.1
  getTargets,                // see 7.2
  tap,                       // (id) => Promise<{ accepted: boolean, role: string }>
  winRound,                  // () => Promise<boolean>
  mute,                      // (v = true) => boolean
  seed,                      // (n) => number
  fastTimers,                // (scale = 0.05) => number
  home,                      // () => void

  // ---- declared extensions ----
  getZones,                  // () => [{ name, art:{x,y,w,h}, screen:{x,y,w,h}, word|null }]
  getLayout,                 // () => { layout, scale, offsetX, offsetY, visibleArt, reserves }
  getAudioLog,               // () => [{ t, kind:'clip'|'speech', key, url|null }]  (ring, last 80)
  clearAudioLog,             // () => void
  nextCase,                  // () => Promise — advance from `celebration` via the real button path
};
```

### 7.1 `getState()`

```js
{
  screen:        'splash' | 'case-intro' | 'play' | 'celebration' | 'end',
  mode:          'rhyme-hunt' | 'sound-detective' | null,
  caseIndex:     0,          // 0-based; -1 on the splash
  casesTotal:    5,
  found:         ['hat'],    // the rhymes collected in THIS case, in the order found
  rhymesTotal:   3,
  awaitingInput: true,       // screen === 'play' && !busy
  target:        'cat' | null,
  wrongTaps:     0,          // this case only; drives the no-ladder, never shown to the child
  reducedMotion: false,
  muted:         false,
  seedValue:     42,
  layout:        'wide' | 'compact'
}
```

`screen` extends v1's `'splash' | 'play' | 'end'` with `'case-intro'` and `'celebration'` —
declared, because both are real states with their own input rules. `found` is an **array**, not a
count, because the celebration pairs the target with `found[found.length - 1]` and QA must be able
to predict which word appears in the second bubble.

### 7.2 `getTargets()`

```js
[ { id: 'hat',    role: 'correct', rect: {x,y,w,h}, state: 'idle', word: 'hat' },
  { id: 'sun',    role: 'wrong',   rect: {x,y,w,h}, state: 'idle', word: 'sun' },
  { id: 'target', role: 'neutral', rect: {x,y,w,h}, state: 'idle', word: 'cat' } ]
```

- `rect` is in **screen CSS px** (v1), straight from `scene.rects()`, so Playwright can click it
  and so the ≥ 96 px assertion is measurable.
- **Roles are truthful for the current prompt**: `correct` = shares the target's rime; `wrong` = a
  distractor; `neutral` = the target sprite. A found rhyme keeps `role: 'correct'` and reports
  `state: 'found'` — that pair is what lets QA verify a found object is no longer tappable.
- Returns `[]` on any screen other than `play` / `celebration`.

### 7.3 `tap(id)`

`Promise<{ accepted: boolean, role: string }>`. Goes through **the exact handler a real
`pointerup` reaches** — the same `scene.onTap` subscriber, the same voice, the same choreography.
It resolves when the resulting choreography settles (bubble shown / flight landed / celebration
mounted).

| case | `accepted` | `role` |
|---|---|---|
| an unfound rhyme | `true` | `'correct'` |
| a distractor | `false` | `'wrong'` |
| the target sprite | `false` | `'neutral'` |
| an already-found rhyme (disabled) | `false` | `'correct'` |
| unknown id, or not on `play` | `false` | `'none'` |

### 7.4 The rest

| member | contract |
|---|---|
| `listModes()` | `[{id:'rhyme-hunt',title:'Rhyme Hunt'},{id:'sound-detective',title:'Sound Detective'}]` — read from config, never hard-coded |
| `startMode(id)` | mounts the mode from any screen, runs the case-intro at `fastTimers` speed, resolves when `getState().awaitingInput === true` |
| `winRound()` | taps the remaining unfound rhymes through the **real** `tap()` path, in order, awaiting each; resolves `true` when `screen === 'celebration'`, `false` if it could not (guard: 20 iterations) |
| `nextCase()` | from `celebration`, presses the real Next Case handler; resolves when the next case awaits input, or when `screen === 'end'` |
| `mute(v = true)` | silences **everything**: `voice.stop()`, `speech.stop()`, `speechSynthesis.cancel()`, sfx gain to 0, and `.muted = true` on every `<audio>` in the document. Returns the new value. |
| `seed(n)` | pins the Mode-2 zone shuffle, the ±20 px jitter and the `yes` / `idle` decks. Returns the applied number. Re-seeding re-derives placements from the **next** case, never mid-case. |
| `fastTimers(scale = 0.05)` | clamps to `[0.01, 1]`, scales **every** idle, hold, auto-advance and choreography duration. Returns the clamped scale. Default 1 — a game that never calls it is byte-identical. |
| `home()` | the back-button teardown of §2.8, from any screen, no page reload |
| `getZones()` | all 8 zones of the current room with their art rects, their live screen rects, and which word (if any) currently occupies each — the placement debugger, and how QA proves `seed()` determinism |
| `getLayout()` | `{layout:'wide'\|'compact', scale, offsetX, offsetY, visibleArt:{…}, reserves:[DOMRect…]}` — proves the reserve mechanism at any viewport without a screenshot |
| `getAudioLog()` / `clearAudioLog()` | a ring buffer (last 80) fed from `voice.onClip()` and the speech path, so QA can prove a line came from a **recorded clip** and not the Web Speech fallback (`kind:'clip'` plus a `url`). Precedent: `build-assemble.js`. |

---

## 8. Art direction & asset list

### 8.1 Storybook Rooms, applied

`docs/art-direction.md` §2 gives reading-phonics the **Toy Table** default; this game overrides to
**Storybook Rooms**, and the same document permits that ("the category default applies unless the
game's design doc argues otherwise"). The argument:

1. **The mechanic is "search a room".** Toy Table's canon is cut-out objects on an airy sky-blue
   field — there is no room to search.
2. **All four mockups are already Storybook Rooms.** Mockup 02 is a red-brick study with rounded
   geometry, crisp navy outlines and glossy depth — the Laundry Sorter look, unmodified.
3. **The shared object library composites legally.** `shared/assets/objects/<w>.webp` are Toy Table
   cut-outs and are the per-sprite fallback (§8.5). `art-direction.md` already specifies Storybook
   Rooms as *cut-out sprites over a full-bleed room*, and Flashlight Cave GDD §5.4 is the standing
   precedent for exactly this mix.

**The world rules every generated asset must hold to:**

- **Full-bleed rooms.** The plate fills 1600 × 1200 edge to edge — no border, no vignette,
  **evenly lit**, no baked glow, no spotlight, no light pool. Runtime halos are the only lighting.
- **Navy outlines everywhere**, `#123a6b`, consistent weight (≈ 6 px at plate scale, ≈ 4 px on a
  200 px sprite).
- **Rounded geometry.** No sharp corners on any object, prop or panel. Radius 24–44 on UI.
- **Glossy depth.** One soft highlight per form, one soft contact shadow. No texture noise, no
  gradient meshes, no photographic detail.
- **Quiet hotspot zones.** The eight zone rects (§4.3) must land on **calm, low-detail surfaces** —
  flat wall, plain shelf board, clear floor. This is a hard art brief: an object glowing against
  busy wallpaper is unreadable, and a bubble over it is worse. WP1d's prompts name the zones.
- **NO EMOJI ANYWHERE.** Not in the HTML, not in a CSS `content`, not in the art, not in a
  fallback, not in an `aria-label`. The `icon` field in `game.json` is the sole exception — it is
  registry metadata rendered by the hub, not by this game.

**Palette (sampled from the mockups):**

| role | hex |
|---|---|
| navy line / body text | `#123a6b` |
| detective blue (accent, word card, buttons) | `#2f6fd0` |
| cream panel | `#fffdf6` |
| banner cream | `#fff6dc` |
| banner border gold | `#e8b64a` |
| glow gold | `#ffd24a` |
| celebration gold field | `#f5a623` → `#ffc93c` |
| rhyme green | `#7ac043` |
| study brick red | `#c0392b` |
| study floor wood | `#c98a4b` |
| splash sky | `#5ecbf0` |

**Fredoka type scale** (`shared/fonts/fredoka-latin-600-normal.woff2`, weight 600 throughout;
sizes are CSS px at a 1194-wide viewport and scale with `clamp()`):

| use | size | colour |
|---|---|---|
| target word card | 84 | `#2f6fd0` |
| celebration word bubbles | 72 | `#2f6fd0` |
| splash Play label | 64 | `#fffdf6` |
| speech bubbles | 44 | `#123a6b` (tone-dependent, §5.6) |
| prompt banner | 40 | `#123a6b`, target word `#2f6fd0` |
| end-screen word labels | 40 | `#123a6b` |
| mode-tile labels | 34 | `#123a6b` |

`await document.fonts.load('600 84px Fredoka')` before the first screen paints, or the first frame
renders in the fallback face.

### 8.2 New, produced for this game

| asset | description | dimensions | budget |
|---|---|---|---|
| `assets/title.webp` | The "Rhyming Detective" lockup extracted from mockup 01 — orange/yellow glossy "Rhyming" over pink/white "Detective" on the navy plaque, with the paw-print ornaments. Alpha-trimmed. **Spell-check at full size.** | ~1400 × 640 | **≤ 150 KB** |
| `assets/splash-bg.jpg` | Mockup 01's sky-blue field with pale triangle confetti — wordmark, button, cream band and both mascots removed. | 1600 × 1200 | **≤ 300 KB** |
| `assets/bg-study.jpg` | Mockup 02's room: red brick wall, green-framed window centre with a bright outdoor view, wooden shelf right, dresser right, potted plant left, warm wood floor. Evenly lit. Zones 0–7 land on calm surfaces. **No objects, no text, no characters, no UI.** | 1600 × 1200 | **≤ 300 KB** |
| `assets/bg-kitchen.jpg` | A cosy Storybook-Rooms kitchen: mint-green cabinets, wood counter, hood over a stove left, window over the sink centre, open upper shelves both sides, tiled floor. Same rules. | 1600 × 1200 | **≤ 300 KB** |
| `assets/bg-bedroom.jpg` | A child's bedroom: soft lilac wall, bed right, nightstand, wall shelf left, window centre, toy shelf right, round rug centre-floor, toy box. Same rules. | 1600 × 1200 | **≤ 300 KB** |
| `assets/sprites/<word>.webp` × **27** | Storybook-Rooms style pass over the shared `objects/<w>.webp` identity reference. Navy outline, one highlight, one contact shadow, alpha cut-out, **no ground plane baked in**. See §4.2 for the ten words that ship as pictures / toys / models rather than the literal thing. | longest edge 512 | **30–80 KB each** |
| `assets/mascots/cat-present.webp` | **Canonical Detective Cat: the ORANGE tabby of mockup 01** — deerstalker cap, brown trench coat, holding a magnifying glass, friendly three-quarter pose. | 1024 × 1024 | ≤ 90 KB |
| `assets/mascots/cat-cheer.webp` | The same orange cat, both paws up, eyes closed, big open smile (mockup 03's *pose*, mockup 01's *character*). | 1024 × 1024 | ≤ 90 KB |
| `assets/mascots/bat-fly.webp` | The friendly brown bat of mockup 01, wings spread, flying. | 1024 × 1024 | ≤ 90 KB |
| `assets/mascots/bat-cheer.webp` | The same brown bat, wings up, cheering, small deerstalker. | 1024 × 1024 | ≤ 90 KB |
| `assets/props/magnifier.webp` | The blue-rimmed magnifying glass with the wooden handle from mockup 02. Alpha cut-out. | ~700 × 780 | ≤ 70 KB |
| `assets/lockups/great-job.webp` | "Great Job!" from mockup 03 — white/gold glossy letters, purple outline. **Decorative title art, therefore baked.** Alpha-trimmed. Spell-check at full size. | ~1100 × 300 | ≤ 90 KB |
| `assets/lockups/they-rhyme.webp` | The green "They rhyme!" ribbon of mockup 03 with its spark marks. Decorative, baked, alpha-trimmed. | ~760 × 200 | ≤ 60 KB |
| `assets/audio/<24>.m4a` | The voice set of §3.2. AAC 64 kbps mono, `+faststart`, loudness-matched. | — | ~14 KB avg, **≤ 400 KB total** |
| `assets/audio/manifest.json` | 24 local entries + 27 `../`-path shared word entries. | — | ≤ 8 KB |
| `assets/audio/qa.json` | The Whisper QA report (transcript, score, verdict per clip) plus the three shared `prompts/` transcriptions of §3.3. | — | ≤ 30 KB |
| `assets/og-image.jpg` | Social card, captured from the finished splash by `tools/pipeline/capture_og_images.mjs`. | 1200 × 630 | ≤ 200 KB |
| `assets/source/` | Every generation intermediate plus `qlobe-recipe` sidecars (`docs/asset-provenance.md`). | — | not shipped to the page |

Three room plates instead of one is a deliberate, precedented budget note: `art-direction.md`'s
"one background per game" is a per-play-field rule, and only one plate is ever fetched per case.
The splash plate is a different screen, not a fourth play field.

### 8.3 Reused from `shared/` — nothing new produced

| asset | use |
|---|---|
| `shared/assets/audio/words/<w>.m4a` × 27 | every object name, registered by `../`-path (§3.3) |
| `shared/assets/objects/<w>.webp` × 27 | identity references for the style pass, **and** the per-sprite fallback (§8.5) |
| `shared/assets/ui/btn-home.png` | splash only |
| `shared/assets/ui/btn-back.png` | case-intro · play · celebration · end |
| `shared/assets/ui/btn-sound.png` | splash · play |
| `shared/assets/ui/btn-play.png` | celebration "Next Case" · end "Play Again" |
| `shared/fonts/fredoka-latin-600-normal.woff2` | all text |
| `shared/js/{tap,sfx,speech,voice-clips}.js` | input and audio |
| `shared/data/words.json` | rime facts, read by `qa.mjs` — **never edited** |

### 8.4 Hands-off

| path | note |
|---|---|
| `assets/hub/tiles/rhyming-detective.jpg` | **User-curated. The build never writes it.** `js/hub.js:tileArt()` has no `onerror`, so a missing or overwritten tile is visible on the front page of the site. |
| `shared/assets/` | read-only for this build |
| every other game | untouched |

### 8.5 The per-sprite fallback

If a word's Storybook-Rooms style pass fails QA after two re-rolls, that **single** sprite ships as
the shared Toy Table cut-out (`../../shared/assets/objects/<w>.webp`) with a CSS
`filter: saturate(1.06)` warm tint and the standard contact shadow, so it sits in the room rather
than floating on it. Precedent: Flashlight Cave GDD §5.4. The fallback is per-sprite and per-word,
decided at build time by `config.sprites.fallbackDir`, and **the game ships even if the entire
style batch fails.**

### 8.6 Not produced, deliberately

- **No video.** The concept has no video, and Story Screen is a different world with a different
  job. Saves ~2.5 MB and the `<video>`-lifecycle bug class.
- **No background music.** The audio channel already carries a spoken word, a praise line and the
  SFX layer. Music competing with a two-word rhyme comparison would damage the only thing the game
  teaches.
- **No SFX files.** Everything tactile comes from `shared/js/sfx.js` — `pop`, `sparkle`, `tada`,
  `boing`, `whoosh`, `tick`. Zero bytes.
- **No character sheets.** The cat and the bat are game-local decoration in v1: they appear on two
  screens, they never speak in character, and they hold no gameplay role. `game.json.characters`
  stays `[]`. Promotion to `shared/characters/` is a post-playtest question, not a v1 deliverable.
- **No mode-tile art.** Composed from the shared magnifier prop, an inline SVG and CSS.

### 8.7 Departures from the mockups — every one, with a reason

**8.7.1 The canonical Detective Cat is the ORANGE tabby of mockup 01, not the grey cat of mockup
03.** The two mockups disagree: mockup 01 has an orange tabby in a deerstalker and trench coat;
mockup 03 has a grey-and-white cat in a checked cape. **Mockup 01 wins**, for three reasons:
(a) it is the title screen, so it is the first and most-seen version; (b) mockup 02's centre-stage
cat — the *target object* `cat` — is also orange, and having the mascot and the object share a
colour makes the framing legible ("the detective is looking for words that rhyme with *cat*"),
whereas a grey mascot beside an orange object reads as two unrelated cats; (c) the orange tabby
matches `shared/data/words.json`'s own `img` note for `cat` ("a cute sitting orange tabby cat"), so
the mascot and the shared library agree. **All four mascot poses derive from mockup 01's orange
cat.** `cat-cheer` takes mockup 03's *pose* and mockup 01's *character*. Logged again in
`ASSETS.md`.

**8.7.2 The sun is a distractor, not a rhyme.** Mockup 02 shows `hat` and `sun` glowing side by
side under "Find a word that rhymes with cat" — but *sun* does not rhyme with *cat*. In the game
the sun is one of case 1's two distractors and tapping it gets the gentle `no-1` path. The mockup's
glow-everything treatment is corrected at the same time: the `lit` halo is the **attract pulse and
the idle sweep**, never a permanent state, so it can never imply "this one is an answer".

**8.7.3 The -un and -og families are demoted to distractor duty.** Neither family has enough
depictable CVC nouns in the shared object library to fill a case (a target plus three rhymes), so
sun, dog and log appear only as non-rhymes. This is why the sun stays in the game at all.

**8.7.4 Every piece of functional text in the mockups is rendered as HTML, not baked art.** The
prompt banner ("Find a word that rhymes with cat"), the target word card ("cat"), the speech
bubbles ("hat", "sun"), the celebration word-pair bubbles ("cat + hat") and the end-screen labels
are **HTML Fredoka** — they are dynamic per case, must be localizable, must stay sharp at any
pixel density, and must be reachable by assistive tech. Only three decorative lockups are baked
art: `title.webp`, `great-job.webp` and `they-rhyme.webp`. The platform rule is *splash titles and
decorative lettering are generated art; functional runtime text stays HTML* (`art-direction.md`).

**8.7.5 Five to six hidden objects per scene, not the mockup's two.** Mockup 02 shows exactly two
tappable objects (hat, sun). Two is not a search — it is a two-way choice, and a child can solve it
by elimination without hearing anything. Every case ships **five** objects (3 rhymes + 2
distractors) across an **eight-zone** room, which is what makes the room read as full and the hunt
read as a hunt. The lattice supports six placements per case if a later tuning pass wants a third
distractor; `config.json` needs no schema change for that.

**8.7.6 "Next Case" and "Play Again" are labelled pills (amended in visual QC, 2026-07-31).**
The first draft of this document specified the bare shared `btn-play.png` disc on the grounds that
the audience cannot read. Visual QC reversed this: the bare 128 px disc read as a media control and
was the smallest target on the screen, while mockup 03's big blue pill is a far larger, warmer
target. The shipped control is a Fredoka-labelled blue pill ("Next Case" / "Play Again") in the
shared centre-bottom position; the label is redundant for pre-readers (position + the spoken
`next-case`/`again` lines carry the meaning) and the `aria-label` is unchanged.

**8.7.7 The green tick and the top hat of mockup 03 are dropped.** The tick is a right/wrong mark
and this game has no wrong; the found tray showing the three real objects the child collected is a
truer and warmer payoff than a generic checkmark over a generic hat. The gold field, the confetti,
the "Great Job!" lockup, the word-pair bubbles, the ribbon and the two cheering mascots — the whole
rest of mockup 03 — are kept exactly.

**8.7.8 The settings gear of mockup 01 is dropped.** There are no settings. The platform has no
settings screen, and a gear that opens nothing is worse than no gear. The top-right corner carries
the sound button instead.

**8.7.9 Mockup 02's corner assignment is NOT kept: back goes top-left, sound bottom-left.**
Mockup 02 places sound top-left and back bottom-left; `interaction-patterns.md` §8's convention is
the reverse. The convention wins (maintainer decision): a child's muscle memory for "back" must
hold across every game in the catalog, and the mockup's composition survives the swap untouched —
the top-centre banner and bottom-centre card/tray/dots stack are unaffected; the two corner
buttons simply exchange places. Logged as a mockup departure, not a convention break.

**8.7.10 The splash shows Play first, mode tiles second.** Mockup 01 has a single Play button; the
family has two modes and the platform splash idiom is a mode menu. Rather than choose, Play reveals
the two tiles (§2.3): the mockup's composition is what the child first sees, and the mode menu is
one tap away.

---

## 9. Choreography spec

Durations are the unscaled values; **every one is multiplied by `state.timeScale`**
(`fastTimers`). Curves are CSS `cubic-bezier` unless noted. Each beat lists its reduced-motion
variant; "RM" means `prefers-reduced-motion: reduce`, or the scene forced into it.

### 9.1 Tap feedback — under 100 ms, always

| t | what |
|---|---|
| 0 ms | `pointerdown`: `unlockAudio()`, `sfx.pop()`, hotspot scales to **0.94** over **80 ms**, `ease-out` |
| on `pointerup` over the element | scale returns to 1.0 over 180 ms, `cubic-bezier(.34,1.56,.64,1)` — **the action fires here** |
| on `pointercancel`, or release elsewhere | scale returns to 1.0 over 180 ms, **no action, no further sound** |

**`pointercancel` never counts as a success.** It is handled inside `shared/js/tap.js` (`onCancel`
clears the tracked pointer id), so no game code can get it wrong. The 80 ms press-down is what
makes the game feel immediate; nothing ever waits for audio.

**RM:** no scale. `sfx.pop()` still fires and the hotspot dips to opacity 0.8 and back over 90 ms.

### 9.2 Bubble pop-in

| t | what |
|---|---|
| 0 | element inserted at `scale(.6)`, `opacity 0`, transform-origin at the tail |
| 0–120 ms | opacity 0 → 1, `ease-out` |
| 0–260 ms | scale .6 → 1.06 → 1, `cubic-bezier(.34,1.56,.64,1)` |
| hold | `tuning.bubbleHoldMs` = 1400 ms after the last voice line for that bubble ends |
| fade | 240 ms opacity → 0, then removed |

A rhyme's bubble is **not** faded on this timer — it rides the flight and disappears with it. Only
`neutral` and `no` bubbles use hold-then-fade.

**RM:** 120 ms opacity fade in, no scale; hold and fade unchanged.

The same curve drives the case-intro target-sprite pop (`h.pop()`), the mode-tile reveal and the
found-tray slot fill.

### 9.3 Correct sequence — sparkle → green tint → flight → praise

| t (ms) | beat |
|---|---|
| 0 | `sfx.pop()` and the press-down of §9.1 |
| 40 | voice `word-<tapped>` starts; `neutral` bubble pops in (§9.2) |
| 260 | `sfx.sparkle()`; a sparkle ring — 12 gold dots on a circle scaling 1.0 → 1.45 — fades out over **420 ms**, `ease-out` |
| 300 | hotspot `setState('lit')`; the bubble cross-fades to tone `yes` over 120 ms — **the green tint** |
| 420 | voice `yes-N` (suppressed on the third find, §3.4) |
| 520 | `sfx.whoosh()`; `h.flyTo(traySlotRect, {ms: 620, arc: 120})` — a quadratic arc peaking 120 CSS px above the chord, `cubic-bezier(.45,0,.15,1)`, the sprite scaling to the 96 px slot; the bubble travels with it and fades over the last 200 ms |
| 1140 | flight lands: the tray slot pops (scale .7 → 1.08 → 1 over 180 ms), `sfx.pop()`, hotspot `setState('found')` |
| 1400 | voice `two-more` / `one-more` — or, on the third find, the celebration mounts instead |

Input is **not** locked during any of this: the child may tap another object at any point and the
new tap supersedes (voice stops; the in-flight animation completes on its own). The only
serialization is that two flights never target the same tray slot — slots are claimed
synchronously at t = 520.

**RM:** no sparkle ring (one 200 ms halo blink instead); no arc — the sprite fades out at source
over 180 ms and the tray slot fades in over 180 ms. Every voice beat and every state change is
unchanged, at the same times.

### 9.4 Wrong sequence — boing → wiggle → grey bubble → fade

| t (ms) | beat |
|---|---|
| 0 | `sfx.pop()` and the press-down |
| 40 | voice `word-<tapped>`; `neutral` bubble pops in |
| 300 | `sfx.boing()` (soft — **never** a buzzer); `h.wiggle({ms: 320, deg: 5})` — ±5°, two cycles, `ease-in-out`, settling upright |
| 340 | bubble cross-fades to tone `no` over 120 ms; `setState('declined')` |
| 460 | voice `no-N` (the ladder of §3.5) |
| 1240 | `setState('idle')` — `tuning.declinedHoldMs` = 900 ms after `declined` began. **The object is tappable the whole time.** |
| ~2000 | bubble fades, 1400 ms after `no-N` ends |

Nothing is removed, nothing reshuffles, no counter is shown, and `awaitingInput` is true
throughout — the child is never locked out for even a frame.

**RM:** no rotation; a 160 ms opacity dip to 0.7 and back. `sfx.boing()` and every voice beat
unchanged.

### 9.5 Case-complete celebration

Mounted the moment the third rhyme lands in the tray (§9.3, t = 1140). The play screen stays
underneath.

| t (ms) | beat |
|---|---|
| 0 | overlay fades in over **260 ms** (gold radial + 6 % sunburst rays); `scene.setEnabled(false)` |
| 120 | **confetti burst** — 34 DOM `<i>` elements, the `snack-chef/js/main.js:fillConfetti()` pattern verbatim: 6 colours, 2.2–4.2 s falls, ±18–54 px sway, seeded start offsets. Runs for the life of the overlay. |
| 200 | `sfx.tada()`; **`great-job.webp` drops in** from `translateY(-140px) scale(.8)` to rest over **420 ms**, `cubic-bezier(.22,1.2,.36,1)`; voice `great-job` |
| 700 | **left word bubble** (`<target>`) pops in (§9.2 curve, 320 ms); voice `word-<target>` |
| 900 | the `+` glyph fades in over 200 ms |
| 980 | **right word bubble** (`<lastFound>`) pops in; voice `word-<lastFound>` |
| 1300 | **`they-rhyme.webp` ribbon** slides up from +40 px and settles over **380 ms**, `cubic-bezier(.22,1.2,.36,1)`; voice `they-rhyme` |
| 1500 | **mascots bounce in** — `cat-cheer` from the left edge, `bat-cheer` from the right, 480 ms, `cubic-bezier(.34,1.56,.64,1)`, staggered 90 ms; then a 2.4 s ±8 px bob loop |
| 1750 | the three found sprites lift out of the tray to 132 px and space out across the centre, 300 ms (Mode 2: their word labels fade in here, staggered 140 ms) |
| 2000 | voice `case-closed`; the current progress dot fills (scale .6 → 1.15 → 1 over 260 ms, colour → `#7ac043`) |
| 2300 | **Next Case button** pops in (`btn-play.png`, 128 CSS px, `cubic-bezier(.34,1.56,.64,1)`, 320 ms) |
| 12000 | auto-advance, if untouched (`tuning.celebrationAutoAdvanceMs`) |

Pressing Next Case at any time from t = 2300 stops everything, speaks `next-case`, fades the
overlay over 260 ms and runs the room crossfade into the next case-intro. Back is live from t = 0.

**RM:** the overlay appears instantly; **no falling confetti** — 12 static gold sparkle dots fade in
over 200 ms instead; every element appears with a 180 ms opacity fade at its final position, at the
same times; no bob loop; the dot fills without scaling. Every voice line, the auto-advance and the
button are unchanged.

### 9.6 Room crossfade

`scene.setBackground(url, {ms: 420})`. The old plate fades out while the new one fades in on top
(`opacity`, `ease-in-out`); the old element is removed on completion. Hotspots for the new case are
added **after** the promise resolves, then run `h.pop()` staggered 70 ms in zone-index order. When
the next case reuses the same room (never in the shipping order, but legal), `setBackground` is a
no-op and the pops run immediately.

**RM:** instant swap; hotspots appear with the RM `pop()` (120 ms fade), still staggered 70 ms so
the sweep still reads as "look — things".

### 9.7 Screen transitions

| transition | motion |
|---|---|
| splash → case-intro | splash fades out 240 ms; case-intro fades in 240 ms, overlapping by 120 ms |
| case-intro → play | dim layer opacity .38 → 0 over 300 ms `ease-out`; HUD fades in over 240 ms; the intro pulse sweep (§9.8) starts at +200 ms |
| celebration → case-intro | overlay fade 260 ms, then §9.6 |
| celebration → end | the gold field stays; the lockup slides to the top over 380 ms and the five target sprites fade in staggered 120 ms |
| any → splash (back) | 200 ms fade to the splash; all audio stopped first |

**RM:** every one of these becomes an instant swap. The audio stop is unchanged.

### 9.8 Idle pulse

One **sweep** = every unfound hotspot runs `h.pulse({ms: 900, scale: 1.06})` in zone-index order,
staggered **90 ms**. Within a pulse: scale 1 → 1.06 → 1 and the `lit` halo alpha 0 → 0.85 → 0,
`ease-in-out`. The hotspot's `state` is **not** changed — `pulse()` is a transient overlay on top of
whatever state is set, so a `declined` object still pulses and still looks declined.

Sweeps fire: once on entering `play` for the first case of a session (the affordance teacher), and
on each idle tier of §3.6.

**RM:** the halo blinks to 0.85 and back over 300 ms with no scale, same 90 ms stagger.

---

## 10. Mode 2 — `sound-detective` deltas

Everything in §1–§9 holds. These are the **only** differences, and all of them are driven by the
three mode flags in `config.json` (`labels`, `shuffle`, `revealAtCelebration`) — **there is no
second code path.**

1. **No printed labels anywhere during play.**
   - The **prompt banner** shows the stem with the target word replaced by the sound glyph:
     `Find a word that rhymes with ((( )))` — the same inline three-arc SVG as the mode tile,
     44 px, `#2f6fd0`, vertically centred in the line.
   - The **target word card** shows `props/magnifier.webp` at 88 px instead of the word. Tapping
     the card (or the sound button) replays the target.
   - **Speech bubbles** carry `glyph: 'sound'` and `text: ''` — the three-arc SVG at 56 px,
     tone-coloured exactly as §5.6, so `neutral` / `yes` / `no` still read at a glance.
   - The **end screen** still shows its five word labels (the mode is over by then).
2. **The target word is spoken twice.** Case-intro: `sound-listen` → `word-<target>` → **400 ms** →
   `word-<target>`. Sound button: `sound-again` → `word-<target>` → 400 ms → `word-<target>`.
3. **Placements are seeded-shuffled across all eight zones** (§4.6), so the positions the child
   memorized in Mode 1 do not transfer.
4. **Words are revealed at the celebration.** At overlay t = 700 / 980 the two word bubbles show the
   printed words exactly as in Mode 1 — this is the mode's payoff, the moment the sound the child
   has been holding in their head gets a spelling. At t = 1750 the three lifted found sprites each
   gain an HTML label beneath them (Fredoka 600 / 40 px, `#123a6b`), fading in staggered 140 ms.
5. **The mode intro** is `mode-sound-detective`, which names the difference out loud ("This time you
   have to listen very carefully").

Everything else — the rooms, the cases, the rhymes, the distractors, the sizes, the idle ladder, the
no-ladder, the celebration choreography, the HUD, `QLOBE_DEBUG` — is identical.

---

## 11. Registration & QA hooks

### 11.1 `game.json` — final content

**Phase 2 writes this file, not Phase 0.** It is specified here so the integration agent has no
decisions left. `games.json` mirrors `title`, `category`, `age`, `status`, `accent`, `modes` and
`characters`, and owns only `path`, `icon`, `uses[]`, `summary` and ordering — never hand-edit a
mirrored field. Run `node tools/pipeline/sync-games-registry.mjs --write --only rhyming-detective`,
then `--check`.

```json
{
  "id": "rhyming-detective",
  "title": "Rhyming Detective",
  "category": "reading-phonics",
  "path": "games/rhyming-detective/",
  "icon": "🔍",
  "entry": "index.html",
  "age": { "min": 3, "max": 6 },
  "status": "beta",
  "accent": "#2f6fd0",
  "engine": "rhyming-detective (game-local js/game.js + shared/js/hotspot-scene.js)",
  "shareTitle": "Rhyming Detective — Hidden-Object Rhyme Hunt for Little Sleuths",
  "description": "Search a cosy room for the words that rhyme with the target word. Tap anything and it says its name; find all three rhymes to close the case. Five cases, two modes, no reading required. Ages 3–6.",
  "learningGoals": [
    "Hear that two spoken words share an ending sound",
    "Reject a word that does not rhyme, not just recognize one that does",
    "Meet the -at, -an, -ug and -et rhyming families as whole word groups",
    "Connect a spoken word to its printed form, then do it again without the print"
  ],
  "interactionModel": "tap hidden objects in an illustrated room; every tap speaks the object's name in a speech bubble; three rhymes close the case",
  "feedbackModel": "A rhyme sparkles, turns green, flies into the evidence tray and earns a spoken cheer. A non-rhyme gets a soft boing, a wiggle, a gentle spoken line, and stays tappable — nothing is ever removed and nothing can be failed.",
  "uses": [
    "shared/js/hotspot-scene.js",
    "shared/js/voice-clips.js",
    "shared/js/speech.js",
    "shared/js/sfx.js",
    "shared/js/tap.js",
    "shared/assets/audio/words/",
    "shared/assets/objects/",
    "shared/assets/ui/",
    "shared/data/words.json",
    "shared/fonts/fredoka-latin-600-normal.woff2"
  ],
  "modes": [
    { "id": "rhyme-hunt",      "title": "Rhyme Hunt",      "skill": "finding words that rhyme with a target word, with the words printed" },
    { "id": "sound-detective", "title": "Sound Detective", "skill": "finding rhymes by ear alone, with no printed words" }
  ],
  "license": { "code": "MIT", "assets": "CC-BY-4.0" },
  "credits": "Kaigani; shared QLOBE Kids object-card art and teacher voice. Built with Claude Code for QLOBE Kids.",
  "characters": [],
  "conceptVideo": null
}
```

**Changes from the stub, explicitly:** `age.min` 5 → **3**; `accent` `#2d7dd2` → `#2f6fd0` (the
mockups' detective blue); `modes` `classic`/`tricky` → `rhyme-hunt`/`sound-detective`; `uses[]`
loses `shared/js/engines/match-pairs.js` and gains the ten entries above; `engine` added;
`description`, `interactionModel`, `feedbackModel` and `learningGoals` rewritten to the real game.
**Unchanged:** `id`, `title`, `category`, `path`, `icon`, `entry`, `status: "beta"`, `license`,
`characters: []`, `conceptVideo: null`.

After `game.json` lands: `node tools/build-usage-index.mjs` to regenerate
`shared/data/usage-index.json`.

### 11.2 `tools/qa.mjs` — required coverage

Drafted from `games/snack-chef/tools/qa.mjs`. Playwright from `/private/tmp/pw/node_modules`,
**`channel: 'chrome'`** (the bundled Chromium cannot decode m4a and fails every audio assertion
silently), the whole run wrapped in `caffeinate -dims`. Base URL defaults to the local server and
accepts `--base https://qlo.be` for the production re-run.

**Static assertions (no browser):**

1. `config.json` parses; every §6.1 invariant holds.
2. Rime truth **derived from `shared/data/words.json`**, not from this document: every rhyme's rime
   equals the target's; **no distractor shares a rime with the target or with the other
   distractor**; all 27 words exist in `words.json`.
3. Every referenced file exists: 27 sprites, 3 room plates, the splash plate, the title, 2 lockups,
   4 mascots, the magnifier, the og-image.
4. **Asset budgets**: plates ≤ 300 KB, `title.webp` ≤ 150 KB, sprites 30–80 KB, mascots ≤ 90 KB,
   magnifier ≤ 70 KB, lockups ≤ 90 / 60 KB, og-image ≤ 200 KB.
5. `data/lines.json` has an entry for all 24 new keys **and** all 27 `word-<w>` keys.
6. `assets/audio/manifest.json` resolves: every local file exists on disk; every `../`-path shared
   entry exists at that path.
7. **No emoji** in `index.html`, `css/style.css`, `js/*.js`, `config.json` or `data/lines.json`
   (regex over the emoji ranges). `game.json`'s `icon` is the sole allowed occurrence and is not
   scanned.
8. Every path in the shipped source is **relative and lowercase**; no absolute URL, no domain.

**Browser assertions, per mode, at 1194 × 834, 834 × 1194 and 1180 × 520, and once more with
`prefers-reduced-motion: reduce`:**

9. The splash paints; `QLOBE_DEBUG.ready` resolves; `listModes()` returns both modes.
10. **No audio before the first gesture** — `getAudioLog()` is empty until the first `pointerdown`;
    after tapping Play it contains `welcome` with `kind: 'clip'`.
11. `startMode(id)` → `getState()` reports the right screen / mode / case; the case-intro
    auto-advances under `fastTimers(.05)`.
12. `getTargets()` returns 6 entries (5 hotspots + `target`), roles truthful; **every `rect` is
    ≥ 96 CSS px on both axes**; so is every HUD button.
13. **Wrong-tap probe:** `tap('<distractor>')` → `{accepted: false, role: 'wrong'}`; `found` is
    unchanged; the hotspot returns to `state: 'idle'` within 1.5 s and is **still tappable**;
    `awaitingInput` is true throughout.
14. **Found objects are inert:** `tap()` on an already-found rhyme → `{accepted: false}`, and
    `found` does not grow.
15. **Recorded-voice assertion:** after a correct tap, `getAudioLog()` contains a `kind: 'clip'`
    entry for `word-<w>` and one for a `yes-*` key — proving the recorded channel rather than the
    Web Speech fallback. Repeated for the case prompt and for `great-job`.
16. A full case by hand (`tap` each rhyme), then `winRound()` for the rest → `screen ===
    'celebration'`; the number of filled dots equals `caseIndex + 1`.
17. `nextCase()` five times → `screen === 'end'`; all five dots filled.
18. Replay: end → Play Again → splash → the other mode → one full case. **One page load for the
    whole run** — that is what `home()` is for.
19. `seed(42)` twice produces byte-identical `getZones()` output; two different seeds produce
    different Mode-2 placements.
20. `getLayout().layout` is `'wide'` at 1194 × 834 and `'compact'` at 834 × 1194 and 1180 × 520; at
    every viewport **no `getTargets().rect` overlaps any `getLayout().reserves` rect by more than
    25 %**.
21. Reduced motion: `getState().reducedMotion === true`, and **both modes still complete, still
    speak and still celebrate**.
22. **Zero unexpected page errors, zero failed requests, zero remote requests** across the whole run.
23. Screenshots of **every state** (splash · splash-with-tiles · case-intro · play · bubble-neutral ·
    bubble-yes mid-flight · bubble-no · celebration at t = 2400 · end) **× 2 orientations ×
    reduced-motion on/off**, written to `qa-shots/`. Phase 3d reviews them at full size; state
    assertions cannot see a *look* (`interaction-patterns.md` §12).

### 11.3 The verification ladder (from the plan, unchanged)

1. `git diff --check`; `node --check` on every new JS file; `node tools/validate/run.mjs` (baseline
   first, then zero new errors).
2. `sync-games-registry.mjs --check` clean; the `games.json` diff is tool-generated only.
3. Local server: the hub lists the game, both modes hand-played, zero console errors, zero 404s,
   **no audio before the first gesture**.
4. `node games/rhyming-detective/tools/qa.mjs` green.
5. Visual QC: every captured screenshot reviewed at full size — hierarchy, clipping, alpha fringes,
   bubble legibility over busy art, safe areas.
6. Production: push → `gh run watch` → re-run `qa.mjs --base https://qlo.be` → inspect the
   production screenshots. GitHub Pages is case-sensitive and the CDN lags up to ~11 minutes.
7. **Child playtest gate before `status: live`.** The game ships `beta`.

---

## 12. Open risks this design knowingly carries

1. **Are the hotspots read as findable?** The whole game depends on a three-year-old understanding
   that things in the room are touchable. The supports are the idle pulse sweep on first entry, the
   `lit` halo and `hint-look` at 18 s. If playtest shows children not touching anything, the fix is
   to leave all five hotspots in `lit` for the first case rather than pulsing them — a one-line
   change, but it costs some of the hunt.
2. **Bubble legibility over a busy room plate.** A 44 px cream bubble over red brick with a painted
   highlight is the classic failure. Mitigated by the 5 px border, the drop shadow and the "calm
   zone surfaces" art brief (§8.1) — and it is a screenshot-review item, not a state assertion, so
   §11.2 item 23 is the only thing that can catch it.
3. **Mockup extraction damage** on `title.webp` and the mascot edges (letter fringing, chewed ears).
   Seed ladder 42 → 1337 → 9001 → 7; the fallback is a fresh in-world lockup generated from scratch
   rather than extracted.
4. **`vet` is a person and `ten` is a number.** Both are legal `words.json` nouns with shared
   sprites, but neither is naturally a thing in a kitchen. §4.2 fixes each as a framed photo and a
   fridge magnet; if the art reads badly, the honest fix is to swap the *distractor* (`ten` → another
   non-`et` noun) rather than the rhyme, since `vet` carries the rime.
5. **The compact layout is a grid, not a room.** In portrait and at extreme aspects the objects sit
   on a 4 × 2 lattice instead of on shelves and floors, which weakens "these things belong here".
   Accepted for v1; the alternative was authoring three portrait plates. Watch it in the iPad
   portrait screenshots.
6. **Two modes may not be enough family.** The plan defers odd-one-out; if the game feels thin after
   playtest, that mode is the first addition, and this document's zone lattice, config schema and
   scene API all support it unchanged.
7. **`hotspot-scene.js` is new with no existing consumers**, so there is zero regression risk to
   other games — but also zero prior art for its bugs. `hotspot-scene.test.html` (§5.9) is the whole
   mitigation, and it must land before WP1b integrates.
