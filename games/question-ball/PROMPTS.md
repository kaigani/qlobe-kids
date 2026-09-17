# Question Ball production prompts

The final asset recipes use these normalized prompts. All child-facing functional copy remains HTML/audio except the spell-checked decorative title lockup.

## GPT image — playroom master

Use case: stylized-concept
Asset type: 4:3 tablet game background plate
Primary request: a cozy handcrafted felt puppet playroom for a preschool conversation game
Scene/backdrop: full-bleed warm cream felt wall with a deep denim-blue padded valance at the top, tiny triangular felt bunting near the upper corners, a large oval braided-felt rug with a denim-blue outer ring and burnt-orange center, two small plush floor cushions at the far edges; keep the center and lower foreground open for interactive characters and a ball
Style/medium: premium stop-motion-like wool felt, fleece, visible blanket stitching, embroidered seams, soft stuffing, subtle handmade imperfections, warm theatrical lighting
Composition/framing: straight-on 4:3 stage, symmetrical and uncluttered, generous clear center, safe negative space in top center for a title plaque and at the side edges for puppets
Color palette: deep denim, warm cream, cranberry, mustard, coral, teal, lavender, burnt orange
Constraints: background plate only; no characters; no ball; no words, letters, numbers, logos, UI, watermark, photoreal people, hard plastic, glossy app graphics, or vector-flat shapes

## GPT image — title lockup

Use case: stylized-concept
Asset type: decorative game title cutout
Primary request: exact title “QUESTION BALL” formed as large padded felt applique letters sewn onto one dark denim-blue curved fabric plaque, with one tiny rainbow felt ball and two tiny gold felt stars as decorations
Style/medium: handcrafted wool felt and fleece, visible cream blanket stitching, soft stuffed depth, warm studio light
Composition/framing: one centered connected silhouette, generous clearance on every side, solid flat chroma-magenta background
Text (verbatim): “QUESTION BALL”
Constraints: spell exactly Q-U-E-S-T-I-O-N B-A-L-L once; no other text, no watermark, no cropped edges, no detached decorations, no glossy plastic, no vector art

## GPT image — prop contact sheet

Use case: stylized-concept
Asset type: coordinated preschool game prop contact sheet for deterministic cutting
Primary request: ten separate handcrafted felt game objects in a clean 5-column by 2-row contact sheet
Subject: reading order: (1) round rainbow patchwork Question Ball with a cream speech-bubble patch and navy question mark, (2) the same ball opened gently like a plush surprise capsule with warm golden felt light inside, (3) smiling mustard-gold stuffed five-point Sharing Star, (4) round denim microphone badge with a cream felt microphone applique, (5) padded hand-and-dotted-arc toss gesture badge, (6) sunrise plus tiny bed routine icon, (7) friendly floppy-eared puppy icon, (8) tiny rocket flying past a smiling cloud icon, (9) heart with a small rainbow feelings icon, (10) cream felt speech bubble with one large navy question mark
Style/medium: one coherent handcrafted wool felt family, fleece pile, blanket stitching, embroidered details, soft stuffing, simple preschool silhouettes, warm studio light
Composition/framing: exactly ten isolated objects, equal generous gutters, no touching or overlap, each object fully inside its cell, one connected silhouette per object, orthographic front view
Scene/backdrop: perfectly uniform solid chroma-magenta background
Constraints: no labels, no words, no extra objects, no grid lines, no watermark, no cast shadow crossing another cell, no glossy plastic, no vector art

## GPT image edit — Maya and Leo felt-puppet poses

Use case: style-transfer
Asset type: four-pose game character contact sheet
Input images: Image 1 is canonical Maya identity reference; Image 2 is canonical Leo identity reference
Primary request: restyle the two canonical children as handcrafted waist-up felt hand puppets while preserving their recognizable identity, hair, skin tone, outfit colors, and friendly personality; arrange exactly four separate poses in one horizontal row
Subject: reading order: (1) Maya listening with one felt hand cupped near her ear, red bow and yellow shirt; (2) Maya celebrating with both felt hands raised; (3) Leo ready to catch with open felt arms, freckles, ginger hair and green striped shirt; (4) Leo celebrating with both felt hands raised
Style/medium: premium sewn wool felt and fleece puppets, yarn/felt hair, embroidered freckles and facial details, soft stuffing, visible seams, warm puppet-theater light
Composition/framing: four waist-up characters at identical scale and baseline, wide gutters, no touching, each fully visible, straight-on, solid flat chroma-magenta background
Constraints: preserve Maya and Leo identities; exactly four figures; no extra people, words, props, UI, watermark, cut-off hands, merged silhouettes, glossy 3D plastic, or vector art

## GPT image — UI furniture contact sheet

Use case: stylized-concept
Asset type: blank felt UI furniture contact sheet for deterministic cutting
Primary request: seven separate blank padded fabric pieces for a preschool conversation game
Subject: reading order: (1) wide curved dark denim title plaque, (2) wide moss-green action button, (3) extra-wide warm cream question panel with navy stitched edge, (4) square mustard topic card, (5) square moss-green topic card, (6) square lavender topic card, (7) square coral topic card
Style/medium: handcrafted wool felt, thick stuffed edges, visible cream blanket stitching, subtle fleece texture, warm studio lighting
Composition/framing: exactly seven isolated blank shapes in one row or clean grid, very wide gutters, no touching, one connected silhouette each, solid flat chroma-magenta background
Constraints: absolutely no text, letters, icons, symbols, characters, watermark, cropped edges, glossy plastic, or vector art

## Krea 2 — hub tile

Workflow: `krea2-turbo-t2i`, seed 42, 768×640.

Prompt: A single handcrafted rainbow patchwork felt Question Ball resting on a small warm cream play mat, with a tiny smiling stuffed gold star beside it and two soft felt speech bubbles floating behind. Bright premium preschool toy-object catalog art, rounded simplified forms, visible stitching and fleece texture, cheerful proportions, clean centered 6:5 composition, soft warm studio light, light airy background, no people, no title, no text, no letters, no UI, no logos, no watermark.

## Qwen Image Layered — extraction

For each cutter crop: “Separate only the complete sewn felt object from the plain chroma-magenta background. Preserve every original object pixel, stitch, soft edge, and internal opening. Return the object alone on true alpha with no magenta fringe, no shadow plate, no redesign, no added element.” Use `layers=2`, seed 42, and retrieve `layer_2`.
