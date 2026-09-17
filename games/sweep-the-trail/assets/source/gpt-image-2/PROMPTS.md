# GPT Image 2 production prompts

All images in this folder were created through Codex's built-in GPT Image 2 workflow. The concept mockups were used as composition references; `brief.md` remained canonical where the mockups drifted (the helper is a red squirrel, not a hedgehog). No runtime image calls are made by the game.

## `select-background-master.png`

Create a premium 4:3 children's game selection-screen background as a photographed miniature world made entirely from cozy felt, wool, embroidery thread, and softly padded fabric. A sunlit forest clearing with layered teal and moss-green felt trees, tiny stitched flowers, warm distant hills, and a pale blue fabric sky. Keep the broad center and lower-center calm and uncluttered for a title and three mode cards; frame the scene with foliage around the perimeter. Handmade puppet-theatre depth, visible fibers and seams, soft studio lighting, warm Montessori palette, inviting for a five-year-old. Background only: no characters, no words, no letters, no cards, no buttons, no broom, no loose leaves, no UI.

## `leaf-background-master.png`

Create a premium 4:3 active-play background for a children's sweeping game, built as a photographed cozy felt miniature. A wide winding tan felt trail travels through a friendly green forest, with embroidered edge stitching, padded moss banks, small flowers, soft layered trees, blue cloth sky, and a generous calm playable path across the middle and foreground. Leave the play surface empty so separate leaf, broom, basket, and squirrel sprites can be placed on top. Puppet / cozy felt fabric art direction, tactile fibers, rounded shapes, strong readable depth, soft warm studio light. No characters, no debris, no basket, no broom, no words, no UI.

## `acorn-background-master.png`

Using the supplied felt trail background as the style and structural reference, create a distinct Acorn Bend variant. Preserve the premium handmade puppet / cozy felt fabric world and empty 4:3 play surface, but deepen the setting into a pine woodland bend with darker teal evergreens, layered moss, fern shapes, tiny mushrooms, and a broad softly curving ochre felt trail. Keep the central and lower play area calm, clean, and free of objects for game sprites. Match fiber scale, stitch language, lens, lighting, and perspective. No characters, no acorns, no basket, no broom, no text, no UI.

## `porch-background-master.png`

Using the supplied felt trail scene as the tactile style reference, create a distinct Porch Path play background in the same handmade puppet world. A welcoming cottage porch made from broad tan felt planks and a large calm stitched oatmeal doormat, with a blue fabric door and a few soft potted plants restricted to the upper edge. 4:3 composition with most of the center and foreground empty and readable for separate crumb, broom, dustpan, and squirrel sprites. Visible fibers and seams, soft warm daylight, rounded child-safe shapes. No characters, no crumbs, no dustpan, no broom, no words, no UI.

## `asset-sheet-v1.png`

Create one clean production asset sheet on a flat plain white background in premium handcrafted cozy felt puppet style. Arrange exactly twelve complete, widely separated objects in a strict 4-by-3 reading order with generous white gutters and nothing touching: friendly helper character standing; same helper cheering; toy broom with brown handle, teal collar, golden bristles; woven felt basket; teal-and-gold felt dustpan; orange leaf; mustard leaf; green leaf; single acorn; one connected cluster of tiny crumbs; blank padded progress plaque; golden stitched star cluster. Consistent three-quarter studio lighting, tactile fibers, thick soft silhouettes, no cast scene, no labels, no text, no borders, no cropped objects.

The first character pass drifted to the mockup hedgehog. Qwen Image Edit corrected those two cells to the canonical red squirrel; see `../local-api/qwen-character-correction-prompt.txt` and `../local-api/asset-sheet-qwen-squirrels.png`.

## `mode-cards-master.png`

Create a clean asset sheet containing exactly three complete premium padded felt scene cards in one horizontal row, evenly spaced on a flat dark-charcoal background. Each card has the same rounded stitched cream rim and no text. Card one: a sunny green forest trail with three colorful leaves and a small basket. Card two: a deeper pine trail bend with several acorns and a basket. Card three: a cozy cottage porch mat with tiny crumbs and a dustpan. Rich handcrafted wool fibers, miniature puppet-theatre lighting, instantly distinct scenes, generous dark gutters, no labels, no logos, no extra objects, no crop.

