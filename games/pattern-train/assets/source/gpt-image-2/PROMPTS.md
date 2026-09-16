# Pattern Train — GPT Image 2 production prompts

These masters were generated as a single coordinated **Toy** art family with
OpenAI GPT Image 2. Runtime derivatives are made by
`tools/cut-asset-sheet.py` and `games/pattern-train/tools/finalize-art.py`;
the masters are immutable production sources.

## `railway-meadow-master.png`

> A premium preschool tablet-game background in a hand-painted wooden toy
> world, 4:3 landscape. An airy miniature countryside railway station on a
> sunny morning: powder-blue sky, plump cream clouds, rolling mint and spring
> green hills, tiny rounded trees and flowers, and one warm wooden railway
> track running clearly left to right across the lower third. Soft studio
> lighting, subtle painted wood grain, rounded safe forms, saturated but
> harmonious colors, tactile storybook depth. Leave the center and lower track
> spacious for a large toy train and UI. No train, no characters, no lettering,
> no buttons, no frame, no watermark. Full-bleed environment, not an icon.

## `rail-ui-sheet.png`

> Asset sheet for the same premium hand-painted wooden preschool toy railway
> game. Exactly six separate objects in a clean 3-by-2 grid with generous
> empty space and true transparent background: (1) a cheerful coral-red wooden
> steam locomotive facing right, (2) one teal-and-yellow open cargo wagon
> facing right, (3) a wide shallow honey-colored wooden choice tray, (4) a wide
> cream painted-wood prompt plaque with teal brackets and no text, (5) a chunky
> golden-yellow oval wooden button plate with no text, (6) a chunky coral-red
> oval wooden button plate with no text. Consistent three-quarter side view,
> rounded safe edges, visible wood grain, soft highlights and contact shadows
> contained inside each isolated sprite. No letters, no labels, no scenery,
> no extra objects, no overlap.

## `title-lockup-master.png`

> A single isolated title lockup reading exactly “PATTERN TRAIN” in large,
> friendly uppercase hand-painted wooden toy letters. “PATTERN” arches gently
> above “TRAIN”; alternate coral, teal, sunshine yellow, leaf green, and violet
> letters; a tiny wooden rail flourish under the second line. Chunky rounded
> preschool lettering, visible painted wood grain, soft cream edge highlights,
> joyful and exceptionally legible at tablet size. True transparent background.
> No other words, no subtitle, no characters, no border, no watermark.

## `token-sheet.png`

> Asset sheet for Pattern Train in the exact same painted wooden Toy style.
> Exactly eight separate chunky cargo tokens in a clean 4-by-2 reading-order
> grid on a true transparent background: glossy red triangular prism, cobalt
> blue square block, sunshine yellow circular disk, leaf-green five-point star,
> friendly clapping hands action token, friendly red stomping boot action
> token, one fingertip tapping a small teal wooden pad, two hands shaking a
> small yellow jingle shaker. Simple centered silhouettes, rounded safe forms,
> tactile painted wood and soft studio highlights, generous clear space around
> every object. No words, labels, badges, scenery, overlap, or extra objects.

## `mode-effects-sheet.png`

> Asset sheet for the same hand-painted wooden preschool Toy world. Exactly six
> separate assets in a clean 3-by-2 reading-order grid on a true transparent
> background: (1) a miniature teal wagon carrying a red triangle and blue
> square for Shape Cargo, (2) clapping hands plus a red boot beside a tiny
> wagon for Move & Sound, (3) five cheerful empty teal wagons for My Train,
> (4) one plump golden wooden reward star, (5) one small burst of three painted
> golden sparkle stars, (6) one chunky sunshine-yellow wooden train whistle.
> Cohesive rounded shapes, visible wood grain, soft highlights, readable at
> small tablet size. No text, no labels, no background, no overlap.

## Cutter invocations

```powershell
python tools/cut-asset-sheet.py games/pattern-train/assets/source/gpt-image-2/rail-ui-sheet.png games/pattern-train/assets/source/cuts/rail-ui --names locomotive wagon tray plaque button-yellow button-coral --expected-count 6 --padding 18 --debug-mask games/pattern-train/assets/source/cuts/rail-ui-mask.png
python tools/cut-asset-sheet.py games/pattern-train/assets/source/gpt-image-2/token-sheet.png games/pattern-train/assets/source/cuts/tokens --names red-triangle blue-square yellow-circle green-star clap stomp tap shake --expected-count 8 --padding 16 --debug-mask games/pattern-train/assets/source/cuts/tokens-mask.png
python tools/cut-asset-sheet.py games/pattern-train/assets/source/gpt-image-2/mode-effects-sheet.png games/pattern-train/assets/source/cuts/mode-effects --names mode-shapes mode-actions mode-builder gold-star spark whistle --expected-count 6 --padding 16 --debug-mask games/pattern-train/assets/source/cuts/mode-effects-mask.png
python games/pattern-train/tools/finalize-art.py
```

The committed `boxes.json` files record the immutable source hashes and exact
crop coordinates. `assets/source/qa/alpha-magenta-contact.png` is the final
full-sheet alpha-edge inspection artifact.
