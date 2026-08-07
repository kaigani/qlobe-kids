# `shared/` — the QLOBE Kids platform library

One shared library, consumed by every game. Reuse it before building anything new
so the platform stays coherent (one voice, one font, one look) and downloads stay
small. Full inventory and provenance in
[`docs/asset-system.md`](../docs/asset-system.md).

## What's in here
| Folder | Contents |
|---|---|
| `css/` | `base.css` (the platform reset + `@font-face`; link it, never re-copy it), `engine-base.css` (the reset the config-driven `js/engines/` games link instead of `base.css`), `hud.css` (the `.qk-hud-*` button vocabulary), `screens.css` (`[data-qk-screen][hidden]`, the mode-card skin) |
| `js/` | the runtime toolkit — see the table below |
| `js/engines/` | the config-driven game engines (own README) |
| `js/stage/` | Stage v2 (PixiJS): `stage.js` scene, `tween.js`, `particles.js`, `puppet.js` + `theater.js` puppet rig, `water.js` physics, `pose-conductor.js`, `spotlight.js`, `spline.js`, plus DOM backends for games that can't be Pixi (`drag-to-slot-dom.js`, `pose-sprite-dom.js`, `constrained-gesture-dom.js`). `puppet-builder.js` + `puppet-studio.html` are an authoring tool, not a runtime module — open `puppet-studio.html` directly to rig a character. |
| `js/clay/` | soft-body clay sculpting: `field.js` + `field-three.js` (the live implicit-field renderer) and `heightfield.js` + `heightfield-canvas.js` (2D heightfield sculpting, e.g. Playdough Letter Factory). The older lobe-union engine (`lobes.js`/`lobes-three.js`) was deleted 2026-08-06 — superseded by `field.js`; git history has it if it's ever needed again. |
| `js/studio/` | QLOBE Studio: the in-browser game-authoring tool (`studio.js`, `api.js`, `projects.js`) that reads/writes `config.json` engine games. Not imported by any shipped game. |
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
| `voice-clips.js` | **primary voice channel** — flat-key recorded-clip player + speech fallback; `duration`, `setMuted`, `getAudioLog` (`kind: 'clip'` / `'speech'`) |
| `speech.js` | Web Speech (`speechSynthesis`) wrapper |
| `sfx.js` | WebAudio sound effects, zero files |
| `analytics.js` | the one shared GA4 pageview tag (`G-H2WT0GRBVS`); every game links it once instead of pasting the gtag snippet. See `CLAUDE.md`'s "What NOT to do" for the analytics policy this implements. |
| `voice-meter.js` | local-only microphone energy/pitch summaries and gentle expressive-voice spark scoring; never records or uploads |
| `camera-throw.js` | local-only coarse red/yellow/blue throw tracking; emits position/color summaries without preview, persistence, export, or network |
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
| `dom.js` | `escapeHtml`, `el`, `clamp`, `round`, `cssEscape`, `pointInside`, `prefersReducedMotion`, `emojiSpan` |
| `preload.js` | `preloadImages(urls, { idle })`, never rejects |
| `content.js` | accessor for shared letters / words / sounds |
| `hotspot-scene.js`, `freeform-board.js`, `magnifier-lens.js`, `journal.js`, `musical-canvas.js` | interaction surfaces for specific archetypes; freeform-board includes normalized move/transform/rotate state with undo |
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
