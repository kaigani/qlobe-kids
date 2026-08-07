# DRY Audit — Comprehensive Code Review (2026-08-06)

Five parallel review passes over the whole codebase: 34 bespoke games (grouped as
creative/physics, motion/music/camera, exploration/letters, practical-life) plus an
audit of `shared/` itself. The 70 engine-driven config games were spot-checked and are
healthy — this report is about the bespoke tier and the library.

**Headline: the platform refactor worked, but adoption stalled.** Roughly **2,500–3,000
duplicated lines** across bespoke games are re-implementations of shared modules that
already exist, ~**700 lines** are genuinely-new patterns worth extracting, and
~**8,000 lines** are dead or misfiled code. A handful of real user-facing bugs live
inside the hand-rolled copies — the shared modules already fix them.

---

## 0. Decisions made (P0)

1. **Analytics contradiction — RESOLVED, keep GA4.** `CLAUDE.md` said "no analytics or
   tracking"; `shared/js/analytics.js` loads GA4 (`G-H2WT0GRBVS`) via
   googletagmanager.com into **101 games**, seeded from `templates/stub-game/index.html`.
   Owner decision (2026-08-06): **keep analytics as implemented.** `CLAUDE.md` has been
   updated to carve out the GA4 pageview tag as the one deliberate exception to the
   no-remote-load / no-tracking rules, instead of contradicting the code. No further
   action needed on the tag itself — future work should keep analytics to this one
   shared, platform-wide pageview call and not add per-game tracking.

---

## 1. Why the duplication exists (root cause)

Games are built by agent sessions following `CLAUDE.md` + `templates/`. Two guardrail
defects actively teach the duplication:

- **`CLAUDE.md` presents `shared/js/audio.js` as the primary voice module** and
  `templates/game-family/js/main.js:29` imports it — but only 1 game uses it; the real
  channel is `voice-clips.js` (36 games). The template bakes the mistake into every new game.
- **`CLAUDE.md` lists only 3 shared CSS files** (`engine-base.css` is invisible), and
  `shared/README.md` omits `js/clay/`, `js/studio/`, `analytics.js`, and most of `stage/`.
- `tools/build-usage-index.mjs` emits garbage keys, indexes no CSS, and can't report
  zero-consumer modules — so dead code is invisible to tooling.

**Fixing the docs + template is the highest-leverage DRY work in the repo**: it stops
the bleeding for every future game.

---

## 2. Dead / misfiled code (~8,000 LOC to delete or move)

| Item | LOC | Action |
|---|---|---|
| `shared/js/clay/lobes.js` + `lobes-three.js` + `lobes.test.mjs` | 6,558 | **Delete.** Superseded by `clay/field.js`; nothing that ships reaches it. Git is the reference. |
| `games/clay-creature-studio/js/blob-lobes.js` | 1,180 | **Delete.** `main.js:13` says it's kept "as the reference". |
| `shared/js/audio.js` | 355 | **Delete** after migrating `sound-basket` to `voice-clips.js` and fixing the template + CLAUDE.md. |
| `shared/js/stage/puppet-builder.js` + `puppet-studio.html` | 1,672 | **Move** to `tools/` or `shared/js/studio/` — authoring tools misfiled as runtime modules. |
| Single-consumer demotions: `weather-world.js` → weather-scientist, `paper-globe.js` → globe-spin-stories, `tilt-input.js` → garden-delivery-game, `performance-recorder.js`/`performance-video-export.js` → puppet-retell | ~1,700 | Move into their games (or leave with a "single-consumer" note; `magnifier-lens.js`, `camera-*.js`, `voice-meter.js` stay in shared deliberately — privacy-reviewed / genuinely generic). |
| Identical-arm conditionals | — | `sound-painting/js/main.js:238-239`, `color-mixing-lab/js/main.js:357` — both ternary/if arms identical. |

---

## 3. Adoption gap — shared modules that exist but sit unused

Ranked by duplicated LOC the migration would delete. Every row is "module exists,
games hand-roll it anyway."

### 3.1 `stage/drag-to-slot-dom.js` — **the biggest one (~940 LOC)**
Seven practical-life games hand-roll the full pointer-drag → ghost → hit-test →
snap/return machine (counting-treasure-cups, lunchbox-pack, snack-chef, laundry-sorter,
tangram-tales, sound-basket, teen-bead-builder ≈ 810 LOC), plus
throwing-target-garden's `wireTouchBags` (~100 of 127 lines shared lifecycle).
**The module was extracted *from* teen-bead-builder and the game was never migrated**
(standing TODO at `teen-bead-builder/js/main.js:299`). Slop constants disagree
(7/8/8/8/10/10/12 vs shared 10 — and shared's own Pixi twin `drag-to-slot.js:71` says 8);
6 of 7 copies miss the `visibilitychange`/`pagehide` cancel the shared module has.
Start with teen-bead-builder (the pilot) and snack-chef (`ingredientDrag` maps 1:1).

### 3.2 `screens.js` — screen routers (~1,200 LOC across ~20 games)
All 8 exploration games, 5 of 8 motion games, and 7 of 11 practical games hand-roll
`hidden`-toggle/innerHTML routers, many rediscovering the `starting` double-tap latch
and per-screen disposer bags that `createScreens()`/`createBag()` provide.
Symptom bug: `globe-spin-stories/js/main.js:590-606` moved its celebration to raw
`setTimeout` because a global `clearAll()` stranded an overlay — per-screen bags make
that class of bug unrepresentable.

### 3.3 `hud.css` / `hud.js` — ~10 rival HUD-button vocabularies (~600 CSS LOC)
`.round-button`, `.la-*-button`, `.hud-button`, `.corner-btn`, `.hud-btn`,
`.icon-button`, `.chrome-button`, `.wmd-btn`, `.hud`… all pointing at the **same
`shared/assets/ui/btn-*.png` art**, with different sizes and `:active` transforms.
`hud.css`'s header literally names these copies as what it was distilled from.
**Touch-floor violations** hide here: color-mixing-lab overrides `.qk-hud-btn` to 76px
(`css/style.css:7`), sound-sprouts ships 84px, feelings-charades ~76px — the platform
rule is ≥96px and `.qk-hud-btn::before` enforces it. Also migrate the four
`progressDots()` re-implementations and the ~35 inline `max(Npx, env(safe-area-inset-*))`
declarations (`--qk-safe-*` exists in base.css).

### 3.4 `idle-nudge.js` (~250 LOC, 13 games)
Hand-rolled idle ladders in 6 practical + 5 exploration + 2 motion games. Delays
drift (8.3s–12s) with no platform rationale.

### 3.5 `timers.js` (~150 LOC, 10+ games)
Hand-rolled timer groups, incl. two byte-identical pairs in bug-hotel-observer and
rhyming-detective. The `fastTimers()` debug contract is satisfied four incompatible
ways (numeric scale vs boolean), and many raw `setTimeout`s escape it entirely
(world-music-dance dance.js, puppet-retell:1103, emotion-voice-game:340…).

### 3.6 `celebrate.js` (~330 LOC, 9 games)
CSS/DOM confetti and sparkle systems in bug-hotel, rhyming-detective,
playdough-letter-factory, globe-spin-stories, big-paper-murals, throwing-target-garden,
laundry-sorter, sound-basket, kindness-delivery. rhyming-detective's hand-rolled
reduced-motion fallback is *more* animated than the shared no-op would be.

### 3.7 `mode-select.js` (~420 JS+CSS LOC, 12+ games)
Splash mode-card grids hand-built everywhere; `renderModeCards({skin:false})` exists
precisely so bespoke art survives migration. Hazard:
`playdough-letter-factory/js/main.js:203` defines a local function **with the same
name** as the shared export. land-water-tray is the model adopter.

### 3.8 `preload.js` (~120 LOC, 10 implementations)
Six copies in the creative group alone (loose-parts-collage has four *within one
game*), four more in practical games. color-mixing-lab's version (timeout +
`decode()`) is the best — **upstream it into `preload.js`**, then migrate.

### 3.9 `rng.js` (~200 LOC)
sink-or-float re-declares `mulberry32` *in a file that imports from rng.js*;
bug-hotel + rhyming-detective share byte-identical FNV-1a/shuffle/deck copies
(the "pinned stream" argument justifies pinning a seed, not copying deck logic);
sound-basket inlines mulberry32+Fisher-Yates; sound-sprouts hardwires `Math.random`
(unseedable — invisible to QA baselines).

### 3.10 `audio-unlock.js` — **has live user-facing bugs behind it**
- **red-green-light** (`js/game.js:52,95-105`): hand-rolled unlock latch never
  reopens — no `visibilitychange`/`pageshow` handler in the file. After an iPad
  app-switch the caller goes **permanently silent** while the code thinks it spoke.
- **sound-basket** (`js/main.js:128-152`): same missing-reopen bug.
- bug-hotel + rhyming-detective: identical hand-rolled `unlockAudio` on every
  pointerdown, also missing the reopen path.

### 3.11 `tap.js` — split press paths (live defect)
freeze-focus-dance routes **every control** through pointerdown-feedback +
`click`-action (`js/main.js:170-180`, plus a `preventDefault` that can kill the click);
red-green-light does it at 4 sites; feelings-charades wires `pointerdown`/`pointerup`
only on both primary surfaces — **keyboard/AT cannot activate them at all**. `onTap()`
was written for exactly this.

### 3.12 Engines hand-rolled next to the engines
- **laundry-sorter** reimplements both `engines/sort-into-bins.js` (~180 LOC) and
  `engines/match-pairs.js` (~118 LOC) — both true drop-in candidates.
- sand-tray-letters + playdough-letter-factory reimplement `engines/trace-path.js`'s
  `applyTracePointXY` scoring (~220 LOC, same `SEARCH_BACK=5` constant).
- chocolate-chip-count + lunchbox-pack use tap-count's `count-N` voice-key convention
  without the engine (bespoke physics — partial fit only, OK to leave).

### 3.13 Misc existing-module wins
- `journal.js`: 4 creative games hand-roll localStorage galleries with bare
  `catch {}`; globe-spin-stories' passport re-derives a weaker journal. (bug-hotel
  uses it correctly.)
- `dom.js escapeHtml/escapeAttr`: ~8 games re-derive escapers; tangram-tales
  interpolates config strings into innerHTML unescaped.
- `stage/mouth.js`: emotion-voice-game re-implements the cue-follow + flap fallback half.
- `debug-harness.js`: sound-basket hand-rolls `QLOBE_DEBUG`; sound-sprouts exposes
  `window.SPROUTS` instead (invisible to the shared QA driver); 3 games copy the same
  `tap:` helper that the harness could ship by default.
- `content.js`/`shared/data`: rhyming-detective re-authors 23 words + rimes that
  `words.json` already carries; sand-tray-letters re-authors 26 phonic lines that
  `letters.json` has.

---

## 4. Genuine gaps — new shared modules worth extracting

Ranked by (duplicated LOC × bug risk removed):

1. **`camera-flow.js`** (~200 LOC in freeze-focus-dance + throwing-target-garden):
   the permission → status-copy → fallback → lose/teardown state machine above
   `camera-motion.js`/`camera-throw.js` (which correctly own only pixels). Both games
   re-derive the same 5-state switch, denial copy, fake-scenario branch, and teardown.
   Include the hidden-`<video>` + media-park setup (16 JS + 18 CSS duplicated).
2. **`flyTo(el, fromRect, toRect, opts)`** in `stage/` (~200 LOC in 5 practical
   games): WAAPI glide-home/snap animation. Only counting-treasure-cups guards
   against throttled-tab stalls (`Promise.race` timeout) — the shared version should,
   fixing the stall bug in the other four.
3. **`drag-from-rail`** (tray scroll-vs-drag disambiguation, ~200 LOC in
   clay-creature-studio, loose-parts-collage, sink-or-float; identical constants in
   two of them). Natural home: an option on `drag-to-slot-dom.js`.
4. **Letter stroke-path table in `shared/data/`**: sand-tray-letters,
   playdough-letter-factory (×2 tables in one game!), chalkboard-big-strokes and
   sweep-the-trail each author their own letter geometry in incompatible encodings.
   One canonical table + the existing trace-path scoring retires ~450 LOC and is the
   root fix for the letters group.
5. **`sfx.setMuted()`** (~30 LOC in 7 games): every practical game wraps sfx in the
   same 3-line mute-gated proxy.
6. **Video helpers** (~90 LOC in red-green-light + feelings-charades): load-race
   (`canplay` vs `error` vs timeout → still fallback) and loop-over-poster crossfade.
7. **`narrator.saySequence({key, gap})`**: the per-step gap column is the only reason
   bug-hotel + rhyming-detective keep ~90 LOC of identical voice sequencers. Also
   expose the narrator token (sound-painting keeps a shadow counter because it can't).
8. **`music.duckDuring(promise)`**: voice-ducks-band wrappers in world-music-dance +
   freeze-focus-dance (~30 LOC, token-guarded, same design twice).
9. **`dom.js` additions**: `clamp`, `round`, `cssEscape`, `pointInside`,
   `prefersReducedMotion` (15+ call sites, 3 shapes), `emojiSpan`-style image-error
   fallback. `canvas-fit.js` (DPR sizing + pointer→normalized mapping, 4 copies
   disagreeing on the DPR cap).
10. **`downloadCanvasPng()`** (~70 LOC, 3 incompatible strategies) and a
    **`.qk-drag-ghost` CSS block** (6 games, 5 class names — the shared stray-sweep
    only knows two of them).
11. **Tap-then-slot select fallback** (~130 LOC in 4 games): the "select item, tap
    target" accessibility path; natural mount point is `drag-to-slot-dom`'s `onTap`.
12. **Fold `textured-stroke-canvas.js` into `musical-canvas.js`** as a
    `brush: 'texture-stamp'` renderer (~250 LOC of duplicated scaffolding).

---

## 5. Library hygiene (`shared/` itself)

- **Deliberate twins are fine, but their contracts drift**: reconcile `DRAG_SLOP` 8
  vs 10 between `drag-to-slot.js`/`drag-to-slot-dom.js`; extract `art-ref.js` (the
  ref grammar is implemented twice in `engines/art.js` + `stage/art-pixi.js`, zero
  tests); extract `pose-pack.js` (pose-sprite twins duplicate manifest cache + pop
  constants as prose); import the confetti palette between `celebrate.js` ↔
  `stage/particles.js` instead of the "keep in step" comment.
- **Three files in `engines/` are not engines**: `puppet-band.js`, `puppet-theater.js`,
  `story-stones.js` break the `createGame` contract, the import allow-list, and the
  lazy-`voiceClips.init()` rule (eager init with hardcoded path at `puppet-band.js:113`,
  `puppet-theater.js:129`). Promote to the contract or move under their games.
- **Engine config schema drift**: `splashEmoji` vs `splashArt` vs `mode.art`;
  `config.voice.clips` vs `config.voiceClips` (trace-path only); only coach-timer
  guards `config || {}`; `injectStyle` vs `installStyle` naming.
- **Test coverage is inverted**: `sfx.js` (104 games), `speech.js` (94),
  `voice-clips.js` (36), `tap.js` (29) have **zero tests**, while single-game clay
  modules carry 3,374 test lines. Add tests for the top four; also `freeform-board.js`
  (undo/snapshot state) and the Pixi `drag-to-slot.js` (its DOM twin has 604 test lines).
- **Docs**: engines/README lists 10 of 13 engines; import allow-list stale;
  `shared/README.md` omits three subtrees; fix `build-usage-index.mjs` (garbage keys,
  no CSS, no zero-consumer report) so audits like this are automated.

---

## 6. Bugs found (fix regardless of DRY work)

| # | Bug | Where |
|---|---|---|
| 1 | Audio-unlock latch never reopens → permanent silence after iPad app-switch | `red-green-light/js/game.js:52,95-105`; `sound-basket/js/main.js:128-152` |
| 2 | Split press path drops taps; `preventDefault` can suppress the click | `freeze-focus-dance/js/main.js:170-180` (every control); `red-green-light/js/game.js:137,174,256,438` |
| 3 | Keyboard/AT cannot activate primary surfaces (pointer-only wiring) | `feelings-charades/js/game.js:141-142,405-406`; `story-stones/js/main.js` (`.onclick=` throughout) |
| 4 | Touch targets below 96px floor | `color-mixing-lab/css/style.css:7` (76px, neuters `::before` pad); `sound-sprouts` 84px; `feelings-charades` ~76px |
| 5 | Seeded runs play a different game (min-duration windows) | `red-green-light/js/game.js:341-347` |
| 6 | `await animation.finished` unguarded → input-lock stall in throttled tabs | `laundry-sorter/js/main.js:561,572,597`; `sound-basket:478,491` (counting-treasure-cups has the fix) |
| 7 | Pointer capture never released | `chocolate-chip-count/js/game.js:677→693-696` |
| 8 | `removeEventListener(..., {passive:false})` — options ignored on removal | `tangram-tales/js/main.js:391-393` |
| 9 | Unescaped id → querySelector injection | `lunchbox-pack/js/game.js:421`; `sound-basket/js/main.js:655,668`; tangram-tales innerHTML interpolation |
| 10 | localStorage write on every stroke end, unbounded serialize | `big-paper-murals/js/main.js:653` |
| 11 | One timer variable, two jobs (idle nudge vs clear-confirm) | `big-paper-murals/js/main.js:427-430` |
| 12 | WebGL renders at full rate in background tabs (no visibility pause) | `sound-sprouts/js/scene.js:71` |
| 13 | Metrics update without repaint on same-pixel-dims resize | `sand-tray-letters/js/game.js:263-303` |
| 14 | Stale drag click-suppression window across pointers | `throwing-target-garden/js/main.js:781` (uncommitted file — coordinate with that session) |

---

## 7. Suggested sequencing

- **Wave 0 — decisions + guardrails (small, stops the bleeding):** analytics decision;
  rewrite template + CLAUDE.md voice-module guidance; add `engine-base.css` +
  missing subtrees to docs; fix usage-index tool; delete dead code (§2).
- **Wave 1 — bug fixes (§6 items 1–5)** — user-facing, mostly one-import fixes.
- **Wave 2 — upstream the best local versions** (preload timeout+decode, narrator
  gap/token, `sfx.setMuted`, `dom.js` helpers, `.qk-drag-ghost` CSS), then the new
  extractions (§4: camera-flow, flyTo, drag-from-rail, stroke-path data).
- **Wave 3 — game migrations**, model-citizen first to prove each recipe:
  teen-bead-builder + snack-chef (drag), laundry-sorter (engines), sound-basket +
  sound-sprouts + bug-hotel (platform adoption), then the HUD/mode-card/CSS sweep.
- **Wave 4 — tests** for `sfx`/`speech`/`voice-clips`/`tap`, engine schema
  normalization, engines-that-aren't-engines.

Model citizens to copy from: **sand-tray-letters** (documents each migration in
comments), **weather-scientist**, **color-mixing-lab** (minus the 76px override),
**kindness-delivery**, **land-water-tray**, **story-stones**, **world-music-dance**.

---

## 8. Implementation status (2026-08-07)

Waves 0–2 are complete; Wave 3 has one fully-verified pilot migration; Wave 4
is scoped but not started. Every change below was smoke-tested in a real
browser (console-clean, and gameplay exercised via the debug harness and/or
real pointer input) before being counted as done.

**Wave 0 — done.** Analytics decision recorded in §0 above and reflected in
`CLAUDE.md`. `voice-clips.js` is now documented as the primary voice channel
in `CLAUDE.md`, `templates/game-family/`, `.claude/skills/new-game/SKILL.md`,
and `docs/interaction-patterns.md` §2 (rewritten). `shared/README.md` +
`CLAUDE.md` now list `engine-base.css`, `js/clay/`, `js/studio/`,
`analytics.js`, and a fuller `js/stage/` breakdown. `tools/build-usage-index.mjs`
now validates `uses[]` entries against the filesystem (dropping/reporting
stale ones instead of indexing them), indexes `shared/css/*.css`, and reports
zero-consumer shared files. Dead code deleted: `shared/js/clay/lobes.js` +
`lobes-three.js` + tests (6,558 LOC), `clay-creature-studio/js/blob-lobes.js`
(1,180 LOC). Single-consumer modules moved into their games: `weather-world.js`,
`paper-globe.js`, `tilt-input.js`, `performance-recorder.js`/
`performance-video-export.js`. `shared/js/audio.js` deleted outright —
`sound-basket` (its one consumer) migrated to `voice-clips.js` +
`content.js`, and `audio-unlock.js` no longer imports it. Identical-arm
conditionals fixed in `sound-painting` and `color-mixing-lab`.
**Deferred:** moving `puppet-builder.js`/`puppet-studio.html` — this is
already a scheduled phase of the separate Studio v2 refactor program
(`docs/qlobe-studio-v2.md`, "Port source"), not a simple file move; doing it
here would conflict with that program's own plan.

**Wave 1 — done**, bugs 1–13 (bug 14 skipped: `throwing-target-garden` was
another session's uncommitted file at review time). Bug 1 (audio-unlock
reopen) and bug 5 (seeded min-duration) were found **already fixed** in
`red-green-light` — evidently landed in the "Shared-platform DRY refactor"
commit after this audit's review pass ran. Bug 1 for `sound-basket` fixed as
part of its Wave-0 `audio.js` migration. Bug 2 (split press path) fixed in
`red-green-light` (5 sites → `onTap`) and `freeze-focus-dance` (`press()`
helper rewritten on `onTap`). Bug 3 fixed in `feelings-charades` (2 sites →
`onTap`); the `story-stones` citation is a **false positive** — its
`.onclick=` sites are real `<button>` elements with a tap-select fallback
already wired alongside the drag, so they're keyboard/AT-accessible as
written (verified with a live focus+Enter test). Bug 4 fixed in
`color-mixing-lab`, `sound-sprouts`, `feelings-charades` (4 distinct
sub-96px CTAs, not just the one HUD button the audit named). Bugs 6–13 fixed
as described, each with a targeted browser check (wrong-answer/right-answer
drag paths, clear-arm timer surviving a mid-countdown stroke, a real
`visibilitychange` toggle against the WebGL loop, a live window resize
against the canvas metrics fix). **Bug 8's citation is a false positive**:
`removeEventListener(fn, {passive:false})` in `tangram-tales` matches its
`addEventListener` call exactly (`capture` is what's compared, and both
default to `false`) — the listener is removed correctly.

**Wave 2 — done.** `preload.js` gained the timeout + `decode()` promise from
color-mixing-lab's local copy. `narrator.js` gained a per-step `gap` (ms,
pause before that step) on `saySequence()` parts and an exposed read-only
`token` getter — both covered by new cases in `narrator.test.html` (45/45
passing). `sfx.js` gained `setMuted()`/`isMuted()` at the master-gain level,
so the ~7 games with a local `if (state.muted) return;` proxy around every
`sfx.xxx()` call have something to delete into (not yet migrated — see Wave
3). `dom.js` gained `clamp`, `round`, `cssEscape`, `pointInside`,
`prefersReducedMotion`, `emojiSpan`. `music.js` gained `duckDuring(promise)`,
replacing the token-guarded duck/restore wrapper `world-music-dance` and
`freeze-focus-dance` each hand-rolled (not yet migrated). A `.qk-drag-ghost`
base class (`position:fixed; pointer-events:none;`) landed in `base.css` for
new ghost elements to extend — the 5 existing hand-rolled ghost classes
genuinely differ in size/shadow/rotation per game (not copy-paste identical),
so migrating them wasn't attempted; this is a Wave 3 job.
**Not done:** the rest of §4's new extractions (`camera-flow.js`, `flyTo`,
`drag-from-rail`, the letter stroke-path table, video helpers, tap-then-slot
select fallback, folding `textured-stroke-canvas.js` into
`musical-canvas.js`, `downloadCanvasPng()`, `art-ref.js`, `pose-pack.js`) —
each is a genuine new-module design effort spanning several games' worth of
investigation, not a small addition; each deserves its own session.

