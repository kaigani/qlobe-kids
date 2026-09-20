# TaleTeller asset record

TaleTeller ships original raster artwork and locally generated narration. No
third-party stock art, emoji, remote fonts, or runtime generation is used.
Functional labels remain accessible HTML; all child-facing illustration is
raster artwork.

## Final runtime assets

- `assets/art/`: splash plus Forest, Ocean, and Moon watercolor scenes.
- `assets/characters/`: Pip, Willa, and Nova transparent character art.
- `assets/vocab/`: twelve transparent visual-vocabulary tokens.
- `assets/choices/`: twelve illustrated branch cards.
- `assets/ui/`: TaleTeller title and watercolor controls.
- `assets/audio/`: voice-cloned narration, source lines, manifest, and Whisper
  QA report.
- `assets/og-image.jpg`: 1200x630 link preview captured from the actual game.
- `../../assets/hub/tiles/picture-narration.jpg`: 640x533 platform hub tile.

`assets/source/build-report.json` records dimensions, byte sizes, SHA-256
hashes, and the selected extraction method for every derived visual. The
hostile-background contact sheet at
`assets/source/qa/final-alpha-magenta.jpg` is the final alpha-edge check.

## GPT Image 2 production art

The accepted masters in `assets/source/gpt-image-2/` were generated with the
built-in image generation tool in GPT Image 2 mode. The concept mockup
`01-game-concepts/picture-narration-tale-teller/output/ui-mockups/01-story-world.png`
was supplied as a style reference. It established the handmade watercolor,
ink-outline, warm paper, and rounded preschool proportions; it was not copied
into the game.

| Master | Purpose |
|---|---|
| `splash-master.png` | Open storybook portal joining forest, ocean, and moon worlds |
| `forest-master.png` | Forest exploration scene with stream, bridge, flowers, and path |
| `ocean-master.png` | Underwater reef exploration scene |
| `moon-master.png` | Friendly moon landscape with crater, rover, crystal, and stars |
| `title-master.png` | Exact transparent `TaleTeller` watercolor wordmark |
| `ui-sheet.png` | Watercolor navigation, sound, microphone, replay, story, star, and ribbon pieces |
| `characters-vocab-sheet.png` | Three heroes and twelve vocabulary illustrations |
| `choices-sheet.png` | Twelve square illustrated story-choice cards |

The production prompt record is retained in
`assets/source/gpt-image-2/PROMPTS.md`.

## Cutting and layered extraction

Every sheet was first processed with the repository asset cutter. Exact
component names and bounds are retained in `assets/source/cuts/*/boxes.json`,
with cutter masks in `assets/source/qa/`. The shared cutter produced one title,
twelve UI components, twelve character/vocabulary components, and twelve
choice cards.

Qwen Image Layered was then run on the UI, character/vocabulary, and choice
sheets. The original responses and `layer_2` images are retained under
`assets/source/qwen-layered/`; their re-cut outputs are under
`assets/source/cuts-layered/`.

- Nine UI pieces and the flower/coral tokens passed comparison and are used.
- The character sheet separation dropped ten items, so those missing pieces
  use deterministic border-connected charcoal-matte removal after cutting.
- The choice separation retained all cards but added faint gutter fragments.
  Visual QC rejected it in favor of the cleaner cutter-derived mattes.

This mixed selection is intentional and is recorded per asset in
`assets/source/build-report.json`. Run `python
games/picture-narration/tools/build-assets.py` from the repository root to
rebuild the optimized WebP set and alpha contact sheet.

## Krea 2 hub tile

The hub image was generated through the QLOBE Studio `menu-game-tile`
template with the `toy-table` style, Krea 2 Turbo text-to-image, seed 42, and a
768x640 source. The prompt requested an open storybook with a friendly fox,
blue whale, moon bunny, butterfly, flower, and glowing story star, with no
text. The accepted source and complete Studio recipe are retained at:

- `assets/source/local-api/krea/hub-tile-seed42.png`
- `assets/source/local-api/krea/hub-tile-seed42.recipe.json`

The source was center-cropped and encoded as the platform's 640x533 JPEG.

## Voice and transcription QA

Narration is produced locally with Qwen TTS voice clone using the existing
QLOBE teacher reference `shared/assets/refs/voice-teacher.wav`. Seeds 7, 8,
and 9 are available to the generator; each accepted clip is normalized to AAC
and checked locally with Whisper transcription. `assets/audio/qa.json` records
transcripts, similarity scores, durations, chosen seeds, and failures;
`assets/audio/manifest.json` records the runtime clip map and hashes.
The shipped build contains 42 of 42 requested clips with zero invalid results;
the lowest Whisper text match is 0.962 and the longest clip is 6.1 seconds.

Run:

```text
python games/picture-narration/tools/generate-voice.py --api-url <approved-local-api> --voice-ref shared/assets/refs/voice-teacher.wav --workers 3
```

The browser uses these clips first and falls back to Web Speech if a clip
cannot play. A child's optional retelling is held only as an in-memory object
URL for immediate replay. It is never uploaded or persisted and is revoked on
leaving the story.

## Provenance and license

| Asset group | Creator / source | License | Attribution required | Modifications |
|---|---|---|---|---|
| GPT Image 2 masters and derivatives | QLOBE Kids, generated for this game with OpenAI GPT Image 2 | CC BY 4.0 | QLOBE Kids | Crop, alpha extraction, resize, WebP encoding |
| Qwen layered derivatives | QLOBE Kids local approved API | CC BY 4.0 | QLOBE Kids | Layer selection, cutting, resize, WebP encoding |
| Krea 2 hub tile | QLOBE Kids local approved API | CC BY 4.0 | QLOBE Kids | Center crop, resize, JPEG encoding |
| Qwen TTS narration | QLOBE Kids local approved API using QLOBE teacher reference | CC BY 4.0 | QLOBE Kids | Loudness normalization, AAC encoding, Whisper QA |
| `assets/og-image.jpg` | Screenshot of this game's own splash screen | CC BY 4.0 | QLOBE Kids | Generated by `tools/pipeline/capture_og_images.mjs` |
