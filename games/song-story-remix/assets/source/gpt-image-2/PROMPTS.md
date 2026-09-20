# GPT Image 2 production prompts

The concept mockups in `01-game-concepts/song-story-remix/ui-mockup/` and the Kawaii art-world brief were supplied as visual references. The accepted generations were made as separate plates/sheets so no generated lettering or accidental layout became game logic. The shared cutter, not manual masking, produced runtime pieces.

## 1. Song-select theater (`select-background.png`)

> Create a premium 4:3 Kawaii preschool game background matching the supplied Song Story Remix mockups: a magical miniature song theater made of plush plum velvet, warm cream paper, rounded gold marquee bulbs, tiny coral and teal music-note decorations, soft painted gouache texture, storybook depth, generous center stage for three large songbook cards, quieter top center for a title, and clear lower corner space for controls. Front-facing tablet composition, richly finished but calm, no characters, no cards, no buttons, no words, no logos, no UI text, no gradients, no vector look.

## 2. Remix storybook theater (`remix-background.png`)

> Create a premium 4:3 Kawaii preschool remix screen background in the exact same plush plum, cream, gold, coral, and teal art world as the references. A huge open cream storybook sits center stage, its blank pages taking the middle third for four short lyric lines; rounded theater curtains, stitched trim, glowing bulbs, little music-note props, and shallow toy-diorama depth surround it. Preserve open space below the book for three picture tokens and along the bottom for a small band and two actions. No characters, tokens, controls, words, letters, logos, SVG, vector, or flat CSS-style shapes.

## 3. Concert stage (`concert-background.png`)

> Create a premium 4:3 Kawaii preschool concert-stage background matching the same Song Story Remix world: deep plum scalloped curtains opening onto a luminous teal night stage, gold marquee bulbs, cream and coral trim, tiny stars and musical confetti, a broad empty floor for four performers, uncluttered top space for one lyric line, and open right-side room for an optional portrait camera frame. Soft handcrafted gouache, plush/felt dimensionality, joyful theatrical lighting, no people, no animals, no instruments, no words, no controls, no logos, no vector art.

## 4. Title lockup (`title-lockup.png`)

> On transparent background, paint one complete Kawaii title lockup reading exactly “SONG STORY REMIX”. Chunky hand-lettered cream and sunshine-gold letters with plum shadow, coral and teal accents, a tiny microphone, star, and music notes integrated around—not through—the words. Match the plush hand-painted concept mockup. Wide horizontal silhouette, excellent readability at tablet size, no extra words, no border, no background plate. Preserve true alpha.

## 5. Song card sheet (`song-cards-sheet.png`)

> On a plain near-black background, create exactly three large, fully separated Kawaii open-storybook game cards in one horizontal row with wide empty gutters. Left: cozy rainy-day puddles and a smiling raindrop. Center: midnight space trip with rocket and bright star. Right: lush jungle walk with leaves and a friendly tiger. Consistent cream paper, plum binding, gold/coral/teal trim, soft gouache and plush toy depth matching the supplied mockups. Each card must be complete, front-facing, similarly sized, not touching, with no labels, letters, logos, borders around the full sheet, or additional objects.

## 6. Story token sheet (`story-tokens-sheet.png`)

> On transparent background, paint exactly nine complete Kawaii story-swap tokens in a clean 3×3 grid, equal visual size, generous gutters, no overlap: blue raindrop, yellow duck, purple umbrella; gold star, green frog, coral songbird; orange tiger, brown monkey, bright parrot. Each is a single chunky plush/gouache preschool object with a friendly face and subtle cream rim, matching the Song Story Remix mockup world. No text, captions, panels, shadows cut off by edges, extra props, or background. Preserve alpha.

## 7. Performer sheet (`performers-sheet.png`)

> On transparent background, paint exactly four complete full-body Kawaii concert performers in one horizontal row with generous separation: cheerful preschool child Leo holding a toy microphone, tiny yellow-blue songbird musician, mint-green frog musician, and orange tiger musician. All face mostly forward, share the same plum/gold/coral/teal stage costumes and handcrafted gouache/plush style, and fit a consistent baseline. Big friendly expressions, dynamic ready-to-sing poses, no text, no background, no cropped limbs, no overlap. Preserve alpha.

## 8. Control prop sheet (`controls-sheet.png`)

> On transparent background, create exactly six separate oversized Kawaii game-control props arranged in a clean 3×2 grid with very wide gutters: gold play triangle on a plush cream button, coral microphone/record button, plum stop square, teal replay arrow, gold save star/book, and purple song-library book. Match the Song Story Remix mockup with chunky toy construction, rounded gold edging, painted highlights, strong silhouettes readable at 96 px. Icons only: no words, letters, full-sheet panel, extra objects, overlap, or vector-flat appearance. Preserve alpha.

## 9. Camera frame (`camera-frame.png`)

> Create one tall 4:5 Kawaii camera-preview frame on transparent background: plush plum theater curtains and rounded gold marquee trim around a very large fully transparent portrait opening, a small star crest at top, tiny coral and teal music notes, and a simple stage-foot base. Front-facing, symmetric, premium hand-painted gouache/felt style matching Song Story Remix. The central opening must remain true alpha and occupy most of the frame. No person, face, photo, words, buttons, logos, background, or extra frame.

## Acceptance notes

- GPT-generated lettering is used only for the accepted title lockup; every action and song title is live HTML.
- Contact sheets were accepted only after exact component-count dry runs with `tools/cut-asset-sheet.py`.
- The committed magenta QA sheet verifies true transparency and clean cuts.
- Generated sources are authoring masters; runtime files are resized WebP outputs to keep the game responsive on tablets.
