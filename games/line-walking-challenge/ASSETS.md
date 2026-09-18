# Line Walking Challenge asset provenance

All child-facing game art is committed raster media. The game performs no model
or asset-service calls at runtime. The live canvas renders only the responsive
trace glow and earned-progress feedback; it does not substitute for authored
characters, scenery, rewards, or controls.

## Production inventory

| Runtime asset | Source master | Production treatment |
|---|---|---|
| `assets/art/select-backdrop.webp` | `assets/source/gpt-image-2/select-backdrop-master.png` | opaque 4:3 cover crop |
| `assets/art/{forest,river,rainbow}-stage.webp` | matching GPT Image 2 landscape master | opaque 4:3 cover crop |
| `assets/art/{forest,river,rainbow}-stage-portrait.webp` | matching GPT Image 2 edit/outpaint master | opaque 2:3 portrait plate |
| `assets/art/complete-stage.webp` | `complete-stage-master.png` | opaque 4:3 cover crop |
| `assets/art/title-lockup.webp` | `title-lockup-master.png` | alpha trim, resize, WebP |
| `assets/art/fox-*.webp` | `fox-poses-sheet-master.png` | cutter extraction, normalized 520×640 alpha canvases |
| `assets/art/action-button.webp` | `ui-sheet-master.png` | cutter extraction, alpha trim |
| `assets/art/flower-{bud,bloom}.webp` | `ui-sheet-master.png` | cutter extraction, alpha trim |
| `assets/art/{finish-flag,badge}.webp` | `ui-sheet-master.png` | cutter extraction, alpha trim |
| `assets/hub/tiles/line-walking-challenge.jpg` | GPT Image 2 `hub-tile-master.png` fallback | opaque 640×533 JPEG |
| `assets/og-image.jpg` | generated browser capture of this game | 1200×630 JPEG; regenerate, do not hand-edit |

The complete prompt ledger and tool mode are recorded in
`assets/source/gpt-image-2/PROMPTS.md`. All GPT Image 2 source masters are kept
beside that ledger. No stock, downloaded, or search-sourced art is used.

## Required sheet-cutting pass

The repository cutter was used for both transparent sheets. Detection was
validated against an exact expected count before final files were written.

```powershell
python tools/cut-asset-sheet.py games/line-walking-challenge/assets/source/gpt-image-2/fox-poses-sheet-master.png games/line-walking-challenge/assets/source/cuts/fox --names ready left-step right-step pause bloom celebrate --expected-count 6 --alpha-threshold 160 --close-radius 4 --min-area 10000 --order reading --debug-mask games/line-walking-challenge/assets/source/qa/fox-alpha-mask.png

python tools/cut-asset-sheet.py games/line-walking-challenge/assets/source/gpt-image-2/ui-sheet-master.png games/line-walking-challenge/assets/source/cuts/ui --names action-button flower-bud flower-bloom finish-flag badge --expected-count 5 --alpha-threshold 160 --close-radius 4 --min-area 4000 --order reading --debug-mask games/line-walking-challenge/assets/source/qa/ui-alpha-mask.png
```

The machine-readable crops and source hashes are in each `boxes.json`. Every
transparent runtime output also has a saturated-magenta QA composite under
`assets/source/qa/` for fringe inspection.

## Deterministic rebuild

```powershell
python games/line-walking-challenge/tools/build-assets.py
```

The builder cover-crops opaque plates, trims/normalizes alpha assets, writes QA
composites, selects the valid hub source, and validates output dimensions,
alpha safety corners, normalized fox canvases, and the opaque 640×533 hub tile.

## Studio / LAN API production record

The approved local Studio resources were exercised before fallback decisions:

- Krea 2 `menu-game-tile` generation was attempted through Studio and by the
  resumable direct helper at seeds 42 and 1337. The upstream result endpoint
  failed, so no partial Krea output was shipped.
- Qwen 3 TTS voice clone was attempted with the shared teacher reference and a
  `[7, 8, 9]` seed ladder. Studio returned HTTP 500 and the direct batch
  produced no valid audio container, so Whisper had no safe candidate to
  transcribe. No unverified clip was admitted to the manifest.
- `voice-clips.js` therefore uses its offline device-speech fallback with the
  exact committed `assets/audio/lines.json` script. The empty manifest is
  deliberate and gameplay never waits on voice generation.

IDs, error classes, and retry outcomes are recorded without private LAN
addresses in `assets/source/local-api/FAILED-JOBS.md`. The resumable helpers are
`tools/generate-hub-tile.py` and `tools/generate-voice.py`. Both refuse public
API endpoints; the voice helper uploads only the fixed, repository-approved
teacher reference under `shared/assets/refs/`.

## Shared audio

Background music uses the repository-owned shared track
`shared/assets/music/gentle-country-morning.mp3`; SFX come from the shared Web
Audio layer. This game does not duplicate shared audio files.

## License and attribution

Original game art and derived captures: QLOBE Kids / Kaigani, CC BY 4.0 as
declared in `game.json`. Code is MIT. GPT Image 2 was used as a production tool;
there is no external artist or stock attribution requirement.
