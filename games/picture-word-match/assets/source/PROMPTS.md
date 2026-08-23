# Reading Buddies production prompts

Primary model path: built-in GPT Image 2-class generation, using the approved
concept mockups as style/composition references. Local API passes extend the
accepted family with `qwen-image-edit`, separate flat-ground subjects with
`qwen-image-layered` (`output=layer_2`), create the hub tile with
`krea2-turbo-t2i`, and produce/Whisper-check teacher narration.

## Shared visual specification

Use case: `illustration-story` / `stylized-concept`
Asset type: tablet learning-game production art
Style/medium: premium children's picture-book watercolor and gouache on lightly
textured cotton paper; colored-pencil and gentle ink definition; visible washes,
soft hand-painted edges, slight handmade irregularity, and restrained contact
shadows
Palette: warm paper cream, clear sky blue, leaf and meadow greens, golden yellow,
tangerine, teal, and lavender
Constraints: preserve the supplied Reading Buddies mockups' material language,
outline softness, proportions, and optimistic preschool warmth; no vector look,
no 3D render, no photorealism, no logos, no watermark
Avoid: glossy app gradients, generic flat UI, hard digital strokes, gray stock
backgrounds, malformed objects, extra subjects, illegible text

## A. Reading garden backdrop

Use case: `illustration-story`
Asset type: full-bleed 4:3 game environment plate
Input images: the three supplied Reading Buddies UI mockups are style and mood
references only
Primary request: a quiet magical reading garden where a large storybook could be
opened and played with
Scene/backdrop: blue watercolor sky, soft distant trees, rolling green meadow,
small flowers and leafy plants concentrated around the outer edges, subtle warm
paper texture throughout
Composition/framing: exact 4:3 landscape; calm uncluttered central 65 percent and
calm top band for live game cards and prompts; foreground botanicals may frame
the lower corners; no book, cards, characters, targets, buttons, words, letters,
or UI baked into the scene
Lighting/mood: clear gentle morning, welcoming and unhurried
Output intent: opaque source master for deterministic crop to 1600×1200 WebP

## B. Reading Buddies title lockup

Use case: `logo-brand` rendered as storybook illustration
Asset type: splash title art for chroma extraction
Input images: mockup `01-picture-set.png` is the composition and spelling
reference
Primary request: render exactly one playful painted title, “Reading Buddies”
Composition/framing: one centered two-word lockup on a perfectly flat solid dark
charcoal background; Reading in deep storybook blue and Buddies in warm orange;
soft cream torn-paper edge around the letters; generous clear margin; no other
text, characters, books, stars, UI, or scenery
Text (verbatim): "Reading Buddies"
Constraints: spell both words exactly once; every letter clean and complete;
flat removable background; no watermark

## C. Animals word-art sheet

Use case: `illustration-story`
Asset type: fixed 3×2 game-sprite contact sheet for later deterministic slicing
Primary request: six isolated, coordinated watercolor storybook subjects in this
exact grid—top row: friendly gray sitting cat; friendly spotted puppy dog;
friendly pink pig. Bottom row: plump brown hen; friendly orange fox with white
tail tip; friendly red ladybug with black spots
Composition/framing: exact equal 3 columns × 2 rows, one complete centered subject
per cell, consistent visual scale and light direction, generous padding, no cell
dividers and no subject crossing a cell boundary
Scene/backdrop: perfectly flat uniform dark charcoal, no texture, gradient,
ground, or cast shadow on the background
Constraints: exactly six subjects, no text, no labels, no extra props, no crop,
no watermark

## D. Food word-art sheet (reference edit)

Use case: `style-transfer`
Asset type: fixed 3×2 game-sprite contact sheet
Input images: accepted Animals sheet is the style, scale, paper, lighting, and
grid reference
Primary request: change the six subjects only, preserving the exact visual
family and grid—top row: round golden bread bun; open jar of red strawberry jam;
single neat slice of pink ham. Bottom row: ripe purple fig; orange yam; brown
acorn nut
Constraints: exact 3×2 grid, one subject per cell, flat uniform dark charcoal
background, no text, no labels, no extra props, no crop, no watermark

## E. Things word-art sheet (reference edit)

