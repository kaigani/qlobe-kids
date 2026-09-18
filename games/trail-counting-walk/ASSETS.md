# Trail Counting Walk assets

All shipped media is committed and runs offline. No runtime request reaches an
image, speech, transcription, or video model. Original game art and recordings
are QLOBE Kids project-generated assets released under CC BY 4.0; code is MIT.

## Production art

| Runtime asset | Source / model | Deterministic processing | QA |
| --- | --- | --- | --- |
| `assets/art/world-select.webp` | GPT Image 2 `world-select-master.png` | centered 1440×1080 cover crop; WebP | environment-only, clear card/title zones, Papercraft material review |
| `assets/art/world-meadow.webp` | GPT Image 2 style continuation from the accepted select plate | centered 1440×1080 cover crop; WebP | open five-stone trail and safe HUD zones |
| `assets/art/world-creek.webp` | GPT Image 2 style continuation from Meadow | centered 1440×1080 cover crop; WebP | open creek band; no baked stones/characters/text |
| `assets/art/world-ridge.webp` | GPT Image 2 style continuation from Creek | centered 1440×1080 cover crop; WebP | bright sunset, readable open path, not a dark/night scene |
| `assets/art/title.webp` | GPT Image 2 title master | Qwen Image Layered `layer_2`; alpha floor, trim, pad, WebP | visually spell-checked at full size: **TRAIL COUNTING WALK**; magenta edge review |
| route cards, stone, fox poses, pennant, star, flag, orange plate, active mat | one coordinated GPT Image 2 12-object master | required bounding-box cutter → one Qwen Image Layered attempt per verified crop → opaque-core gate → accepted Layered alpha or exact-source contiguous-ground matte → transparent WebP | expected-count gate, alpha histogram, magenta composites, full-size silhouette review |
| `assets/hub/tiles/trail-counting-walk.jpg` | dedicated Krea 2 / `krea2-turbo-t2i`, seed 42, 768×640, eight steps | centered 640×533 progressive JPEG | separate Toy Table hub grammar; no title, numeral, UI, or splash crop |
| `assets/og-image.jpg` | production runtime screenshot | 1200×630 crop/encode through the repository preview workflow | generated only after the final production layout passed |

Exact GPT Image 2 prompts and reference roles are retained verbatim in
`assets/source/gpt-image-2/PROMPTS.md`. The six accepted source masters remain
beside that file. The source image-generation mode was the Codex built-in
image-generation workflow, using GPT Image 2 as requested.

### Required cutter pass

The opaque production sheet was inspected before cutting. The calibrated,
expected-count command was:

```sh
python tools/cut-asset-sheet.py \
  games/trail-counting-walk/assets/source/gpt-image-2/asset-sheet-master.png \
  games/trail-counting-walk/assets/source/crops \
  --names route-5 route-10 route-20 stone fox-idle fox-hop fox-celebrate \
          pennant star finish-flag button-orange active-mat \
  --expected-count 12 --min-area 9000 --close-radius 4 \
  --distance-threshold 34 --chroma-threshold 20 --order reading \
  --debug-mask games/trail-counting-walk/assets/source/qa/asset-sheet-mask.png
```

`boxes.json` records pixel, `xywh`, and normalized coordinates plus the source
SHA-256. Every crop was reviewed for fox ears/tails/paws, flag pole, star tips,
card edges, and isolated background pixels.

### Layered extraction and alpha QA

A first Qwen Image Layered experiment on the complete contact sheet retained
only the purple route card. The cutter found `1` rather than the required `12`,
so that candidate was rejected and retained at
`assets/source/layer2/rejected/asset-sheet-seed42-only-one-object.png`.

Production therefore submitted each already verified crop independently:

```sh
python games/trail-counting-walk/tools/extract-layered.py --check
python games/trail-counting-walk/tools/extract-layered.py
```

The workflow is `qwen-image-layered`, seed 42 first, always fetching the
documented subject output `layer_2`. The title, star, and active leaf mat passed
the opaque-core/transparent-ground gate and ship from that output. The other ten
per-object attempts returned near-transparent detail layers (maximum alpha
3–5), so they were rejected rather than amplified or silently accepted. Those
candidate files remain under `assets/source/layer2/` for audit. Production uses
the repository-established exact-source contiguous-ground matte fallback for
those ten crops; it preserves the accepted GPT Image 2 pixels, keeps the largest
connected subject, removes only the sampled charcoal edge ground, and fills the
solid route-card interiors. No LAN hostname or address is stored in the
repository.

The deterministic final stage is:

```sh
python games/trail-counting-walk/tools/generate-hub-tile.py
python games/trail-counting-walk/tools/build-assets.py --force
```

`build-assets.py` verifies the 12-name cutter manifest, makes the Layered versus
exact-source choice from measured alpha coverage, runs
`tools/pipeline/cutout_finalize.py` with an alpha floor of 4, writes alpha
histograms and magenta composites under `assets/source/qa/finals/`, normalizes
all three fox poses to a shared 640×640 floor-aligned canvas, and validates the
runtime alpha channels/dimensions. Every accepted/rejected decision and fallback
source is recorded in `assets/source/qa/production-report.json`.

## Voice

`assets/audio/lines.json` is the spoken source of truth. The local production
driver uses the rights-cleared shared reference
`shared/assets/refs/voice-teacher.wav` with `qwen3-tts-voiceclone`, seed 7 first
and seeds 8/9 only for rejected lines. It batches all voice-clone calls before
switching the LAN host to Whisper, converts to mono 96 kbps AAC/M4A with
`loudnorm` and `+faststart`, and validates duration/audio streams with ffprobe.

Every clip is then submitted to `whisper-stt`. A candidate must cover at least
80% of the intended normalized words; numeric digit and number-word spellings
are normalized as equivalent without lowering that threshold. Failed lines are
retried at the next seed. Route introductions additionally require their
meaning-bearing words (`stones`, `creek`, or `ridge`) plus the goal and starting
number, so a high aggregate score cannot hide a changed destination. An
unresolved line is omitted so the correct Web Speech fallback wins.

```sh
python games/trail-counting-walk/tools/generate-voice.py --check
python games/trail-counting-walk/tools/generate-voice.py
```

All 28 authored lines passed. Accepted durations live in
`assets/audio/manifest.json`; intended/heard text, seed, coverage, and retained
verification state live in `assets/audio/qa.json`.

## Shared music and sounds

- `shared/assets/music/quirky-forest-adventure.mp3` is referenced in place and
  played through `shared/js/bgm.js`; it is not copied into the game. The runtime
  preloads it, unlocks on the first genuine gesture, keeps it quiet, ducks it
  under narration, follows mute, and stops on exit.
- Step, gentle retry, and celebration effects are synthesized at runtime by
  `shared/js/sfx.js`; they add no media files or network requests.

Shared-media licensing and provenance are recorded with the shared assets.

## Source concept

The supplied brief, 4:3 UI mockups, and concept video under
`../01-game-concepts/trail-counting-walk/` are design references supplied with
the project. They are not redistributed by this game. Production follows the
brief’s canonical **Papercraft** label and the mockups’ hierarchy rather than
the older prose request for live-action footage; the decision is documented in
`game-design.md`.
