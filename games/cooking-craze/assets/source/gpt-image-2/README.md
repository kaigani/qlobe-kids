# GPT Image 2 source prompts — Cooking Craze

Tool mode: GPT Image 2 through the Codex imagegen skill. New assets used generation mode; `title-kawaii-v3-blue.png` used edit mode with `title-kawaii-v2-blue.png` as the reference. The three concept mockups in `01-game-concepts/cooking-craze/output/ui-mockups/` were visual references for palette, hierarchy, and required wording.

## Accepted prompt set

### Kitchen

> Create one 4:3 landscape background for a preschool cooking game in polished Kawaii hand-crafted clay/toy style. Use a warm strawberry-pink, vanilla-cream, coral, and cookie-brown palette. Place a rosy brick oven with a friendly orange fire at the upper center and a large pale scalloped work mat across the lower half. Add symmetrical shelves, rounded jars, basil, utensils, gingham details, tiny candy sprinkles, soft diffuse light, and a calm empty central interaction zone. Straight-on camera. No characters, UI, lettering, logos, gradients, or crop. Match the supplied Cooking Craze mockups’ warmth and finish.

### Exact title

> On a perfectly uniform pure chroma-blue `#0000ff` background, create one isolated two-line Kawaii clay/cookie title lockup reading exactly `COOKING` on line one and `CRAZE` on line two. Use large round coral, gold, mint, and pink letters with dark-brown outlines and a cream rim, plus only tiny cheese-star accents. Preserve exact spelling and legibility. No other words, objects, shadows into the border, or crop.

Accepted edit:

> Edit only two letter colors in the supplied title: change the purple `I` in `COOKING` to green and the purple `C` in `CRAZE` to coral-red so blue-key removal cannot damage them. Preserve the exact spelling, letter shapes, outlines, two-line layout, decorations, scale, and pure-blue background. Change nothing else.

### Mascot trio

> On perfectly uniform pure blue `#0000ff`, create three isolated full-body Kawaii hand-crafted clay food mascots: a smiling red tomato on the left, a round pizza chef with a white chef hat in the center, and a smiling yellow cheese star on the right. Tiny arms and feet, large friendly eyes, warm brown outlines, same palette and lighting as the supplied kitchen. Center the trio with generous clear border. No text, extra characters, scenery, or crop.

### UI carriers

Mode card:

> One isolated blank vertical Kawaii recipe card on pure blue `#0000ff`: cream center, pink gingham inset, scalloped cookie edge, warm brown outline, and one tiny cheese-star ornament at the top. No words, icons, food, buttons, or crop.

Action plate:

> One isolated wide horizontal Kawaii action-button plate on pure blue `#0000ff`: coral-red painted center, thick vanilla-cream and golden-cookie rim, warm brown outline, and two tiny cheese-star ornaments. Leave a large calm blank center for HTML text. No lettering, symbols, scenery, or crop.

### Ingredient family

The following template was run once per ingredient (`tomato slice`, `pepperoni disc`, `mushroom slice`, `basil leaf cluster`, `black olive ring`, `yellow cheese star`):

> Create exactly one isolated `[INGREDIENT]` Kawaii clay pizza-topping character on a perfectly uniform pure-blue `#0000ff` background. It must be immediately recognizable from its silhouette, front/top view, with a tiny happy face, warm brown outline, tactile rounded 3D material, and the same lighting and proportions as the supplied Cooking Craze references. No pizza, plate, other food, words, duplicates, scenery, or crop.

### World props

Pizza base:

> One isolated top-down Kawaii pizza base on pure blue `#0000ff`: six equal clearly separated slices, chunky golden crust, clean red sauce rim, smooth pale melted-cheese surface, no toppings, no face, no plate, no text, generous border, no crop.

Dough:

> One isolated top-down round Kawaii dough blob on pure blue `#0000ff`: soft ivory bread dough, flour dust, subtle uneven handmade edge, a few broad finger dimples, no plate, toppings, face, text, or crop.

Peel:

> One isolated top-down wooden pizza peel on pure blue `#0000ff`: rounded paddle, short comfortable handle pointing down, honey-colored hand-crafted wood, warm brown outline, no pizza, food, hands, text, scenery, or crop.

Sauce mark:

> One isolated broad tomato-sauce swirl/dab on pure blue `#0000ff`: glossy coral-red clay sauce, simple rounded spiral smear, readable at small size, no face, plate, pizza, text, extra marks, or crop.

### Dedicated hub tile

> Create a polished landscape catalog illustration for the same Kawaii Cooking Craze world. Show the smiling tomato, pizza-chef, and cheese-star friends presenting a cheerful pizza in front of the warm pink brick oven, with the scalloped work mat and small kitchen details visible. One instantly readable cooking moment, generous safe edges, high contrast at thumbnail size. No title, words, UI, borders, logos, or crop.

### Completion and action pictograms (accepted second art pass)

Completion reward lockup:

> Create one isolated authored two-line lockup reading exactly `PIZZA` on line one and `PERFECT!` on line two, with a coral scalloped celebration backer and exactly three smiling cheese stars. Use a perfectly uniform pure `#0000ff` background and polished Kawaii clay/cookie style. No extra words, objects, or crop.

Replay action:

> Create one isolated circular coral replay arrow wrapping a cheerful six-slice pizza on a perfectly uniform pure `#0000ff` background. No text, extra objects, or crop.

Serve action:

> Create one isolated serving cloche lifted to reveal a happy pizza slice on a plate on a perfectly uniform pure `#0000ff` background. No text, extra objects, or crop.

All three accepted assets used GPT Image 2 generation/create mode. Their exact-blue sources were processed with deterministic key removal.

## Finalization

Every isolated source used a blue key rather than requesting transparency. The accepted files were processed with `remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill`, inspected on contrasting backgrounds, then encoded to WebP. The kitchen and hub tile did not require key removal.
