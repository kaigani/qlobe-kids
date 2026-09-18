# Pouring Station assets

All child-facing primary art is raster. CSS and DOM geometry are limited to
layout, focus, hit areas, clipping, target feedback, and motion. Original game
art and documentation are released under CC BY 4.0; code is MIT.

## Runtime inventory

| Runtime path | Purpose | Source / workflow | Creator | License | Modifications |
| --- | --- | --- | --- | --- | --- |
| `assets/scenes/kitchen-tray.webp` | responsive Toy kitchen and Montessori tray | built-in GPT Image 2 using the concept title mockup as a style/composition reference | OpenAI + QLOBE Kids direction | CC BY 4.0 | resized/encoded WebP |
| `assets/ui/title-plaque.webp` | title sign | concept-referenced `qwen-image-edit`, then alpha extraction/finalization | local Qwen workflow + QLOBE Kids direction | CC BY 4.0 | trimmed, alpha QA, WebP |
| `assets/ui/token-{water,beans,rice}.webp` | mode choices | built-in GPT Image 2 six-object sheet; deterministic repository cutter; accepted extraction path per token | OpenAI + QLOBE Kids direction | CC BY 4.0 | cut, trimmed, alpha QA, WebP |
| `assets/ui/reward-star.webp` | progress and reward | same six-object sheet | OpenAI + QLOBE Kids direction | CC BY 4.0 | cut, trimmed, alpha QA, WebP |
| `assets/ui/cleanup-cloth.webp` | cleanup epilogue | same six-object sheet | OpenAI + QLOBE Kids direction | CC BY 4.0 | cut, trimmed, alpha QA, WebP |
| `assets/ui/guide-hand.webp` | modeled drag/tilt cue | same six-object sheet | OpenAI + QLOBE Kids direction | CC BY 4.0 | cut, trimmed, alpha QA, WebP |
| `assets/items/pitcher.webp` | draggable empty resin pitcher | `qwen-image-edit` from the selected play mockup, then layered extraction | local Qwen workflow + QLOBE Kids direction | CC BY 4.0 | isolated, trimmed, alpha QA, WebP |
| `assets/items/cup.webp` | receiving cup and target band | `qwen-image-edit` from the selected play mockup, then layered extraction | local Qwen workflow + QLOBE Kids direction | CC BY 4.0 | isolated, trimmed, alpha QA, WebP |
| `assets/items/fill-*.webp` | clipped material surfaces | deterministic raster crops from accepted source art | QLOBE Kids | CC BY 4.0 | cropped/encoded WebP |
| `assets/items/stream-*.webp` | live material streams | reference-driven `qwen-image-edit`, then extraction | local Qwen workflow + QLOBE Kids direction | CC BY 4.0 | isolated, trimmed, alpha QA, WebP |
| `assets/characters/maya-helper.webp` | Maya in apron, cheering | `qwen-image-edit` using `shared/characters/maya/portrait.png` as the identity reference | QLOBE Kids shared cast + local Qwen workflow | CC BY 4.0 | game-local pose, alpha QA, WebP |
| `assets/audio/*.m4a` | spoken modeling and praise | `qwen3-tts-voiceclone`, approved `shared/assets/refs/voice-teacher.wav`, seed recorded per clip | QLOBE Kids voice workflow | CC BY 4.0 | silence trim, loudness normalize, AAC 80 kbps |
| `../../shared/assets/music/mug-and-sunbeam.mp3` | quiet background music | shared recorded music library | see shared asset documentation | repository license | reused unchanged through `bgm.js` |

The generated scene, contact sheets, cutter boxes, masks, local workflow
outputs, QA composites, recipes, and voice transcripts are retained under
`assets/source/`.

## GPT Image 2 prompt record

Built-in image generation was used; final selected originals are retained under
`assets/source/gpt-image-2/`.

### Kitchen/tray

> Create the empty play-space background for Pouring Station using the selected
> mockup only as material/composition reference: pale sage handmade wall, honey
> maple counter, a broad rounded Montessori tray with woven aqua inset, quiet
> empty center, edge plant and shelf, soft morning light, premium tactile Toy
> diorama. No vessels, text, controls, character, or watermark.

