# Obstacle Course Builder — asset provenance

All production art was generated with OpenAI GPT Image 2 from `assets/source/gpt-image-2/PROMPTS.md`. Five concept mockups/world references informed the look; they are references, not shipped runtime art. The visual direction is hand-made papercraft: cut paper, card, felt, foam and painted wood with soft edges, visible fibers and gentle shadows. It is not vector or CSS-generated art. Project-owned artwork is released under CC BY 4.0.

## Source and processing

- Generated masters: `assets/source/gpt-image-2/` (`*-master.png`).
- Transparent sprites and UI were cropped from flat chroma-background masters. `tools/extract-chroma-assets.py` performs hue-aware alpha extraction for cross-cell assets and removes disconnected contact-sheet remnants; QA crops and alpha checks are under `assets/source/qa/`.
- Runtime files are WebP and live in `worlds/`, `guides/`, `obstacles/`, `props/`, and `ui/` (complete list below).
- Keep `assets/bg.jpg` as a legacy, unused file if present. `assets/og-image.jpg` is a generated screenshot of the game splash screen, not source artwork.

## Final runtime files

**Worlds:** `worlds/arctic.webp`, `worlds/backyard.webp`, `worlds/jungle.webp`.

**Guides:** `guides/monkey-carry.webp`, `monkey-cheer.webp`, `monkey-climb.webp`, `monkey-crawl.webp`, `monkey-hop.webp`, `monkey-idle.webp`, `penguin-belly-slide.webp`, `penguin-carry.webp`, `penguin-cheer.webp`, `penguin-climb.webp`, `penguin-crawl.webp`, `penguin-hop.webp`, `penguin-idle.webp`, `puppy-carry.webp`, `puppy-cheer.webp`, `puppy-climb.webp`, `puppy-crawl.webp`, `puppy-hop.webp`, `puppy-idle.webp`.

**Obstacles:** `obstacles/arctic-belly-slide-ramp.webp`, `arctic-fish-carry.webp`, `arctic-ice-floe-crossing.webp`, `arctic-iceberg-wall.webp`, `arctic-igloo-tunnel.webp`, `backyard-foam-block-carry.webp`, `backyard-lily-pad-crossing.webp`, `backyard-rainbow-tunnel.webp`, `backyard-rock-wall.webp`, `jungle-boulder-wall.webp`, `jungle-fruit-carry.webp`, `jungle-log-crossing.webp`, `jungle-vine-tunnel.webp`.

**Props:** `props/arctic-goal.webp`, `backyard-goal.webp`, `fish.webp`, `foam-block.webp`, `fruit.webp`, `jungle-goal.webp`.

**UI:** `ui/cell-pad.webp`, `check.webp`, `course-board.webp`, `course-complete.webp`, `finish-flag.webp`, `landing-badge.webp`, `number-tab.webp`, `route-ribbon.webp`, `scrap-basket.webp`, `selection-ring.webp`, `slide-arrows.webp`, `snowflake-gate.webp`, `star.webp`, `start-flag.webp`, `swatches.webp`, `title.webp`, `undo.webp`.

## Audio and shared sources

Narration is non-identifying Qwen3-TTS voice-design with text-only input; no recorded voice or identity reference was uploaded. Raw source takes are in `assets/source/voice-raw/` (`.flac`); recipes and QA metadata are in `assets/source/qa/*.voice.recipe.json`; shipped finals are the `.m4a` files in `assets/audio/`. All 26 shipped lines achieved a Whisper transcript ratio of 1.0 against their authored text, above the ≥0.90 gate. The runtime manifest is fail-closed: an incomplete batch publishes no clips. Qwen Layered was not used for the accepted finals; the deterministic flat-chroma extraction preserved the authored silhouettes without redraw drift.

The game uses shared Fredoka at `../../shared/fonts/fredoka-latin-600-normal.woff2` and shared HUD/SFX implementation at `../../shared/js/sfx.js`.

## Link preview

`assets/og-image.jpg` is a QLOBE Kids-generated 1200×630 screenshot of this game's splash screen (CC BY 4.0; regenerate with the capture tool rather than editing by hand).
