# GPT Image 2 production prompt ledger

Generated on 2026-09-18 with Codex's built-in `image_gen` tool using the
GPT Image 2 backend. No web images, stock art, or third-party reference images
were used. The three portrait plates are edits/outpaints of their matching
landscape masters; all other masters are original text-to-image generations.

## Shared visual language

Every prompt carried this art direction unless a prompt below supersedes it:

> Luminous hand-painted watercolor and soft gouache on warm cold-press paper,
> premium contemporary children's storybook illustration, gentle inkless
> edges, layered leaf-green washes, sky blue, ochre earth, coral accents,
> friendly preschool proportions, warm morning light, rich tactile pigment,
> cohesive authored art for one game. No photorealism, 3D render, gradients,
> text, UI, characters, logos, borders, or watermarks unless requested.

## Landscape plates

### `select-backdrop-master.png`

> A welcoming 4:3 storybook meadow clearing for a children's trail-selection
> screen. Leafy branches frame the upper corners; a pale blue open sky leaves a
> title-safe area in the upper center; wildflowers, rocks, and a broad golden
> footpath create depth below. Keep the middle open enough for three scenic
> cards and the lower center open enough for a large painted Start plaque.
> Full-bleed environment only, no fox, text, UI, frames, or glowing line.

### `forest-stage-master.png`

> A full-bleed 4:3 forest-meadow tracing stage. Create one broad, continuous,
> pale ochre dirt path beginning inside the lower-left foreground, winding in a
> smooth generous S through a wildflower clearing, and finishing safely in the
> upper-right. Sun-dappled trees, distant blue-green hills, rocks, and flowers
> frame but never obstruct the trail. Leave open space along the path for a
> small fox game character. No fox, flag, text, UI, or glowing overlay.

### `river-stage-master.png`

> A full-bleed 4:3 sparkling stream crossing in the same watercolor storybook
> world. One unmistakable diagonal route begins on a pale ochre lower-left bank,
> crosses on broad, child-safe stepping stones through clear turquoise water,
> and reaches an upper-right bank. Reeds, rounded rocks, flowers, trees, and
> distant hills add wonder without hiding the crossing. No fox, flag, text,
> UI, bridge rails, or glowing overlay.

### `rainbow-stage-master.png`

> A full-bleed 4:3 high meadow beneath one soft complete watercolor rainbow.
> One broad pale ochre trail begins in the lower-left foreground, makes several
> playful but readable sweeping curves through wildflowers, and ends in the
> upper-right. Preserve an open corridor for tracing and a fox character. No
> fox, flag, text, UI, or glowing overlay.

### `complete-stage-master.png`

> A joyful 4:3 sunrise meadow finale in the established watercolor storybook
> world: open golden clearing, distant blue hills, leafy canopy corners,
> abundant flowers, and warm celebratory light. Reserve the left/lower area for
> a celebrating fox and flag and the upper-right for a large success message,
> badge, and painted button. Environment only; no character, flag, badge, text,
> button, confetti, or UI in the plate.

## Transparent asset sheets

### `fox-poses-sheet-master.png`

> Transparent RGBA character sheet, exactly six isolated full-body poses of the
> same small orange fox mascot Fia, arranged in a clean 3 by 2 reading-order
> grid with generous separation and no overlap. Preserve the exact same face,
> orange-and-cream markings, fluffy white tail tip, rounded preschool anatomy,
> watercolor/gouache pigment, scale, and three-quarter view. Poses in order:
> calm ready; careful left step; careful right step; gentle pause/recovery;
> delighted flower-bloom reaction; joyful two-paws-up celebration. No ground,
> shadows, props, labels, borders, extra objects, text, or duplicate fragments.

### `ui-sheet-master.png`

> Transparent RGBA production sheet with exactly five separated storybook
> watercolor UI objects in one horizontal reading-order row: (1) a wide blank
> warm-wood action plaque with leafy green trim and tiny white flowers, large
> empty center; (2) one closed flower bud; (3) the matching fully opened coral
> flower; (4) one blank coral fabric finish pennant on a short twig pole; (5) a
> round golden paw-print achievement badge inside a leafy wreath. Clean alpha,
> no cast shadows, no overlap, no labels, no letters, no extra objects.

### `title-lockup-master.png`

> Transparent RGBA hand-painted title lockup spelling exactly, and only,
> "LINE WALKING" on the first line and "CHALLENGE" on the second. Chunky rounded
> storybook letters with teal, bark brown, and leaf green watercolor pigment,
> subtle paper texture, a small golden winding trail underline, a few leaves,
> and two tiny white flowers. Centered, extremely legible, no background plate,
> no misspelling, no extra text, no cropped decoration.

## Portrait edit/outpaint plates

Each edit used its matching landscape master as the only image reference.

### `forest-stage-portrait-master.png`

> EDIT / PORTRAIT OUTPAINT. Preserve the exact luminous watercolor-and-gouache
> storybook style, paper texture, palette, vegetation, light, and identity of
> the forest meadow. Recompose and extend it into a tall portrait tablet game
> background, approximately 2:3. Add generous sky and leafy canopy above and a
> flower-meadow foreground below so it feels natively portrait, never padded.
> Preserve one broad continuous dirt trail beginning safely in the lower
> foreground, winding in a gentle S through center, and ending inside the
> upper-right. Keep the entire corridor open for Fia. No fox, people, text, UI,
> icons, flag, glowing line, border, or frame.

### `river-stage-portrait-master.png`

> EDIT / PORTRAIT OUTPAINT. Preserve the exact watercolor storybook stream,
> stones, vegetation, palette, light, and paper texture. Recompose and extend to
> a tall portrait tablet background, approximately 2:3, with generous sky and
> hills above and a lush flower-and-reed foreground below. Preserve one clearly
> readable crossing from the lower-left ochre bank, over broad stepping stones
> through center, to the upper-right bank. Keep it open for Fia. No fox, people,
> text, UI, icons, flag, glowing line, border, or frame.

### `rainbow-stage-portrait-master.png`

> EDIT / PORTRAIT OUTPAINT. Preserve the exact watercolor storybook palette,
> meadow, light, pigment, and identity of the rainbow scene. Recompose and
> extend to a tall portrait tablet background, approximately 2:3. Add generous
> blue sky and one complete soft rainbow above and a lush flower foreground
> below. Preserve one broad continuous dirt trail beginning in the lower
> foreground, making two gentle S bends through center, and ending safely in the
> upper-right. Keep it open for Fia. No fox, people, text, UI, icons, flag,
> glowing line, border, or frame.

## Hub tile fallback

### `hub-tile-master.png`

> A premium 6:5 preschool game-menu tile: cheerful toy-like orange fox carefully
> following one glowing golden winding trail through a miniature flower meadow,
> five blooms, and a tiny blank finish pennant. One immediately recognizable
> balance-walking game moment, staged as rounded tactile toy objects with bright
> soft 3D forms, saturated friendly colors, smooth shading, and gentle glossy
> highlights. Clean silhouette, no child hand, text, letters, UI, border, logo,
> or watermark.

This GPT Image 2 tile is the committed fallback because the approved Krea 2
Studio job failed upstream. The failure and retry record is in
`../local-api/FAILED-JOBS.md`.
