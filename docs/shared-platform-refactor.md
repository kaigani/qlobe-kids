# Shared-platform DRY refactor — working spec

Status: **in progress** (multi-agent program, orchestrated). This document is the
integration contract: every module below is built against these exact APIs so
parallel workstreams compose without rework. Update this file if an API must
change, and say why in the commit/PR notes.

Origin: a full 103-game audit (2026-08-01) found the platform's infrastructure
patterns duplicated at three levels: (1) ~20 bespoke games each re-derive audio
unlock / screen router / HUD / confetti / debug harness / RNG; (2) the ~11
shared engines re-implement the same stack internally under private class
prefixes (~1,555 LOC of CSS-in-JS alone); (3) all 103 games hand-copy the same
`<head>` meta + `@font-face`/reset block. There is no `shared/css/` today.

## Hard constraints (from CLAUDE.md — non-negotiable)

- **No build step.** Pure static site; vanilla ES modules; no npm/package.json.
- All paths **relative and lowercase**. Shared code resolves its own assets via
  `new URL('…', import.meta.url)`, never the page URL.
- Tablet-first: touch targets ≥ 96px, no reading required, no harsh failure.
- **Visual + behavioral parity** is the bar for every migration: a migrated game
  must look and behave identically (except where a listed live bug is fixed).

## Out of bounds for this program

- `games/sound-basket/` — another session is actively building it. Do not touch.
- `games/sound-sprouts/` — protected reference game; migrate LAST, in its own
  dedicated step, never in a bulk sweep.
- `assets/hub/tiles/` — user-curated, hands-off.
- `games.json`, `games/*/game.json` — do not edit (registry sync is separate;
  another session has uncommitted metadata changes).
- No git commits/branch changes — the working tree is shared with another live
  session; leave everything uncommitted.

## New module contracts (Wave 1)

### shared/js/rng.js
```js
export function mulberry32(seed)        // uint32 seed -> () => float in [0,1)
export function hashString(str)         // FNV-1a -> uint32
export function shuffle(arr, rng = Math.random)  // Fisher-Yates, returns NEW array
export function pick(arr, rng = Math.random)     // one random element
```

### shared/js/dom.js
```js
export function escapeHtml(str)   // &<>"' -> entities; null/undefined -> ''
export const escapeAttr = escapeHtml
export function el(tag, attrs = {}, children = [])  // attrs: class, dataset, style obj, on* fns; children: nodes/strings
```

### shared/js/timers.js
```js
export function createTimers() // -> group
// group.wait(ms) -> Promise (scaled); group.after(ms, fn) -> id (scaled)
// group.clearAll(); group.setScale(s) (s>1 = faster, i.e. delays divided by s)
// group.ms(n) -> scaled number, for animation durations
```
Exists to serve the `fastTimers()` debug contract; debug-harness wires `setScale`.

### shared/js/preload.js
```js
export function preloadImages(urls, { idle = false } = {})  // -> Promise<void>, never rejects
// idle: true = requestIdleCallback batching (setTimeout fallback)
```

### shared/js/debug-harness.js
The `window.QLOBE_DEBUG` v1 contract (see shared/js/engines/README.md), as a
module instead of 21 hand-rolled copies.
```js
export function installDebug(spec)  // -> dispose() (restores any previous hook)
// spec: { gameId, engine?, version = 1, ready, listModes, startMode, getState,
//         getTargets?, tap?, winRound?, mute?, seed?, fastTimers?, home?, ...extra }
// Defaults provided: getTargets -> collectTargets(); seed -> mulberry32 swap-in;
// fastTimers -> timers.setScale(20); mute -> narrator/sfx/voice fan-out if given.
export function collectTargets(root = document, selector = '[data-target]')
// -> [{ id, role, rect: {x, y, w, h} }], zero-size filtered out
```