## `title-lockup-master.png`

Create a single transparent title lockup for a premium children's game in handmade padded felt. Spell exactly `SWEEP THE TRAIL` in large chunky cream felt letters with cocoa-brown stitched edging, arranged as a compact two-line title. Add a small friendly golden felt broom and two or three tiny autumn leaves as supporting accents without obscuring any letter. Cozy puppet craft, tactile fibers, crisp readable silhouette, warm studio light, genuine transparent RGBA background, ample padding. No plaque, no scenery, no subtitle, no extra words, no misspelling.

## `broom-transparent-master.png`

Edit the supplied asset for production use. Preserve the exact handcrafted cozy felt toy broom: warm brown felt handle, teal-blue stitched collar, golden-orange chunky felt bristles, same proportions, angle, texture, lighting, and friendly tactile style. Remove the entire white background and remove the tiny stray red fragment at the far left edge. Output exactly one complete broom on a genuinely transparent RGBA canvas with clean soft fuzzy edges and comfortable transparent padding. No floor, no shadow backdrop, no outline, no text, no extra object, no crop, no checkerboard, no white matte.

## `progress-plaque-transparent-master.png`

Edit this supplied production asset only. Preserve the exact blank dark-cocoa padded felt progress plaque, its continuous rounded outer rim, cream blanket stitching, proportions, wool texture, warm lighting, and completely unbroken top edge. Remove the entire white background. Output exactly one complete plaque on a genuinely transparent RGBA canvas with clean soft fuzzy outer edges and comfortable transparent padding. The plaque itself must remain fully solid with no transparent holes, gaps, notches, missing stitches, or removed brown fabric anywhere. No text, no icons, no floor, no shadow backdrop, no outline, no crop, no checkerboard, no extra object, no redesign.

## `mode-acorn-bend-transparent-master.png`

Edit this supplied production mode-card asset only. Preserve the complete Acorn Bend padded felt scene card exactly: every pine tree, path, three acorns, basket, mushroom, rock, inner cream stitched border, outer brown felt rim, proportions, colors, wool fibers, and lighting. Remove only the flat dark charcoal area outside the rounded outer brown card. Output exactly one complete unbroken card on a genuinely transparent RGBA canvas with clean soft fuzzy outer edges and comfortable transparent padding. The whole card interior and all four rounded rim edges must remain fully intact and opaque. No holes, no missing interior, no removed border, no redraw, no crop, no text, no label, no new object, no checkerboard, no charcoal matte.

## `mode-leaf-lane-transparent-master.png`

Edit this supplied production mode-card asset only. Preserve the complete Leaf Lane padded felt scene card exactly: blue sky, cloud, fence, green garden, flower leaves, three stepping stones, three colorful leaves, basket, inner cream stitched border, outer green felt rim, proportions, colors, wool fibers, and lighting. Remove only the flat dark charcoal area outside the rounded outer green card. Output exactly one complete unbroken card on a genuinely transparent RGBA canvas with clean soft fuzzy outer edges and comfortable transparent padding. The whole card interior and all four rounded rim edges must remain fully intact and opaque. No holes, no missing interior, no removed border, no redraw, no crop, no text, no label, no new object, no checkerboard, no charcoal matte.

## `mode-porch-path-transparent-master.png`

Edit this supplied production mode-card asset only. Preserve the complete Porch Path padded felt scene card exactly: blue door, stone and timber wall, two plants, steps, brown crumb mat, three crumbs, teal-and-gold dustpan, inner cream stitched border, outer golden-brown felt rim, proportions, colors, wool fibers, and lighting. Remove only the flat dark charcoal area outside the rounded outer golden-brown card. Output exactly one complete unbroken card on a genuinely transparent RGBA canvas with clean soft fuzzy outer edges and comfortable transparent padding. The whole card interior and all four rounded rim edges must remain fully intact and opaque. No holes, no missing interior, no removed border, no redraw, no crop, no text, no label, no new object, no checkerboard, no charcoal matte.
