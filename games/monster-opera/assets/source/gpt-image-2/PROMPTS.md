# Monster Opera — GPT Image 2 production prompts

All accepted files in this directory were made on 2026-08-17–18 with OpenAI GPT
Image 2 through Codex's built-in image-generation tool. The tool does not expose
a seed. `edit` rows used the named committed input; `new` rows used no runtime
image as a dependency. Prompts below retain the full reproduction intent; only
Markdown whitespace is normalized.

## Environment plates

### `garden-stage-clean.png` — edit of `../ui-mockups/show.png`

> Precise object-removal edit for a production game background. Preserve the
> exact Kawaii flower-garden theater, camera, red curtains, flower garlands,
> wooden stage, mint sky, clouds, plush lighting, and 4:3 composition. Remove
> all five monsters, every UI control, recording label, button, and confetti
> piece. Reconstruct the empty stage floor and scenery naturally. No text,
> watermark, characters, or interface.

### `solo-stage-clean.png` — edit of `../ui-mockups/solo.png`

> Precise object-removal edit for a production game background. Preserve the
> exact mint-to-sky-blue Kawaii gradient, soft clouds, stars, sparkles, and
> luminous concentric singing ripples. Remove the large monster, portrait rail,
> title, pitch buttons, HUD, call-to-action, and all other UI. Reconstruct a
> clean empty 4:3 solo stage. No text, watermark, character, or interface.

### `cloud-stage-clean.png` — new

> Empty Kawaii cloud concert stage, 4:3 production game background, plush white
> circular cloud platform with soft steps, pale blue sky, pastel rainbow arch,
> tiny bunting, puffy lavender and pink clouds, sparse golden stars, soft studio
> light, shallow toy-diorama depth, safe empty center for five performers. Match
> the glossy plush/clay Monster Opera art world. No characters, text, buttons,
> UI, watermark, or border.

### `moon-stage-clean.png` — new

> Empty Kawaii moonlight opera stage, 4:3 production game background, deep
> violet velvet curtains with gold trim and tassels, glowing crescent moon,
> hanging soft golden stars, lavender cloud banks, rounded purple stage and
> steps, magical plush/clay toy-diorama lighting, safe empty center for five
> performers. No characters, text, buttons, UI, watermark, or border.

## Splash plates

### `splash-clean.png` — edit of `../ui-mockups/splash.png`

> Preserve the exact spell-checked glossy “Monster Opera” title artwork and the
> lavender-to-mint Kawaii musical sky. Remove all monster portraits, play
> control, Home/Sound controls, and every other interface object. Reconstruct
> clouds, notes, and sparkles behind the removals. Keep a clean 4:3 composition
> with the complete title centered and open lower space. No extra text,
> character, button, watermark, or border.

### `splash-portrait.png` — edit/outpaint of `splash-clean.png`

> Reframe and outpaint this exact polished Monster Opera splash background into
> a tall 9:16 portrait mobile-game background. Preserve the exact existing
> “Monster Opera” title artwork, spelling, letter shapes, orange/yellow colors,
> deep purple outline, white rim, and glossy plush 3D style, but scale it smaller
> so the entire title fits comfortably within the middle 82% of the canvas.
> Place the title around 31% from the top. Extend the lavender-to-mint sky,
> clouds, sparkles, and music notes; reserve the top corners for HUD and keep the
> lower 42% mostly open. Remove all characters, cards, UI, and buttons. No extra
> text, logo, border, or cropped title.

## Cast

### `monster-lineup-black.png` — new

> Exactly eight distinct full-body fuzzy Kawaii monster singers in a strict 4×2
> contact sheet on a uniform black authoring background: mint striped horns and
> sprout tuft; pink bow and candy horn; blue round ears and blue tuft; purple
> spiral horns; orange bear ears; yellow antennae; teal round ears; coral little
> horns. One centered neutral front-facing monster per equal cell, complete
> silhouette, arms and feet visible, enormous expressive eyes, rosy cheeks,
> soft glossy plush/clay 3D finish, consistent scale and lighting. No text,
> cards, badges, props, shadows crossing cells, watermark, or extra subjects.

`monster-lineup-alpha.png` is the accepted transparent-background derivative;
`tools/finalize-cast.sh` performs the fixed 4×2 split and WebP encoding.

## Current card and interface masters

### `blank-card-source.png` — edit of `card-mint-neutral.png`

