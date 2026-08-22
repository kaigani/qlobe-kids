# Board Game Reset Ritual — frozen image prompt set

Created 2026-08-22. The concept mockups in
`01-game-concepts/board-game-reset-ritual/output/ui-mockups/` were supplied as
visual references to GPT Image 2. Every generation requested premium,
handcrafted **Toy** art, preschool-safe rounded forms, tactile carved wood and
linen, coherent coral/teal/mustard/plum color, no watermark, and no device
frame.

## GPT Image 2 — accepted production sources

### Board master

> Create a polished 4:3 landscape game-board scene for a premium preschool
> tablet game. On a warm honey-oak table lies oatmeal linen and one winding
> path of exactly ten large chunky wooden stepping tiles. Arrange the path from
> lower left, up around the top, and down toward a clear finish star at lower
> right. Use coral, teal, mustard, plum, sky blue, and soft green. Keep a broad
> clear middle for a spinner and safe UI. Miniature handcrafted Toy-world
> photography, rounded bevels, visible wood grain, warm studio light, crop-safe
> edges. No characters, pawns, dice, text, letters, numbers, UI, border, hands,
> or watermark.

Output: `gpt-image-2-board-master.png`; promoted to
`assets/world/board-table.webp`.

### Splash/ritual clean plate

> Create a clean 4:3 Toy-world tabletop stage matching the board master: honey
> oak, oatmeal linen, a broad empty oval clearing, a partial colorful wooden
> path framing the outer edge, tiny clay flowers and rounded bushes only at
> crop-safe edges, warm golden morning light and tactile carved materials.
> Reserve the upper center for a title and the lower center for two characters.
> No characters, animals, spinner, loose game pieces, text, letters, numbers,
> logos, UI, hands, border, or watermark.

Output: `gpt-image-2-splash-master.png`; promoted to both clean world plates.

### Exact title lockup

> Isolated handcrafted wooden title sign on a perfectly flat chroma-green
> background. Spell exactly, on two centered lines: “BOARD GAME” and “RESET
> RITUAL”. Chunky individually carved uppercase letters, navy first line,
> coral/mustard/green/teal/plum second line, inset into a light maple plaque
> with a tiny star and two leaves. Straight-on, centered, generous clearance,
> no other words or marks, no shadows beyond the object, no border or
> watermark.

Output: `gpt-image-2-title-green.png`; exact spelling inspected at full size,
then chroma-keyed to `assets/ui/title.webp`.

### Biscuit and Miso identity sheet

> A precise 3×2 production contact sheet on perfectly flat chroma green, equal
> cells and generous separation. Biscuit is a seated honey-brown carved wooden
> puppy with floppy dark ears, cream muzzle and blaze, big dark eyes, blue
> collar, round gold tag. Miso is a seated coral-pink carved wooden kitten with
> darker forehead stripes, cream muzzle and chest, big dark eyes, purple
> collar, gold tag. Cells: Biscuit happy; Biscuit disappointed with gentle
> brows; Miso encouraging; Biscuit and Miso cozy side hug; friends joyful high
> five; two separate round wooden portrait pawns. Preserve exact identity,
> proportions, grain, lighting, and camera. No text, labels, dividers, overlap,
> extra limbs, UI, border, or watermark.

Output: `gpt-image-2-characters-green.png`; keyed and sliced into the shipped
character and pawn assets.

### Ritual prop sheet

> A precise 3×3 isolated Toy-world prop sheet on perfectly flat chroma green,
> equal cells and wide separation. Top row: six-segment carved wooden spinner
> with pointer; teal wooden play medallion with cream triangle and tiny hearts;
> blank wide light-maple prompt plaque. Middle: smiling cream breathing cloud
> with three soft teal wind curls; empty round woven wooden basket; teal reward
> medallion holding one mustard star and one coral heart. Bottom: one coral
> heart, one mustard star, one plum five-petal flower. Straight-on three-quarter
> toy photography, same warm light and wood texture, full objects. No text,
> labels, numbers, symbols other than the requested play triangle/star/heart,
> dividers, UI, border, or watermark.

Output: `gpt-image-2-props-green.png`; keyed and sliced into all shipped UI and
loose-piece assets.

### Responsive Toy-world extensions

The accepted `ritual-table.webp` plate was supplied back to GPT Image 2 as the
material and lighting reference for two background-only outpaints. The portrait
prompt requested a single 3:4 honey-oak tabletop field with a low classroom
cubby at the far top, restrained wooden flowers and felt bushes at crop-safe
corners, and a completely calm center. The ultra-wide prompt requested the same
field at 21:9 with cubby edges and sparse toy flora only at the far left and
right. Both explicitly prohibited boards, paths, characters, pawns, spinner,
basket, loose pieces, labels, text, UI, seams, and duplicate clusters.

Outputs: `gpt-image-2-responsive-portrait.png` and
`gpt-image-2-responsive-wide.png`; promoted to responsive WebP environment
extensions after inspection for empty interaction-safe centers.

## Krea 2 — accepted shipped base

Workflow `krea2-turbo-t2i`, seed 42, 768×640:

> QLOBE Kids catalog tile background, Toy art world, an inviting handcrafted
> miniature board game set on warm oatmeal linen atop a honey oak play table, a
> winding oval path of chunky coral teal mustard plum and sky-blue wooden
> tiles, tiny woven basket and colorful loose wooden pieces, cozy golden
> morning light, tactile carved wood grain, polished preschool toy photography,
> generous clear central play area and crop-safe edges, absolutely no people,
> no animals, no characters, no hands, no words, no letters, no numbers, no
> logos, no UI, no border, no watermark, no cropped objects.

Output: `krea2-hub-base-seed42.png`; passed and composited with the accepted GPT
friends and spinner to make the shipped 640×533 hub tile.

## Qwen local API studies

### Qwen Image Edit

The clean ritual-table reference was edited with the instruction to add a
small emotional-reset tableau while preserving the exact linen, oak, palette,
camera, and crop. The returned source (`qwen-edit-ritual-master.png`) invented
baked-in cloud, basket, and dice-like pieces that would duplicate interactive
objects, so it was rejected.

### Qwen Image Layered

Workflow `qwen-image-layered`, seed 42, requested three layers:

> Separate the complete character artwork from the plain background. Preserve
> every full puppy, kitten, paired pose, and round pawn exactly, including wood
> grain, ears, tails, collars, tags, eyes, and contact shadows. Put all
> character art together on the transparent foreground layer; no redraw, no
> cropping, no text.

Job `b3ab3cd8a67e402cb8d30cd6fe8efda0` completed. All three outputs are retained;
the foreground separation kept a dark matte and therefore did not supersede
the cleaner deterministic chroma cutouts.

## Deterministic finalization

The green sheets were processed with the imagegen skill’s
`remove_chroma_key.py`, then fixed-grid cropped and encoded with WebP. Hub and
OG images are local raster composites. No generative edit was applied after
the spelling and character-identity approval gates.
