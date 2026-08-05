# Weather Scientist production prompts

These prompts were created from the original Weather Scientist brief and its
Field Journal mockups. GPT Image 2 generated each raster master through the
Codex `imagegen` skill. The source PNGs are retained beside this document.

## Shared visual language

Children's storybook watercolor on warm cold-press paper; blue and turquoise
washes, sunny yellow, leaf green, coral and magenta accents; navy hand-inked
outlines; rounded friendly forms; subtle paper grain; tactile handmade edges;
clear silhouettes at tablet size. Match the source mockups' observatory tower,
meadow, wooden tray, paper cards, and generous open center. No photorealism, no
3D render, no gradients that look digital, no vector-flat icon style.

Reference images:

- `01-game-concepts/weather-scientist/output/ui-mockups/01-title-screen.png`
- `01-game-concepts/weather-scientist/output/ui-mockups/03-rain-and-grow.png`
- `01-game-concepts/weather-scientist/output/ui-mockups/06-success-screen.png`

## Observatory meadow

Create a polished 4:3 children's storybook watercolor game background for
“Weather Scientist.” Show a cheerful hilltop weather observatory with a small
white dome and telescope on the left, a broad rolling green meadow, blue distant
hills, warm wildflowers near the edges, a large leafy tree on the right, and a
soft blue watercolor sky. Preserve a wide uncluttered center foreground for an
interactive flower and a wide open upper sky for weather layers. The scene must
feel complete but must contain no title, labels, cards, controls, characters,
sun, cloud, rain, rainbow, or UI. Full bleed, 4:3, clean readable depth, premium
children's picture-book finish.

Imagegen output: `exec-9e8a6989-4448-428f-9369-0e68e712d898.png`.

## Exact title lockup

Create one centered two-line watercolor title reading exactly “Weather
Scientist”, with “Weather” above “Scientist”. Friendly chunky navy hand-lettered
forms, cream paper inset, sunny yellow and coral/magenta painted accents, subtle
blue watercolor shadow, and generous clear space around the full lockup. Match
the Field Journal mockup. No additional words, icons, watermark, border crop, or
misspelling. The title must remain readable at small tablet sizes.

Imagegen output: `exec-0bdc8410-9c6e-448c-97af-6d143120864f.png`.

## World production sheet

Create a strict 4×4 sprite production sheet. One isolated watercolor object per
equal cell, centered with generous clearance, matching scale and viewpoint,
cream paper only behind the sheet, no labels, captions, dividers, shadows that
cross cells, or extra objects. Cell order, left-to-right and top-to-bottom:

1. large leafy meadow tree
2. tiny green flower seedling
3. closed flower bud
4. open coral-and-yellow flower bloom
5. friendly golden sun
6. soft white cloud
7. blue rain cloud with raindrops
8. bright watercolor rainbow
9. shallow blue puddle
10. soft cool-blue shade patch
11. single blue raindrop
12. single fresh green leaf
13. single golden-yellow leaf
14. single coral-red leaf
15. pale blue wind curl
16. small golden sparkle

Every silhouette must be complete and separable, with no text or watermark.

Imagegen output: `exec-fbef9f98-4310-4f4f-9de8-36cbd07a02cf.png`.

## UI production sheet

Create a strict 4×4 sprite production sheet of tactile watercolor-and-paper UI.
One isolated object per equal cell, centered with clearance; cream paper behind
the sheet; no labels, letters, numbers, captions, cell dividers, cursor, or
watermark. Cell order, left-to-right and top-to-bottom:

1. tall paper Sun control card
2. tall paper Wind control card with blue curls and one leaf
3. tall paper Cloud control card
4. tall paper Rain control card
5. round Sun discovery badge
6. round Wind discovery badge
7. round Cloud discovery badge
8. round Rain discovery badge
9. wide shallow wooden control tray
10. wide blank scalloped cream prompt banner
11. horizontal blue-inset wooden slider track
12. round golden wind knob with blue wind curls
13. blank wide sunny-yellow action button carrier
14. blank wide sky-blue action button carrier
15. round cream reset button with navy reset arrow
16. blank navy watercolor progress ribbon

All UI must share the mockups' warm paper grain, navy ink, rounded corners, and
handmade watercolor edge treatment. Blank carriers must remain blank for exact
runtime HTML text.

Imagegen output: `exec-6ee0b74d-4ed5-426f-91f9-bb6a20ff6057.png`.

## Catalog tile

