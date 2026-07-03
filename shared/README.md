# `shared/` — the QLOBE Kids platform library

One shared library, consumed by every game. Reuse it before building anything new
so the platform stays coherent (one voice, one font, one look) and downloads stay
small. Full inventory and provenance in
[`docs/asset-system.md`](../docs/asset-system.md).

## What's in here
| Folder | Contents |
|---|---|
| `js/` | `audio.js` (recorded teacher voice + speech fallback), `speech.js` (Web Speech wrapper), `sfx.js` (WebAudio SFX, no files) |
| `assets/letter-tiles/` | 56 onset & rime tile PNGs |
| `assets/objects/` | 134 word picture-card PNGs |
| `assets/audio/` | teacher-voice clips + `manifest.json` (`fragments`, `words`, `prompts`, `celebrate`, `misc`) |
| `assets/ui/` | HUD buttons: `btn-home|play|shuffle|sound.png` |
| `assets/twemoji/` | 31 emoji SVGs (CC-BY 4.0 fallback) |
| `data/words.json` | master word / onset / rime content manifest |
| `fonts/` | `fredoka-latin-600-normal.woff2` (display font) |
| `vendor/` | three.js r166 + `RoundedBoxGeometry.js` (MIT) |
| `characters/` | shared character art (reserved) |

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
them.

## Learn more
- Asset inventory, naming, shared-vs-local, growth policy: [`docs/asset-system.md`](../docs/asset-system.md)
- Interaction patterns and reusable UI conventions: [`docs/interaction-patterns.md`](../docs/interaction-patterns.md)
