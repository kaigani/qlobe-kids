# Subtraction Picnic asset provenance

Subtraction Picnic uses authored raster artwork only. CSS provides responsive
layout, hit geometry, focus, and motion; it does not draw the game's characters,
food, scenery, cards, title, or controls. Project code is MIT and game art
follows the QLOBE Kids CC BY 4.0 convention.

## Production art

The seven accepted GPT Image 2 source masters live in
`assets/source/gpt-image-2/`:

- `meadow-backdrop-master.png` — the open 4:3 forest meadow plate;
- `characters-master.png` — squirrel, fox, and bear;
- `foods-master.png` — apple, strawberry, cracker stack, grapes, and sandwich;
- `scene-props-master.png` — three-panel storybook, picnic blanket, and basket;
- `ui-surfaces-master.png` — prompt, equation, and three answer surfaces;
- `hud-pips-master.png` — five watercolor controls and the simplified counting
  leaf/seed pip;
- `title-lockup-master.png` — the exact `SUBTRACTION PICNIC` painted title.

The concept mockups under `01-game-concepts/subtraction-picnic/output/ui-mockups/`
were local composition and style references. Full generation prompts and
reference mapping are retained in `assets/source/PROMPTS.md`.

The shipping opaque background is `assets/backdrop.webp` (quality 86, below the
400 KB scene budget). Transparent runtime art is in `assets/characters/`,
`assets/foods/`, `assets/props/`, `assets/ui/`, and `assets/title.webp`.

## Cutter, Layered extraction, and alpha QA

The repository's required `tools/cut-asset-sheet.py` was run with
`--expected-count` against all five production sheets. Its exact source hashes,
foreground bounds, padded crop bounds, and tuned parameters are in:

| Sheet | Expected | Receipt |
| --- | ---: | --- |
| characters | 3 | `assets/source/crops/characters/boxes.json` |
| foods | 5 | `assets/source/crops/foods/boxes.json` |
| scene props | 3 | `assets/source/crops/props/boxes.json` |
| UI surfaces | 5 | `assets/source/crops/ui/boxes.json` |
| HUD and counting pips | 6 | `assets/source/crops/hud/boxes.json` |

The food pass intentionally raised `min-area` to 2000 after the dry run exposed
a detached 1,285-pixel artifact; accepting six cuts as five was not allowed.
Binary detection masks are retained under `assets/source/qa/`.

`tools/process-art.py` is the deterministic production driver. It runs the
approved `qwen-image-layered` `layer_2` path, invokes
`tools/pipeline/cutout_finalize.py`, preserves alpha receipts, and writes
saturated-magenta composites for inspection. The fox Layered result passed both
automated and visual QA. Squirrel and bear Layered attempts returned an opaque
plate and near-blank alpha plane and were rejected; their raw outputs remain as
`*.qwen-rejected.png`. The remaining assets use the Studio-approved
border-connected, source-preserving matte fallback, which removes only plain
background reachable from a crop border and never redraws the accepted GPT
pixels. A nine-pixel neighboring basket intrusion in the rectangular blanket
crop was removed by retaining only the blanket's largest connected component.

`assets/source/art-manifest.json` records every final source hash, method,
destination hash, alpha histogram, and Qwen failure reason. The per-asset
magenta plates under `assets/source/qa/` are the human edge/halo review set.

## Hub tile

The hub uses the platform's separate Toy Table grammar rather than cropping the
watercolor splash. Studio's `menu-game-tile` template ran
`krea2-turbo-t2i` at 768×640, style `toy-table`, seed 42. Its accepted frame has
exactly five wooden apples: two moving to Squirrel's basket and three remaining
on the gingham blanket. The accepted source and Studio recipe are:

- `assets/source/krea2/hub-tile-seed42.png`;
- `assets/source/krea2/hub-tile-recipe.json`.

The hand-curated 640×533 progressive JPEG is
`../../assets/hub/tiles/subtraction-picnic.jpg`. It has no title, numeral, or UI
baked in.

## Teacher voice and audio

The game ships 29/29 finalized AAC teacher clips in `assets/audio/`, generated
with the approved local `qwen3-tts-voiceclone` workflow and rights-cleared local
teacher reference. TTS was batched before transcription to avoid model churn.
Every clip passed local Whisper `base/en` transcript QA; after normalizing
spoken number words against Whisper's digits, the minimum match is 0.947 and
equation clips are 1.000. No line relies on fallback-only audio.

- `assets/audio/lines.json` — verbatim runtime/fallback script;
- `assets/audio/manifest.json` — files, durations, and text hashes;
- `assets/audio/qa.json` — intended text, transcript, similarity, workflow,
  seed, and pass state;
- `tools/generate-voice.py` — resumable TTS → AAC/loudness → Whisper driver.

Web Speech remains the runtime fallback if a recorded file cannot play. The
shared recorded `shared/assets/music/gentle-country-morning.mp3` starts only
after a user gesture and ducks beneath narration. Shared WebAudio SFX come from
`shared/js/sfx.js`.

## Shared presentation assets

| Asset | Source | License/use |
| --- | --- | --- |
| Fredoka SemiBold | `shared/fonts/fredoka-latin-600-normal.woff2` (Milena Brandao & Hafontia) | SIL OFL 1.1 |
| Home/back/sound/next/refill buttons and counting pip | game-local GPT Image 2 watercolor sheet | QLOBE Kids CC BY 4.0 convention |
| Background music | `shared/assets/music/gentle-country-morning.mp3` | QLOBE Kids recorded shared library |
| Confetti palette and SFX | shared runtime modules | Programmatic feedback, not primary art |

## Runtime and review plates

Real-Chrome production captures for splash, Forest answer and solved reveal,
Picnic Party at
1024×768, 768×1024, 1180×520, and 844×390, plus the finale, are retained as
`assets/source/qa/runtime-*.png`. `tools/qa.mjs` regenerates them while also
checking the three modes, cloned-clip routing, invalid-drag return, five-round
completion, the debug contract, and minimum 96×96 touch geometry.

`assets/og-image.jpg` is the game's 1200×630 link preview and should be
regenerated from the accepted splash rather than edited by hand.
