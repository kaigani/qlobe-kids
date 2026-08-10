# Pattern Bracelet Studio — assets

All shipped art is local and offline. Original game art is CC BY 4.0. Model calls are authoring-time only.

## Production art (Claymation — stop-motion polymer clay)

| Runtime asset | Source | Creator / workflow | Processing |
|---|---|---|---|
| `assets/workshop.webp` | `assets/source/workshop-placeholder.png` (PIL wood + linen) → later `shared/media/bracelet-workshop-bg/bracelet-workshop-bg.png` via Studio `scene-backdrop` (krea2-turbo-t2i, seed 42) | Local PIL placeholder then Krea2 `scene-backdrop` | resize to 1600×1200, WebP q82, ≤260KB |
| `assets/title.webp` | `krea2-turbo-t2i`, seed 42, first take — clay title plaque prompt (see below) | Krea2, border-flood-fill alpha key (uniform cream backdrop, not generative — preserves letterforms exactly) | trim to bbox, 3% pad, WebP q90, ~96KB |
| `assets/beads/bead-red.webp` etc (6) | `assets/source/bead-*.png` PIL torus → later Studio `prop-cutout` chain (`krea2-turbo-t2i` on dark charcoal → `qwen-image-layered` layer_2, seed 42) | PIL placeholder then Krea2 + Qwen layered | trim/pad to 512×512, WebP q88 ≈16KB each |
| `assets/beads/bead-red.png` (source) | `shared/media/test-bead-red/test-bead-red.raw.png` (Krea2 dark ground) + `test-bead-red.layer2.png` (Qwen extraction) | Studio `prop-cutout` | — |
| `assets/ui/star-gold.webp` | PIL star | PIL | WebP q90 |
| `assets/ui/banner-ribbon.webp` | PIL felt ribbon | PIL | WebP q90 |
| `assets/hub/tiles/pattern-bracelet-band.jpg` | PIL hub tile (bracelet on wood, 6 beads, 768×640) + later curated from `shared/media/bracelet-workshop-bg` if accepted | PIL placeholder / Krea2 | JPEG q88, 768×640 (presented 640×533) |
| `assets/og-image.jpg` | Screenshot of splash via `tools/pipeline/capture_og_images.mjs` (or PIL fallback) | Capture tool | JPEG q82, 1200×630, ≤200KB |

`tools/gen_beads.py` generates deterministic placeholder beads (torus with hole, inner shadow, highlight, fingerprint dimples) as interim raster — ensures no vector/CSS beads per art-direction rule. Real Krea beads via Studio `prop-cutout` chain will replace these file-for-file (same 512×512, same filenames) when jobs complete in `shared/media/test-bead-*`. The processor prefers Qwen `layer_2` and retains chroma fallback.

## Voice

| Asset | Source | Creator / workflow | Processing |
|---|---|---|---|
| `assets/audio/*.m4a` (14 lines: welcome, intro-pop, intro-star, intro-jam, prompt-choose, nudge, cheer-pop, cheer-star, cheer-jam, play, faster, slower, again, empty-slot + 6 color words) | `shared/assets/refs/voice-teacher.wav` reference | Studio `character-voice-line` → local Qwen3 TTS voice clone, seed 7 (retry 8,9) | Whisper transcript gate ≥0.72, AAC 96k + faststart; fallback to Web Speech (`shared/js/speech.js`) if clip missing — never a confidently wrong line |

The spoken script in `config.json` (`voice` object) is the source of truth. Runtime uses `shared/js/voice-clips.js` with Web Speech fallback, so a missing clip degrades gracefully.

## Final prompts (for Krea2 production)

**Workshop:** `a warm stop-motion claymation workshop table seen straight from above, light oak wood grain with a broad cream linen runner down the middle, soft sunny window bokeh at the back edge, blurred clay jars and wooden tools along the far edge, calm empty center for a bracelet, warm golden studio light, stop-motion polymer clay + wood + fabric, premium preschool game backdrop, no characters, text, UI, or center clutter — wide 16:9, open center`

**Beads (each color):** `a chunky polymer clay torus bead in <COLOR>, thick handmade ring with fingerprint dimples, soft highlight, stop-motion clay texture, matte satin, isolated, centered. Bright, soft 3D cartoon style with rounded, simplified forms and cheerful proportions. Saturated colors, smooth shading, soft highlights, toy-like glossy finish. Premium preschool learning app asset, no text, no letters, no words.` on flat dark charcoal ground, then Qwen layered `layer_2` extraction.

**Title lockup:** `Handmade clay title plaque reading exactly "PATTERN BRACELET STUDIO" in three lines of rounded bubbly clay letters coral/teal/yellow/blue on an irregular sky-blue clay slab with tiny clay beads along the border, stop-motion polymer clay with fingerprints, flat solid #00ff00 chroma, premium preschool logo, no other text or shadow`

## Budgets

- Background: ≤300KB (1600×1200 WebP)
- Beads: 6 × ~16KB WebP (512×512)
- Title: ≤150KB WebP trimmed
- UI: star ~3KB, banner ~10KB
- Voice: ~14 × ~30KB m4a ≈420KB
- Total page <1.2MB + hub tile separate

## Link preview (og:image)

| Asset | Source | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| `assets/og-image.jpg` | Generated screenshot of this game's own splash screen (1200×630) via `tools/pipeline/capture_og_images.mjs --only pattern-bracelet-band` (fallback PIL) | QLOBE Kids | CC BY 4.0 | No | Regenerate with the tool rather than editing by hand |

## Provenance notes

- Studio `prop-cutout` chain is the canonical bead pipeline: Krea dark-ground render is step 1/9, Qwen `layer_2` is step 2/9, then deterministic trim/pad/encode. Reroll on changed face, missing hole, merged torus, or invented text — don't force a failed candidate through cleanup.
- The 8-slot circular bracelet layout is DOM-absolute, not Pixi — keeps interaction strand-proof (window-level pointer, single drag, blur cancel) while the bead sprites themselves remain authored raster.
- The hub tile is hand-curated: Studio stages to `shared/media/` via `menu-game-tile`, then curated copy to `assets/hub/tiles/` — never direct-assign.
