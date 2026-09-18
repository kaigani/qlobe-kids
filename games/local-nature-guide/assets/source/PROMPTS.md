# Local Nature Guide — Accepted Generation Prompts

The OpenAI source masters below were produced with the built-in image-generation tool on the user-requested GPT Image 2 path. Accepted outputs were copied into `gpt-image-2/` before any deterministic cutting or LAN processing. Prompts are normalized here in the image skill’s production format; targeted corrections are recorded beneath the relevant master.

## Shared art lock

- Use case: `illustration-story`
- Asset type: preschool game art family
- Style/medium: luminous children’s-book watercolor and soft gouache on warm paper, restrained colored-pencil contours, hand-painted irregular edges
- Lighting/mood: sunlit late-morning woodland; curious, safe, museum-worthy
- Palette: warm cream paper, deep fern, moss, sunlit leaf, creek blue, bark brown, pinecone brown, small berry accents
- Constraints: no photorealism, vector art, glossy 3D, emoji, UI chrome, watermark, signature, or stray text; consistent upper-left light

## `suri-pose-sheet.png`

```text
Use case: illustration-story
Asset type: six-pose game character contact sheet for later cutting
Primary request: the exact same friendly red squirrel nature guide, Suri, in six clearly separated full-body poses: welcoming with field notebook; pointing to a discovery; cupping one ear to listen; tracing/following a clue; presenting an open nature journal; badge celebration.
Subject: orange-red squirrel, cream muzzle and belly, enormous fluffy tail, forest-green scarf, warm inquisitive face; preserve identical face, proportions, scarf, palette, line weight, and light direction in every pose.
Composition/framing: strict 3×2 grid, one complete pose per cell, generous empty margin around every tail, paw, ear, notebook, and prop; no overlap.
Scene/backdrop: one perfectly uniform dark charcoal matte.
Style/medium: shared luminous watercolor/storybook art lock.
Constraints: exactly six poses; no captions, borders, scenery, ground shadows, crop, extra animals, text, watermark, or transparency checkerboard.
```

Correction edit: change only the backdrop to perfectly uniform dark charcoal from edge to edge; keep every Suri pixel, pose, prop, spacing, watercolor texture, and identity unchanged.

## `specimen-sheet.png`

```text
Use case: scientific-educational
Asset type: fifteen-item watercolor specimen contact sheet for later cutting
Primary request: exact 5×3 grid in reading order: pinecone; red maple leaf; smooth speckled river stone; acorn; fern frond; blue-and-white feather; black-capped chickadee; American robin; downy woodpecker; eastern cottontail rabbit; white-tailed deer; raccoon; brass binoculars; brass hand magnifier; embroidered green leaf guide badge.
Composition/framing: one complete isolated subject per cell, centered, consistent generous breathing room, no touching or overlap, every feather tip/antler/leaf edge visible.
Scene/backdrop: one perfectly uniform dark charcoal matte.
Style/medium: shared luminous watercolor/storybook art lock; recognizable preschool silhouettes and truthful key field marks.
Constraints: exactly fifteen subjects in the named order; no labels, captions, grid lines, scenery, cast shadows, crop, duplicates, extra objects, text, or watermark.
```

Correction edit: replace only the uneven backdrop with one flat edge-to-edge charcoal matte; preserve all fifteen subjects exactly.

## `title-lockup.png`

```text
Use case: illustration-story
Asset type: transparent-ready game title lockup
Primary request: a hand-painted cream paper banner reading exactly “Local Nature Guide”. Spell L-O-C-A-L  N-A-T-U-R-E  G-U-I-D-E correctly, once only.
Subject: deep fern-green friendly storybook lettering with a small pinecone and fern ornament, restrained berry accents.
Composition/framing: centered wide lockup with generous empty charcoal margin and the full torn paper edge visible.
Scene/backdrop: perfectly uniform dark charcoal matte.
Style/medium: shared watercolor/storybook art lock.
Constraints: exact legible title; no subtitle, extra letters, duplicate title, scenery, character, watermark, or crop.
```

## `journal-spread.png`

```text
Use case: illustration-story
Asset type: full-screen 4:3 game reward background
Primary request: an open physical nature field journal resting in a lush sunlit woodland, with a dark-green blank ribbon header and six large blank softly colored paper specimen areas across the two pages.
Composition/framing: straight-on, book fills most of a 4:3 frame; readable page geometry; room around edges for Suri and controls.
Style/medium: shared luminous watercolor/storybook art lock.
Lighting/mood: golden celebratory forest light, subtle pollen glow.
Constraints: no character, specimens, stickers, handwriting, labels, buttons, UI, title, letters, numbers, watermark, or cropped book edges.
```

## `ui-sheet.png`