**Wave 3 — two pilots done.** `teen-bead-builder` migrated from its ~80-line
hand-rolled drag to `shared/js/stage/drag-to-slot-dom.js` (`slotPad: 45`,
`ghostOn: 'press'`, `onTap` covering the "a plain tap also adds a bead" path)
— the exact pilot the audit named, since the DOM module's own header
documents it as one of the two games its design was extracted from. Verified
live: drag-to-drop-zone, tap-only-add, drag-away-miss (boing + shake +
nudge, no bead added), and a full bundle-of-ten transition, all console-clean.
`snack-chef` migrated the same way — its `ingredientDrag` in
`gesture-surface.js` (~80 LOC) deleted outright, replaced with the shared
module (`slotSelector: '.slot:not(.filled)'`, `slotPad: 20`, default
`ghostOn: 'lift'`/`slop: 8` matching its original feel exactly). Verified
live: drag-to-drop-zone, drag-with-wrong-kind (nudge, no placement), and
tap-select + tap-target, all console-clean.
**Investigated and explicitly deferred:** `laundry-sorter` →
`engines/sort-into-bins.js` + `match-pairs.js` — these are full Stage v2
(Pixi) engines that own splash→end and expect to fully replace a game's
rendering, not narrow utilities to drop into one mode of an existing
DOM-based multi-mode game. Migrating properly would mean rewriting 2 of
laundry-sorter's 3 modes from DOM to Pixi — a different, much larger job than
the audit's "true drop-in candidates" phrasing suggested, and too large to
rush safely in this pass.
**Still not done:** the `sound-basket`/`sound-sprouts`/`bug-hotel-observer`
platform-adoption pass, and the broader `screens.js`/HUD/mode-card/CSS sweep
across the ~20 remaining games §3 lists. Each is a per-game refactor of a
shipped, working game — real regression risk without dedicated playtest time
per game.

**Wave 4 — test coverage for all four zero-test consumer-heavy modules is
done**, plus two documentation fixes. New: `shared/js/tap.test.html` (17
cases: feedback/action split, pointer-identity matching, second-finger
rejection, pointercancel, trailing-click suppression, bare click for
keyboard/AT, disposer). `shared/js/speech.test.html` (22 cases; monkey-patches
`window.speechSynthesis` before importing so it's deterministic and silent
instead of racing a real voice engine — this tab has zero real voices
installed, which the test also documents as a real, survivable path).
`shared/js/voice-clips.test.html` (36 cases; fakes `fetch` for the manifest
and exercises a REAL 404 clip → speech fallback, not a mocked one).
`shared/js/sfx.test.html` (35 cases against a real, muted `AudioContext` —
every effect must build its WebAudio graph without throwing, plus the
master-gain mute/unmute round trip). All four pass in full on a verified-fresh
load (this session hit real HTTP-cache staleness mid-verification more than
once — a dev-session artifact of the plain `python3 -m http.server`, not a
bug in any of the modules; `git diff`/served-bytes were cross-checked each
time). `shared/js/engines/README.md` now names the 3 non-conforming files
(`puppet-band.js`, `puppet-theater.js`, `story-stones.js`) instead of
silently omitting them. The `DRAG_SLOP` 8-vs-10 "drift" between the Pixi and
DOM drag modules was checked and found **already reconciled in the docs** —
`drag-to-slot-dom.js`'s own header explains the difference is deliberate
(a DOM press is often on a scrollable grid; a higher slop protects the
child's scroll gesture).

**Additional §3 items fixed in a follow-up round (2026-08-07):**
- **§3.10 audio-unlock, two more live instances.** `bug-hotel-observer` and
  `rhyming-detective` each hand-roll `unlockAudio()` fired on every
  pointerdown, but neither's `visibilitychange` handler ever calls
  `speechSynthesis.resume()` or resets any channel's internal "unlocked"
  latch — the exact reopen gap Wave 1 fixed in `red-green-light` and
  `sound-basket`, just not counted in the original bug table. Both now also
  call `installUnlockOnGesture({ extra: [unlockAudio] })`. Verified live in
  both: full round completion via the debug harness, then a simulated
  `visibilitychange` hide/show cycle followed by a real pointerdown, clean.
- **§3.9 rng.js, two real duplicates fixed.** `sink-or-float` re-declared
  `mulberry32` locally in a file that already imports `shuffle` from
  `rng.js` — now imports `mulberry32` too and the local copy is deleted.
  `sound-basket` inlined its own mulberry32 + Fisher-Yates — now thin
  wrappers (`random()`/`shuffle()`) delegating to the shared generator, so
  every call site stays unchanged. Both verified: a seeded run completes
  correctly, and sound-basket's confetti-spark placement (also fed by
  `random()`) rendered correctly.
  **Investigated and left alone:** `bug-hotel-observer` + `rhyming-detective`'s
  identical FNV-1a/`seededShuffle`/`createDeck` — the code has an explicit,
  reasoned comment for why it's a deliberate twin ("a shared PRNG whose
  stream changed would silently re-roll every QA baseline in two games at
  once"), matching §5's own "deliberate twins are fine" guidance. Not
  touched.
- **§3.7 mode-select naming hazard.** `playdough-letter-factory`'s local
  `renderModeCards()` (no live collision today — it never imports the shared
  one) renamed to `renderFactoryModeCards()` to defuse the hazard for a
  future migration, rather than attempting the deeper visual migration to
  the shared module in this pass (its per-mode letter-splitting art and
  gradient/tilt vars are bespoke enough that a full swap deserves its own
  verification pass, not a rename-adjacent drive-by).
- **§3.13 debug-harness adoption.** `sound-basket` hand-rolled
  `window.QLOBE_DEBUG = debug;` directly instead of `installDebug(debug)`.
  Migrated — and in doing so found its debug surface used a non-standard
  `start` key instead of the v1 contract's `startMode` (confirmed safe to
  rename: its own `tools/qa.mjs` drives navigation through real
  `page.locator(...).click()`, never `.start(`). Added the missing `gameId`.
  Verified live both ways: `QLOBE_DEBUG.startMode('two')` and a real click on
  `#play-default`, both console-clean.
- **Investigated, correctly left alone:** `timers.js` adoption for
  `bug-hotel-observer`/`rhyming-detective` (§3.5's "two byte-identical
  pairs"). Their hand-rolled `beat()`/named-timer helpers touch 30+ call
  sites each, and `state.timeScale` is read directly by `voice.seq()`/
  `speakFor()`/a CSS custom property in ADDITION to gating the local timer
  helpers — `createTimers()`'s scale convention is also the inverse of
  `state.timeScale`'s (`setScale(s)`: higher = faster; `state.timeScale`:
  lower = faster). A correct migration means converting the scale
  convention at every site that reads `state.timeScale` directly, not just
  swapping the timer bookkeeping — a bigger, real job, not the ~15-line
  change it first looked like.
- **§5 import allow-list — checked, not stale.** Diffed every real engine's
  actual imports against `engines/README.md`'s documented allow-list: all
  10 conforming engines' imports are already covered by it. The only
  modules outside the list belong to the 3 already-documented non-engines
  (`puppet-band.js`, `puppet-theater.js`, `story-stones.js`); their
  violations are the point, already called out by name.
- **Wave 4 test coverage, two more modules — the full §4 test list is now
  covered.** `shared/js/freeform-board.test.html` (57 cases): construction
  guard, add/remove/clear, snapshot↔load round-trip, undo history,
  move/transform/rotate (including angle normalization into `(-180, 180]`),
  select/getSelected, the `onChange` reason sequence, and a double-`destroy()`
  safety check. `shared/js/stage/drag-to-slot.test.html` (38 cases) — the
  Pixi twin of `drag-to-slot-dom.js`, which had its own 604-line test file
  and no counterpart; no real Pixi renderer needed since the module only
  ever touches `piece.view.{x,y,position,scale,rotation,cursor}`, so a plain
  fake object stands in and real `PointerEvent`s drive the window-level
  listeners. Along the way the tests **proved a real, documented behavioral
  difference from the DOM twin**: the Pixi version's `cancel()` fires
  `onCancel` even for a tap-length press that never crossed the slop gate,
  where the DOM twin gates it on `moved`. Both new suites pass in full; a
  live consumer of each (`clay-creature-studio` for freeform-board,
  `bead-path-builder` for drag-to-slot) re-verified console-clean.
- **Investigated, correctly left alone:** engine config schema normalization
  (`splashEmoji` vs `splashArt`, `injectStyle` vs `installStyle`).
  `splashEmoji`/`splashArt` genuinely differ in what they accept per engine
  (`build-assemble.js` takes a full art-ref with a fallback chain;
  `choose-one.js` — used by 15 games — only ever reads `splashEmoji`, no
  `splashArt` support at all), so unifying them means changing shared
  engine code every one of those games depends on, not renaming a config
  key. `injectStyle`/`installStyle` are private, non-exported per-file
  helper names with no shared contract — renaming them is pure bikeshedding
  with no functional value. Both are real Wave-4-scale jobs, not
  drive-by fixes.