> Create one production-ready blank portrait card plate for the Monster Opera
> preschool game. Preserve the exact warm Kawaii glossy 3D-papercraft style,
> rounded yellow-gold outer frame, creamy white inner rim, pale mint portrait
> field, soft lavender outside area, tactile highlights, and centered
> straight-on composition. Remove the monster completely. Remove every badge,
> check, play symbol, note, star, letter, and word. Leave the entire mint field
> clean for a separately composited full-body monster. No characters, text,
> icons, confetti, or crop.

Every runtime card is now this neutral plate plus the corresponding exact
`assets/monsters/<id>.webp` sprite. `tools/finalize-cards.sh` records the fixed
374×420 base and sprite overlay, so card, solo, tray, and performance identity
cannot drift.

### `chroma-ui-sheet.png` — edit using `ui-mockups/{solo,show,stages}.png`

> Create a production Monster Opera UI sheet in the approved glossy
> clay/papercraft coral, plum, cream, teal, pink, yellow, and sky-blue language.
> Exactly 12 isolated objects in a 4×3 arrangement: blank coral pill; blank teal
> pill; coral recording pill with a small ruby/white dot; pink high-arrow pitch
> disc; yellow middle-dot pitch disc; blue low-wave pitch disc; ivory replay
> disc with plum loop arrow; purple pause disc; purple resume disc; compact
> gold-and-cream selected check badge; blank cream/lavender cast tray; blank
> purple label pill. No words, letters, crop, overlap, or extra objects.

The first accepted object pass returned a baked checker preview instead of
usable alpha. A precise corrective edit preserved the objects and replaced only
the negative space with uniform `#00FF00`. The committed chroma master is that
corrected result. `tools/finalize-cards.sh` uses the Codex image-generation
workflow's sampled key color in a pinned FFmpeg `chromakey` matte, then performs
explicit non-overlapping crops and alpha WebP encoding. The finalizer therefore
has no dependency on a user-home skill installation.

### `transparent-headings.png` — edit using
`ui-mockups/{chorus,solo,stages}.png`

> Create one transparent production sheet with exactly three decorative
> Monster Opera heading lockups in three separated rows. Preserve the cheerful
> Kawaii coral/plum/cream hand-lettered theatre treatment, rounded dimensional
> letters, musical flourishes, tactile highlights, and clean alpha edges. Exact
> wording and spelling, with no other words: “MAKE A CHORUS”, “SING WITH ME”,
> and “PICK A STAGE”. No scenery, cards, characters, buttons, or crop.

The three spell-checked lockups are alpha-tightened and encoded as
`assets/ui/{chorus,solo,stage}-heading.webp` by the same deterministic script.

## Card repairs

### `card-yellow-clean.png`

> Preserve the square yellow antenna-monster portrait card, face, colors, plush
> rendering, rounded white frame, lavender corners, and bottom yellow star
> badge. Remove only the large cropped coral play control at lower-right and
> stray purple notes at the right edge; reconstruct the missing monster, frame,
> and corner. No new text, icon, control, character, or decoration.

### `card-teal-clean.png`

> Preserve the square teal round-ear portrait card, face, colors, plush
> rendering, yellow/white frame, lavender corners, top-right check badge, and
> bottom teal note badge. Remove only the cropped coral play control at
> lower-left and stray music note; reconstruct the monster and frame. No new
> text, icon, control, character, or decoration. This intermediate is retained;
> `card-teal-neutral.png` supersedes it at runtime.

### `card-{mint,blue,orange,teal}-neutral.png`

> Precise object-removal edit for a production portrait card. Preserve the
> exact monster, face, fur, colors, glossy Kawaii rendering, complete rounded
> frame, lavender corners, and bottom musical badge. Remove only the small
> white-and-yellow selection check at top-right and reconstruct the frame and
> corner cleanly. Keep all other elements unchanged. No text, controls, extra
> characters, or decoration; no selection mark anywhere.

### `card-mint-neutral.png` final cleanup

> Preserve the accepted neutral mint card and remove only two dull gray/beige
> generation smudges on the pink cheek circles, restoring smooth glossy rosy
> blush. Keep the top-right corner free of a check badge and change nothing
> else conceptually.

These repaired legacy card masters are retained as accepted visual-development
history, but no longer feed runtime cards. The blank plate plus exact cast
sprites above supersedes them and guarantees that concept-only selection checks
cannot return on a rerun.

## Facial pose sources

