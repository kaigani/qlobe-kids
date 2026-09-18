# Snack Addition Stories production prompts

All four primary art masters were produced with the built-in **gpt-image-2**
tool on 2026-09-17. The three concept mockups under
`01-game-concepts/snack-addition-stories/output/ui-mockups/` were supplied as
style references only. No runtime model call is made.

## Picnic backdrop

```text
Use case: stylized-concept
Asset type: 4:3 tablet game environment backdrop
Primary request: Create a full-bleed Kawaii picnic world background for the
children's math game Snack Addition Stories.
Scene/backdrop: sunny blue sky and soft cloud puffs above rounded berry bushes,
with a pink-and-cream gingham picnic cloth covering the lower half; tiny
pressed-dough flowers and one picnic basket may frame the far edges.
Style/medium: original tactile kawaii game art, soft vinyl and
frosted-cardboard forms, scalloped cream piping, cocoa-brown outlines, subtly
pressed and printed texture, polished children's tablet game.
Composition/framing: exact 4:3 landscape composition; large quiet central field
for live UI and a serving tray; decorative props stay only at extreme edges;
allow extendable sky and gingham texture for portrait cropping.
Color palette: strawberry pink, lavender, mint, butter yellow, sky blue, cream,
cocoa brown.
Constraints: background only; no text, equations, buttons, plaques, trays,
food characters, people, logos, trademarks, or watermark; center uncluttered.
```

Accepted source: `gpt-image-2/picnic-backdrop-master.png`.

## Snack cast contact sheet

```text
Use case: stylized-concept
Asset type: game snack-character contact sheet for deterministic cutting
Primary request: exactly eight separate full-body snack sprites in a strict
4-column by 2-row sheet.
Reading order: purple blackberry; red raspberry; red strawberry; single round
blueberry; orange/clementine; watermelon wedge; square golden cracker; square
cream-filled sandwich cracker.
Style/medium: tactile Kawaii children's game sprites; soft vinyl/frosted biscuit
material, cocoa eyes, joyful mouth, pink cheeks, pressed texture; one consistent
camera and light family.
Composition: generous gutters, no touching, clear repeated-count silhouettes.
Constraints: genuine alpha; exactly eight objects; no props, labels, frames,
letters, numerals, punctuation, logos, trademarks, or watermark.
```

Accepted source: `gpt-image-2/snack-cast-sheet.png`. It was cut with
`tools/cut-asset-sheet.py --expected-count 8`; see `crops/foods/boxes.json`.

## UI kit contact sheet

```text
Use case: stylized-concept
Asset type: game UI contact sheet for deterministic cutting
Primary request: exactly nine blank raster UI pieces in a strict 3x3 sheet.
Reading order: mint serving tray; pink/cream prompt plaque; cream equation
plaque; pink story card; pink answer cookie; lavender answer cookie; mint
answer cookie; butter-yellow action button; pink celebration ribbon.
Style/medium: tactile Kawaii picnic UI, frosted-cardboard/cookie forms,
scalloped cream piping, cocoa outlines, pressed printed texture.
Constraints: genuine alpha; every surface blank; no text, numerals, symbols,
icons, food, faces, people, logos, trademarks, or watermark.
```

Accepted source: `gpt-image-2/ui-kit-sheet.png`. It was cut with
`tools/cut-asset-sheet.py --expected-count 9`; see `crops/ui/boxes.json`.

## Title lockup

```text
Use case: logo-brand
Asset type: decorative raster title lockup
Primary request: centered three-line lockup with exact text “Snack” / “Addition”
/ “Stories”. Chunky rounded frosted-cookie letters, cream highlights, cocoa
outline and dimensional shadow. “Addition” is largest.
Text (verbatim): “Snack Addition Stories”
Constraints: spell each word exactly once; transparent alpha; no subtitle,
other text, logos, trademarks, or watermark.
```

Accepted source: `gpt-image-2/title-lockup.png`; spelling was reviewed at native
resolution before acceptance.

## Sun guide poses

```text
Use case: stylized-concept
Asset type: two-pose game-guide contact sheet
Primary request: exactly two identical butter-yellow Kawaii sun mascots side by
side—idle/help pose and arms-up celebration pose.
Style: soft vinyl/frosted-cardboard volume, cocoa eyes and outline, rosy cheeks,
pressed texture, gentle preschool expression.
Constraints: genuine alpha; exactly two mascots; no text, buttons, food, logos,
trademarks, or watermark.
```

Accepted source: `gpt-image-2/sun-poses-sheet.png`. It was cut with
`tools/cut-asset-sheet.py --expected-count 2 --min-area 50000`; see
`crops/mascot/boxes.json`.

## Local API supplements

- The hub tile used the `krea2-turbo-t2i` recipe in
  `krea2/hub-tile-recipe.json` at seed 42.
- `qwen-image-layered` was tested on the blackberry crop with the required
  `layer_2` result. Its nearly blank alpha plane was rejected rather than
  replacing the cleaner cutter silhouette; see `layered/qwen-layered-qa.json`.
- Runtime cutouts use the cutter's binary component masks, a one-pixel erosion,
  and a sub-pixel feather. `tools/process-assets.py` is the reproducible encode
  and magenta-QA step.
