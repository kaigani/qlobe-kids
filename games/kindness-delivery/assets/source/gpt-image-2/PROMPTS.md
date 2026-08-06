# Kindness Delivery — GPT Image 2 production prompts

Generated on 2026-08-06 with Codex's built-in `imagegen` tool using OpenAI
GPT Image 2. The four accepted Krea 2 concepts in
`../concepts/krea2/` were the visual references for every production image.
All outputs use the same Paper Garden direction: layered construction paper,
deckled cardstock, stitched edges, visible fibers, hand-cut silhouettes, warm
physical shadows, and a sky/leaf/cream/coral/marigold/navy palette.

## Clean 4:3 scene plates

The accepted Krea screen was supplied as the edit reference for each prompt.

### Friend-select meadow

> Convert this accepted concept into a clean reusable 4:3 production
> background plate. Preserve the exact tactile layered-papercraft materials,
> sunny blue sky, rolling green hills, stitched clouds, flowers, palette,
> lighting, and gentle depth. Remove all three characters, their card frames,
> title-like shapes, controls, and stray concentric circles. Reconstruct the
> meadow naturally behind them. Keep generous calm open sky and middle space,
> with the top-left and bottom-left corners clear. No text, letters, logo,
> watermark, UI, character, animal, card, airplane, or mailbox.

`splash-meadow-v1.png` was reviewed, then the same instruction was tightened
to remove residual card-like vertical shapes; the accepted plate is
`splash-meadow.png`.

### Note studio

> Convert this accepted concept into a clean reusable 4:3 top-down craft-table
> plate. Preserve the warm honey paper-wood grain, torn colored-paper corners,
> tiny flowers, stitched/deckled detail, fibers, and soft shadows. Keep one very
> large completely blank cream note centered in the same calm rectangle.
> Remove every crayon, stamp, sticker, tray tool, paper-plane control, symbol,
> and stray circular mark; reconstruct the tabletop naturally. No text,
> letters, logo, watermark, UI, characters, or marks on the note.

### Flight sky

> Convert this accepted concept into a clean reusable 4:3 flight background
> plate. Preserve the open blue paper sky, stitched layered clouds, distant
> rolling meadow, tiny welcoming mailbox at far right, paper fibers, and soft
> layer shadows. Remove the paper plane, flight path, hearts, controls, and
> stray circles. Keep the entire central flight lane open, especially the
> lower-left start area. No text, letters, logo, watermark, UI, character, or
> vehicle.

### Delivery meadow

> Convert this accepted concept into a clean reusable 4:3 celebration
> background plate. Preserve the sunny layered-paper meadow, large soft heart
> halo, flowers, small decorative hearts and sparkles around the perimeter,
> fibers, stitching, palette, and shadows. Remove the bunny, held note,
> airplane, button, controls, and stray circles, reconstructing the meadow
> naturally. Leave a calm centered character area, clear top-center heading
> space, clear bottom-right action space, and clear HUD corners. No text,
> letters, logo, watermark, UI, character, animal, note, or airplane.

## Character contact sheet

> Match the accepted layered-papercraft concepts exactly. Create an exact 3×2
> contact sheet on one perfectly flat solid `#00ff00` background, with equal
> cells and generous empty separation. Reading order: top row — cheerful orange
> fox standing and waving, cream bunny standing with paws open, warm brown bear
> standing with one paw raised; bottom row — the same fox overjoyed and holding
> an open cream kindness note, the same bunny delighted and holding an open
> cream note, the same bear warmly moved and holding an open cream note. Full
> bodies, front three-quarter view, consistent scale and construction, hand-cut
> cardstock/felt, visible paper fibers, stitched details, simple friendly faces,
> soft internal layer shadows only. No card frames, floor, cast shadow, scenery,
> text, labels, grid lines, logo, watermark, cropping, or extra objects.

Accepted source: `characters/character-sheet-green.png`.

## Prop contact sheet

> Match the accepted Paper Garden style. Create an exact 4×4 contact sheet on a
> perfectly flat solid `#00ff00` background, equal square cells, one complete
> centered object per cell, generous separation. Reading order: chunky red
> crayon tool, wooden sun-stamp tool, puffy heart-sticker tool, cream folded
> paper airplane; smiling sun stamp, coral heart stamp, growing flower stamp,
> marigold star stamp; rainbow sticker, heart-envelope sticker, sparkle-star
> sticker, white daisy sticker; curved undo arrow made from paper, friendly
> eraser, restore arrow, large folded-plane send button. Tactile layered paper,
> felt and light wood, fibers, hand-cut edges, stitched details, consistent soft
> internal shadows. No floor, cast shadow, scenery, text, labels, grid lines,
> logo, watermark, cropping, duplicate objects, or characters.

Accepted source: `props/prop-sheet-green.png`.

## Friend-card frames

> Create an exact three-column contact sheet on flat solid `#00ff00`, with three
> empty oversized handmade portrait card frames: coral fox frame, marigold bunny
> frame, sky-blue bear frame. Match the accepted layered construction-paper
> world: deckled rounded edges, stitched inner borders, tiny unique leaf/flower/
> heart decorations, paper fibers, soft internal layer shadows. Keep every
> center fully empty and transparent-ready for a separate character sprite.
> Equal scale and padding. No characters, words, letters, symbols, floor, cast
> shadow, scenery, grid lines, logo, watermark, or cropping.

Accepted source: `frames/friend-frames-green.png`.

## Title lockup

> Isolate and refine a single handmade layered-paper title lockup spelling
> exactly “KINDNESS DELIVERY” in two centered lines. Keep the friendly rounded
> coral and marigold cut-paper lettering, cream edge layers, tiny stitched
> accents, subtle paper fibers, and soft internal depth from the accepted
> concept. Put only the title on a perfectly flat solid `#00ff00` background
> with generous padding. No other words, wrong letters, scenery, characters,
> cards, UI, logo, watermark, or cast shadow outside the title.

Accepted source: `title/title-green.png`.

## Extraction and QA

The green sheets were converted to alpha with the installed image-generation
skill's chroma-key helper, split on the declared fixed grid, trimmed/padded, and
reviewed against magenta (`qa-magenta/`). Runtime copies were resized and
encoded as transparent WebP. The source sheets, alpha intermediates, crops, and
edge-QA images remain alongside this file.
