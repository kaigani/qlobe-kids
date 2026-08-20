# Puzzle Explorer — production game design

**Category:** sensorial-science · **Ages:** 3–6 · **Status:** beta until a child/iPad playtest

**Art direction:** tactile papercraft — layered cardstock and felt, visible fibers, stitched cream labels, soft tabletop shadows, and chunky physical jigsaw edges

**Concept authority:** the static Puzzle Explorer mockups in `01-game-concepts/puzzle-explorer/output/ui-mockups/` and the user’s explicit correction establish the central mechanic as assembling a conventional jigsaw puzzle. The earlier continent-matching interpretation is retired.

## Product promise

> Choose a beautiful picture, fit six real interlocking pieces into their matching spaces, and finish with the exact whole scene.

The production build makes four promises:

1. The pieces are not decorative rectangles. `shared/js/puzzle-cutter.js` creates their seeded interlocking geometry and renders each one to an independent transparent canvas.
2. Correct placement uses the cutter’s returned `x/y` reconstruction coordinates. The game does not estimate, redraw, or approximate a snap.
3. Dragging, tap-to-place, and keyboard activation reach the same placement function. Motor precision never gates completion.
4. A pre-reader can finish from the scene clues, piece silhouettes, modeled hand path, lightbulb hint, short labels, and spoken guidance.

## Screen and session map

```text
CHOOSE PUZZLE --fox / rocket / garden--> SIX-PIECE BOARD
      ^                                      |
      |                            correct piece × 6
      |                                      v
      +---------- choose / back -------- COMPLETE
                                             |
                                  build again / next puzzle
```

- **Choose (3–15 seconds):** the authored Puzzle Explorer title, “Choose a puzzle” banner, and three large picture cards. Completed pictures receive a small check but never lock or reorder content.
- **Board (roughly 45–150 seconds):** one loose piece is offered at a time. The board contains a faint whole-picture guide and the exact six cut outlines. Correct pieces accumulate in place.
- **Hint:** after eight idle seconds—or immediately from the lightbulb—the current silhouette glows and the existing paper hand models tray-to-space motion. Reduced-motion mode keeps the glow and removes the traveling hand.
- **Retry:** a wrong-space or off-board drop returns the piece. Progress, order, persistence, and already placed pieces do not change. There is no red X, lost life, buzzer, timer, or score.
- **Snap:** the correct canvas is placed at its cutter-supplied `x/y`, receives one brief physical settle, and remains on the board. “It’s puzzle-tastic!” is the success beat.
- **Complete:** all six original cut canvases form the picture. Confetti, “Puzzle complete!”, Build again, Next puzzle, Choose, and Home remain visible.

Each puzzle uses a deterministic corner-first order, but the sequence is not presented as a test and has no difficulty label. All three pictures use the reference mockup’s exact 3×2 / six-piece scope.

## Three puzzles

| Puzzle | Scene clues | Seed | Piece order |
|---|---|---|---|
| Forest Fox | fox, mushrooms, pine trees, stream, stepping stones | `forest-fox-v1` | 0, 5, 2, 3, 1, 4 |
| Star Rocket | rocket, ringed planet, moon, stars, Earth and clouds | `star-rocket-v1` | 2, 3, 0, 5, 1, 4 |
| Garden Flowers | coral/blue/yellow flowers, fence, watering can, sun, butterflies | `garden-flowers-v1` | 3, 2, 0, 5, 1, 4 |

The order varies the first visible clue while still placing corners early. It is authored data, not a difficulty system.

## Cutter and placement contract

At authoring time, each 1536×1024 GPT Image 2 source is downscaled to 1200×800 and passed to:

```text
node tools/cut-puzzle.mjs <source> --grid 3x2 --seed <scene-v1> --max 1200 --out <folder>
```

Every folder retains six transparent PNGs, `pieces.json`, `outline.svg`, `assembled.png`, and `preview.png`.

At runtime the selected source is drawn to a 1200×800 canvas and passed to `cutImage()` with the same rows, columns, and seed. Boot rejects a scene if any piece identity, SVG path, edge label, or `x/y` differs from its committed manifest. A debug assembly probe draws all six live canvases back at `piece.x, piece.y` and compares that bitmap against the CLI’s `assembled.png`; the accepted build has zero mismatched pixels and a maximum channel delta of zero for all three scenes.

The board’s semantic targets are the six cell rectangles. They answer “which space did the child choose?” only. Once that cell index matches the current piece index, the cutter’s `x/y`—not the target rectangle—is authoritative for rendering the snapped canvas.

## Interaction rules

