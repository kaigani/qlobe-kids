# Land Explorer asset provenance

Land Explorer uses a coordinated claymation asset family produced for this
game. Generation is authoring-time only: the shipped static game makes no
model, LAN, CDN, or other remote requests.

## Runtime art

| Runtime asset | Production recipe | Preserved source / QA |
|---|---|---|
| `assets/scenes/tray.webp` | GPT Image 2 reference edit of the approved Land Explorer mockup; resized to 1280×960 WebP q88 | `assets/source/gpt-image-2/tray-empty.png`; prompt in `prompts.json` |
| `assets/ui/title.webp` | GPT Image 2 exact title lockup on magenta → Qwen Image Layered `layer_2` → alpha validation, disconnected-matte cleanup, trim, WebP q88 | `title-magenta.png`, raw Layered output, magenta QA image, and `processing.json` |
| `assets/ui/card-{island,lake,peninsula,bay}.webp` | GPT Image 2 authored 2×2 card family → deterministic equal-cell crop → Qwen Image Layered `layer_2` → alpha validation, cleanup, trim, WebP q88 | `landform-cards-charcoal.png`, `slices/`, raw layers, magenta QA images, and `processing.json` |
| `assets/ui/clay-lump.webp`, `assets/ui/scoop.webp` | GPT Image 2 authored 3×2 prop family → deterministic crop → Qwen Image Layered `layer_2` → alpha validation, cleanup, trim, WebP q88 | `props-charcoal.png`, `slices/`, raw layers, magenta QA images, and `processing.json` |
| `assets/ui/action-plaque.webp` | GPT Image 2 prop-sheet crop → GPT Image 2 exact-object magenta isolation and centering edits → Qwen Image Layered `layer_2` → alpha QA, trim, WebP q88 | Both staged magenta plates, exact prompts, rejected Layered candidates, accepted magenta QA, and `processing.json` |
| `assets/world/fish.webp` | GPT Image 2 prop-sheet crop → Qwen Image Layered `layer_2` → alpha QA, trim, WebP q88 | Raw layer, magenta QA, and `processing.json` |
| `assets/world/{boat,turtle}.webp` | GPT Image 2 prop-sheet crop → GPT Image 2 exact-object magenta isolation plate → Qwen Image Layered `layer_2` → alpha QA, trim, WebP q88 | Isolation plates and verbatim prompts, visually rejected charcoal-source candidates, accepted magenta QA, and `processing.json` |
| `../../assets/hub/tiles/land-water-tray.jpg` | QLOBE Studio `menu-game-tile`, `krea2-turbo-t2i`, Toy Table style, seed 42, 768×640 → centered 640×533 JPEG | `assets/source/krea/land-explorer-hub-seed42.png` and `recipe.json` (`qa.status: accepted`) |
| `assets/og-image.jpg` | Screenshot of the game's own final splash, captured at 1200×630 by the repository OG pipeline | Regenerate with `tools/pipeline/capture_og_images.mjs`; never hand-edit |

The OpenAI source prompts are recorded verbatim in
`assets/source/gpt-image-2/prompts.json`. Qwen prompts, selected output layer,
seed fallbacks, source crop, alpha histogram, bounding box, component cleanup,
final dimensions, and file sizes are recorded in `processing.json`. The
repeatable implementation is `tools/process-assets.py`.

The Qwen pipeline does **not** flood-fill or chroma-key the production assets.
It uses Qwen Image Layered's returned RGBA `layer_2` as the matte authority.
The local finalizer removes only tiny disconnected debris and alpha below the
pipeline-standard floor of 16, then retains the original antialiasing around
accepted components. It never flood-fills, chroma-keys, or invents an outline.

## Teacher voice

Every key in `config.json#voice` has the same fallback text in
`assets/audio/lines.json`. `tools/gen-voice.py` produces candidates with the
approved teacher reference and `qwen3-tts-voiceclone`, normalizes them to mono
24 kHz AAC at 96 kb/s with `+faststart`, then transcribes the **final encoded
candidate** through Whisper. A clip enters `manifest.json` only after transcript
similarity, word coverage, critical landform vocabulary, and duration checks
pass. Rejected lines remain safe because `shared/js/voice-clips.js` falls back
to exact device speech.

Per-line `.recipe.json` files record text hashes, selected seed, encoding, and
Whisper evidence without exposing a personal absolute reference path. Aggregate
results live in `assets/audio/qa.json`; generation candidates and transcripts
live under `assets/source/local-api/voice/`.

The production pass accepted 29 of 30 lines. `island-clue` remains on exact
device speech because all three cloned takes (seeds 7, 8, and 9) were
transcribed as “And island…” rather than the authored “An island…”. The
rejected candidates and transcripts are preserved; no uncertain take ships.

## Shared runtime resources

| Resource | Source | License / use |
|---|---|---|
| Fredoka SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | Fontsource / Google Fonts; Milena Brandão and Hafontia | SIL OFL 1.1; reused unmodified |
| HUD button PNGs (`shared/assets/ui/btn-{home,back,sound}.png`) | QLOBE Kids shared authored library | Project asset, CC BY 4.0 |
| Heightfield clay renderer, screen/HUD/tap/audio/debug modules | QLOBE Kids shared source | MIT |
| Synthesized interaction effects (`shared/js/sfx.js`) | Generated at runtime with Web Audio | No external recording |

## License

Game-specific generated art and audio are project assets released under the
repository's CC BY 4.0 asset license. Code is MIT. The internal concept mockup
used as the tray reference is part of this project.
