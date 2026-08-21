# Puzzle Explorer asset and provenance record

All runtime assets are local. The authoritative runtime inventory is `config.json`; every world-tour scene has a local source image and a durable seeded cut manifest.

## GPT Image 2 puzzle scenes

The 21 full-bleed sources were generated in built-in imagegen mode, one call per asset. Each output is 1536×1024 (3:2), uses the established layered felt/cardstock papercraft style, contains no UI or text, and distributes clear visual clues across the future cut regions.

| Continent | Sources |
|---|---|
| Africa | `africa-serengeti-lion`, `africa-congo-okapi`, `africa-nile-elephant` |
| Antarctica | `antarctica-emperor-penguin`, `antarctica-weddell-seal`, `antarctica-albatross-treaty` |
| Asia | `asia-himalaya-snow-leopard`, `asia-japan-crane`, `asia-india-tiger` |
| Europe | `europe-greece-turtle`, `europe-alps-ibex`, `europe-lapland-reindeer` |
| North America | `north-america-arctic-polar-bear`, `north-america-great-plains-bison`, `north-america-maya-jaguar` |
| South America | `south-america-amazon-jaguar`, `south-america-andes-llama`, `south-america-galapagos-tortoise` |
| Oceania | `oceania-great-barrier-reef-turtle`, `oceania-new-zealand-kiwi`, `oceania-polynesia-whale` |

The durable copies live at `assets/source/puzzles/<id>-gpt-image-2.png`. Generated-image originals remain in the Codex image-generation cache. The older Forest Fox, Star Rocket, and Garden Flowers sources remain in the tree as recoverable legacy assets but are no longer part of the world-tour configuration.

## Seeded puzzle cuts

`tools/cut-puzzle.mjs` calls `shared/js/puzzle-cutter.js` in Chrome. The first two scenes in every continent use six pieces:

```sh
node tools/cut-puzzle.mjs <source> --grid 3x2 --seed <scene-v1> --max 1200 --out <folder>
```

The third scene in every continent uses twelve pieces:

```sh
node tools/cut-puzzle.mjs <source> --grid 4x3 --seed <scene-v1> --max 1200 --out <folder>
```

Each scene folder contains the appropriate transparent `piece-rNcN.png` files, `pieces.json`, `outline.svg`, `assembled.png`, and `preview.png`. Manifests are 1200×800 with either 2 rows × 3 columns / 6 pieces or 3 rows × 4 columns / 12 pieces. Runtime recreates the same rows, columns, seed, paths, edges, and reconstruction coordinates before play.

## UI and presentation art

| Asset | Source / transformation | Role |
|---|---|---|
| `assets/ui/title.webp` | Accepted Puzzle Explorer title lockup. | Choice/loading title. |
| `assets/ui/hint.png` | Built-in imagegen papercraft lightbulb badge. | Explicit hint control. |
| `assets/ui/tray-alpha.webp` | Built-in imagegen felt tray, matte-finished deterministically. | Loose-piece presentation. |
| `assets/ui/prompt-ribbon-alpha.webp` | Accepted stitched ribbon crop, matte-finished deterministically. | Chooser, placement, and completion labels. |
| `assets/backgrounds/play-texture.webp` | Clean blue paper crop from the accepted papercraft background. | All screen backdrops. |
| `assets/ui/hand-guide.webp` | Accepted papercraft hand with alpha finish. | Idle/explicit modeled placement path. |
| `assets/ui/confetti.webp` | Reused QLOBE Kids papercraft celebration surround. | Completion. |
| Shared HUD PNGs | `shared/assets/ui/btn-{home,back,sound,play}.png` | Navigation, replay, and sound controls. |

## Narration, music, and SFX

`data/lines.json` contains direction lines, 21 short continent-scene introductions, 12 randomized encouragements, and the final completion line. The 12 encouragement clips and `celebrate-complete.m4a` are locally synthesized Samantha AAC clips committed for uninterrupted serialized playback. The new scene introductions use the shared speech fallback until dedicated recordings are approved; their fact cards are always visible.

The older `success` “It’s puzzle-tastic!” line remains in the manifest for provenance but is not requested by the runtime. The final completion phrase is `celebrate-complete`: “You did it!”

Music is one generated instrumental theme per continent (`assets/audio/theme-<continent>.m4a`), produced with the local MiniMax Music 3 workflow (`audio-minimax-music-3`) — a warm, even-energy "toybox" arrangement (kalimba, marimba, flute, ukulele, or steel pan depending on the continent) matched to that continent's papercraft scenes, never claiming a specific real-world musical tradition. Each track's caption/lyrics/seed are recorded alongside it in `assets/audio/theme-<continent>.m4a.recipe.json`. The generated songs are not seamless loops, so `shared/js/bgm.js` (a new shared module, not the procedural `shared/js/music.js` band engine this game used previously) fades each track to silence just before its natural end and fades back in from the top, and exposes the same `duck()`/`setMuted()` shape so narration ducking works identically. `js/main.js` starts/crossfades the theme when a continent is chosen and fades it out back at the world chooser. SFX come from local `shared/js/sfx.js` WebAudio synthesis.

## Storefront and license

The hub tile and OG image retain their existing local production assets; they may be refreshed after the world-tour art is accepted. Game code and authoring scripts are MIT. New and reused QLOBE Kids papercraft assets ship under the repository’s CC BY 4.0 asset policy. No third-party photograph, logo, font file, or externally fetched runtime asset is included.
