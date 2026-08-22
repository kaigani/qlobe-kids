# GPT Image 2 production prompts

Reference set for all nine generations:

- `01-game-concepts/clean-up-timer-quest/output/ui-mockups/00-overview.png`
- `01-game-concepts/clean-up-timer-quest/output/ui-mockups/01-room-select.png`
- `01-game-concepts/clean-up-timer-quest/output/ui-mockups/02-sort-the-toys.png`
- `01-game-concepts/clean-up-timer-quest/output/ui-mockups/03-room-sparkling.png`

Shared direction: premium preschool **Toy** art world; tactile painted wood,
woven fiber, plush fabric, softly rounded child-safe construction, warm
storybook household light, gentle imperfections, coherent scale and palette;
no emoji, vector art, flat UI illustration, text, letters, watermark, logo, or
licensed character. Contact sheets require an exact 3×2 grid with generous
clear gutters and a perfectly flat saturated magenta key background.

## `title-gpt-image-2.png`

> A single delightful handcrafted wooden title plaque reading exactly
> “Clean-Up Timer Quest”, with every letter correctly spelled and clearly
> separated. Chunky dimensional painted letters, warm cream, coral, mustard,
> teal and leaf-green accents, tiny toy-block and woven-basket ornaments,
> centered straight-on, isolated on perfectly flat saturated green chroma,
> nothing else in frame. Preserve the cheerful proportions and palette of the
> supplied Clean-Up Timer Quest mockups. No subtitle, extra words, or malformed
> letters.

## Room plates

`playroom-gpt-image-2.png`

> A warm handcrafted wooden-dollhouse playroom, straight-on tablet-game view:
> sage-green wall, sunny window, low wooden shelves, cozy cream rug, small
> reading nook, woven details, calm open center and lower-center play space.
> The room is already tidy and contains no loose toys, baskets, labels, people,
> UI, text, or logo. 4:3 crop-safe composition with open safe zones at both top
> corners and enough floor for four overlaid toy objects and two large baskets.

`bedroom-gpt-image-2.png`

> A cozy Toy-world child's bedroom, straight-on tablet-game view: dusty blue
> wall, warm wood bed on the right, moon-and-star quilt, low book shelf, woven
> round rug, small window and warm lamp light, calm open center floor. Already
> tidy, with no loose clothes or books, baskets, people, UI, text, or logo. 4:3
> crop-safe composition with clear top corners and generous play space.

`living-room-gpt-image-2.png`

> A friendly handcrafted Toy-world family living room, straight-on tablet-game
> view: moss-green sofa on the left, low warm-wood console, sunny window,
> rounded teal rug and a broad calm center floor. Already tidy, with no loose
> vehicles or instruments, baskets, people, UI, text, or logo. 4:3 crop-safe
> composition with clear top corners and generous play space.

## Coordinated 3×2 contact sheets

`playroom-items-gpt-image-2.png`

> Exact 3 columns by 2 rows. Reading order: golden-brown teddy bear; cream
> floppy-eared bunny; teal plush elephant with mustard inner ears; painted red
> wooden cube; painted blue wooden arch block; painted yellow wooden roof
> triangle. One complete centered object per cell, consistent front three-
> quarter view and scale, nothing touching a gutter, no shadow beyond the
> object, flat saturated magenta background.

`bedroom-items-gpt-image-2.png`

> Exact 3 columns by 2 rows. Reading order: mustard child's sweater with one
> star; paired coral-and-cream striped socks; folded blue moon-print pajamas;
> upright moon picture book; upright friendly fox picture book; upright rainbow
> picture book. One complete centered object per cell, consistent toy-like
> proportions, no readable words or letters, nothing touching a gutter, flat
> saturated magenta background.

`living-room-items-gpt-image-2.png`

> Exact 3 columns by 2 rows. Reading order: red wooden toy train; yellow wooden
> toy car; blue wooden toy airplane; small red-and-blue toy drum; paired painted
> maracas; rainbow wooden xylophone. One complete centered object per cell,
> coherent scale and three-quarter view, nothing touching a gutter, flat
> saturated magenta background.

`bins-gpt-image-2.png`

> Exact 3 columns by 2 rows of six large open toy-storage homes. Reading order:
> green woven basket with a wooden teddy-face picture badge; blue block box with
> a three-block picture badge; coral woven hamper with a shirt picture badge;
> mustard wooden book crate with a three-book picture badge; teal toy garage/bin
> with a wheel picture badge; purple woven basket with a drum picture badge.
> No words. Front three-quarter view, each opening clearly usable, no objects
> inside, consistent scale, nothing touching a gutter, flat saturated magenta.

## `timer-track-gpt-image-2.png`

> One long handcrafted wooden wind-up music timer rail, straight-on and
> isolated. Exactly eight large round painted beads in a cheerful rainbow row,
> a simple carved music-note mark at each end, four small brass pins, and one
> red wind-up key on the right. No numbers, words, extra beads, UI panel, hands,
> or background objects. Centered with wide clean margin on perfectly flat
> saturated magenta.

## Deterministic and local-model stages

- Title matte: Codex imagegen `remove_chroma_key.py`, border auto-key,
  soft matte, threshold 12/220, despill; full-size spelling/edge inspection.
- Contact sheets and timer: Qwen Image Layered seed 42, retained `layer_2`
  output plus saturated-magenta QA composite and Studio recipe.
- Hub source and exact local edit prompts are retained verbatim in the two
  `assets/source/hub/*.recipe.json` files.
