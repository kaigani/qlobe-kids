# Clay Creature Studio assets

All shipped art is local and available offline. Original game art is licensed
CC BY 4.0 as part of QLOBE Kids. Model calls are authoring-time only.

## Production art

| Runtime asset | Source | Creator / workflow | Processing |
| --- | --- | --- | --- |
| `assets/workshop.webp` | `assets/source/workshop-gpt-image-2.png` | OpenAI GPT Image 2, built-in image generation | resize to 1365×1024, WebP q84 |
| `assets/title.webp` | `assets/source/title-gpt-image-2-chroma.png` | OpenAI GPT Image 2, built-in image generation | built-in chroma-key helper, alpha trim/pad, resize, WebP q90 |
| `assets/dino.webp`, `monster.webp`, `unicorn.webp` | `assets/source/bodies-gpt-image-2-magenta.png` | OpenAI GPT Image 2 contact sheet → local Qwen Image Layered `layer_2` | exact thirds, main connected component, alpha trim/pad, WebP q90 |
| `assets/parts/*.webp` (12) | `assets/source/parts-gpt-image-2-chroma.png` | OpenAI GPT Image 2 contact sheet → local Qwen Image Layered `layer_2` | exact 4×3 cells, main connected component, alpha trim/pad, WebP q90 |
| `assets/blob.webp`, `bird.webp`, `dragon.webp` | `assets/source/bodies-extra-gpt-image-2-magenta.png` | OpenAI GPT Image 2 contact sheet → local Qwen Image Layered `layer_2` | exact thirds, alpha trim/pad, WebP q90 |
| `assets/parts/*.webp` (8 limbs) | `assets/source/parts-limbs-gpt-image-2-chroma.png` | OpenAI GPT Image 2 contact sheet → local Qwen Image Layered `layer_2` | exact 4×2 cells, alpha trim/pad, WebP q90 |
| `assets/parts/*.webp` (8 dress-up) | `assets/source/parts-dress-gpt-image-2-chroma.png` | OpenAI GPT Image 2 contact sheet → local Qwen Image Layered `layer_2` | exact 4×2 cells, alpha trim/pad, WebP q90 |
| `assets/trash.webp` | `assets/source/trash-gpt-image-2-chroma.png` | OpenAI GPT Image 2 → local Qwen Image Layered `layer_2` | alpha trim/pad, WebP q90 |
| `assets/parts/*.webp` (8 eyes, 8 tops, 8 wings, 8 decorations) | `assets/source/parts-{eyes,top,wings,decor}-v2-gpt-image-2-magenta.png` | OpenAI GPT Image 2 → local Qwen Image Layered `layer_2` | exact 4×2 cells, connected-component cleanup, WebP q90 |
| `assets/parts/ball-*.webp` (12) | `assets/source/blob-balls-gpt-image-2-magenta.png` | OpenAI GPT Image 2 → local Qwen Image Layered `layer_2` | exact 4×3 cells, alpha trim/pad, WebP q90 |
| `assets/mouths/{rig}/{viseme}.webp` (72) | `assets/source/mouth-*-visemes-gpt-image-2-chroma.png` | OpenAI GPT Image 2 → local Qwen Image Layered `layer_2` | exact fixed 3×3 cells; no per-frame trim; WebP q91 |
| `assets/audio/mouths/*/*.m4a` (40) | Red Green Light caller WAVs in `../00-reference/voices/split/` | local Qwen3 TTS voice clone, seeds 7/8/9 | Whisper transcript gate ≥0.72, AAC 96k |
| `assets/audio/mouths/*/*.cues.json` (40) | corresponding cloned phrase | local faster-whisper + CMUdict | canonical `a o e wr ts ln uq mbp fv` cues |
| `assets/alive.webp` | `assets/source/alive-gpt-image-2-chroma.png` | OpenAI GPT Image 2, built-in image generation | chroma removal, alpha trim/pad, resize, WebP q90 |
| `assets/production/qa-magenta.jpg` | runtime sprite family | deterministic Pillow script | saturated alpha-edge review composite |

`tools/extract-layered.py` submits only the accepted sheets to the locally
configured Qwen endpoint and always fetches `output=layer_2`. The deterministic
production script is `tools/process-assets.py`. Qwen `layer_2` outputs and the
earlier local chroma-alpha intermediates both remain in `assets/production/`;
the processor prefers Qwen and retains chroma as an offline fallback.

## Final prompts

All prompts used the `stylized-concept` or `logo-brand` image-generation
taxonomy. The full production intent is preserved below.

### Workshop

