# Scissor Trail Safari — image-generation record

All shipped source images in `gpt-image-2/` were generated as new images with
OpenAI GPT Image 2 through Codex image generation. No reference image was supplied.
The PNG sources are retained so the runtime WebP assets can be reproduced.

## `animals-a.png`

> Create one exact-count asset sheet containing exactly 4 separate friendly safari
> animal characters: 1 lion, 1 zebra, 1 giraffe, 1 elephant. Arrange them in a clean
> 2 by 2 grid, one complete animal per quadrant, centered with generous empty space,
> no overlap and no cropping. Premium handmade papercraft for a preschool game:
> layered construction paper and felt, visible paper fibers, softly deckled scissor-cut
> edges, stitched details, dimensional stacked shadows, joyful expressive faces,
> rounded child-friendly proportions. Full body, front three-quarter view. Transparent
> background. No text, labels, scenery, frames, extra animals, duplicate animals, or
> loose props. Cohesive Paper Garden art direction, polished production game asset.

## `animals-b.png`

> Create one exact-count asset sheet containing exactly 4 separate friendly safari
> animal characters: 1 colorful parrot, 1 green snake, 1 playful monkey, 1 tiger.
> Arrange them in a clean 2 by 2 grid, one complete animal per quadrant, centered with
> generous empty space, no overlap and no cropping. Premium handmade papercraft for a
> preschool game: layered construction paper and felt, visible fibers, softly deckled
> scissor-cut edges, stitched details, dimensional stacked shadows, joyful expressive
> faces, rounded child-friendly proportions. Full body, front three-quarter view.
> Transparent background. No text, labels, scenery, frames, extra animals, duplicates,
> or loose props. Cohesive Paper Garden art direction, polished production game asset.

## `ui-kit.png`

> Create one exact-count game UI asset sheet containing exactly 6 separate objects on
> a flat pure #FF00FF chroma-magenta background: (1) tall rounded yellow stitched felt
> card with a small straight zigzag paper-cut motif near the bottom, (2) tall rounded
> green stitched felt card with a small curving paper-cut motif near the bottom, (3)
> tall rounded sky-blue stitched felt card with a small spiral paper-cut motif near the
> bottom, (4) circular cream stitched medallion with safe red child scissors, (5)
> circular cream stitched medallion with a golden star, (6) wide blank cream-and-green
> stitched button plaque with no letters. One object per cell, generous spacing, no
> overlap, no cropping, no extra pieces. Handmade layered construction-paper and felt
> style, visible fibers, deckled cut edges, soft dimensional shadows. No text, numbers,
> icons besides those requested, animals, scenery, watermark, or border around sheet.

## `title-lockup-source.png`

> Create a premium preschool game title lockup with the exact words “SCISSOR TRAIL
> SAFARI”, spelled exactly, all uppercase and fully legible. Three playful stacked lines.
> Chunky individually cut construction-paper letters in bright teal, sunny yellow,
> coral red, leafy green, and sky blue, attached to an irregular cream stitched
> cardstock plaque. Include one small safe red child-scissors paper cutout and two tiny
> jungle leaves integrated around the plaque. Handmade Paper Garden style: tactile
> paper fibers, deckled scissor-cut edges, layered cardstock depth, soft shadows,
> polished children's game logo. Centered composition, isolated, generous transparent
> margin. No other words, no misspelling, no background scene, no characters, no
> watermark.

## `jungle-background.png`

> Wide 4:3 background for a premium preschool game, a joyful handmade papercraft
> safari jungle clearing. Layered construction-paper canopy and tropical leaves frame
> every edge, chunky paper tree trunks on the sides, pale blue paper sky, soft felt
> clouds and sun, distant teal paper hills, golden sandy clearing through the center.
> Keep the central 60 percent calm and open for game UI and tracing. Visible paper
> fibers, torn/deckled scissor-cut edges, layered cardstock shadows, saturated but warm
> palette, Paper Garden art direction. No animals, no people, no text, no UI, no paths,
> no scissors, no watermark. Edge-to-edge finished background, landscape 4:3.

## `success-tableau-source.png`

> A celebratory group of exactly 3 friendly papercraft safari animals: joyful lion in
> the center waving one paw, happy coiled green snake on the left, happy gray elephant
> on the right with trunk raised. Full bodies, close friendly group, confetti-like
> paper stars tucked around them. Premium layered construction paper and felt, visible
> fibers, stitched accents, deckled scissor-cut edges, dimensional shadows, rounded
> preschool proportions, big expressive smiles. Isolated on transparent background,
> generous margin, no text, no plaque, no scenery, no extra animals, no watermark.

## `hub-tile-source.png`

> Create a polished 6:5 landscape catalog tile for a preschool game, entirely handmade
> from matte flat construction paper and felt. In a sunny layered paper jungle clearing,
> one safe rounded red child-scissors cutout follows a bold blue stitched/dashed paper
> trail toward one delighted friendly papercraft lion. Make the scissors and lion large
> and instantly readable at thumbnail size, with lush flat cut-paper leaves framing the
> edges and a calm golden paper clearing behind them. Visible paper fibers, deckled
> scissor-cut silhouettes, stitched accents, layered cardstock depth, warm brown paper
> shadows, saturated Paper Garden palette. Strictly coherent handcrafted Papercraft: no
> glossy surfaces, no plastic, no clay, no photoreal fur, no 3D toy render, no words, no
> letters, no numbers, no logos, no other animals, no human hands, no UI, no watermark.
> Edge-to-edge finished image, landscape 6:5.

## `playfield-frame-source.png`

> Create a single square production game asset: an irregular, handmade cream cardstock
> safari cutting mat viewed straight-on, isolated on transparent background. The mat
> nearly fills the square but has visibly deckled scissor-cut edges, layered warm beige
> paper thickness, stitched border details, subtle fibrous texture, and soft warm-brown
> stacked paper shadows. Integrate small flat paper-cut safari foliage accents only at
> the outer corners and extreme edges: a few green leaves, savannah grass tufts, two tiny
> coral flowers, and small torn-paper patches. Keep the central 78 percent calm, pale,
> high-contrast, and completely open so a child's dotted tracing route can be drawn over
> it. Premium cohesive Paper Garden art direction, obviously constructed from matte flat
> construction paper and felt, photographed straight-on with gentle dimensional depth.
> No animals, no scissors, no path, no dots, no text, no letters, no numbers, no buttons,
> no UI, no frame beyond the paper mat, no glossy plastic, no clay, no 3D-rendered toy
> look, no watermark. Transparent outside the irregular mat.

## Rejected trials

Two title-isolation trials were reviewed and intentionally not shipped: a background
removal edit and a second text render. The first source above had the best exact
spelling, silhouette, and tactile depth, so it was extracted deterministically with
OpenCV GrabCut and the shared cutout finalizer.

## Local API supplement attempts

- Krea 2 `menu-game-tile`, Studio job `e8c2868fd431`: rejected by the LAN worker
  before generation because its internal ComfyUI callback returned HTTP 404.
- Qwen Image Layered was attempted for title separation and failed
  at the same internal upload callback. The shipped title therefore uses the retained
  GPT Image 2 source plus deterministic local matting.

These failures are recorded to make clear that neither unavailable result was silently
substituted or presented as generated output.
