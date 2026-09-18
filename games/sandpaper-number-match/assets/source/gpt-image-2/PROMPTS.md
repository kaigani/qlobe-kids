# Sandpaper Number Match — source prompts

All prompts target the canonical **Puppet / Cozy felt fabric** world from
`docs/art-direction.md`. The two concept mockups and concept title screen were
used as composition/material references. Interactive labels remain HTML; the
decorative hero title is an inspected raster lockup with a screen-reader-only
HTML heading carrying the same words.

## GPT Image 2: world backdrop

**Output:** `world-backdrop-master.png` (1448×1086)

> Create a polished 4:3 game-world plate for a Montessori preschool number
> tracing game, matching the attached cozy felt quiet-book mockups. Make a large,
> calm warm-cream wool-felt work area in the center with subtle fibers and soft
> handmade depth. Frame it with a thick coral padded felt border with visible
> cream blanket stitching. Add a teal sewn fabric pocket along the bottom edge.
> Place only a few tactile sewing-room details at the extreme edges—wooden
> buttons, thread spool, embroidery thread, tiny felt scraps—so the center stays
> completely clear for gameplay. Warm studio light, premium stop-motion craft
> photography, consistent scale, charming and calm. No text, letters, numerals,
> stars, cards, controls, logo, watermark, gradient, or vector-flat shapes.

## GPT Image 2: sandpaper numeral contact sheet

**Output:** `numerals-master.png` (1774×887, transparent)

> A production contact sheet containing exactly ten separate tactile numerals,
> 0 through 9, arranged in strict reading order as five columns by two rows:
> top row 0, 1, 2, 3, 4; bottom row 5, 6, 7, 8, 9. Each numeral is a chunky
> upright preschool sandpaper cutout made from warm ochre-gold coarse sandpaper,
> with a raised cream felt piping edge and visible tiny blanket stitches. Match
> the attached cozy felt quiet-book reference: soft stuffed depth, warm studio
> light, handmade imperfections, readable conventional number forms. Each item
> must be isolated with generous equal spacing and must not touch another item.
> Transparent background. No shadows that join cells, labels, words, duplicate
> numbers, extra objects, frames, cards, watermark, or cropped edges.

## GPT Image 2: coordinated UI and prop contact sheet

**Output:** `ui-props-master.png` (1448×1086, transparent)

> Create exactly twelve separate cozy felt quiet-book assets in a strict four
> column by three row contact sheet, reading order: (1) wide blank warm-cream
> stitched title plaque, (2) blank teal padded lesson card, (3) blank coral
> padded lesson card, (4) blank mustard-gold padded lesson card; (5) wide blank
> teal button plaque, (6) round teal Home icon patch with a simple cream felt
> house, (7) round coral Back icon patch with a simple cream left arrow, (8)
> round mustard Sound icon patch with a simple cream speaker; (9) friendly
> standing pencil buddy made from mustard felt with embroidered face, (10)
> sleepy five-point plush star with closed embroidered eyes, (11) awake happy
> five-point plush star with open embroidered eyes, (12) celebratory felt
> rosette medal. Match the attached coral, teal, mustard, and cream quiet-book
> references. Visible blanket stitches, soft stuffing, fabric fibers, subtle
> contact shadows contained within each isolated object. Transparent background,
> generous gutters, no touching components, no words, numerals, letters,
> watermark, duplicate objects, or extra decorations.

## GPT Image 2 edit: replay control

**Input:** the accepted `nav-back` crop from the coordinated contact sheet
**Output:** `nav-replay-master.png` (1254×1254, transparent)

> Edit only the symbol inside this round stitched felt patch. Replace the cream
> left arrow with one bold cream circular replay arrow. Preserve the exact teal
> wool felt, round padded silhouette, cream blanket stitching, lighting, scale,
> camera angle, and transparent background. One isolated icon only. No play
> triangle, text, extra symbols, new scene, border change, or watermark.

## GPT Image 2 edit: hero title lockup

**Input:** the accepted blank `title-plaque` crop from the coordinated contact sheet
**Output:** `title-lockup-master.png` (transparent)

> Edit the supplied isolated transparent-background cream felt title plaque
> into the finished hero title lockup for a premium preschool quiet-book game.
> Preserve the exact plaque silhouette, warm cream felt, mustard blanket
> stitching, soft stuffed depth, transparent background, centered front view,
> and cozy handmade material language. Add only this exact two-line title:
> `SANDPAPER` / `NUMBER MATCH`. Make every letter a physical raised felt
> appliqué with subtle stuffing, clean sewn edge, tiny thread detail, and gentle
> natural shadow. Use warm burnt orange for the first line and deep teal for the
> second. Use chunky friendly rounded uppercase letters, generous margins, and
> balanced centered spacing. No icons, numbers, stars, extra words, signatures,
> scene, or watermark. Exact text accuracy is mandatory.

The final was inspected character by character for the exact title and on a
saturated magenta composite for alpha edges before runtime conversion.

## Local Krea 2: catalog tile

**Output:** `../local-api/hub-krea-seed42.png` (768×640)
**Seed:** 42
**Accepted use:** resized and center-cropped to the platform 640×533 hub tile.

> Premium Montessori counting toy photographed as a friendly miniature tableau:
> one large ochre sandpaper numeral 3 with cream stitched edging and exactly
> three cheerful plush felt stars arranged on a small natural-wood activity tray.
> Pale sky-blue seamless backdrop, airy centered composition, warm soft studio
> lighting, rounded child-safe forms, tactile fibers and stitching, no hands,
> no text, no other numbers, no extra stars, no watermark. QLOBE Kids catalog
> tile composition, legible at thumbnail size.

## Local Qwen Image Edit exploration

**Output:** `../local-api/nav-replay-qwen-edit.png`
**Disposition:** rejected; retained only as honest authoring evidence.

The edit asked Qwen to replace the arrow in the accepted felt navigation patch
with a circular replay arrow while preserving every other material and alpha
property. The result introduced an opaque brown scene and a play triangle, so it
failed semantic-icon and style-fidelity review. The GPT Image 2 precision edit
above is the shipped replay control.