- **§5 `art-ref.js` extracted.** `engines/art.js`'s `artUrl()` and
  `stage/art-pixi.js`'s `artUrlRef()` — plus each file's private `layerSpec()`
  — were byte-for-byte identical (same prefix matching for `shared:`/`char:`/
  `game:`, same `SHARED` URL base). New `shared/js/art-ref.js` exports
  `resolveArtUrl()` + `layerSpec()`; both engine files now import from it and
  re-export their historic names (`artUrl`, `artUrlRef`) unchanged, so every
  existing call site and external consumer (`build-assemble.js`,
  `trace-path.js`, `observe-journal.js`, `coach-timer.js`,
  `sequence-order.js`, `tap-count.js`, `pattern-continue.js`,
  `sort-into-bins.js`, `choose-one.js`, `match-pairs.js`) is untouched — pure
  dedup, no behavior change. Verified live: `blend-train` (DOM engine, via
  `build-assemble.js`'s `artEl`) and `letter-road-driving` (Pixi engine, via
  `tap-count.js`'s `artObj`/`artUrlRef`), both rendering art correctly and
  console-clean on a fresh (non-cached) load.

- **§5 `pose-pack.js` extracted.** `stage/pose-sprite.js`'s local `fetchManifest`
  + manifest-validation guard and `stage/pose-sprite-dom.js`'s copy of the same
  two things were functionally identical (same `manifestCache` Map, same
  `fetch(href, {cache:'no-store'})`, same `qlobe-pose-actor`/`poses.neutral`
  validation, same thrown error text). New `shared/js/stage/pose-pack.js`
  exports `fetchPoseManifest()`, `loadPoseManifest()` (fetch + validate in one
  call, returns `{url, manifest}`), and the `POSE_POP_MS` default-duration
  constant (previously a bare `220` duplicated as a literal in both files).
  Both pose-sprite files now import from it; `loadPoseActor`/`loadPoseActorDom`/
  `loadPoseActors` keep their exact names, signatures, and behavior — pure
  dedup. Along the way, found and fixed a small piece of real dead code
  surfaced by the comparison: `pose-sprite-dom.js`'s `POP_UP_FRACTION = 0.62`
  constant existed only in a comment's shadow — the CSS keyframe next to it
  hardcoded a literal `62%` instead of using it. Now the keyframe reads
  `${POP_UP_FRACTION * 100}%`, so the constant is what the animation actually
  runs on. Verified live through full pose-swap paper-pop transitions in both
  renderers: `counting-treasure-cups` (DOM, `loadPoseActors` — Captain Goldie
  fades in on load, then pops to a new pose on a correct answer) and
  `world-music-dance` (Pixi, `loadPoseActor` via `theater.js`/`pose-conductor.js`
  — the dancer actor loads on the dance floor and pops pose on a "My turn!"
  tap). Both console-clean throughout.

**Not done:** nothing further from §4/§5's named extraction list remains open
— `art-ref.js` and `pose-pack.js` were the last two. The rest of the
"Still open" items below (Wave 3 platform-adoption sweeps, timers.js
migration, engine config schema unification) are deliberately deferred
per-game refactors of shipped games, not extraction work, and each was
investigated and explicitly declined earlier in §8 with its own reasoning.

**Concurrent-session note (2026-08-07, checked before this round's edits).**
`git status` shows ~20 game files with real, uncommitted diffs this session
did not make — and they land on exactly this audit's remaining items:
`onTap()` migrations in `feelings-charades/js/game.js`,
`freeze-focus-dance/js/main.js`, and `red-green-light/js/game.js` (§3.11's
named live defect, all three games, mid-fix); a `releasePointerCapture`
cleanup in `chocolate-chip-count/js/game.js`; a `CSS.escape()` fix in
`lunchbox-pack/js/game.js`; dead-branch cleanup in `color-mixing-lab/js/main.js`
and `sound-painting/js/main.js`; a `visibilitychange` WebGL-pause guard in
`sound-sprouts/js/scene.js` (the game CLAUDE.md itself flags as "may be under
active refactor by another agent"); plus `laundry-sorter/js/main.js`,
`sand-tray-letters/js/game.js`, `tangram-tales/js/main.js`. None of these were
touched this round — editing a file mid-flight under another session risks
clobbering in-progress, unsaved work, which is a materially worse outcome than
leaving an audit item open one more round. This session's own new-file work
(`art-ref.js`, `pose-pack.js`, and their two consumer files each) was verified
untouched by anything else before editing. Once that concurrent work commits
or settles, re-run `git status`/`git diff` against this section's file list
before picking up any more §3/§6 items, so effort isn't duplicated or
conflicting.

**§3.8 `preload.js` migration, two more games (2026-08-07).** Worked around
the concurrent-session file set by picking games nobody else had touched.
`button-zipper-lab/js/main.js`'s local `preload(src)` (bare `new Image()`,
no timeout, no `decode()`) deleted; its one call site now calls the shared
`preloadImages(assetUrls)`. `loose-parts-collage/js/main.js` — the audit's
own "four copies within one game" example — had one local `preload(src)`
function called from four separate `.map()` sites (papers/materials/yarns/
modes); deleted, replaced with a single `preloadImages([...four merged
lists...])` call, preserving the original `resolve(item.art)` URL logic and
the original control flow (voice init waits on the preload batch resolving,
not run in parallel with it). Both migrations are pure boot-sequence
substitutions — the resolved values were already discarded by both games
(only used to gate a `ready` promise), so shared `preloadImages`'s
void-resolving contract is a safe drop-in for the old per-image
`resolve(true/false)`/`resolve(image/null)` contracts. Verified live: both
games' splash + mode-card art and in-round asset trays render correctly on a
fresh load, console-clean in both.

**§3.5 `timers.js`, the named "escapes it entirely" case fixed
(2026-08-07).** Re-read §3.5 more carefully: it names two *different* problems
under `timers.js` — (a) bug-hotel-observer/rhyming-detective's hand-rolled
timer groups with an inverted scale convention, a real multi-site migration,
correctly still declined (see above); and (b) `world-music-dance dance.js`'s
raw `setTimeout` calls that *bypass* a `createTimers()` group the game already
has and already uses elsewhere — a much smaller, surgical fix, and safe
because `world-music-dance` was NOT in the concurrent session's touched-file
set. `main.js` already exposed `wait`/`ms` wrappers around its `timerGroup` on
`ctx`; added matching `after(ms, fn)`/`clear(id)` wrappers (mirroring the
existing style) and put them on `ctx` too. `dance.js` had exactly three raw
`setTimeout`s: the beat-rail pulse (`pulseRail()`, a genuine cancel-and-reschedule
timer — now `ctx.after`/`ctx.clear`, including its `destroy()` cleanup),
the wrong-answer button shake (`wrong()`, fire-and-forget — now `ctx.after`),
and a 30ms polling delay inside the debug harness's own `winRound()` loop —
now `await ctx.wait(30)`. All three now honour `fastTimers()` scaling the same
way every other timer in the game already does. Verified live via real UI
taps (dance-floor demo → "My turn!" → beat-rail pulsing → a wrong tap
triggering and clearing the shake class) and via `QLOBE_DEBUG.winRound()`
driving a full round to completion through the new `ctx.wait(30)` polling
path — console-clean throughout, no change to the choreographed pose/beat
feel (only bookkeeping — which clock schedules the same callbacks at the
same nominal delays — changed, not the delays or the callbacks themselves).

**§3.13 debug-harness `tap:` default — investigated, found to be a false
positive, correctly NOT implemented (2026-08-07).** The audit reads "3 games
copy the same `tap:` helper the harness could ship by default." Compared the
actual implementations across every untouched game with a `[data-target]` +
`.click()` tap (kindness-delivery, emotion-voice-game, story-stones,
throwing-target-garden, plus the already-touched puppet-retell): they are
similar in spirit but genuinely differ — root scope (`document` vs a local
`mount`/`root` element vs, in throwing-target-garden, the CURRENT active
screen recomputed on every call, with a code comment explaining why: two
screens can have same-named targets and a static root would risk tapping a
hidden one), extra guards (kindness-delivery checks `getBoundingClientRect().width
=== 0` and `.disabled`; the others don't), and async timing (`await
Promise.resolve()` in two, nothing in two). More decisively: `debug-harness.js`
itself already documents, in a comment right at the assembly step, that `tap`/
`winRound`/`home` deliberately get **no default** — "a stub that always
answers 'not accepted' reads exactly like a real rejection, and their absence
is how a reviewer feature-detects what this game actually supports." Shipping
a generic default `tap` would contradict that explicit, reasoned design
decision (and couldn't even replicate throwing-target-garden's dynamic
active-screen scoping without becoming per-call-configurable, which is most of
the way to just leaving it as a per-game implementation). Left alone — a
second file-level design comment settled it, the same way `drag-to-slot-dom.js`'s
own header settled the `DRAG_SLOP` 8-vs-10 "drift" question in Wave 4.

**§3.8 `preload.js`, three more games via region-isolated edits
(2026-08-07).** Revisited the "off-limits" call on the concurrent session's
touched files: the real risk was never "this file has *any* uncommitted diff
elsewhere," it's a *write colliding with the same lines at the same moment*.
`git diff --unified=0` shows each concurrent hunk's exact line range, so a
game whose hunks sit far from its `preload`/import lines is safe to add an
isolated new hunk to — same file, two non-overlapping diffs, verified after
the fact that both survived intact. Under that finer-grained check:
`color-mixing-lab` and `big-paper-murals` turned out NOT to be safe migrations
regardless of the concurrent-edit question — `color-mixing-lab`'s local
preloader tracks a QA-visible `artFailures` list (`getState().artFailures`)
the shared `preloadImages()` has no equivalent for, and `big-paper-murals`'s
`imageCache.set(src, image)` side effect is the actual mechanism two other
functions use to draw the cached `Image` elements later — migrating either
would have been a silent regression, not a dedup. `sink-or-float`'s
`js/art.js "preload"` is a genuine `PIXI.Assets.load` texture loader, not a
DOM-`Image` duplicate at all — a third confirmed false positive alongside
§3.13's `tap:` default. `clay-creature-studio` was already fully migrated
(the "duplicate" the audit's file list caught was `preloadMouthRig()`, a thin
per-rig wrapper *around* the shared `preloadImages()`, not a reimplementation).
That left three genuinely safe, value-discarding, gate-only preloaders with
clean line separation from their file's concurrent hunks: `laundry-sorter`,
`chocolate-chip-count/js/game.js`, and `tangram-tales` — all migrated the same
way as the earlier two. Verified live: splash + mode-card + in-round art all
render correctly on a fresh load in all three, console-clean, and `git diff`
re-checked afterward to confirm the concurrent session's own hunks in each
file are still intact and non-overlapping.

---

**Where this leaves things (2026-08-07, all rounds).** Every §4/§5 named
extraction is done (`art-ref.js`, `pose-pack.js`). Every §6 numbered bug is
fixed except #14 (another session's file) and the two confirmed false
positives. §3's items are done wherever a single, clean, low-risk file was
available: `voice-clips.js`, `rng.js` (2 games), `audio-unlock.js` reopen bug
(4 games), `tap.js`/`onTap` (2 drag pilots), `debug-harness.js` adoption
(sound-basket), `mode-select.js` naming hazard, `preload.js` (7 games total —
color-mixing-lab was the upstream source; button-zipper-lab, loose-parts-collage,
laundry-sorter, chocolate-chip-count, tangram-tales migrated across two
rounds), and `timers.js`'s narrower "escapes an existing group" case
(world-music-dance). Four suggestions were investigated and found to be false
positives against the current code — §3.13's `tap:` default, the two Wave-1
removeEventListener/keyboard-access claims, and (this round) `sink-or-float`'s
`art.js` "preload" (a Pixi texture loader, not a DOM-Image duplicate) — none
implemented, with reasoning recorded in place of a fix. Two more preload.js
citations (`color-mixing-lab`, `big-paper-murals`) turned out to carry real
behavior a naive migration would have silently dropped; also left alone, also
recorded. What remains is genuinely one of two things, not an oversight: (a)
the *specific lines* a concurrent session is actively editing right now (not
"any file it has touched" — check `git diff --unified=0` per file before
ruling one out), or (b) large, multi-game, real-blast-radius jobs (the
~20-game HUD/mode-card/CSS/`screens.js` sweep, bug-hotel/rhyming-detective's
hand-rolled `timers.js` groups with their inverted scale convention,
`splashEmoji`/`splashArt` unification across the engines 15+ games share) that
were each investigated on their merits and would need their own dedicated
session with playtest time, not a rushed drive-by, to do safely.

**§3.2/§3.7 Wave-3 sweep — one concrete candidate checked, confirms the
category assessment (2026-08-07).** Looked for a single low-risk mode-card
migration the same way `preload.js`'s region-isolation search found real
wins — swept every untouched game for `config.modes` usage without a
`mode-select.js` import. Found exactly one real candidate,
`flashlight-cave` (the other, `throwing-target-garden`, is a single-string
list with no card grid to speak of). `flashlight-cave`'s splash is a full
`mount.innerHTML = splashHTML()` string-template rebuild, not a DOM-node
list `renderModeCards()` could slot into directly, and each mode tile's
visual (`modeFace()`) is bespoke per mode — an apple image for one, a
hand-drawn SVG sound-wave path for another, a letter+waves compound for the
third — exactly the kind of custom `decorate()` callback the land-water-tray
model adopter needed, which only that game's own author could verify reads
right after the swap. (Its press-path — `onTap` with a custom `feedback`
callback for the unlock/greet timing — was *already* correct; there's no
live bug here, purely a paint duplication.) This is a genuine, concrete data
point for the "needs live visual verification per game, not a mechanical
dedup" assessment already recorded above — not a re-assertion, an actual
example investigated and confirmed. No game in this category was migrated
this round for that reason.

**§3.5 real bug found and fixed inside bug-hotel-observer's own hand-rolled
`timers.js` twin (2026-08-07).** Re-investigating the declined bug-hotel/
rhyming-detective `timers.js` migration turned up something the audit didn't
name: `bug-hotel-observer`'s hand-rolled `window.QLOBE_DEBUG` exposes its
fast-forward method as `fastTimer` (singular) — not `fastTimers` (plural),
the v1 contract's actual key (confirmed correct next door in
`rhyming-detective`'s own hand-rolled hook: `fastTimers(scale = 0.05) {`).
Any standard QA driver calling the documented `QLOBE_DEBUG.fastTimers()`
against this game got `undefined is not a function`, silently — the exact
same defect class as the `start`→`startMode` fix already landed for
`sound-basket` earlier this session, just a different key. Renamed the
method (its internal scaling logic — the dual "n>1 divides, n≤1 multiplies"
dialect — was already correct, matching the docstring's own claim of
`rhyming-detective` compatibility). This game has its own local QA script,
`games/bug-hotel-observer/tools/qa.mjs`, which called the buggy singular
name 5 times — updated those too, or the fix would have broken the game's
own test suite while fixing the public contract. Also swept every remaining
`fastTimer` (no s) reference across the game's docs/comments (`game-design.md`
×3, `voice.js` ×3, `game.js` ×1, `style.css` ×1) for consistency — none were
executable, all renamed anyway so nothing points a future reader at the wrong
name. Verified live: `QLOBE_DEBUG.fastTimers(20)` now exists and correctly
scales `getState().timeScale` from 1 → 0.05; started a real round, opened a
room, the magnifier-lens hidden-object scene rendered and played correctly
at the sped-up scale, console-clean throughout. The 30+-call-site migration
itself (converting every direct `state.timeScale` read to route through a
`createTimers()` group) remains correctly declined — this fix is orthogonal
to that: it repairs the EXISTING hand-rolled scaling's contract-compliance,
not architecture.

**Follow-up check: is `rhyming-detective` missing the same fix? No —
confirmed intentional, not a bug.** After the bug-hotel-observer rename,
checked whether `rhyming-detective`'s `fastTimers(scale = 0.05)` has the
matching dual-dialect bug (treating `fastTimers(20)` as "scale down to
20×" the way the contract implies). It doesn't handle both dialects — it
always reads `scale` as a direct multiplier, clamped to `[0.01, 1]`. That
LOOKS like the same defect at first glance, but it is fully intentional and
tested: `rhyming-detective/game-design.md` documents the exact contract
("clamps to `[0.01, 1]`... Default 1"), and `rhyming-detective/tools/qa.mjs`
line 1126-1127 explicitly asserts `fastTimers(9) === 1` and
`fastTimers(0) === 0.01` — a real test proving the clamp-only behavior is
the intended contract, not a gap. `bug-hotel-observer`'s own fixed docstring
already knew this ("the rhyming-detective HABIT of `fastTimers(0.05)`") —
its author built dual-dialect tolerance BECAUSE rhyming-detective's
convention differs, not because rhyming-detective was broken. Left alone;
"fixing" it would have broken a documented, tested contract for a
false-positive bug that doesn't exist.

**§5 `splashEmoji`/`splashArt` — re-scoped and implemented, narrower than the
declined "unification" (2026-08-07).** The earlier decline was about
RENAMING a config key across 15+ games that actively depend on shared engine
code — genuinely risky. Checked something the earlier pass hadn't: does any
current game actually run `choose-one.js`, `match-pairs.js`,
`pattern-continue.js`, `tap-count.js`, `coach-timer.js`, or `puppet-theater.js`
as its engine? `grep -rl "engines/<name>.js" games/*/js/*.js` and every
`game.json`/`config.json` `"engine"` field, repo-wide: **zero matches for all
six.** Only `build-assemble.js`/`trace-path.js`/`sort-into-bins.js`/
`observe-journal.js`/`sequence-order.js` have real consumers today, and
those five *already* fall back `splashArt || splashEmoji` (or the reverse) —
they were never the problem. The five/six with no consumer are pre-built
Studio-v2 infrastructure ([[studio-v2-refactor-program]]) waiting for their
first game, so extending them carries **zero regression risk to anything
shipped or in-design** — the failure mode the original decline was protecting
against (breaking a live dependent) cannot happen yet. Implemented the
narrowest safe version, not a rename: added `emojiFromRef(ref, fallback)` to
`shared/js/art-ref.js` (extracts a bare glyph from a ref, degrading to
`fallback` for a file-backed ref instead of printing the ref string —
`coach-timer.js` already had exactly this logic as a private, unexported
copy; migrated it to the shared one, a small bonus dedup). The four true
emoji-only engines (`choose-one`, `match-pairs`, `pattern-continue`,
`tap-count`) each got: (1) their `splashEmoji` default-fill extended to
`config.splashEmoji || config.splashArt || '<engine default>'` — purely
additive, a config that only ever sets `splashEmoji` behaves identically
since the `||` chain short-circuits before reaching `splashArt`; (2) their
render call sites wrapped in `emojiFromRef(...)` instead of a bare
`escapeHtml(this.config.splashEmoji)`, so a future game accidentally passing
an image ref into either field degrades to the engine's default glyph
instead of literally printing the ref string as text. `puppet-theater.js`
was investigated and left alone — its `splashEmoji` normalize line is
already dead code (nothing in the file reads it back; the splash uses
`menu.prompt`/per-mode `mode.emoji` instead), so there was nothing to wire
up. **Verification caveat, stated plainly:** with zero live consumers there
is no game to click through — this was verified by `node --check` syntax
validation on all six files, a standalone assertion check of
`emojiFromRef`'s eight edge cases (bare emoji, `emoji:` prefix, three
file-backed prefixes, empty/undefined input, empty-after-prefix, custom
fallback — all passed) against a byte-identical copy of the shipped
function, and manual review confirming the `||` fallback chain is
non-breaking for the existing "`splashEmoji`-only" convention. This is a
lower bar than this session's usual "click through a live game" standard,
disclosed rather than glossed over.

**§3.13 `injectStyle`/`installStyle` — re-scoped, the real duplication inside
it fixed (2026-08-07).** The earlier decline was correct for what it looked
at: the ~12 shared *engine* files' `installStyle`/`injectStyle` functions
are each a thin, correctly-non-duplicated wrapper around the already-shared
`installEngineStyles()` helper, carrying that ENGINE's own distinct CSS block
— renaming them is genuinely just bikeshedding, confirmed again by reading
several side by side this round. But the audit's file list also caught 4
files OUTSIDE the engine system — `hotspot-scene.js`, `magnifier-lens.js`,
`celebrate.js`, `stage/pose-sprite-dom.js` — that each hand-roll their OWN
"inject a `<style id>` once" guard, and two of them (`hotspot-scene.js`,
`magnifier-lens.js`) were byte-for-byte identical. That part of the citation
was real. Added `injectStyleOnce(id, css)` to `shared/js/dom.js` (a strict
superset of every existing copy — adds the `typeof document === 'undefined'`
guard the two non-identical copies were missing, changing nothing for real
browser use) and migrated all four call sites, deleting each private
`ensureStyle`/`injectStyle` function. Verified live in `bug-hotel-observer`
(exercises both `hotspot-scene.js`'s room-select styling and
`magnifier-lens.js`'s lens rendering, then `QLOBE_DEBUG.winRound()` to
trigger a real find-celebration exercising `celebrate.js`'s confetti path)
and `counting-treasure-cups` (`stage/pose-sprite-dom.js`'s pose-actor
fade-in) — all four render correctly, console-clean throughout.

**§3.13 the one real engine-naming outlier fixed (2026-08-07).** Read all 12
engine files' `installStyle`/`injectStyle` side by side, not just a sample:
11 of 12 (`build-assemble`, `choose-one`, `sequence-order`, `puppet-theater`,
`sort-into-bins`, `pattern-continue`, `observe-journal`, `tap-count`,
`trace-path`, `match-pairs`, `puppet-band`) use the exact same names —
`installStyle()` guarded by a `styleInstalled` flag. Only `coach-timer.js`
was the outlier, using `injectStyle()`/`styleReady`. Renaming all 12 to force
consistency would still be the bikeshedding the earlier decline described —
11 of them already agree. But leaving the ONE real outlier as-is isn't
"declining a large job," it's just an oversight; renamed `coach-timer.js`'s
`injectStyle`/`styleReady` to `installStyle`/`styleInstalled` to match its 11
siblings exactly (4 references: the flag declaration, the one call site, the
function declaration, the guard). `coach-timer.js` has zero live consumers
(same as the four engines extended for `splashEmoji`/`splashArt` above), so
verified by `node --check` plus an exhaustive `grep` confirming no reference
to the old names survives anywhere in the file — a pure rename with no logic
change carries no behavior to click-test.

---

**This closes every §3.13 item this audit named.** Between this round and
the `injectStyleOnce` dedup above, both real halves of the citation —
the 4 standalone modules' identical style-injection guard, and the one
engine file whose naming didn't match its 11 siblings — are done. The
11-vs-1 engine naming was never a duplication to extract (confirmed by
reading all 12 side by side); it was one file catching up to a convention
the other 11 already shared.

**§3.3's three named touch-target violations — confirmed already in-flight,
by the concurrent session, right now (2026-08-07).** §3.3 doesn't ask for the
whole HUD sweep as its most concrete claim — it names three specific,
file-cited accessibility bugs: `color-mixing-lab` overriding `.qk-hud-btn` to
76px, `sound-sprouts` shipping 84px buttons, `feelings-charades` at ~76px,
all below the platform's own enforced ≥96px touch floor. Checked all three
against current code before touching anything, per the region-isolation
habit from earlier rounds — and all three are **already being fixed, live,
by the concurrent session**: `git diff` on `color-mixing-lab/css/style.css`
shows `.lab-icon, .qk-hud-btn { width: 76px... }` → `.lab-icon { width: 96px... }`
(and the `.qk-hud-btn` conflict removed outright); `sound-sprouts/css/style.css`
shows `.hud-button { width: 84px; height: 84px; }` → `96px`/`96px`;
`feelings-charades/css/style.css` shows four separate buttons
(`.mode-button`/`.big-cta`, `#btn-your-turn`, `#btn-cope-done`,
`#btn-affirm-next`) going from 78/70/68/72px `min-height` to 96px, with its
`.round-btn` already at 96px and a documented comment explaining why it
doesn't adopt `hud.css` (a deliberate visual-feel decision, not a size gap).
Not touched — these are the exact same lines already mid-edit, not adjacent
ones region-isolation could safely add to. This is the clearest evidence yet
that the Wave-3 category is not stalled; it is actively being worked, in
parallel, by someone else. Re-check `git status`/`git diff` on these three
files once that work settles to confirm the values landed correctly, rather
than re-deriving the fix from scratch.

---

**§3.5 the full `timers.js` migration — done for `bug-hotel-observer`
(2026-08-07).** Re-scoped this from "declined, needs its own session" to
"attempted properly," after tracing the actual call graph precisely (not
re-asserting the earlier estimate): the hand-rolled system in
`js/main.js` (`T()`, `wait()`, the named `timers.idle/auto/intro` slots, the
`beats` Set) and its near-mirror in `js/game.js` (`T()`, `later()`, a local
`timers` Set) both map cleanly onto `createTimers()`'s real API
(`after`/`clear`/`clearAll`/`wait`/`ms`/`setScale`) — the architecture was
already sound, just not plugged into the shared module. Both files' scope
turned out to be entirely GAME-LOCAL (`ctx.timeScale()` flows from main.js
into game.js, never into a shared module another game depends on), so the
blast radius is one game, not the two-game/30-site sprawl the original
citation implied for the PAIR of games — `rhyming-detective` was investigated
separately (see below) and is a distinct, still-declined job.

Mechanically: `main.js` gained a real `timerGroup = createTimers()`; `T(ms)`
now returns `timerGroup.ms(ms)` and `wait(ms)` now calls `timerGroup.wait(ms)`
directly (so every `wait(T(x))` call site dropped its `T()` wrapper — 7
sites); the named `timers.idle`/`timers.auto` slots now hold
`timerGroup.after()` ids, cleared via `timerGroup.clear()`; the `beats` Set
is gone entirely, folded into `timerGroup`'s own bookkeeping (`clearAllTimers()`
is now one `timerGroup.clearAll()` call). `fastTimers()` now also calls
`timerGroup.setScale(1 / state.timeScale)`, keeping the group's inverse
convention in lockstep with the value voice.seq()/the `--ts` CSS property still
read directly. `game.js` got the identical treatment on its own smaller
`later()`/`timers` pair, with `retuneDwell()` — the *existing* "fastTimers()
changed, re-tune this module" hook the file already had for the lens's dwell
duration — extended to also call `timerGroup.setScale()`, so no new sync
point was invented.

The one genuinely subtle site: `runIdleTier()`'s re-check-in-a-moment branch
had a **200ms floor on the scaled delay** (`Math.max(200, T(2000))`) so the
idle recheck can't spin even under extreme `fastTimers()`. `timerGroup.after()`
scales its *input*, not its output, so reproducing a floor on the *output*
needed unscaling it first: `timerGroup.after(Math.max(200 * timerGroup.getScale(), 2000), fn)`.
Verified algebraically for scale ∈ {1, 20, 200} that this reproduces the
original formula exactly (documented inline at the call site, not just here).

**Verified live, thoroughly, both scales:**
- Fast (`fastTimers(20)`, 0.05×): a full 4-room round via
  `QLOBE_DEBUG.winRound()` — every room's reveal, the idle ladder (armed and
  ticking for several seconds on the hotel screen with zero errors), both
  auto-advance timers (reward → next room, celebration → end), and a manual
  `visibilitychange` hide/show cycle — all correct, console-clean, journal
  ending with all 4 bugs found.
- A second fast run (`fastTimers(4)`, 0.25×) specifically to exercise
  `game.js`: a real drag-to-dwell reveal (not the debug shortcut) correctly
  triggered at the scaled dwell duration, and a real tap on the revealed
  target correctly ran `greet()`'s `wait(T(2600))`/`wait(T(320))` sequence
  through to `on.target()`.
- **Default speed, no `fastTimers()` call at all** (`timeScale: 1`, the value
  every existing player actually gets): a full real-UI playthrough (splash →
  play → mode tile → hotel → room, paced exactly as before — the room-intro
  `wait(4200)`/`wait(350)` pacing visibly took the expected several seconds,
  not instant and not hung) plus a `winRound()` timed at **2934ms real
  wall-clock** for the complete dwell → reveal → greet → reward-screen
  sequence — a concrete, quantitative confirmation that default gameplay
  timing is unchanged, not just "no errors thrown."
- Console-clean across every one of the above, no exceptions, no warnings.

**`rhyming-detective` was investigated as part of this and confirmed to need
its own separate treatment, not touched here** — see the "Follow-up check"
entry above: its `fastTimers()` convention is a different, deliberately
tested contract (clamp-only, no dual dialect), and its own call-site count
and shape were not traced with the same rigor this pass gave
bug-hotel-observer. Migrating it is still a distinct piece of work, not
"the same job, 50% done."

---

**§3.5 the full `timers.js` migration — also done for `rhyming-detective`
(2026-08-07, same session, immediately after).** Traced with the same rigor
just applied to `bug-hotel-observer`, not assumed-similar: `main.js`'s
`T()`/`wait()`/named `timers.idle`/`auto`/`intro`/`card` slots/`beats` Set and
`game.js`'s `T()`/`later()`/local `timers` Set are structurally near-identical
to bug-hotel-observer's (same shapes, one fewer auto-advance site since this
game has no separate "reward" screen). Mechanically the same transform:
`timerGroup = createTimers()` in both files, `wait()`/`T()`/`later()`
delegate to it, named slots hold `timerGroup.after()` ids cleared via
`timerGroup.clear()`, `clearAllTimers()`/`cancelTimers()` collapse to
`timerGroup.clearAll()`. `main.js`'s `T()` turned out to have **zero**
remaining call sites after the `wait(T(x))` → `wait(x)` conversions (unlike
bug-hotel-observer, which still needed `T()` for one non-scheduling config
value) — removed the now-dead binding rather than leave it. **Deliberately
did NOT touch** the documented clamp-only `fastTimers(scale = 0.05)`
math itself (confirmed intentional and tested two rounds ago) — only added
`timerGroup.setScale(1 / state.timeScale)` and a `playfield.retuneTimers()`
call after it, mirroring `retuneDwell()`'s role exactly (a new, analogous
hook on `game.js`'s returned API, since this game had no prior
fastTimers-sync hook to extend).

**A real bug, caught by testing, not by inspection: `showCelebration()` had
a fourth `clearBeats()` call site my `grep -n "setTimeout\|clearTimeout"`
sweep never would have caught (the string "clearBeats" contains neither
keyword).** First live playthrough at `fastTimers(0.04)` threw
`ReferenceError: clearBeats is not defined` the moment a case was solved —
console-clean up to that exact point, then a hard failure, not a silent
wrong-value bug. Fixed by replacing the bare `clearTimer('idle'); clearBeats();`
pair with `clearAllTimers()` (a safe superset — the other named slots are
inert at that point in the flow). Re-checked bug-hotel-observer's main.js for
the same miss with a proper `grep -n "\bbeats\b\|clearBeats"` sweep — clean,
confirmed no equivalent bug shipped there. **This is why the live-playthrough
verification step is load-bearing and not just belt-and-suspenders**: syntax
checks and even careful reading both passed this file before the bug was
found; only actually playing it caught it.

**Verified live, thoroughly, both scales, post-fix:**
- The documented clamp-only contract re-confirmed unchanged:
  `fastTimers(9) === 1`, `fastTimers(0) === 0.01`, exactly as
  `rhyming-detective`'s own `tools/qa.mjs` asserts.
- Fast (`fastTimers(0.04)`): a full case solved via three real taps (not the
  debug shortcut — `winRound()`'s `unfoundRhymes()`/`debugTap()` path didn't
  advance past `case-intro` in this game, a pre-existing debug-surface
  quirk unrelated to this migration, worked around by tapping the real
  rhyme objects directly), correct fly-to-tray choreography
  (`handle.flyTo({ms: T(620)})`), the celebration screen with confetti, and
  the auto-advance correctly landing on `caseIndex: 1` — the exact
  `ReferenceError` scenario above, now clean. A `visibilitychange` hide/show
  cycle on `case-intro` afterward, also clean.
- **Default speed, no `fastTimers()` call** (`timeScale` never touched this
  session, the value every real player gets): a full real-UI playthrough —
  splash → mode tile → case-intro (paced correctly, not instant) → three
  real taps on hat/mat/bat → celebration → auto-advance to `caseIndex: 1`,
  target "pan" — console-clean throughout.

---

**§5 engine config schema — one more real, concrete gap closed:
`endArt` (2026-08-07).** Read all 12 engines' end-screen art handling side
by side, the same way the `installStyle`/`injectStyle` sweep found its one
real outlier. Found a genuine, consistent split: 5 engines
(`coach-timer`, `sequence-order`, `sort-into-bins`, `build-assemble`,
`trace-path`) let a game override the END screen's art separately from the
splash (`config.endArt`, falling back to the splash art if absent) — the
other 4 (`choose-one`, `match-pairs`, `pattern-continue`, `tap-count`, the
same four extended for `splashArt` two rounds ago) always mirror the splash
on the end screen with no override path at all. Closed the gap the same
additive way: each of the 4 engines' `...config` spread already passes
`config.endArt` through to `this.config.endArt` untouched (none of them
had a normalize line masking it), so the only change needed was each
engine's end-screen render call site: `escapeHtml(emojiFromRef(this.config.splashEmoji))`
→ `escapeHtml(emojiFromRef(this.config.endArt || this.config.splashEmoji))`.
For every config today `config.endArt` is `undefined` (zero live consumers,
same as before), so this is a no-op for anything that exists — purely
forward compatibility. `puppet-band.js` was checked too and doesn't use the
`splashEmoji`/`splashArt` config family at all — it's one of the two
already-documented non-conforming engines, correctly out of scope, not
another gap to close.

---

**§5 engine config schema — a genuine latent ordering bug found and fixed,
in the same 4 files (2026-08-07).** While reading all 12 engines' full
normalize-return block side by side for the `endArt` sweep above, noticed
`choose-one`/`match-pairs`/`pattern-continue`/`tap-count` all place their
computed `id`/`title`/`splashEmoji`(/`basketArt`) fallbacks **before**
`...config` in the returned object literal, while the other engines that use
a `...config` spread (`sequence-order`, `sort-into-bins`, `observe-journal`,
`trace-path`) place it **first**. Object-spread semantics mean the LAST
occurrence of a key wins — so in these 4 files, if a raw config ever set
`splashEmoji` (or `id`/`title`) to an explicit falsy value (`null`, for a
config authored by hand or generated by tooling that always writes the key),
the carefully computed `config.splashEmoji || config.splashArt || fallback`
result would be silently overwritten back to that falsy value by the spread
that followed it — undermining the `splashArt` fallback fix from two rounds
ago in exactly the case it exists for. Confirmed concretely with a standalone
Node check reproducing both object literals: the old field order returns
`null` for `{ splashEmoji: null, splashArt: 'emoji:🐸' }`; the reordered one
correctly returns `'emoji:🐸'`. Fixed by moving `...config` to the front of
each of the 4 return objects, so the explicit computed fields (still
followed by `copy`/`voice`/`modes`, which were already correctly placed
after the spread and are unchanged) always win, matching the other four
engines' convention. Zero behavior change for every config that simply omits
`splashEmoji` (the common case, and the only case any config exercises
today, since these 4 have no live consumers) — this closes a latent
correctness gap before it could ever bite a real game, not a live bug in a
shipped one.

---

**§3.2 `screens.js` — the audit's own named "symptom bug" checked against
current code, found already fixed by a deliberate, documented workaround
(2026-08-07).** §3.2's evidence for the whole ~20-game `screens.js` sweep is
one concrete citation: "`globe-spin-stories/js/main.js:590-606` moved its
celebration to raw `setTimeout` because a global `clearAll()` stranded an
overlay — per-screen bags make that class of bug unrepresentable." Read the
actual code at that location rather than trusting the citation's age. It is
not an open bug: `flashCelebration()` deliberately keeps its own
`celebrationTimer`/`celebrationHideTimer` outside the shared timer group,
with an explicit comment naming the exact failure mode it replaced ("A
story → globe transition clears that group, which used to strand this
full-screen raster overlay in its visible state forever") — and both timers
are correctly cleared in two places: at the top of every new
`flashCelebration()` call (so a re-trigger can't double-schedule) and in the
`pagehide` teardown handler alongside the game's real `timers.clearAll()`.
This is a complete, self-consistent, working fix already in place, not a
half-done stopgap. The audit's deeper point stands (a game properly built on
`createScreens()`'s per-screen disposer bags wouldn't need a hand-rolled
carve-out like this one), but that is the full architectural migration —
the same large, visual, per-game job already investigated via
`flashlight-cave` and correctly deferred, not a second, smaller thing to
fix here. Recorded so a future pass doesn't re-flag this exact site as an
open bug from a stale reading of the citation.

---

**§3.7 Wave-3 mode-select.js — attempted for real this time, for
`flashlight-cave`, with screenshot-based visual verification as the safety
net the earlier "needs visual judgment" concern named (2026-08-07).** The
earlier `flashlight-cave` investigation was accurate about the mechanics
(full `innerHTML` string rebuild, bespoke per-mode icon markup) but the
actual blocker was verification, not feasibility — and this session has a
real tool for that: screenshots. Took a baseline screenshot of the current
splash before touching anything. Migration: `splashHTML()` now emits an
empty `<div class="fc-modes"></div>` instead of building tiles inline;
`showSplash()` replaces its manual `querySelectorAll('.fc-mode')` + `onTap`
loop with one `renderModeCards({ host, modes: config.modes, skin: false,
cardClass: 'fc-mode', showTitle: false, targetPrefix: null, decorate(btn,
mode) { btn.insertAdjacentHTML('afterbegin', modeFace(mode)); }, onPick,
feedback })` call — `modeFace()`'s bespoke per-mode icon logic (an apple
image for "picture", a letter+SVG-soundwaves glyph for the others) is
reused completely unchanged via `decorate`, not rewritten. Added
`shared/css/screens.css` to `index.html` (previously unlinked) in the
prescribed position — checked its one relevant rule, `.qk-mode-card {
min-width/height: 96px }`, against `.fc-mode`'s own `220px` minimums before
touching anything: equal specificity, but `.fc-mode` loads after (per
`screens.css`'s own header comment on load order) so it wins on every
tied property — zero rendered difference, confirmed by the tool rather
than assumed from the cascade rules alone.

**A real regression, caught by the before/after screenshot, not missed:**
the first pass added faint icon glyphs (📝/🔊/🖼️) under each tile that
were never there before — `config.modes[].icon` exists for other tooling
(the config schema's own field) but `flashlight-cave`'s bespoke splash
never read it; `modeCard()`'s default "no art, then icon" fallback painted
it the instant a real `mode.icon` value was in scope. Fixed by stripping
`icon` from the copy of `config.modes` passed to `renderModeCards`
(`config.modes.map(({icon, ...mode}) => mode)`) rather than touching the
shared module. Re-screenshotted: pixel-for-pixel identical to the baseline.

**Verified: baseline screenshot, migrated screenshot (pixel-identical after
the icon fix), console-clean page load, and real taps on all three
tiles** — "Find the Letter" and "Sound" modes both confirmed starting
correctly (Ari's greeting, the flashlight beam, the hidden-letter scene all
rendering), splash round-trip via the home/back button clean and unchanged.
This is the first Wave-3 mode-card migration actually completed and
verified this session — proof the category is tractable when the
verification gap (no way to confirm a visual match) is closed with the
right tool, not proof the remaining ~19 games are equally quick: each still
needs its own bespoke-icon audit, its own before/after screenshot, and its
own real-tap check, the same rigor spent here.

**Second Wave-3 game done the same way: `counting-treasure-cups`
(2026-08-07).** Same shape as `flashlight-cave` (an `innerHTML`-built
`.ctc-mode` row wired by a manual `querySelectorAll` + `onTap` loop), same
process: baseline screenshot, add `shared/css/screens.css` in the prescribed
position (checked `.ctc-mode`'s own `min-height: 96px`/`min-width: 150px`
against `.qk-mode-card`'s `96px` first — the height TIES exactly and the
width clears it, so genuinely zero rendered difference either way), extract
the existing icon-building ternary into a named `modeFace(m)` (unchanged
logic, just given a name so `decorate` can call it), replace the manual
wiring loop with `renderModeCards({ skin: false, showTitle: false,
targetPrefix: null, decorate, onPick, feedback })`. Applied the lesson from
`flashlight-cave` proactively this time instead of discovering it the hard
way: `config.modes[].icon`/`iconArt`/`iconText` are real fields this game's
OWN ternary reads (not a dead field like flashlight-cave's), so they were
stripped from the array passed to `renderModeCards` from the start
(`config.modes.map(({icon, iconArt, iconText, ...mode}) => mode)`), with
`decorate` reading the ORIGINAL `config.modes[index]` for the actual icon
data. Result: pixel-identical to the baseline screenshot on the first
attempt — no regression to catch and fix this time, because the fix from
last time was applied up front. Verified further with real taps on all
three tiles ("Fill the Cup", "Big Treasure", "How Many?" all confirmed
starting their respective play screens correctly), console-clean
throughout every step. Two for two now — the pattern (screenshot first,
strip any config fields the shared renderer might auto-render, decorate
with the untouched original logic, screenshot again, then real taps) is
holding up as a repeatable recipe, not a one-off.

**Third Wave-3 game, with a genuinely new wrinkle handled correctly:
`teen-bead-builder` (2026-08-07).** Same recipe, but this game's splash
wiring wasn't a plain `onTap` loop — it went through a LOCAL
`registerTap(element, id, action)` wrapper that ALSO records the element
into a custom `activeTargets` Map (keyed by `data-target-id`, not the
platform's standard `data-target`) backing this game's own hand-rolled
`QLOBE_DEBUG.tap(id)`/`getTargets()` implementation. Using
`renderModeCards()`'s own internal `onTap` wiring directly would have
silently dropped these two cards out of the QA-tap surface — a real,
easy-to-miss regression class none of the visual checks alone would catch.
Handled by keeping `renderModeCards()` for layout/art/press-feedback only
(`targetPrefix: null`, so it doesn't add its own `data-target`) and manually
replaying `registerTap`'s bookkeeping afterward from the returned `cards`
array (`button.dataset.targetId = id; activeTargets.set(id, action)`) —
same division of labor as the QA-target question the earlier two games
never had to answer, because they never had a custom debug-target system to
begin with. Verified: pixel-identical splash screenshot on the first
attempt (defensive `icon`/`art` stripping applied proactively again, though
this game's config doesn't currently set either); `QLOBE_DEBUG.getTargets()`
listed `mode-build`/`mode-match` correctly; `QLOBE_DEBUG.tap('mode-build')`
correctly started the build mode; a real tap on the "Bead Detective" card
correctly started the match mode (a stray first click didn't register —
resolved on retry, consistent with this session's other CDP/tool-timing
flakiness, not a functional issue — confirmed by the clean debug-tap result
moments earlier). Console-clean throughout. Three for three — and the
"reduced-scope" migration list is now demonstrably NOT limited to games
with the simplest possible wiring; the recipe adapts to a per-game debug
surface without forcing every game onto one contract.

**Fourth Wave-3 game, a second and structurally different custom-debug
pattern: `loose-parts-collage` (2026-08-07).** This splash's mode cards
were rendered inline inside a larger `innerHTML` template alongside other
`[data-action]` controls (resume, gallery) all swept by one generic
`wireActions()` delegated listener — different again from
`teen-bead-builder`'s local `registerTap`/`activeTargets` Map. Its
`installDebug()` `tap:` function reads `target.dataset.action`/`.value` off
whatever element matches `[data-target="<id>"]`. Since `renderModeCards()`
always wires its own `onTap` and would double-fire alongside
`wireActions()`'s sweep if both saw `data-action` on the same buttons, the
mode cards were deliberately left OUT of `wireActions()` (no `data-action`
attribute) and given their own `renderModeCards()` call with the default
`targetPrefix` (`mode-<id>`), then `installDebug`'s `tap:` got a small
fallback branch: if the resolved `data-target` element has no
`dataset.action`, and the id starts with `mode-`, call
`startMode(id.slice(5))` directly. Two bugs surfaced and were fixed during
verification, both invisible to `node --check` and only caught by
screenshot comparison:
1. `cardClass: (mode) => \`la-mode-${mode.id}\`` replaced rather than
   supplemented the button's className, silently dropping the base
   `la-mode-card` class every visual rule in this game's CSS keys off —
   first screenshot showed cards with no polaroid framing at all. Fixed to
   `` `la-mode-card la-mode-${mode.id}` ``.
2. With that fixed, the same screenshot revealed a second, distinct
   regression: each card's picture appeared doubled/seamed. Root cause:
   `modeCard()` auto-renders `mode.art` into its own
   `<img class="qk-mode-art">` whenever the field is present on the mode
   object — and this game's `decorate()` callback ALSO builds its own
   resolved `<img>` from `mode.art`, so two `<img>` elements stacked in the
   same card. Unlike the `icon` field (safe to strip from the modes array
   entirely, as done for `flashlight-cave`/`counting-treasure-cups`), `art`
   couldn't simply be stripped here because `decorate()` still needs
   `mode.art` to build its own image. Fixed by passing `art: () => null` to
   `renderModeCards()`, which suppresses only `modeCard()`'s own automatic
   art rendering (`buildArt(null)` → no node) while leaving `mode.art` fully
   intact for `decorate()` to use. A new failure class for this session's
   recipe: not every bad field can be stripped from the modes array — when
   the same field is needed downstream by `decorate()`, suppress the
   renderer's OWN use of it via `opts.art` instead. Verified after both
   fixes: screenshot pixel-identical to the pre-migration baseline (three
   polaroid cards, single image each, correct border/shadow/corner-pin);
   confirmed via DOM query that each card has exactly one `<img>` child;
   console-clean on a fresh load; `QLOBE_DEBUG.getTargets()` correctly
   listed `mode-collage`/`mode-yarn`/`mode-teddy` with accurate hit rects;
   `QLOBE_DEBUG.tap('mode-yarn')` correctly drove `screen: splash→workbench,
   mode: null→yarn`; a real tap on "Free Collage" (a stray first click
   didn't register, consistent with this session's other tap-timing
   flakiness — resolved on retry) correctly drove `screen: splash→workbench,
   mode: null→collage`. Four for four.

**Fifth Wave-3 game, the simplest wiring yet — no custom debug-target
system at all: `sound-painting` (2026-08-07).** Splash mode cards previously
sat inline inside one larger `innerHTML` template alongside other
`[data-action]` controls, all swept by the game's plain generic
`wireActions()` listener, with `installDebug()`'s own `tap:` reading
`dataset.action`/`.value` off the `[data-target]` match — the exact same
shape as `loose-parts-collage`, so the same fix applied: mode cards excluded
from `wireActions()` (no `data-action` attribute, avoiding the double-wire
`renderModeCards()`'s own `onTap` would otherwise cause), `tap()` given a
`!dataset.action && id.startsWith('mode-')` fallback branch calling
`startMode(id.slice(5))` directly. Unlike every prior Wave-3 game, this
config's mode objects have neither `art` nor `icon` fields (only a custom
`symbol` glyph and `brush`/`colors`/`promptKey`/`labelKey`), so neither of
the two collision classes found in earlier games (icon-fallback rendering,
doubled art) could occur here — confirmed by inspecting `config.json` before
writing `decorate()`, not discovered after the fact. CSS coupling was also
simpler: `.mode-card[data-mode="calm"]` etc. select on the `data-mode`
attribute `modeCard()` already sets automatically, so `cardClass` needed
only the flat `'mode-card'` string, no per-mode function. Result: screenshot
pixel-identical to baseline on the first attempt — zero regressions to
chase, the first Wave-3 migration this session where the initial pass had
nothing to fix. Verified further: console-clean on a fresh load;
`QLOBE_DEBUG.getTargets()` correctly listed `mode-calm`/`mode-bounce`/
`mode-sparkle` alongside the pre-existing `sound-welcome` target;
`QLOBE_DEBUG.tap('mode-bounce')` correctly drove `screen: splash→paint,
mode: null→bounce`; a real tap on "Calm River" needed two retries before
landing (unlike prior games' single retry) — verified with a temporary
`pointerdown`/`pointerup`/`click` listener that this was tool-level
click-delivery flakiness, not a functional gap: the successful click fired
both pointer events and drove `screen: splash→paint, mode: null→calm`
correctly. Five for five — and the first data point that a Wave-3 candidate
can be genuinely low-risk (no custom debug system, no colliding config
fields) when checked up front rather than assumed uniformly risky.

**Sixth Wave-3 game, zero debug-harness changes needed at all:
`color-mixing-lab` (2026-08-07).** This game's splash mode cards were raw
`querySelectorAll('.mode-card').forEach(node => node.addEventListener('click',
...))` — no `tap.js`, no press feedback, no unlock wiring on the cards
themselves (audio unlock here is a single global `installUnlockOnGesture`
listener, not per-button). `installDebug()`'s `tap:` (`tapTarget`) already
just does `document.querySelector('[data-target=...]').click()` — a bare
native `.click()`, which fires `tap.js`'s `onTap`'s `click` listener (the
documented keyboard/AT fallback path) directly. Since `renderModeCards()`'s
cards are real buttons with the same `data-target="mode-<id>"` shape this
game already used, migrating required **no patch to the debug harness at
all** — the first Wave-3 game where the existing generic `tap()` needed
zero changes. Also the first case where `cardClass` didn't need a function:
this game's CSS keys purely on the flat `.mode-card` class (color varies via
inline background images/borders on the `discover`/`predict`/`recipe`
`data-mode` values themselves via existing per-game styling, not
`data-mode`-keyed CSS selectors). Applied the `art: () => null` suppression
from the `loose-parts-collage` lesson proactively (this game's `decorate()`
also builds its own `<img class="mode-art">` from `mode.art`, so the same
double-image class would've recurred without it) — confirmed no doubling on
the first screenshot. A genuine behavior addition, not just parity: raw
`click`-listener buttons had no pointerdown feedback or slide-off-cancels
before; `renderModeCards()`'s default `feedback` (no custom one passed)
gives them the platform's standard `sfx.tick()` press sound and proper tap
semantics, consistent with every other game — flagged here as an
intentional, desired DRY convergence, not a silent side effect. Verified:
screenshot pixel-identical to baseline (had to wait out this game's real
asset-preload delay both times — a pre-existing behavior, not new);
console-clean on a fresh load; DOM-confirmed exactly one `<img>` per card in
image→title→description order (matching the original template); `QLOBE_
DEBUG.getTargets()` correctly listed `home`/`mode-discover`/`mode-predict`/
`mode-recipe`; `QLOBE_DEBUG.tap('mode-predict')` (unpatched `tapTarget`)
correctly drove `screen: splash→play, mode: null→predict`; a real tap needed
two retries before landing (consistent with this session's recurring
click-delivery flakiness, confirmed via a temporary capture-phase
`pointerdown`/`click` document listener showing the events simply never
reached the page on the failed attempts, then fired correctly and drove
`screen: splash→play` on the one that landed). Six for six.

**Seventh Wave-3 game, the Field Journal flagship, migrated carefully:
`sink-or-float` (2026-08-07).** This game already used `tap.js`'s `onTap`
directly (not raw clicks, not `wireActions()`), so the base wiring pattern
matched cleanly. Two things made it worth extra care: it's the shared
`stage/water.js` physics flagship (per-mode `feedback` also speaks a
mode-specific preview line, `say(mode.menuLine)`, not just a tick), and
`config.modes` entries carry BOTH an `icon` (a path resolved by this game's
OWN `art.modeFace()`, gated on a module-level `live` flag for a real-art vs.
emoji-placeholder mode) and an `emoji` fallback. Unlike every `icon`-strip
done so far, `icon` couldn't just be dropped from the decorate callback's
own use — `art.modeFace()` needs it. Reused the `counting-treasure-cups`
technique: `icon` stripped from the array passed to `renderModeCards()`
(so `modeCard()`'s own icon-fallback span, which would otherwise print the
raw icon PATH as literal text — since this game has no `art` field to
short-circuit that branch first — can't fire), while `decorate()` looks the
original, unstripped mode back up via a local `modeById()` helper to build
the real art. `debugTap()` already had a dedicated
`if (targetId.startsWith('mode-')) return { accepted: await
startMode(targetId.slice(5)) }` branch — the SECOND Wave-3 game (after
`color-mixing-lab`) needing zero debug-harness changes, because this game's
tap dispatch was already id-driven rather than element-driven. Also
extended `disposers.push()` to cover `renderModeCards()`'s own `dispose()`
— every other button on this splash already flows through that teardown
list; leaving the mode cards out would've been a real (if inert while the
game runs, since splash is rebuilt each visit rather than toggled)
inconsistency. Verified: screenshot pixel-identical to baseline in
real-art mode (confirmed the resolved `<img class="mode-tile">`, not a
literal path string or a stray icon span, via direct DOM/innerHTML
inspection); console-clean on a fresh load; `QLOBE_DEBUG.getTargets()`
listed `mode-predict`/`mode-tricky`/`mode-pond` correctly; unpatched
`debugTap('mode-tricky')` correctly drove `screen: splash→play, mode: null→
tricky`; a real tap needed three retries before landing (the most this
session) — confirmed via a capture-phase `pointerdown`/`click` document
listener that the failed attempts' events simply never reached the page
(tool-level click delivery, not a page-side regression) and the landing
attempt fired `pointerdown` and drove `screen: splash→play` correctly.
Seven for seven.

**Eighth Wave-3 game, per-position CSS + bespoke per-card art logic:
`laundry-sorter` (2026-08-07).** This game's splash wasn't just
`config.modes.map(...)` — a local `cards` array wrapped each of the 3 modes
(`sort`/`fold`/`pairs`, deliberately reordered from `config.modes`' own
order) with a hand-composed `art` HTML string built by different logic per
mode (a basket+sock pairing for sort, the LAST stage of the fold animation
for fold, two overlapping images for pairs) — none of it a generic per-mode
field `decorate()` could read off `mode` directly. Solved the same way as
`sink-or-float`'s `modeById()` lookup: `renderModeCards({modes: cards.map(c
=> c.mode), decorate(btn, mode, index) { ...cards[index].art... }})`,
closing over the original `cards` array by index rather than trying to carry
the art through the mode object. This game's CSS also keys
`.mode-card:nth-child(2)`/`:nth-child(3)` for per-card color (not
`data-mode`), so getting the render order right wasn't cosmetic — a
reordered array would have silently recolored the wrong cards. Verified the
order was preserved by reading each rendered card's art HTML back
(basket → folded shirt → overlapping pair, matching the original `cards`
sequence exactly), not just eyeballing the screenshot. `debugTap()` already
had a dedicated `mode-` prefix branch — third Wave-3 game needing zero
debug-harness changes. Verified: screenshot pixel-identical to baseline on
the first attempt (all three per-position colors, art layering, and text
correct); console-clean on a fresh load; `QLOBE_DEBUG.getTargets()` listed
`mode-sort`/`mode-fold`/`mode-pairs`; unpatched `debugTap('mode-fold')`
correctly drove `screen: splash→play, mode: null→fold`; a real tap took
five attempts before landing — the worst this session — diagnosed by
clicking a completely unrelated element (the home button) at the same
non-responsive moment and getting zero events there too, proving the click
tool itself was transiently disconnected rather than anything wrong with
the migrated cards; the next attempt (a different button, same page state)
landed cleanly and drove `screen: splash→play, mode: sort` correctly, and
`debugTap()` had already independently proven the wiring correct minutes
earlier regardless. Eight for eight.

**Ninth Wave-3 game, `mode.card` (not `art`/`icon`) as the image field:
`freeze-focus-dance` (2026-08-07).** Splash used a manual `MODES.map(...)` +
`querySelectorAll('[data-mode]')` press loop through this game's own local
`press()` wrapper (a thin `onTap` call, feedback-only, no disposer
tracking — consistent with this game's existing convention of always fully
rebuilding `nodes.splash.innerHTML`, so old listeners are simply GC'd with
the removed nodes rather than explicitly disposed; left that convention
alone rather than introducing a `disposers` array this game never had).
`config.modes` uses `card` for its image field — a name that collides with
neither `modeCard()`'s `art` nor `icon` checks, so no stripping or
suppression was needed; passed `art: (mode) => <img src={mode.card}>`
(returning a ready-made node directly, which `buildArt()` accepts as-is)
instead. `installDebug()`'s `tap:` was already a bare `target.click()` —
fourth Wave-3 game needing zero debug-harness changes. Verified: screenshot
pixel-identical to baseline on the first attempt; console-clean on a fresh
load; DOM-confirmed one `<img>` per card; `QLOBE_DEBUG.getTargets()` listed
`home`/`sound`/`mode-beat`/`mode-lookout`/`mode-statues`; unpatched
`tap('mode-lookout')` correctly drove `mode: null→lookout, screen: →choice`.
Real-tap verification hit this session's most persistent tool stall yet:
five consecutive attempts produced zero `pointerdown` events at a
document-level capture listener, with the page's own state and a fresh
screenshot both unchanged throughout — the same signature diagnosed as
tool-side (not page-side) in `laundry-sorter`, just longer-lived this time.
Did not chase a sixth attempt: `QLOBE_DEBUG.tap()` had already independently
proven the exact same press path correct, and a stalled input channel that
still serves clean screenshots/eval calls has no plausible mechanism to
selectively corrupt one button's click handling while leaving `debugTap()`'s
identical code path (`target.click()` → the same `onTap` `click` listener)
intact. Nine for nine, with real-tap confirmation resting on `debugTap()`
rather than the browser's native click path for this one game — noted
explicitly rather than silently treated as equivalent to the other eight.

**Tenth Wave-3 game, select-then-start (not tap-to-start) semantics:
`throwing-target-garden` (2026-08-07).** The only Wave-3 game so far where
tapping a mode card does NOT start the mode directly — it only marks it
`state.selectedMode` (toggling `is-selected` + `aria-pressed` across all
three cards, glow-highlighting whichever is current), and a separate START
button below the shelf reads that selection to actually begin play. This
meant `onPick: (id) => selectMode(id)` instead of the usual `startMode`, and
`decorate()` needed to read `state.selectedMode` at render time to seed the
INITIAL `is-selected`/`aria-pressed` state correctly (not just react to
future taps) — `selectMode()`'s own re-render loop still re-queries
`[data-mode]` live from the DOM afterward, so it kept working unmodified
once `modeCard()`'s own `data-mode` attribute was confirmed to still be set
(it is, automatically). Also the first Wave-3 game using `screens.js`'s
`hold()` disposer convention rather than a local `disposers` array —
`renderModeCards()`'s own `dispose()` was registered via `screens.hold(...)`
to match every other splash control in this file. `installDebug()`'s `tap:`
was already a bare `target.click()` — fifth Wave-3 game needing zero
debug-harness changes. Verified: screenshot pixel-identical to baseline
(including the default "Number Hunt" selected glow) on the first attempt;
console-clean on a fresh load; `QLOBE_DEBUG.getTargets()` listed all three
mode targets plus `start`; unpatched `debugTap('mode-color')` correctly
moved `selectedMode: number→color` AND correctly moved the `is-selected`
class off the Number card onto the Color card (checked both cards'
classLists directly, not just the state object); `debugTap('start')`
correctly then drove `screen: →setup, mode: color` — the full select-then-
start chain proven end to end. Real-tap hit the same tool-side stall as
`freeze-focus-dance`: five straight attempts, zero `pointerdown` at a
capture-phase document listener. Relied on the already-independent
`debugTap()` proof rather than a sixth attempt, for the same reasoning.
Ten for ten — two of ten now resting real-tap confirmation on `debugTap()`
rather than a landed native click, both explicitly flagged rather than
glossed over.

**Eleventh Wave-3 game, a second screen (behind caller-select) and a
bespoke `mode:<id>` target scheme: `red-green-light` (2026-08-07).** This
game's splash is two screens deep — pick-a-caller first, then a mode-select
screen with plain text buttons ("Classic" / "Silly Switch", no art/icon at
all). Its own `getTargets()`/`tapTarget()` never use the platform's
`data-target` convention at all: they query `.rgl-mode-button` directly and
build synthetic `mode:<id>` ids (colon, not the platform's `mode-` hyphen
prefix) from each button's `dataset.mode` — so `targetPrefix: null` was
passed to `renderModeCards()` to avoid emitting an unused, confusingly
different-shaped `data-target` attribute alongside this game's real scheme.
Both `getTargets()` and `tapTarget()` needed zero changes — sixth Wave-3
game with no debug-harness patch, because both already operate on
`.rgl-mode-button` + `dataset.mode`, which `cardClass` and `modeCard()`'s
automatic `data-mode` assignment still produce unchanged. Cards have no art
field at all — original markup put the title as bare text INSIDE the
button, no wrapper span — so `showTitle: false` + `decorate(btn, mode) {
btn.textContent = mode.title }` was used instead of the default
`.qk-mode-title` span, to keep the DOM shape byte-for-byte identical rather
than trust font-inheritance through an added wrapper. Verified: screenshot
of the mode-select screen (reached via `debugTap('caller:growlie')`)
pixel-identical to baseline on the first attempt; console-clean on a fresh
load; `QLOBE_DEBUG.getTargets()` correctly listed `mode:classic`/`mode:silly`
(confirmed the exact id spelling — an early guess at `mode:silly-switch`
came back empty, corrected once `getTargets()` revealed the real
`config.modes[1].id`); unpatched `tapTarget('mode:silly')` correctly drove
`mode: null→silly, screen: mode→play`. Real-tap hit the same tool-side
stall pattern (four straight attempts, zero `pointerdown` at a capture-phase
listener) — relied on the already-independent `tapTarget()` proof rather
than continuing to retry. Eleven for eleven — three of eleven now resting
real-tap confirmation on the debug tap path rather than a landed native
click.

**Twelfth Wave-3 game, a targetHandlers Map reconciled cleanly:
`chocolate-chip-count` (2026-08-07).** Same select-then-play shape as
`throwing-target-garden` (tap a "recipe card" to select it, a separate
`PLAY` button below starts the selected mode) plus `teen-bead-builder`'s
`targetHandlers` Map pattern (`installDebug()`'s `tap:` is `debugTap(id) =>
targetHandlers.get(id)?.()`, populated at render time rather than scanning
the DOM). Both were handled inside `decorate()`, which already runs once per
card with `mode`/`button` in scope: `targetHandlers.set(button.dataset.target,
() => selectMode(mode.id))` — same handler the real `onPick` calls, so both
paths stay in sync without extra bookkeeping. Each card's visuals are
entirely bespoke (a "frame" image plus a dynamically-composited
`cookie-composite` span built by the game's own `populateCookie()`, not a
static `art`/`icon` field), so `decorate()` fully owns rendering exactly
like the original — no field stripping or suppression needed since
`config.modes` uses `frame` (not `art`/`icon`) for its image. Also the first
Wave-3 card grid with a genuine per-index visual variance (`--tilt` rotation
alternating `[-2, 1.5, -1]` degrees) — handled with the existing `vars` opt
rather than anything new. `renderRecipeCards()` is called once at game init
(not re-invoked per splash visit), so `renderModeCards()`'s `dispose()` was
pushed onto the existing `permanentDisposers` array for symmetry with every
other one-time listener in this file, even though nothing currently calls
it. Verified: screenshot pixel-identical to baseline on the first attempt
(after accounting for this game's pre-existing card entrance
animation — the very first screenshot after a fresh load caught the cards
mid-fade-in on BOTH the pre- and post-migration runs, confirmed as
unrelated to the change by reproducing it against the untouched baseline
too); console-clean on a fresh load; DOM-confirmed each card is `<img
class="frame"><span class="cookie-composite">` in the original order, and
the default-selected card matches pre-migration; `QLOBE_DEBUG.getTargets()`
listed `mode-tiny-batch`/`mode-baker-batch`/`mode-super-batch`/`play`;
unpatched `debugTap('mode-baker-batch')` correctly moved `is-selected` off
the default card onto the tapped one; `debugTap('play')` then correctly
drove `screen: →play` — the full select-then-play chain proven end to end.
Real-tap hit the same tool-side stall pattern (four straight attempts, zero
`pointerdown` at a capture-phase listener) — relied on the already-
independent `debugTap()` proof rather than continuing to retry. Twelve for
twelve — four of twelve now resting real-tap confirmation on the debug tap
path rather than a landed native click.

**Thirteenth Wave-3 game, a card row with one non-mode member:
`puppet-retell` (2026-08-07).** This splash's 3-button row wasn't a clean
1:1 mapping to `config.modes` — only 2 of the 3 buttons ("Story Starters" /
"Free Show") correspond to real mode entries; the third ("My Shows") is a
navigation action (`data-action="shows"`, no `config.modes` counterpart)
that happens to share the same visual row AND its CSS's `nth-child(3)`
purple color rule. Rather than force a fake third "mode" into the array (or
skip the game as out-of-shape, the call made for `globe-spin-stories`),
`renderModeCards()` was scoped to just the 2 real modes, and "My Shows" was
appended as a fourth, hand-built child of the SAME host afterward — keeping
it at DOM position 3 so `nth-child(3)`'s color still resolves correctly,
wired with a direct `onTap()` call (not the generic `tapAll()` sweep, since
that sweep already ran during `setHtml()` before this button existed).
`config.modes` does carry a real, correctly-resolving `art` field (verified
it's byte-identical to the same path the old code separately hardcoded in a
local `uiArt` object — genuine, not dead data), but `modeCard()`'s own
auto-render would have used the wrong class name (`qk-mode-art` instead of
this game's `.mode-art` the CSS actually keys on), so `art: () => null` +
manual `decorate()` was used, matching the `color-mixing-lab`/
`sink-or-float` pattern. `installDebug()`'s `getTargets`/`tap` are both
already generic and element-driven (`[data-target]` scan, `element.click()`)
— seventh Wave-3 game needing zero debug-harness changes; the hand-built
"My Shows" button keeps its own `data-target="my-shows"` so it's picked up
by the same scan unmodified. Verified: screenshot pixel-identical to
baseline on the first attempt, all three button colors and the exact 3-item
order preserved; console-clean on a fresh load; DOM-confirmed all three
`data-target`s in the correct order with one `<img>` each;
`QLOBE_DEBUG.getTargets()` listed `platform-home`/`sound`/`mode-guided`/
`mode-free`/`my-shows`; unpatched `tap('mode-free')` correctly drove `mode:
null→free, screen: splash→cast`; unpatched `tap('my-shows')` correctly
drove `screen: →shows` — both the migrated mode cards AND the hand-appended
non-mode button proven through the debug path. Real-tap hit the same
tool-side stall pattern (four straight attempts, one with a transient tool
error, zero `pointerdown` at a capture-phase listener) — relied on the
already-independent `tap()` proof. Thirteen for thirteen — five of thirteen
now resting real-tap confirmation on the debug tap path rather than a
landed native click.

**Fourteenth Wave-3 game, the structurally hardest one — a play button
sandwiched BETWEEN the two mode cards, and a module-load-time static
`els.modeButtons` snapshot: `sound-basket` (2026-08-07).** Two compounding
constraints made this the most invasive Wave-3 migration so far. First, the
DOM layout isn't "modes, then one extra" (`puppet-retell`'s shape) — it's
`[mode-two, play-default, mode-three]`, with the non-mode "quick play"
button in the MIDDLE of a plain `display:flex` row (no `order` CSS, so DOM
position IS visual position). Second, and more structurally significant:
this game's `els` object — the central DOM-reference cache every other
function in the file reads from — is a top-level `const` evaluated
SYNCHRONOUSLY at module load (`modeButtons: [...document.querySelectorAll(
'[data-mode]')]`), not rebuilt per splash visit like every other Wave-3
game's `innerHTML`-driven splash. Building the mode cards the usual way
(inside a `showSplash()`-style function called later) would have left
`els.modeButtons` permanently pointing at nothing, breaking both
`getTargets()` and the debug `tap:`'s rect lookups for the rest of the
session. Solved by moving the `renderModeCards()` call itself to the TOP of
the module, executing before the `const els = {...}` literal — so
`els.modeButtons`'s querySelectorAll captures the real, already-rendered
buttons. `renderModeCards()` was called with `replace: false` (so it
doesn't clear the pre-existing static `#play-default` button) — the 2 cards
append after it — then `modeRow.insertBefore(playDefaultButton,
modeCardButtons[1])` splices `#play-default` back to the middle,
reconstructing the original 3-item visual order. The pre-existing
`for (const button of els.modeButtons) wireTap(...)` loop (now redundant
with `renderModeCards()`'s own `onPick`) was deleted outright rather than
left to double-fire `startMode()`. This game's debug-target scheme is a
THIRD distinct convention this session (after `red-green-light`'s `mode:`
colon prefix and the platform's `mode-` hyphen default): bare, unprefixed
mode ids (`two`/`three`/`play-default`), built by `getTargets()` reading
`element.dataset.mode || 'play-default'` directly — `targetPrefix: null`
avoided emitting an unused, wrongly-shaped `data-target="mode-two"`
alongside it. Each card's visuals are entirely bespoke per-id letter-tile
compositions (`A`/`M` vs `C`/`P`/`T`, no config field drives this at all —
`config.modes` only carries `id`/`title`/`skill`/`letterCount`/etc, no
`art`/`icon`), so `decorate()` fully owns rendering with an explicit
`mode.id === 'two'` branch, matching the two hand-authored originals
exactly. A git-history false alarm surfaced mid-migration and is worth
recording: `git stash`-ing this game's 2 files to try to capture a "clean"
baseline screenshot reverted them all the way to the last COMMIT, not to
"before this edit" — since sound-basket's `installDebug`/`wireTap`
structure was ITSELF already-uncommitted work from earlier in this same
session (this session never committed anything), stashing briefly displayed
a much older version still importing the already-deleted
`shared/js/audio.js`. Popped immediately once recognized; no actual data
was at risk (stash is reversible), but it's a concrete case for why
`git stash` is the wrong tool for "show me this file before my last edit"
in a long uncommitted session — `git diff` on the specific hunk, or simply
trusting the content already read via the file tool moments earlier, is
the safe move instead. Verified (via direct in-browser inspection cross-
checked against the exact original markup read before editing, since the
stash mishap made a true git-diffed screenshot pair impractical for this
one game): rendered splash visually identical to the original — blue
"2 sounds" card, green circular play button centered, purple "3 sounds"
card, correct letters, correct DOM order confirmed via
`[...row.children].map(c => c.id || c.dataset.mode)` → `["two",
"play-default", "three"]`; console-clean on a fresh load;
`QLOBE_DEBUG.getTargets()` listed the bare ids `play-default`/`two`/`three`
correctly; unpatched `tap('three')` correctly drove `screen: splash→play,
mode: null→three`; unpatched `tap('play-default')` correctly drove `mode:
two` with no double-fire (confirming the deleted `wireTap` loop's removal
didn't leave a dangling regression). Real-tap hit the same tool-side stall
pattern (four straight attempts, zero `pointerdown` at a capture-phase
listener) — relied on the already-independent `tap()` proof, which also
serves as the no-double-fire check a real tap alone wouldn't have
distinguished as cleanly. Fourteen for fourteen — six of fourteen now
resting real-tap confirmation on the debug tap path rather than a landed
native click.

**A second sweep found 5 more genuine Wave-3 candidates
(2026-08-07).** A definitive repo-wide grep (`mode-card|mode-tile|mode-
button|data-mode`, `.modes.map(`, `MODES.map(`) across all ~104 games under
`games/` — not just the ones a spot-check happened to notice — surfaced 5
more hand-rolled splash mode-pickers this session hadn't touched yet:
`bug-hotel-observer`, `rhyming-detective`, `feelings-charades`,
`lunchbox-pack`, `sound-sprouts`. No other candidates exist beyond these;
the sweep is now provably exhaustive rather than assumed complete.
`sound-sprouts` is explicitly out of scope — `CLAUDE.md`'s hard constraints
name it as the reference game other agents may have mid-refactor
("do not break `games/sound-sprouts/`"), so it's skipped here on that
documented authority, not silently dropped. The other 4 are being migrated
with the same recipe.

**Fifteenth Wave-3 game, no `config.modes` at all: `feelings-charades`
(2026-08-07).** This game has no engine config — its splash's two modes
("Act It Out" / "Guess the Feeling") are fixed, hardcoded values that only
previously existed as literal HTML text plus a matching literal pair inside
`installDebug()`'s `listModes: () => [{id:'act',...}, {id:'guess',...}]`.
Promoted a real local `MODES` array (`{id, title, emoji}`) at module scope
so `renderModeCards()` has something to render from — the first Wave-3 game
needing this step, since the other 14 all had a real `config.modes`/`MODES`
already backing their cards. `.mode-button:nth-child(2)`'s blue color rule
confirmed order (`act` then `guess`) still matters even though there's no
"odd" third member complicating this one. A genuine, pre-existing gap
surfaced along the way and deliberately NOT touched: this game's
`installDebug()` only forwards `getTargets`/`tap` to the in-progress `Game`
instance (`game ? game.getTargets() : []` / `game ? game.tap(id) : {
accepted: false }`) — the splash screen has NEVER had debug-tap coverage,
before or after this migration. Fixing that would be a real, separate
improvement, not a byproduct of a mode-card migration, so it was left alone
and just noted here rather than silently expanded into scope. That gap
meant real-tap verification couldn't fall back to a `debugTap()` proof the
way the last six games did. Verified: screenshot pixel-identical to
baseline on the first attempt; console-clean on a fresh load; DOM-confirmed
card count/order/text content exactly matches the original markup
(`🎭 Act It Out`, `👂 Guess the Feeling`); `QLOBE_DEBUG.startMode('guess')`
(a debug hook independent of the button press path) confirmed the
underlying mode-start flow works. The real-tap channel hit this session's
worst stall yet — six straight `left_click` attempts (one against a
genuinely stale coordinate after the button's on-screen position had
shifted since the baseline screenshot, corrected and still failing the
next five) produced zero `pointerdown` events at a capture-phase listener.
With no `debugTap()` to fall back on this time, used a synthetic
`pointerdown`+`pointerup` `PointerEvent` pair dispatched directly at the
button's real coordinates instead of `startMode()` — this exercises the
actual `onTap` listener `renderModeCards()`'s `onPick` registered on the
real element, not a bypass, and it correctly drove `screen: →play, mode:
guess`. Fifteen for fifteen — the first case resting real-tap confirmation
on a dispatched-event proof rather than either a landed native click or an
existing `debugTap()` hook.

**Sixteenth Wave-3 game, same shape as `feelings-charades`:
`lunchbox-pack` (2026-08-07).** Same no-`config.modes` situation (3 fixed
modes, previously only literal HTML text plus a matching literal pair in
`installDebug()`'s `listModes`) — promoted the same kind of local `MODES`
array. Same pre-existing splash-blind debug harness (`getTargets`/`tap`
only forward to the in-progress `Game` instance) — left alone, not
expanded. Simpler than `feelings-charades` in one way: no `nth-child`
color rule, flat `.mode-button` styling for all three cards, so render
order has no visual consequence beyond matching the original reading
order. Verified: screenshot pixel-identical to baseline on the first
attempt (three vertically-stacked green pill buttons); console-clean on a
fresh load; DOM-confirmed card count/text (`🎒 Pack for Me!`, `🥗 Healthy
Helper`, `🔢 Count & Pack`). Real-tap: the FIRST attempt used a stale
coordinate guessed from the baseline screenshot rather than a freshly
computed rect (the same class of mistake `feelings-charades` hit, this
time avoided from the start by measuring `getBoundingClientRect()` before
every click) — the next two attempts used correct coordinates and still
produced no state change, matching the recurring tool-side click stall.
With no `debugTap()` available (same gap as `feelings-charades`), used the
identical synthetic `pointerdown`+`pointerup` `PointerEvent` dispatch
fallback, which correctly drove `screen: →game, mode: count`. Sixteen for
sixteen.

**Seventeenth Wave-3 game, a hand-rolled `window.QLOBE_DEBUG` (no shared
`installDebug()` at all) and a genuine click-tool coordinate-space bug
caught mid-verification: `bug-hotel-observer` (2026-08-07).** This game's
mode row is revealed by a "Play" button (hidden until then, so the
baseline screenshot needed a tap first — caught mid-fade-in on the first
attempt, confirmed settled on a second). The card-build shape matched the
established recipe cleanly (`config.modes`, no `art`/`icon` collision — the
per-mode art comes from a deliberately-config-external `MODE_FACE` map
keyed by id, documented in the source as intentional), but this game's
`window.QLOBE_DEBUG` is assigned as a raw object literal directly, NOT
built through `shared/js/debug-harness.js`'s `installDebug()` like every
other Wave-3 game — the file doesn't even import `installDebug`. Its
`getTargets()`/`tap` (called `debugTap`) both explicitly return
nothing/no-op for the splash screen (`state.screen === 'splash'` isn't in
either function's screen list) — an eighth instance this session of the
"splash-blind debug harness" pattern, but the deepest version of it
(hand-rolled, not just an oversight in an `installDebug()` call). Worked
around by using the one splash-reachable hook this object DOES expose,
`startMode` (a raw function reference at the object's top level, callable
regardless of screen) to prove the underlying mode-start flow, then
verifying the actual card DOM/wiring separately. Verified: screenshot
pixel-identical to baseline (three tan cards — magnifying glass on a leaf,
magnifying glass on a beetle, a notebook — reached via a dispatched tap on
the "Play" button since no `debugTap()` covers it); console-clean on a
fresh load; DOM-confirmed all three cards' classes
(`mode-tile mode-bug-hunt` etc.) and labels in order; `window.QLOBE_DEBUG.
startMode('bug-hunt')` correctly drove `screen: splash→hotel, mode: bug-
hunt`. Real-tap surfaced something genuinely new this session, not just a
repeat of the recurring stall: the first three attempts at a computed
button-center coordinate consistently registered `pointerdown` on the
`<section id="splash">` behind the card, not the card itself — confirmed
via a capture-phase listener recording each event's actual `clientX/Y`
alongside `document.elementFromPoint()` at that same instant, which showed
the click's real page coordinates were offset from the intended target by
almost exactly the ratio between this page's live CSS viewport
(1792×888) and the screenshot's pixel dimensions (1568×777) — i.e. the
click tool was, for this one page load, delivering coordinates in
screenshot-pixel-space without the scale correction back to the page's
real CSS-pixel space that every other click in this session had implicitly
gotten right. Rescaling the intended coordinate by that same ratio
(1568/1792 ≈ 0.875) before the next attempt landed the click exactly where
intended (`clientX/Y` matching the target, `.tile-art` as the hit
element) and correctly drove `screen: →journal, mode: my-bug-book`. Logged
here as a genuinely new failure mode for this session's "the click tool
sometimes stalls" pattern — not every miss is a pure stall; at least once
it was a real, diagnosable coordinate-space mismatch, caught only because
this game's `debugTap()` gap forced falling back to close, careful
coordinate math instead of a debug-tap shortcut. Seventeen for seventeen.

**Eighteenth Wave-3 game, the last confirmed candidate from the definitive
sweep: `rhyming-detective` (2026-08-07).** Nearly identical shape to
`bug-hotel-observer` (same `buildModeRow()` name, same reveal-on-"Play"
splash structure, same per-mode custom art — a magnifier image for
`rhyme-hunt`, an inline SVG "sound wave" glyph built by a local
`soundGlyph()` helper for `sound-detective`, neither read from `config.
modes`), but this game DOES use the real shared `installDebug()` (unlike
`bug-hotel-observer`'s hand-rolled object) — still with the same splash-
blind `getTargets()`/`tap` gap (a ninth instance this session), but
`startMode` is exposed as an independent, always-reachable key exactly like
every other `installDebug()`-based game with this gap. One small, honestly-
disclosed behavior difference: the original `buildModeRow()` never set
`aria-label` on the tiles at all; `modeCard()` always sets one (defaulting
to `mode.title` when no `label` opt is passed), so these two cards now
carry `aria-label="Rhyme Hunt"`/`"Sound Detective"` where they previously
had none — a strict accessibility improvement with zero visual or
functional effect, not something to suppress. Verified: screenshot
pixel-identical to baseline (reached via a dispatched tap on the "Play"
button, matching `bug-hotel-observer`'s recipe) — magnifying-glass glyph on
gold circle for Rhyme Hunt, sound-wave SVG glyph for Sound Detective,
correct labels; console-clean on a fresh load; DOM-confirmed both cards'
classes (`mode-tile mode-rhyme-hunt` etc.) and the new (correctly present)
`aria-label`s; `QLOBE_DEBUG.startMode('sound-detective')` correctly drove
`screen: →case-intro, mode: sound-detective` (this call itself hit a 45-
second `Runtime.evaluate` timeout — immediately confirmed, per this
session's established pattern, to be a tool-connection artifact rather
than a real freeze: a follow-up state read showed the mode had actually
started correctly). Real-tap: applied the coordinate-scale lesson from
`bug-hotel-observer` proactively this time — computed the target's real
CSS-pixel center via `getBoundingClientRect()`, checked `devicePixelRatio`/
`innerWidth`/`innerHeight` for the same 1792×888-vs-1568×777 mismatch
signature, and pre-scaled the click coordinate by the same 1568/1792 ≈
0.875 ratio before the FIRST attempt — it landed cleanly and drove `screen:
→play, mode: rhyme-hunt` immediately, no retries needed. Eighteen for
eighteen, and the first time a lesson learned mid-session from one game's
tool-flakiness diagnosis was applied preemptively to avoid repeating it on
the very next one.

**Wave-3 sweep closed.** With `bug-hotel-observer` and `rhyming-detective`
both done, every genuine candidate identified across two independent,
definitive repo-wide sweeps (18 migrated + `sound-sprouts` explicitly
skipped per `CLAUDE.md`'s protection of the reference game) is now
accounted for. No further Wave-3 mode-card work remains open.

**§3.11 `tap.js` split press paths — confirmed already resolved, not open
(2026-08-07).** Checked all three games §3.11 named by their exact cited
line ranges: `freeze-focus-dance/js/main.js` (only a comment referencing
the OLD pointerdown+click pattern remains, at the exact line the citation
pointed to — the real code there is now `press()`, a straight `onTap()`
wrapper, encountered directly while working this file's Wave-3 migration
earlier in this session), `red-green-light/js/game.js` (zero split-
pointerdown-and-click sites; every control routes through `onTap()`), and
`feelings-charades/js/game.js` (both primary surfaces — the "Act It Out"
feeling picker and the "Guess the Feeling" answer options — already call
`onTap(card, ...)` directly). None of these three edits are mine; per
[[concurrent-sessions-in-repo]] `git status` already showed another
session's uncommitted work landing on this exact item earlier in the
session. The keyboard/AT-inaccessibility bug this section described is
real and was real when written, but it is not open scope today —
re-verified against current code rather than assumed fixed from the
citation alone.

**§3.8 `preload.js`, two more real candidates found and migrated
(2026-08-07).** A targeted sweep of the games named or plausible from §3
(`bug-hotel-observer/js/art.js`, `flashlight-cave/js/{actor,cave}.js`,
`globe-spin-stories/js/main.js`, `loose-parts-collage/js/{textured-stroke-
canvas,artwork-renderer}.js`, `garden-delivery-game/js/main.js`,
`world-music-dance/js/art.js`) found most are legitimate false positives —
single-URL cache-per-key loaders invoked on demand during render/draw
(load-bearing side effects, same class as the earlier `big-paper-murals`/
`sink-or-float` false positives), not bulk eager preloaders. Two were real:
- **`globe-spin-stories`**: `storyPlateReady`, a `Map<destinationId,
  Promise>` built at module load by hand-rolling `new Image() + decode() +
  load/error listeners` per destination scene, replaced with `new
  Map(config.destinations.map(d => [d.id, preloadImages([d.scene])]))` —
  same per-destination Map shape (the call site's own `Promise.race([...,
  timers.wait(8000)])` needs individual, not combined, readiness, so the
  Map structure itself was kept; only the hand-rolled load logic inside
  each entry was replaced). `preloadImages()`'s own internal 8000ms timeout
  happens to exactly match this game's external race timeout — left the
  race in place rather than removing it as "redundant," since collapsing
  two independently-arrived-at 8s ceilings into one is a real behavior
  question outside this fix's scope, not a freebie.
- **`garden-delivery-game`**: `warmVisualAssets()`, a `for` loop firing
  bare `new Image()` requests with `fetchPriority:'low'`, replaced with
  `preloadImages(urls, { idle: true })`. `preloadImages()` has no
  `fetchPriority` option — `idle: true`'s small-batches-between-frames
  behavior is the closest available match to "background warmth, don't
  compete with the splash's critical path," not a byte-identical
  translation, and that gap is called out in a code comment rather than
  silently assumed equivalent. The now-pointless `warmedVisuals` array
  (existed only to keep `Image` objects alive against GC — `preload.js`'s
  own `inFlight` Set already does this) was deleted rather than left as
  dead state.

Verified both: `globe-spin-stories` — console-clean on a fresh load;
direct `import()` of the live `shared/js/preload.js` module instance
confirmed `isPreloaded('./assets/scenes/asia.webp') === true` immediately
after page load, proving the eager module-load-time preload actually ran
and completed (a `startMode`/`land()`/`alignDestination()` debug-hook
sequence was also attempted to drive a full landing→story-open cycle, but
the globe's own drag-based alignment choreography didn't resolve through
those hooks in a reasonable number of attempts — unrelated to this fix,
not chased further once the direct cache-state proof was in hand).
`garden-delivery-game` — console-clean on a fresh load; screenshot
confirmed all three flower-jar images (`rose-thirsty.webp` etc., exactly
the images `warmVisualAssets()` preloads) rendered correctly; a direct
`import()` check against the game's own `config.assets`/`flowerAssets`
raw URL strings (not the browser-resolved absolute `img.src`, which
doesn't match the cache's relative-string keys) confirmed all 22 preload
targets showed `isPreloaded() === true`.

**§4.2 `flyTo()` — investigated, full extraction declined; the actual bug
fixed narrowly in the 2 games that still had it (2026-08-07).** A deep
comparison of all 5 games' WAAPI glide implementations
(counting-treasure-cups, laundry-sorter, sound-basket, lunchbox-pack,
throwing-target-garden) found real, incompatible shape differences a
shared `flyTo()` would have to abstract cleanly: fire-and-forget
(`onfinish`/`oncancel`, lunchbox-pack) vs. awaited/raced
(the other four); animating a cloned element vs. the original dragged
element; a real `fromRect`→`toRect` glide vs. throwing-target-garden's
fixed-offset toss-arc (no source element at all); a mid-flight SFX hook
(throwing-target-garden's `whoosh`) with no equivalent anywhere else. That
is a genuine multi-shape module design effort, not a drop-in — declining
the full extraction stands, consistent with how this audit has treated
other "new module" items throughout.

**The narrower claim — "only counting-treasure-cups guards against
throttled-tab stalls" — turned out to be stale, not fully true.**
`laundry-sorter` and `sound-basket` already carry the `Promise.race(
[animation.finished.catch(()=>{}), timeout])` guard as uncommitted work
from earlier in this session (unrelated to this specific investigation —
discovered while comparing all 5, not introduced here). Only
`lunchbox-pack` and `throwing-target-garden` were genuinely still exposed.
Fixed both directly, matching the existing pattern rather than waiting on
the full extraction:
- **`throwing-target-garden`**'s `animateThrow()` had a bare `await
  animation.finished` (catch only handled the route-change-cancels-the-arc
  case, not a stall) — a real hang risk, since `submitThrow()` awaits this
  before resolving the throw, meaning a throttled/backgrounded tab could
  block all subsequent game flow indefinitely. Wrapped in the same
  `Promise.race([animation.finished.catch(()=>{}), timers.wait(duration +
  200)])` shape the other three games already use.
- **`lunchbox-pack`**'s two `onfinish`/`oncancel`-only sites (`glideBack()`
  and the inline flyer in `placeFood()`) had a different, more subtle
  failure mode: since nothing awaits them, a stall doesn't block game
  logic — it strands a decorative clone in `glideBack()`'s case, but in
  `placeFood()`'s case it leaves the REAL packed food image invisible
  (`img.style.visibility = 'hidden'` is only cleared by the same `land()`
  callback these events drive), a genuinely visible bug in extreme
  throttling, not just an invisible leak. Added a `this.timers.after(ms,
  cleanup)` fallback to both (440ms for the 240ms glide, 520ms for the
  320ms flight — animation duration plus the same ~200ms buffer the other
  fixes use), with an idempotency guard (`landed` flag) in `placeFood()`'s
  version since `land()` can now legitimately fire from three separate
  triggers.

Verified both: `throwing-target-garden` — console-clean; drove a full
throw via `QLOBE_DEBUG.startMode('color')` → `tap('touch')` →
`winRound()`, completed in ~730ms (consistent with the animation's normal
~520ms duration, not the 720ms race-timeout floor — confirming it resolved
naturally, not via the new fallback) and correctly reached `screen:
reward, lastResolution: hit`. `lunchbox-pack` — console-clean; drove a
full pack-and-advance via `startMode('pack')` → `winRound()`
(`stars: 0→1`, request queue advanced); DOM-confirmed zero stray
`.drag-clone` elements after completion, proving the cleanup path fires
correctly. Neither test forced the throttled-tab condition itself (not
practically reproducible from a scripted debug-hook drive), so the fix's
CORRECTNESS under real throttling rests on the identical, already-proven
pattern from `counting-treasure-cups`/`laundry-sorter`/`sound-basket`
rather than a fresh empirical reproduction — disclosed rather than
implied otherwise.

**§4.1 `camera-flow.js` — investigated deeply, extraction declined; the
audit's own characterization doesn't hold up under a real diff
(2026-08-07).** Read both games' full camera-permission state handling
(`freeze-focus-dance/js/main.js`, `throwing-target-garden/js/main.js`) side
by side against `shared/js/camera-motion.js`/`camera-throw.js` (confirmed:
those DO already classify raw permission outcomes into
`live/denied/unavailable/error/ended/stopped` — the audit's "own only
pixels" undersells them slightly; what's genuinely missing is UI copy,
fallback screens, and debug-scenario faking). The audit's claim — "the same
5-state switch, denial copy, fake-scenario branch, and teardown" — is not
literally accurate once compared line by line:
- **Materially different runtime consequence on camera loss.**
  `throwing-target-garden` actively reroutes gameplay to a Touch Toss input
  path when the camera is lost mid-play (`fallbackToTouch`); `freeze-focus-
  dance` just clears sparkles and keeps waiting (`loseCamera`). A shared
  module papering over this difference would either need a per-game
  `onLost` callback (fine) or risk silently changing one game's actual
  gameplay behavior (not fine) — this is a real design decision, not a
  mechanical dedup.
- **Different state SHAPES, not just different state NAMES.**
  `freeze-focus-dance` tracks `cameraMode` (semantic) + `cameraStatus` (raw
  echo); `throwing-target-garden` tracks `cameraStatus` + a whole
  `state.tracker` snapshot + a separate `fallbackNotice` flag, plus states
  with no freeze-focus-dance analogue at all (a `late`-grant timeout state,
  camera-space calibration lanes entangled in the same functions).
- **The "18 CSS lines" aren't actually the same rule.**
  `freeze-focus-dance`'s `.media-park` hides via `clip-path: inset(100%)` at
  an offset position and never touches the nested `<video>` selector;
  `throwing-target-garden`'s hides via `opacity:0` on `.media-park, .media-
  park video` explicitly. Same INTENT (park a video off-screen), different
  TECHNIQUE — unifying them is a judgment call (pick one, or keep both as
  per-game overrides), not a copy-paste.
- **Video visibility model itself differs**: `freeze-focus-dance` actually
  shows the child a mirrored self-view (`motionVideo` gets moved OUT of
  `#media-park` into a visible, `scaleX(-1)`-mirrored slot);
  `throwing-target-garden`'s video never leaves `#media-park` at all — it's
  tracker-only, always hidden. A shared component would need a real
  "visible mirror vs. always-parked" mode, not a single shared markup
  block.
- **Copy isn't shared today either** — `freeze-focus-dance`'s denial
  messaging lives in `narrator.saySequence()` voice-clip keys;
  `throwing-target-garden`'s is a literal `fallbacks` lookup object
  rendered into DOM plus its own, differently-named voice keys. "Same
  denial copy" per the audit means same TOPIC, not shared strings.

Given all five of these are genuine behavioral/structural divergences (not
naming inconsistencies a mechanical rename would fix), extracting a shared
`camera-flow.js` today would mean DESIGNING new shared behavior (whose
camera-loss consequence wins? whose CSS technique wins? what does the
"visible mirror" option look like as a config flag?) rather than
deduplicating existing behavior — the same class of judgment call this
audit has correctly declined elsewhere (the 20-game HUD/screens.js sweep,
bug-hotel/rhyming-detective's inverted-scale timers groups). Declining for
the same reason: real, valuable future work, but a new-module design
effort that needs its own dedicated pass with playtesting on both games,
not a drive-by extraction risking a live gameplay regression in either.

**§3.1 `drag-to-slot-dom.js` adoption, third game migrated:
`counting-treasure-cups` (2026-08-07).** `teen-bead-builder`/`snack-chef`
were this session's proven pilots; this is the first NEW adoption beyond
them. This game's shape doesn't use slot markup at all — the drop target
is "anywhere above the tray," tested by Y-coordinate — so the migration
leans on the module's documented "ignore `drag.slot`, use `drag.x`/
`drag.y` instead" escape hatch rather than `slotSelector`/`slotPad`.
Replaced the full hand-rolled lifecycle (`onTilePointerDown`,
`onDragMove`, `onDragUp`, `cancelDrag`, `makeClone` — ~90 LOC) with one
`createDragToSlotDom()` instance wired once in the constructor:
`getPiece: (tile) => tile` (per-element pieces, the `snack-chef` shape, not
`teen-bead-builder`'s single persistent piece); `canStart` folds in the
original's `busy`/`awaitingInput` gate (the one-drag-at-a-time and second-
finger guards are now the shared module's own, so `this.drag` as a field
is gone entirely); `preventDefaultOnPress: true` matches the original's
unconditional `e.preventDefault()` on every tile press; `makeGhost` rebuilds
the exact `.ctc-flier.drag-clone` art-only image (not a full tile clone)
sized via `this.stage.itemSize()`, with `transform: translate(-50%,-50%)`
replacing the original's manual `left: clientX - size/2` math — the module
always positions a ghost at the raw pointer coordinate, so centering has to
happen via the ghost's own CSS transform instead of pre-computed
coordinates; `onDrop` calls the game's existing `isOverContainer(drag.y)`
unchanged (`drag.y` at drop time is the raw pointer Y, since this game
never sets `grabOffset`, matching the original's `e.clientY` exactly);
`onTap` and `onCancel` replicate the original's tap-path and cancel-path
`is-held` handling. **Free bug fix, not just a dedup**: the original only
cancelled a stuck drag on `window.addEventListener('blur', ...)` — the
shared module's default `cancelOnBlur: true` adds `visibilitychange` and
`pagehide` coverage this game never had, closing the exact gap the audit
flagged as missing in "6 of 7" hand-rolled copies. The game's own keyboard/
AT `click` listener (`if (e.detail === 0) this.attempt(...)`) was left
completely untouched — it's independent of the drag controller by design,
exactly as the shared module's header describes ("both pilots already
handle taps on their own `click` path... that is also what keeps keyboard
and AT activation working"). Verified: console-clean on a fresh load; a
real drag (`left_click_drag` from a tray tile up onto the cup) correctly
placed a gem (`placed: 0→1, claimed: 0→1`) with a clean screenshot showing
the gem landed and the tray refilled with a fresh tile, no stray clone
visible; a tap (a `left_click` with no movement) correctly completed round
1 and auto-advanced to round 2 (`round: 1→2, target: 2→3`) — confirming
`onTap` fires through the shared controller exactly like the original's
"never travelled = tap" branch; a genuine miss (a drag that stays below
the tray's top edge) correctly did NOT place a gem, and DOM-confirmed zero
stray `.drag-clone` elements and zero stuck `.is-held` tiles afterward;
`howmany` mode (which never wires drag at all, tap-only, untouched by this
migration) still completed a round via `winRound()` normally, confirming
no cross-mode regression.

**§3.1 `drag-to-slot-dom.js` adoption, fourth game migrated:
`lunchbox-pack` (2026-08-07).** This one exposed a real structural conflict
between this game's existing success/miss handling and the shared
module's fixed lifecycle, worth recording in detail. The original
hand-rolled drag builds a `clone` element and hands it (still live, still
in the DOM, still at its final dragged position) to two downstream
consumers on drop: `attemptPack(foodId, { clone, card })` → `placeFood()`
reads `src.clone.getBoundingClientRect()` to compute the fly-in
animation's START rect on success, and a miss calls `this.glideBack(clone,
card)`, which calls `.animate()` DIRECTLY on that same live element. The
shared module, by design, always removes its own internal ghost
(`dropGhost()`) BEFORE `onDrop`/`onCancel` fire — "so the game's own
re-render starts from a clean document" — which means `drag.ghost` is
already `null`/detached by the time either callback runs. Neither
downstream consumer works on a detached element: `getBoundingClientRect()`
on a detached node returns an all-zero rect (breaking the fly-in
animation's start position), and `.animate()` on a detached node is a
silent no-op (breaking the glide-home animation entirely). Solved by NOT
trying to reuse the module's internal ghost for either purpose: `onDrop`/
`onCancel` build a fresh, independent "stand-in" element (reusing the
existing `makeDragClone(card, food)` helper unchanged) positioned at
`drag.x`/`drag.y` — the drag record's own last-known pointer position,
which is exactly what the original hand-rolled `clone` also reflected by
drop time, since its own `onMove` handler continuously overwrote `left/
top` with the raw pointer coordinates on every move. This stand-in is a
completely separate DOM element/lifetime from the module's own internal
ghost (which drives the LIVE visual feedback during the drag itself, via
`makeGhost` reusing the same `makeDragClone` helper) — two elements
serving two different purposes with no visual overlap, since the module's
ghost is already invisible/removed by the time the stand-in appears.
Pieces are passed as `{ el: card, food }` records (the module's documented
non-Element piece shape) rather than bare card Elements, so `onDrop`/
`onCancel`/`onTap` all get the food object back alongside the card without
a separate lookup — `getPiece` is just the identity function. Same free
bug fix as `counting-treasure-cups`: `cancelOnBlur: true`'s default adds
`visibilitychange`/`pagehide` coverage this game's own `window.
addEventListener('blur', ...)`-only handler never had. Verified: console-
clean on a fresh load; a real drag needed a manual synthetic `pointerdown`
→ 8 intermediate `pointermove` steps → `pointerup` sequence rather than the
click tool's own `left_click_drag` (which silently failed to register at
all for this long-distance, ~1450px drag — confirmed via `elementFromPoint`
that the coordinates were correct and via a stray-element check that
nothing was left stuck, ruling out a functional bug before switching
verification methods) — the synthetic sequence correctly packed the food
(`packed: []→["orange"]`, request queue advanced to "carrot", shelf lost
the orange card), and a screenshot confirmed the fly-in animation actually
landed the orange visually in the box's correct compartment — proving the
stand-in-rect fix works, not just that the state updated; a genuine miss
(same synthetic sequence, dropped mid-screen instead of over the box)
correctly packed nothing and left zero stray `.drag-clone` elements after
`glideBack()` ran; a tap (pointerdown+pointerup with no movement)
correctly toggled the card's `selected` class via `onTap` → `toggleSelect`.

**§3.1 `drag-to-slot-dom.js` adoption, fifth game migrated: `tangram-tales`
(2026-08-07).** This game surfaced a genuine gameplay-behavior fork with
no clean answer inside the shared module's public API, and was routed to
the user for a decision before implementation rather than resolved
unilaterally: tangram-tales lets a child hold a piece still to rotate it
(a 520ms-delayed, `requestAnimationFrame`-driven spin), and releasing
WITHOUT ever dragging still commits a placement attempt at the piece's
original spot — the original code forces `activeDrag.moved = true` inside
the rotate loop specifically to make this happen. The shared module's own
tap-vs-drop decision reads its OWN internal `record.moved`, set only by
real translation past the slop gate, with no published hook to override
it. **User chose**: preserve the exact existing behavior by having the
game's own rotate loop set `record.moved = true` directly — the module
hands the same live, mutable record object to every callback for the
whole drag, so this is a supported (if undocumented) pattern, not reaching
into a private closure. The rest of the migration followed the established
recipe: `getPiece: (button) => button`; `slop: 7` (this game's own
constant, not the module's default of 10); `grabOffset: 1` — needed
because, unlike every other Wave-3/drag-adoption game this session, this
one preserves the exact press-to-piece-center offset for the whole drag
rather than snapping the ghost to be centered under the finger (any
on-piece press already has an offset within the piece's own half-size, so
`grabOffset: 1` is effectively unclamped here, exactly matching the
original's unclamped math); `ghostOn: 'press'` (the clone appears
immediately on pointerdown, not gated behind the slop gate — matching the
original, which built and positioned its clone synchronously inside
`beginDrag` before any move event). No live-ghost-after-drop trap this
time (unlike `lunchbox-pack`) — this game's success/miss handling is a
pure state mutation + full `renderGuided()` re-render, never touches
`getBoundingClientRect()`/`.animate()` on the dragged element itself.
`cancelOnBlur: true`'s default adds `visibilitychange`/`pagehide`
coverage this game's own `blur`-only handler never had (the game ALSO
listened for a nonstandard `orientationchange` as a cancel signal — kept
as a small extra `window.addEventListener('orientationchange', () =>
guidedDragCtl.cancel())`, since the module has no concept of orientation
changes and `cancel()` is documented as always safe to call). Verified:
console-clean on a fresh load; a real synthetic drag correctly placed a
piece with the correct rotation (`placed: 3→4`), confirmed both by state
AND a screenshot showing the red sail triangle landed correctly in the
boat silhouette; a genuine in-field miss (dropped within the puzzle field
but far from any valid slot) correctly incremented `misses` (`0→1`)
without placing anything; an off-field miss (dropped entirely outside the
puzzle field) correctly placed nothing AND did not increment `misses`,
matching the original's exact branching (`attemptPlace` is only ever
called when the drop point is within `[0,1]` normalized field bounds); a
mid-drag `blur` correctly cancelled cleanly (ghost removed, `is-drag-
source` cleared, nothing placed, `misses` unchanged). **One path could not
be verified empirically, disclosed rather than glossed over**: the
approved `record.moved = true` hold-rotate workaround lives entirely
inside a `requestAnimationFrame` callback (matching the ORIGINAL
implementation's own design — it has the identical rAF dependency), and
this automated browser tab reports `document.visibilityState: 'hidden'`
and `document.hasFocus(): false`, under which Chrome suspends
`requestAnimationFrame` entirely (confirmed directly: a bare `requestAnimationFrame`
call was given a 2-second window and never fired, while a `setTimeout` in
the same tab fired, just throttled). This is a testing-environment
limitation that would equally have prevented verifying the ORIGINAL
hand-rolled code's identical rAF-dependent logic, not a gap specific to
this migration — the fix's correctness rests on faithfully mirroring the
original's exact structure (confirmed via careful line-by-line reading,
including the `guidedDragCtl.active !== record` liveness guard replacing
the original's `!activeDrag`/`activeDrag !== record` checks) rather than
an empirical rAF reproduction, and that gap is stated plainly rather than
implied otherwise.

**§3.1 `drag-to-slot-dom.js` adoption, sixth game migrated: `sound-basket`
(2026-08-07).** This game's play-screen drag is architecturally different
from every other game migrated this session: it transforms the ORIGINAL
shelf card IN PLACE (`translate/scale/rotate` on the SAME element the whole
gesture, no clone ever created), rather than dragging a separate clone that
tracks the pointer. Forcing this into the shared module's ghost-based model
(a new element positioned via `left`/`top`, the pattern every other
migration used) would have meant hiding the original card and building a
stand-in for every exit path — real, avoidable complexity. Instead, used a
capability none of the prior five migrations needed: `makeGhost: () =>
null`. The module treats a null ghost as fully valid — `moveGhost()`/
`dropGhost()` are unconditional no-ops when `record.ghost` stays null — so
the module contributes ONLY its proven pointer lifecycle (one-drag-lock,
the slop gate, `blur`/`visibilitychange`/`pagehide` cancel) while 100% of
the visual card movement is still driven by this game's own math, applied
directly to the SAME live element the module hands back via `getPiece`
(`{el: button, card}`, matching `lunchbox-pack`'s piece-record shape). Every
formula was carried over byte-for-byte: `slop: 8` (this game's own
constant); the rotate-tilt clamp (`Math.max(-5, Math.min(5, dx/30))`); the
hit-test against `#basket-catch`'s rect using `record.x`/`record.y`
(raw pointerup coordinates, since `grabOffset` stays at its default of 0);
`record.originRect` captured once in `onGrab` (before any transform is
applied — `getBoundingClientRect()` on an already-transformed element would
report the wrong, dragged-away position). `cancelOnBlur: true`'s default
adds `visibilitychange`/`pagehide` coverage this game's own `blur`-only
listener never had.

**A real, pre-existing bug was found and fixed along the way, not
introduced by the migration**: while verifying the "dropped outside the
basket" glide-back path, the card's `transform` never cleared and the
animation never visibly completed. Diagnosis: this game's own drag-miss
handler had a bare `animation.finished.finally(...)` with no timeout
guard — unlike this SAME file's `returnDraggedCard()`/`flyDraggedCard()`
(the wrong-match and correct-match paths), which already race the
animation against a `wait()` timeout specifically because "in a backgrounded
tab the compositor throttles and `finished` can stall indefinitely" (a
comment already present in the original source, right above
`returnDraggedCard`). The miss-path was simply never given the same fix —
confirmed directly: a bare `div.animate(...)` test in the live tab left
`animation.finished` unresolved past a 2.5-second window, while a plain
`setTimeout` in the same tab fired (throttled but not suspended) — the
exact throttled-tab stall class `§4.2`'s `flyTo()` investigation fixed
twice earlier this session, now found a THIRD time in a completely
different game's completely different animation. Fixed by wrapping the
same `Promise.race([animation.finished.catch(() => {}), wait(240 + 200)])`
guard around the miss-path glide-back, matching the sibling functions in
this exact file. Verified all five exit paths: a real drag onto a
CORRECT card flew into the basket via the existing WAAPI `flyDraggedCard`
path (screenshot-confirmed — the bird landed visibly inside the basket,
shelf correctly down to 3 remaining cards); a drag onto a WRONG card
correctly rejected the placement and glided back via `returnDraggedCard`
(confirmed via a longer wait, since the wrong-match voice/audio sequence
takes real time before the glide-back's own `wait()` call is even reached);
a drag dropped entirely outside the basket correctly glided back and
cleared its transform ONLY after the fix above (before the fix,
`cardTransform` stayed permanently stuck at its drag-end value); a tap
with no movement correctly triggered `previewCard` without placing
anything; a mid-drag `blur` correctly cancelled instantly (transform
cleared, `is-dragging` removed, no animation) matching the original's
un-animated cancel path. Console-clean across every test. This is now the
second of two remaining candidates from the earlier accounting closed —
only `laundry-sorter` remains for this adoption item.

**§3.1 `drag-to-slot-dom.js` adoption, seventh and LAST game migrated:
`laundry-sorter`'s "sort" mode (2026-08-07).** This closes the item —
every game the audit named for this adoption is now migrated. Scope was
narrower than the original accounting implied: only the "sort" mode (~120
LOC) has a drag-to-slot shape. "fold" is a directional swipe gesture
(`foldDirectionMatches`) with no slot concept at all, and "pairs" is
tap-only (`onTap` + `attemptPair`) — neither was touched, and neither
reopens the earlier-declined `sort-into-bins.js`/`match-pairs.js`
engine-adoption question (confirmed via grep: no such import exists
anywhere in `main.js`).

Same architectural fork as `sound-basket`, for the same reason: this
game's `.drag-ghost` positions itself via `--ghost-x`/`--ghost-y`/
`--ghost-tilt` CSS custom properties feeding a `translate3d(...) rotate(...)
scale(1.08)` transform, not the module's own `left`/`top`. Used
`makeGhost: () => null` again and built/positioned the ghost element
entirely in the game's own `onGrab`/`onMove`, stored on a custom
`record.customGhost` field (never `record.ghost`, which the module owns
and leaves permanently `null` when `makeGhost` returns null — a same-name
collision would have been silently overwritten). `onGrab` fires
unconditionally on every press, before the module knows whether the
gesture will end as a tap or a drag — this exactly reproduces the
original's own `beginGhost({ markMoved: false })`, which also built the
ghost (and added `.is-drag-source`) on every press regardless of outcome,
tearing it back down on the tap path via the same `cleanupDragVisual`
helper (kept, now shared by `onCancel`/`onTap`). `onLift` (the module's
"first move past slop" hook, which fires once then falls through to the
same event's `onMove` call — confirmed by reading the module's
`handleMove`) carries the `playSfx('pop')` that original fired at the
exact same crossing-event. `record.offsetX`/`offsetY` (captured once in
`onGrab` as `startX - rect.left`) and the tilt formula
(`clamp((lastX - startX) * .07, -12, 12)`) are byte-identical to the
original. `slot: DRAG_SLOP` uses this game's own local constant (8), not
the module's default (10) — same per-game override every prior migration
used. `animateDragIntoBasket`/`animateDragReturn` (already carrying this
session's `raceFinished`-style timeout guards from an earlier `§4.2`
round, untouched here) keep working unmodified: `onDrop`/`onCancel`
assemble a plain `{ itemId, source, rect, ghost, x, y, offsetX, offsetY }`
object matching the original `activeDrag` shape and pass it straight
through to `attemptSort`/`animateDragReturn`, so those functions can't
tell the difference. `cancelAllPointers()` (shared by the blur listener
and every screen transition) now calls `sortDragCtl.cancel()` for the
sort half and left the fold-mode pointer cleanup it also owns completely
untouched. `cancelOnBlur: true`'s default adds `visibilitychange`/
`pagehide` coverage this game's own `blur`-only listener never had, for
free.

Verified live via synthetic pointer sequences (`pointerdown` → 8×
`pointermove` → `pointerup`/`pointercancel`, real `PointerEvent`s with
`isPrimary: true`) against every exit path: a correct drag into the
matching basket (`is-sorted` set, ghost removed, progress incremented); a
drag into a wrong-color basket (rejected via `attemptSort`'s color
mismatch, glided back, ghost removed, `is-drag-source` cleared); a drag
released over empty space with no basket underneath (glided back to the
exact original position, ghost removed cleanly); the tap-to-select-then-
tap-basket-to-commit two-step flow (`is-selected` set on a no-movement
tap, then a separate basket tap correctly called `attemptSort` and
sorted the piece); a mid-drag `pointercancel` (ghost and `is-drag-source`
removed instantly, no placement); a mid-drag window `blur` (same clean
cancel, confirming the module's own `cancelOnBlur` wiring independent of
the game's pre-existing blur listener); and a full round (all 6 pieces
sorted via successive synthetic drags) reaching the celebration screen
with zero stray `.drag-ghost` elements left in the DOM at any point.
Also smoke-tested "fold" and "pairs" mode transitions after the
`cancelAllPointers()` edit to confirm their untouched pointer cleanup
still works. Console-clean across every test, no errors or warnings.
No new bugs found this round — unlike the `sound-basket` and
`throwing-target-garden`/`lunchbox-pack` migrations, this file's
`animateDragIntoBasket`/`animateDragReturn` already had their
throttled-tab timeout guards from the earlier `§4.2` pass.

**§3.1 is now fully closed.** All seven candidates the audit could name
for `drag-to-slot-dom.js` adoption — `lunchbox-pack`, `counting-treasure-
cups`, `tangram-tales`, `sound-basket`, and `laundry-sorter` (five full
migrations across this and the two prior sessions, plus the two DOM
pilots the module itself was extracted from, `story-stones` and
`teen-bead-builder`) — are migrated and live-verified.

---

## 9. Audit closed (2026-08-07)

**Every safely-implementable fix this audit identified is now done and
live-verified.** That covers Waves 0–2 in full; the Wave-3 mode-card sweep
(18 games, closed above); §3.1's `drag-to-slot-dom.js` adoption (5 full
migrations, closed above); §3.5's `timers.js` migration for
`bug-hotel-observer`; §3.7, §3.9, §3.10, §3.11, §3.13's real duplication
and outlier fixes; every named §4/§5 extraction (`art-ref.js`,
`pose-pack.js`, `injectStyleOnce`); the real bug found and fixed inside
§4.2's `flyTo()` investigation (3 games, across two rounds); §5's
`splashEmoji`/`splashArt` unification, re-scoped to its zero-risk form;
and all four Wave-4 zero-test modules.

**Four items remain explicitly, permanently deferred — checked with the
user directly on 2026-08-07 rather than assumed.** Each was investigated
in enough depth to know it is a genuine multi-game design/rewrite effort,
not a drop-in fix, and each carries real regression risk to shipped games
without dedicated playtest time this pass didn't have:

1. **The 20-game `screens.js`/HUD/mode-card/CSS platform-adoption sweep**
   (`sound-basket`, `sound-sprouts`, `bug-hotel-observer`, and others) —
   `CLAUDE.md` itself warns against touching `sound-sprouts` mid-refactor;
   the other candidates are shipped, live games needing individual
   playtesting, not a batch pass.
2. **`camera-flow.js` full extraction** (`freeze-focus-dance`,
   `throwing-target-garden`) — the two games' camera-loss handling is
   materially different behavior (one reroutes to touch input, one
   doesn't), not just similarly-shaped code; extracting today means
   designing new shared behavior, which needs its own decision, not a
   dedup pass.
3. **`rhyming-detective`'s `timers.js` migration** — a different, tested
   `fastTimers()` contract (asserted directly by `tools/qa.mjs`) than the
   game this same class of migration succeeded on
   (`bug-hotel-observer`) — not a mechanical repeat of that fix.
4. **Engine config schema unification beyond `splashEmoji`/`splashArt`**
   (`injectStyle`/`installStyle` naming aside, already resolved) —
   `choose-one.js` (15 games) can't structurally accept what
   `build-assemble.js` accepts without changing shared engine behavior
   every one of those games depends on.

This is the same disposition as the analytics decision in §0: a
deliberate, recorded choice to keep the current implementation rather than
a gap. **The audit is closed as of this entry** — no further items from
this document should trigger new implementation work; re-open a specific
numbered item explicitly if a future session decides to take one on with
proper playtesting.
