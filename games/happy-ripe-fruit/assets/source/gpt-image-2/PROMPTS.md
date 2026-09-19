# GPT Image 2 production prompts

All GPT Image 2 work used the built-in image generation path because the local
CLI environment did not expose an Image API key. Final project assets are
copied into this source folder before deterministic processing. The concept
video contact sheet is a loose layout/mood reference only.

## Orchard environment

**Generated output:** `exec-312ab110-8819-4d9c-8003-ef33814170c7.png`

```text
Use case: stylized-concept
Asset type: 4:3 tablet game environment plate for a premium preschool game
Input image 1: loose composition and cheerful orchard reference only; do not
copy its device frame, hands, UI, or flat-vector rendering
Primary request: create a magical sunny fruit garden named Happy Ripe Fruit,
designed as a full-bleed 4:3 play background with a broad clear central lawn
where interactive fruit plants will be composited at runtime
Scene/backdrop: layered rolling orchard hills, rounded leafy hedges, tiny white
and golden flowers, distant apple and lemon trees, soft blue sky with puffy
clouds, warm earth patches near the lower edge, subtle winding path
Style/medium: canonical Kawaii art world rendered as original tactile raster
art; hand-painted gouache textures combined with soft hand-sculpted clay depth,
puffy cream edge highlights, slightly imperfect handmade surfaces, premium
preschool game finish
Composition/framing: straight-on tablet game view, 4:3 landscape, horizon in
the upper third, open uncluttered center and lower-middle play area, decorative
foliage only around the edges, safe empty corners for HUD controls
Lighting/mood: luminous spring morning, warm friendly sunlight, gentle depth
Color palette: fresh leaf greens, lime and sage, sky blue, honey yellow,
strawberry coral, warm cream, cocoa outlines; high legibility without neon
Constraints: raster illustration; no text, letters, numbers, fruit faces,
characters, basket, UI, buttons, icons, device, hands, watermark, logo, border,
or frame; no important object touching canvas edge; no baked shadows where
runtime fruit will appear
Avoid: generic flat vector art, glossy mobile-app gradients, photorealism,
clutter, dark mood, high-frequency detail
```

## Fruit-stage sheet

**Generated output:** `exec-06eca308-f6f8-4731-85e2-49e3fd5a2285.png`

```text
Use case: production sprite sheet for a premium preschool comparison game.
Create exactly 18 isolated full-body Kawaii fruit characters in a precise 6
column by 3 row contact sheet. Columns, left to right: strawberry, banana,
apple, lemon, cherry pair, pear. Rows, top to bottom: early/underripe,
ripe/just-right, late/overripe. Keep every object separate with generous clear
space and no touching or overlap. The ripe row is cheerful and luminous;
early fruit uses naturally pale/green color and firmer shape; late fruit uses
gentle dulling, spots, wrinkles, or soft shape without looking rotten or scary.
Every stage must be distinguishable from natural color, shape, sheen, and
texture even if the face is ignored. Canonical tactile gouache-and-soft-clay
raster style, cocoa outlines, puffy cream highlights, handmade surface,
consistent front three-quarter lighting and scale. True transparent background.
No text, labels, grid lines, captions, basket, plant, UI, extra fruit,
duplicates, cast shadow joining two assets, watermark, border, flat vector art,
or photorealism.
```

## Fruitless plant sheet

**Generated output:** `exec-2b0480b8-d813-4bbb-926e-6bf18deb4f81.png`

```text
Use case: production plant-sprite sheet matching the accepted Happy Ripe Fruit
characters. Create exactly six isolated fruitless plants in a precise 3 column
by 2 row sheet. Reading order: strawberry patch, banana plant, apple sapling,
lemon sapling, cherry sapling, pear sapling. Each plant has exactly three clear
fruit attachment stems or nubs arranged for large character sprites, healthy
distinctive leaves, a small soil base, and no fruit. Match the canonical
tactile gouache-and-soft-clay raster world: cocoa outlines, cream rim light,
soft handmade depth, luminous spring palette, same camera and lighting as the
fruit sheet. True transparent background with wide gutters. No text, labels,
pots, basket, tools, characters, fruit, flowers that resemble fruit, touching
components, watermark, frame, flat vector style, or photorealism.
```

