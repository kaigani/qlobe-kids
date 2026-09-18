# Instrument Detective — final bitmap prompt set

These are the production prompts for the generated raster masters.

## GPT Image 2

**Instrument sheet** (`instrument-sheet.png`, six crops):

> Create a 3 by 2 contact sheet of exactly six separate preschool toy instruments, one centered object per cell: colorful maracas, a small round drum, a hand bell, a tiny upright piano, a friendly acoustic guitar, and a simple recorder flute. Charming tactile painted wood and felt, jewel-tone red/teal/gold/purple, thick warm cream sticker outline, soft hand-painted highlights, consistent scale, front three-quarter view. Deep charcoal background, generous spacing, no overlap, no people, no letters, no logos, no extra instruments.

**Owl pose sheet** (`owl-pose-sheet.png`, four crops):

> Create a 2 by 2 contact sheet of exactly four poses of the same friendly preschool owl detective: listening with one wing to its ear, presenting a clue, celebrating with wings up, and conducting with a tiny baton. Round amber owl, teal detective coat, plum cap, warm cream sticker outline, painted-paper children’s theater style, expressive eyes, consistent character and scale. Deep charcoal background, one full-body pose per cell, no text, no extra characters, no props except the baton in the conducting pose.

**Theater background** (`theater-background.png`):

> Wide 4:3 painted-paper children’s theater at night for a preschool instrument mystery game. Deep plum curtains, teal stage, warm amber footlights, tiny stars and music-note confetti, cozy layered paper texture, open calm center for UI, no characters, no readable text, no logos.

**Finale background** (`finale-background.png`):

> Wide 4:3 joyful preschool concert finale stage in the same painted-paper world: deep plum curtains pulled open, teal and golden stage lights, soft confetti, tiny stars, open center and lower foreground for six toy instruments and a friendly owl, celebratory but uncluttered, no readable text, no logos.

**UI sheet** (`ui-sheet.png`, six cuts):

> Produce a clean contact sheet of exactly six separate raster UI assets for a preschool theater game: three rounded instrument-card plates in green, purple, and blue; one large circular listen button; one wide primary play button; and one rounded progress plaque. Painted paper, thick cream edging, subtle grain, jewel-tone fills, generous separation, no words, no icons, no characters, no extra components, deep charcoal background.

**Title** (`title-source.png`):

> A single playful painted-paper title lockup reading exactly “INSTRUMENT DETECTIVE”, with correct spelling and no other words. Warm cream and golden lettering, plum shadow, tiny music-note accents, friendly preschool mystery theater style, transparent-looking dark charcoal presentation background, wide horizontal composition, no owl, no extra text, no logo mark.

## Krea 2 hub tile

**Seed:** `42`
**Output:** `assets/source/krea2/hub-tile-source.png` → `../../assets/hub/tiles/instrument-detective.jpg`

> Square-ish 640 by 533 game hub illustration for preschoolers: a friendly amber owl detective in a teal coat and plum cap stands on a tiny theater stage surrounded by colorful toy maracas, drum, bell, piano, guitar, and flute. Cozy painted-paper texture, deep plum curtain, teal and golden light, joyful clear silhouette, generous safe margins, no readable text, no logos, no UI.

## Processing note

The source sheets were cut with the repository asset cutter at exact counts 6, 4, 6, and 1. Qwen Image Layered candidates were reviewed but rejected because the instrument pass kept only the drum and owl/title passes were empty. `tools/finalize-assets.py` therefore uses deterministic contiguous-ground mattes and the canonical cutout finalizer; see `assets/source/finalize-report.json` for hashes and QA measurements.
