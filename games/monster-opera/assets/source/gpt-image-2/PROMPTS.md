# Monster Opera — selected GPT Image 2 prompts

Authoring date: 2026-08-27. Workflow: built-in Codex `image_gen`, reference-conditioned on the user-supplied new Monster Opera mockups and monster sheet. Selected finals were copied into this directory before deterministic slicing.

## Splash title

Selected output: `exec-1098a006-6240-490a-a7e6-43966671b7a8.png`.

```text
Use case: logo-brand
Asset type: wide raster splash-title lockup for a preschool music game
Primary request: Create decorative hand-lettered title art reading exactly "MONSTER OPERA".
Input images: the authoritative monster/chalk style and palette reference; the authoritative blackboard-material and UI-mark style reference. Do not redraw or include the monsters themselves.
Scene/backdrop: genuinely transparent background.
Style/medium: exuberant rough sidewalk-chalk lettering on a classroom blackboard, dusty broken edges, visible grain and hand pressure, imperfect childlike strokes, premium finished game art.
Composition/framing: wide 3:1 centered lockup; "MONSTER" above "OPERA"; chunky irregular uppercase letters; a small chalk treble clef and a few simple music-note flourishes integrated around—not inside—the lettering; generous clear outer margin.
Color palette: white, warm yellow, coral pink, lavender, and teal chalk, balanced for high contrast on dark green slate.
Text (verbatim): "MONSTER OPERA"
Constraints: spell both words exactly; each letter fully legible at tablet size; transparent outside the title; no characters, faces, creatures, buttons, panels, watermark, signature, or any other text.
Avoid: smooth vector edges, neon glow, 3D typography, glossy app UI, gradients, photorealism.
```

## Control family

Selected extracted output: `exec-35f43de1-5543-428a-a9c2-da3caba990bd.png`.

```text
Use case: stylized-concept
Asset type: coordinated raster UI icon source sheet for a tablet preschool music game
Primary request: Draw exactly eight separate chalk UI controls, arranged as a clean 4-column by 2-row contact sheet with large empty transparent gaps between every item.
Input images: authoritative blackboard UI/chalk-mark reference; palette and chalk-grain reference only.
Scene/backdrop: genuinely transparent background, with no panel, no grid, and no labels beneath the icons.
Style/medium: rough hand-drawn classroom chalk, dusty broken edges, uneven hand pressure, childlike but premium and unmistakably legible.
Composition/framing: top row left-to-right: yellow back arrow, sound on, sound off, drum on. Bottom row: drum off, exact "GO!", fresh music page/eraser, play.
Constraints: exactly eight items; exact order and grid; all fully visible; no extra icons, words, letters, numbers, characters, faces, creatures, watermark, signature, background rectangle, separators, or drop shadows; preserve genuine transparency between and around icons.
Avoid: smooth vector lines, emoji, glossy UI, gradients, neon, 3D, photorealism.
```

The first render baked a checkerboard. Final extraction prompt:

```text
Remove the entire gray-and-white checkerboard background and replace it with genuine transparency. Change only the background; preserve all eight chalk icons exactly, including their colors, rough chalk edges, order, size, positions, and exact "GO!" lettering. Output true RGBA transparency.
```

## Composer lanes

Selected output: `exec-bf38d061-bde6-49a5-9f69-c2941684fde5.png`.

```text
Create an EMPTY three-lane recording timeline as one cohesive transparent raster chalk asset: an extremely wide plate with three long horizontal lanes stacked evenly, top dusty white, middle warm yellow, bottom teal. Each lane is one slightly wavy thick chalk stroke with four tiny irregular beat ticks under it. Leave the full lane lengths open for runtime event dots. Rough classroom chalk, dusty broken grain, imperfect pressure. No playhead, monsters, controls, text, notes, panel, or border; true RGBA transparency.
```

## Concert track plate

Selected output: `exec-ea94464c-18fd-48c9-af96-c688053a73f9.png`.

```text
Use case: stylized-concept
Asset type: black-backed wide concert-track plate for screen-blended infinite side scrolling
Primary request: Create an EMPTY three-row chalk music-track environment as one repeatable 16-second song panel.
Scene/backdrop: perfectly flat pure solid RGB black (#000000), completely uniform. This black will disappear at runtime through screen blend mode.
Style/medium: rough classroom chalk, dusty broken edges, imperfect childlike curves, visible hand pressure.
Composition/framing: wide 16:9 panel. Exactly three generous horizontal rows. Each begins with one large hand-drawn white treble clef, then one loose rolling oval/loop path reaching both edges at matched vertical centers. Top accents coral pink, middle teal, bottom warm yellow. Add four irregular colored timing dots per row and broad empty spaces for runtime monsters.
Constraints: no monsters, controls, text, title, watermark, divider, checkerboard, panel, or border.
Avoid: smooth vector geometry, perfect notation, neon glow, glossy UI, gradients, 3D, photorealism.
```

## Transport markers

Selected output: `exec-cfcc8b6a-d1ab-4469-88d2-8e765e1efd94.png`.

```text
Draw exactly four separate game markers arranged left-to-right with large transparent gaps: one tall coral-orange vertical chalk playhead with a downward triangular pointer, then three identical irregular chalk pebble dots in dusty white, warm yellow, and bright teal. Rough classroom chalk with true RGBA transparency. No monsters, faces, text, notes, lines, controls, checkerboard, watermark, or shadows.
```
