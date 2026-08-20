# Puzzle Explorer Assets

Puzzle Explorer is a raster-first papercraft game. Runtime art is stored locally; the game makes no remote art requests.

## GPT Image 2 production art

All rows below were created with the built-in `imagegen` tool in generate/edit mode, then copied into `assets/source/`. Runtime WebPs are deterministic derivatives made by `tools/finalize-assets.py`. The imagegen skill's `remove_chroma_key.py` produced reproducible fallback mattes; the final card build prefers the visually approved Qwen layer separations documented below. No CSS or vector substitutes are used for these illustrations.

| Source file | Final production prompt / operation | Runtime derivatives |
|---|---|---|
| `assets/source/play-screen-gpt-image-2.png` | Using the concept overview and a gameplay-video frame as composition references, create a polished 4:3 children's geography screen in tactile layered cardstock: deep-blue paper table, stitched cream map board, blank prompt ribbon, empty navy tray, large shared-style HUD buttons, bright six-continent paper map, friendly oversize picture cards, no UI text. | Approved art-direction reference only |
| `assets/source/title-gpt-image-2.png` | Exact title `PUZZLE EXPLORER`, two stacked lines, orange `PUZZLE`, blue `EXPLORER`, thick layered cut-cardstock letters on a stitched cream paper plaque with tiny leaves and map tickets; flat chroma-magenta surround; no other words. | `assets/ui/title.png`, `assets/ui/title.webp` |
| `assets/source/animals-sheet-gpt-image-2.png` | Exact 3×2 papercraft card sheet in this visual system: panda, African elephant, kangaroo / American bison, llama, Alpine ibex; one complete square stitched paper card per cell, no labels, no text, flat keyable surround. | `assets/cards/panda.webp`, `elephant.webp`, `kangaroo.webp`, `bison.webp`, `llama.webp`, `ibex.webp` |
| `assets/source/foods-sheet-gpt-image-2.png` | Exact 3×2 papercraft card sheet: bananas, watermelon, lamington / corn, cacao, pretzel; one complete square stitched paper card per cell, no labels, no text, flat keyable surround. | `assets/cards/bananas.webp`, `watermelon.webp`, `lamington.webp`, `corn.webp`, `cacao.webp`, `pretzel.webp` |
| `assets/source/landmarks-sheet-gpt-image-2.png` | Exact 3×2 papercraft card sheet: Great Wall, Great Pyramid of Giza, Sydney Opera House / Statue of Liberty, Machu Picchu, Eiffel Tower; one complete square stitched paper card per cell, no labels, no text, flat keyable surround. | `assets/cards/great-wall.webp`, `pyramids.webp`, `sydney-opera-house.webp`, `statue-of-liberty.webp`, `machu-picchu.webp`, `eiffel-tower.webp` |
| `assets/source/splash-background-gpt-image-2.png` | Empty 4:3 papercraft explorer background: rich blue paper, leafy hills and flowers around the safe edges, hot-air balloon, paper plane, compass, clouds, and an open cream world-atlas along the bottom; large clean central title/mode safe area; no words or cards. | `assets/backgrounds/splash.webp`, `assets/backgrounds/play-texture.webp` |
| `assets/source/play-plate-gpt-image-2-edit.png` | Edit the approved play screen: remove all cards, hand cursor, map shapes, target halo, and words while preserving the stitched blue/cream board, empty prompt ribbon, HUD-safe frame, empty navy tray, foliage, shadows, and paper texture. | `assets/ui/map-board.webp`, `prompt-ribbon.webp`, `tray.webp` |
| `assets/source/hand-guide-gpt-image-2.png` | “Create one isolated papercraft UI hand cursor that belongs to the exact visual world of the reference image. A friendly child-sized off-white cut-paper hand with the index finger extended straight upward, palm facing the viewer, rounded simple fingers, a small sky-blue paper cuff, visible layered cardstock edges, subtle real paper fibers, and a soft compact contact shadow attached to the hand. Center the hand with generous empty margin. Use a perfectly flat solid chroma-key magenta background #FF00FF from edge to edge. No map, no cards, no tray, no stars, no icons, no text, no letters, no border, no additional objects, no detached shadow, no gradients in the background. Square bitmap asset, crisp silhouette, production-ready game UI guide.” The service returned black rather than magenta; the skill's corner-key matte removed it. | `assets/source/hand-guide-alpha.png`, `assets/ui/hand-guide.webp` |
| `assets/source/hub-tile-gpt-image-2.png` | Edit/generate from the approved splash material reference: landscape preschool-geography storefront art with a central open world-map passport, a panda picture-card placed over Asia, elephant and kangaroo cards in a tidy tray, compass and paper airplane; exact layered papercraft palette/materials; no words, logo, buttons, chrome, people, hands, clay, or distorted geography; keep subjects in a central 6:5 safe crop. | `../../assets/hub/tiles/puzzle-map-match.jpg` (center crop and resize to 640×533, JPEG quality 90) |

