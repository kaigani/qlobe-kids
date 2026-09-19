# Happy Ripe Fruit assets

Happy Ripe Fruit uses the canonical **Kawaii** art world: original tactile
gouache-and-soft-clay raster art with cocoa outlines, cream edge lights, and
cheerful fruit expressions. CSS and DOM elements provide layout and invisible
interaction geometry only.

## Production ledger

| Family | Runtime paths | Source / workflow | License | QA |
| --- | --- | --- | --- | --- |
| Orchard plate | `assets/orchard.webp` | GPT Image 2 built-in generation, concept video contact sheet used only as a loose composition reference | CC BY 4.0 | 1440x1080 responsive crop, file budget, landscape/portrait review passed |
| Fruit stages | `assets/fruit/*.webp` | GPT Image 2 native-alpha 6x3 sheet -> repository cutter -> deterministic lossless WebP | CC BY 4.0 | cutter exact-count 18; alpha histogram and full-size magenta review passed |
| Plants | `assets/plants/*.webp` | GPT Image 2 native-alpha 3x2 sheet -> repository cutter -> lossless WebP | CC BY 4.0 | cutter exact-count 6; alpha/magenta and in-scene stem alignment review passed |
| Basket / UI / badges | `assets/ui/*.webp`, `assets/badges/*.webp` | GPT Image 2 native-alpha source sheets and deterministic compositions | CC BY 4.0 | cutter exact-count 8 plus title; full-size screen review passed |
| Hub tile / OG image | `../../assets/hub/tiles/happy-ripe-fruit.jpg`, `assets/og-image.jpg` | authorized LAN Krea 2 composition exploration -> GPT Image 2 style-constrained refinement/edit -> deterministic crops | CC BY 4.0 | 640x533 and 1200x630, exact six fruit groups, no text, reviewed |
| Voice | `assets/audio/*.m4a` | authorized LAN Qwen3 TTS voice clone using the committed teacher reference; ffmpeg AAC conversion; Whisper transcript QA | CC BY 4.0 | 21/21 lines decode and pass exact transcript QA; manifest enforced by static test |
| Music | `../../shared/assets/music/upbeat-playground-pop.mp3` | QLOBE shared recorded library | see shared asset ledger | preload, gesture unlock, mute, replay, and narration ducking passed |
| UI controls | `../../shared/assets/ui/*.png` | QLOBE shared UI library | CC BY 4.0 | already platform-approved |

No generation service, remote font, CDN, or model call is used by the shipped
runtime. LAN addresses, credentials, and personal source paths are intentionally
omitted from committed receipts.

## Required asset cutting and deterministic finalization

Every generated sheet must be located with the repository tool in dry-run and
production modes with an exact count gate:

```text
python tools/cut-asset-sheet.py <sheet> <crop-dir> --names ... \
  --expected-count <count> --debug-mask <mask.png>
```

The generated sheets already contained clean native RGBA transparency, so a
Qwen Image Layered pass was evaluated but not needed; adding another model pass
would only risk identity drift. The cutter detects and crops complete
components without redrawing them. Finalization trims transparent padding,
applies stable canvas/size limits, writes lossless WebP, and composites every
alpha asset on saturated magenta for edge review.

## Image generation prompts and receipts

The complete GPT Image 2 prompt set and generated-output identifiers live in
`assets/source/gpt-image-2/PROMPTS.md`. Local workflow recipes live beside
their output under `assets/source/local-api/`. `assets/source/processing.json`
records source hashes, crop manifests, runtime outputs, and QA composites.

## Voice acceptance

The exact script is canonical in `config.json` and `game-design.md`. A
production voice clip is accepted only when it has useful duration, decodes in
Chrome, and the local Whisper transcript preserves the spoken intent and key
fruit/color words. All 21 shipped lines are accepted recorded clips. Web Speech
remains a resilience fallback only; it is not the normal production path.

## Visual acceptance

- Fruit stages must remain distinguishable without relying on facial emotion.
- Plants, fruit, basket, badges, title, and orchard must share lighting,
  outline weight, and material scale.
- No primary object may be replaced with emoji, SVG, CSS gradients, canvas
  drawing, or generic cards.
- Alpha edges are reviewed at useful size on magenta, not only in thumbnails.
- The final ART DIRECTOR report and production captures live under
  `assets/source/qa/`.

## Accepted QA evidence

- `assets/source/processing.json`: hashes, crop manifests, output dimensions,
  alpha statistics, and deterministic derivations for 46 runtime/marketing
  outputs.
- `assets/audio/qa.json` and `assets/source/local-api/voice/receipt.json`:
  21/21 accepted cloned-teacher lines with Whisper transcripts.
- `assets/source/qa/captures-local/`: splash, selector, play, persistent visual
  stage key, miss hint, reward, party, portrait, and reduced-motion captures.
- `tools/qa.mjs`: 65-check real-interaction suite, including physical drag,
  outside-drop cancellation, an 18-pick journey, persistence, slow audio boot,
  responsive targets, and recorded-clip playback/replay.
