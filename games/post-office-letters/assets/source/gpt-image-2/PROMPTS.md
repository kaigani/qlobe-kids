# GPT Image 2 prompt record

Mode: Codex built-in GPT image generation/editing. The selected project-bound
outputs are retained beside this file. No transparent-model downgrade was used;
cutout transparency is completed by the approved local Qwen Image Layered
workflow.

## `ui-anchor.png`

```text
Use case: ui-mockup
Asset type: shippable 4:3 tablet game screen mockup and visual-system anchor for QLOBE Kids
Primary request: Create a polished, ambitious preschool game screen for “Post Office Letters,” where children help friendly customers send and pick up mail while practicing lowercase letter formation and name writing.
Scene/backdrop: a magical miniature neighborhood post office interior seen straight-on; arched customer window at left, broad wooden writing counter across the lower center, smiling red outgoing mail chute near center-right, colorful wall of mail cubbies at right, tiny parcel lift and hanging bunting, sunny garden visible through rounded windows.
Subject: one cheerful child customer waiting at the left window; a large cream envelope resting on the writing counter; three picture stamps nearby; a glowing lowercase manuscript letter guide on the envelope; mailbox cubbies with portrait medallions.
Style/medium: original Kawaii Storybook illustration; hand-painted gouache and colored-pencil paper texture fused with puffy cream sticker outlines, candy-color panels, rounded expressive faces, charming imperfect brush edges, premium preschool game art; richly authored raster art, not vector UI and not glossy generic 3D.
Composition/framing: landscape 4:3 tablet layout; full-bleed environment; one dominant writing action in the center; uncluttered calm center for live HTML/canvas overlays; action path visually reads customer → envelope → stamp → mail chute → pickup cubbies; keep top corners clear for 96px HUD buttons and keep lower controls within safe areas.
Lighting/mood: warm peach-and-honey morning light, welcoming, playful, magical but readable.
Color palette: strawberry red, raspberry pink, sky blue, mint, butter yellow, lilac, warm cream, cocoa outlines.
Materials/textures: visible paper grain, gouache brushwork, soft colored-pencil contours, subtle sticker-like cream edging and gentle contact shadows.
Text: no functional text; no words; no letters except one clearly legible lowercase manuscript “m” guide on the envelope.
Constraints: understandable within five seconds for age 5–6; large touch-scale objects; coherent lighting and edge treatment; no UI dashboard density; no watermark; no logos; no trademarked characters.
Avoid: SVG/vector look, CSS-flat shapes, photorealism, generic plastic 3D, tiny controls, dense labels, malformed hands, extra limbs, clutter over the writing area.
```

## `post-office-plate.png`

Input: `ui-anchor.png`, edit target.

```text
Use case: precise-object-edit
Asset type: production 4:3 full-bleed game environment plate
Primary request: Turn the approved anchor into a clean reusable environment plate.
Change only these elements: remove the child customer from the left window; remove the foreground envelope, glowing letter guide, pencil cup, paintbrushes, and all loose picture stamps from the writing counter; remove portrait medallions from the right-side cubbies so every cubby is a clean colorful empty slot. Extend existing wood, wall, garden view, and cubby paint naturally into cleared regions.
Keep unchanged: exact 4:3 camera, room architecture, arched window, garden view, bunting, parcel lift, smiling red chute, cubby wall, lighting, palette, gouache/colored-pencil paper texture, puffy cream edging, rounded proportions, shadows, and perspective.
Composition: preserve a broad clean wooden counter across the lower half; keep top corners calm for HUD.
Constraints: environment only; no characters, portraits, loose props, letters, words, numbers, logos, watermark, UI, or new objects. Do not redesign or recrop.
```

## `title.png`

Inputs: approved environment plate and UI anchor as style references.

```text
Use case: logo-brand
Asset type: transparent splash-screen title lockup for a preschool game
Primary request: Create a compact decorative title lockup that reads exactly “Post Office Letters”.
Style/medium: original Kawaii Storybook hand-painted gouache and colored-pencil on textured paper, puffy cream sticker outline, candy-color letter faces, subtle stitched/postage edging, tiny heart postmark and envelope ornament.
Composition/framing: centered two-line lockup, “Post Office” first and “Letters” larger second; strong readable silhouette; generous padding; no backdrop or mockup.
Text (verbatim): “Post Office Letters”
Typography: rounded hand-painted preschool display lettering; spell P-O-S-T, O-F-F-I-C-E, L-E-T-T-E-R-S exactly.
Constraints: render exactly once; no other words, letters, numbers, signature, logo, watermark, scene, or characters. Clean alpha requested; local Layered extraction remains authoritative.
Avoid: malformed/duplicated letters, illegible script, vector-flat logo, generic glossy 3D.
```

## `envelope.png`

Inputs: title and environment plate as style references.

```text
Use case: stylized-concept
Asset type: isolated game prop source for later alpha extraction
Primary request: one large blank cream paper envelope viewed straight-on from slightly above, address side facing viewer, flap seams subtly visible, scalloped postage edge details, tiny embossed heart near one corner, completely empty central space for live HTML/canvas lowercase name writing.
Scene/backdrop: perfectly flat solid uniform dark charcoal #202124.
Style/medium: original Kawaii Storybook gouache and colored-pencil on warm textured paper, puffy cream sticker edge, gentle contact shadow, matching references.
Composition/framing: square; one envelope only; centered; full object; generous even padding.
Constraints: no text, letters, numbers, stamp picture, person, logo, watermark, UI, collage, extra objects, crop, or background texture.
```

## `stamp-heart.png`

```text
Use case: stylized-concept
Asset type: isolated interactive postage-stamp source for later alpha extraction
Primary request: one scalloped cream postage stamp with a large smiling strawberry-red heart, two tiny mint leaves, and subtle hand-painted stitching; no denomination.
Scene/backdrop: perfectly flat solid uniform dark charcoal #202124.
Style/medium: matching original Kawaii Storybook gouache/colored-pencil textured paper, puffy cream outline, gentle contact shadow.
Composition: square, one centered upright stamp, full object, even padding, readable at 96px.
Constraints: no text, letters, numbers, logos, watermark, UI, collage, extra objects, or crop.
```

## `stamp-moon.png`

```text
Use case: stylized-concept
Asset type: isolated interactive postage-stamp source for later alpha extraction
Primary request: one scalloped cream postage stamp with a smiling butter-yellow crescent moon on a lilac patch and two tiny sky-blue stars, subtle hand-painted stitching; no denomination.
Scene/backdrop: perfectly flat solid uniform dark charcoal #202124.
Style/medium: match the approved heart stamp's exact Kawaii Storybook gouache/paper texture, edge, scale, proportions, and lighting.
Composition: square, one centered upright stamp, full object, even padding, readable at 96px.
Constraints: no text, letters, numbers, logos, watermark, UI, collage, extra objects, or crop.
```

## `stamp-rainbow.png`

```text
Use case: stylized-concept
Asset type: isolated interactive postage-stamp source for later alpha extraction
Primary request: one scalloped cream postage stamp with a smiling three-band strawberry-red, butter-yellow, and sky-blue rainbow ending in puffy mint-and-cream clouds, subtle hand-painted stitching; no denomination.
Scene/backdrop: perfectly flat solid uniform dark charcoal #202124.
Style/medium: match the approved moon and heart stamps' exact Kawaii Storybook gouache/paper texture, edge, scale, proportions, and lighting.
Composition: square, one centered upright stamp, full object, even padding, readable at 96px.
Constraints: no text, letters, numbers, logos, watermark, UI, collage, extra objects, or crop.
```