### shared/js/audio-unlock.js
```js
export function unlockAll(extra = [])   // sfx + speech + voice-clips + audio (+ extra fns), each try/caught
export function installUnlockOnGesture({ target = window, extra = [], onFirst } = {})  // -> dispose
// pointerdown listener; latch resets on visibilitychange so audio revives after
// iPadOS app-switch (the story-stones stale-guard bug); also wires
// visibilitychange -> speechSynthesis.resume().
export function installKioskGuards()    // -> dispose; contextmenu + gesturestart preventDefault
```

### shared/js/voice-clips.js — extensions (back-compat: existing 17 consumers unchanged)
```js
export function duration(key)        // seconds or null (from manifest)
export function setMuted(on); export function isMuted()
export function getAudioLog(); export function clearAudioLog()  // ring buffer, cap 80, {key, text, kind: 'clip'|'speech', at}
```

### shared/js/audio.js — extension (back-compat)
```js
export function configure({ manifestUrl, base } = {})  // point at a game-local manifest; call before ready is awaited
```
Kills the per-game `voice.js` forks (sound-sprouts, rhyming-detective, sound-basket's local channel).

### shared/js/narrator.js
```js
export function createNarrator({ say, saySeq, announcerParent = document.body } = {})
// say/saySeq default to voice-clips. Returns:
// { say(key, fallbackText), saySequence(parts), stop(), setMuted(on), isMuted(), dispose() }
// Owns: aria-live .visually-hidden announcer node, mute gate, monotonic
// sequence token so a newer line cancels an in-flight one.
```

### shared/js/idle-nudge.js
```js
export function createNudger({ first = 11000, repeat = first, onNudge })
// -> { arm(), poke(), stop() }; poke() on any player action; auto-poke on pointerdown while armed
```

### shared/css/base.css
`@font-face` Fredoka (via relative url from shared/css/ -> ../fonts/), the
platform reset (`box-sizing`, tap-highlight, `touch-action: manipulation`,
`user-select: none`, margin 0, `height: 100%`), `.hidden { display: none !important }`,
`.visually-hidden` (sr-only), safe-area custom props (`--qk-safe-top/right/bottom/left`),
and `#game { height: 100dvh; background: var(--qk-bg, transparent) }`.
Games link it and set `--qk-bg` + font-family in one tiny local block.

### shared/css/hud.css + shared/js/hud.js
One canonical vocabulary: `.qk-hud-btn` (96px circle, safe-area aware,
`:active` press transform), variants `.qk-hud-home/back/sound`, bg images from
`shared/assets/ui/btn-*.png` resolved relative to the css file.
```js
export function hudButton(kind, onPress, { label } = {})  // kind: 'home'|'back'|'sound'; wired via tap.js with sfx tick
export function soundDebounce(fn, ms = 600)                // the replay-button guard every game copies
export function progressDots(total, done)                  // -> element, .qk-dot/.is-done/.is-now
```
hud.js imports only tap.js + sfx.js (NOT audio-unlock — unlock is the global
first-gesture listener's job).

### shared/js/celebrate.js
```js
export function burstConfetti({ host = document.body, count = 30, palette = QK_PALETTE, duration = 2500 } = {})
// DOM-span confetti, CSS-var driven, self-cleaning, no-op under prefers-reduced-motion. Returns cancel().
export const QK_PALETTE  // the one platform celebration palette
export function tada({ confetti = true } = {})  // sfx.tada + burst
```
`shared/js/stage/particles.js` stays as the Pixi backend; palettes must match.

## Migration rules (Wave 2)

- File ownership is exclusive: one agent per file, ever. Engines / bespoke
  group 1 / bespoke group 2 / stub sweep are disjoint sets.
- Engines adopt rng/dom/timers/debug-harness **internally only** — public
  config API and rendered DOM/CSS unchanged. Engine `.test.html` pages must pass.
- Bespoke games: replace hand-rolled copies with imports; delete dead local
  code; keep game-specific palettes/copy where genuinely intentional.
- Stub games: link `../../shared/css/base.css`, shrink the inline `<style>` to
  font-family + `--qk-bg`, delete `config.copy` blocks that restate engine
  defaults verbatim.
- Live bug fixes riding along: lunchbox-pack `window.LUNCH` -> QLOBE_DEBUG v1;
  clay-creature-studio missing `speechSynthesis.resume()`; story-stones stale
  unlock latch; world-music-dance + playdough-letter-factory divergent RNGs ->
  mulberry32; red-green-light raw `new Audio()` -> voice-clips `sayFile`;
  flashlight-cave double manifest fetch + double `@font-face`.

## Verification bar (every wave)

- `python3 -m http.server 8000` from repo root; game loads with **zero console
  errors and zero 404s**.
- `window.QLOBE_DEBUG` present with v1 keys; `seed(42)` reproducible;
  `fastTimers()` effective.
- Visual parity screenshot spot-check (splash + one round) before/after.
- Audio checks in real Chrome (`channel: 'chrome'`) — bundled Chromium has no AAC.

## Wave 4 (structural) — specs

Waves 1–3 are landed and verified (103/103 games clean modulo pre-existing
issues; see the sweep results). Wave 4 runs as three parallel workstreams plus
one sequenced engine pass.

### 4a — shared/js/screens.js + shared/js/mode-select.js (+ shared/css/screens.css)

**LANDED.** The splash → play → end state machine, extracted from the engines'
internal routers, snack-chef's `showScreen`, counting-treasure-cups'
`showSplash/startMode/showEnd`, and sound-painting's `clearScreen` +
`showSplash/startMode/showKeepsake`. Pilot: `games/snack-chef` (see below).
Test page: `shared/js/screens.test.html`, 88 assertions.

Zero Pixi, zero network. Imports are `./tap.js` + `./sfx.js` only, so both
bespoke DOM games and the Pixi engines can consume it.

#### shared/js/screens.js

```js
export function createBag()
// -> { add(...fns) -> first fn, run(), size() }
// run() disposes + empties; a throwing disposer can never strand the rest.
// Exported on its own because per-STEP teardown is the same shape as
// per-screen teardown (snack-chef's clearStep uses exactly this).

export function createScreens(spec) -> controller
// spec: {
//   screens: { name: Element|selector, ... }   // omit -> adopt [data-qk-screen]
//   root = document,                            // where selectors resolve
//   initial,                 // default: the first screen not already `hidden`
//   voice,                   // {stop()} — stopped on every transition
//   onEnter(name, prev), onExit(name, next),
//   splash = 'splash',       // the one screen allowed to carry a home button
//   navRule = true,          // console.warn on a §8 violation; never throws
// }
```

The controller:

```js
screens.current                    // getter -> name | null
screens.starting                   // getter -> boolean (the re-entrancy latch)
screens.names                      // string[] in declaration order
screens.el(name) / screens.is(name)

screens.show(name, { silent, force })  // -> Element
//   Sets the `hidden` ATTRIBUTE (not a class) on every other screen.
//   IDEMPOTENT: show(current) is a total no-op — no onExit, no bag, no
//   voice.stop(). `silent` skips voice.stop() for one transition; `force`
//   re-runs exit+enter on the screen you are already on.

screens.hold(...disposers)   // -> first disposer; runs when THIS screen is left
screens.release(name = current)   // run that bag NOW without leaving
screens.pending(name = current)   // -> number, for tests

screens.start(runner, { busy })   // -> Promise
//   The double-tap guard. A second call while the first is in flight resolves
//   to `busy` (default undefined) without running. Released in a `finally`, so
//   a runner that throws cannot lock the child out of every mode.

screens.destroy()            // run every bag, stop managing; idempotent
```

```js
export function wireEndScreen(opts) -> dispose
// opts: { screens, back?, choose?, again?, splash = 'splash',
//         onSplash?,   // replaces the default screens.show(splash) for BOTH
//                      // back and choose — the only legal destination
//         onAgain?, onPress?,   // onPress runs on every accepted press first
//         feedback?,   // pointerdown; default preventDefault + sfx.tick.
//                      // The KEY'S PRESENCE opts out: `feedback: null` = none.
//         hold = true } // false for static markup wired once for the session
```
Enforces the navigation rule rather than restating it: back and "choose
another" share one destination, and a `back` that is an `<a href>` (a home
button wearing a back icon) is a `console.warn`.

#### shared/js/mode-select.js

```js
export function renderModeCards(opts) -> { host, cards, dispose }
export function modeCard(mode, opts, index) -> HTMLButtonElement
// opts: { host, modes, onPick(id, mode, index, e), feedback?,
//         skin = true,          // adds .qk-mode-list to the host
//         cardClass?,           // string | (mode,i)=>string, extra classes
//         art?,                 // (mode,i) => url|Node|null; default mode.art
//         showTitle = true,     // false when the title is baked into the art
//         label?, vars?,        // vars: (mode,i) => custom properties
//         decorate?,            // (button, mode, i) => void — badges etc.
//         replace = true, targetPrefix = 'mode-' }
```

Card DOM: `<button type=button class="qk-mode-card [cardClass]" data-mode
data-target="mode-<id>" aria-label style="--qk-mode-i:<i>">` containing
`img.qk-mode-art` (or `span.qk-mode-icon`) then `span.qk-mode-title`.

**The structure/paint split is the whole compatibility story.** `.qk-mode-card`
is applied always and carries only the CONTRACT — the ≥96px touch floor and
`touch-action: manipulation`. Every painted rule in screens.css is scoped under
`.qk-mode-list`, which is added to the host only when `skin` is on. A game with
its own card art passes `skin: false` and keeps every pixel.

#### shared/css/screens.css

`[data-qk-screen][hidden]` / `.qk-screen[hidden]` → `display: none !important`
(a screen's own `display: grid` is otherwise same-specificity and later in the
cascade, which is exactly how a "hidden" screen ends up painted over the live
one). Plus optional `.qk-screen`, the `.qk-mode-list` skin, and
`.qk-end-actions`. **Link it after base.css and before the game's stylesheet** —
every rule is single-class, so the game wins each property it declares.

#### Adoption recipe (this is what 4b follows)

1. Markup: `hidden` ATTRIBUTE, not `class="hidden"`. screens.js stamps
   `data-qk-screen` and strips a stale `.hidden` class so the two mechanisms
   cannot disagree.
2. `createScreens({ screens: {...}, initial, voice })` once, at module scope.
3. Wrap mode start in `screens.start(runner, { busy: false })`.
4. Inside the runner: `screens.release()` → `screens.show('play')` →
   `screens.hold(teardown)`.
5. Read the current screen from `screens.current` / `screens.is(name)`. Delete
   the game's own `state.screen` — a second copy of that fact is how the two
   drift apart.

**Two semantic traps for adopters:**

- `show()` is idempotent, so `show('play')` while already on `play` runs
  NEITHER the disposer bag NOR `voice.stop()`. Restarting a mode in place must
  call `screens.release()` first (or `show(name, { force: true })`). Engines
  that rebuild `innerHTML` on every `startMode` are the ones most likely to hit
  this.
- `wireEndScreen` defaults to `hold: true`, which disposes its listeners when
  the end screen is left. That is right for engines (they re-render the end
  screen each time, so they rewire each time) and wrong for a game whose end
  screen is static markup — those pass `hold: false`.

#### Pilot: games/snack-chef

`showScreen`'s three hard-coded toggles → `createScreens`; `renderCards` →
`renderModeCards({ skin: false, cardClass: 'recipe-card', showTitle: false })`;
`clearStep` moved onto the play screen's bag; `startMode` wrapped in the latch;
the reveal's three buttons through `wireEndScreen({ hold: false })`.

Parity evidence (Chrome, `channel: 'chrome'`, 1180×820): splash screenshot
**byte-identical**; all `QLOBE_DEBUG` state, targets (including every rect),
`tap`/`winRound` verdicts and the 15 debug keys unchanged; zero console errors,
zero 404s. The play/reveal screenshots differ only in regions the *unmodified*
build already differs in between two of its own runs — verified by
un-migrating, running twice, and getting the pixel-identical cluster set
(the `step-in`/`gesture-cue` animation phase and the fading `.recap` tiles).

Three intended behaviour changes, all flagged:

- The `starting` latch now swallows a double-tapped recipe card
  (`startMode` twice → `{a: true, b: false}`; it was `{a: true, b: true}`).
- Leaving the reveal mid-celebration bumps `revealToken` via the screen bag, so
  the awaited star sequence no longer wakes up and speaks the cheer line over
  the splash. **This was a live bug**, found by the bag; it is not in the Wave 2
  bug list.
- `touch-action` on the recipe cards moves `auto` → `manipulation` (the
  contract rule). No effect in practice — `body` already carries
  `manipulation` from base.css — but it shows up in a computed-style diff.

### 4c — DOM backends for the Pixi-only stage modules — LANDED, final APIs

Pilots shipped at pixel parity: story-stones drag (32→12 LOC), counting-treasure-cups
`actor.js` deleted (155 LOC, 0 differing pixels across 6 poses), clay-creature-studio
ambience on celebrate loop mode.

```js
// shared/js/stage/drag-to-slot-dom.js
export const DRAG_SLOP = 10;
export function createDragToSlotDom({
  getPiece,                         // (id) -> Element | { el, … }
  ghostHost, root, slotSelector = '[data-slot]', slotPad = 0, hoverClass,
  makeGhost, ghostClass = 'dragging', ghostOn = 'lift'|'press',
  slop, grabOffset = 0, cancelOnBlur = true, preventDefaultOnPress = false,
  canStart, onGrab, onLift, onMove, onDrop, onCancel, onTap,
}) // -> { begin(event, id), cancel(), detach(), hitTest(x,y), sweepStrayGhosts(), active }
// Drop resolution: elementFromPoint().closest(slotSelector) first; on a miss with
// slotPad > 0, padded-rect scan taking the NEAREST CENTRE. drag.slot reported on
// every move and on the drop. pointercancel ≠ drop; blur cancels (opt-out).

// shared/js/stage/pose-sprite-dom.js
export const POSE_POP_MS = 220;
export const DEFAULT_PRELOAD_ORDER;   // neutral, interact, notice, celebrate, react, enter
export async function loadPoseActorDom(manifestUrl, { host, className, side, scale,
  scaleVar, visibleClass, brokenClass, preloadOrder, reducedMotion })
// -> { el, manifest, base, pose, visible, img, poseUrl, setPose(name,{instant}),
//      preload(names), show(pose), hide(), destroy() }   — throws on a bad manifest
export async function loadPoseActors(host, defs, opts)   // never rejects; appends in defs order

// shared/js/celebrate.js — additions (one-shot burst API unchanged, back-compat measured)
// burstConfetti gains: loop (ambient, duration = nominal fall ±15%, returns dispose),
// rng, drift, easing, piece: { width, height, radius }.
```
teen-bead-builder migration recipe (future): `slotPad: 45`, `ghostOn: 'press'`,
`slop: 12`, `hoverClass: 'drag-over'`, `preventDefaultOnPress: true`; its
non-moved pointerup add is `onTap`, not `onDrop`.

### 4d — tools/qa/lib/driver.mjs

Consolidate the 14 per-game `tools/qa.mjs` Chrome drivers (~7.4k LOC): argv/flag
parsing, Playwright resolution (`--playwright` / `PLAYWRIGHT_MODULE_PATH`),
launch (channel:'chrome'), QLOBE_DEBUG helpers (waitReady, startMode, targets,
seed, fastTimers, audio-log assertions incl. `kind: 'clip'|'speech'`),
screenshot dir conventions. Convert each game's qa.mjs onto it PRESERVING its
scenarios; A/B: run the original driver first, record verdicts, re-run after,
verdicts must match.

### 4b — engine skin consolidation (SEQUENCED after 4a)

`shared/css/engine-base.css` (tokens: `--qk-primary/accent/shadow` + the shared
reset/HUD/splash/end rules engines currently duplicate ~1,555 LOC of CSS-in-JS
for), engines adopt screens.js/mode-select.js + hud vocabulary, per-engine class
prefixes retire behind a documented compatibility window for the game-local
skins that reach into them (letter-road-driving, number-rod-race, blend-train).
