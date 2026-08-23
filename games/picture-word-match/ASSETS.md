# Reading Buddies asset provenance

Reading Buddies is an authored watercolor/storybook game. Its visible surfaces,
cards, books, controls, rewards, and subjects are raster artwork; CSS is limited
to layout, state, focus, and motion, while child-facing words and letters remain
real HTML text for legibility and accessibility.

The complete production prompt set is
[`assets/source/PROMPTS.md`](assets/source/PROMPTS.md). Runtime dimensions and
SHA-256 checksums are recorded in
[`assets/source/asset-manifest.json`](assets/source/asset-manifest.json).

## Production artwork

| Runtime family | Retained source | Authoring workflow | Finalization and QA |
|---|---|---|---|
| `assets/art/reading-garden.webp` | `assets/source/gpt-image-2/reading-garden-master.png` | Built-in GPT Image 2-class generation, directed from the supplied Reading Buddies concept mockups | Opaque 4:3 master fitted to 1600×1200 WebP; calm center/top bands preserved for gameplay |
| `assets/ui/reading-buddies-title.webp` | `assets/source/gpt-image-2/title-master.png` → `assets/source/layered/title.png` | Built-in GPT Image 2-class exact-title generation → local Qwen Image Layered | Accepted `layer_2`, alpha-reviewed, trimmed and fitted to 1120×360 |
| `assets/words/{cat,dog,pig,hen,fox,bug}.webp` | `assets/source/gpt-image-2/words-animals-master.png` → `assets/source/layered/words-animals.png` | Built-in GPT Image 2-class 3×2 subject sheet → local Qwen Image Layered | Accepted `layer_2`; six single-subject alpha islands, alpha QA, 360×300 transparent WebP |
| `assets/words/{bun,jam,ham,fig,yam,nut}.webp` | `assets/source/local-api/words-food-qwen-edit.png` → `assets/source/layered/words-food.png` | Local Qwen Image Edit from the accepted animal style sheet → local Qwen Image Layered | Same six-cell review/finalization contract |
| `assets/words/{bus,hat,box,cup,jet,van}.webp` | `assets/source/local-api/words-things-qwen-edit.png` → `assets/source/layered/words-things.png` | Local Qwen Image Edit from the accepted animal style sheet → local Qwen Image Layered | Same six-cell review/finalization contract |
| `assets/categories/*.webp`, `assets/modes/*.webp` | `assets/source/gpt-image-2/emblems-master.png` → `assets/source/layered/emblems.png` | Built-in GPT Image 2-class 3×2 emblem family → local Qwen Image Layered | Six wordless emblems, alpha-reviewed and fitted to 320×260 |
| Painted frames, ribbons, letter seeds, and check in `assets/ui/` | `assets/source/gpt-image-2/carriers-master.png` → `assets/source/layered/carriers.png` | Built-in GPT Image 2-class UI carrier sheet → local Qwen Image Layered | Authored crop bands isolate each blank carrier; transparent runtime WebP |
| Books, trail, celebration ribbon, and reward stamps in `assets/ui/` | `assets/source/gpt-image-2/book-rewards-master.png` → `assets/source/layered/book-rewards.png` | Built-in GPT Image 2-class storybook UI sheet → local Qwen Image Layered | Transparent alpha-reviewed crops; single-piece stamps use largest-island cleanup |
| Home/back/sound controls, action carriers, and letter slot in `assets/ui/` | `assets/source/gpt-image-2/controls-master.png` → `assets/source/layered/controls.png` | Built-in GPT Image 2-class control sheet → local Qwen Image Layered | Transparent alpha-reviewed crops; labels are HTML rather than baked text |

All eight Qwen Image Layered passes used seed 42 and explicitly fetched
`output=layer_2`. Qwen returned a faint 1–4/255 full-sheet alpha film, so the
deterministic finalizer uses an evidence-based alpha floor of 8 before bounding.
It does not infer a matte from local color. Single-piece word subjects,
carriers, and stamps keep only their largest connected alpha island so a
neighboring extraction sliver cannot ship. Fully transparent pixels have their
unused RGB cleared for compatibility with imperfect thumbnailers. Contact
sheets over saturated magenta are retained in `assets/source/qa/` for edge, spill, and crop
review. Rebuild and check with:

```sh
python3 tools/finalize-assets.py
```

`tools/finalize-assets.py` uses explicit authored crop bands rather than assuming
that a generative contact sheet landed on mathematically equal rows. It performs
contain-fit (up or down), emits runtime WebP files, writes hashes/dimensions, and
fails on missing or invalid alpha sources.

These generated QLOBE Kids project assets are licensed CC BY 4.0; no child-facing
attribution is required.

## Hub tile

| Asset | Source and recipe | Workflow | Curation |
|---|---|---|---|
| `../../assets/hub/tiles/picture-word-match.jpg` | `assets/source/local-api/hub-krea-seed9001.png` and adjacent `.recipe.json` | QLOBE Studio `menu-game-tile` / `toy-table`, local Krea 2 Turbo text-to-image, 768×640, seed 9001 | Seed 42 was rejected for unwanted literal letters; seed 1337 was rejected as sterile; seed 9001 was accepted for its cozy cat-card/open-book reading moment and blank painted ribbons, then fitted to 640×533 JPEG |

The hub tile is intentionally a distinct toy-table object scene, not a crop of
the in-game splash and not a title-bearing app screenshot.

## Recorded teacher voice

`assets/audio/lines.json` contains the exact 39 authored lines. The reproducible
pipeline is `tools/generate-voice.py`:

- local `qwen3-tts-voiceclone` with seed 7;
- the rights-cleared, synthetic platform teacher reference at
  `shared/assets/refs/voice-teacher.wav` (authoring input only, not duplicated);
- AAC/M4A delivery with `+faststart`;
- local Whisper comparison plus duration, volume, text-hash, checksum, and
  reference-hash evidence in `assets/audio/qa.json`;
- runtime lookup in `assets/audio/manifest.json`, with the exact text retained as
  the device-speech recovery fallback.

All 39 clips passed at seed 7 with normalized Whisper ratio 1.000. Durations are
0.878–5.900 s; mean volume is −20.3 to −18.3 dB. The platform teacher reference
and generated game dialogue are QLOBE Kids project assets, CC BY 4.0.

Regenerate or audit with:

```sh
python3 tools/generate-voice.py --workers 2 \
  --voice-ref ../../shared/assets/refs/voice-teacher.wav
python3 tools/generate-voice.py --check
```

No model or network endpoint is used at runtime.

## Shared runtime resources

| Resource | Source / license | Use |
|---|---|---|
| Fredoka SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | Fredoka by Milena Brandão and Hafontia, via Fontsource 5.0.13; SIL OFL 1.1 | Functional HTML words, letters, prompts, and labels; reused unmodified |
| `shared/assets/music/gentle-country-morning.mp3` | Shared QLOBE Kids recorded music asset | Gesture-started garden music, looped and ducked under narration through `shared/js/bgm.js` |
| Shared word/letter audio through `shared/js/content.js` | Shared QLOBE Kids audio library | Whole-word replay and letter-sound reinforcement where available |
| `shared/js/sfx.js` and `shared/js/celebrate.js` | QLOBE Kids platform code | WebAudio interaction feedback and DOM celebration; no downloaded sound effects |

## Link preview (`og:image`)

`assets/og-image.jpg` is a 1200×630 screenshot of the finished chapter-library
screen, captured at JPEG quality 82 by
`tools/pipeline/capture_og_images.mjs --only picture-word-match --force`. It was
not generated from the retired prototype and should be regenerated with that
tool rather than hand-edited.
