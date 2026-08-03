# Big Paper Murals — assets and provenance

All shipped media is local and offline. Runtime files are optimized WebP/JPEG;
accepted full-resolution generations and true-alpha intermediates are retained
under `assets/source/`. No model endpoint is called by the game.

## Runtime inventory

| Runtime asset | Authoring source | Workflow | Finalization / QC |
| --- | --- | --- | --- |
| `assets/title.webp` | `assets/source/title-chroma.png` | built-in GPT Image 2, edit from the concept theme-select mockup | local chroma matte, visually spell-checked as **Big Paper Murals**, alpha checked on magenta, WebP q84, 68 KB |
| `assets/theme-{jungle,space,city}.webp` | `assets/source/theme-select-reference.png` | deterministic crops from the approved GPT Image 2 concept mockup dated 2026-08-01 | fixed reviewed card crops, WebP q84, 48–60 KB |
| `assets/stamps/*.webp` (8) | `living-stamps-magenta.png` → `living-stamps-layer2.png` | built-in GPT Image 2 contact sheet; targeted background-only GPT Image 2 edit; local `qwen-image-layered`, seed 42, async `layer_2` | exact 4×2 crops from 1024×768 layer; alpha checked on saturated magenta; WebP q88 alpha q100, 32–40 KB each |
| `assets/tools/*.webp` (4) | `tool-icons-magenta.png` → `tool-icons-layer2.png` | built-in GPT Image 2 contact sheet; targeted background-only GPT Image 2 edit; local `qwen-image-layered`, seed 42, async `layer_2` | exact 4×1 crops from 1024×352 layer; alpha checked on saturated magenta; WebP q88 alpha q100, 28–36 KB each |
| `assets/bg.jpg` | original file committed in `85debac` | existing QLOBE paper-studio art retained from the prototype | visually reviewed as a calm 4:3 paper workbench; 1600×1200, 184 KB |
| `assets/hub/tiles/big-paper-murals.jpg` | `assets/source/hub-tile-krea-42.png` + recipe sidecar | QLOBE Studio `menu-game-tile` template → local `krea2-turbo-t2i`, proven `toy-table` style, seed 42 | hand-curated as required; Lanczos 640×533 JPEG, 64 KB |
| `assets/og-image.jpg` | final game-owned splash capture | official `tools/pipeline/capture_og_images.mjs` pipeline in real Chrome | 1200×630 JPEG q82, 110 KB; visually reviewed after capture |

All generated project art is credited to QLOBE Kids contributors and licensed
CC BY 4.0 with no outside attribution requirement. Code is MIT.

## Built-in GPT Image 2 prompt set

### Title lockup — accepted first generation

Input: the concept `01-theme-select.png` as edit target and exact style anchor.

> Isolate and recreate only the title lockup that reads exactly "Big Paper
> Murals". Preserve the exuberant handmade papercraft-and-gouache lettering:
> chunky navy hand-painted letters on a torn warm-white paper cloud, layered
> over torn bright-blue paper with tactile fibers, thick paint ridges,
> scissor-cut edges, and soft stacked-paper shadows. Center one horizontal
> lockup on a perfectly flat solid #00ff00 background. Spell every letter
> exactly; no other words, icons, brushes, sun, or watermark.

### Living stamp contact sheet — accepted subject generation

Input: the concept `03-mural-alive.png` as material/style reference.

> Exactly eight separate handmade papercraft collage stickers in a strict 4×2
> grid. Top row: friendly orange tiger cub face with leaf accent; colorful
> toucan in a leaf ring; cheerful red-and-white rocket; smiling ringed purple
> planet. Bottom row: bright red city car; happy tall blue-and-yellow city
> house; smiling golden sun; joyful blue paint-splotch creature holding one tiny
> paintbrush. Premium cut-paper collage with visible fibers, scissor-cut edges,
> small gouache details, wide gutters, and consistent scale. Flat green chroma
> background; no text, borders, labels, watermark, overlaps, or extra subjects.

### Tool contact sheet — accepted subject generation

Input: the concept `02-paint-together.png` as material/style reference.

> Exactly four separate oversized papercraft art-tool icons in a strict 4×1
> grid: blue-handled paintbrush with coral swipe; green paint roller with green
> stripe; purple wooden stamp with purple star print; layered golden and coral
> musical notes. Premium handmade cut-paper and thick gouache, consistent scale,
> clear gutters, complete silhouettes, and a flat green chroma background. No
> words, labels, button shapes, watermark, or extra objects.

### Targeted matte correction — accepted edits

The first green chroma matte removed legitimate green foliage and roller paint
and was rejected. Each accepted subject sheet was edited with the same narrow
instruction:

> Change only the flat green background to a perfectly flat solid #ff00ff
> magenta chroma-key background. Preserve every subject pixel-faithfully in the
> exact positions, sizes, colors, textures, expressions, silhouettes, and grid.
> Especially preserve all green leaves / roller paint. Add nothing; no text.

The built-in local matte still reduced warm colors (for example, the diagnostic
tiger center became alpha 29/255), so those provisional mattes were rejected.
The accepted extraction is Qwen Layered `layer_2`, which preserved the full
opaque color fields and clean white sticker borders.

## Local Qwen Layered prompts

The resumable authoring script is `tools/extract-assets.py`; it takes the local
API URL as an argument and never embeds a LAN address. It submits both accepted
sheets together by workflow type and always downloads `output=layer_2`.

- Stamps: background layer = flat magenta only; top layer = all eight exact
  papercraft sticker subjects together on transparency, preserving every color,
  paper texture, expression, scale, and grid position; no crop, rearrange,
  redraw, merge, add, recolor, or removal.
- Tools: background layer = flat magenta only; top layer = all four exact tool
  groups together on transparency, preserving the blue/coral brush, green
  roller, purple stamp, and yellow/coral notes exactly; no crop, rearrange,
  redraw, merge, add, recolor, or removal.

## QLOBE Studio hub recipe

The exact recipe is `assets/source/hub-tile-krea-42.recipe.json`. Template:
`menu-game-tile`; style: `toy-table`; workflow: `krea2-turbo-t2i`; canvas:
768×640; seed: 42. Subject field:

> A wide roll of warm cream paper covered with one joyful rainbow brush stroke,
> with two chunky child-safe paintbrushes approaching from opposite sides and
> three raised collage-like toy stickers on the mural: a smiling sun, a small
> red rocket, and a friendly leafy tiger. One recognizable collaborative art
> moment, staged as objects only.

Studio appended the proven toy-table suffix from
`shared/data/generate-templates.json`. The staged media object was copied into
this game source tree before hand-curating the catalog JPEG.

## Voice

No recorded voice is shipped in this pass. The complete exact script lives in
`config.json` and `game-design.md`; local Web Speech is the offline primary
fallback. A future rights-cleared teacher-voice batch can replace it without
changing gameplay.