> A warm stop-motion claymation creature-making workshop, broad wooden bench,
> centered off-white ceramic turntable, softly blurred clay jars and tools,
> paper bunting and sunny window; calm empty center; tactile polymer clay and
> wood with fingerprints; landscape 4:3; warm golden light; no characters,
> text, logos, UI, or center clutter.

### Title

> Handmade clay title plaque spelling exactly “CLAY CREATURE STUDIO” in three
> centered uppercase lines on an irregular sky-blue clay slab with colorful
> clay pebbles; stop-motion polymer clay; flat solid `#00ff00` background; no
> other text or shadow outside the title.

### Bodies

> Exact three-column contact sheet: blank coral-orange baby dinosaur body,
> blank mint-green front-facing monster body, blank creamy-white baby unicorn
> body; no eyes or removable decorations; cohesive stop-motion clay props;
> flat solid `#ff00ff` background; no floor, shadows, text, props, or cropping.

### Parts

> Exact 4×3 contact sheet: two googly eyes, one large eye, three eyes, smile;
> yellow horn, purple horns, blue spikes, teal wing; lavender wing, clay spots,
> coral heart, rainbow mane; cohesive stop-motion polymer clay; flat solid
> `#00ff00` background; each cell isolated and complete, no text or shadow.

### Additional bodies

> Match the accepted clay body style. Exact three-column contact sheet: blank
> sky-blue rounded blob with small arms and feet, blank sunny-yellow baby bird
> with feet and side nubs, blank lavender baby dragon with arms, feet, and tail
> but no wings, horns, or spikes; no eyes, mouths, accessories, floor, shadow,
> text, or cropping; flat solid `#ff00ff` background.

### Limbs

> Match the accepted clay-parts style. Exact 4×2 contact sheet: coral bendy arm,
> teal three-finger hand, sky-blue flipper, pink claw; yellow boot foot, green
> webbed foot, purple curly tail, orange tentacle. Every narrow attachment base
> is on the left and expressive tip extends right for code-driven mirroring;
> flat solid `#00ff00` background; no text, shadow, body, or cropping.

### Dress up

> Match the accepted clay-parts style. Exact 4×2 contact sheet: coral bow tie,
> round blue glasses, yellow crown, pink flower; teal party hat, orange star
> badge, purple bow, striped scarf; flat solid `#00ff00` background; isolated
> complete objects with no text, shadow, body, or cropping.

### Trash

> Single friendly squat cocoa-brown clay trash bin with a thick cream rim, two
> coral handles, and a clearly readable dark open top; front three-quarter view,
> no face, label, loose trash, floor, or shadow; flat solid `#00ff00` background.

### Alive plaque

> Coral-red handmade clay banner spelling exactly “ALIVE!” in cream uppercase
> clay letters with three colorful clay confetti dots; flat solid `#00ff00`
> background; no other text or shadow.

### Expanded part families

> Cohesive tactile claymation contact sheets on flat `#ff00ff`, with exact grid
> placement and isolated complete objects: eight eye types (including insect,
> stalk, sleepy, starry, and mismatched); eight horn/spike/mane accessories;
> eight single wings with attachment base left and tip right; eight decorations
> including four individual spots; and twelve colored clay balls. Rounded
> child-friendly polymer clay, subtle fingerprints, soft studio light, no text,
> floor, body, cast shadow, or crop.

### Mouth viseme rigs

> One named mouth design per 3×3 sheet on flat `#00ff00`, in exact reading order
> `a, o, e / wr, ts, ln / uq, mbp, fv`. The same scale, position, angle, color,
> material, and signature details in all nine cells; only articulation changes.
> Designs: purple buck-tooth goofy mouth, coral sparkle lips, steel-blue robot
> display, aqua bubbly lips, coral dragon fangs, lavender one-tooth smirk,
> bright-blue hero grin, and golden owl beak. No labels, head, eyes, or props.

## Shared runtime assets

| Asset | Source | Creator | License | Modifications |
| --- | --- | --- | --- | --- |
| Fredoka SemiBold | Fontsource / Google Fonts | Milena Brandão and Hafontia | SIL OFL 1.1 | none |
| HUD buttons | QLOBE Kids shared library | QLOBE Kids | CC BY 4.0 | reused unchanged |
| Sound effects | `shared/js/sfx.js` WebAudio synthesis | QLOBE Kids | MIT | generated locally at runtime |
| Red Green Light caller references | QLOBE Kids reference voice library | recorded callers | project-internal | cloned into 40 new authored lines; references are not shipped here |
| Fallback voice | device Web Speech API | browser / OS | platform-provided | used only if local cloned dialogue cannot play |

## Catalog image

`assets/hub/tiles/clay-creature-studio.jpg` is the existing hand-curated hub
tile. `assets/og-image.jpg` is regenerated from the finished splash screen by
the repository capture tool after production visual QA.