Use case: `style-transfer`
Asset type: fixed 3×2 game-sprite contact sheet
Input images: accepted Animals sheet is the style, scale, paper, lighting, and
grid reference
Primary request: change the six subjects only, preserving the exact visual
family and grid—top row: yellow school bus; blue sun hat; open brown cardboard
box. Bottom row: bright yellow drinking cup; small blue-and-white passenger jet;
cheerful teal van
Constraints: exact 3×2 grid, one subject per cell, flat uniform dark charcoal
background, no text, no labels, no extra props, no crop, no watermark

## F. Chapter and activity emblems

Use case: `illustration-story`
Asset type: fixed 3×2 wordless icon contact sheet
Primary request: six large storybook emblems in an exact 3×2 grid. Top row:
three animal friends peeking from a tiny open book; a cheerful picnic basket with
bun, jam, and fig; a tiny yellow bus beside a blue hat and yellow cup. Bottom
row: a picture card meeting a printed-word ribbon represented only by three
simple blank marks; a friendly listening ear beside an open picture book; three
painted letter seeds settling into three empty book spots
Composition/framing: one complete emblem per equal cell, centered and readable at
small size, consistent scale, flat uniform dark charcoal background
Constraints: no actual letters, no words, no labels, no cell dividers, no extra
subjects, no watermark

## G. Painted carriers and feedback kit

Use case: `stylized-concept`
Asset type: exact 4×3 game-UI sprite sheet
Primary request: twelve blank watercolor paper UI carriers in an exact 4×3 grid.
Row 1: four tall rounded picture-card frames with blue, orange, leaf-green, and
lavender painted edges. Row 2: four wide rounded word ribbons in the same four
colors. Row 3: five small rounded letter-seed tiles (blue, orange, green,
lavender, yellow) plus one large green painted check stamp, arranged so the five
tiles occupy the first three cells cleanly without touching and the check fills
the fourth cell
Scene/backdrop: perfectly flat uniform dark charcoal
Constraints: all carriers completely blank; no letters, words, pictures,
symbols except the check; exact cell boundaries; no crop; no watermark

## H. Book and reward kit

Use case: `illustration-story`
Asset type: exact 3×2 game-UI sprite sheet
Primary request: six coordinated watercolor storybook UI objects in an exact
3×2 grid. Top row: large blank open book viewed almost front-on; smaller open
listening book pocket with a subtle painted sound ripple but no icon glyph;
closed decorated picture book with three blank stamp spots. Bottom row: golden
blank celebration ribbon; dotted lavender watercolor trail curving gently from
upper left to lower right; a small cluster containing three separate reward
stamps—a star, a leaf, and an acorn—with clear gaps between them
Scene/backdrop: perfectly flat uniform dark charcoal
Constraints: no words, letters, labels, UI text, extra objects, crop, or watermark

## I. Buttons and HUD kit

Use case: `stylized-concept`
Asset type: exact 3×2 watercolor game-UI sprite sheet
Primary request: top row—three cream watercolor circle buttons containing a
simple deep-blue home symbol, back arrow, and speaker symbol. Bottom row—one wide
blank teal painted action button, one wide blank blue painted action button, and
one blank cream letter-slot tile with a stitched/pencil edge
Composition/framing: one complete centered object per equal cell, generous
padding, flat uniform dark charcoal background
Constraints: no text or letters; symbols must be unmistakable; no crop; no
watermark

## J. Hub tile (local Krea / Studio)

Use the Studio `menu-game-tile` template and `toy-table` style. Accepted subject
(verbatim): “a cozy wooden tabletop close-up of one friendly hand-painted gray
cat picture card tucked into a small open illustrated picture book, with three
blank painted paper ribbons in sky blue, warm orange, and leaf green, every
ribbon completely unmarked, arranged as a playful reading match in warm window
light.” No title, words, letters, app UI, or watermark.

Seed ladder: seed 42 was rejected because it baked literal letters into the
objects; seed 1337 was rejected because the sparse white presentation felt
sterile; seed 9001 is the accepted 768×640 source. The exact expanded prompt and
Studio fields are retained in `local-api/hub-krea-seed9001.recipe.json`. Curate
to the 640×533 hub JPEG only after visual review.