Create a polished square catalog tile using the production meadow and world
sheet as strict references. Compose a close watercolor Field Journal emblem:
the teal-domed observatory on its hill in the background, with the friendly
golden sun, soft white cloud, three blue raindrops, curling wind, green leaves,
and the game flower forming a balanced foreground wreath. Preserve comfortable
margins and strong contrast at 240 px. No words, letters, numbers, title,
border, watermark, glossy 3D, clay, photorealism, or vector-flat style.

Imagegen output: `exec-8f2bbbd3-114c-4f63-a6c7-de432f946b25.png`.

## Semantic layer extraction

The three alpha-bearing masters were processed with the local Qwen Image
Layered workflow as semantic foreground extraction jobs:

- title: `5f0a4d819cc1`
- world sheet: `6c42d4ff30c7`
- UI sheet: `c36179a8d9fd`

`tools/process-art.py` is the canonical semantic-region mapping and finalizer.
The generated paper cards overhang equal mathematical cells, so explicit
regions retain each whole object without pulling in its neighbor. The script
guarantees an internal transparent border, preserves the flower baseline,
produces the runtime WebPs, and writes full-size magenta inspection images and
numeric QA.

## Splash/home background

The scene-chooser splash needed its own backdrop distinct from any single
destination scene — a "home base" the child sees before picking a place.
Generated via `krea2-turbo-t2i`, wide 3:2:

> A polished children's storybook watercolor game background for Weather
> Scientist, wide 3:2 panoramic composition, home/menu screen. Show a
> cheerful weather observatory with a glowing lit window on a small hill at
> dusk, telescope pointed at a soft twilight sky filled with gentle stars and
> a friendly crescent moon, soft rolling hills in silhouette below, a few
> wildflowers and tall grass at the base of the hill. Keep the upper third and
> the lower two-thirds calm, open, and uncluttered with soft gradient sky and
> gentle ground so a title and a row of picture cards can sit on top and stay
> readable. The scene must feel complete but must contain no title, labels,
> cards, buttons, characters, sun, cloud, rain, rainbow, or UI. Full bleed,
> clean readable depth, premium children's picture-book finish, deep blue and
> violet twilight washes, warm golden window glow, soft starlight, navy
> hand-inked outlines, rounded friendly forms, subtle paper grain, tactile
> handmade edges. No photorealism, no 3D render, no vector-flat icon style.

`width=1536 height=1024 seed=42 steps=8`. Output:
`assets/source/krea2/splash-background-wide.png`. The observatory/telescope
still reads large at some viewport crops (especially portrait), so the splash
also composites a CSS gradient veil (`.splash-veil`) over the title/tagline
band for guaranteed contrast rather than depending on exact art placement.

## Meadow background regeneration (wide 3:2)

The original 4:3 meadow background above was authored to be letterboxed at
non-4:3 aspect ratios. It was regenerated at a wide 3:2 working ratio via the
LAN `krea2-turbo-t2i` workflow so the full-bleed `.weather-stage` (`object-fit:
cover`, no letterbox) crops gracefully at any device ratio:

> A polished children's storybook watercolor game background for Weather
> Scientist, wide 3:2 panoramic composition. Show a cheerful hilltop weather
> observatory with a small white dome and telescope on the left, a broad
> rolling green meadow, blue distant hills, warm wildflowers near the edges, a
> large leafy tree on the right, and a soft blue watercolor sky with generous
> open space above. Preserve a wide uncluttered center foreground for an
> interactive flower and a wide open upper sky for weather layers, with
> comfortable side margins on both left and right so the scene still reads
> well when cropped narrower. The scene must feel complete but must contain no
> title, labels, cards, controls, characters, sun, cloud, rain, rainbow, or
> UI. Full bleed, clean readable depth, premium children's picture-book
> finish, blue and turquoise washes, sunny yellow, leaf green, coral and
> magenta accents, navy hand-inked outlines, rounded friendly forms, subtle
> paper grain, tactile handmade edges. No photorealism, no 3D render, no
> vector-flat icon style.

`width=1536 height=1024 seed=42 steps=8`. Output:
`assets/source/krea2/observatory-meadow-wide.png`.

## Desert scene (background + world sheet)

