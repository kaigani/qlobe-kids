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

- Pure ES module. Imports allowed: `../sfx.js`, `../speech.js`, `./art.js`,
  `../voice-clips.js`, `../content.js`, and — for Stage v2 (PixiJS) engines —
  the stage kit: `../stage/stage.js`, `../stage/tween.js`, `../stage/particles.js`,
  `../stage/art-pixi.js`, `../stage/drag-to-slot.js` (pattern #11's canonical
  drag controller). Nothing else.
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
