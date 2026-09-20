# Neighborhood Explorer assets

All runtime assets are local and committed. Production makes no model or media
requests. Code is MIT; original and generated game art is CC BY 4.0.

## Inventory and provenance

| Runtime asset | Source and workflow | Runtime treatment |
| --- | --- | --- |
| assets/art/splash.jpg | Neighborhood Explorer concept screen 01-title.png | JPEG 88, progressive; the visible cover and raster title |
| assets/art/draw-house.jpg | Concept screen 02-draw-house.png | JPEG 88, progressive; illustrated sketchbook, robin, crayons, and control art |
| assets/art/scene.jpg | GPT Image 2 built-in generation from the concept title/finale as style references | 1536×1152 source retained; JPEG 88 shipping plate |
| assets/source/gpt-image-2/landmarks-sheet.png | GPT Image 2 built-in generation from the same style references | Original 1536×1024 production contact sheet retained |
| assets/source/gpt-image-2/crops/*.png | tools/cut-asset-sheet.py over the contact sheet | Eight verbatim deterministic source crops plus boxes.json and cut-mask.png |
| assets/source/qwen-layered/*.layer2.png | Local qwen-image-layered, seed 42, output=layer_2 | QA-retained extraction attempts; car passed, seven near-empty layers were rejected |
| assets/art/car.png | Qwen layer_2 plus tools/pipeline/cutout_finalize.py | True-alpha PNG, 480×316; alpha report and magenta review retained |
| assets/art/{house,tree,park,library,pond,shop,flowers}.png | Approved GPT pixels from cutter crops, border-connected deep-navy matte, feather 0.8 px | Alpha PNG, max edge 480; no model redraw |
| assets/source/keyed-qa/*-magenta.jpg | Deterministic alpha review composites | Human silhouette/halo review evidence |
| assets/audio/*.m4a | Local qwen3-tts-voiceclone, teacher reference, seed 7 | AAC 64 kbps, fast-start not applicable to audio-only M4A |
| assets/audio/qa.json | Local whisper-stt comparison against lines.json | Every shipped recording must be pass; Web Speech remains fallback |
| ../../assets/hub/tiles/neighborhood-map-walk.jpg | Existing QLOBE hub tile | Retained because the hub intentionally uses its shared toy-object grammar |

Shared voice input: shared/assets/refs/voice-teacher.wav. It is authoring input
only and is not duplicated.

## GPT Image 2 prompts

### Open watercolor world

Use case: stylized-concept
Asset type: production 4:3 tablet game background plate
Input images: concept finale and title are style, palette, texture, and neighborhood-world references only; create a new scene, do not copy their UI or text.
Primary request: Create a magical hand-painted watercolor storybook neighborhood map playfield for a preschool town-building game.
Scene/backdrop: top-down three-quarter view of a sunny green neighborhood clearing surrounded at the far edges by soft trees, flower gardens, a few tiny distant cottages and blue hills. The middle 70 percent must be an open pale warm grass-and-paper area where children can draw roads and place buildings. A subtle meandering creek hugs one edge. Include faint handmade paper fibers and watercolor blooms.
Style/medium: premium children's picture-book watercolor and gouache on cold-press paper, colored-pencil detail, softly imperfect handmade edges, richly authored raster illustration matching the references.
Composition/framing: 4:3 landscape, full bleed, open quiet center, detail concentrated around outer 15 percent, no large foreground objects, suitable behind live draggable sprites.
Lighting/mood: warm honey morning, playful, safe, inviting, vivid but calm.
Constraints: background only; no words, letters, numbers, title, signs, labels, UI, buttons, frames, characters, cars, roads, standalone buildings in the central play area, watermarks, vector-flat shapes, or generic glossy 3D.

### Landmark contact sheet

Use case: stylized-concept
Asset type: production contact sheet of game sprites for deterministic cutting
Input images: concept finale and title are style, palette, texture, and neighborhood-world references only.
Primary request: Create exactly EIGHT separate, complete watercolor storybook game assets arranged in a strict 4 columns by 2 rows contact sheet: row 1 = cozy white cottage with red roof; leafy green tree; tiny park with bench and flower arch; friendly brick library with blue door. row 2 = oval pond with two lily pads; small corner bakery/shop with striped awning and NO SIGN OR LETTERS; little red toy car in side view; cheerful cluster of wildflowers.
Scene/backdrop: perfectly uniform solid deep navy background (#07182F), edge-to-edge.
Style/medium: premium children's picture-book watercolor and gouache on textured paper, colored-pencil detail, softly imperfect handmade silhouette, cohesive with references, readable at small tablet size.
Composition/framing: exactly 4 by 2 even grid; one isolated object centered in each cell; generous empty navy gutters between every object and around sheet border; every object fully visible with no cropping; no object touches another; no ground plane extending into adjacent cells.
Constraints: exactly eight objects and nothing else; no text, letters, numbers, labels, captions, borders, panels, UI, buttons, people, extra buildings, watermarks; solid uniform navy background; crisp separated silhouettes; no white outline; no cast shadow reaching outside each object's cell.

## Deterministic cutting and alpha QA

The cutter command was:

```text
python tools/cut-asset-sheet.py landmarks-sheet.png crops --names house tree park library pond shop car flowers --expected-count 8 --padding 20 --min-area 6000 --background-color 07182F --distance-threshold 42 --chroma-threshold 24 --close-radius 0 --debug-mask cut-mask.png --force
```

It found exactly eight components. Qwen layered extraction was then attempted for
the crops with the prompt “Background layer: plain deep navy background. Top
layer: the complete watercolor storybook [subject] game asset, unchanged, on a
transparent background.” Seven returned layer_2 files were effectively
transparent and failed cutout_finalize.py with “empty extraction.” The car
extraction passed (47.772% transparent, 26.344% opaque, 25.884% partial-alpha);
its soft watercolor edge was reviewed on magenta and promoted to the runtime.

The safe fallback flood-selects only background connected to a crop edge within
52 RGB levels of #07182F, feathers the alpha by 0.8 px, trims with 8 px padding,
and resizes to 480 px. This keeps interior dark paint and every source RGB pixel.
Magenta composites show complete silhouettes with no dark plate or bright halo.

## Voice package

Source of truth: assets/audio/lines.json. Recorded files, manifest durations and
text hashes, and Whisper observations are in the same folder. Missing or rejected
clips fall back through shared voice-clips.js rather than blocking play.

## Link preview

assets/og-image.jpg is a 1200 x 630 crop from the final real-Chrome living-town
QA capture. Regenerate it from a current browser capture when the composition
changes; do not repaint it by hand.
