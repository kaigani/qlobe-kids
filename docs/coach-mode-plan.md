# Coach Mode — interaction design & framework implementation plan

**Status:** in progress — Phase 1 done 2026-09-06 (wave-1 five games QA'd and
promoted to beta); Phase 2 engine work done (recorded-voice channel +
`getAudioLog`, wave-1 clips produced via local-genai, configs converted to
`config.json` + shim); Phase 3 done except helper adoption (beat model
`setup`/`do`/`hold` + normalizer landed, 13 legacy configs + test page verified
clean; idle-nudge/hud helper adoption deferred — the hand-rolled versions
already match behavior and swapping them buys no user-visible change).
Phase 4 engine work done (presenter slot `dial`/`image`/`video` on the signal
machinery, persona-select screen, never-blocks video loader, persona
greet/cheer clips, `listPersonas`/`selectPersona`/`presenter`/`persona` debug
extras — all proven on `coach-timer.test.html` fixtures borrowing RGL caller
assets); Phase 4's "one new production game with a video coach" and all of
Phase 5 (conversions, optional RGL migration) remain future content work. · **Scope:** `shared/js/engines/coach-timer.js` + 13 authored
coach games + `games/red-green-light/` learnings · **Audience:** the agent/contributor
who builds this, and the maintainer deciding sequencing.

Coach Mode is the reusable shell for **real-world movement, practical-life, and
nature activities**: the tablet is not the game — it is the coach. It narrates
steps, runs timers, calls signals, and celebrates, while the child moves, pours,
sweeps, balances, and explores in the physical room. Prop the tablet up; the
child is *away from the screen* most of the time, and that is the design center,
not an edge case.

---

## 1. Where we actually are (audit, 2026-09)

The most important planning fact: **Coach Mode already exists in code and in
content.** This plan is an *evolution and completion* effort, not a greenfield
build.

### 1.1 The engine

`shared/js/engines/coach-timer.js` (~1,030 lines) is the coach shell today,
described in `shared/js/engines/README.md` as *"guide a real-world activity:
spoken steps + timer + checklist."* It follows the full engine contract
(`createGame(config, mountEl)`, `screens.js` router, `installDebug`,
`installEngineStyles`, `qk-eng-*` skin) and supports two mode types:

- **`type: 'steps'`** — a sequenced checklist. Each step has `say`, optional
  `timerSec` (Pixi countdown dial with last-3-seconds ticks), optional `after`
  line; the current checklist row itself is the ≥96px "done" tap target.
- **`type: 'signal'`** — cyclical timed states (`{ say, color, sfx, art,
  durSec: [min,max] }` × `rounds`) — the red-light-green-light shape. **This
  path has zero production consumers**; it survives only in
  `shared/js/engines/coach-timer.test.html`.

### 1.2 The content backlog riding on it

**13 games are fully authored against coach-timer** — complete `config.js` step
scripts, `game.json`, mini-GDD `game-design.md`, and an `ASSETS.md` whose
"Voice lines" section transcribes every spoken line verbatim (a ready recording
script). All are `"status": "in-design"`, all `type: 'steps'`, all emoji
placeholder art, all speaking via Web Speech only:

| Category | Games |
|---|---|
| movement-outdoor | `balance-beam-trail`, `line-walking-challenge`, `animal-walk-cards`, `trail-counting-walk`, `nature-scavenger-hunt` |
| practical-life | `pouring-station`, `sweep-the-trail`, `shelf-reset-game`, `plant-care-captain` |
| culture-geography | `local-nature-guide`, `neighborhood-map-walk` |
| sensorial-science | `melting-race` |
| social-emotional | `waiting-muscle-game` |

### 1.3 The bespoke exemplar that left the engine

`games/red-green-light/` (live) is the signal archetype done *right for kids* —
and it is a game-local fork (`js/game.js`, ~717 lines, engine id `caller-cues`).
Its own header comment explains why it left: *"coach-timer … is shared by 22
games and can't be taught video."* What it has that the engine lacks:

- **Video-puppet callers** — 8 personas (`js/callers.js` roster with a `ready`
  flag), each with poster + `idle/green/red/yellow` video loops + recorded
  `greet`/`cheer` clips; a caller-select screen before mode select; lazy
  per-caller asset loading.
- **Motion semantics** — `motion: 'loop'` (keep bopping = keep moving) vs.
  `'hold'` (freeze on last frame = freeze your body). First/last frames match
  the idle pose so clips hand off seamlessly.
- **Room-readable signal** — a 12px full-frame color border + glow driven by the
  state color, legible from across the room.
- **Recorded voice** via `voice-clips.sayFile()` with `speech.js` fallback and a
  never-blocks video loader (2,600 ms ready race → poster + TTS fallback).
- A CSS `scaleX` time bar instead of the Pixi dial.

It also *re-implements* what the engine already had (screens flow, idle
re-prompt, pause-restarts-the-beat, `durSec` sampling pinned under seed, the
debug surface "mirroring coach-timer"). That duplication is the cost of the fork
and the argument for folding it back.

### 1.4 Adjacent games and near-duplicates

- `freeze-focus-dance` (music→freeze; contributed `shared/js/camera-motion.js`),
  `cleanup-timer-quest` (own countdown implementation), `obstacle-course-builder`
  (build-then-perform station prompts, "choose your world" personas) — bespoke
  games that each hand-roll a slice of the coach loop.
- `smell-jars` (observe-journal) and `plan-do-review` (choose-one) have real-room
  "go do it" phases that a coach wrapper could serve better — conversion
  candidates, not blockers.
- `docs/game-queue.md` already tags "coach mode candidates"; nearly all are now
  authored (§1.2). The four concept folders with no repo counterpart
  (`happy-ripe-fruit`, `puppet-patience-theater`, `song-story-remix`,
  `word-builder`) are **not** Coach Mode material.

---

## 2. Interaction design

### 2.1 The coach loop (one beat)

```
cue (sfx beat → spoken line, recorded voice)          ← audio is the instruction
  → the child ACTS IN THE ROOM (screen shows the      ← big presenter surface +
    presenter: dial / video / picture + state color)     optional countdown
  → check-in: "done" tap  OR  timer elapses           ← self-paced vs. timed
  → praise line + sparkle                             ← every beat ends warm
→ next beat … → cheer + tada + end card (AGAIN / back)
```

Design positions, stated explicitly because Coach Mode stretches the canon:

