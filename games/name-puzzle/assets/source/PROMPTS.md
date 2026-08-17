# Name Puzzle — final image prompt set

These are the authoritative regeneration prompts for the shipped raster art. The
source masters are in `gpt-image-2/`; the optimized runtime files are generated
by `../../tools/finalize-assets.py`. GPT Image 2 generations used no explicit
seed. The execution IDs below identify the successful built-in image-generation
runs from the production session.

## Character master schema

Apply this complete schema to each subject row below:

> Create one single, full-body preschool character as a premium handmade felt
> and stitched-fabric doll. Warm, kind expression; appealing rounded
> proportions; tactile wool-felt fibers; visible blanket stitching; softly
> stuffed dimensional construction; polished stop-motion storybook quality.
> Show the whole figure, including ears, wings, tail, feet, and any named prop,
> centered in a relaxed front three-quarter pose with generous clear margin on
> every side. Use a perfectly uniform flat dark-charcoal extraction background
> (#25242b). No floor, scenery, vignette, cast shadow, words, letters, logo,
> border, duplicate character, extra limb, cropped body part, plastic, glossy
> 3-D render, vector art, or paper-cutout style. Square source canvas.

| ID | Subject sentence appended to the schema | Built-in execution ID |
|---|---|---|
| belle | Use the supplied Belle reference for identity and outfit cues. Preserve her warm brown skin, large brown eyes, joyful childlike face, black curly updo with loose ringlets, tall jeweled rainbow crown, rainbow princess dress with individual red/orange/yellow/green/blue/purple fabric panels, jewel details, shoulder capelets, purple shoes, and tall staff topped by clustered translucent-looking rainbow crystals. Translate every element into cozy wool felt and stitched fabric; keep her recognizable and age-appropriate. | `exec-97af7caf-1f15-4770-b279-dfbb17c312fd` |
| emma | Emma is a friendly gray elephant with large pink-lined ears, a coral felt dress, a mustard star patch, and a tiny coral hair bow; one hand raised in greeting. | `exec-4ab12fa1-951c-49be-bede-37eb30281c0e` |
| luna | Luna is a gentle cream lamb with fluffy wool curls, lavender overalls, a yellow shirt, a small heart patch, and one hoof raised in greeting. | `exec-a67c6046-adca-42ab-9ee0-d71e8e24fd4c` |
| sofia | Sofia is an elegant friendly white swan with a long curved neck, orange bill and feet, a lavender felt shoulder cape, and a tiny gold star clasp; wings softly open. | `exec-83d698b5-c505-4101-900c-43edc8be5ecb` |
| aria | Aria is a cheerful tan alpaca with a fluffy cream forelock, teal overalls, a coral shirt, a tiny heart patch, and one hoof raised. | `exec-f0ef417b-c398-43f4-90ac-d0725c610055` |
| hazel | Hazel is a cozy brown hedgehog with layered felt quills, a mustard cardigan, teal buttons, and a burgundy skirt; one paw raised. | `exec-3e061eaf-7690-4a3b-9a90-971d70883bf8` |
| nora | Nora is a smiling teal narwhal with a rainbow-striped felt horn, white belly, lavender fins, rosy cheeks, and a playful upright swimming pose. | `exec-8b741857-97cc-4f81-9d00-a56e13d2796e` |
| lily | Lily is a friendly dark-brown and black ladybug with rosy cheeks, curved antennae, a pink striped skirt, red wing cases with black spots, and one hand raised. | `exec-c734d8e1-39bc-4365-9b4b-dbcb5325e9ae` |
| ellie | Ellie is a joyful brown-skinned child explorer with long dark braids, a green felt safari hat, mustard vest, green shirt, coral shorts, brown boots, and teal binoculars held at her side. | `exec-13e46a71-898f-4029-b93d-7b0d11c3e533` |
| lucy | Lucy is a sunny cream llama with a fluffy forelock, coral shirt, teal overalls, a small orange heart patch, and one hoof raised. | `exec-0593c769-7e82-4653-8ea5-82ad952a1694` |
| liam | Liam is a brave golden lion cub with a layered brown mane, teal shirt, blue overalls, a coral pocket patch, and one paw raised. | `exec-779fe98a-efcf-4591-91ce-b80cf75020d4` |
| noah | Noah is a playful orange newt with teal spots and head frills, a mustard shirt, teal overalls, a tiny heart patch, and one hand raised. | `exec-44b20887-c564-4249-ae67-9058fa056ccb` |
| james | James is a cheerful golden jaguar cub with dark rosettes, green overalls, a mustard shirt, rounded paws, and one paw raised. | `exec-f2d6cefd-8d0f-48c7-8c56-54e1910804ac` |
| henry | Henry is a playful warm-brown horse with a dark yarn mane, ochre overalls, a tiny green neckerchief, and one hoof raised. | `exec-c83b5478-cde1-4abc-81d7-3c419369e162` |
| lucas | Lucas is a smiling tan lynx with spotted cheeks, tufted ears, a green shirt, mustard-and-teal overalls, and one paw raised. | `exec-e14eb43c-d8a0-4549-8f73-19609d39330e` |
| mateo | Mateo is a colorful macaw with blue, teal, yellow, and coral wings, a cream-and-charcoal face, a red felt vest, and one wing raised in greeting. | `exec-89f68715-9066-4c9c-9315-8dc825fda7d5` |
| levi | Levi is a friendly gray-and-cream ring-tailed lemur with bright eyes, a teal shirt, burgundy vest, lavender scarf, and the striped tail curved clearly beside the body. | `exec-808e8a9a-47cb-46ee-883e-8fbbd85e373d` |
| jack | Jack is a friendly tan jackrabbit with very long upright ears, blue overalls, a mustard shirt, a small coral patch, and one paw raised. | `exec-b0f3d88f-1b9a-475e-b281-415ff5bf2503` |
| owen | Owen is a warm brown otter with cream muzzle, a mustard felt raincoat with teal buttons, visible tail, and one paw raised. | `exec-14282ccf-1391-4f96-938c-43fbd5729f2b` |
| ezra | Ezra is a cheerful bald eagle with cream head, golden beak and feet, layered brown wings, a burgundy aviator vest, teal scarf, and one wing raised. | `exec-1ed871c1-3132-4c69-9a2b-fbe443bb3678` |

## Environment and UI master prompts

### Classroom background

Execution `exec-709d62b7-e355-4dce-9dae-17f09a52226b`; source `gpt-image-2/classroom-master.png`.

> Create a wide 1180:820 cozy preschool classroom entirely from tactile wool
> felt and stitched fabric. Calm powder-blue felt wall, pale wooden/felt floor,
> round window with soft hills and sun at left, pastel stitched bunting across
> the top, two hanging stars at upper right, low bookcase with felt books and
> potted plants at right, basket of yarn balls and one flower cushion at lower
> left, and a large cream oval rug with coral rim across the bottom. Preserve a
> broad uncluttered blue center for game pieces. Straight-on stage view, soft
> diffuse lighting, premium stop-motion storybook finish. No people, animals,
> words, letters, logos, buttons, loose puzzle pieces, hard plastic, or vector
> shapes.

### Title appliqué

Execution `exec-733fde64-380f-458d-bb22-9fd4147c038b`; source `gpt-image-2/title-master.png`.

> Create a single isolated handmade felt title appliqué reading exactly “Name
> Puzzle” on two centered lines. Chunky rounded preschool letters, each letter a
> different cheerful rainbow felt color, thick dark-navy felt backing, cream
> stitching, dimensional stuffed edges, clear spelling and high legibility.
> Uniform flat dark-charcoal extraction background. No other words, mascot,
> scene, floor, border, cast shadow, duplicate title, or cropped edge.

### Letter-tile contact sheet

Execution `exec-36d0c87e-ca32-4025-9fa0-a6e303a8a017`; source `gpt-image-2/letter-kit-master.png`.

> Create an exact 4-column by 2-row contact sheet of eight isolated, blank,
> square stuffed-felt letter tiles, evenly sized and centered in their cells.
> Reading left-to-right, top-to-bottom: red, orange, mustard yellow, leaf green,
> deep teal, sky blue, lavender, and warm cream letter-slot tile. Each has
> rounded corners, visible cream blanket stitching, a softly raised inner inset,
> identical construction and camera angle. Uniform flat dark-charcoal
> background between tiles. No letters, numbers, symbols, labels, shadows,
> overlap, perspective mismatch, extra tile, or missing tile.

### Name-card panel contact sheet

Execution `exec-3f0aa94e-f97d-4b3b-84fa-d2a8abcadbe5`; source `gpt-image-2/panel-kit-master.png`.

> Create an exact 3-column by 2-row contact sheet of six isolated, blank,
> horizontal rounded-rectangle felt label panels. Reading left-to-right,
> top-to-bottom: coral, mustard, leaf green, lavender, dark plum, teal. Same size
> and proportions; visible cream blanket stitching; softly stuffed tactile
> edges; broad empty center. Uniform flat dark-charcoal background. No text,
> letters, icons, labels, shadows, overlap, extra panel, or missing panel.

### Name board

Execution `exec-b3de36e3-5e95-45bb-aeb6-97f0772eb82d`; source `gpt-image-2/name-board-master.png`.

> Create one isolated long horizontal cream felt puzzle board with gently
> rounded capsule ends, a pale lavender felt rim, cream blanket stitching, and a
> clean empty center wide enough for five square letter slots. Premium stuffed
> wool-felt construction. Uniform flat dark-charcoal extraction background. No
> letters, tiles, holes, icons, text, logo, cast shadow, scene, or cropped edge.

### Star medal

Execution `exec-fd92d487-a96b-4708-81a2-2a4d155338fd`; source `gpt-image-2/star-medal-master.png`.

> Create one isolated celebratory felt prize rosette: plump mustard-gold star on
> a lavender pleated circular ribbon, cream stitching, and three short coral,
> teal, and lavender ribbon tails. Friendly preschool craft quality, front view,
> centered with margin. Uniform flat dark-charcoal extraction background. No
> text, number, logo, extra medal, scene, shadow, or cropped edge.

### Navigation contact sheet

Execution `exec-86925cae-6f0b-424c-b86b-1466342a73f0`; source `gpt-image-2/navigation-kit-master.png`.

> Create an exact single row of five isolated circular felt navigation buttons,
> evenly sized and centered: (1) orange with a cream felt home icon, (2) orange
> with a cream left arrow, (3) blue with a cream speaker and two sound waves,
> (4) sky-blue with a cream left chevron, (5) sky-blue with a cream right
> chevron. Every circle is softly stuffed with visible cream blanket stitching;
> every mark is a tactile sewn felt appliqué, not a vector glyph. Uniform flat
> dark-charcoal background. No words, labels, extra icons, shadows, overlap,
> missing button, or cropped edge.

### Curated hub tile

Execution `exec-e9419e79-e068-4d50-9f32-f9b4c5791415`; source
`gpt-image-2/hub-tile-master.png`. This was an image-to-image composition using
`belle-master.png` and `classroom-master.png` as references, then deliberately
reviewed and promoted to `../../../../assets/hub/tiles/name-puzzle.jpg` at
640×533 JPEG. It was not written by a registry or bulk-art pipeline.

> Create a polished 6:5 landscape menu-tile illustration for the preschool game
> “Name Puzzle,” using the supplied Belle character and cozy blue felt classroom
> as visual references. Preserve Belle’s exact warm brown skin, big brown eyes,
> black curly updo and ringlets, jeweled rainbow crown, rainbow stitched-felt
> princess dress, purple shoes, and rainbow-crystal staff. Compose Belle
> joyfully on the right, waving beside a low cream felt name-puzzle board on the
> left holding five large colorful tactile felt letter tiles that spell exactly
> B E L L E, one character per tile, clearly readable. Retain the tactile
> powder-blue felt wall, pastel bunting, warm rug, flower cushion, yarn basket,
> small bookshelf and plants, but simplify them so the central game action is
> unmistakable at thumbnail size. Premium cozy wool-felt and stitched-fabric
> stop-motion storybook style throughout, warm diffuse light, strong friendly
> silhouettes, vivid but harmonious QLOBE palette, no hard plastic, no vector
> art. No title, logo, sentence, UI buttons, border, watermark, duplicated
> character, extra limbs, garbled letters, or any text other than the five exact
> tile letters B E L L E. Keep all important content within a generous safe area
> for a 640×533 crop.

### Open Graph promotional image

Execution `exec-ddc94ce8-a462-4230-93bc-9f8e2b51d26a`; source
`gpt-image-2/og-promo-master.png`. This was an image-to-image composition using
`hub-tile-master.png` and `title-master.png`, then encoded to
`../og-image.jpg` at exactly 1200×630.

> Create a premium 40:21 ultra-wide social preview image for the preschool game
> Name Puzzle, using the supplied finished hub composition and exact felt Name
> Puzzle title appliqué as references. Preserve Belle’s exact warm brown skin,
> big brown eyes, black curly updo and ringlets, jeweled rainbow crown, rainbow
> stitched-felt princess dress, purple shoes, and rainbow crystal staff. Compose
> for 1200×630: a large, highly legible, exact “Name Puzzle” felt title in the
> upper-left safe area; beneath it a cream stitched name board with five large
> colorful felt tiles spelling exactly B E L L E, one clear letter per tile;
> Belle large on the right, smiling and waving with her full crown, dress,
> shoes, and staff visible. Use the cozy powder-blue felt classroom, pastel
> bunting, window, warm rug, flower cushion, yarn basket, and small bookshelf as
> a simplified backdrop, with strong thumbnail hierarchy and little empty wall.
> Tactile wool-felt and stitched-fabric stop-motion storybook quality, warm
> diffuse light, vivid harmonious QLOBE palette. No extra words, subtitle, UI
> buttons, home/sound icons, border, watermark, duplicated character, extra
> limbs, garbled letters, hard plastic, or vector art. Keep the title, board,
> and Belle inside generous central safe margins so a centered 40:21 crop
> retains all three.

## Layer extraction and finalization

The production local-Qwen extraction template is preserved verbatim in
`../../tools/extract-characters.py` and instantiated with an exact subject
description for each of the 20 characters, three single UI masters, eight
letter tiles, and two UI sheets. The blank letter tiles are deterministically
cropped and background-presented through Qwen Image Edit before their separate
Layered jobs; the panel and navigation sheets remain intact and are cropped
only after their authoritative alpha layer is returned:

> Layer 1 is only the complete dark-charcoal background, including every
> background pixel and cast shadow. Layer 2 must be {exact subject description}
> alone on true transparency. Preserve the exact input pixels, identity,
> silhouette, colors, facial features, text, layout, felt texture, stitching,
> scale, and lighting. Keep all foreground parts fully present. Do not redraw,
> redesign, crop, rearrange, add, remove, repair, extend, or invent anything.
> Everything outside the named foreground objects must be fully transparent;
> retain no charcoal bands, halos, rectangles, floor, cast shadow, or background
> residue.

For each letter tile, the focused Layered prompt is:

> Layer 1 is every grey background pixel and the grey cast shadow. Layer 2 is
> only {exact felt tile description}, with true transparent alpha everywhere
> outside the felt tile.

It targets `qwen-image-layered`, two layers, seed 42 for characters and whole
UI masters, and a bounded 1337/42/9001 seed ladder for individual letters. It
stores only accepted authoritative `output=layer_2` PNGs in
`assets/source/layered/`. Accepted job ids/seeds, source and layer checksums,
machine-validation metrics, pending attempts, and rejected candidates are
retained in `qwen-jobs.json`, `qwen-layer-report.json`,
`qwen-pending-jobs.json`, and `qwen-layer-rejections.json`; the configured LAN
address is not. A release check requires no pending attempts. The deterministic
finalizer only trims, pads, resizes, and encodes those RGBA layers, then creates
`qa-layered/contact-sheet.png` and `qa-layered/alpha-report.json`. It has no
matte-inference fallback.
