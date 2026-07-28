# Asset log — Letter Road Driving

All original QLOBE game art and dialogue assets are CC BY 4.0. Runtime is fully
offline. Authoring recipes and QA artifacts are retained under `assets/source/`,
`assets/production/`, `assets/map/{source,layered,qa}/`, and
`assets/rewards/{source,layered,qa}/`.

| Asset | Source / workflow | Creator | License | Modifications / QA |
|---|---|---|---|---|
| `assets/hero-car.png` | gpt-image-2 built-in generation; prompt below | OpenAI + QLOBE Kids direction | CC BY 4.0 project asset | Qwen Image Layered `layer_2`; Studio cutout finalizer; alpha floor 4; bbox + 16 px; max 640; magenta composite checked |
| `assets/driver-car.png` | gpt-image-2 edit from hero identity/style; prompt below | OpenAI + QLOBE Kids direction | CC BY 4.0 project asset | Top-down game variant; Qwen Image Layered; same cutout QA |
| `assets/cars/{herbie-red,sunny-yellow,benny-blue,gigi-green,pippa-purple}.png` | gpt-image-2 built-in generation/edit using the supplied scenario mockup as the character/camera/style reference; prompt below | OpenAI + QLOBE Kids direction | CC BY 4.0 project assets | Expressive elevated three-quarter car family; 640 px; alpha-floor 4; all five magenta composites visually checked |
| `assets/cars/source/*-gpt-image-2.png` | Accepted raw character renders on removable authoring backgrounds | OpenAI + QLOBE Kids direction | CC BY 4.0 project assets | Retained as regeneration lineage |
| `assets/cars/production/gigi-green.layer2.png` | `qwen-image-layered`, seed 42 | Local Qwen workflow | CC BY 4.0 project asset | Semantic extraction preserved green body, dark wheels/eyes, and cream trim |
| `assets/cars/production/*-keyed.png` | Built-in imagegen chroma-key removal helper | QLOBE Kids | CC BY 4.0 project asset | Accepted keyed intermediates for red/yellow/blue/purple |
| `assets/cars/production/*-qa-magenta.png` | `tools/pipeline/cutout_finalize.py` | QLOBE Kids | CC BY 4.0 project asset | Human silhouette/edge review composites |
| `assets/map/source/{destinations-a-i,destinations-j-r,destinations-s-z,props-town,props-play}-yellow.png` | gpt-image-2 built-in generation using the supplied gameplay mockup and the first accepted sheet as style references | OpenAI + QLOBE Kids direction | CC BY 4.0 project assets | Five exact 3×3 authoring sheets; 100% yellow authoring ground requested; 27 destination slots and 18 scenery props |
| `assets/map/layered/*.layer2.png` | `qwen-image-layered`, seed 42 | Local Qwen workflow | CC BY 4.0 project assets | Whole-sheet semantic background separation; retained transparent intermediates |
| `assets/map/destinations/*.png` | `tools/process-map-sheets.py` deterministic 3×3 slicer | QLOBE Kids | CC BY 4.0 project assets | 27 normalized 384 px cutouts: A–Z destinations plus Town Hall |
| `assets/map/props/*.png` | `tools/process-map-sheets.py` deterministic 3×3 slicer | QLOBE Kids | CC BY 4.0 project assets | 18 normalized 320 px reusable town/play details |
| `assets/map/qa/*-contact.png`, `*-magenta.png`, `pack.json` | deterministic alpha/component QA | QLOBE Kids | CC BY 4.0 project assets | Small border fragments removed; every sprite visually reviewed on magenta; manifest records source cell and alpha statistics |
| `assets/rewards/source/*.png` | Three exact 3×3 gpt-image-2 sheets using Maya’s supplied portrait as the QLOBE character-style reference; prompt below | OpenAI + QLOBE Kids direction | CC BY 4.0 project assets | 26 full-body destination actions plus one bonus celebration on flat yellow authoring grounds |
| `assets/rewards/layered/*.layer2.png` | `qwen-image-layered`, seed 42 | Local Qwen workflow | CC BY 4.0 project assets | Whole-sheet semantic background separation; retained true-alpha intermediates |
| `assets/rewards/final/{a..z}.png`, `bonus.png` | `tools/process-reward-sheets.py` deterministic 3×3 slicer and normalizer | QLOBE Kids | CC BY 4.0 project assets | 27 normalized 512 px transparent cutouts; detached border fragments removed |
| `assets/rewards/qa/*-contact.png`, `*-magenta.png`, `pack.json` | deterministic alpha/component QA | QLOBE Kids | CC BY 4.0 project assets | All three contact sheets and every character silhouette visually reviewed; manifest records destination, action, source cell, and alpha statistics |
| `assets/source/*-gpt-image-2.png` | Raw gpt-image-2 dark-ground renders | OpenAI + QLOBE Kids direction | CC BY 4.0 project asset | Retained as regeneration lineage |
| `assets/production/*.layer2.png` | `qwen-image-layered`, seed 42 | Local Qwen workflow | CC BY 4.0 project asset | True-alpha intermediate |
| `assets/production/*.qa-magenta.png` | `tools/pipeline/cutout_finalize.py` | QLOBE Kids | CC BY 4.0 project asset | Human silhouette review composite |
| `assets/letter-road-world-v2.jpg` | gpt-image-2 built-in generation using the supplied UI mockup as a style/composition reference; prompt below | OpenAI + QLOBE Kids direction | CC BY 4.0 project asset | 16:9 scene-only plate; no baked text/UI; JPEG quality 88; landscape and portrait crop checked in real Chrome |
| `assets/bg.jpg` | Existing QLOBE storybook-neighborhood backdrop | QLOBE Kids | CC BY 4.0 | Retained as an unused source-era asset |
| `assets/audio/*.m4a` | `qwen3-tts-voiceclone`, seeds 7→9, committed teacher reference | QLOBE Kids local pipeline | CC BY 4.0 project asset | AAC 96 kbps; each line transcribed with `whisper-stt`; results in `qa.json` |
| `shared/assets/refs/voice-teacher.wav` | Shared committed teacher reference | QLOBE Kids | CC BY 4.0 | Authoring input only; not duplicated |
| Fredoka SemiBold | Fontsource / Google Fonts | Milena Brandão & Hafontia | SIL OFL 1.1 | Reused unmodified |
| Shared HUD buttons | QLOBE shared UI library | QLOBE Kids | CC BY 4.0 | Reused unmodified |
| Road geometry and effects | Procedural Pixi/WebAudio code | QLOBE Kids | MIT | No external files |