- One primary pointer at a time. The shared DOM drag controller owns window-level move/up/cancel, capture, blur, page-hide, visibility, resize, and orientation cleanup.
- A 10px movement gate separates tap from drag. The drag ghost is a fresh bitmap copy because cloning a `<canvas>` element does not copy its pixels.
- Tap flow is Piece → Space. Enter/Space on the focused piece and space uses the same flow.
- Wrong and off-board attempts do not mutate `placed`, `step`, or the configured order.
- Input locks only during the short retry or snap settle. Teardown removes every ghost, hint timer, event listener, and in-flight voice line.
- Each fitted canvas uses percentage-scaled values derived from its exact image-coordinate `x`, `y`, and intrinsic canvas dimensions. This keeps the reconstruction invariant across every viewport.

## Visual and responsive contract

- Runtime CSS owns layout, state, focus, and motion. Scene art, title, controls, hint badge, tray, ribbon, hand, and confetti remain raster assets; the functional jigsaw outline is drawn directly from cutter geometry.
- The board guide is the selected source at 20% opacity over cream, plus the cutter’s border and seven interior cuts. Placed pieces are fully opaque and physically beveled.
- Landscape uses board-left / piece-tray-right. Portrait stacks the tray beneath the board. The 568×320 composition keeps both fully on-screen.
- At 320px portrait the contained board is wide enough for six 101.9×101.9px semantic cells; there is no page overflow. Desktop and tablet cells are larger.
- HUD controls respect safe areas. Every explicit control has a visible focus ring and accessible name.
- Reduced motion removes snap travel, repeated glow movement, confetti entrance, shakes, and the modeled hand; state, target contrast, narration, and final composition remain.

## Narration and sound

The child-facing table contains 17 concise jigsaw lines. Two exact concept phrases retain previously accepted Qwen3 teacher clips with Whisper ratio ≥0.98:

- “Welcome to Puzzle Explorer! Let’s discover the world together.”
- “It’s puzzle-tastic!”

The environment’s egress gate denied the correction run’s local Studio request for the 15 new lines, so this build does not send text or voice data through an alternate path. Those lines use the shared local Web Speech fallback and are ready for the `pmm-jigsaw-*` generator when separately authorized. Music uses the existing local vibraphone, guitar, and maracas sample set; SFX are shared local WebAudio synthesis.

## Persistence and privacy

Only `localStorage['qk-puzzle-explorer-v2']` is written. It contains schema version 2 and completed puzzle ids. The new key intentionally ignores the retired geography stamps. No name, age, voice, location, date, identifier, or gameplay history is stored. Storage failure falls back to memory and never blocks play.

## Architecture

- `config.json` owns the three sources, manifests, fixed grids, seeds, dimensions, piece orders, voice keys, timing, and local art paths.
- `js/main.js` owns screen state, runtime cutting, manifest drift rejection, canvas placement, drag/tap/keyboard parity, hints, persistence, narration, and `QLOBE_DEBUG`.
- `shared/js/puzzle-cutter.js` owns pure seeded geometry and canvas rendering.
- `shared/js/stage/drag-to-slot-dom.js` owns hardened pointer lifecycle and ghost cleanup.
- `tools/cut-puzzle.mjs` owns durable authoring artifacts and assembled/exploded QA renders.
- `tools/finalize-jigsaw-assets.py` owns deterministic matte removal for the accepted ribbon and tray.
- Shared voice, audio unlock, SFX, music, tap, timers, preload, RNG, and debug modules remain authoritative.

Production runtime is static, dependency-free, and makes no model, account, location, camera, microphone, motion-sensor, or personal-data request.

## QLOBE_DEBUG v1

The hook exposes the standard contract plus:

- `getState()` → screen, phase, puzzle, current piece/expected slot, placed indices, completed puzzles, busy/selected/hint/reduced-motion state, manifest agreement, runtime geometry, active drag, art failures, timers, and music state.
- `listModes()`, `startMode(id)`, and `startPuzzle(id)` → the same three puzzle choices.
- `place(pieceIndex, slotIndex)`, `winRound()`, `completePuzzle()`, and `completeMode()` → deterministic QA paths.
- `showHint()` → the real lightbulb path.
- `verifyAssembly()` → exact live-canvas versus CLI assembled-image pixel comparison.
- `tap(id)`, `getTargets()`, `getAudioLog()`, `clearAudioLog()`, `mute(on)`, and `fastTimers(scale)` → shared review functions.

## Beta acceptance and promotion gate

- Three select paths, eighteen correct placements, wrong-space and off-board return, pointer drag, tap, keyboard, hint, replay, next, persistence, and reload pass automated Chrome probes.
- Resize-mid-drag, blur-mid-drag, ghost cleanup, manifest drift rejection, alpha-bearing loose canvases, complementary tab/blank pairs, and exact zero-delta assembly pass.
- Desktop 1200×800, phone 320×800, compact landscape 568×320, portrait tablet 700×1100, and reduced-motion compositions pass with no page error, failed local request, overflow, or remote runtime request.
- Final art and code review must report no unresolved high- or medium-severity defect.
- Promotion to `live` still requires a real child/iPad playtest; the game remains `beta`.
