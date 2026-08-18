# Mountain Seasons Wheel — generation prompts and review record

These are the production prompts used to establish the shipped papercraft raster system. OpenAI generations used the built-in image-generation tool with `gpt-image-2`; the accepted local extraction used `qwen-image-layered`. Model seeds are not exposed by the built-in tool. Private service hosts and local reference paths are intentionally not recorded.

## Global art direction

Applied to every generated plate or sheet:

> Premium preschool learning-game artwork made entirely from layered construction paper and felted paper: visible paper fibres, hand-cut and folded edges, tiny stitched details, convincing physical layers, soft studio shadows, tactile depth, friendly rounded proportions, coherent natural color, no vector outlines, no glossy 3D plastic, no photorealism, no gradients painted as UI, no watermark, no logo, no text unless exact text is requested. Clear silhouettes and generous separation for touch-first use.

## Accepted `gpt-image-2` prompts

### Four-season splash / wheel backdrop

> A 4:3 full-bleed papercraft mountain diorama from one fixed child-height camera. A single recognizable central alpine mountain and winding stream continue through four connected seasonal regions: spring at lower left with pink blossoms and fresh flowers; summer in the center with lush green meadow; autumn at lower right with layered orange and gold aspens; winter at the right and upper ridges with snow, evergreens, and paper snow dots. Quiet open sky and protected center/top space for a title and controls. Rich foreground paper depth, premium handmade finish. No character, text, letters, UI, border, or watermark.

Accepted source: `gpt-image-2/splash-four-seasons.png`.

### Coordinated seasonal mountain plates

Base constraint for all four:

> A 4:3 full-bleed papercraft mountain nature scene using the exact same fixed camera, central faceted mountain geometry, winding stream, foreground path, and handmade material language as one coordinated set. Compose the characteristic plant on the left third and animal on the right third, both clearly visible beneath the HUD-safe sky. No text, labels, markers, UI, border, or watermark.

Season directives:

- Spring: melting snow, cool paper raindrops, fresh green hills, pink mountain wildflowers, and a friendly marmot.
- Summer: clear warm sky, full green meadow, tall purple lupines, and a gentle mule deer resting near shade.
- Autumn: cool amber light, gold/orange aspen leaves, layered fallen leaves, and a red squirrel with stored seeds.
- Winter: snow blanket, bare branches, blue-white mountain, needle-holding evergreens, and a white snowshoe hare.

Accepted sources: `gpt-image-2/{spring,summer,autumn,winter}.png`.

### Four-part tactile wheel

> A single front-facing circular papercraft seasons wheel, perfectly centered and symmetrical, with exactly four equal radial wedges and a round kraft-paper hub. Spring blossom centered in the top green wedge; summer sun centered in the right yellow wedge; autumn maple leaf centered in the bottom orange wedge; winter snowflake centered in the left blue wedge. Thick layered kraft rim, stitched/folded paper construction, readable silhouettes. Isolated on one perfectly flat uniform magenta key background. No pointer, text, extra slice, numbers, shadow outside the object, border, or watermark.

Accepted source: `gpt-image-2/wheel-magenta.png`.

### Juni identity sheet

> Exact 2 columns × 3 rows contact sheet on a perfectly flat uniform magenta key background. The same friendly preschool brown bear cub named Juni in the same centered front-facing pose and scale in every occupied cell, built from layered paper with a warm face, round ears, rosy cheeks, and no outlines. Cells: neutral base; shiny yellow spring raincoat; wide-brimmed yellow summer sun hat; quilted orange autumn vest; thick blue winter parka with fuzzy cream hood; final cell empty. No labels, text, props, scenery, dividers, or watermark.

Accepted source: `gpt-image-2/juni-contact-sheet-magenta.png`.

### Garment sheet

> Exact 2×2 contact sheet of four isolated front-facing papercraft garments, each centered at consistent scale on a perfectly flat uniform magenta key background: shiny yellow raincoat, wide-brimmed yellow sun hat, soft quilted orange warm vest, thick blue parka with cream fuzzy hood. Premium layered paper and stitched details, unambiguous silhouettes. No character, body, hangers, labels, text, dividers, or watermark.

Accepted source: `gpt-image-2/garment-contact-sheet-magenta.png`.

### UI carrier sheet

> Exact 3×3 contact sheet of coordinated blank papercraft UI carriers on a perfectly flat uniform magenta key background. Cells in reading order: red folded-paper wheel pointer; blank stitched green/kraft action button; blank curled cream prompt banner; picture-led wheel mode card; picture-led yellow-coat mode card; blank tall stitched garment card with pale blue oval; green leaf discovery seal; orange paw-print discovery seal; blank large stitched field-note card. Keep generous isolation between cells. No words, letters, numbers, icons beyond the specified wheel/coat/leaf/paw pictures, dividers, or watermark.

Accepted source: `gpt-image-2/ui-contact-sheet-magenta.png`.

### Stamps and particles

> Coordinated papercraft contact sheet on a perfectly flat uniform magenta key background. Four distinct round season patches—pink spring blossom, yellow summer sun, orange autumn maple leaf, blue winter snowflake—plus small isolated rain drop, pink blossom petal, sun sparkle, autumn leaf, and snowflake particle pieces. Consistent handmade paper fibres and cut edges. No text, labels, dividers, or watermark.

Accepted source: `gpt-image-2/stamps-particles-contact-sheet-magenta.png`; the spring stamp/petal were re-rendered on a flat blue key for clean edge separation in `gpt-image-2/spring-stamp-petal-blue.png`.

### Exact title lockup

> An isolated layered papercraft title badge with the exact correctly spelled words “MOUNTAIN” on the first line and “SEASONS” on the second line, all uppercase. Deep forest-green MOUNTAIN, warm cocoa-brown SEASONS, two simple green paper leaves, stitched cream/kraft backing, premium cut-paper depth. Transparent background. No other words, punctuation, symbol, logo, or watermark.

Accepted source: `gpt-image-2/title.png`. Exact spelling and alpha edges were checked visually.

### Adventure reward

> A 4:3 full-bleed premium papercraft pop-up accordion mountain with exactly four connected folded panels showing, from left to right, winter, spring, summer, and autumn. Preserve one mountain year and include the established snowshoe hare/evergreen, marmot/wildflowers, mule deer/lupines, and red squirrel/aspen motifs. Deep physical folds, layered paper foreground base, clear celebratory composition. No text, title, UI, stamp overlay, confetti, border, or watermark.

Accepted source: `gpt-image-2/reward-four-seasons.png`.

## Accepted Qwen contribution

`qwen-image-layered` was used to extract a clean true-alpha pink paper blossom petal from the coordinated particle source. The decomposition prompt specified a flat background layer and an identical isolated top-layer paper petal. The accepted subject layer was tight-cropped and reviewed over cyan and magenta before encoding as `ui/particles/petal-qwen.webp`.

## Rejected drafts

- `qwen-{spring,summer,autumn,winter}.png`: rejected because image-edit variants mixed multiple seasons and did not preserve one reliable mountain state.
- `qwen-layered-stamp-spring.png`: rejected because the requested subject layer was effectively blank.
- Early keyed spring-stamp and particle crops visible under `alpha-qa/`: rejected for magenta contamination, haloing, or neighboring-cell fragments.

Rejected files remain only as process evidence; none is referenced by runtime config.
