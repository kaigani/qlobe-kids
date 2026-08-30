# Subtraction Picnic production prompts

All prompts below were run as raster generation. The local concept mockups were
used as composition/style references; no public URL or private LAN address is
part of this record. Runtime art is Storybook/Watercolor. The hub tile is a
deliberate exception because the QLOBE game chooser uses its own Toy Table
visual grammar.

## GPT Image 2 — meadow backdrop

References: `01-story-select.png`, `02-five-take-two.png`.

> Create a premium full-bleed storybook watercolor meadow backdrop for a
> preschool subtraction game, landscape 4:3. Frame the scene with leafy mature
> trees at the far left and right, soft blue sky and white clouds above, distant
> blue-green hills, sunny yellow-green grass, small wildflowers and a few red
> mushrooms at the lower corners. Keep the entire central two-thirds calm,
> open, and empty for live game objects. Warm natural morning light, hand-painted
> watercolor pigment, visible cold-press paper grain, softly feathered edges,
> layered botanical detail at the perimeter, refined children's picture-book
> finish. Match the attached Subtraction Picnic mockups. No characters, food,
> blanket, basket, lettering, numerals, UI, border, watermark, or logo.

Output: `gpt-image-2/meadow-backdrop-master.png`.

## GPT Image 2 — character sheet

References: `01-story-select.png`, `02-five-take-two.png`.

> On one plain dark charcoal production sheet, draw exactly three separate
> full-body friendly forest animals in a cohesive premium watercolor storybook
> style: left, a bright-eyed seated red squirrel with a large curling tail;
> center, a seated warm orange fox with black paws and a cream chest; right, a
> seated cuddly brown bear with visible paw pads. Preschool-safe, joyful, rounded
> silhouettes, expressive large eyes, delicate paper grain and hand-painted
> edges. Match the character world in the references. Generous clear separation
> and padding around each figure; no overlap, ground, props, text, numerals,
> extra animals, watermark, or logo.

Output: `gpt-image-2/characters-master.png`.

## GPT Image 2 — food sheet

References: `02-five-take-two.png`, `03-three-left.png`.

> On one plain dark charcoal production sheet, draw exactly five isolated
> watercolor picnic-food assets in reading order. Top row: one glossy red apple
> with leaf; one ripe strawberry with green cap; one small stack of square
> golden crackers. Bottom row: one purple grape bunch with green leaf; one small
> triangular picnic sandwich with visible bread and simple filling. Cohesive
> hand-painted storybook texture, friendly chunky preschool proportions, each
> object clearly distinct with generous empty space. No plate, scenery, labels,
> numerals, extra food, watermark, or logo.

Output: `gpt-image-2/foods-master.png`.

## GPT Image 2 — scene-prop sheet

References: `01-story-select.png`, `02-five-take-two.png`.

> On one plain dark charcoal production sheet, draw exactly three isolated
> storybook watercolor props from left to right: a wide open cream storybook
> with exactly three blank rounded page panels and teal cover edges; a flat coral
> and cream gingham picnic blanket with small tassels; an open honey-brown woven
> picnic basket with a blue gingham cloth. Premium children's-book watercolor,
> visible paper grain, softly irregular painted edges, generous separation. No
> food, animals, writing, numerals, extra objects, scenery, watermark, or logo.

Output: `gpt-image-2/scene-props-master.png`.

## GPT Image 2 — UI surface sheet

References: all four concept mockups.

> On one plain dark charcoal production sheet, draw exactly five blank authored
> watercolor UI surfaces. Top: one long cream prompt banner framed with rustic
> twigs. Middle: one wide blank stitched cream parchment equation card. Bottom
> row: three separate large rounded stitched answer tiles, left warm yellow,
> center leaf green, right sky blue. Soft storybook paper texture, warm painted
> edges, generous clear space, each component fully visible and separated. No
> letters, numerals, symbols, icons, characters, scenery, watermark, or logo.

Output: `gpt-image-2/ui-surfaces-master.png`.

## GPT Image 2 — title lockup

References: `01-story-select.png`, `characters-master.png`.

> Create one production-ready raster title lockup for a premium preschool
> tablet game, using the attached Subtraction Picnic mockup only as art-direction
> reference. Exact visible wording, spelling, capitalization, and line break:
> `SUBTRACTION` / `PICNIC`. Render only that title lockup, centered.
> “SUBTRACTION” is warm strawberry/coral red hand-painted uppercase lettering;
> “PICNIC” is larger mossy forest-green hand-painted uppercase lettering. Add a
> tiny red apple with green leaf, two delicate green leaf sprigs, and two subtle
> golden dots. Warm watercolor pigment, softly feathered edges and visible paper
> grain, clear at small tablet sizes. Isolated graphic with generous padding; no
> rectangle, scenery, animals, people, UI, watermark, logo, or additional text.

Output: `gpt-image-2/title-lockup-master.png`.

## GPT Image 2 — watercolor HUD and counting pip sheet

References: accepted runtime splash, `ui-surfaces-master.png`, and
`02-five-take-two.png`.

> Create a new production asset sheet for Subtraction Picnic on a uniform
> near-black charcoal background, landscape 3:2. Arrange exactly six isolated
> hand-painted watercolor interface assets in a precise two-by-three grid with
> abundant equal empty space. Top row: an ivory handmade-paper circular HOME
> medallion with a coral cottage; matching BACK medallion with a moss-green left
> arrow; matching SOUND medallion with a sky-blue speaker and exactly two sound
> waves. Bottom row: matching NEXT medallion with a golden right arrow; matching
> REFILL medallion with two teal circular arrows; one standalone, simple,
> golden-green oval leaf/seed counting token without a medallion. Premium
> children’s picture-book watercolor, cold-press paper grain, softly feathered
> pigment edges, strong contrast, chunky symbols legible at small tablet sizes.
> No words, letters, numerals, labels, extra icons, extra dots, scenery,
> characters, food, border, watermark, or logo. Exactly six disconnected
> components.

Output: `gpt-image-2/hud-pips-master.png`. The six components are source-pixel
crops produced by `tools/cut-asset-sheet.py`; the runtime WebPs are finalized by
`tools/process-art.py`.

## Krea 2 — game-chooser tile

Studio template: `menu-game-tile`; style: `toy-table`; workflow:
`krea2-turbo-t2i`; seed: `42`; canvas: 768×640.

> Five chunky red wooden apples arranged on a coral gingham picnic blanket,
> with exactly two apples lifting in a playful arc toward a small woven picnic
> basket beside a friendly toy squirrel. The remaining three apples stay clearly
> grouped on the blanket. One instantly readable preschool
> subtraction-and-sharing moment, staged as a premium toy-table still life, no
> child, no hands, no title, no UI, no numerals.

Studio's proven Toy Table suffix was appended by the template. The accepted
recipe is `krea2/hub-tile-recipe.json`; the accepted source is
`krea2/hub-tile-seed42.png`.

## Local extraction and voice workflows

- Qwen Image Layered prompt pattern and seed attempts are recorded per asset in
  `art-manifest.json`. The fox `layer_2` passed alpha and visual QA. Opaque or
  near-blank Qwen results were retained as rejected evidence rather than forced
  through cleanup; the remaining clean charcoal cuts use the deterministic
  border-connected, source-preserving fallback in `tools/process-art.py`.
- Qwen3 TTS Voice Clone used the approved local teacher reference and the
  finalized 29-line script in `assets/audio/lines.json`. Whisper `base/en`
  transcripts, normalized comparisons, seeds, and pass/fail results are in
  `assets/audio/qa.json`. Private host and voice-reference paths are never
  committed.
