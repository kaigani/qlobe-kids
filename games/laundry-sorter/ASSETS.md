# Laundry Sorter assets

Laundry Sorter is the production flagship for the **Storybook Rooms** art world.
All model calls are authoring-time only. Runtime is static and offline.

## Runtime art

| Runtime asset | Source and workflow | Finalization | License |
| --- | --- | --- | --- |
| `assets/room.webp` | GPT Image 2 via the built-in image generation tool, using the concept's `02-sort-socks.png` only as a style/composition reference | Source retained at `assets/source/room-gpt-image-2.png`; resized to 1600×1200 and encoded as quality-88 WebP (64 KB) | CC BY 4.0 |
| `assets/fold/{shirt,pants,towel}-{0..3}.webp` | GPT Image 2 via the built-in image generation tool, reference-guided from the existing Storybook shirt, pants, and towel | Three 2×2 source sheets retained under `assets/source/gpt-image-2-fold/`; split, chroma extracted with the imagegen helper, edge-contracted/despilled, and encoded as lossless exact-alpha WebP | CC BY 4.0 |
| `assets/pairs/*.webp` | GPT Image 2 via the built-in image generation tool, reference-guided from the existing Storybook socks | Eight individual sources retained under `assets/source/gpt-image-2-pairs/`; chroma extracted with the imagegen helper, edge-contracted/despilled, resized to 512×512, and encoded as lossless exact-alpha WebP | CC BY 4.0 |
| `../../assets/hub/tiles/laundry-sorter.jpg` | Studio `menu-game-tile`: Krea 2 Toy Table, seed 42 | 640×533 JPEG (52 KB), replacing the previous beta tile | CC BY 4.0 |
| Shared Storybook socks, shirts, scarf, mitten, cap, pants, and baskets | Existing QLOBE Kids `shared/assets/storybook/` pilot set | Reused with deterministic runtime colour transforms to make a seventeen-piece, four-colour sorting pool | CC BY 4.0 |

The previous room plate and hub tile are retained at
`assets/source/room-krea-original.jpg` and
`assets/source/hub/previous-tile.jpg`.
The first-production Krea/Qwen towel cutouts remain under `assets/towels/` and
`assets/source/studio/laundry-towel-*` as provenance, but the revised folding
mode uses the physical four-stage GPT Image 2 sequences.

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

## GPT Image 2 folding prompt set

Use case: `illustration-story`. Built-in image generation/edit mode.

All three prompts requested an exact 2×2 production sprite sheet on a perfectly
flat `#ff00ff` chroma background, one centered garment per equal cell, generous
padding, consistent camera and scale, crisp dark-navy outline, rounded
preschool geometry, subtle fabric texture, and the polished 2D Storybook Rooms
finish of the referenced local asset. Every prompt explicitly prohibited
scaling, squashing, cropping, or rotating as a substitute for a physical fold,
and prohibited shadows, hands, arrows, text, labels, borders, watermarks,
extra clothing, and decoration.

- **Shirt reference:** `shared/assets/storybook/shirt-blue.png`. Stages:
  completely flat; left sleeve and left body third folded inward with the right
  sleeve still extended; both sleeves and sides folded inward into a narrow
  layered rectangle; bottom folded upward into a compact rectangle with collar
  and layered edge visible.
- **Pants reference:** `shared/assets/storybook/jeans-blue.png`. Stages:
  completely flat; one leg folded over the other into a narrow double layer;
  doubled legs folded upward at the knees with the waistband visible; folded
  upward again into a compact stack with waistband and layered edges.
- **Towel reference:** `assets/towels/orange-flat.webp`. Stages: completely
  flat and wide; left half folded inward with a clear layered edge; right half
  folded over it into a narrow double-layer rectangle; bottom folded upward
  into a compact stack with stitched terry-cloth layers.

The generated sheets and every extracted PNG are retained next to the runtime
WebPs so the fold sequence can be re-cut or re-encoded without another model
call. Following the 2026-07-29 playtest, the separated towel stage 2 was
mirrored horizontally (without regenerating or altering its shape) so its
left-facing layered seam agrees with the right-side-in gesture.

## GPT Image 2 patterned sock prompt set

Use case: `illustration-story`. Built-in image generation mode.

Each of eight calls used the matching shared Storybook sock as a style and
silhouette reference and requested one original chunky ankle sock, toe pointing
right, with crisp dark-navy outlines, rounded preschool geometry, subtle
painted fabric texture, glossy highlights, generous square-canvas padding, and
a perfectly flat removable chroma background. Every prompt prohibited extra
socks, clothing, people, hands, feet, shadows, text, logos, watermarks, panels,
photorealism, and 3D rendering.

- coral red with large cream hearts;
- cobalt blue with broad aqua zigzags;
- sunny yellow with large orange diamonds;
- grassy green with cream flowers and yellow centers;
- grape purple with pale-yellow crescent moons;
- grape purple with lavender-and-aqua checks;
- bright aqua with coral/yellow/deep-blue rainbow arches;
- bright aqua with broad navy waves.

The red, blue, yellow, green, and aqua sprites used flat `#ff00ff`; the purple
sprites used flat `#00ff00`. All eight alpha mattes have transparent corners,
closed silhouettes, and no visible key-color fringe on a dark QA composite.
They join the four existing dot, star, stripe, and green-stripe socks to form
the twelve-design runtime library.

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
| `sort-prompt` | 7 | 2.556 s | exact normalized match |
| `sort-nudge` | 7 | 2.716 s | exact normalized match |
| `sort-cheer` | 7 | 1.757 s | exact normalized match |
| `fold-prompt` | 7 | 2.077 s | exact normalized match |
| `fold-again` | 7 | 2.396 s | exact normalized match |
| `fold-nudge` | 7 | 2.237 s | exact normalized match |
| `fold-cheer` | 7 | 2.956 s | exact normalized match |
| `pairs-prompt` | 7 | 2.396 s | exact normalized match |
| `pairs-nudge` | 7 | 3.435 s | exact normalized match |
| `pairs-cheer` | 7 | 2.556 s | exact normalized match |

The earlier short `pairs-prompt` needed seed 8 because Whisper heard “Find two
socks **at** match” at seed 7. The expanded color-and-pattern prompt and nudge
both passed at seed 7 with exact normalized matches; their accepted v2 recipes
are retained beside the earlier takes. Every recipe and `qa-transcript.json` is
retained in a matching `assets/source/studio/laundry-voice-*` folder. Web
Speech uses the same verbatim script as a runtime fallback.

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
