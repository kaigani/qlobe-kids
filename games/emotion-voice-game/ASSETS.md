# Emotion Voice Game assets

All original game-local art is self-generated for QLOBE Kids and licensed CC BY
4.0. Runtime files contain no remote model or service dependency.

## Production art

| Runtime asset | Source | Creator / workflow | Processing | Attribution |
| --- | --- | --- | --- | --- |
| `assets/felt-stage.webp` | `assets/source/felt-stage-gpt-image-2.png` | OpenAI built-in image generation, GPT Image 2, 2026-08-03 | resized and WebP encoded | no |
| `assets/title.webp` | `assets/source/title-gpt-image-2.png` → `title-alpha.png` | OpenAI built-in image generation, GPT Image 2, 2026-08-03 | chroma-key removal, trim, resize, WebP | no |
| `assets/characters/bear-*.webp` | original pose sheet; Happy/Silly corrected by `bear-{happy,silly}-v2-gpt-image-2.png` → `*-alpha.png` | OpenAI built-in identity-preserving image edits, GPT Image 2, 2026-08-03 | chroma-key removal, complete-silhouette outpaint, normalized 480×680 alpha canvases with ≥35 px horizontal runtime margin | no |
| `assets/characters/teddy/anim/mouth-*.png` | `assets/source/visemes/teddy-visemes-gpt-image-2.png` → `teddy-visemes-alpha.png` | OpenAI built-in identity-preserving viseme-sheet generation, GPT Image 2, 2026-08-03 | deterministic 3×3 slice, soft muzzle matte, canonical QLOBE viseme names plus rest alias | no |
| `assets/ui/*.webp` | `assets/source/ui-kit-gpt-image-2.png` → `ui-kit-alpha.png` | OpenAI built-in image generation, GPT Image 2, 2026-08-03 | chroma-key removal, deterministic 6-cell split, connected-component cleanup, alpha WebP | no |
| `assets/ui/prompt-banner.webp`, `assets/ui/next-button.webp` | `assets/source/ui-banners-gpt-image-2.png` → `ui-banners-alpha.png` | OpenAI built-in image generation, GPT Image 2, 2026-08-03 | chroma-key removal, deterministic 2-cell split, connected-component cleanup, alpha WebP | no |

The installed image-generation skill’s `remove_chroma_key.py` performed soft
matte/despill extraction. `tools/process-art.py` owns the reproducible final
crop, component cleanup, canvas normalization, and encoding. Alpha QA checks all
four corners of every final sprite; production Chrome shots are under
`qa-shots/emotion-voice-game/`.

## Final prompt set

### Felt stage

Use case `illustration-story`; full-bleed 4:3 tablet backdrop; a cozy handmade
felt puppet theater with deep midnight-blue felt wall, red curtains and valance,
warm honey spotlight, empty golden felt stage, stitched gold stars only at the
outer border; straight-on composition with a broad uncluttered performance area;
premium fabric diorama with visible fibers and embroidery; no characters, text,
letters, logo, controls, microphone, confetti, watermark, or tablet frame.

### Teddy pose sheet

Use case `illustration-story`; one consistent brown plush felt bear in exactly
five equal cells: neutral, Happy arms-up, Proud hands-on-hips with red cape, Calm
eyes-closed hands-together, and Silly one-foot pose; same size/baseline/identity,
red neckerchief in every pose, visible fibers and stitching; perfectly flat
`#ff00ff` background; no shadows, floor, text, labels, extra props, or watermark.

### Happy and Silly framing corrections

Use the affected pose as the edit target and neutral Teddy only as the identity
reference; preserve the pose, face, felt texture, stitching, neckerchief,
lighting, proportions, and camera angle; reconstruct only clipped outer limbs;
zoom out enough to show the entire silhouette with at least 14% empty margin on
all sides; flat `#ff00ff`; no frame, labels, text, props, or shadows.

### Teddy viseme sheet

Use case `character-model-sheet`; exact Teddy head and upper red neckerchief in
a strict unlabeled 3×3 grid on flat `#ff00ff`; fixed scale, placement, eyes,
brows, muzzle, lighting, and expression; only the mouth changes in canonical
order A, O, E, W/R, T/S, L/N, U/Q, M/B/P, F/V; no deformation outside the mouth.

### Title lockup

Use case `logo-brand`; exact text “Emotion Voice Game” in chunky padded felt,
navy “Emotion” and “Game,” orange “Voice,” two centered lines on a cream stitched
felt banner with two gold stars; isolated on flat `#00ff00`; exact spelling and
capitalization, no tagline, character, shadow, extra letters, or watermark.

### Felt UI kit

Use case `illustration-story`; exactly six equal cells on flat `#ff00ff`: empty
green, orange, blue, and purple stitched felt cards; navy circular button with a
cream microphone appliqué; red circular button with a gold star appliqué;
consistent scale, generous gutters, no text, shadows, floor, extra objects, or
watermark.

### Felt prompt and action carriers

Use case `illustration-story`; exactly two wide empty felt pieces on flat
`#ff00ff`: a cream instruction banner with a padded golden-orange stitched rim,
and a deep royal-blue action button with a cream-and-gold padded stitched edge;
same size, generous gutter, no text, icon, shadow, floor, extra object, or
watermark.

## Shared assets and runtime modules

- `shared/css/base.css`, `hud.css`, `screens.css`, and the Fredoka font.
- Raster Home/Back HUD art from `shared/assets/ui/` through `hud.css`.
- `voice-clips.js`, `audio-unlock.js`, `screens.js`, `tap.js`, `celebrate.js`,
  `sfx.js`, `preload.js`, `debug-harness.js`, and the new `voice-meter.js`.

These are QLOBE Kids originals under the repository asset/code licenses.

## Voice

`assets/audio/lines.json` is the exact production script. Teddy's selected
reference is the already-shipped Benny Bear character line at
`shared/characters/bear/voice/intro.m4a`. `tools/generate-voice.py` clones that
voice, Whisper-checks every result, normalizes it to M4A, runs Rhubarb 1.14, and
maps the timing to QLOBE's canonical visemes. The explicitly approved LAN pass
produced all 14 M4A clips and matching cue files; `manifest.json` records their
durations, cue paths, and script hashes, while `qa.json` retains every Whisper
transcript and similarity score. No runtime service request is made.

## Link preview

`assets/og-image.jpg` is the existing generated link-preview image. Regenerate
it from the finished splash through `tools/pipeline/capture_og_images.mjs` after
the hub registry is synchronized; do not hand-edit it.
