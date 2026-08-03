# `shared/` — the QLOBE Kids platform library

One shared library, consumed by every game. Reuse it before building anything new
so the platform stays coherent (one voice, one font, one look) and downloads stay
small. Full inventory and provenance in
[`docs/asset-system.md`](../docs/asset-system.md).

## What's in here
| Folder | Contents |
|---|---|
| `css/` | `base.css` (the platform reset + `@font-face`; link it, never re-copy it), `hud.css` (the `.qk-hud-*` button vocabulary), `screens.css` (`[data-qk-screen][hidden]`, the mode-card skin) |
| `js/` | the runtime toolkit — see the table below |
| `js/engines/` | the config-driven game engines (own README) |
| `js/stage/` | Stage v2: Pixi scene, puppets, tweens, particles, water, drag + pose DOM backends |
| `assets/letter-tiles/` | 56 onset & rime tile PNGs |
| `assets/objects/` | 134 word picture-card PNGs |
| `assets/audio/` | teacher-voice clips + `manifest.json` (`fragments`, `words`, `prompts`, `celebrate`, `misc`) |
| `assets/ui/` | HUD buttons: `btn-home`, `btn-back`, `btn-play`, `btn-shuffle`, `btn-sound` (`.png`) |
| `assets/twemoji/` | 31 emoji SVGs (CC-BY 4.0 fallback) |
| `data/words.json` | master word / onset / rime content manifest |
| `data/letters.json` | canonical A–Z index (phonic, sound clip, objects) |
| `fonts/` | `fredoka-latin-600-normal.woff2` (display font) |
| `vendor/` | three.js r166 + `RoundedBoxGeometry.js` (MIT), `pixi.min.js` |
| `characters/` | shared character art + rigs |

### `js/` — one line each
| Module | What it is |
|---|---|
| `audio.js` | recorded teacher voice + speech fallback; `configure({ manifestUrl })` points it at a game's own manifest |
| `speech.js` | Web Speech (`speechSynthesis`) wrapper |
| `sfx.js` | WebAudio sound effects, zero files |
| `voice-clips.js` | flat-key recorded-clip channel; `duration`, `setMuted`, `getAudioLog` (`kind: 'clip'` / `'speech'`) |
| `narrator.js` | the game's one voice: mute gate, `aria-live` announcer, interrupt token |
| `audio-unlock.js` | the first-gesture unlock, with the latch that reopens on foreground |
| `tap.js` | `onTap(el, action, { feedback })` — one press path |
| `hud.js` | `hudButton`, `soundDebounce`, `progressDots` (pairs with `css/hud.css`) |
| `screens.js` | splash → play → end router: `createScreens`, `createBag`, `wireEndScreen` |
| `mode-select.js` | the splash's mode cards; `skin: false` keeps a bespoke look |
| `celebrate.js` | confetti burst + ambient loop, `QK_PALETTE`, `tada()` |
| `idle-nudge.js` | `createNudger` — gentle "still there?" ladder |
| `debug-harness.js` | `installDebug(spec)` → `window.QLOBE_DEBUG` v1, `collectTargets` |
| `timers.js` | `createTimers()` — cancellable, time-scalable timer group |
| `rng.js` | `mulberry32`, `hashString`, `shuffle`, `pick` — the one seeded source |
| `dom.js` | `escapeHtml`, `el` |
| `preload.js` | `preloadImages(urls, { idle })`, never rejects |
| `content.js` | accessor for shared letters / words / sounds |
| `hotspot-scene.js`, `freeform-board.js`, `magnifier-lens.js`, `journal.js`, `musical-canvas.js` | interaction surfaces for specific archetypes |
| `music.js`, `performance-recorder.js`, `performance-video-export.js` | music bed + performance capture |

## Consumption rule (relative paths, always lowercase)
From a game at `games/<id>/`:
- **`index.html`** → `../../shared/…` (import maps, `<img>`, `<link>`).
- **files one level deeper** (`js/main.js`, `css/style.css`) → `../../../shared/…`
  — ES-module imports resolve relative to the module's own URL, one level below
  the document.

Inside `shared/js/` itself, code **must** resolve its own assets against its
module URL, never the page:
```js
const url = new URL('../assets/audio/manifest.json', import.meta.url);
```
This keeps shared modules correct no matter which game (or folder depth) loads
them. `url()`s inside `shared/css/*.css` resolve against the stylesheet for the
same reason, so `base.css` and `hud.css` are correct from any game folder.

A game links `css/base.css` and keeps exactly two local rules — the page colour
and the display font, the two things base.css deliberately leaves to the page:

```html
<link rel="stylesheet" href="../../shared/css/base.css" />
<style>
  :root { --qk-bg: #bee3f5; }
  body { font-family: 'Fredoka', 'Arial Rounded MT Bold', sans-serif; }
</style>
```

## Learn more
- Asset inventory, naming, shared-vs-local, growth policy: [`docs/asset-system.md`](../docs/asset-system.md)
- Interaction patterns and reusable UI conventions: [`docs/interaction-patterns.md`](../docs/interaction-patterns.md)