## gpt-image-2 prompts

### Hero car

Single friendly compact rounded red cartoon car on uniform `#202428`, expressive
windshield eyes and grille smile, yellow lights, tactile painted 3D papercraft
finish, three-quarter front view facing right, generous padding, no shadow,
floor, scenery, road, text, logo, or watermark.

### Driver car variant

Preserve the hero car’s identity, palette, materials, and tactile style; render
one complete symmetrical 90-degree bird’s-eye view pointing upward on uniform
`#202428`, with no perspective angle, shadow, floor, road, text, or watermark.

This former top-down runtime asset is retained for lineage but is no longer used
in play.

### Expressive scenario car family

The supplied scenario mockup is a style, character-appeal, and camera reference.
Create one complete cute compact car with large windshield eyes, a happy smiling
bumper mouth, yellow lamps, cream bumper, tiny amber beacon, visible wheels, and
premium soft-3D toy rendering. Use an elevated front three-quarter game-sprite
view—not an overhead roof view—so the face stays readable while the sprite
rotates along a road. One centered car, no shadow, road, scenery, text, logo, or
watermark. The red anchor becomes Herbie; change only body paint for sunshine
yellow Sunny, cobalt-blue Benny, leaf-green Gigi, and grape-purple Pippa.

### Storybook countryside world v2

Premium soft-3D preschool driving-game countryside, closely following the
supplied mockup’s color richness, warm sunny atmosphere, toy-like rendering,
and composition language. Bright sky and clouds, rolling green hills, cream
cottages with coral roofs at the outer thirds, trees, fences, flowers, sparkles,
and two pale-gold roads curving into a generous open center. Exact 16:9
edge-to-edge background plate with no car, title, words, letters, buttons,
icons, UI panels, people, border, or watermark.

### A–Z destination sprite sheets

