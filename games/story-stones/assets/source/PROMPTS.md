# Story Stones storybook generation recipe

Generated 2026-07-22. Krea 2 produced visual concepts locally; GPT Image 2
locked character identity, produced pose variations, isolated props, and
refined the backdrop. No web or third-party art was used.

## Krea 2 concept lock

Selected seed: `1337` (actors and most props; seed `42` was selected for the
croissant, golden key, and initial Castle Meadow composition).

Core dragon prompt:

> Children's storybook dragon in a cosy illustration style. A friendly young
> green dragon with warm ochre belly, small curved horns, orange-red back
> spines and wing membranes, rounded childlike proportions, gentle expressive
> face, thick charcoal hand-drawn outlines, layered gouache and colored-pencil
> texture on warm paper, charming imperfections, full body, single character.

The same medium and shape language were applied to the orange cat, white cat,
friendly purple monster, meadow owl, seven props, and Castle Meadow. Concept
alternatives and their seeds are preserved in `concepts/`.

## GPT Image 2 identity masters

Each selected actor concept was referenced with this structure:

> Recreate this exact character as a clean neutral full-body storybook
> illustration. Preserve the character's proportions, markings, palette, face,
> thick charcoal outline, and warm gouache/colored-pencil texture. Single
> character, complete silhouette, generous clearance, flat warm off-white
> background, no props, scenery, text, frame, shadow, or duplicate.

Masters are preserved in `pose-masters/<actor>/`.

## Six semantic pose prompts

Every variation referenced its actor's neutral master and repeated the identity
constraints above. Output used a solid `#ff00ff` background for local alpha
extraction.

- `neutral`: relaxed three-quarter stance, gentle smile, limbs comfortably set.
- `enter`: lively readable step or landing, body leaning forward, welcoming gesture.
- `notice`: curious head tilt, alert eyes, one limb slightly raised.
- `interact`: friendly reaching or presenting gesture with a clear silhouette.
- `react`: delighted surprise, widened eyes, open happy expression, slight lean back.
- `celebrate`: joyful hop, raised limbs or wings, bright smile, fully in frame.

Species-specific language changed paws to wings or small hands without changing
the semantic cue. Chroma originals are in `pose-chroma/`; keyed versions are in
`pose-alpha/`; production WebP files are in `../pose-actors/`.

## Props and backdrop

Each selected prop concept used:

> Isolate and refine the exact object from the reference as one clean storybook
> prop sprite. Preserve its recognizable shape, colors, charcoal outline, warm
> gouache and colored-pencil texture. Exactly one complete centered object on
> flat `#ff00ff`; no character, duplicate, setting, floor, shadow, label, or frame.

The selected Castle Meadow concept used:

> Refine this exact cozy castle meadow into a polished wide children's
> storybook stage backdrop. Preserve the handmade paper texture, friendly
> distant castle, path, flowers, trees, and golden morning palette. Compose as
> 16:9 with a broad uncluttered lower-center clearing for three characters and
> props. No foreground characters, UI, text, border, photorealism, or 3D.

## Launch and selection UI artwork

The two 16:9 interface backgrounds were generated with the concept screens as
composition references and the selected Castle Meadow backdrop as the medium
and palette reference. The launch prompt requested a bright turquoise sky,
small distant castle, gently framing meadow foliage, and a quiet central zone
for the title, featured stones, and start button. The selection prompt requested
a coordinated sky-and-hills scene with quiet top corners, a slim landscape band,
and an uncluttered center behind the tray and card grid. Both explicitly excluded
characters, cards, controls, lettering, symbols, frames, and watermarks.

The splash title prompt requested the exact text `CASTLE MEADOW` and
`Story Stones` in chunky golden storybook lettering on a deep navy irregular
plaque with a warm-white keyline. The compact selection title requested the
exact text `Story Stones` in warm-white lettering with navy and cream outlines.
Both titles were generated on a perfectly flat `#ff00ff` background, then
soft-matte keyed locally with despill before WebP optimization.
