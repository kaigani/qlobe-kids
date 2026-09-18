# GPT Image 2 production prompts

Model: `gpt-image-2`. Art direction: **Papercraft**. The 4:3 concept mockups supplied composition guidance; they were not copied as runtime pixels. Every selected output was inspected at full size for anatomy, title spelling, child-safe staging, clear silhouette, paper material fidelity, unwanted text, and overlay-safe space.

## Full-scene masters

### `select-backdrop-master.png`

> A premium preschool game selection backdrop in a handmade layered papercraft world, landscape 4:3. A cozy living room has opened into a tiny indoor forest adventure: coral paper theater curtains in the top corners, a cream paper wall and sofa behind, lush layered teal and green paper trees and plants, a bright shallow blue river across the middle, one friendly broad log and round stepping stumps, and a large calm warm-wood paper floor across the lower half for three UI cards. Centered symmetrical composition, warm studio lighting, tactile cut-paper fibers, rounded safe shapes, rich coral-teal-green-yellow palette, no characters, no interface, no labels, no text, no letters, no logos.

### `log-stage-master.png`

> A premium preschool balance-game stage in the exact same cozy layered papercraft living-room world, landscape 4:3. Strong one-point perspective down a very broad low log bridge crossing a bright shallow blue paper river, beginning large at bottom center and ending safely at a green bank below the sofa. Keep the log center clear for a small fox character advancing through five positions. Coral theater curtains, cream wall, sofa, paper trees and plants frame the edges. Friendly and safe, tactile paper fibers and soft shadows, no character, no UI, no target markers, no words or letters.

### `lava-stage-master.png`

> A playful pretend lava-river balance stage in the same layered papercraft living room, landscape 4:3. Five large charcoal paper stepping stones form a clear alternating path from bottom center to the safe green bank, surrounded by vivid orange and coral cut-paper lava. A small cheerful paper volcano sits to the left; dark paper mountains and green leaves frame the sides. Exciting but never scary, broad safe stones, strong depth, clear central path for a fox overlay, coral theater curtains and sofa retained, no character, no UI, no words or letters.

### `hop-stage-master.png`

> A joyful hop trail in the same cozy layered papercraft living room, landscape 4:3. Five large round blue paper jumping pads recede in a simple centered sequence from the bottom foreground to the safe green bank below the sofa, linked by short blue paper tabs. Lush layered bushes, flowers, leaves, coral curtains, cream wall, and soft paper shadows. Leave every pad unobstructed for touch targets and a small fox overlay. Premium preschool app art, no character, no UI, no numbers, no words or letters.

### `complete-stage-master.png`

> A celebratory finish backdrop for the same premium layered papercraft adventure, landscape 4:3. Open bright blue paper sky in the upper half for real HTML celebration copy; coral paper theater curtains in the upper corners, fluffy white paper clouds, layered pine trees and bushes at the sides, a vivid green finish bank across the middle, and a broad log bridge crossing sparkling blue paper water toward the foreground. Keep the center and lower-left clear for a cheering fox overlay and the lower-right clear for an action button and flag. No character, no flag, no stars, no interface, no text, no letters, no logo.

## Coordinated transparent assets

### `title-lockup-master.png`

> Transparent-background title graphic. Spell exactly: "Balance Beam Trail". Large friendly cream cut-paper letters with fully correct readable spelling on a torn coral paper banner, small teal ribbon tails behind it, a few simple yellow and cream paper leaves as ornaments. One straight horizontal lockup, tactile fibers, soft dimensional shadow, premium preschool game branding. No other text, no extra letters, no character, true transparent background.

The selected title was visually spell-checked at full resolution before processing.

### `fern-poses-sheet-master.png`

> Character asset sheet on a flat dark charcoal background. Six fully separated full-body poses of the same friendly young orange fox named Fern, handmade layered papercraft, green short-sleeve explorer shirt with one leaf badge, dark green shorts, brown paws and shoes, cream muzzle and tail tip, large simple black eyes. Reading order: calm ready; careful left step with balancing arms; careful right step; wobble left; wobble right; joyful celebration with both arms up. Match face, clothing, scale, lighting, and paper texture exactly across all six. Wide gaps, nothing touching, no labels, no text, no props, no cropped ears/tail/feet.

### `fern-poses-alpha-master.png` (edit)

> Preserve all six Fern poses exactly. Remove only the flat dark background and return clean true transparency around every pose, including ears, paws, tail tips, and soft grounded paper shadows. Do not alter anatomy, expression, clothing, colors, ordering, scale, or spacing. No new objects and no text.

### `ui-sheet-master.png`

> One coordinated papercraft preschool game UI asset sheet on a flat dark charcoal background, eight fully separated objects in reading order with large gaps: (1) tall cream-framed card showing a log over blue water, (2) matching card showing stepping stones over playful orange lava, (3) matching card showing blue hop pads in a green garden, (4) wide blank golden-yellow paper action button with cream backing and a flower at each end, (5) long horizontal rounded balance rail with red-yellow-green-yellow-red paper zones and a small blue pointer, (6) chunky golden paper star, (7) orange paper finish flag with a cream star, (8) round teal paper speaker button. Consistent tactile cut-paper fibers, soft shadows, no labels, no letters, no words, no cropped edges, nothing touching.

### `ui-sheet-alpha-master.png` (edit)

> Preserve the eight UI objects exactly and in the same order. Remove only the flat dark background and return clean true transparency around every object and its intended soft paper shadow. Do not change the card scenes, colors, proportions, spacing, or object count. No added text or marks.

### `balance-rail-clean-master.png` (targeted edit after screen QC)

> Edit this exact papercraft balance control asset. Remove only the blue downward-pointing triangle/pointer at the top center, including its blue shape and drop shadow. Reconstruct the cream paper rim and green paper band naturally underneath it so the rail looks continuous. Preserve the exact rail geometry, red-yellow-green-yellow-red color bands, handmade paper texture, lighting, border, proportions, transparent background, and every other design detail as closely as possible. Do not add any new symbol, marker, text, letters, or object. Output a single isolated horizontal rail with true transparent background.

## Dedicated catalog tile

### `hub-tile-master.png`

> Create a dedicated QLOBE Kids catalog tile in a landscape 6:5 composition, using the attached Fern fox character and attached papercraft living-room adventure world as strict style and identity references. Show the same friendly orange papercraft fox Fern, full body, wearing the same green explorer shirt with leaf badge and dark green shorts, balancing with arms out on a broad low brown paper log over a bright shallow blue paper stream. Add two round stepping stumps and one chunky golden paper star in the scene, layered teal and green cut-paper plants around the edges, a hint of coral paper curtain at the upper corners, warm soft studio lighting, tactile handmade paper fibers, rounded safe preschool shapes, clear face and silhouette. One instantly recognizable balance-game moment, centered and readable at small menu size, premium polished preschool app art. No title, no words, no letters, no logo, no interface, no border, no realistic plastic or 3D render, no human feet, no extra characters. Keep all important content inside a central 6:5 safe crop.

## Finalization workflow

1. Generate and inspect full masters.
2. Use the alpha-edit outputs rather than estimated grid slicing.
3. Locate separated objects with `tools/cut-asset-sheet.py` and require the exact object count.
4. Inspect all cuts on saturated magenta.
5. Run `tools/build-assets.py` for alpha cleaning, normalized canvases, resizing, encoding, hub crop, and decode checks.
6. Inspect selection, every mode, completion, landscape, and portrait in a real browser; the clean balance-rail edit came directly from this screen-level review.
