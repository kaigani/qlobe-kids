# Grace & Courtesy Theater — asset provenance

All runtime media is committed and works offline. The LAN workflows listed
below are production tools only; no browser request leaves the static QLOBE
site during play.

## Original visual production

| Runtime asset | Authored source | Production route | Processing |
|---|---|---|---|
| `assets/stage.webp` | `assets/source/gpt-image-2/felt-stage-source.png` | OpenAI image generation, with GPT Image 2 explicitly requested | 4:3 crop, resize, WebP |
| `assets/title.webp` | `assets/source/gpt-image-2/title-source.png` | OpenAI image generation, with GPT Image 2 explicitly requested | Exact-count cutter, transparent WebP |
| 12 puppet poses | `assets/source/gpt-image-2/characters-source.png` | OpenAI image generation, with GPT Image 2 explicitly requested | Qwen Image Layered foreground extraction, QLOBE cutter, trim, WebP |
| 8 props | `assets/source/gpt-image-2/props-source.png` | OpenAI image generation, with GPT Image 2 explicitly requested | Qwen Image Layered foreground extraction, QLOBE cutter, trim, WebP |
| 8 felt UI pieces | `assets/source/gpt-image-2/ui-kit-source.png` | OpenAI image generation, with GPT Image 2 explicitly requested | QLOBE exact-count cutter, trim, WebP |
| 8 felt costume headpieces | `assets/source/gpt-image-2/costumes-source.png` | OpenAI image edit/generation against the stable cast sheet | Deterministic grid-gutter isolation, QLOBE exact-count cutter, WebP |
| 18 action medallions | `assets/source/gpt-image-2/choices-source.png`, revised as `choices-cast-match-source.png` against the stable cast sheet | OpenAI image generation/edit, with GPT Image 2 explicitly requested | Deterministic grid-gutter isolation, QLOBE exact-count cutter, WebP |

The OpenAI generation tool available to this run does not expose its resolved
backend model identifier in output metadata. The requested model and complete
production prompts are therefore recorded explicitly in
`assets/source/gpt-image-2/PROMPTS.md` without claiming unverifiable tool
metadata.

Qwen extraction uses the approved LAN `qwen-image-layered` workflow. The
sanitized recipes under `assets/source/layered/` omit the endpoint. The
reproducible processor is `tools/process-assets.py`; it invokes the required
repository script `tools/cut-asset-sheet.py` with exact-count gates. Cutter
manifests, hashes, dimensions, and magenta edge checks are retained under
`assets/source/crops/`, `assets/source/qa/`, and
`assets/source/processing.json`.

## Hub and share art

| Asset | Source | Processing |
|---|---|---|
| `../../assets/hub/tiles/grace-courtesy-theater.jpg` | Krea 2 text-to-image exploration, then OpenAI image edit against the approved cast sheet | Cast-matched source at `assets/source/gpt-image-2/hub-cast-match-source.png`; deterministic crop to 640×533 JPEG |
| `assets/og-image.jpg` | Locally rendered production splash screen | Captured at 1200×630 by `tools/pipeline/capture_og_images.mjs`; never hand-retouched |

The Krea exploration generator is `tools/generate-hub-tile.py`. Visual QC
caught animal-like drift in that first pass, so it is preserved as a transparent
production record rather than shipped. The public tile was revised with the
OpenAI image-generation tool using both the Krea composition and the exact
character sheet as references. `tools/finalize-share-art.py` performs only the
final deterministic crop/encode. Both prompts request no lettering, logo, or
browser-rendered artwork.

The Open Graph image follows the separate repository contract: it is a rendered
shot of the shipped splash, not a crop of source art. Regenerate it against a
local static server with
`node tools/pipeline/capture_og_images.mjs --only grace-courtesy-theater --force --channel chrome`.

## Voice

| Asset | Source / workflow | QA |
|---|---|---|
| `assets/audio/*.m4a` | Qwen 3 TTS voice clone via approved LAN API, using `shared/assets/refs/voice-teacher.wav` | Silence trim, EBU-style loudness normalization, mono AAC, plausible-duration check |
| `assets/audio/lines.json` | Verbatim authored game script | Shared with the runtime speech fallback |
| `assets/audio/manifest.json` | Accepted recorded clips only | Each entry stores duration, text hash, and seed |
| `assets/audio/qa.json` | Whisper STT via approved LAN API | Normalized transcript similarity and word-coverage gate |
| `assets/source/local-api/voice/receipt.json` | Sanitized production receipt | Workflow/reference/seed/status; no LAN address or secret |

If a clip is absent or cannot play, `shared/js/voice-clips.js` speaks the same
line through the device voice. Voice synthesis is never performed remotely at
runtime.

## Shared platform assets

| Asset | Origin | License / note |
|---|---|---|
| `shared/fonts/fredoka-latin-600-normal.woff2` | Fredoka by Milena Brandão and Hafontia, distributed through Fontsource | SIL OFL 1.1 |
| `shared/assets/music/mug-and-sunbeam.mp3` | QLOBE Kids shared music library | Reused unmodified at low volume |
| Shared HUD raster buttons | QLOBE Kids shared UI library | Reused through `shared/js/hud.js` |
| Shared synthesized interaction SFX | QLOBE Kids Web Audio module | Generated locally at runtime; no sourced audio file |

## Rights

Original game-specific art and generated narration are released with this game
under CC BY 4.0 as declared in `game.json`; code is MIT. Generated outputs were
reviewed for visible text, logos, recognizable external characters, frightening
content, and cast consistency before inclusion.