### `singing-mouth-source.png` — expression reference pass

> Create a clean production facial-expression reference sheet for the exact
> eight fuzzy Kawaii Monster Opera singers in the approved lineup: mint striped
> horns, pink bow, blue round ears, purple spiral horns, orange bear ears,
> yellow antennae, teal round ears, and coral little horns. Arrange exactly
> eight separated, front-facing face studies in a strict 4×2 grid, one identity
> per cell and in that order. Preserve each singer's fur color, eye color,
> cheeks, nose, lighting, and plush/clay finish. Give every singer one joyful,
> clearly open singing mouth with a simple dark mouth cavity, small tongue, and
> friendly rounded vowel shape; eyes stay open. Consistent camera, scale, and
> light. Clean authoring background. No bodies, text, notes, props, extra
> characters, cropped faces, watermark, or interface.

### `blink-face-source.png` — expression reference pass

> Create a clean production facial-expression reference sheet for the exact
> eight fuzzy Kawaii Monster Opera singers in the approved lineup: mint striped
> horns, pink bow, blue round ears, purple spiral horns, orange bear ears,
> yellow antennae, teal round ears, and coral little horns. Arrange exactly
> eight separated, front-facing face studies in a strict 4×2 grid, one identity
> per cell and in that order. Preserve each singer's fur color, cheeks, nose,
> smile, lighting, and plush/clay finish. Give every singer a gentle natural
> blink with both eyelids fully closed as soft curved lashes; mouths remain
> neutral and friendly. Consistent camera, scale, and light. Clean authoring
> background. No bodies, text, notes, props, extra characters, cropped faces,
> watermark, or interface.

Both tool results were 1922×818 RGB authoring sheets with a baked checker
preview rather than trustworthy alpha. The checker is never composited into a
runtime asset. `tools/finalize-facial-poses.sh` isolates only registered facial
patches, feathers their raster edges, and places them over the exact accepted
neutral sprites. The purple singing mouth and yellow/teal blink faces use
explicit per-character crops recorded in that script. The 16 resulting
512×512 alpha WebPs were reviewed on dark and light production stages.

### `gaze-left-source.png` — edit of `monster-lineup-black.png`

> Edit only the irises and pupils of the exact eight Monster Opera characters
> so every character clearly looks toward the viewer's LEFT (the characters'
> right), as if following a finger near the left edge of the screen. The input
> is the exact identity, pose, lighting, proportions, strict 4×2 layout, and
> framing authority. Preserve the exact eight identities, fur, horns, bow,
> ears, antennae, bodies, mouths, eyelids, eye whites, catchlights, colors,
> scale, spacing, camera, lighting, black background, and complete silhouettes.
> Keep both eyes open. Move only the colored irises, dark pupils, and their
> catchlights consistently leftward within the existing white eyeballs. The
> gaze must be obvious but friendly and anatomically plausible, with no crossed
> eyes. Preserve the row order mint, pink, blue, purple; orange, yellow, teal,
> coral. No text, extra character, layout change, crop, prop, blink, mouth/body
> change, background change, or watermark.

### `gaze-right-source.png` — edit of `monster-lineup-black.png`

> Edit only the irises and pupils of the exact eight Monster Opera characters
> so every character clearly looks toward the viewer's RIGHT (the characters'
> left), as if following a finger near the right edge of the screen. The input
> is the exact identity, pose, lighting, proportions, strict 4×2 layout, and
> framing authority. Preserve the exact eight identities, fur, horns, bow,
> ears, antennae, bodies, mouths, eyelids, eye whites, catchlights, colors,
> scale, spacing, camera, lighting, black background, and complete silhouettes.
> Keep both eyes open. Move only the colored irises, dark pupils, and their
> catchlights consistently rightward within the existing white eyeballs. The
> gaze must be obvious but friendly and anatomically plausible, with no crossed
> eyes. Preserve the row order mint, pink, blue, purple; orange, yellow, teal,
> coral. No text, extra character, layout change, crop, prop, blink, mouth/body
> change, background change, or watermark.

The gaze edits returned 1772×888 and 1776×886 RGB sheets. Their bodies are not
runtime frames. The finalizer records each exact cell geometry, isolates two
feathered eye ellipses only, and composites those pixels over the accepted
neutral 512×512 sprites. Pointer tracking therefore changes authored raster
irises without allowing generated mouth, fur, silhouette, or accessory drift.