```text
Use case: ui-mockup
Asset type: nine authored watercolor UI carriers for later cutting
Primary request: strict 3×3 grid in reading order: Forest Finds route card with forest vignette and blank lower label panel; Bird Listening card with three birds and blank blue lower label panel; Track Finder card with mud print vignette and blank ochre lower label panel; wide cream-and-green action button carrier; wide torn-paper prompt plate with leafy ends; small closed green field-journal tab; painted trace-brush daub; soft golden discovery-glow halo; blank torn-paper sticker carrier.
Composition/framing: every carrier complete, clearly separated, generous margin, consistent tactile paper/paint family.
Scene/backdrop: one perfectly uniform dark charcoal matte.
Style/medium: shared watercolor/storybook art lock.
Constraints: exactly nine assets; blank text areas; no readable words, letters, labels, icons added beyond the described painted motifs, scenery, shadows linking cells, crop, or watermark.
```

Correction edit: change only the backdrop to a single uniform charcoal matte; preserve all nine UI carriers exactly.

## `tracks-sheet.png`

```text
Use case: scientific-educational
Asset type: three traceable footprint-ribbon sprites for later cutting
Primary request: three clearly separated tall connected ribbons of warm damp mud: rabbit tracks with paired long hind prints; deer tracks with repeated split pointed hooves; raccoon tracks with five long hand-like toes. Add only a few tiny painted pebbles, grass sprigs, or fallen leaves along the ribbon edges.
Composition/framing: strict 3-column sheet, one complete vertical winding trail per column, generous gap and full edge visibility from bottom start to top finish.
Scene/backdrop: one perfectly uniform dark charcoal matte.
Style/medium: shared watercolor/storybook art lock; track anatomy bold and readable at tablet scale.
Constraints: exactly three trails in rabbit/deer/raccoon order; no animals, labels, arrows, text, scenery, overlap, crop, watermark, or extra trail.
```

Correction edit: replace only the backdrop with uniform charcoal while preserving all three mud ribbons and footprints exactly.

## `trail-hub.png`

```text
Use case: illustration-story
Asset type: 4:3 trail-map game background
Primary request: a luminous watercolor woodland clearing with leafy canopy framing, distant blue hills, warm winding path, mossy log, ferns, small creek hints, and generous quiet central play space.
Composition/framing: 4:3 full-bleed scene; open upper safe band for title; calm lower corners for separate Suri and journal sprites; no dominant object in the middle.
Style/medium: shared luminous watercolor/storybook art lock.
Lighting/mood: bright late-morning dappled sun from upper left, adventurous and safe.
Constraints: no characters, animals, birds, specimens, footprint trail, journal, cards, title, words, buttons, UI, watermark, or frame.
```

## LAN derivative prompts

Qwen Image Edit used the accepted `trail-hub.png` as its style/input anchor with seed 42:

- `forest-clearing`: preserve medium, palette, light, canopy, perspective, and 4:3 composition; form a calm moss-and-leaf discovery clearing with a low mossy log, three small stones, edge ferns, large empty sprite spaces, empty lower-left quarter, and quiet upper safe band; no animals, birds, specimens, cards, title, tracks, or UI.
- `bird-meadow`: preserve the same invariants; form a sunny woodland-edge meadow with three broad bare natural branches entering from the outer edges at separated heights, open blue sky, edge flowers, empty lower-left quarter, and quiet upper safe band; no benches, furniture, birds, animals, nests, cards, title, or UI.
- `muddy-trail`: preserve the same invariants; form a creekside clearing with a broad empty warm-tan damp-mud patch, moss, ferns, pebbles, a few edge leaves, empty lower-left quarter, and quiet upper safe band; no footprints, animals, title, arrows, or UI.

Qwen Image Layered used seed 42, two layers, and the following invariant prompt for every cutter crop:

```text
Background layer: one plain dark charcoal background. Top layer: the complete watercolor subject from the source on true transparency. Preserve the exact source pixels, colors, watercolor texture, proportions, pose, lighting, outline, interior openings, and every extremity. Remove only the charcoal background. Do not redraw, simplify, crop, recolor, add a shadow, or add any new object.
```

Krea 2 used seed 42 for the separate hub tile:

```text
A shallow round wooden nature-explorer tray on a mossy log, holding one large pinecone, one smooth speckled river stone, one blue-and-white feather, a tiny green field journal with a gold leaf emblem, and a small brass magnifying glass. One recognizable nature-discovery moment staged only as objects, centered and fully visible, soft blue-sky woodland background, no hands. Bright, soft 3D cartoon style with rounded simplified forms, saturated colors, smooth shading, soft highlights, toy-like finish. Premium preschool learning app asset. No text, letters, words, title, UI, or watermark.
```