Background prompt (same structure as the meadow's, desert-specific content):

> A polished children's storybook watercolor game background for Weather
> Scientist, wide 3:2 panoramic composition. Show a cheerful hilltop weather
> observatory with a small white dome and telescope on the left, sitting on a
> warm sandy desert ridge, with distant tan and rust-colored mesas, scattered
> paddle cacti and desert wildflowers near the edges, a cluster of tall rock
> spires on the right, and a soft warm blue watercolor sky with generous open
> space above. Preserve a wide uncluttered center foreground for an
> interactive cactus and a wide open upper sky for weather layers, with
> comfortable side margins on both left and right so the scene still reads
> well when cropped narrower. The scene must feel complete but must contain no
> title, labels, cards, controls, characters, sun, cloud, rain, rainbow, or
> UI. Full bleed, clean readable depth, premium children's picture-book
> finish, warm sandy gold and terracotta washes, sunny yellow, turquoise sky
> accents, navy hand-inked outlines, rounded friendly forms, subtle paper
> grain, tactile handmade edges. No photorealism, no 3D render, no vector-flat
> icon style.

World-sheet prompt (4×4 grid, cell order matches `WORLD_BOXES`: landmark,
growth seedling/bud/bloom, sun, cloud, rain-cloud, rainbow, puddle, shade,
raindrop, 3 debris particles, wind-curl, sparkle):

> Create a strict 4x4 sprite production sheet in a children's storybook
> watercolor style, blue and turquoise washes, sunny yellow, coral and magenta
> accents, navy hand-inked outlines, rounded friendly forms, subtle paper
> grain, tactile handmade edges. One isolated watercolor object per equal
> cell, centered with generous clearance, matching scale and viewpoint, cream
> paper only behind the sheet, no labels, captions, dividers, shadows that
> cross cells, or extra objects. Cell order, left-to-right and top-to-bottom:
> 1. a cluster of tall desert rock spires (landmark). 2. a tiny green
> paddle-cactus seedling sprouting from sand. 3. a small paddle cactus with a
> closed pink flower bud. 4. a paddle cactus with a bright open pink-and-yellow
> flower bloom. 5. a friendly golden-orange desert sun with heat shimmer. 6. a
> soft white cloud. 7. a rare gray-blue rain cloud with a few raindrops. 8. a
> bright watercolor rainbow. 9. a small dark wet-sand patch. 10. a cool
> blue-gray shade patch on sand. 11. a single blue raindrop. 12. a single
> swirling sand grain cluster in gold. 13. a second swirling sand grain
> cluster in tan. 14. a third swirling sand grain cluster in warm brown. 15. a
> pale golden wind curl. 16. a small golden sparkle. Every silhouette must be
> complete and separable, with no text or watermark.

Both `width=1536 height=1024` (background) / `width=1024 height=1024` (world
sheet), `seed=42 steps=8`. Extraction prompt described all 16 subjects
explicitly (see `tools/process-art.py`'s `CELL_REMAP` for the one cell-order
correction needed). Outputs: `assets/source/krea2/desert-background-wide.png`,
`assets/source/krea2/desert-world-kit-flat.png` (pre-extraction),
`assets/source/qwen-layered/desert-world-kit.png` (alpha).

## Arctic scene (background + world sheet)

Background: same structure, "sitting on a snowy tundra ridge, with distant
icy blue-white mountains, sparkling snowdrifts and frost-tipped grasses near
the edges, a tall sculpted ice formation on the right"; palette "icy blue and
white washes, pale turquoise, soft lavender accents". World sheet cells: ice
formation (landmark), ice-crystal seedling, frost-flower bud, frost-flower
bloom, pale sun, soft cloud, gray snow cloud with snowflakes, rainbow, blue
ice-melt puddle, blue-gray shade patch, raindrop, three snowflake-cluster
particles (white/pale-blue/silver), wind curl, sparkle. No cell-order
correction needed — every cell landed in its prompted position. Outputs:
`assets/source/krea2/arctic-background-wide.png`,
`assets/source/krea2/arctic-world-kit-flat.png`,
`assets/source/qwen-layered/arctic-world-kit.png`.

## Rainforest scene (background + world sheet)

Background: same structure, "nestled at the edge of a lush green rainforest
clearing, with dense green jungle canopy and distant misty green hills,
colorful tropical flowers and broad leaves near the edges, a tall leafy jungle
tree with hanging vines on the right"; palette "deep green and turquoise
washes, warm coral and magenta tropical accents". World sheet cells: jungle
tree with vines (landmark), orchid seedling, orchid bud, orchid bloom, golden
sun (rendered by the model as sun-behind-leaves — kept, it reads well against
the "sunbeams break through the canopy" narration), soft cloud, dark
green rain cloud with raindrops, rainbow, blue rain puddle, green-gray misty
shade patch, raindrop, three leaf-cluster particles (green/dark-green/yellow-
green), wind curl, sparkle. Cell-order correction needed: sun/cloud swapped,
and puddle/shade/raindrop/leaf1 rotated by one position — see
`tools/process-art.py`'s `CELL_REMAP`. Outputs:
`assets/source/krea2/rainforest-background-wide.png`,
`assets/source/krea2/rainforest-world-kit-flat.png`,
`assets/source/qwen-layered/rainforest-world-kit.png`.
