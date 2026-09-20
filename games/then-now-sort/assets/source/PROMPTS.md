# Then & Now generation prompts

Date: 2026-09-20. Style references: concept `00-overview.png`, `01-photo-select.png`, `02-then-and-now.png`, and `03-time-traveler.png`. The final runtime uses the accepted outputs listed below.

## GPT Image 2 — Then card sheet

> Create a single production asset sheet for a premium preschool game called Then & Now, matching the supplied warm watercolor/gouache storybook mockups. Exact 2×3 grid, six separate rounded torn-paper picture cards on a perfectly uniform flat charcoal background with generous gaps; no card may touch another. Reading order: beeswax candle in brass holder; white feather quill with blue ink pot; horse-drawn carriage; sealed paper letter; antique phonograph with brass horn; wooden washboard in a wash tub. One centered object per card, full silhouette, child-friendly proportions, handmade paper edge, soft watercolor texture, subtle shadow within each card. No text, labels, people, extra objects, logos, border around the full sheet, gradients in the charcoal ground, vector style, or glossy app rendering.

Accepted: `gpt-image-2/then-cards-sheet.png`.

## GPT Image 2 — Now card sheet

> Create the matching modern-object production sheet in exactly the same watercolor/gouache storybook style, scale, paper-card construction, charcoal ground, strict 2×3 separation, and lighting as the Then sheet. Reading order: glowing household lightbulb; colorful computer keyboard; friendly compact modern car; smartphone with one simple message bubble; colorful over-ear headphones; front-loading washing machine. One complete centered object per torn-paper card. No text, labels, people, brand marks, additional objects, cropped silhouettes, vector style, or glossy UI.

Accepted: `gpt-image-2/now-cards-sheet.png`.

## GPT Image 2 — Splash environment

> Wide 4:3 premium children's watercolor storybook environment for Then & Now, inspired by the supplied mockups: a sunlit history-detective reading nook opening onto a gentle garden sky, an oversized blank open scrapbook resting across the lower half, brass magnifying glass, hourglass, globe edge, old photographs, books, ivy, tiny gold stars, blue/cream/lavender palette with coral and green accents. Keep a broad clean sky area for a title and two clear blank book-page zones for large mode choices. Rich hand-painted edges, warm paper texture, inviting and magical but calm. Environment only: no people, no words, no letters, no UI buttons, no logos, no vector/flat app art.

Accepted: `gpt-image-2/splash-background.png`.

## GPT Image 2 — Landscape play book

> Wide 4:3 top-down watercolor illustration of one large open cream scrapbook filling almost the entire frame, left page outlined with hand-painted sky-blue stitching and right page outlined with lavender stitching, subtle paper grain, small corner leaves, flowers, hearts and gold stars, believable spine and layered paper edges, pale wood and a hint of garden beyond. Both page centers must be spacious, blank, low contrast, and symmetric enough to host large interactive picture cards. No objects in the centers, no words, no symbols that resemble text, no people, no UI, no vector style.

Accepted: `gpt-image-2/book-background.png`.

## GPT Image 2 — Portrait play book

> Tall 3:4 companion background to the accepted open-book artwork, same watercolor/gouache hand-painted paper texture and palette. A portrait scrapbook fills the frame with two generous blank rounded paper panels stacked vertically: upper panel trimmed in sky blue and lower panel trimmed in lavender, separated by a small brass book hinge. Pale wood margins, tiny leaves, one heart and a few gold stars only at corners. Keep both panel centers completely clear for game objects. No words, people, object cards, UI, vector style, or glossy rendering.

Accepted: `gpt-image-2/book-background-portrait.png`.

## GPT Image 2 — Gallery environment

> Wide 4:3 celebratory watercolor storybook background for a Time Traveler Gallery: deep indigo night watercolor at the top blending into a luminous pale-blue center, a curved trail of hand-painted gold stars traveling across the sky toward a tiny warm storybook house and garden at the lower right, soft clouds and leafy garden framing the lower corners. Keep the entire central two-thirds open and low-detail for three earned card spreads and a badge. Magical, warm, premium, handmade paper texture. No text, people, UI, frames, logos, vector art, or glossy effects.

Accepted: `gpt-image-2/gallery-background.png`.

## GPT Image 2 — UI study and title

UI study prompt:

> Production sheet of exactly six separate watercolor/gouache preschool game UI objects on a uniform flat charcoal background, strict 2×3 grid with very wide gaps and no touching: blue stitched scrapbook pocket with a tiny candle motif; lavender stitched pocket with a tiny lightbulb motif; blue circular brass magnifying-glass detective medallion; lavender circular hourglass-and-stars medallion; gold History Detective star badge with small blue and coral ribbons; long green stitched watercolor action plate with no text. Complete silhouettes, same hand-painted storybook world, no words, no extra pieces, no vector or glossy rendering.

Qwen Image Edit separation prompt, seed 42:

> Preserve the exact six painted UI objects and their colors, motifs, stitching, texture, and proportions. Rearrange them only into a strict evenly spaced 2×3 asset sheet on one perfectly uniform charcoal background, at least 100 pixels of empty charcoal between every silhouette and around all edges. Exactly six objects: blue candle pocket, lavender lightbulb pocket, blue magnifying-glass medallion, lavender hourglass medallion, gold ribbon badge, green blank action plate. No touching, cropping, text, replacement, new object, shadow bridge, or repainting.

Accepted cutter source: `local-api/qwen-edit/ui-separated-seed42.png`.

Title prompt:

> A single hand-painted watercolor/gouache title lockup that spells exactly “THEN & NOW” in large friendly cream letters with dark indigo hand-inked edges, mounted on one connected torn-paper banner with small gold stars, a tiny blue clock accent, and coral/lavender paper scraps. Centered complete silhouette on perfectly uniform flat charcoal, generous empty margin, no other words, no misspelling, no duplicate letters, no vector or glossy style.

Accepted: `gpt-image-2/title-lockup.png`; spelling visually verified.

## Local Krea 2 — catalog tile

Seed 42, 768×640, 8 steps, CFG 1:

> premium preschool game menu still life, an open ivory picture book on a pale wood table with one brass magnifying glass bridging the pages; on the left page a chunky toy candle, feather quill and tiny brass phonograph; on the right page a chunky toy lightbulb, colorful keyboard and headphones; one small hourglass and three gold star stickers complete a joyful balanced tableau, bright soft 3D cartoon toy style, rounded simplified forms, cheerful proportions, saturated but gentle aqua coral lemon and lilac palette, smooth painted-wood and soft-vinyl finish, warm studio light, objects only, no child, no person, no writing, no letters, no numbers, no logos, no UI, no border, no watermark

Accepted candidate: `local-api/hub/then-now-krea-seed-42.jpg` after visual review; installed to the catalog tile only. The in-game art world remains Watercolor / Storybook.
