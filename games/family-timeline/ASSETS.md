# Family Timeline assets

Family Timeline ships only committed local media. GPT Image 2, Krea, Qwen
Layered, Qwen3 TTS, and Whisper were authoring-time tools; the production game
makes no request to a model service. Original game art and generated narration
are released with this game under CC BY 4.0 unless a row notes otherwise.

## Production art

| Runtime asset | Source / production path | Creator | License | Modifications and QA |
|---|---|---|---|---|
| `assets/art/backgrounds/album-environment.webp` | `assets/source/gpt-image-2/album-environment-master.png` | OpenAI GPT Image 2, directed by QLOBE Kids | CC BY 4.0 | 1448×1086 RGB master encoded to WebP quality 86; visually checked at full size |
| `assets/art/title/title-lockup.webp` | `title-lockup-charcoal.png` → `assets/source/crops/title/` | OpenAI GPT Image 2, directed by QLOBE Kids | CC BY 4.0 | Mandatory connected-component cut; near-opaque alpha normalized; deterministic cutout finalizer; magenta QA; alpha WebP quality 90 |
| `assets/art/ui/*.webp` | `timeline-ui-sheet.png` and `story-controls-sheet.png` → their named crop folders | OpenAI GPT Image 2, directed by QLOBE Kids | CC BY 4.0 | Mandatory exact-count cuts (8 and 7 objects), normalized alpha, cutout finalizer, magenta QA, alpha WebP quality 90 |
| `assets/art/story-cards/*.webp` | First three accepted cells of `family-story-ui-sheet.png` | OpenAI GPT Image 2, directed by QLOBE Kids | CC BY 4.0 | Exact named crops, finalizer and magenta QA; lower-row controls from this sheet were rejected and replaced |
| `assets/art/stamps/*.webp` | `story-controls-sheet.png` | OpenAI GPT Image 2, directed by QLOBE Kids | CC BY 4.0 | Exact named crops, finalizer and magenta QA, alpha WebP quality 90 |
| `assets/art/memories/{baby,toddler,now}.webp` | `nia-memory-cards-sheet.png`, referencing `shared/characters/nia/portrait.png` and the approved concept mockup | OpenAI GPT Image 2 plus local Qwen Layered | CC BY 4.0 | Sheet cut into three named cards. Toddler uses the accepted Qwen `layer_2` seed-42 whole-card extraction. Baby and Now use connected-edge dark-ground removal after Qwen isolated internal objects; this preserves their full authored cards. Every final was inspected on magenta and encoded as alpha WebP quality 90 |
| `assets/art/map/world-paper-map.webp` | Copied from `games/globe-spin-stories/assets/map/world-paper-map.webp` | Natural Earth geography; QLOBE Kids paper treatment | Natural Earth public domain / treatment CC BY 4.0 | Reused proven equirectangular raster without modification |
| `../../assets/hub/tiles/family-timeline.jpg` | Local `krea2-turbo-t2i`, `assets/source/local-api/krea/hub-seed42.png` | Krea 2, directed by QLOBE Kids | CC BY 4.0 | Seed 42; center-fit to 640×533 JPEG quality 90; recipe retained beside source; manually accepted after full-size review |
| `assets/og-image.jpg` | Production screenshot of this game's own splash | QLOBE Kids | CC BY 4.0 | 1200×630 JPEG regenerated after final browser visual QA |

The exact six GPT Image 2 prompts, reference list, acceptance state, and source
filenames are recorded in
`assets/source/gpt-image-2/prompts.json`. Generation used the built-in Codex
GPT Image 2 workflow because no direct API key was available in the authoring
session.

## Cutter and alpha evidence

The mandatory sheet cutter was `tools/cut-asset-sheet.py`. Named outputs and
component geometry are retained under:

- `assets/source/crops/nia-memory-cards/` — 3 cells;
- `assets/source/crops/timeline-ui/` — 8 cells;
- `assets/source/crops/family-story-ui/` — only the first 3 card cells ship;
- `assets/source/crops/story-controls/` — 7 corrected controls;
- `assets/source/crops/title/` — 1 lockup.

Each folder contains `boxes.json`. The detection masks are in
`assets/source/qa/*-mask.png`. Shipping cutouts also passed
`tools/pipeline/cutout_finalize.py`; statistics are in
`assets/source/qa/production-ledger.json` and magenta composites are in
`assets/source/qa/alpha/`. Qwen candidates and the accepted/rejected geometry
decisions are recorded in `assets/source/qa/layered-ledger.json`.

Rebuild commands, run from the repository root:

```text
python games/family-timeline/tools/produce-art.py finalize --force
python games/family-timeline/tools/produce-art.py extract --force
python games/family-timeline/tools/produce-art.py hub --force --seed 42
```

The driver reads the LAN endpoint only from an environment override or the
git-ignored local settings file. It never writes a host or credential into
provenance.

The share preview is a browser capture of the final splash, not separately
generated artwork:

```text
node tools/pipeline/capture_og_images.mjs --channel chrome --base http://127.0.0.1:4173 --only family-timeline --force --settle 1200 --layout-scale 1.5 --concurrency 1
```

## Voice and music

| Asset | Source / workflow | License | QA |
|---|---|---|---|
| `assets/audio/voice/*.mp3` (27 clips) | Local `qwen3-tts-voiceclone`, seeds 7/8/9 retry ladder | CC BY 4.0 | Every accepted clip matches `assets/audio/lines.json`, passed Whisper `base` English transcription, duration, and loudness gates in `assets/audio/voice/qa-report.json` |
| Voice reference | Existing approved teacher clip at `games/family-story-interview/assets/audio/welcome.m4a` | Existing QLOBE Kids CC BY 4.0 asset | Used only as an authoring input; not copied into this game and no personal reference path is retained |
| `../../shared/assets/music/gentle-country-morning.mp3` | Shared QLOBE Kids music library | See shared asset ledger | Reused in place; quiet loop with fades and narration ducking through `bgm.js` |
| SFX | `shared/js/sfx.js` Web Audio cues | MIT code | Generated locally at runtime; no audio file |

`assets/audio/manifest.json` contains clip paths, measured durations, and text
hashes. Web Speech remains the offline browser fallback if a clip cannot play.
Rebuild and verify with:

```text
python games/family-timeline/tools/produce-voice.py --force
python games/family-timeline/tools/produce-voice.py --check
```

## Rejected source material

- The lower controls in `family-story-ui-sheet.png` shared connected shadows
  and did not cut cleanly. Only its three story cards ship; the corrected
  `story-controls-sheet.png` supplies every control and stamp.
- Baby Qwen seed 42 separated the sun rather than the card; seeds 1337 and 9001
  were empty. Now seed 42 separated the child rather than the complete card.
  Their source and magenta evidence remain for audit but are not referenced by
  runtime configuration.
- No generated text inside a functional control was accepted. All readable
  instructions and labels are runtime HTML plus recorded speech.

## Optional family photo

No photo ships with the game. A grown-up may choose one at runtime; it is
downscaled and re-encoded locally, stored only as an IndexedDB Blob (or
session-memory fallback), never sent to a service, and removable from the book.
