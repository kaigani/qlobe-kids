# Story-choice card production prompt

Accepted master: `story-cards-v1.png`
Built-in GPT Image execution: `exec-92e1a63a-2b4b-4715-b27c-18391ca44e31`
References: the three accepted Krea backdrops and `../ui-mockups/00-overview-v1.png`.

> Create one production-ready Papercraft contact sheet containing exactly THREE tactile vertical story-choice cards for a premium preschool reading game, using the supplied Momma Bear's Storybook mockup for material language and the three supplied scenes as visual anchors. CANVAS: landscape 3:2, divided conceptually into exactly three equal vertical columns, no visible grid. One centered portrait card in each column, identical outer size and proportions, generous flat background margin, no overlap, no crop. LEFT CARD — The Little Mill and the Sea: a friendly tiny cream-and-cranberry paper windmill above layered teal sea waves, one warm bun and a tiny blue sailboat as small supporting motifs; cheerful daylight. CENTER CARD — Fia and the Pink Flowers: a terracotta pot overflowing with dusty-pink paper flowers, a silly friendly green cabbage peeking beside it, a small gold cup and pale-blue water ribbon; moonlit cottage-garden palette. RIGHT CARD — The Glass Hill: a luminous pale-blue vellum hill curling upward, one gentle warm-gold papercraft horse and exactly three gold paper apples at the top; magical navy night. CARD CONSTRUCTION: each is a real handmade layered cardstock bookmark/card with deep ink-blue felt backing, warm cream deckled paper border, visible blanket stitching, fibers, cut edges and tiny cranberry/sage corner accents. Reserve the bottom 24 percent of EVERY card as a completely BLANK warm-cream sewn label panel for live HTML title text; absolutely no marks inside the label panel. All imagery stays above that blank panel. Perfectly flat uniform saturated magenta #FF00A8 background, no texture, gradient, table, floor, scene outside cards, cast shadow, or vignette. Exactly three cards and no other objects. No words, letters, numbers, captions, symbols, labels, watermark, logo, vector look, flat UI, glossy plastic or CGI. Preserve strong silhouette and phone-size readability. Output should be suitable for exact 3-column cropping and background removal.

## Accepted derivation

The 1536×1024 master is cropped into three exact 512×1024 columns in reading
order. `tools/defringe-alpha.mjs` keys the sampled magenta (`#f80488`,
similarity `0.12`, blend `0.04`) while preserving alpha, then applies two
one-pixel alpha erosions. Runtime copies are WebP q91/method6 and keep the blank
paper panels free for accessible HTML titles.
