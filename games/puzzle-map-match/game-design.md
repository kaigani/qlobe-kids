# Puzzle Explorer — production game design

**Category:** sensorial-science · **Ages:** 3–6 · **Status:** beta until a child/iPad playtest

**Art direction:** tactile papercraft — layered cardstock and felt, visible fibers, stitched cream labels, soft tabletop shadows, and chunky physical jigsaw edges.

## Product promise

> Choose a continent, meet an animal, learn about its place and heritage, then build the picture.

Puzzle Explorer is a seven-continent world tour with 21 scenes:

- Each continent has three puzzles.
- The first two scenes use a friendly 3×2 grid with six pieces.
- The final scene is a harder 4×3 grid with twelve pieces.
- Every scene presents an animal fact, a location fact, and a cultural or scientific heritage fact before and during play.
- All pieces are visible from the start and can be dragged in any order. Completion replaces the board with the full source image.

The experience treats culture with care: scenes use landmarks, crafts, architecture, conservation, and scientific traditions as learning cues; they do not depict living people or turn sacred symbols into decoration.

## World tour content

| Continent | Six-piece scenes | Twelve-piece challenge |
|---|---|---|
| Africa | Serengeti Lion · Congo Okapi | Nile Valley Elephant |
| Antarctica | Emperor Penguin · Weddell Seal | Antarctic Albatross |
| Asia | Himalayan Snow Leopard · Japan’s Red-Crowned Crane | India’s Bengal Tiger |
| Europe | Aegean Sea Turtle · Alpine Ibex | Lapland Reindeer |
| North America | Arctic Polar Bear · Great Plains Bison | Maya Rainforest Jaguar |
| South America | Amazon River Jaguar · Andes Llama | Galápagos Giant Tortoise |
| Oceania | Great Barrier Reef Turtle · New Zealand Kiwi | Polynesian Humpback Whale |

The complete fact copy lives beside each puzzle in `config.json`, so the art, chooser, play screen, completion screen, and future translations share one source of truth.

## Screen and session map

```text
EXPLORE THE WORLD -- continent --> CONTINENT PUZZLES
                                      |       |       |
                                  six-piece six-piece twelve-piece
                                      \       |       /
                                       PUZZLE BOARD
                                             |
                                    completed full image
                                             |
                                 next scene / continent choices
```

- **World chooser:** seven large continent cards show a representative scene, a short introduction, and progress through that continent.
- **Continent chooser:** three picture cards show the region, piece count/difficulty, and an animal fact. Its single back control returns to the QLOBE Kids splash menu.
- **Board:** all six or twelve loose pieces are scattered at fixed, irregular positions to the left and right of the board. Each loose piece keeps the board’s exact display size, can be moved independently within its side scatter area, and never causes its neighbors to reflow. The board contains a faint whole-picture guide and exact cut outlines.
- **Spoken facts:** after the scene introduction, short animal, place, and heritage snippets play at intervals during the build. They pause around placement celebrations and never require a visual legend.
- **Hint:** after eight idle seconds—or immediately from the lightbulb—the selected silhouette glows and the paper hand models tray-to-space motion. Reduced-motion mode keeps the glow and removes the traveling hand.
- **Retry:** a wrong-space drop returns the piece to its independent scatter position. Releasing outside the board lets the player reposition that piece within the left or right scatter area without moving its neighbors. Progress, persistence, and already placed pieces do not change. There is no red X, lost life, buzzer, timer, or score.
- **Snap:** the correct canvas is placed at the cutter’s supplied `x/y`, receives one brief physical settle, and remains on the board. Each placement queues one short randomized encouragement without interrupting an earlier celebration.
- **Complete:** the board is replaced by the full source image. Confetti, a back arrow to the current continent’s choices, and Next puzzle remain visible. The final spoken celebration is “You did it!”

## Cutter and placement contract

At authoring time, each 1536×1024 source is downscaled to 1200×800 and passed to the shared cutter. The first two puzzles in each continent use `--grid 3x2`; the final puzzle uses `--grid 4x3`:

```text
node tools/cut-puzzle.mjs <source> --grid 3x2 --seed <scene-v1> --max 1200 --out <folder>
node tools/cut-puzzle.mjs <source> --grid 4x3 --seed <scene-v1> --max 1200 --out <folder>
```

Every folder retains transparent piece PNGs, `pieces.json`, `outline.svg`, `assembled.png`, and `preview.png`. Six-piece folders contain six PNGs; challenge folders contain twelve.

