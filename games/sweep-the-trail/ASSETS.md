# Sweep the Trail assets

Sweep the Trail uses original raster production art and recorded dialogue. It has no downloaded third-party art and makes no model/API request at runtime. Game-owned assets are released under the repository's CC BY 4.0 asset license; shared platform media retains its repository license.

## Runtime art

| Runtime path | Source / tool | Production notes |
|---|---|---|
| `assets/art/backgrounds/select.webp` | Built-in GPT Image 2 | Original 4:3 cozy-felt forest chooser plate; resized and WebP-encoded by `tools/finalize-assets.py`. |
| `assets/art/backgrounds/leaf-lane.webp` | Built-in GPT Image 2 | Original empty felt trail play plate. |
| `assets/art/backgrounds/acorn-bend.webp` | Built-in GPT Image 2, reference-conditioned from Leaf Lane | Original deeper pine woodland variant with an empty play surface. |
| `assets/art/backgrounds/porch-path.webp` | Built-in GPT Image 2, reference-conditioned from Leaf Lane | Original felt cottage-porch variant with an empty play surface. |
| `assets/art/ui/title.webp` | Built-in GPT Image 2 | Exact spell-checked transparent `SWEEP THE TRAIL` felt lockup. |
| `assets/art/ui/mode-*.webp` | Built-in GPT Image 2 + repository cutter + local Qwen Image Layered / GPT Image 2 edit fallback | One three-card sheet was cut with exact-count validation and sent through Layered. Full-size visual QA rejected all three Layered results for completeness: Leaf lost its padded frame, Acorn retained only its rim despite a numeric pass, and Porch was empty. Accepted GPT Image 2 transparent edits preserve every complete card; all rejected evidence is retained. |
| `assets/art/ui/progress-plaque.webp` | Built-in GPT Image 2 sheet and transparent edit | Qwen Layered passed its numeric gate but visual magenta review exposed one missing edge patch. GPT Image 2 produced the accepted unbroken transparent plaque; the rejected QA evidence is retained. Live text and raster pips are DOM overlays. |
| `assets/art/sprites/squirrel-*.webp` | Built-in GPT Image 2 sheet + local Qwen Image Edit/Layered | The first sheet followed the mockup's hedgehog drift. Qwen Image Edit changed only those cells to the brief's canonical red squirrel; Layered isolated both accepted poses. |
| `assets/art/sprites/broom.webp` | Built-in GPT Image 2 sheet and transparent edit | The cutter exposed the exact broom crop. The first Qwen Layered extraction failed the empty-extraction gate, so GPT Image 2 removed the white ground and stray neighboring pixel; the failed QA evidence is retained under `assets/source/layered/`. |
| `assets/art/sprites/{basket,dustpan,leaf-*,acorn,crumb,star-cluster}.webp` | Built-in GPT Image 2 sheet + local Qwen Image Edit/Layered | Exact-count cuts, Layered foreground extraction, `cutout_finalize.py`, full-size magenta inspection, and deterministic WebP optimization. |

The complete GPT Image 2 prompt record and accepted masters are in `assets/source/gpt-image-2/`. Local workflow prompts and accepted intermediate sources are in `assets/source/local-api/`.

## Asset-sheet cutting and alpha QA

The required repository cutter was run against the corrected twelve-object sheet:

```sh
python tools/cut-asset-sheet.py \
  games/sweep-the-trail/assets/source/local-api/asset-sheet-qwen-squirrels.png \
  games/sweep-the-trail/assets/source/cuts/asset-sheet \
  --names squirrel-idle squirrel-cheer broom basket dustpan leaf-orange leaf-mustard leaf-green acorn crumb progress-plaque star-cluster \
  --expected-count 12 --padding 18 \
  --debug-mask games/sweep-the-trail/assets/source/cuts/asset-sheet-mask.png
```

The three-card sheet was cut the same way with `--expected-count 3` and names `leaf-lane acorn-bend porch-path`. `boxes.json`, debug masks, and verbatim opaque crops are retained. Each accepted local Layered foreground was then gated through:

```sh
python tools/pipeline/cutout_finalize.py \
  --input <name>-layer2.png --output <name>.png \
  --magenta <name>-magenta.png --max-size <target> --pad 12 --alpha-floor 4
```

Shipping derivatives are reproducible with:

```sh
python games/sweep-the-trail/tools/finalize-assets.py
```

The resulting dimensions and byte sizes are recorded in `assets/source/finalize-receipt.json`.

## Hub and link-preview art

| Asset | Source | Notes |
|---|---|---|
| `../../assets/hub/tiles/sweep-the-trail.jpg` | Local Krea 2 (`krea2-turbo-t2i`) | Separate menu-tile composition, 768×640 source, seed 42, no text/UI; curated to 640×533 progressive JPEG. Source prompt and master are retained under `assets/source/local-api/hub/`. |
| `assets/og-image.jpg` | Screenshot of the real game splash | 1200×630 JPEG produced by `tools/pipeline/capture_og_images.mjs`; regenerate rather than hand-edit. |

## Voice

The thirteen lines in `assets/audio/lines.json` were produced through QLOBE Studio's `character-voice-line` template using local `qwen3-tts-voiceclone` and the approved repository reference `shared/assets/refs/voice-teacher.wav`. Seed 7 is the first take; seeds 8 and 9 are permitted only when transcript QA rejects a take. Local Whisper checks intended text against every accepted clip before packaging.

| Asset group | Source | QA / provenance |
|---|---|---|
| `assets/audio/*.m4a` | Qwen3 TTS voice clone via QLOBE Studio | AAC/M4A teacher clips; exact duration map in `manifest.json`. |
| `assets/source/voice-recipes/*.recipe.json` | QLOBE Studio media recipes | Records template, voice reference class, text, seed, and processing steps without a LAN host. |
| `assets/source/voice-qa/*.json` | Local Whisper STT | Per-line intended/transcribed text, normalized ratio, and pass result. |

Generation command (LAN host supplied only through the local environment):

```sh
QLOBE_STUDIO_URL=http://127.0.0.1:8002 \
  node games/sweep-the-trail/tools/generate-voice.mjs --allow-lan
```

## Shared platform media

| Asset | Source / license | Use |
|---|---|---|
| `shared/assets/music/quirky-forest-adventure.mp3` | Existing QLOBE Kids shared music library | Quiet looping game bed through `bgm.js`; not copied into this game. |
| `shared/assets/ui/btn-home.png`, `btn-back.png`, `btn-sound.png`, `btn-play.png` | Existing QLOBE Kids shared UI library | Raster navigation, replay, and narration controls. |
| Shared procedural SFX | Existing QLOBE Kids `sfx.js` | Tick, whoosh, pop, sparkle, and finish sounds. |

## Non-shipping concept references

`01-game-concepts/sweep-the-trail/brief.md` and its four UI mockups set composition, interaction, and **Puppet / Cozy felt fabric** direction. They are design references, not copied runtime assets. When the mockup helper conflicted with the written brief, the written red-squirrel requirement won.
