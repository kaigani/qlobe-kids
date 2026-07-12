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

## Engine module contract

- Pure ES module. Imports allowed: `../sfx.js`, `../speech.js`, `./art.js`, and —
  for Stage v2 (PixiJS) engines — the stage kit: `../stage/stage.js`,
  `../stage/tween.js`, `../stage/particles.js`, `../stage/art-pixi.js`. Nothing else.
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
| `shared:objects/cat.png` | `shared/assets/objects/cat.png` |
| `shared:foods/apple.png` | `shared/assets/foods/apple.png` |
| `shared:letter-tiles/b.png` | `shared/assets/letter-tiles/b.png` |
| `char:maya` | `shared/characters/maya/portrait.png` |
| `text:CAT` | the text big in Fredoka on the card (letters, words, numerals) |
| `swatch:#f4c53d` | a solid color chip (color games) |

Swapping placeholder → real art later is a config edit, never a code change.
The resolver lives in `shared/js/engines/art.js` (built once, imported by engines).

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
