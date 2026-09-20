# TaleTeller GPT Image 2 production prompt record

**Mode:** built-in image generation, GPT Image 2

**Style reference:**
`01-game-concepts/picture-narration-tale-teller/output/ui-mockups/01-story-world.png`

The reference was used only for the visual language: classic hand-painted
children's storybook watercolor on warm ivory paper, soft ink outlines,
visible pigment blooms, rounded friendly shapes, and gentle theatrical light.
All requested output was original raster art. Except for the title master,
prompts prohibited words, letters, logos, watermarks, UI, frames, and vector or
flat-app-icon styling.

## Accepted master prompts

### `splash-master.png`

> Create a premium 4:3 watercolor storybook splash painting for a preschool
> game. An open enchanted book rests on a cozy wooden reading table and its
> pages flow upward into three connected miniature worlds: a sunlit emerald
> forest with a tiny red fox, a sparkling turquoise ocean with a friendly blue
> whale, and a deep indigo moon sky with a cream moon bunny. A glowing golden
> story star unites the worlds. Warm paper grain, layered depth, clear central
> negative space for a separate title, magical but calm, ages 3-7. No text.

### `forest-master.png`

> Paint a wide 4:3 interactive forest story scene in handmade watercolor. A
> winding path reaches a sparkling stream with a small wooden bridge and a
> folded leaf boat; flowers cluster in the foreground, a blue butterfly hovers
> in clear open space, and distant foliage forms a welcoming stage. Reserve
> readable areas for a fox character and four touch hotspots. Warm green and
> gold light, dimensional foreground/midground/background, no characters
> duplicated, no labels, no interface.

### `ocean-master.png`

> Paint a wide 4:3 underwater story world in luminous watercolor. A friendly
> coral garden frames a clear swimming path, translucent bubbles rise toward
> sunbeams, a sea turtle and distant playful dolphins are readable, and a
> pearl shell nestles near the reef. Reserve open areas for a blue whale hero
> and touch hotspots. Turquoise, cobalt, coral, and pearl palette; magical
> depth without visual clutter; no text or interface.

### `moon-master.png`

> Paint a wide 4:3 gentle moon adventure in watercolor and ink. Silver-violet
> lunar hills, one clear round crater, a small friendly rover, crystalline
> purple rocks, a glowing golden star, Earth in the far sky, and a winding
> trail of stardust. Reserve open areas for a scarf-wearing moon bunny and four
> touch hotspots. Cozy night light, dreamy not dark, no text or interface.

### `title-master.png`

> Create one transparent watercolor storybook title graphic spelling exactly
> “TaleTeller” with no subtitle and no extra letters. Large highly legible
> cream-and-burgundy hand-lettered serif forms, decorated only with a curled
> fox tail, tiny leaves, wildflowers, and one blue butterfly. Warm ink edges,
> handmade pigment texture, compact horizontal silhouette, transparent
> background.

### `ui-sheet.png`

> Create a clean component sheet on a uniform near-black charcoal background.
> Exactly twelve separated watercolor storybook UI pieces with generous empty
> gutters: cottage home button, back arrow, sound button, sound-off button,
> coral microphone button, blue replay button, gold next arrow, open
> storybook, glowing gold star, blank parchment sentence ribbon, gold sparkle
> cluster, blue sparkle cluster. No text, no shadows crossing gutters, no
> clipping, nothing touching.

### `characters-vocab-sheet.png`

> Create a clean 4-by-3 component sheet on uniform near-black charcoal.
> Exactly twelve isolated watercolor storybook stickers with cream paper rims:
> curious red fox, friendly blue whale, cream moon bunny in a navy star scarf,
> blue butterfly, sparkling stream with rocks, colorful wildflowers, coral
> reef, smiling sea turtle, iridescent bubbles, purple moon crater, friendly
> moon rover, smiling golden story star. One centered object per cell, matched
> scale and lighting, wide gutters, no text, no overlap, no clipping.

### `choices-sheet.png`

> Create a clean 4-by-3 sheet on uniform near-black charcoal. Exactly twelve
> isolated rounded-square watercolor story cards with thick warm-cream paper
> edges: forest bridge, leaf boat, cheerful duck, dancing fireflies, two
> dolphins, sea turtle, pearl in shell, singing ocean friends, moon-bunny hop,
> moon rover ride, glowing crystal, friendly star. Each card is a clear single
> action vignette for a preschool choice, equal size, wide gutters, no text,
> no overlap, no clipping.

## Derivation

The repository asset cutter produced named components and debug masks. Qwen
Image Layered was evaluated as a secondary separator; only visually faithful
results were promoted. `tools/build-assets.py` performs the documented
selection, alpha cleanup, fitting, WebP encoding, contact-sheet QA, and hash
manifest generation.
