# Laundry Sorter assets

Laundry Sorter is the production flagship for the **Storybook Rooms** art world.
All model calls are authoring-time only. Runtime is static and offline.

## Runtime art

| Runtime asset | Source and workflow | Finalization | License |
| --- | --- | --- | --- |
| `assets/room.webp` | GPT Image 2 via the built-in image generation tool, using the concept's `02-sort-socks.png` only as a style/composition reference | Source retained at `assets/source/room-gpt-image-2.png`; resized to 1600×1200 and encoded as quality-88 WebP (64 KB) | CC BY 4.0 |
| `assets/towels/{orange,aqua,purple}-flat.webp` | Studio `prop-cutout`: Krea 2 Storybook render on dark charcoal → Qwen Image Layered `layer_2` → alpha QA/finalize, seed 42 | 480×480 alpha WebP, quality 70; 44–56 KB | CC BY 4.0 |
| `assets/towels/{orange,aqua,purple}-folded.webp` | Same Krea 2 → Qwen Image Layered chain, seed 42 | 480×480 alpha WebP, quality 70; 80–84 KB | CC BY 4.0 |
| `../../assets/hub/tiles/laundry-sorter.jpg` | Studio `menu-game-tile`: Krea 2 Toy Table, seed 42 | 640×533 JPEG (52 KB), replacing the previous beta tile | CC BY 4.0 |
| Shared Storybook socks, shirts, and baskets | Existing QLOBE Kids `shared/assets/storybook/` pilot set | Reused unmodified | CC BY 4.0 |

The previous room plate and hub tile are retained at
`assets/source/room-krea-original.jpg` and
`assets/source/hub/previous-tile.jpg`.

## GPT Image 2 room prompt

Use case: `illustration-story`

> Create one empty, cheerful 4:3 laundry room production backdrop inspired by
> the reference image's visual language, but remove every UI control and loose
> gameplay object. Use a centered white-framed window with red curtains, warm
> yellow striped upper wall, aqua-blue wainscoting, glossy blue-and-white
> checkerboard floor, and a small white dresser at far right with folded towels.
> Render polished 2D preschool game illustration with rounded geometry, crisp
> dark navy outlines, subtle glossy dimensional highlights, and a saturated
> cyan/aqua/coral/yellow palette. Keep a wide clean open lower-centre play area
> and the outer 8% safe. Environment only: no characters, people, baskets,
> loose clothes, gameplay props, progress dots, buttons, icons, labels, text,
> letters, logo, watermark, border, collage, photorealism, or 3D clay render.

## Studio recipes and image QA

Complete generated-media folders are retained at `assets/source/studio/`.
Each contains the original dark-ground render, full-resolution
`qwen-image-layered` output, final PNG, magenta alpha composite, and
`qlobe-recipe` v1 document.

All six cutouts were visually reviewed on their saturated magenta composites:

- alpha boundaries are closed and free of dark-ground boxes;
- no holes or magenta fringes are visible;
- the object is complete and fully in frame;
- flat and folded variants remain recognizably the same colour and material.

The hub tile source and recipe are at
`assets/source/studio/laundry-sorter-hub-tile/`. It was reviewed as a separate
Toy Table menu surface: one readable laundry moment, no baked title or UI.

## Recorded teacher voice

Runtime clips live under `assets/audio/` with `manifest.json` and `lines.json`.
Each line was generated with Studio's `character-voice-line` template using
`qwen3-tts-voiceclone` and the committed, rights-cleared teacher reference.
Studio converted the model result to AAC/M4A and ran `whisper-stt` QA.

| Key | Seed | Duration | Whisper result |
| --- | ---: | ---: | --- |
| `welcome` | 7 | 2.636 s | exact normalized match |
| `sort-prompt` | 7 | 2.956 s | exact normalized match |
| `sort-nudge` | 7 | 2.716 s | exact normalized match |
| `sort-cheer` | 7 | 1.917 s | exact normalized match |
| `fold-prompt` | 7 | 1.837 s | exact normalized match |
| `fold-again` | 7 | 0.879 s | exact normalized match |
| `fold-nudge` | 7 | 1.997 s | exact normalized match |
| `fold-cheer` | 7 | 2.157 s | exact normalized match |
| `pairs-prompt` | 8 | 2.077 s | exact normalized match |
| `pairs-nudge` | 7 | 2.476 s | exact normalized match |
| `pairs-cheer` | 7 | 2.556 s | exact normalized match |

The first `pairs-prompt` take at seed 7 was rejected because Whisper heard
“Find two socks **at** match.” Seed 8 heard “Find two socks **that** match” and
is the shipped take. Every recipe and `qa-transcript.json` is retained in the
matching `assets/source/studio/laundry-voice-*` folder. Web Speech uses the same
verbatim script as a runtime fallback.

## Shared runtime assets

| Asset | Creator / source | License | Use |
| --- | --- | --- | --- |
| Fredoka SemiBold | Milena Brandao & Hafontia via Fontsource | SIL OFL 1.1 | Display and interface text |
| `shared/assets/ui/btn-{home,back,sound}.png` | QLOBE Kids | CC BY 4.0 | Platform navigation |
| `shared/js/{tap,sfx,speech,voice-clips}.js` | QLOBE Kids | MIT | Input, synthesized feedback, recorded voice/fallback |
| CSS fold guides, bubbles, clothespins, progress furniture | This production pass | MIT | Deterministic runtime graphics |

No final child-facing visual relies on emoji or a remote asset.

## Link preview

`assets/og-image.jpg` is a generated screenshot of the live splash and must be
regenerated with:

```sh
node tools/pipeline/capture_og_images.mjs --only laundry-sorter --force
```

It is not hand-retouched.