Generated-art creator: OpenAI GPT Image 2, directed for this QLOBE Kids project. Project license: CC BY 4.0 as declared in `game.json`.

## Local Qwen authoring

The authoritative user brief explicitly approved private-LAN asset generation. `tools/gen-qwen-assets.py --allow-lan` sent the four listed internal source plates to the configured private Qwen service using seed 42. The tool accepts only loopback/RFC1918 origins, refuses redirects, validates PNG/alpha coverage, normalizes service-native canvases to the exact source geometry when necessary, and writes each candidate atomically. Prompts, metrics, and the manual accept/reject record are in `assets/qwen-assets-report.json`.

| Candidate | Workflow | Review and production use |
|---|---|---|
| `assets/source/animals-layer2.png` | `qwen-image-layered` | Accepted after compositing on game blue: all six cards intact, clean transparent surround, no visible magenta fringe. Source for six animal runtime WebPs. |
| `assets/source/foods-layer2.png` | `qwen-image-layered` | Accepted under the same checks. Source for six food runtime WebPs. |
| `assets/source/landmarks-layer2.png` | `qwen-image-layered` | Accepted under the same checks. Source for six landmark runtime WebPs. |
| `assets/source/play-plate-qwen-edit.png` | `qwen-image-edit` | Rejected for runtime: it removed cards and the hand but retained a decorative blue world silhouette that would conflict with the authoritative map. Retained as honest authoring provenance only; `play-plate-gpt-image-2-edit.png` remains the board source. |

`tools/finalize-assets.py` records the selected sheet filename for every emitted 512×512 card and falls back to the imagegen-skill matte if a validated Qwen sheet is absent. Qwen is an authoring dependency only; production makes no model or LAN calls.

## Map and derived UI art

| Asset | Source | License | Transformation |
|---|---|---|---|
| `assets/map/continents.webp`, `continent-mask.png`, `continents.json` | Bundled Natural Earth `ne_110m_land` v5.1.2 | Public domain | `tools/render-map.py` rasterizes coastlines, deterministically classifies the six inhabited continents, excludes Antarctica, and emits matching visual/mask rasters plus semantic hint coordinates. |
| `assets/ui/confetti.webp` | QLOBE Kids `games/globe-spin-stories/assets/ui/confetti.webp` | CC BY 4.0 | Reused papercraft celebration surround on the end screen. |
| `assets/ui/success-burst.webp` | Local crop of the preceding confetti raster | CC BY 4.0 | Compact paper-star/confetti burst placed behind the successful map card. |
| Shared HUD buttons | `shared/assets/ui/btn-home.png`, `btn-back.png`, `btn-sound.png`, `btn-play.png` | CC BY 4.0 | Reused unmodified. |

## Audio

The 58-clip teacher-voice batch is recorded. The approved LAN Studio character-voice-line workflow is `qwen3-tts-voiceclone`, using the committed teacher reference. The seed ladder is 7/8/9. Whisper base/en strict normalized transcript comparison is ≥0.98; this accepted batch has a minimum ratio of 0.984 and a seed distribution of 51/6/1. Accepted Studio records are retained in `shared/media/pmm-voice-*`; runtime M4As and their manifest ship with local recipe and QA copies. Web Speech remains only a graceful fallback.

| Asset/channel | Source | Notes |
|---|---|---|
| Music samples | `shared/assets/instruments/{vibraphone,guitar,maracas-a,maracas-b}.m4a` | Local QLOBE Kids sample library, arranged at runtime as “Paper Passport Parade” by `shared/js/music.js`. |
| SFX | `shared/js/sfx.js` | Synthesized locally with WebAudio. |
| Teacher narration | `shared/media/pmm-voice-*` → `assets/audio/*.m4a` + `assets/audio/manifest.json` | 58 recorded clips; Studio records, local recipe, and QA copies retained. Web Speech is a graceful fallback only. |

## Link preview

`assets/og-image.jpg` is a screenshot of the game itself. Regenerate it with `node tools/pipeline/capture_og_images.mjs --only puzzle-map-match` after the final visual pass; do not edit it by hand.

The hub tile is the GPT Image 2 source listed above, deterministically center-cropped and resized with macOS `sips`. It replaces the retired clay-style tile so the storefront and game share one papercraft visual system.