1. **Audio carries 100% of the instruction** (philosophy #4). On-screen step
   text exists for the supervising adult and for QA — never required by the
   child. Recorded teacher/persona voice is the primary channel
   (interaction-patterns §2); Web Speech is only the fallback.
2. **"Away from the screen" is the normal state, not idleness.** The stock idle
   nudge (§17) assumes the child should be touching the screen. Coach Mode beats
   declare their expectation: a timed `hold` beat suppresses the nudge entirely
   (the child is *supposed* to be running); a self-paced `do` beat lengthens it
   (first ≈ 20 s, gentle, once) since real sweeping takes a while. Never a
   countdown, never a "too slow" sound.
3. **The loop unit is the beat, not the session.** Beats of 60–180 s
   (`shelf-reset-game`'s 3-minute "full attention" step) legitimately exceed the
   30–90 s loop rule; the session (4–6 beats) is the 3–7 min unit. Document this
   as the sanctioned exception to philosophy #5, and note Coach Mode is the
   deliberate far edge of philosophy #8 ("digital-only, body-aware").
4. **Room-readable state.** Every timed/signal beat drives a full-frame color
   (RGL's border+glow pattern) plus a large presenter visual, so state reads
   from 3–4 meters. The countdown visual (dial or bar) is ambient pacing
   information, not a threat — soft breathing pulse, one tick per second only in
   the final 3 seconds.
5. **Adults are first-class.** Many activities need setup (tape line, pitcher of
   water, a spotter). A typed setup beat is addressed to the grown-up, untimed,
   and skippable on replay — today it's an untyped prose convention ("Ask a
   grown-up to…") the shell can't distinguish.
6. **No fail state, ever.** Nothing in this family punishes; RGL has no "you
   moved on red." Pause restarts the current beat from the top (both existing
   implementations chose this on purpose — a partial interval resumed mid-line
   is more confusing than a fresh call).
7. **Navigation per §8:** home only on the splash (enforced as a DOM invariant),
   back on deeper screens, hear-it-again bottom-left behind `soundDebounce(600)`,
   AGAIN big and centered on the end card.

### 2.2 The beat model (the key schema change)

Replace the per-mode `type: 'steps' | 'signal'` dichotomy with a **per-beat
kind**, which subsumes both and unlocks hybrids neither can express today
(e.g. sweep-the-trail's checklist ending with a 30 s "dance while you admire it"
signal window; a warm-up `hold` before animal-walk's self-paced poses):

| beat kind | advances by | timer | nudge | today's equivalent |
|---|---|---|---|---|
| `setup` | done tap | none | long, adult-worded | untyped first step |
| `do` | done tap | optional soft `timerSec` | ≈20 s, once | `steps` step |
| `hold` | auto after `durSec: [min,max]` | always | suppressed | `signal` state |

Sequencing: a mode is `beats: [...]` plus optional `rounds` (repeat the trailing
cycle of `hold` beats N times — the RGL classic/silly shape). Random `durSec`
sampling stays pinned to `min` under `seed()`.

### 2.3 The presenter slot

What the child sees across the room becomes pluggable instead of engine-forking:

- **`dial`** (default, today's Pixi ring + art card) — steps games.
- **`video`** — RGL's caller pattern: per-persona clip per beat
  (`videoKey`), `motion: 'loop' | 'hold'`, poster + TTS fallback on load
  failure, `blessMedia()` autoplay unlock inside the first gesture.
- **`image`** — a full-bleed picture card (activity cards, animal poses) — the
  cheap middle tier between emoji and video.
- All presenters receive the same beat facts: state color (drives the frame),
  art ref, cue line, remaining/total time.

### 2.4 Persona ("pick your coach")

Optional roster screen before mode select, generalized from
`red-green-light/js/callers.js` + `renderSelect()`: `personas: [{ id, name,
accent, ready, poster, video?, audio: { greet, cheer } }]`, lazy per-persona
loading, `ready: false` keeps unbuilt personas out of the grid. A game with no
`personas` skips the screen entirely (all 13 current games). This is the repeat-
play hook RGL proved ("pick mine!") and the natural home for recorded voice
sets.

---

## 3. Framework architecture

**Decision: extend `coach-timer.js` in place. Do not write a new engine.**
It already owns screens, checklist, clock, celebration, skin, and the debug
surface; 13 games inherit every improvement for free; and the engine contract
(`shared/js/engines/README.md`) already allows everything we need — notably
`../voice-clips.js`, provided init stays lazy.

### 3.1 Engine work items

1. **Recorded voice channel.** Route all speech through a small internal
   speaker with the narrator's monotonic-token semantics (an interrupted line
   never wakes up over a newer one): accepts a plain string (Web Speech, exactly
   today's behavior) or a line object `{ clip | seq, text }` per the platform
   clip-ref grammar, plus persona `sayFile` clips. `voice-clips.init()` only if
   a config declares `voice.clips` — lazy-network contract intact. **This is the
   single highest-value change: it upgrades all 13 games from system TTS to the
   warm recorded voice the platform calls primary.**
2. **Beat model** (§2.2). Internally, normalize legacy configs on load:
   `type:'steps'` → all-`do` beats; `type:'signal'` → all-`hold` beats + rounds.
   **The 13 existing configs and the test fixture must run byte-identically with
   zero edits** — this is the compatibility gate.
3. **Presenter slot** (§2.3): extract today's dial rendering behind a presenter
   interface; add `video` (port RGL's `showCue`/`loadVideo`/`blessMedia`, keep
   the 2,600 ms never-block race) and `image`. Add the room-readable frame
   (state color border + glow) for `hold` beats in every presenter.
4. **Persona select screen** (§2.4), optional, before mode select. Back-routing
   becomes two-level where personas exist (mode → select), per RGL's `onBack()`.
5. **Adopt the shared helpers it currently re-implements:** `idle-nudge.js`
   (with the per-beat-kind policy from §2.1.2), `hud.js`'s `soundDebounce` and
   `progressDots`, and keep the one deadline-based clock (scale the **deadline**,
   never the wake — the `fastTimers()` JSDoc trap) with `visibilitychange`
   resync (child walks away, screen locks, comes back: audio latch and clock
   both recover).
6. **Debug surface additions** (keep `version: 1`, extras on top per the
   README): `listPersonas()`, `selectPersona(id)`, `getAudioLog()` (clip vs.
   speech — QA's proof the recorded voice played), plus `getState()` gaining
   `beatKind` and `presenter`. `mute()` must silence stray `<video>` elements
   too (RGL already does).

### 3.2 What stays out (for now)

- **Migrating `red-green-light` onto the engine.** It is live and loved; port
  its *patterns*, not the game. Once the engine's `video` presenter + personas
  are proven by a new game, RGL migration becomes an optional cleanup PR with
  its 8 callers as the acceptance test.
- **Camera/motion detection** (`shared/js/camera-motion.js`) — freeze-focus-dance
  proves it, but it's an optional garnish, not shell infrastructure. Presenter
  hook can expose it later.
- **Journaling/photo check-ins** — that's `observe-journal.js`'s territory;
  a `do` beat that launches a journal moment is a future bridge, not v1.
- Streak/daily-routine persistence for `plant-care-captain` — noted as the
  strongest recurring-use candidate, deferred until the shell ships.

### 3.3 Config schema (v2, additive)

```js
export default {
  engine: 'coach-timer',
  id: 'sweep-the-trail', title: 'Sweep the Trail', splashEmoji: '🧹',
  theme: { world: 'field-journal', background: './assets/bg.jpg' },
  voice: {
    intro: { clip: 'clip:intro', text: 'Ranger! The trail needs you!' },
    praise: 'Beautiful sweeping!', cheer: 'The trail is clear!',
    clips: { manifest: './assets/audio/manifest.json' }   // opt-in → lazy init
  },
  personas: [ /* optional; omit to skip the select screen */ ],
  modes: [{
    id: 'tape-square', title: 'Tape Square', presenter: 'dial',
    beats: [
      { kind: 'setup', say: 'Ask a grown-up to tape a square on the floor.', art: 'emoji:📦' },
      { kind: 'do', say: 'Sweep the edges toward the middle!', timerSec: 60, art: 'emoji:🧹' },
      { kind: 'do', say: 'Little strokes for the corners.', timerSec: 30 },
      { kind: 'hold', say: 'Freeze and admire your clean floor!', durSec: [4, 6],
        color: '#58a945', sfx: 'tada' },
    ],
  }],
};
```

New games use `config.json` + the `templates/stub-game/` fetch shim so QLOBE
Studio can edit them; the 13 legacy `export default {…}` configs keep working
read-only until individually converted (a mechanical, per-game follow-up).

---

## 4. Implementation phases

Each phase is shippable on its own; order chosen so content value lands early.

### Phase 1 — Ship what's authored (no engine changes)
Playtest + QA the 13 in-design coach games exactly as written on today's
engine: run each mode end-to-end (`QLOBE_DEBUG.fastTimers()` drivers), fix
config-level issues only, generate hub tiles + `bg.jpg` where missing
(local-genai), register/sync (`node tools/pipeline/sync-games-registry.mjs`),
promote to `beta`. Suggested first wave (one per category, strongest scripts):
`sweep-the-trail`, `animal-walk-cards`, `pouring-station`,
`nature-scavenger-hunt`, `waiting-muscle-game`.
*Exit:* 5+ coach games live-in-beta on the hub, TTS voice, emoji art.

### Phase 2 — Voice upgrade (engine item 1)
Add the line-object/clip speaker to coach-timer; record the voice scripts
already transcribed in each game's `ASSETS.md` via the local-genai pipeline
(one warm teacher voice first; personas later); convert the wave-1 games'
`say`/`praise`/`cheer` strings to `{ clip, text }` objects.
*Exit:* wave-1 games speak in recorded voice; `getAudioLog()` asserts
`kind: 'clip'` in QA; a config with no clips still makes zero network calls.

### Phase 3 — Beat model + shared-helper adoption (engine items 2 & 5)
Land `beats`/`kind` with the legacy-config normalizer, the per-kind nudge
policy, and the idle-nudge/soundDebounce/progressDots adoption.
*Gate:* all 13 legacy configs + `coach-timer.test.html` byte-identical behavior;
add a hybrid-mode fixture to the test page.

### Phase 4 — Presenters + personas (engine items 3, 4, 6)
Extract the presenter interface; port the video presenter and persona select
from RGL; add the room-readable state frame. Prove it with **one new game**
that needs it — recommended: **`freeze-focus-dance`-style "Coach Says"** or a
signal mode added to `animal-walk-cards` ("when the music stops, hold your
bear pose!") — before touching RGL itself.
*Exit:* a live engine game with a persona select + video coach; the `signal`
path finally has a production owner.

### Phase 5 — Expansion
- Convert `plan-do-review`'s "do" phase and `smell-jars`' real-kitchen rounds to
  coach beats (wrapper modes, not rewrites).
- Optional: migrate `red-green-light` onto the engine (its 8 callers are the
  acceptance test); fold `cleanup-timer-quest`'s countdown onto the shared clock.
- New concepts from the queue as pure config work; persona voice sets per world.

---

## 5. QA & acceptance checklist (applies every phase)

- Zero console errors/404s; touch-tested; portrait + landscape;
  `prefers-reduced-motion` honored (dial pulse, confetti, flying check all no-op).
- Audio unlock survives iPadOS app-switch/lock (`visibilitychange`/`pageshow`
  latch); nothing speaks before first gesture; interrupted lines never resume.
- `QLOBE_DEBUG` v1 floor + coach extras; `winRound()` drives every beat kind;
  `seed()` pins `durSec` to min; `fastTimers()` scales deadlines (a step must
  still advance).
- §8 navigation invariants (home only on splash — checked by the QA drivers).
- Playwright voice assertions run on `channel: 'chrome'` (bundled Chromium has
  no AAC decoder for `.m4a`).
- Real-kid playtest per `docs/design-process.md` — for Coach Mode specifically:
  can the child follow a full mode **with the tablet propped 3 m away and
  without an adult re-reading the screen?**

## 6. Risks / open questions

- **Engine blast radius:** coach-timer will go from 13 quiet consumers to the
  platform's real-world spine; the legacy-config normalizer and the test page
  are the safety net — treat Phase 3's byte-identical gate as hard.
- **Video weight:** per-persona clip sets are the heaviest assets in the repo
  (RGL ships 8 × 4 videos). Keep personas lazy-loaded and `ready`-gated; most
  coach games should stay on `dial`/`image` presenters.
- **Voice production volume:** ~16 lines × 13 games. Mitigation: one shared
  teacher voice first (Phase 2), personas only where a game earns them.
- **Studio editability:** legacy `export default` configs are read-only in the
  studio; conversion to `config.json` is desirable but per-game and low-risk —
  don't block engine phases on it.
- Open: should `hold` beats support music tracks (freeze-dance) as a fourth
  audio channel under the spoken line? Leaning yes, as a per-beat `sound` ref
  following build-assemble's `{ src, volume }` precedent.
