# Beat the Bugs asset provenance

This game uses raster artwork only. The shipped artwork follows the QLOBE project convention: art assets are CC BY 4.0 (with generation provenance retained here), and game code is MIT. No vector or CSS artwork is used for game art.

## Production sources

The production source directory is `assets/source/gpt-image-2/`. These are GPT Image 2 raster sources, with the three mockups also serving as composition references and crop sources:

- `background-lab-aqua.png` — clean aqua hygiene-lab background.
- `background-lab-coral.png` — clean coral smile-lab background edit.
- `mockups/01-splash.png` — title, Maya placement, and mission-card composition reference.
- `mockups/02-suds-shield.png` — Suds Shield composition reference.
- `mockups/03-smile-shield.png` — Smile Shield composition reference.
- `sheets/hand-actions.png` — four hand-action cards: palms, backs, between, nails.
- `sheets/tooth-actions.png` — four tooth-action cards: fronts, tops, insides, tongue.
- `sheets/bug-villains.png` — four germ bugs and four sugar bugs.
- `sheets/hero-tools.png` — seven hygiene tools: water, soap pump, soap shield, faucet, paste, brush, floss.
- `sheets/ui-rewards-separated.png` — separated UI tokens, badges, zone ring, and Rule of Twos badge.
- `sheets/sequence-extras.png` — six wet/soap/clean and paste/floss/clean sequence cards.
- `sheets/control-plates.png` — prompt and button plates.
- `title-clean.png` — corrected, unobstructed title plaque after the splash-crop extraction was visually rejected.
- `sheets/mission-cards-clean.png` — corrected coordinated two-card sheet after both splash-crop Layered results were visually rejected.
- `hub-tile.png` — GPT Image 2 edit of the accepted splash world into the text-free 6:5 production catalog composition.

The first Krea scene-plate calibration was rejected and is not shipped. Hub seed 42 was rejected because it under-communicated toothbrushing. Seed 1337 made both missions legible, but the independent ART DIRECTOR rejected its dark studio backdrop and generic clay treatment as disconnected from the in-game lab. Both local-API candidates and receipts are retained as production evidence. The shipped 640×533 tile instead uses the accepted GPT Image 2 splash as its edit reference, so Maya, the aqua/coral lab, bubbly hands, brushed smile, and two retreating bugs match the game at first glance; the final ART DIRECTOR gate accepted it with no required revisions, and `assets/source/gpt-image-2/hub-tile.json` is its receipt.

Maya's identity asset is the canonical shared `shared/characters/maya/portrait.png`, not a newly generated character. Recorded background music is the shared `shared/assets/music/upbeat-playground-pop.mp3`.

## Cutting and extraction

The exact-count cutter was run against each source sheet with `tools/cut-asset-sheet.py`, producing the crop directories and manifests below. The manifests include source hashes, bounding boxes, and detected counts; do not hand-edit them.

| Source family | Crop directory | Manifest | Expected count |
| --- | --- | --- | ---: |
| hand actions | `assets/source/crops/hands/` | `boxes.json` | 4 |
| tooth actions | `assets/source/crops/teeth/` | `boxes.json` | 4 |
| bugs | `assets/source/crops/bugs/` | `boxes.json` | 8 |
| tools (initial proof) | `assets/source/crops/tools/` | `boxes.json` | 7 |
| tools (accepted tight recut) | `assets/source/crops/tools-clean/` | `boxes.json` | 7 |
| UI rewards | `assets/source/crops/ui/` | `boxes.json` | 8 |
| sequence extras | `assets/source/crops/sequence-extras/` | `boxes.json` | 6 |
| control plates | `assets/source/crops/controls/` | `boxes.json` | 2 |
| title correction | `assets/source/crops/title-clean/` | `boxes.json` | 1 |
| mission-card correction | `assets/source/crops/missions-clean/` | `boxes.json` | 2 |
| splash crops | `assets/source/crops/splash/` | rejected runtime crops retained as references | 3 |

`tools/process-assets.py` is the authoritative hybrid extraction driver. It inspects both Qwen layer roles, rejects layers without meaningful alpha, and runs `tools/pipeline/cutout_finalize.py`. Five complex assets were accepted from the approved local Qwen Image Layered workflow (`hand-palms`, `hand-backs`, `hand-between`, `hand-nails`, and `tool-floss`). The remaining source-sheet objects use deterministic, source-preserving charcoal removal; the hollow zone ring uses the same sampled ground globally so its center is transparent. Qwen's technically passing but visually broken title, mission-card, and ring attempts are retained only as rejected evidence.

`assets/source/layer-plan.json` is the authoritative extraction plan. `assets/source/processing.json` is the resumable 42/42 receipt and records source, accepted layer/method, seed, automated alpha QA, and attempts. `assets/source/qa/alpha-report.json` plus the magenta contact sheet cover all 43 non-background runtime images. Runtime WebPs are quality-90 (backgrounds quality-88) production encodes; lossless PNG/model intermediates remain under `assets/source/`.

Teacher dialogue is complete: 26/26 AAC clips use the approved local Qwen3 TTS voice-clone workflow with the approved teacher reference and seed 7. Every line passed local Whisper `base/en` transcript QA; the minimum normalized match is 0.882, durations span 1.677–5.193 seconds, and there are no fallback-only manifest entries. `assets/audio/manifest.json` is the runtime map and `assets/audio/qa.json` is the line-level receipt. Krea 2 supplied two documented local-API explorations; the ART DIRECTOR rejected both for the shipped hub, whose accepted GPT Image 2 edit receipt is `assets/source/gpt-image-2/hub-tile.json`. `tools/generate-hub-tile.py` is intentionally exploration-only: reruns write a candidate JPEG and receipt under `assets/source/local-api/hub/` and never overwrite the accepted shared hub tile.

## Directories

- `assets/bg/`, `assets/boards/`, `assets/tools/`, `assets/bugs/`, and `assets/ui/` are final runtime raster destinations.
- `assets/source/` retains original generations, crops, masks, manifests, prompts, and processing receipts.
- `assets/audio/` retains dialogue metadata and, once accepted, voice files.
