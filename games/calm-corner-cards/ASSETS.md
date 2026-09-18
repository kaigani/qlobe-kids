# Calm Corner Cards Assets

All child-facing illustration is project-local raster artwork. The shipped game makes no model, LAN, font, image, or audio request at runtime. Source masters, prompts, cutter receipts, Layered output, alpha-QA composites, and voice QA records are retained under `assets/source/` and `assets/audio/`.

## Production chain

| Stage | Model / tool | Output and acceptance |
|---|---|---|
| Art direction masters | OpenAI built-in image generation on the requested GPT Image 2 path | Five accepted masters: 4:3 calm room, 12-piece Sunny/prop sheet, 9-piece felt UI sheet, exact-title lockup, and transparent stitched breathing rings. Visual review checked the Puppet / Cozy felt fabric language, uncluttered play space, exact title, and raster-only focal cue. |
| Required sheet cutting | `tools/cut-asset-sheet.py` | Connected-component cuts with explicit names and `--expected-count`: 12/12 sprite pieces and 9/9 UI pieces. `boxes.json` and debug masks are retained. No grid slicing was used. |
| Alpha separation | LAN `qwen-image-layered` | The accepted UI sheet was separated; `layer_2` is retained as `assets/source/local-api/ui-sheet-layer2.png`. Its nine pieces were recut 9/9. |
| Deterministic alpha QA | `tools/pipeline/cutout_finalize.py --alpha-floor 4` | All nine Layered UI crops passed on magenta composites retained in `assets/source/qa/ui-layered/`; lossless finals are retained in `assets/source/final-png/`. GPT Image 2 sprites already carried useful soft alpha and were preserved directly to avoid hardening their fuzzy felt fringe. |
| Runtime optimization | Local Pillow/ffmpeg WebP pipeline | Background, Sunny poses, props, card shells, controls, title, and breathing overlay were resized for their rendered role and exported as local WebP. |
| Platform hub tile | LAN `krea2-turbo-t2i` | A separate 768×640 toy-grammar composition featuring the four activities was selected, resized to 640×533, and optimized to `../../assets/hub/tiles/calm-corner-cards.jpg`. |
| Teacher narration | LAN `qwen3-tts-voiceclone` | Twenty lines cloned from the approved project teacher reference. Seeds 7/8/9 form a failover ladder; all 20 accepted on seed 7. |
| Voice verification | LAN `whisper-stt` + local audio decode | Every published clip decoded and matched its intended line at ≥0.90 similarity. The observed minimum was 0.971; the other 19 were 1.000. |

The normalized accepted prompt set and deterministic commands live in [`assets/source/PROMPTS.md`](assets/source/PROMPTS.md). The aggregate machine-readable production record is `assets/source/recipe.json`. Neither file contains a LAN address or an absolute voice-reference path.

## Runtime inventory

### Scene and character

- `assets/backgrounds/calm-room.webp` — responsive moonlit felt room plate.
- `assets/characters/sunny-neutral.webp` — Sunny’s shelf, breathing, and reflection pose.
- `assets/characters/sunny-hug.webp` — Sunny’s quiet-rest pose.

### Activity props

- Breathing: `breathe-cloud.webp`, `breath-flower.webp`, and transparent raster `breathing-rings.webp`.
- Squeezing: `squeeze-heart.webp`, `squish-ball.webp`.
- Drawing palette: `sun-patch.webp`, `rainbow-patch.webp`, `cloud-patch.webp`, `star-patch.webp`.
- Rest: `rest-star.webp` and the shared `star-patch.webp` family.
- Card shelf: `draw-crayon.webp` plus the breathing, squeeze, and rest props above.

### Authored UI carriers

- `assets/ui/title.webp` — exact “CALM CORNER CARDS” title lockup.
- `card-mint.webp`, `card-coral.webp`, `card-lavender.webp`, `card-cream.webp` — four large activity cards.
- `button-plum.webp`, `button-teal.webp` — dynamic text carriers.
- `plaque-lavender.webp`, `moon-patch.webp`, `progress-dots.webp` — prompt, reflection, and decorative pieces.

Functional labels remain real Fredoka HTML text above authored raster carriers. CSS provides layout, focus, transitions, and state only; it does not supply the game’s primary artwork.

## Audio

- `assets/audio/lines.json` — canonical 20-line script and Web Speech fallback text.
- `assets/audio/*.m4a` — accepted local teacher-voice clips.
- `assets/audio/manifest.json` — duration, content hash, and script hash for each published clip.
- `assets/audio/qa.json` — intended line, Whisper transcript, ratio, accepted seed, and status.
- `tools/generate-voice.py` — reproducible two-phase batch: synthesize a complete seed, then Whisper-check the full batch before publication.
- `../../shared/assets/music/cozy-starlight-lullaby.mp3` — existing QLOBE Kids shared lullaby, reused at low volume.
- Shared WebAudio SFX provide the quiet tap, pop, whoosh, and sparkle feedback.

## Cutting and QA receipts

The accepted sheet cuts were produced with these forms:

```powershell
python tools/cut-asset-sheet.py games/calm-corner-cards/assets/source/gpt-image-2/sprites-sheet.png games/calm-corner-cards/assets/source/cuts/sprites --names sunny-neutral sunny-hug breathe-cloud squeeze-heart draw-crayon rest-star squish-ball breath-flower sun-patch rainbow-patch cloud-patch star-patch --expected-count 12 --debug-mask games/calm-corner-cards/assets/source/cuts/sprites-mask.png --force

python tools/cut-asset-sheet.py games/calm-corner-cards/assets/source/local-api/ui-sheet-layer2.png games/calm-corner-cards/assets/source/cuts/ui-layered --names card-mint card-coral card-lavender card-cream plaque-lavender button-plum button-teal moon-patch progress-dots --expected-count 9 --debug-mask games/calm-corner-cards/assets/source/cuts/ui-layered-mask.png --force
```

The original GPT Image 2 UI sheet was also cut 9/9 and retained beside the Layered pass for pixel comparison.

## Shared third-party asset

| Asset | Source / creator | License | Use |
|---|---|---|---|
| `shared/fonts/fredoka-latin-600-normal.woff2` | Fredoka via Fontsource / Google Fonts; Milena Brandão and Hafontia | SIL OFL 1.1 | Accurate live labels and prompts |

## Hub and sharing

| Asset | Source | License | Modification |
|---|---|---|---|
| `../../assets/hub/tiles/calm-corner-cards.jpg` | Project-generated Krea 2 illustration from the retained prompt | CC BY 4.0 | Selected, resized to 640×533, optimized JPEG |
| `assets/og-image.jpg` | Screenshot of the production game captured by `tools/pipeline/capture_og_images.mjs` | CC BY 4.0 | Deterministic 1200×630 link preview |

## License

Project-authored/generated art and voice ship with this game under CC BY 4.0. Code is MIT. No third-party stock art, emoji art, SVG illustration, remote image, or runtime model output is included.
