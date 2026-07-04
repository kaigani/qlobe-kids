# The shared asset system (`shared/`)

QLOBE Kids ships one **shared library** that every game consumes. Reusing it
keeps the platform coherent (one voice, one font, one look), keeps games tiny,
and keeps the download small. **Check `shared/` before you make anything new.**

Consumption rule: a game at `games/<id>/` reaches the library with `../../shared/`
from its `index.html`, and `../../../shared/` from files one level deeper (e.g.
`js/main.js`, `css/style.css`). See [`shared/README.md`](../shared/README.md).

---

## What exists now

### `shared/js/` — the runtime libraries
| Module | What it does |
|---|---|
| `audio.js` | **Primary voice channel.** Plays recorded teacher-voice clips from the audio manifest; falls back to Web Speech when a clip or the manifest is missing. Exports `ready`, `unlock`, `play(cat, key, opts)`, `playSeq`, `stop`. |
| `speech.js` | Thin Web Speech (`speechSynthesis`) wrapper. Exports `unlock`, `speak`, `speakSeq`, `stop`. |
| `sfx.js` | WebAudio-synthesized sound effects — **zero files**. Exports `pop`, `unpop`, `whoosh`, `sparkle`, `tada`, `silly`, `boing`, `tick`, `unlock`. |

### `shared/assets/letter-tiles/` — 56 onset & rime tiles (PNG)
Glossy letter tiles for phonics word-building: **19 single-letter onset tiles**
(`b c d f g h j k l m n p r s t v w y z`) and **37 rime tiles**
(`at an ap ag am ad ab ax ak`, `ed eg em en et eb`, `ig in ip it ix ib id`,
`og op ot ox ob od om`, `un up ug ub ud um ut us`). File name = the letters, e.g.
`at.png`, `b.png`.

### `shared/assets/objects/` — 134 word picture-cards (PNG)
Consistent toy-style illustrations, one per CVC word, named by the word:
`cat.png`, `hat.png`, `bag.png`, `bed.png`, `sun.png`, `van.png`, `zip.png`, …
plus a `mystery.png` cover card. These map 1:1 to entries in
[`shared/data/words.json`](../shared/data/words.json).

### `shared/data/words.json` — master content manifest
The source of truth for word content. Shape: `onsets` (letter → sound, e.g.
`"b": "buh"`), `rimes` (e.g. `"at": "at"`), and a `words` array of
`{ word, onset, rime, type, char, img }` — where `char` is an emoji fallback and
`img` is the illustration subject. Everything (tiles, object art, audio) is keyed
off this file.

### `shared/assets/audio/` — recorded teacher-voice library
One warm, consistent preschool-teacher voice. Driven by `manifest.json`
(`{ "<category>": { "<key>": { "file", "dur" } }, "_v": <cache-bust> }`).
Subdirectories / categories:

| Category | Count | Example keys |
|---|---|---|
| `fragments/` | 56 | `ab`, `b`, `at` — onset/rime sound bites |
| `words/` | 133 | `cat`, `bag`, `sun` — whole words |
| `prompts/` | 133 | per-word spoken prompts |
| `celebrate/` | 133 | per-word praise clips |
| `misc/` | 8 | `hooray`, `mixer-intro`, `mystery-intro`, … |

Play a clip with `audio.play('words', 'cat', { fallbackText: 'cat' })`. If the
clip is absent, the `fallbackText` is spoken via `speech.js`.

### `shared/assets/ui/` — the UI kit
`btn-home.png`, `btn-play.png`, `btn-shuffle.png`, `btn-sound.png` — the shared
HUD button set.

### `shared/fonts/` — the display font
`fredoka-latin-600-normal.woff2` (Fredoka SemiBold, weight 600) — the platform
face. `@font-face` it from `../../../shared/fonts/` (see the template CSS).

### `shared/assets/twemoji/` — emoji fallback (31 SVGs)
Twemoji artwork used as a defensive fallback when a picture-card is missing.
**CC-BY 4.0** — attribution required (see below).

### `shared/vendor/` — vendored third-party code
`three.module.min.js` (three.js **r166**, MIT) and `RoundedBoxGeometry.js` (MIT),
for games that render in 3D. Reference them via the `index.html` import map.

### `shared/characters/`
Reserved for shared character art (currently empty).

---

## Naming conventions
- **All lowercase, kebab-case, relative paths.** GitHub Pages is case-sensitive;
  macOS is not — a wrong case works locally then 404s live.
- Content-keyed names: tiles and object cards are named by their content
  (`at.png`, `cat.png`) so they line up with `words.json` and the audio manifest.
- Audio keys mirror `words.json` (word / onset / rime strings).

## Shared vs. game-local: which is it?
Put an asset in **`shared/`** when it is content-neutral and reusable across
games — the voice library, the font, the UI kit, letter tiles, generic object
cards, three.js. Keep an asset **inside the game** (`games/<id>/assets/`) when it
is specific to that game's look or theme — its splash art, background plate,
bespoke characters, one-off SFX. When in doubt, start local; promote to `shared/`
only once a second game wants it.

## The module-URL rule (important for shared JS)
A module in `shared/js/` may be loaded from a page at any folder depth, so it
**must not** resolve its own assets with page-relative paths. Resolve them
against the module's own location instead:

```js
// inside shared/js/*.js — robust at any page depth:
const MANIFEST_URL = new URL('../assets/audio/manifest.json', import.meta.url);
```

`import.meta.url` is the module's URL, so `new URL('../assets/…', import.meta.url)`
always points at `shared/assets/…` no matter which game imported it. Prefer this
over bare relative strings in any code that lives under `shared/`.

## Transparent-asset quality bar

Assets that ship with an alpha channel (characters, foods, objects, props)
must have **clean anti-aliased edges** — no white halos, no jagged fringes,
no chroma spill. The proven production approach: generate the artwork on a
perfectly flat chroma-key background (solid green or magenta), then use an
AI layer-decomposition model to extract the subject layer with true alpha,
describing the subject explicitly in the extraction prompt so the redraw
stays faithful. Avoid luminance/flood-fill keying for new assets — it fringes
on soft edges. Verify every cutout by compositing it over a saturated color
(magenta) and inspecting the silhouette at 2-4x zoom.

## Adding to `shared/`
Contribute via PR, and for every new asset record its **provenance and license**:
1. Add the file under the right `shared/` subfolder, lowercase kebab-case name.
2. Log it in the contributing game's `ASSETS.md` (source URL, creator, license,
   whether attribution is required, and any modifications).
3. Third-party assets must be license-compatible (prefer MIT / CC-BY / OFL /
   public-domain) and attributed where required.

The worked example to copy is
[`games/sound-sprouts/ASSETS.md`](../games/sound-sprouts/ASSETS.md) — a full
provenance table covering three.js, Twemoji, Fredoka, and the locally-generated
tiles, object cards, UI, and voice clips.

## Growth policy
Keep the library lean: optimize images (trim, compress PNGs), keep audio as
compact `m4a`, and don't commit unused variants. If `shared/` approaches ~1 GB,
stop and rethink — split rarely-used packs out, or load them on demand. Small,
reused, well-optimized assets over large one-off screens.

## Required attribution
Emoji artwork © Twitter, Inc and other contributors, from the Twemoji project
(https://github.com/jdecked/twemoji), licensed under CC-BY 4.0
(https://creativecommons.org/licenses/by/4.0/).
