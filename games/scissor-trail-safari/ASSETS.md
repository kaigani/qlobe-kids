# Scissor Trail Safari assets

The shipped art is an original raster Papercraft set created for this game. Primary
visible objects are images; CSS and vector shapes are not used as substitute artwork.
The source generations, exact prompts, cut masks, crops, QA composites, and processing
receipt are retained under `assets/source/`.

## Runtime art

| Runtime asset | Source | Production |
|---|---|---|
| `assets/world/papercraft-jungle.webp` | `assets/source/gpt-image-2/jungle-background.png` | GPT Image 2; 4:3 cover crop and WebP encode |
| `assets/art/title-lockup.webp` | `assets/source/gpt-image-2/title-lockup-source.png` | GPT Image 2; OpenCV GrabCut, connected-component cleanup, shared cutout finalizer |
| `assets/art/success-tableau.webp` | `assets/source/gpt-image-2/success-tableau-source.png` | GPT Image 2; alpha cleanup and shared cutout finalizer |
| `assets/art/playfield-frame.webp` | `assets/source/gpt-image-2/playfield-frame-source.png` | GPT Image 2; alpha cleanup and shared cutout finalizer |
| `assets/art/card-{straight,curvy,spiral}.webp` | exact-count UI sheet | GPT Image 2; exact-count cutter; magenta matte/despill; shared cutout finalizer |
| `assets/art/{scissor-medallion,star-medallion,button-plaque}.webp` | exact-count UI sheet | same pipeline as the cards |
| `assets/animals/{lion,zebra,giraffe,elephant}.webp` | exact-count animal sheet A | GPT Image 2; exact-count cutter; alpha cleanup; shared cutout finalizer |
| `assets/animals/{parrot,snake,monkey,tiger}.webp` | exact-count animal sheet B | same pipeline as animal sheet A |
| `../../assets/hub/tiles/scissor-trail-safari.jpg` | `assets/source/gpt-image-2/hub-tile-source.png` | GPT Image 2; authored 6:5 crop; JPEG encode |

The exact prompts and generation notes are in
[`assets/source/PROMPTS.md`](assets/source/PROMPTS.md). The machine-readable hashes,
alpha statistics, final dimensions, and output sizes are in
[`assets/source/processing.json`](assets/source/processing.json).

## Exact-count cutting and finalization

The required cutter was used before any runtime asset was accepted:

```text
python tools/cut-asset-sheet.py .../animals-a.png --names lion zebra giraffe elephant --expected-count 4
python tools/cut-asset-sheet.py .../animals-b.png --names parrot snake monkey tiger --expected-count 4
python tools/cut-asset-sheet.py .../ui-kit.png --names card-straight card-curvy card-spiral scissor-medallion star-medallion button-plaque --expected-count 6
```

All three sheets passed their exact-count contract. `tools/process-assets.py` performs
the deterministic alpha cleanup, magenta despill and warm-shadow repair, title extraction, calls
`tools/pipeline/cutout_finalize.py`, and creates the runtime WebP/JPEG files. Re-run it
from the repository root to reproduce the final assets.

## Local generation services

The approved LAN resources were exercised during production:

- Krea 2 `menu-game-tile` was submitted through QLOBE Studio (job
  `e8c2868fd431`). The worker failed before inference because its internal ComfyUI
  release callback returned HTTP 404. The reviewed GPT Image 2 hub tile is shipped.
- Qwen Image Layered was submitted to separate the title. Its internal upload callback
  returned HTTP 404, so the reviewed GPT Image 2 source was separated locally with a
  deterministic matte and the shared finalizer.
- Qwen 3 TTS voice clone was probed with the approved shared teacher reference and seed
  ladder 7 → 8 → 9. The reachable LAN gateway returned HTTP 500 because its internal
  `/upload/image` callback returned HTTP 404. No failed or unverified audio is shipped.
  `assets/audio/manifest.json` therefore remains intentionally empty and the shared
  `voice-clips.js` channel falls back to the exact lines in `assets/audio/lines.json`
  through `speech.js`. The resumable `tools/generate-voice.py` remains ready for a
  later backend repair and includes Whisper transcript QA.

## Audio

| Asset | Source | Role |
|---|---|---|
| `../../shared/assets/music/quirky-forest-adventure.mp3` | shared QLOBE music library | looping recorded jungle bed, faded and ducked beneath speech by `bgm.js` |
| `assets/audio/lines.json` | game script | exact narration and fallback dialogue |
| `assets/audio/manifest.json` | intentionally empty | makes the recorded-clip fallback state explicit |
| `shared/js/sfx.js` `snip()` | procedural Web Audio | soft blade click plus filtered paper hush at passed checkpoints |

## Licensing and attribution

- Code: MIT.
- Original generated art and project-authored copy: CC BY 4.0, QLOBE Kids.
- Shared QLOBE music and teacher reference: project library terms; the teacher reference
  is generation input only and is not copied into this game.
- OpenAI GPT Image 2 was used as the image-generation model. No third-party stock or
  copyrighted character reference was used.

## Link preview

`assets/og-image.jpg` is a 1200×630 crop of the real production splash, generated after
browser visual QA. Regenerate it with the repository capture pipeline rather than
editing the image by hand.
