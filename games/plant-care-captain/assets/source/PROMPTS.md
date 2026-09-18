# Plant Care Captain production prompts

Private service hosts and machine-local input paths are intentionally omitted.
The accepted images and hashes are authoritative; text below freezes the art
direction and generation recipe used for this release.

## GPT Image 2 — built-in image generation

Model: `gpt-image-2`. Seed: not exposed. The concept brief and UI mockups were
the composition authority; existing QLOBE clay imagery was supplied as a style
reference, not copied as game content.

### Greenhouse workbench master

> Wide 4:3 production background for a preschool care game: a tiny handcrafted
> stop-motion clay greenhouse, sunny sky through rounded cream window frames,
> warm terracotta workbench across the bottom, lush potted plants and flowers
> framing both sides, soft daylight and shallow miniature depth. Keep the broad
> central workbench and central window completely empty for game sprites. No
> characters, tools, lettering, UI, icons, gradients, or flat vector shapes.
> Premium tactile clay, fingerprints and gentle imperfections, friendly warm
> palette, readable at tablet scale.

### Plant state sheets

One prompt per plant family (sunflower, curling pea, broad-leaf basil):

> Transparent-background 2×2 production sprite sheet. Show the exact same
> friendly handcrafted clay plant and the exact same smiling terracotta pot in
> four identity-locked states, one centered object per quadrant with generous
> separation: top-left dry and drooping; top-right watered and standing taller;
> bottom-left freshly misted with glossy healthy leaves; bottom-right fully
> thriving and blooming. Preserve pot shape, face, clay material, camera,
> lighting, and scale progression. No labels, numbers, panels, scenery, extra
> objects, cast shadow plate, or cropped leaves. True transparent background.

The sunflower ends in a golden sunflower, the pea in pink sweet-pea flowers,
and the basil in small white herb blossoms.

### Tools and effects sheet

> Transparent-background clay production sheet with isolated components in two
> generous rows: chunky blue watering can with white daisy; coral pumpkin-form
> bottle with purple mister; child-safe silver shears with teal handles; one
> curly brown dry leaf; three separate glossy blue water drops; one soft pale
> blue mist cloud; one yellow four-point clay glint; one leafy green captain
> rosette with yellow star and blue ribbons. Same tactile miniature clay world,
> front three-quarter view, no labels, panels, scenery, or overlaps.

### UI carriers sheet

> Six empty tactile clay UI carriers on a flat dark charcoal ground, arranged
> as a clean 3×2 production sheet with wide spacing: tall terracotta-and-cream
> plant choice card with two leaves; wide wavy cream instruction plaque with
> terracotta rim; wide green pill action button with cream rim; cream progress
> tray with three green-rimmed round wells; cream cloud plaque with terracotta
> rim and two leaves; tall cream-and-terracotta moisture gauge with four empty
> wells and a blue droplet crown. No words, letters, numerals, icons beyond the
> requested leaves/drop, gradients, vector styling, or overlaps.

### Title lockup

> Transparent-background handcrafted clay title lockup spelling exactly
> “PLANT CARE CAPTAIN” in large friendly uppercase letters. PLANT leaf green,
> CARE sky blue, CAPTAIN warm terracotta orange, thick cream clay backing,
> small leaf and blue water-drop accents. Centered, highly readable at tablet
> size, no other words, no scenery, no crop, no flat vector treatment.

## Local Krea 2 — catalog tile

Workflow `krea2-turbo-t2i`, seed 42, 768×640:

> A cheerful smiling potted sunflower being watered by a chunky bright blue
> watering can on a tiny greenhouse workbench, handcrafted stop-motion clay,
> warm preschool toy-table photography, simple bold silhouette, centered
> composition, generous safe margins, white-to-cream quiet background, no text,
> no logo, no UI, no border.

## Local Qwen Image Edit — thriving background

Seed 42 established warmer golden sunbeams but added a generic center plant and
was rejected. Seed 1337 used the rejected warm frame as its reference:

> Remove the single small flower pot and flower from the exact center of the
> workbench. Restore a bare, continuous handmade clay workbench surface where
> it stood. Keep every other part of the greenhouse, side shelves, surrounding
> plants, golden sunrise, sunbeams, colors, camera, and clay style exactly
> unchanged. The entire central play area must be empty. No pot, no plant, no
> character, no tool, no text.

The accepted edit introduced an empty round clay presentation stage; it was
kept because it strengthens the destination composition without changing plant
identity.

## Local Qwen Image Layered

Pea sheet, seed 42, two layers:

> Background layer: plain dark charcoal background. Top layer: all four clay
> pea-plant state sprites from the reference sheet, unchanged and together on a
> transparent background. Preserve every pot face, stem curl, leaf, flower,
> color, scale, and spacing. No redraw, no labels, no added object or shadow.

The six individual UI attempts used this pattern with the named carrier:

> Background layer: Plain dark charcoal background. Top layer: exactly the
> single [carrier description] from the reference image, unchanged in shape,
> colors, material, and details, isolated on a transparent background. Keep the
> whole object. No text, no extra objects, no redesign, no added shadow.

They remain as rejected candidates. The accepted UI uses the immutable GPT
Image 2 crop plus deterministic neutral-matte removal.

## Voice

Workflow `qwen3-tts-voiceclone`, approved
`shared/assets/refs/voice-teacher.wav`, seed ladder 7 → 8 → 9. Exact text is
`../audio/lines.json`. Whisper verification uses `whisper-stt`, model `small`,
language `en`, punctuation/case-insensitive exact comparison. All fourteen
lines pass; `water-intro` uses seed 8 after seed 7 added a leading word.

