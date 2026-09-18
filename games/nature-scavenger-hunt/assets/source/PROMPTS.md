# Nature Scavenger Hunt prompt record

The five game masters were created with **gpt-image-2 through Codex's built-in
image generation tool**. The concept's overview, quest, clue, and completion
mockups were supplied as visual references; `brief.md` supplied the Claymation
art world. These are raster production assets, not CSS or vector stand-ins.

## GPT image masters

### Forest playfield

Output: `gpt-image-2/forest-background-master.png`

> Create a 4:3 premium preschool-game background in a warm handmade
> polymer-clay / Claymation style, following the supplied Nature Scavenger
> Hunt mockups: a magical sunlit forest clearing with rounded tree trunks,
> layered moss, broad leaves, tiny flowers and a winding soft path. Keep the
> middle calm and open for a large quest card. Rich tactile fingerprints,
> shallow depth of field, warm morning light, friendly and adventurous. No
> character, no UI, no signs, no letters, no text. Full-bleed scene.

### Interface asset sheet

Output: `gpt-image-2/clay-ui-sheet.png`

> Create one clean Claymation interface asset sheet on a perfectly flat solid
> #20252b background. Arrange exactly six isolated assets in a strict 3 by 2
> grid, generous separation, nothing touching: (1) a tall blank tan clipboard
> with a gray clay clip, (2) a blank cream mission plaque with a green clay
> rim, (3) a blank chunky green action-button plaque, (4) a blank cream quest
> card with a brown rim, (5) a green circular clay check badge, and (6) a
> complete golden found-object halo ring with eight rays. Match the supplied
> warm premium preschool Claymation mockups. Front-facing, consistent soft
> lighting, clean silhouettes. No words, letters, icons, labels, watermark,
> extra objects, or scene background.

### Nature treasure asset sheet

Output: `gpt-image-2/clay-treasure-sheet.png`

> Create one clean Claymation nature-object asset sheet on a perfectly flat
> solid #20252b background. Arrange exactly twelve isolated objects in a strict
> 4 by 3 grid, one centered object per cell with generous separation: bright
> green leaf, smooth gray stone, red berries, blue dewdrop, yellow flower,
> brown pinecone, soft feather, forked twig, golden acorn, red-capped mushroom,
> spiral shell, paired winged seed. Friendly handmade polymer clay, tactile
> fingerprints, rounded preschool proportions, consistent three-quarter
> lighting and scale. No words, letters, labels, watermark, extra objects,
> ground plane, or scene background.

### Hedgehog guide

Output: `gpt-image-2/hedgehog-guide-master.png`

> Re-create the same friendly round Claymation hedgehog guide shown in the
> supplied quest-complete mockup: full body, waving, happy open smile, warm
> cream face and belly, soft brown clay spines, rosy cheeks, large readable
> eyes, simple child-safe silhouette. Isolate the single character on a
> perfectly flat solid #20252b background with breathing room around every
> limb. No clipboard, props, clothing, words, letters, watermark, shadowy
> scene, or extra character.

### Title lockup

Output: `gpt-image-2/title-lockup-master.png`

> Create a single premium Claymation title lockup with the exact text
> "NATURE HUNT" and no other text. Chunky cream clay uppercase letters on a
> rounded forest-green clay plaque, framed by a few bright handmade leaves;
> warm highlights and tactile polymer-clay texture matching the supplied game
> mockups. Center the whole isolated lockup on a perfectly flat solid #20252b
> background with generous space. Every letter must be legible and spelled
> exactly. No character, subtitle, watermark, extra badge, or scene.

## Local API supplements

### Hub tile — QLOBE Studio / Krea 2

Template: `menu-game-tile`; style: `toy-table`; seed: `42`; source and accepted
recipe: `local-api/hub/`.

> A friendly round clay hedgehog nature explorer proudly presents one bright
> green leaf beside a small blank tan clipboard in a lush toy forest clearing;
> one character, one focal nature treasure, clean strong silhouette, no child,
> no title, no UI, no letters, no text.

Studio appended the selected Toy Table style suffix recorded verbatim in
`local-api/hub/recipe.json`. The accepted source was hand-curated into the
640x533 platform tile by `tools/produce-hub-tile.py`.

### UI separation — Qwen Image Layered

Workflow: `qwen-image-layered`; two layers; seed: `42`.

> Background layer: the flat dark charcoal background and contact shadow
> only. Top layer: the complete [asset name] as one faithful subject on a
> transparent background. Preserve its exact clay texture, colors, lighting,
> silhouette, inner holes, and proportions. Remove only the dark background;
> do not redraw, restyle, crop, or add anything.

The placeholder is one of: blank clay clipboard, blank cream mission plaque
with green rim, blank green clay action-button plaque, blank cream quest card
with brown rim, green circular clay check badge, or golden clay halo ring and
all eight detached ray pieces. Layered candidates and the final selection are
recorded by `tools/produce-assets.py` and `production-receipt.json`.

## References

- `../../../../../01-game-concepts/nature-scavenger-hunt/brief.md`
- `../../../../../01-game-concepts/nature-scavenger-hunt/output/ui-mockups/00-overview.png`
- `../../../../../01-game-concepts/nature-scavenger-hunt/output/ui-mockups/01-quest-checklist.png`
- `../../../../../01-game-concepts/nature-scavenger-hunt/output/ui-mockups/02-find-green-leaf.png`
- `../../../../../01-game-concepts/nature-scavenger-hunt/output/ui-mockups/03-quest-complete.png`
