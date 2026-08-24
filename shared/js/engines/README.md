# Archetype engines

One engine per interaction archetype. A game built on an engine is mostly **data**:
its `config.js` names the engine and supplies content (items, rounds, prompts, art
refs). The engine owns the loop, input, feedback, and celebration — identically
across every game that uses it, so a kid who learned one matching game can play all
of them.

```
shared/js/engines/
  match-pairs.js      tap two cards that belong together
  sort-into-bins.js   drag items into labeled category bins
  sequence-order.js   arrange items into the right order
  tap-count.js        tap/collect an exact quantity
  pattern-continue.js extend a repeating pattern
  trace-path.js       finger-trace a path/letter/shape
  choose-one.js       hear/see a prompt, pick 1 of N answers
  build-assemble.js   drag pieces to build something
  observe-journal.js  look, listen, record a simple observation
  coach-timer.js      guide a real-world activity: spoken steps + timer + checklist
```

Three more files live in this folder but are **not** engines under the contract
below — `puppet-band.js`, `puppet-theater.js`, `story-stones.js` predate it and
break the import allow-list (they eagerly init `voice-clips.js`, among other
things). Treat them as single-game modules that happen to sit here, not as a
pattern to copy; a future pass either promotes them to the contract or moves
each under its one consuming game.

## Engine module contract

