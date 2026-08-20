# Puzzle Explorer asset and provenance record

All runtime assets are local. Production makes no model or LAN calls. The authoritative runtime inventory is `config.json`; the retired geography plates, cards, map, tools, and 56 geography-only narration records were removed from the current tree and remain recoverable from the previous commit.

## GPT Image 2 puzzle scenes

The three full-bleed sources were generated in built-in `imagegen` mode, one call per asset, using the concept mockups only as material/composition references. Each output is 1536×1024 (3:2), contains no UI/text/cut lines, and distributes meaningful visual clues across all six future grid regions.

| Source | Production role | Prompt summary |
|---|---|---|
| `assets/source/puzzles/forest-fox-gpt-image-2.png` | Forest Fox source and choice-card art | Friendly central red fox in a woodland clearing; mushrooms/ferns lower left, stream/stepping stones lower right, trees/mountains/sky; layered cardstock/felt, visible fibers, soft object shadows; no seams, frame, text, UI, hands, or duplicate foxes. |
| `assets/source/puzzles/star-rocket-gpt-image-2.png` | Star Rocket source and choice-card art | Central coral storybook rocket; ringed mustard planet, cream moon, stars, Earth/clouds; calm deep-blue space; layered cardstock/felt; no seams, frame, text, UI, people, astronauts, or duplicate rockets. |
| `assets/source/puzzles/garden-flowers-gpt-image-2.png` | Garden Flowers source and choice-card art | Coral/yellow/blue focal flowers; fence, watering can, sun, butterflies, clouds, grass, stones; layered cardstock/felt; no seams, frame, text, UI, hands, or duplicate focal flowers. |

Generated-image originals remain in the Codex image-generation cache; the project-bound copies above are the durable sources.

## Seeded puzzle cuts

`tools/cut-puzzle.mjs` calls `shared/js/puzzle-cutter.js` in Chrome. The accepted commands were:

```sh
node tools/cut-puzzle.mjs games/puzzle-map-match/assets/source/puzzles/forest-fox-gpt-image-2.png --grid 3x2 --seed forest-fox-v1 --max 1200 --out games/puzzle-map-match/assets/puzzles/forest-fox
node tools/cut-puzzle.mjs games/puzzle-map-match/assets/source/puzzles/star-rocket-gpt-image-2.png --grid 3x2 --seed star-rocket-v1 --max 1200 --out games/puzzle-map-match/assets/puzzles/star-rocket
node tools/cut-puzzle.mjs games/puzzle-map-match/assets/source/puzzles/garden-flowers-gpt-image-2.png --grid 3x2 --seed garden-flowers-v1 --max 1200 --out games/puzzle-map-match/assets/puzzles/garden-flowers
```

Each folder contains:

- six transparent `piece-rNcN.png` canvases with an inner cut line and directional bevel;
- `pieces.json` with dimensions, seed input/resolved seed, cell rectangles, exact paths, edge labels, and reconstruction `x/y`;
- `outline.svg`, the printable full cut template;
- `assembled.png`, the seamless reconstruction proof;
- `preview.png`, the exploded physical-piece review.

All three manifests are 1200×800, 2 rows × 3 columns, with six finite placements and seven complementary tab/blank joins. Runtime recreates and compares the same contract before play.

## UI and presentation art

| Asset | Source / transformation | Role |
|---|---|---|
| `assets/ui/title.webp` | Accepted GPT Image 2 Puzzle Explorer lockup from the original production pass; alpha-trimmed with source retained at `assets/source/title-gpt-image-2.png`. | Choice/loading title. Exact spelling visually reviewed. |
| `assets/ui/hint.png` | Built-in imagegen, referenced from the placement mockup: isolated stitched cream cardstock badge with a mustard felt lightbulb; generated with alpha and resized to 256×256 using `sips`. Source: `assets/source/hint-button-gpt-image-2.png`. | Explicit hint control. |
| `assets/ui/tray-alpha.webp` | Built-in imagegen: shallow wide blue stitched felt tray with green corner leaves. The service returned a neutral checker preview; `tools/finalize-jigsaw-assets.py` deterministically extracts saturated tray/leaves and the darker grounding shadow, trims, and pads. Source: `assets/source/tray-gpt-image-2.png`. | Holds one loose cut canvas without vertical distortion. |
| `assets/ui/prompt-ribbon-alpha.webp` | The accepted cream stitched ribbon crop from the first papercraft plate; `tools/finalize-jigsaw-assets.py` removes its retired cool-blue screen matte with a documented warm-vs-blue alpha ramp. | Choose, placement, and completion labels. |
| `assets/backgrounds/play-texture.webp` | Clean blue paper crop from the accepted first papercraft background. | All screen backdrops. |
| `assets/ui/hand-guide.webp` | Accepted GPT Image 2 paper hand, alpha-finished in the first production pass; source files retained. | Idle/explicit modeled placement path. |
| `assets/ui/confetti.webp` | Reused QLOBE Kids papercraft celebration surround from Globe Spin Stories. | Completion. |
| Shared HUD PNGs | `shared/assets/ui/btn-{home,back,sound,play}.png` | Navigation, replay, and sound controls. |

`assets/jigsaw-finalize-report.json` records the exact two matte-removal outputs, inputs, transforms, and sizes. The script is deterministic and writes atomically.

## Narration, music, and SFX

`data/lines.json` contains 17 jigsaw-specific lines. The two exact concept lines reuse accepted Qwen3 teacher recordings from the previous batch:

| Key | Runtime clip | Provenance |
|---|---|---|
| `welcome` | `assets/audio/welcome.m4a` | `assets/source/voice-recipes/welcome.recipe.json` + `assets/source/voice-qa/welcome.json`; accepted teacher reference, Whisper ratio ≥0.98. |
| `success` | `assets/audio/success.m4a` | `assets/source/voice-recipes/success.recipe.json` + `assets/source/voice-qa/success.json`; accepted teacher reference, Whisper ratio ≥0.98. |

The correction run attempted the approved local Studio workflow for the 15 newly authored lines, but the execution environment denied the data-egress permission. No workaround or alternate service was used. Their manifest entries are intentionally absent, so `shared/js/voice-clips.js` routes them through the local Web Speech fallback. `tools/gen-voice.mjs` is updated to use new `pmm-jigsaw-*` media ids and retains the seed 7/8/9 plus ≥0.98 Whisper gate for a future explicitly authorized recording pass.

Music uses local `shared/assets/instruments/{vibraphone,guitar,maracas-a,maracas-b}.m4a` samples arranged at runtime as “Paper Puzzle Parade.” SFX come from local `shared/js/sfx.js` WebAudio synthesis.

## Storefront and link preview

- `assets/hub/tiles/puzzle-map-match.jpg` is a deterministic 640×533 crop of the accepted Forest Fox source, keeping the central fox readable in the hub’s 6:5 card.
- `assets/og-image.jpg` is generated from the final game through `tools/pipeline/capture_og_images.mjs --only puzzle-map-match`; it is never hand-painted or substituted with a mockup.

## License

Game code and authoring scripts are MIT. New and reused QLOBE Kids papercraft assets ship under the repository’s CC BY 4.0 asset policy. No third-party photograph, logo, font file, or externally fetched runtime asset is included.
