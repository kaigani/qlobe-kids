# Snack Chef — assets and provenance

Runtime assets are local and offline. Original QLOBE art and recordings are
released under CC BY 4.0; code is MIT. Generated outputs were created for this
project and contain no third-party logos or copyrighted characters.

## 2026-07-30 expansion — painted food art and three new recipes

All interactive food, verb pictograms, celebration art, three new recipe
cards, and six reveal heroes were generated with the local Qwen image-edit
workflow, style-anchored to this game's own GPT Image 2 sources
(`assets/source/recipes-gpt-image-2-chroma.png` cells as reference images) so
the new art provably matches the shipped storybook look. Recipe:

```text
qwen-image-edit, reference = contact-sheet cell, seed 42 (retries 1337)
prompt = "Replace everything with one single <subject>…" + fixed storybook
gouache suffix + "flat solid uniform magenta background"
→ border-sampled magenta chroma key (soft distance matte + despill, the
  same approach as the original 2026-07-29 chroma assets)
→ alpha QA composited over assets/kitchen.webp, per-asset eyeball review
→ Lanczos resize, WebP q88 (≤520 px) / q82 (larger)
```

| Asset group | Files | Notes |
| --- | --- | --- |
| `../../shared/assets/foods-storybook/` | 15 × 400 px cutouts (kiwi, blueberry, strawberry, banana coin/crescent, orange, grape, toast, apple whole/round, granola, yogurt pot, jam + nut-butter blobs) | New shared painted-food library; any storybook-world game may reuse |
| `assets/food/` | 14 staged boards (plate, toast, kiwi, apple, bananas, peel strip, boat, parfait glass, pour stream, blobs, pot) | Game-local larger encodes of the same sources; boat rotated 90° |
| `assets/ui/` | 5 verb pictograms, `star-gold.webp`, `banner-ribbon.webp` | Ribbon is deliberately text-free |
| `assets/apple-sandwich.webp`, `assets/rainbow-plate.webp`, `assets/yogurt-parfait.webp` | 3 recipe cards | Apple card harvested from a qwen-image-edit pass over the original contact sheet; rainbow/parfait as single-cell generations |
| `assets/reveal/` | 6 reveal heroes (~900 px) | Repainted large from each card cutout on a 1200 px canvas ("repaint this exact same snack much larger") |