- Pure ES module. Imports allowed:
  - **input + feedback** — `../tap.js`, `../sfx.js`, `../speech.js`
  - **structure** — `../screens.js` (the splash → play → end router and
    `wireEndScreen`), `../mode-select.js` (`renderModeCards`), `../hud.js`
    (`hudButton` / `soundDebounce` / `progressDots`), `./engine-styles.js`
    (the shared-stylesheet loader, below)
  - **platform utilities** — `../rng.js`, `../dom.js`, `../timers.js`,
    `../preload.js`, `../debug-harness.js` (see
    `docs/shared-platform-refactor.md` — engines must use these instead of
    private `shuffle`/`escapeHtml`/`QLOBE_DEBUG` copies)
  - **content + art** — `./art.js`, `../voice-clips.js`, `../content.js`
  - **Stage v2 (PixiJS)** — `../stage/stage.js`, `../stage/tween.js`,
    `../stage/particles.js`, `../stage/art-pixi.js`, `../stage/drag-to-slot.js`
    (pattern #11's canonical drag controller) and the DOM backends
    `../stage/drag-to-slot-dom.js`, `../stage/pose-sprite-dom.js`
  - Nothing else. In particular **NOT `../audio-unlock.js` and NOT
    `../narrator.js`.** Unlocking is the one global first-gesture listener's
    job, installed once per page, and an engine that pulled in the narrator
    would pull in `voice-clips.js` eagerly with it — which breaks the
    lazy-network contract below.
  - `voice-clips.js` is the recorded-teacher-voice player (Web Speech fallback
    built in); `content.js` is the shared phonics library (letters/words/sounds).
    Both are optional per-game: `voice-clips.init()` and `content.ready()` must
    stay LAZY — called only once a config actually asks for them (a `voice.clips`
    manifest, a `letter:`/`word:`/`cheer:`/`isfor:` clip ref) — so a game that
    never uses either still makes zero network calls.
- Any asset URL inside an engine resolves module-relative:
  `new URL('../../assets/…', import.meta.url)`.
- Export:

```js
export function createGame(config, mountEl) → { destroy() }
```

- `createGame` renders the whole game (splash → modes → play → end) inside `mountEl`,
  wires input, and installs `window.QLOBE_DEBUG` (below). `destroy()` removes
  listeners/timers and clears the mount.
- The engine implements the platform patterns (`docs/interaction-patterns.md`):
  audio unlock on first gesture (`sfx.unlock()` + `speech.unlock()`), tap-tap AND
  strand-proof drag where dragging exists (pattern #11 — window-level listeners,
  single-drag lock, blur = cancel, stray-clone sweep), gentle retry (wiggle + spoken
  nudge, never punitive), celebration loop (sfx.tada + confetti-ish burst + spoken
  cheer), idle re-prompt once per round, ≥96px targets, `prefers-reduced-motion`,
  portrait + landscape.

## The shared skin — `shared/css/engine-base.css`

Every engine used to ship its own copy of the same stylesheet under its own
class prefix: the same `@font-face`, the same sky-with-bubbles page, the same
96px round PNG buttons, the same splash/end column, the same mode buttons, the
same HUD grid, the same rounded canvas — about 1,555 lines of CSS-in-JS across
the set, ~80% of it duplicated. That intersection now lives once in
`shared/css/engine-base.css`, against a prefix-free `qk-eng-*` vocabulary.

### Loading it

```js
import { installEngineStyles } from './engine-styles.js';

function installStyle() {
  if (styleInstalled) return;
  styleInstalled = true;
  installEngineStyles('qk-choose-style', ` …residual rules only… `);
}
```

`installEngineStyles` links `shared/css/screens.css` and then
`shared/css/engine-base.css` — once per document, id-guarded, no matter how many
engines a page loads — and only then appends the engine's own `<style>`. Urls
resolve `new URL(…, import.meta.url)`, never against the page.

### The cascade order, which is the whole compatibility story

```
1. the page's own <link>s          base.css, then a game's stylesheet
2. shared/css/screens.css          } injected by engine-styles.js,
3. shared/css/engine-base.css      } in this order,
4. <style id="qk-<engine>-style">  } at the first createGame()
```

An engine therefore still outranks the shared sheets at equal specificity,
exactly as it did when it owned all the CSS; and everything in (2)–(3)
previously lived in (4), which already outranked (1), so no game's plain
stylesheet changed rank either.

### Dual-classing and the compatibility window

Engines **dual-class**: every element keeps the class it has always had and
gains the shared one — `class="qk-choose-splash qk-eng-page"`.

> **The per-engine `qk-<engine>-*` prefixes are DEPRECATED BUT STABLE.**
> They are not going away in this wave and nothing may rename or relocate one.

Two shipped games reach into engine internals through those prefixes and skin
them, and they are the acceptance test for any change here:

| game | hooks |
|---|---|
| `games/letter-road-driving` | `#game .qk-trace*` — including a redefinition of the engine's own `--navy` / `--blue` / `--green` / `--yellow` / `--shadow` |
| `games/blend-train` | `css/style.css`, ~25 rules under `#game .qk-build*` |

Both scope under `#game`, so they carry an ID and outrank every selector in
engine-base.css regardless of order. Two rules keep that true:

- **Never raise a selector in engine-base.css above one class**, and never use
  `!important` there.
- **Alias, don't hard-code.** An engine sets `--qk-primary: var(--blue)`,
  `--qk-shadow: var(--shadow)`, `--qk-navy: var(--navy)` on its surface rule, so
  a game that redefines the legacy variable still reaches every shared rule. A
  token read straight from engine-base.css would silently ignore the override.

### The vocabulary

| class | what it is |
|---|---|
| `qk-eng-root` | the reset host (`box-sizing`, tap-highlight) |
| `qk-eng-surface` | the full-bleed painted page; owns the tokens |
| `qk-eng-page` | the centred splash/end grid with safe-area padding |
| `qk-eng-center` | the splash/end content column |
| `qk-eng-card` / `qk-eng-card-glyph` | the big art tile; the glyph half is a separate opt-in because some tiles size their art with `--qk-art-size` and have no `font-size` at all |
| `qk-eng-title` | the `<h1>` (no `color` — it inherits, so a game skin can repaint it) |
| `qk-eng-mode-list`, `qk-eng-mode` | the splash's buttons, and the end screen's "again" |
| `qk-eng-img-btn` | the 96px round PNG button |
| `qk-eng-ico-home/-back/-sound/-next` | just the artwork, split from the box |
| `qk-eng-corner-tl`, `qk-eng-corner-bl` | back/home top-left, "hear it again" bottom-left |
| `qk-eng-play`, `qk-eng-hud` | the play screen and its top strip |
| `qk-eng-pill` / `qk-eng-pill-wrap` | the progress pill, centred or wrapping |
| `qk-eng-dot` / `qk-eng-dot-ring` | the two progress-pip flavours |
| `qk-eng-stage`, `qk-eng-canvas` | the Pixi mount |
| `qk-eng-play-icon` | the ▶ glyph on "again" |

Tokens (`--qk-primary`, `--qk-accent`, `--qk-shadow`, and the `--qk-eng-*`
family) carry everything that genuinely differs between engines; the file's
header comment is the reference list. A game's `config.accent` can be plumbed
into `--qk-primary` for per-game colour — no engine does that today, and turning
it on is a visible change, so it stays opt-in.

**Engine HUD buttons are deliberately NOT `hud.css`'s `.qk-hud-btn`.** That one
carries a `drop-shadow()` filter, a 96px `::before` hit pad and a
`translateY(4px)` press that the engines have never had; adopting it would
repaint every engine game. hud.css is the bespoke-game flavour, engine-base is
the engine flavour, and what they share today is the element shape and the press
path. Per-engine `@media` breakpoints (560px / 620px / portrait /
landscape-max-height) also stay in each engine for the same reason — they
diverge, and unifying them repaints somebody.

## Screens, mode cards, and teardown

Engines route through `shared/js/screens.js` rather than replacing
`mountEl.innerHTML` on every transition: three persistent `<section>` shells,
one visible, `hidden` on the rest (screens.css turns that into
`display: none !important`). The splash's buttons come from
`shared/js/mode-select.js`.

```js
this.screens = createScreens({
  root: this.mountEl,
  screens: { splash, play, end },
  initial: 'splash',
  voice: { stop: () => speech.stop() },
});
get screen() { return this.screens ? this.screens.current : 'splash'; }
```

Four rules that fall out of that, and the traps behind them:

1. **There is one copy of "which screen is live"** — `screens.current`. No
   engine keeps its own `this.screen` string any more; two copies of that fact
   is how they drift apart.
2. **`show()` is idempotent.** `show('play')` while already on `play` runs
   neither the disposer bag nor `voice.stop()`. An engine re-rendering a screen
   in place must `screens.release()` first (or `show(name, { force: true })`) —
   engines rebuild `innerHTML` on every `startMode`, so they are exactly the
   callers most likely to hit this.
3. **Every listener goes on the screen's bag** via `screens.hold(onTap(...))`,
   so leaving the screen disposes it. Mode start is wrapped in
   `screens.start(runner)`, the double-tap latch.
4. **`wireEndScreen` keeps its `hold: true` default** — right for engines,
   because they rebuild the end screen on every visit and so rewire it on every
   visit. Pass `feedback: null` where the old back button made no sound.
5. **The catalog link is removed when the splash is left.** Persistent sections
   mean the splash's `<a href="../../">` would otherwise sit in the document —
   hidden, but still findable — for the whole session, and
   docs/interaction-patterns.md §8 ("home lives only on the splash") is asserted
   as a DOM invariant by the QA drivers, not just as prose. So every engine ends
   `renderSplash()` with:

   ```js
   const homeLink = splash.querySelector('a.qk-<x>-home');
   if (homeLink) this.screens.hold(() => homeLink.remove());
   ```

   `renderSplash()` rebuilds it on the way back in, so the link exists exactly
   while the splash is live.

`renderModeCards` is always called with **`skin: false`**: the engine paints its
own cards through `qk-eng-mode`, and `skin: false` withholds `.qk-mode-list` so
none of screens.css's painted rules apply. The card keeps the engine's own class
via `cardClass`, and its title span keeps the engine's own class via `decorate`.
If the engine's `getTargets()` scans the DOM for `[data-target]`, pass
`targetPrefix: null` so the splash does not start reporting mode cards as
targets.

## Config shape (common core; engines may add fields)

```js
export default {
  engine: 'match-pairs',
  title: 'Then & Now Sort',
  voice: {                      // ALL spoken text lives here (speech.js reads it;
    intro: 'Let\'s match old and new!',   // these lines double as the recording
    nudge: 'Hmm, try another one!',       // list for future teacher-voice clips)
    cheer: 'Hooray! You matched them all!'
  },
  modes: [{
    id: 'classic', title: 'Match!',
    rounds: 5,
    items: [ /* engine-specific round data */ ]
  }]
}
```

## Placeholder art refs

Config art values are strings the engine resolves via one shared helper:

| ref | renders as |
|---|---|
| `emoji:🐸` | the emoji at tile size (~70% of tile) on a soft rounded card |
| `shared:objects/cat.webp` | `shared/assets/objects/cat.webp` |
| `shared:foods/apple.png` | `shared/assets/foods/apple.png` |
| `shared:letter-tiles/b.png` | `shared/assets/letter-tiles/b.png` |
| `char:maya` | `shared/characters/maya/portrait.png` |
| `game:assets/hero.png` | the current game's `assets/hero.png` |
| `text:CAT` | the text big in Fredoka on the card (letters, words, numerals) |
| `swatch:#f4c53d` | a solid color chip (color games) |
| `game:assets/engine.webp` | a game-local file, resolved against `base` (default `document.baseURI` — the same convention configs already use for raw `./assets/bg.jpg` paths) |

Swapping placeholder → real art later is a config edit, never a code change.
The resolver lives in `shared/js/engines/art.js` (built once, imported by engines).

### Layered art refs

An art ref may also be an ARRAY of layers, painted bottom-to-top, so a config
can compose art (a base tile + a letter glyph + a small badge) without a new
image asset per combination:

```js
art: [
  'game:assets/car.webp',
  { ref: 'text:A', scale: 0.42, dx: 0.06, dy: -0.08, alpha: 1 },
]
```

Each entry is either a bare ref (any of the table above) or `{ ref, scale, dx,
dy, alpha }`. `dx`/`dy` are FRACTIONS OF THE BOX, not pixels, so a composed
stack survives every rescale without drifting. A layered ref has no single URL
— `artUrl()`/`artUrlRef()` return `null` for it; use `artEl()` (DOM) or
`artObj()` (Pixi) to render it.

## Build space, backdrop, and panel (build-assemble)

`build-assemble.js` defaults every build to a 1000×1000 square — the
coordinate system every existing config authors against — but a game may opt
into a non-square canvas. These three keys are inherited config → mode → build
(innermost wins):

```js
{
  space: [1600, 700],              // [w, h] build coords; default 1000×1000
  backdrop: 'shared:objects/apple.webp', // optional art ref, drawn over the
                                    // BOARD rect. The board always carries the
                                    // space's aspect, so a backdrop authored at
                                    // that aspect maps 1:1 onto space coords and
                                    // anything a build positions in space lands
                                    // exactly where the artwork says it should.
                                    // Do NOT fit it to the whole play area: that
                                    // rescales it independently of the board and
                                    // floats every part off the scenery it is
                                    // supposed to be standing on.
  panel: false,                    // default true; false removes the cream
                                    // rounded-rect board panel entirely
  trayReserve: 0.21,               // optional: height the bottom tray takes. < 1 is a
                                    // fraction of viewport height, >= 1 is pixels.
                                    // Omitted => the original formula. A wide build is
                                    // height-starved, so handing pixels back here makes
                                    // the pieces a child must read meaningfully bigger.
  reveal: 'shared:objects/sun.webp', // optional, PER BUILD: a picture that pops above the
                                    // assembly when the build completes, held while the
                                    // completion line plays. For a pre-reading audience
                                    // this is the payoff — finishing otherwise produces a
                                    // row of pieces and a sound, and nothing that says
                                    // what was made. It holds for a minimum time of its
                                    // own, so a muted or missing voice line cannot make
                                    // the reward flash past unseen.
  revealAt: [800, 150],            // optional [x, y] in build-space coords
  revealSize: 265,                 // optional; defaults to 0.30 of the space's short side
  coupleUp: { close: 0.86, roll: 46 }, // optional: on completion the placed pieces slide
                                    // together instead of the board pulsing. `close` is
                                    // the fraction of the authored spacing to shut the
                                    // gaps to; `roll` shifts the whole assembly that many
                                    // build-space units toward the start. Per build or
                                    // per config. Sprites are rarely precision-cut, so
                                    // this closes a gap by proportion rather than
                                    // pretending to compute a perfect joint.
  sound: {                          // optional game-supplied sound FILES, played by key.
    roll: { src: 'game:assets/audio/train-roll.m4a', volume: 0.2 },  // pieces sliding
    horn: { src: 'game:assets/audio/train-horn.m4a', volume: 0.2 },  // arrival
  },                                // An entry is a bare ref or { src, volume }. SET THE
                                    // VOLUME: a recording mastered for its own sake sits
                                    // far too loud next to synthesised SFX and a spoken
                                    // line, and it has to sit UNDER the word the child is
                                    // listening for. Same ref grammar as clips. Own
                                    // audio elements, NOT the voice channel, so a sound
                                    // effect layers under a spoken line instead of
                                    // cancelling it, and they are always fire-and-forget.
  trayOverlay: true,               // optional: float the tray ON the board instead of
                                    // slicing a strip out of it. For a game whose
                                    // backdrop is a full scene this is the difference
                                    // between a full-bleed world and a letterboxed
                                    // picture sitting on a coloured mat. The game is
                                    // responsible for keeping its parts clear of the
                                    // tray strip.
}
```

A wide space (`w/h >= 1.25`) flips the parts tray to the bottom so a
horizontal build gets the full landscape width instead of a square
letterbox — the same branch a square space already takes in portrait, so the
14 pre-existing games (all square, all authored against the old behaviour)
render byte-identically regardless of these keys existing.

## Recorded-voice lines (opt-in)

Every `voice.*` field, and every per-round `say`, has always accepted a plain
STRING spoken via `speech.js` — that path is unchanged. A game that wants
recorded teacher voice for that same line may instead give it a LINE OBJECT:

```js
{ clip: 'letter:m', text: 'mmm' }                              // one clip
{ seq: ['letter:m', 'letter:a', 'letter:t', 'word:mat'],        // a sequence
  gap: 240, text: 'mmm-aaa-t… mat!' }                           // (ms between clips)
```

`text` is the Web Speech fallback — spoken if no clip in `seq`/`clip` resolves
to a playable recording, so a game is never silent while assets are pending.
Sequence timing comes from the real clip durations (each clip's audio `ended`
event), never a hardcoded guess; `gap` is the only authored pause.

Clip refs share the art-ref grammar's shape:

| ref | resolves via |
|---|---|
| `letter:m` | `content.letterSoundUrl('m')` — shared phonics fragment |
| `word:mat` | `content.wordAudio('mat')` |
| `cheer:mat` | `content.wordCelebrate('mat')` |
| `isfor:ball` | `content.isforAudio('ball')` — "B is for ball" |
| `shared:audio/…` | any file under `shared/assets/` |
| `game:…` | game-local file, resolved against `config.assetBase` |
| `clip:key` | the GAME-LOCAL manifest via `voice-clips.say()` (opt in with `voice.clips: { manifest, lines, defaults }`) |

A game with no `voice.clips` block never calls `voice-clips.init()` and stays
network-silent, same as today.

## Required debug hook (review automation depends on this)

```js
window.QLOBE_DEBUG = {
  version: 1,
  gameId: 'then-now-sort',
  engine: 'match-pairs',
  ready,                 // Promise resolving after boot + config load
  listModes(),           // [{ id, title }]
  startMode(id),         // Promise; resolves when first round awaits input
  getState(),            // { screen:'splash'|'play'|'end', mode, round, roundsTotal, awaitingInput }
  getTargets(),          // [{ id, role:'correct'|'wrong'|'neutral', rect:{x,y,w,h} }]
  tap(targetId),         // Promise<{accepted:boolean}> — same code path as a real tap
  winRound(),            // Promise — completes current round via correct inputs
  mute(),                // silence speech + sfx (headless test runs)
  seed(n)                // deterministic shuffles from here on
};
```

`tap()` must go through the exact same handler a real pointer event reaches.
`getTargets()` roles must be truthful for the current prompt (that's what lets the
reviewer verify the gentle-nudge path automatically).

This shape is a FLOOR, not a ceiling — keep `version: 1` and add
engine-specific extras on top rather than bumping the version (see
`games/counting-treasure-cups/js/main.js` for a precedent). `build-assemble.js`
adds:

```js
  getAudioLog(),          // [{ t, kind:'clip'|'speech', ref, url }] — ring
                           // buffer (last 80) of everything actually voiced,
                           // so QA can tell a recorded clip from the Web
                           // Speech fallback without listening to it
  clearAudioLog(),        // empty the ring buffer between assertions
  getLayout(),            // measured layout snapshot: boardScale, board
                           // rect, tray rect/side — for regressing the field
                           // maths without screenshotting
  fastTimers(scale=0.05), // compress every tween/wiggle/idle duration by
                           // this factor (clamped [0.01, 1]) so QA doesn't
                           // sit through real-time celebrations; returns the
                           // clamped scale. timeScale defaults to 1, so a
                           // game that never calls this is byte-identical
  home()                  // back to the splash with no page reload, so QA
                           // can loop through every mode in one page load
```

`mute()` must silence EVERYTHING audible, not just the engine's own channel —
cancel `window.speechSynthesis`, and set `.muted = true` on any stray
`<audio>`/`<video>` element — since a trailing voice line from a previous
gesture is exactly the kind of thing that spoils a QA recording.

`getState()`'s five keys above are likewise a floor; `build-assemble.js` adds
`build`, `space`, `slotsTotal`, `placed`, `selected`, `dragging`, `hovered`,
`muted`, and `clips: { configured, loading, ready }` — the same principle,
just on the state snapshot instead of the hook's method list.

## What a game folder looks like

```
games/<id>/
  index.html      # from templates/stub-game/ — mounts the engine with the config
  config.js       # the game: engine choice + content data (this IS the game)
  game.json       # per-game manifest (status "beta" while placeholder-assets)
  game-design.md  # mini-GDD
  ASSETS.md       # provenance + "Assets needed" list for future production
  custom.js       # OPTIONAL, ≤150 lines, only when the mini-GDD demands behavior
                  # the engine doesn't have — flag it in your report
```