## Basket and UI prop sheet

**Generated output:** `exec-c2a2903f-885a-4d72-85a4-ed7bfb9ef947.png`

```text
Use case: production raster UI-prop sheet for Happy Ripe Fruit. Create exactly
eight isolated assets in a precise 4 column by 2 row grid, reading order: large
empty woven harvest basket; leafy gold-star badge medallion; soft sleeping-leaf
locked ribbon; six-star leafy reward wreath; early-stage leaf token;
ripe-stage sunny flower token; late-stage brown leaf token; wide cream prompt
plaque framed by green leaves with one coral flower and one yellow flower.
Canonical tactile gouache plus soft hand-sculpted clay, cocoa outlines, puffy
cream highlights, warm friendly lighting, consistent material scale. True
transparent background, generous clear gutter around every component. The
plaque must have a clean blank center. No text, letters, numbers, fruit,
characters, padlock, overlap, shared shadow, grid line, watermark, frame,
flat-vector rendering, or photorealism.
```

## Title lockup

**Generated output:** `exec-3e31ae69-6f83-439d-9ad1-5a9f21ee47d7.png`

```text
Create one isolated premium preschool game title lockup with the exact words
HAPPY RIPE FRUIT, stacked as exactly three centered lines: HAPPY / RIPE /
FRUIT. Preserve that spelling and do not add any other letter or word. Chunky
handmade soft-clay letters with tactile gouache grain, cocoa outer outline,
cream inner highlight, tiny leaves, daisies, and a few seed-like sparkles.
HAPPY is honey yellow, RIPE is strawberry coral, FRUIT alternates fresh green,
sky blue, golden yellow, coral, and green while remaining highly readable.
Joyful Kawaii orchard art direction, straight-on, compact silhouette, true
transparent background and safe padding. No subtitle, banner, fruit character,
device, UI button, watermark, border, flat vector style, or photorealism.
```

## Hub tile refinement

The authorized LAN Krea 2 recipe and rejected composition exploration are
retained under `../local-api/hub/`. Krea established a useful central-basket
composition, but its candidate contained background fruit and did not fully
match the accepted tactile runtime style. GPT Image 2 refined it using the
accepted fruit sheet and orchard as style references.

**First refinement:** `exec-c242ff22-bb92-4980-94cc-83d440488f0f.png`
**Accepted cleanup:** `exec-63dd7e59-a3b1-40bd-9f23-1990d6bdb6f3.png`

```text
Use case: production game hub tile refinement. Create one polished 6:5
landscape raster illustration for a premium preschool game named Happy Ripe
Fruit. Use the Krea candidate only for the central basket composition, the
accepted fruit-stage sheet as the exact canonical tactile gouache-and-soft-clay
character style, and the accepted orchard as the canonical palette and
lighting. Show exactly these six fruit groups and no others: one red ripe
strawberry, one golden ripe banana bunch, one bright ripe red apple, one sunny
ripe yellow lemon, one glossy ruby cherry pair, and one plump golden-green pear.
Arrange the six smiling fruit friends popping from one large woven basket at
the center, clearly separated and instantly countable. Surround them with a
softly painted sunny orchard, rounded foliage, tiny flowers, and a warm cream
clearing. Premium handmade tactile raster art, cocoa outlines, puffy cream edge
lights, soft clay depth, subtle gouache texture, joyful expressions, high
legibility at thumbnail size. Keep every face and fruit in a generous safe
area. No text, letters, logo, UI, device, hands, border, watermark, extra fruit,
background fruit, cut-off fruit, duplicates, flat vector style, or photorealism.
```

Cleanup edit:

```text
Preserve the central basket, its handle, all six exact fruit groups, their
expressions, positions, lighting, tactile rendering, flowers, sky, hills, and
composition. Remove every background fruit from the orchard trees and replace
it naturally with leafy green foliage. Do not add, remove, duplicate, crop,
recolor, or reshape anything in the basket. The basket must still contain
exactly one strawberry, one banana bunch, one apple, one lemon, one cherry
pair, and one pear. No text, letters, logo, UI, watermark, border, device,
hands, or fruit outside the basket.
```

`process-assets.py` center-crops the accepted source to the 640x533 hub tile
and 1200x630 social image and records source hashes in `processing.json`.