Create exact 3×3 sheets of isolated miniature destination buildings matching
the supplied Letter Road mockup: elevated three-quarter camera, chunky rounded
cream-stucco forms, colorful toy-like roofs and awnings, soft painted 3D
texture, sunny highlights, and clear themed silhouettes. Use one building per
cell at consistent scale with generous separation. The three row-major sheets
contain:

- A–I: Art Studio, Bakery, Cupcake Cafe, Dance Studio, Engine Garage, Flower
  Shop, Grocery Market, Hat Shop, Ice Cream Shop;
- J–R: Juice Bar, Kite Park, Library, Music Shop, Nature Center, Observatory,
  Pet Store, Quilt Shop, Robot Repair;
- S–Z plus bonus: Sweet Shop, Toy Shop, Umbrella Shop, Vet Clinic, Water Park,
  Xylophone Hall, Yarn Shop, Zoo, Town Hall.

The entire canvas and all space between sprites must be perfectly flat,
uniform pure yellow `#FFFF00`, with no grid, panels, ground, shadows, text,
letters, labels, cars, roads, characters, or watermark.

### Map-detail sprite sheets

Use the same camera, scale, tactile rendering, and pure-yellow 3×3 authoring
format. Sheet one contains cottage, tree, flower bed, mailbox, lamp, bench,
fountain, picket fence, and topiary. Sheet two contains flowers, grass,
pebbles, hydrant, signpost, pond, swings, gazebo, and picnic table. One isolated
fully visible prop per cell; no text, roads, characters, shadows, dividers, or
background scenery.

### A–Z destination reward sprite sheets

Use Maya’s supplied portrait as the character-design reference: the same
rounded soft-3D QLOBE proportions, warm expressive faces, tactile materials,
bright preschool palette, and polished toy-like rendering. Create exact 3×3
sheets of isolated, complete full-body characters performing clear
destination-linked actions, one scene per cell at consistent scale with
generous separation:

- A–I: painting at an easel, carrying bread, presenting a cupcake, dancing,
  holding a toy wrench, carrying flowers, carrying produce, trying on a big
  hat, and holding an ice-cream cone;
- J–R: squeezing an orange, flying a kite, reading a book, playing a keyboard,
  watching a butterfly with binoculars, using a telescope, holding a puppy,
  an older lady presenting a patchwork quilt beside yarn, and repairing a
  friendly robot;
- S–Z plus bonus: holding a spiral lollipop, building blocks beside a teddy,
  twirling a rainbow umbrella, a young vet checking a kitten, splashing with a
  swim ring, playing a rainbow xylophone, an older lady knitting a scarf,
  feeding a baby giraffe, and holding a golden celebration star.

The entire canvas and all negative space must be perfectly flat, uniform pure
yellow `#FFFF00`, with no grid, panel, floor, scenery, text, letters, labels,
cars, roads, shadows, or watermark.

## Qwen Layered extraction prompt

Car: “Separate the exact friendly red cartoon car from the dark charcoal
background. Layer 1 is only a solid background. Layer 2 is only the complete
car with true transparent alpha, including every tire, mirror, roof light, and
clean antialiased edge. Keep the car identical to the input. No shadow, no
floor, no added objects.”

Map sheets: “Bottom layer: the complete solid pure-yellow background. Top
layer: the exact same nine [destination buildings / town scenery props] in
their original 3 by 3 positions on transparent background. Preserve every
object’s identity, colors, details, scale, spacing, and silhouette exactly. Do
not combine, move, replace, omit, or redraw any object.”

Reward sheets: “Separate this exact 3×3 sprite sheet into semantic layers.
Bottom layer: only the complete flat pure-yellow background. Top layer: only
the exact nine full-body character action scenes in their original cells on
true transparent alpha. Preserve every character, prop, facial expression,
pose, color, scale, spacing, and clean antialiased silhouette exactly. Do not
move, redraw, combine, replace, omit, crop, or add anything.”

## Optional sourced sound replacements

The game currently uses a synthesized finger-trace `vroom`, sustained replay
`motor`, and louder two-note arrival `honk`. If sourced clips are added later,
use:

- a warm toy-motor loop around 2–4 seconds, mono, no brand-identifiable engine;
- a soft two-note “beep-beep” shorter than 500 ms, no traffic aggression.

Log creator, source URL, license, and edits here before shipping either file.