Shadow scribbles on `yogurt-pot`, `grape-purple`, and the boat hero were
removed with a second qwen-image-edit pass ("Remove the dark painted shadow…
keep identical"). Retried prompts (seed 42 unless noted): `banana-boat-base`
(open-boat rewording), `pour-stream` (stream only), `yogurt-pot` /
`yogurt-pot-tilted` / `grape-purple` (no-shadow rewording; tilted pot was
ultimately dropped in favor of CSS rotation). Full prompt text lives in the
production scratch scripts and is summarized by the recipe above; per-asset QA
was a visual pass of every cutout composited over the kitchen backdrop.

### Voice — 18 new clips (2026-07-30)

Same pipeline as the original 16 (`qwen3-tts-voiceclone`, teacher reference,
seed 7, whisper-stt small/en transcript QA, ratio ≥ 0.8), encoded with ffmpeg
AAC 96k `+faststart`. Every clip ships with a `.recipe.json` sidecar recording
seed, transcript, and ratio. Covers the three new recipes, `hold-pour`, and a
re-record of `start-dot` (previously Web Speech fallback — it was the one
failure-moment line spoken in a different voice).

## GPT Image 2 storybook art

The built-in GPT Image 2 production path generated the source images below on
2026-07-29 and 2026-07-30. Runtime files were deterministically resized and encoded
with `cwebp`. Chroma-key sources were processed with the Codex image-generation
skill's `remove_chroma_key.py`, using border sampling, soft matte, and despill.

| Runtime asset | Retained source | Dimensions / bytes | Production notes |
| --- | --- | --- | --- |
| `assets/kitchen.webp` | `assets/source/kitchen-gpt-image-2.png` | 1600×1200, ~179 KB | 4:3 full-bleed storybook kitchen; calm center and top; WebP q80 |
| `assets/title.webp` | `assets/source/title-gpt-image-2-chroma.png` | 900 px wide, ~63 KB | Exact painted `SNACK CHEF` lockup; green key removed; full-size spelling QC passed |
| `assets/fruit-face.webp` | `assets/source/recipes-gpt-image-2-chroma.png` | 520 px wide, ~33 KB | Left cell of a fixed three-column contact sheet; magenta key removed |
| `assets/toast-garden.webp` | same contact sheet | 520 px wide, ~45 KB | Center cell; deterministic 661 px crop |
| `assets/banana-boat.webp` | same contact sheet | 520 px wide, ~29 KB | Right cell; deterministic 661 px crop |
| `assets/gesture-finger.webp` | `assets/source/gesture-finger-gpt-image-2-chroma.png` | 384×384, ~12 KB | Small upright pointing hand; chroma key removed; 50%-opacity runtime demo |

### Kitchen prompt

> Paint a warm, inviting children's storybook kitchen viewed straight-on, with
> a generous honey-colored wooden worktop spanning the lower third. White tile
> backsplash, low shelves with ceramic bowls and jars, and a sunny window.
> Premium hand-painted gouache and colored-pencil texture on warm paper,
> chunky charcoal contours, calm central 60%, no people, text, UI, or watermark.

### Title prompt

> Create a hand-painted decorative title lockup containing exactly `SNACK` on
> the first line and `CHEF` on the second. Plump storybook gouache letters in
> raspberry, blueberry, honey, and orange with a cream outline, a tiny chef hat,
> strawberry and blueberry ornaments, on flat solid green chroma key. No extra
> words or letters.

### Recipe-sheet prompt

> Create one exact three-column contact sheet on flat solid magenta. Left: a
> white plate with kiwi eyes, strawberry nose, blueberry cheeks, and banana
> smile. Center: yogurt toast garden with banana flowers and blueberry centers.
> Right: a banana boat with banana coins, strawberries, and blueberries.
> Top-down storybook gouache, identical scale, no borders, text, hands, or
> objects crossing cells.

### Gesture-finger prompt

> Create one friendly simplified pointing hand with the index finger extended
> upward, as if the fingertip is touching a touchscreen. Warm peach tone,
> rounded fingers, storybook gouache and colored-pencil texture, chunky
> dark-brown painted outline, centered on flat solid green chroma key. One hand
> only; no sleeve, shadow, text, symbol, arrow, or extra object.

Visual QA confirmed coherent camera angle, correct food anatomy, clean alpha
corners, and no key-color fringe. The title reads exactly `SNACK CHEF`.

## Hub tile — QLOBE Studio / Krea 2

| Asset | Source / recipe | Production |
| --- | --- | --- |
| `../../assets/hub/tiles/snack-chef.jpg` | `assets/source/hub-krea2-seed42.png`, `assets/source/hub-krea2-recipe.json` | Studio `menu-game-tile`, `krea2-turbo-t2i`, seed 42; resized from 768×640 to 640×533 JPEG |

Prompt recorded by the recipe:

> A child-safe wooden spreading knife painting pale berry yogurt across a slice
> of toast on a little cutting board, with kiwi rounds, strawberries,
> blueberries and banana slices arranged beside it like a cheerful face.

The Studio appends its proven Toy Table suffix. The accepted tile contains no
text and passed visual review before hand-curation into the hub.

## Teacher voice — QLOBE Studio / Qwen

All 16 runtime clips in `assets/audio/` were generated with the Studio
`character-voice-line` template:

```text
qwen3-tts-voiceclone, teacher reference, seed 7
→ AAC/M4A 96 kbps
→ whisper-stt base English transcript comparison
```

Every clip has an adjacent `.recipe.json` sidecar with the intended line,
seed, transcript, similarity ratio, and accepted QA state. All transcript
checks passed (`ratio ≥ 0.8`; 14 were exact-normalized matches, and the other
two scored 0.933 and 0.992). `assets/audio/manifest.json` records real durations
and `assets/audio/lines.json` is the Web Speech fallback source of truth.

## Shared assets

| Asset | Creator / source | License | Use |
| --- | --- | --- | --- |
| `shared/characters/maya/portrait.png` | QLOBE Kids shared cast | CC BY 4.0 | Splash and plated reveal guide |
| `shared/assets/ui/btn-home.png` | QLOBE Kids | CC BY 4.0 | Splash catalog navigation |
| `shared/assets/ui/btn-back.png` | QLOBE Kids | CC BY 4.0 | Play/reveal back navigation |
| `shared/assets/ui/btn-sound.png` | QLOBE Kids | CC BY 4.0 | Prompt replay |
| `shared/fonts/fredoka-latin-600-normal.woff2` | Fredoka project | SIL OFL 1.1 | Functional interface text |

## Code-native visual and sound assets

As of the 2026-07-30 expansion, all interactive food is painted cutout art
(see above); the remaining code-native visuals are the wooden work board,
guide lines, slot outlines, the parfait fill layer, progress marks, and
confetti — deterministic HTML/CSS authored for this game. Precise cuts reuse
Sand Tray Letters' proven code-native visual language: a `#ff7414` origin dot
with a five-pixel white ring and a short white arrow. Broader spreading,
peeling, and pouring use the generated pointing-finger sprite at 50% opacity,
animated alongside the spoken prompt and dismissed on first input. Tactile
sounds use `shared/js/sfx.js` and create no asset files. Every spoken line,
including `start-dot`, now has a recorded teacher clip.

## Link preview

`assets/og-image.jpg` is a 1200×630 screenshot-derived crop of the finished
splash, regenerated through `tools/pipeline/capture_og_images.mjs`.