### Six-object token sheet

> On a uniform chroma-magenta field, strict 3×2 layout with wide gutters:
> wooden water token, wooden bean token, wooden rice token, wooden teal-star
> medallion, folded aqua cloth with coral tie, and warm-brown child pointer hand
> with aqua cuff. Exactly six isolated complete objects, premium tactile Toy
> materials, no text or extra objects.

The first generated sheet used a dark styled backdrop despite the requested
chroma field. A targeted GPT Image 2 edit changed only the background to
magenta. `tools/cut-asset-sheet.py` then passed `--expected-count 6`; its
`boxes.json` and debug mask are retained.

## Local workflow record

- Qwen Image Edit always receives a real reference image: the selected concept
  mockups for vessels/plaques/streams and Maya's shared portrait for identity.
- Qwen Image Layered requests two layers; the retrieved candidate is explicitly
  `output=layer_2`, never the composite.
- `tools/pipeline/cutout_finalize.py` performs alpha statistics, trim/pad/resize,
  and writes a magenta QA composite for every accepted layer.
- The intentionally translucent cup produced a false negative in the generic
  "opaque-pixel" gate. Its alpha edge and magenta composite were therefore
  reviewed at full resolution and accepted as a documented narrow exception.
- The runtime pitcher and cup receive a restrained cool-cyan color grade so
  their blue-water read remains unambiguous without repainting the generated
  resin highlights.
- Rejected layered outputs are intentionally retained under `assets/source/`.
  Early compound-token attempts separated the inner star/tie from the wooden
  token/cloth rather than separating the complete object from the background;
  those candidates did not ship.
- No LAN hostname, personal path, or credential is committed. Production tools
  read `QLOBE_QWEN_URL` or git-ignored `tools/state/local.json`.

## Voice QA

`tools/gen-voice.py` reads the exact `config.json` voice map. It batches all
Qwen voice-clone jobs before switching the local service to Whisper, then:

1. trims leading/trailing silence and loudness-normalizes each clip;
2. encodes mono 24 kHz AAC;
3. checks plausible duration;
4. transcribes with English Whisper using a Pouring Station vocabulary hint;
5. normalizes punctuation/case and measures sequence plus word coverage;
6. includes only accepted clips in `manifest.json`.

Rejected or missing recordings fall back to the same line through Web Speech.
`assets/audio/qa.json` and raw transcript JSON retain the evidence.

## Shared character and UI

- Maya is the established shared QLOBE cast character. The game-local helper
  pose is derived from her canonical portrait and is declared in `game.json`.
- Home/back/sound are the platform's authored raster controls via
  `shared/css/hud.css`; they are not redrawn locally.
- Runtime text uses the shared Fredoka font. It is supplementary; voice and
  pictures carry the interaction.

## Link preview and hub tile

The Krea 2 hub image used seed `42` and this prompt:

> Premium tactile 3D toy illustration for a preschool game tile, a translucent
> aqua toy pitcher pouring a sparkling stream into a clear cup with a glowing
> target line, arranged on a honey maple Montessori tray in a calm pale sage
> kitchen, three small wooden tokens showing a blue water drop red bean and
> golden rice nearby, warm sunny light, rounded child-safe shapes, rich
> handcrafted detail, delightful and inviting, centered readable composition,
> no people, no letters, no words, no logos, no frame.

| Asset | Source | Creator | License | Modifications |
| --- | --- | --- | --- | --- |
| `assets/og-image.jpg` | captured from the finished splash with `tools/pipeline/capture_og_images.mjs` | QLOBE Kids | CC BY 4.0 | 1200×630 production screenshot |
| `../../assets/hub/tiles/pouring-station.jpg` | local Krea 2 Toy-world tile, seed 42; hand-curated assignment | local Krea workflow + QLOBE Kids direction | CC BY 4.0 | center crop, JPEG |

Regenerate the OG image with the capture tool rather than editing it by hand.
