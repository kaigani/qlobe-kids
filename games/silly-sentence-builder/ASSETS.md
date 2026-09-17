# Silly Sentence Builder — asset production record

All primary visible art is original raster media in the **Puppet / Cozy felt
fabric** world. Functional labels remain live HTML over blank authored felt
surfaces for accessibility. The game contains no SVG, emoji, CSS-gradient, or
CSS-drawn primary artwork.

## Delivered families

| Family | Production path | Runtime finals | QA / provenance |
| --- | --- | --- | --- |
| Felt theater | GPT Image 2 coordinated master | `assets/backgrounds/theater.webp` | Accepted master, full prompt and checksum in `assets/source/gpt-image-2/recipe-index.json` |
| Exact title lockup | GPT Image 2 generation plus precise alpha edit | `assets/ui/title.webp` | Exact `SILLY SENTENCE BUILDER` spelling and outside transparency reviewed at full size and on saturated magenta |
| Six character puppets | GPT Image 2 3×2 family sheet → strict six-object asset cut → deterministic WebP | `assets/characters/*.webp` | Source boxes, count and cut settings in `assets/source/cuts/characters/boxes.json`; decoded-runtime contact sheet in `assets/source/qa/characters-contact-magenta.jpg` |
| Six action props | GPT Image 2 3×2 family sheet → strict six-object asset cut → deterministic WebP | `assets/actions/*.webp` | Full alpha/contact QA under `assets/source/qa/` |
| Six place stages | GPT Image 2 3×2 family sheet → strict six-object asset cut → deterministic WebP | `assets/places/*.webp` | Each stage has a clear puppet landing area; full alpha/contact QA under `assets/source/qa/` |
| Six manner symbols | GPT Image 2 3×2 family sheet → strict six-object asset cut → deterministic WebP | `assets/manners/*.webp` | All six wordless concepts reviewed at runtime scale and on magenta |
| Twelve interface pieces | GPT Image 2 exact 4×3 blank UI sheet → strict twelve-object asset cut → deterministic WebP | `assets/ui/*.webp` | Generated surfaces contain no functional lettering; `assets/source/qa/ui-contact-magenta.jpg` |
| Hub tile | Approved local Krea 2 text-to-image, framed independently for the QLOBE toy-table hub | `../../assets/hub/tiles/silly-sentence-builder.jpg` | Seed 42, exact prompt, hashes and accepted review in `assets/source/local-api/hub/recipe.json` |
| Teacher narration | Approved platform synthetic teacher reference → local Qwen3 TTS voice clone → loudness-normalized AAC → local Whisper transcript QA | `assets/audio/*.m4a`, `manifest.json` | All 40 lines passed at seed 7 with normalized transcript ratio 1.0; durations 0.798–3.9s and mean volume -22.2–-17.8dB. Per-line receipts are in `assets/audio/qa.json`; non-secret recipe and raw accepted generations under `assets/source/voice/` |
| Music and feedback | Existing recorded QLOBE shared audio | `shared/assets/music/whimsical-toy-workshop.mp3` and shared SFX | Declared in `game.json`; audio begins only after the first user gesture |
| Social preview | Deterministic platform splash-screen capture | `assets/og-image.jpg` | Generated from the game itself with `tools/pipeline/capture_og_images.mjs` |

## Source trail

```text
assets/source/gpt-image-2/
  recipe-index.json               complete prompt, checksum and acceptance set
  *-master.png                    seven accepted coordinated masters

assets/source/cuts/
  <family>/*.png                  exact asset-cutter outputs
  <family>/boxes.json             detected source bounds and count evidence

assets/source/local-api/hub/
  *.png / recipe.json             accepted Krea 2 source and non-secret recipe

assets/source/voice/
  recipe.json                     engine, reference checksum and QA method
  raw/*.flac                      accepted Qwen voice-clone sources
  transcripts/*.json              accepted Whisper comparisons

assets/source/qa/
  alpha-report.json               meaningful alpha ratios for every runtime cutout
  *-contact-magenta.jpg           decoded runtime-family contact review
  *-magenta.png                   individual halo/debris inspection plates
```

## Production decisions

- GPT Image 2 established one coordinated material, light, palette and camera
  system. Family sheets were preferred over independent generations to prevent
  character and felt-material drift.
- The repository asset-cutting tool was run in dry-run and production modes
  with strict expected counts: six characters, six actions, six places, six
  manners and twelve UI pieces. The tool's own seven-test suite passed before
  cutting.
- The cut masters already provided clean, contiguous true-alpha objects. Qwen
  Image Layered was therefore not used on the accepted finals: adding another
  segmentation stage would have increased edge and identity risk without
  improving the inspected cuts.
- Runtime WebP files are decoded again before the saturated-magenta QA plates
  are built, so the review includes compression behavior rather than examining
  source PNGs only.
- Krea 2 was intentionally used for the hub tile, where an independently
  composed toy-table silhouette reads better than shrinking the gameplay UI.
- MiniMax H3 video was evaluated and omitted. A fixed rendered clip could not
  truthfully represent the 216 three-part or 1,296 four-part sentence outcomes;
  the runtime instead combines and animates the exact selected raster assets.
- Qwen Image Edit was reserved for bounded repair, but every accepted master
  passed identity, spelling and layout review without a repair that would add
  value.
- The generated title is decorative only. Every instruction, choice label and
  assembled sentence remains accessible live text.

## Reproduction

From the repository root:

```sh
python tools/test_cut_asset_sheet.py
python games/silly-sentence-builder/tools/build-media.py
QLOBE_QWEN_URL=<configured-LAN-endpoint> \
  python games/silly-sentence-builder/tools/build-media.py --hub --seed 42
QLOBE_QWEN_URL=<configured-LAN-endpoint> \
  python games/silly-sentence-builder/tools/generate-voice.py --workers 3
python games/silly-sentence-builder/tools/generate-voice.py --check
node tools/pipeline/capture_og_images.mjs \
  --base http://127.0.0.1:8000 --only silly-sentence-builder --force
```

The LAN endpoint, local job IDs and host paths are not committed. Only
regeneration parameters, accepted seeds, source/final hashes and the approved
teacher-reference checksum remain in the production record.

## Acceptance gates

- All 24 story-piece assets and twelve blank UI surfaces remain recognizable at
  card size and use one felt world.
- Every cutout has meaningful transparency and no rectangle, halo or debris on
  saturated magenta.
- The title is spelled exactly once; no generated functional text appears.
- The hub art contains no pseudo-lettering and remains legible at 320px wide.
- Every shipped voice line matches its intended text through Whisper and passes
  duration, volume and checksum checks.
- Landscape, portrait, short-viewport and reduced-motion browser captures pass
  before promotion beyond beta; a real child iPad playtest remains the final
  graduation gate.

Art was produced for QLOBE Kids with OpenAI GPT Image 2 and the explicitly
approved local Krea/Qwen services. Repository asset license: CC BY 4.0, as
declared in `game.json`.
