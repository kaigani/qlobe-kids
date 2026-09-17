# Asset production log — Snack Addition Stories

All shipped art and dialogue are local files. The game makes no model or
network API call at runtime.

## Original visual art

The primary art world was authored on 2026-09-17 with the built-in
`gpt-image-2` image tool, using the concept mockups only as visual references.
The accepted source masters are retained in `assets/source/gpt-image-2/`:

| Master | Shipped derivatives | Notes |
|---|---|---|
| `picnic-backdrop-master.png` | `assets/backdrop.webp` | Full-bleed 4:3 picnic world with a quiet central play field |
| `snack-cast-sheet.png` | `assets/foods/*.webp` | Eight consistent, count-readable snack characters |
| `ui-kit-sheet.png` | `assets/ui/*.webp` | Nine blank tactile UI surfaces |
| `title-lockup.png` | `assets/title.webp` | Reviewed for exact title spelling before acceptance |
| `sun-poses-sheet.png` | `assets/characters/*.webp` | Idle/help and celebration poses |

The exact accepted prompts are recorded in `assets/source/PROMPTS.md`. Source
and derivative SHA-256 values, dimensions, alpha extrema, and encode settings
are recorded in `assets/source/art-manifest.json`.

### Deterministic cutting and encoding

The repository asset cutter was used for every sprite sheet. Each invocation
was required to produce the expected count or fail:

```powershell
python tools/cut-asset-sheet.py games/snack-addition-stories/assets/source/gpt-image-2/snack-cast-sheet.png games/snack-addition-stories/assets/source/crops/foods --names blackberry raspberry strawberry blueberry orange watermelon cracker sandwich-cracker --expected-count 8 --padding 18 --debug-mask games/snack-addition-stories/assets/source/qa/foods-mask.png
python tools/cut-asset-sheet.py games/snack-addition-stories/assets/source/gpt-image-2/ui-kit-sheet.png games/snack-addition-stories/assets/source/crops/ui --names tray prompt-plaque equation-plaque story-card answer-pink answer-lavender answer-mint action-button celebration-banner --expected-count 9 --padding 18 --debug-mask games/snack-addition-stories/assets/source/qa/ui-mask.png
python tools/cut-asset-sheet.py games/snack-addition-stories/assets/source/gpt-image-2/sun-poses-sheet.png games/snack-addition-stories/assets/source/crops/mascot --names sun-idle sun-cheer --expected-count 2 --min-area 50000 --padding 18 --debug-mask games/snack-addition-stories/assets/source/qa/mascot-mask.png
python games/snack-addition-stories/tools/process-assets.py
```

The cutter receipts are the three `assets/source/crops/*/boxes.json` files.
`process-assets.py` derives the runtime WebP files from those accepted crops,
uses their component masks to remove neighboring-sheet fragments, and writes
magenta alpha-edge QA plates plus the runtime contact sheet in
`assets/source/qa/`.

## Local API supplements

- The discovery tile was created with the local Krea 2 text-to-image workflow.
  Its exact prompt, seed, dimensions, parameters, and acceptance notes are in
  `assets/source/krea2/hub-tile-recipe.json`; the accepted render is retained
  beside it and shipped as `assets/hub/tiles/snack-addition-stories.jpg`.
- Qwen Image Layered was deliberately evaluated on the blackberry cutout. Its
  required top layer had an alpha maximum of only 3/255, so it was rejected in
  favor of the more faithful cutter silhouette. The retained output and QA
  decision are in `assets/source/layered/`.

## Dialogue and audio

The 60 authored English lines in `config.json` are the source of truth. They
were generated through the approved local Qwen voice-clone workflow using the
project's teacher reference recording, encoded as AAC/M4A for real-device
browser playback, and independently transcribed through local Whisper.

```powershell
python games/snack-addition-stories/tools/generate-voice.py --api-url <local-api> --voice shared/assets/refs/voice-teacher.wav --workers 3
```

`assets/audio/lines.json`, `manifest.json`, and `qa.json` preserve the authored
text, shipped-file metadata, transcript, similarity score, selected seed, and
pass/fail status. The release set is 60/60 Whisper-approved clips with no
missing manifest entries. Raw intermediate FLAC files are reproducible authoring
artifacts and are intentionally excluded from release. If a recorded clip is
unavailable, the shared narrator provides an offline device-voice fallback.

Background music reuses
`shared/assets/music/mug-and-sunbeam.mp3`. Tap, placement, retry, and success
sounds use the shared WebAudio sound-effects module. The Fredoka UI typeface is
the locally hosted `shared/fonts/fredoka-latin-600-normal.woff2` under the SIL
Open Font License 1.1.

## License and preview

Original project art and audio derivatives are released under CC BY 4.0 as
declared by `game.json`; code is MIT. `assets/og-image.jpg` is a 1200×630
capture of the shipped game and should be regenerated with the repository
preview-capture tooling after visual changes, not hand-edited.
