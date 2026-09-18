# Secret Message Copy — asset provenance

Secret Message Copy uses the canonical **Watercolor / Storybook** art world for
the complete child-facing play field. All primary objects are authored raster
assets; HTML/CSS/canvas provide layout, hit areas, focus, trace ink, masks and
motion only. Runtime files are local and the shipped game makes no model calls.

Original generated assets are released with this project under CC BY 4.0.
Code is MIT. No attribution is required inside the child-facing game.

## GPT Image 2 production masters

The built-in image generation tool used GPT Image 2. Exact normalized prompts,
reference roles and accepted-source recipes are retained in
`assets/source/gpt-image-2/PROMPTS.md` and beside every source master.

| Runtime asset | Retained master | Production / QA |
|---|---|---|
| `assets/art/backdrop-desk.webp` | `desk-backdrop-master.png` | 4:3 full-bleed environment; deterministic 1600×1200 WebP; quiet center and protected HUD corners |
| `assets/art/backdrop-delivery.webp` | `delivery-backdrop-master.png` | distinct tree-door reward world; deterministic 1600×1200 WebP; clear owl and action zones |
| `assets/art/title-lockup.webp` | `title-lockup-master.png` | exact “Secret Message” spelling checked at full size; true alpha; 1100 px max edge, 129 KB |
| `assets/art/paper-sheet.webp` | `paper-sheet-wide-master.png` | true-alpha 5:2 ruled parchment; 1400 px max edge; quiet runtime trace field |
| `assets/art/envelope-{star,moon,heart}.webp` | `object-kit-master.png` | exact-count contact-sheet cut, chroma matte, connected-component isolation, shared alpha QA |
| `assets/art/stamp-{star,moon,heart}.webp` | `object-kit-master.png` | same pipeline; cross-cell contamination is rejected by largest-component gating |
| `assets/art/seal-burst.webp` | `object-kit-master.png` | one connected owl-post rosette/reward seal |
| `assets/art/owl-{neutral,guide,carry,cheer}.webp` | `owl-poses-master.png` | four on-model Pip poses; exact-count cut; alpha checked on saturated magenta |
| `assets/art/nav-{home,back,sound,muted}.webp` | `nav-kit-master.png` | authored picture-only watercolor HUD controls; retained generator alpha |
| `assets/art/button-{next,replay}.webp` | `nav-kit-master.png` | authored wordless arrow controls; retained generator alpha |
| `../../assets/hub/tiles/secret-message-copy.jpg` | `hub-tile-fallback-master.png` | separate Toy-world catalog composition; safe 640×533 center crop; not a splash crop |

The source mockups under
`../../../01-game-concepts/secret-message-copy/output/ui-mockups/` were used only as
style/composition references. Their baked UI and generated lettering are not
shipped.

## Required asset cutting and deterministic finalization

The repository cutter was run with hard expected counts; no equal-grid estimate
was accepted:

```sh
python tools/cut-asset-sheet.py \
  games/secret-message-copy/assets/source/gpt-image-2/object-kit-master.png \
  games/secret-message-copy/assets/source/crops/object-kit \
  --names envelope-star envelope-moon envelope-heart stamp-star stamp-moon \
  stamp-heart paper-sheet seal-burst button-next-blank --expected-count 9 \
  --background-color '#ff00ff' --distance-threshold 28 --chroma-threshold 0 \
  --close-radius 1 --padding 14 \
  --debug-mask games/secret-message-copy/assets/source/crops/object-kit-mask.png

python tools/cut-asset-sheet.py \
  games/secret-message-copy/assets/source/gpt-image-2/owl-poses-master.png \
  games/secret-message-copy/assets/source/crops/owl-poses \
  --names owl-neutral owl-guide owl-carry owl-cheer --expected-count 4 \
  --background-color '#ff00ff' --distance-threshold 28 --chroma-threshold 0 \
  --close-radius 1 --padding 14 \
  --debug-mask games/secret-message-copy/assets/source/crops/owl-poses-mask.png

python tools/cut-asset-sheet.py \
  games/secret-message-copy/assets/source/gpt-image-2/nav-kit-master.png \
  games/secret-message-copy/assets/source/crops/nav-kit \
  --names nav-home nav-back nav-sound nav-muted button-next button-replay \
  --expected-count 6 --alpha-threshold 8 --close-radius 1 --padding 14 \
  --debug-mask games/secret-message-copy/assets/source/crops/nav-kit-mask.png
```

`tools/process-assets.py` then performs only repeatable work: soft-key and
de-spill, connected-component cleanup, built-in-alpha normalization, the shared
`tools/pipeline/cutout_finalize.py` QA gate, WebP/JPEG encoding, source/output
hashes and a processing receipt. Re-run it from the repository root:

```sh
python games/secret-message-copy/tools/process-assets.py
```

The combined final alpha plate is
`assets/source/qa/runtime-contact-sheet-magenta.png`; every per-asset magenta
plate and alpha histogram is retained under `assets/source/qa/`. Machine-readable
coordinates live in each cutter `boxes.json`; final hashes, sizes and alpha
statistics live in `assets/source/processing.json`.

## Local API production and honest fallbacks

`tools/generate-hub-tile.py` is the reproducible QLOBE Studio / Krea 2 hub-tile
driver (768×640, Toy / `toy-table` grammar, seed 42 first). During this production
run the configured LAN wrapper was reachable, but its upstream worker failed
before inference (`/free` returned 404 in Krea; no candidate bytes were produced).
GPT Image 2 therefore supplied the accepted, separately authored Toy hub tile.
The fallback and reason are recorded in the source recipe; no hostname is
committed.

The approved Qwen teacher-voice workflow was likewise attempted first through
`qwen3-tts-voiceclone`. Its worker aborted the synthesis connection before
returning audio. `tools/generate-voice.py --allow-edge-fallback` therefore uses
the explicitly authorized `en-US-AnaNeural` Edge TTS fallback, normalizes every
clip to mono AAC, and admits it only after local `faster-whisper/base`
transcript QA.
`assets/audio/lines.json` is the exact script; `qa.json` records engine, seed,
duration, loudness, transcript, match score, source-text hash and fallback
reason for every line; `manifest.json` exposes only verified clips. Web Speech
is still the runtime fallback if a local clip cannot decode.

No Qwen Image Layered call was needed for the accepted sources: the title,
navigation and wide parchment arrived with genuine alpha, while the flat-key
contact sheets passed the deterministic chroma/connected-component pipeline.
The broken LAN image worker was not allowed to replace accepted source pixels.

## Shared local assets

| Asset | Source | Role |
|---|---|---|
| `../../shared/assets/music/quirky-forest-adventure.mp3` | shared QLOBE music library; repository asset license | quiet recorded underscore through `bgm.js`, preloaded, first-gesture started, loop-faded and ducked beneath speech |
| `shared/js/sfx.js` | QLOBE Kids procedural Web Audio | paper/stamp feedback, sparkle, gentle retry and celebration; no downloaded SFX |
| `shared/fonts/fredoka-latin-600-normal.woff2` | Fontsource / Google Fonts, Fredoka by Milena Brandão and Hafontia, SIL OFL 1.1 | exact runtime functional lettering; loaded by shared `base.css` |
| shared UI/object images | QLOBE Kids CC BY 4.0 library | defensive missing-image fallback only; production paths resolve to the authored art above |

## Link preview

`assets/og-image.jpg` is a deterministic 1200×630 screenshot of the final splash
captured with `tools/pipeline/capture_og_images.mjs`; it contains only this
game's own committed art and runtime rendering.
