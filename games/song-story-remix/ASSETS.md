# Song Story Remix — Asset Log

Song Story Remix uses original raster artwork and locally produced narration. No runtime asset generation, child-media upload, or remote model request occurs in the shipped game.

## Runtime artwork

| Runtime asset | Production source | Tool / model | Notes |
|---|---|---|---|
| `assets/art/backgrounds/*.webp` | `assets/source/gpt-image-2/{select,remix,concert}-background.png` | GPT Image 2 | Three full-screen Kawaii theater plates; center-safe for responsive cropping. |
| `assets/art/ui/title.webp` | `assets/source/gpt-image-2/title-lockup.png` | GPT Image 2 | Transparent hand-painted title lockup. |
| `assets/art/cards/*.webp` | `assets/source/gpt-image-2/song-cards-sheet.png` | GPT Image 2 + shared asset cutter | Three open-storybook song cards. |
| `assets/art/tokens/*.webp` | `assets/source/gpt-image-2/story-tokens-sheet.png` | GPT Image 2 + shared asset cutter | Nine transparent story-swap pieces. |
| `assets/art/performers/*.webp` | `assets/source/gpt-image-2/performers-sheet.png` | GPT Image 2 + shared asset cutter | Leo and three animal bandleaders. |
| `assets/art/ui/{play,record,stop,replay,save,library}.webp` | `assets/source/gpt-image-2/controls-sheet.png` | GPT Image 2 + shared asset cutter | Large raster interaction props; labels remain live HTML for accessibility. |
| `assets/art/ui/camera-frame.webp` | `assets/source/gpt-image-2/camera-frame.png` | GPT Image 2 + shared asset cutter | Transparent plush star-stage camera frame. |
| `assets/og-image.jpg` | concert background + title lockup | Pillow production script | Deterministic 1200×630 social card. |
| `assets/hub/tiles/song-story-remix.jpg` | `assets/source/krea/hub-seed42.png` | Krea 2 via approved LAN API | Curated catalog tile, progressive JPEG. |

The exact art prompts and acceptance constraints are archived in `assets/source/gpt-image-2/PROMPTS.md`. `tools/process-assets.py` calls the shared `tools/cut-asset-sheet.py` cutter, retains source masks and boxes, writes alpha-trimmed WebP runtime files, and produces a magenta-background contact sheet plus a hash report under `assets/source/qa/`.

## Authoring study

`assets/source/local-api/layered/` contains the accepted Qwen Image Layered separation of the song-card sheet. Its three-component alpha layer is resized only as a mask and applied to the original full-resolution GPT Image 2 pixels; this removes the dark authoring sheet without substituting the lower-resolution Layered redraw. The shared cutter still owns exact card bounds and naming.

## Voice and audio

| Asset | Source | Tool / model | Quality gate |
|---|---|---|---|
| `assets/audio/*.m4a` (14 clips) | Approved existing QLOBE teacher voice reference | Qwen voice clone via approved LAN API | Every line was transcribed with Whisper; all 14 reached transcript similarity 1.0 and coverage 1.0. Mono AAC, 24 kHz, fast-start M4A, normalized around −20.5 to −18.2 dB mean volume. |
| Song arrangements | Game-local Web Audio synthesis | Browser Web Audio API | Deterministic 16-second melodies; no downloaded music or third-party recording. |
| Feedback sounds | `shared/js/sfx.js` | QLOBE shared runtime | Synthesized at runtime. |

The voice manifest, spoken text, and QA receipt are in `assets/audio/`. Sanitized generation recipes and accepted candidates are retained under `assets/source/local-api/voice/`; they contain no endpoint URL or absolute reference-clip path.

## Shared assets

| Asset | Source | License / attribution | Modification |
|---|---|---|---|
| `shared/fonts/fredoka-latin-600-normal.woff2` | Fontsource / Google Fonts; Fredoka by Milena Brandão and Hafontia | SIL Open Font License 1.1 | Reused unmodified. |
| Shared HUD controls and platform modules | QLOBE Kids repository | Project license | Reused unmodified. |

## Regeneration and checks

From the repository root:

```powershell
python games/song-story-remix/tools/process-assets.py
python games/song-story-remix/tools/produce-media.py --check
```

The first command is deterministic from committed accepted masters. The second performs offline integrity checks against the committed LAN-production receipts and outputs; a full authorized regeneration is available through the script's `hub`, `layered`, `voice`, and `all` subcommands.

## Rights and privacy

Original game code is MIT and original generated game assets are released with this project under CC BY 4.0. Child camera/microphone recordings are optional, stored only in the browser's local IndexedDB (maximum eight shows), never transcribed, and never uploaded.
