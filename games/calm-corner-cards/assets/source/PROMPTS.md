# Calm Corner Cards — Accepted Generation Prompts

The source masters below were created with the built-in image-generation tool on the user-requested GPT Image 2 path. Prompts are normalized here in the production format used to evaluate and reproduce the accepted visual family. Source PNGs were preserved before cutting or optimization.

## Shared art lock

- Use case: preschool game illustration and tactile UI
- Art world: Puppet / Cozy felt fabric
- Medium: hand-cut wool felt, blanket stitch, stuffed plush forms, subtle fiber texture, shallow handcrafted depth
- Mood: safe moonlit bedtime nook, reassuring rather than sleepy or clinical
- Palette: lavender, plum, moon cream, muted mint, soft coral, teal, warm gold
- Character lock: Sunny is a small round golden-yellow plush bean with simple dark eyes, tiny smile, rosy felt cheeks, stubby arms and feet
- Constraints: no vector art, flat icon pack, photorealism, plastic 3D, glossy UI, emoji, stock illustration, watermark, signature, or stray text

## `gpt-image-2/calm-room-master.png`

```text
Use case: illustration-story
Asset type: responsive 4:3 game background
Primary request: a cozy handmade felt bedtime calm corner, with lavender fabric walls, warm lamp glow, moonlit window, layered cloud cushions, soft round rug, tiny shelf, and quiet stitched details.
Composition/framing: straight-on dollhouse view; broad uncluttered central and lower play space; calm top band for title; decorative objects stay near edges; full-bleed 4:3.
Style/medium: shared Puppet / Cozy felt fabric art lock; tactile wool fibers, soft seams, gentle dimensional lighting.
Constraints: no character, card, button, readable text, title, logo, watermark, or primary object in the center.
```

Accepted source: 1448×1086 RGB.

## `gpt-image-2/sprites-sheet.png`

```text
Use case: game asset contact sheet
Asset type: twelve isolated felt sprites for connected-component cutting
Primary request: strict 4×3 reading-order sheet containing exactly: Sunny neutral; Sunny hugging/resting; breathing cloud; self-hug heart; chunky drawing crayon with tiny rainbow; sleepy star; striped squish ball; breathing flower; sun patch; rainbow patch; cloud patch; star patch.
Composition/framing: one complete centered subject per cell, even scale, generous separation, all extremities visible, no touching or overlap.
Style/medium: shared Puppet / Cozy felt fabric art lock; identical Sunny identity in both poses.
Scene/backdrop: transparent or perfectly uniform separation-ready field.
Constraints: exactly twelve subjects in the named order; no captions, grid lines, scenery, extra objects, crop, letters, watermark, or cast shadow linking cells.
```

Accepted source: 1448×1086 RGBA. `tools/cut-asset-sheet.py` found exactly 12 components.

## `gpt-image-2/ui-sheet.png`

```text
Use case: ui-mockup
Asset type: nine blank tactile UI carriers for later cutting
Primary request: strict 3×3 reading-order sheet containing exactly: mint activity card; coral activity card; lavender activity card; cream activity card; wide lavender prompt plaque; wide plum button; wide teal button; stitched crescent-moon patch; three-dot felt progress ornament.
Composition/framing: every piece complete and clearly separated, consistent rounded handmade family, generous outside margin, blank centers for live HTML labels.
Style/medium: shared Puppet / Cozy felt fabric art lock with visible seams and subtle plush lift.
Scene/backdrop: one plain dark charcoal field suitable for Layered extraction.
Constraints: exactly nine assets; no readable words, letters, icons beyond the named moon/dots, characters, scenery, crop, watermark, or linked shadow.
```

Accepted source: 1448×1086 RGB. The source and Qwen Layered `layer_2` output were each cut 9/9.

## `gpt-image-2/title-lockup.png`

```text
Use case: game title
Asset type: transparent-ready felt title lockup
Primary request: a wide softly stuffed lavender felt plaque reading exactly “CALM CORNER CARDS”, with friendly cream stitched letters, one tiny crescent moon, and restrained gold star accents.
Composition/framing: centered horizontal lockup; the complete plaque and every stitch visible; generous transparent margin.
Style/medium: shared Puppet / Cozy felt fabric art lock.
Constraints: spell C-A-L-M  C-O-R-N-E-R  C-A-R-D-S correctly once; no subtitle, extra words, character, scenery, crop, watermark, or signature.
```

Accepted source: 1774×887 RGBA; exact title was visually verified before optimization.

## `gpt-image-2/breathing-rings.png`

```text
Use case: tactile animation overlay
Asset type: one transparent breathing focal cue
Primary request: exactly three perfectly centered concentric breathing rings made from warm golden-yellow embroidered running stitches and a restrained luminous felt halo, tactile, handmade, softly fuzzy, and legible at tablet size.
Composition/framing: front-facing circular overlay with an outer, middle, and inner ring evenly spaced and generous transparent padding.
Style/medium: shared Puppet / Cozy felt fabric art lock; thread visibly sewn into plush felt.
Constraints: true transparent background; no character, belly, solid disk, plaque, text, letters, numbers, icon, frame, scenery, checkerboard, watermark, or signature.
```

Accepted source: 1254×1254 RGBA. Runtime output is a 512×512 alpha WebP layered over Sunny and transformed only for breathing state/motion.

## LAN derivative prompts

Qwen Image Layered separated the accepted UI sheet into three layers. The foreground request was:

```text
Separate this nine-piece felt UI sheet without changing the artwork. Background layer: one plain dark charcoal field. Top layer: all nine complete felt pieces on transparency, preserving their exact pixels, order, colors, fabric fibers, stitches, dimensions, edge softness, spacing, and interior openings. Remove only the charcoal background. Do not redraw, simplify, crop, recolor, relight, add text, merge pieces, or add objects.
```

Only `layer_2` was retained for cutting. Nine of nine expected pieces were found and each passed deterministic alpha/fringe review on magenta.

Krea 2 generated the separate platform hub tile with seed 42:

```text
A premium preschool-game hub tile in the QLOBE toy-table grammar: a shallow lavender felt calm-corner play mat holding one golden-yellow plush bean friend hugging a coral felt heart, one puffy mint breathing cloud, one chunky lavender crayon drawing a tiny rainbow, and one sleepy golden felt star. Arrange the four calm tools as a single inviting centered play moment, all objects fully visible, with a softly blurred cozy moonlit playroom behind them. Rounded simplified tactile forms, warm gentle light, saturated-but-soft lavender, coral, mint, cream, teal, and gold palette, handcrafted felt and plush texture, polished toy photography / soft 3D illustration finish. No text, title, letters, logo, buttons, hands, extra characters, watermark, or crop.
```

Accepted source: 768×640 PNG; final hub tile: 640×533 optimized JPEG.

## Voice workflow

`tools/generate-voice.py` reads the exact lines in `assets/audio/lines.json`. It calls `qwen3-tts-voiceclone` against the approved project teacher reference with seed ladder 7, 8, 9, then calls `whisper-stt` for every candidate. A line is publishable only after decoding and transcript similarity ≥0.90. All 20 lines passed on seed 7; details are in `assets/audio/qa.json` and no endpoint or local reference path is persisted.