At runtime the selected source is drawn to a 1200×800 canvas and passed to `cutImage()` with the same rows, columns, and seed. Boot rejects a scene if any piece identity, SVG path, edge label, or `x/y` differs from its committed manifest. The board’s semantic targets are the cell rectangles; the cutter’s `x/y` is authoritative for the snapped canvas.

## Interaction rules

- One primary pointer at a time. The shared DOM drag controller owns window-level move/up/cancel, capture, blur, page-hide, visibility, resize, and orientation cleanup.
- A 10px movement gate separates tap from drag. The drag ghost is a fresh bitmap copy because cloning a `<canvas>` element does not copy its pixels.
- Tap flow is Piece → Space. Enter/Space on the focused piece uses the same flow.
- Wrong and off-board attempts do not mutate `placed` or `step`.
- Input locks only during the short retry or snap settle. Teardown removes every ghost, hint timer, event listener, and in-flight voice line.
- Each fitted canvas uses percentage-scaled values derived from its exact image-coordinate `x`, `y`, and intrinsic canvas dimensions. This keeps reconstruction invariant across viewports and both grid sizes.

## Visual and responsive contract

- Runtime CSS owns layout, state, focus, and motion. Scene art, title, controls, hint badge, ribbon, hand, and confetti remain raster assets; the functional jigsaw outline is drawn from cutter geometry.
- Landscape uses a centered board with scattered pieces on both sides. Portrait places the two groups beneath the board.
- Fact cards remain readable on desktop, phone, and compact landscape; dense explanatory copy collapses on the smallest chooser while the scene remains identifiable.
- HUD controls respect safe areas. Every explicit control has a visible focus ring and accessible name.
- Reduced motion removes snap travel, repeated glow movement, confetti entrance, shakes, and the modeled hand; state, target contrast, narration, and final composition remain.

## Narration and sound

`data/lines.json` contains the original direction lines, 21 short continent-scene introductions, 12 short randomized encouragements, and the final “You did it!” line. The celebration queue uses committed local audio clips for the 12 encouragements and final line, so drag/re-render activity cannot cut them short. Scene introductions and the three per-scene fact snippets use the shared browser speech path until dedicated recordings are approved; the facts are derived from each puzzle’s configuration record.

Music is a generated instrumental theme per continent (MiniMax Music 3, see ASSETS.md), started/crossfaded via `shared/js/bgm.js` when a continent is chosen and faded out back at the world chooser; each track loop-fades near its natural end since it isn't a seamless loop. SFX come from local WebAudio synthesis.

## Persistence and privacy

Only `localStorage['qk-puzzle-explorer-v2']` is written. It contains schema version 2 and completed puzzle ids. No name, age, voice, location, date, identifier, or gameplay history is stored. Storage failure falls back to memory and never blocks play.

## Architecture

- `config.json` owns seven continent hubs, 21 sources/manifests, fixed grids, seeds, dimensions, fact copy, voice keys, timing, and local art paths.
- `js/main.js` owns screen state, continent navigation, runtime cutting, manifest drift rejection, canvas placement, drag/tap/keyboard parity, hints, persistence, narration, and `QLOBE_DEBUG`.
- `shared/js/puzzle-cutter.js` owns pure seeded geometry and canvas rendering for arbitrary rows/columns.
- `shared/js/stage/drag-to-slot-dom.js` owns hardened pointer lifecycle and ghost cleanup.
- `tools/cut-puzzle.mjs` owns durable authoring artifacts and assembled/exploded renders.
- Shared voice, audio unlock, SFX, bgm, tap, timers, preload, and debug modules remain authoritative.

Production runtime is static, dependency-free, and makes no model, account, location, camera, microphone, motion-sensor, or personal-data request.

## QLOBE_DEBUG v1

The hook exposes the standard contract plus:

- `getState()` → screen, phase, puzzle, continent, piece count/grid, placed indices, completed puzzles, busy/selected/hint/fact-progress/reduced-motion state, manifest agreement, runtime geometry, active drag, art failures, timers, and music state.
- `listModes()`, `startMode(id)`, and `startPuzzle(id)` → the world-tour and 21 scene choices.
- `place(pieceIndex, slotIndex)`, `winRound()`, `completePuzzle()`, and `completeMode()` → deterministic review paths for either six or twelve pieces.
- `showHint()` → the real lightbulb path.
- `verifyAssembly()` → exact live-canvas versus CLI assembled-image pixel comparison.
- `tap(id)`, `getTargets()`, `getAudioLog()`, `clearAudioLog()`, `mute(on)`, and `fastTimers(scale)` → shared review functions.

The full QA/validation pass remains intentionally deferred until this issue set is accepted.
