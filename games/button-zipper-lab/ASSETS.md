# Button-Zipper Lab Assets

Button-Zipper Lab uses a single generated **Paper Garden / cozy felt quiet-book** illustration system. No runtime illustration is emoji, SVG, a downloaded stock asset, or a remote network dependency; small cream interface surfaces are deterministic CSS so they stay crisp and responsive.

The exact Krea and GPT prompt set is stored in [`assets/source/generation-prompts.json`](assets/source/generation-prompts.json). Qwen edits and Layered extractions keep their full prompt, seed, reference, and QA chain in adjacent `*.recipe.json` files. Teacher lines live verbatim in `assets/audio/lines.json` and the clip recipes.

## Visual generation

| Asset family | Runtime files | Source / provenance | Workflow | Seed | License |
|---|---|---|---|---:|---|
| Four visual concepts | Not shipped at runtime | `assets/source/concepts/01-*.png` through `04-*.png` plus recipes | QLOBE Studio `krea2-turbo-t2i` (Krea 2) | 42 | CC BY 4.0 |
| Mode cards | `assets/cards/*.webp` | `mode-cards-gpt-image-2.png`, Qwen `layer_2`, alpha/magenta QA, recipe | Built-in imagegen (GPT Image 2), then Qwen Image Layered | 42 | CC BY 4.0 |
| Bear activity boards | `assets/boards/*.webp` | `game-boards-gpt-image-2.png`; `assets/source/boards/*-qwen.png` and recipes | Built-in imagegen (GPT Image 2), then Qwen Image Edit | 42 / 47 retry | CC BY 4.0 |
| Fasteners, helper, patches | `assets/ui/*.webp`, `assets/patches/*.webp` | `ui-sprites-gpt-image-2.png`, seven clean standalone GPT sources under `assets/source/ui-standalone/`, and nine production per-object files in `assets/source/ui-layered/*` including `layer_2` and magenta QA | Built-in imagegen (GPT Image 2 source mode, plus reference edits for complex retries), then per-object Qwen Image Layered | 42 / 47 selected | CC BY 4.0 |
| Exact title plaque | `assets/title.webp` | `title-gpt-image-2.png`, Qwen `layer_2`, alpha/magenta QA, recipe | Built-in imagegen (GPT Image 2), then Qwen Image Layered | 42 | CC BY 4.0 |
| Splash landscape | `assets/splash-bg.webp` | `splash-bg-gpt-image-2.png` | Built-in imagegen (GPT Image 2) | 42 | CC BY 4.0 |
| Reward scene | `assets/reward-bg.webp` | `reward-bg-gpt-image-2.png` | Built-in imagegen (GPT Image 2) | 42 | CC BY 4.0 |
| Catalog tile | `../../assets/hub/tiles/button-zipper-lab.jpg` | Deterministic 640×533 crop of the approved zipper board | `tools/build-assets.py` | n/a | CC BY 4.0 |

The first whole-sheet Layered attempt for the UI passed numerical alpha QA but omitted ten objects; visual magenta review rejected it. A second built-in transparency edit returned a baked checkerboard and was also rejected. The generated sheet's arrow, progress-frame, and cream-plaque cells were rejected because grid spill cropped or combined objects; those unused UI concepts are not shipped. The original zipper and Snap cells also resisted multiple Layered attempts, so two cleaner standalone GPT Image 2 sources on uniform chroma green were generated. The complete velcro crop and four reward patches also confused semantic extraction, so tightly constrained GPT Image 2 reference edits placed those exact objects on the same green ground. All seven standalone sources then passed back through Qwen `layer_2` and the magenta-QA gate. Production uses nine visually reviewed Layered extracts, while small cream plaque/button surfaces use responsive CSS. No rejected result is referenced at runtime.

`tools/build-assets.py` performs deterministic contact-sheet crops, trims approved alpha assets, normalizes card canvases, and encodes runtime WebP files. `tools/stage-ui-extracts.mjs` stages and collects the per-cell Layered jobs.

## Recorded narration

All clips in `assets/audio/*.m4a` use QLOBE Studio's `character-voice-line` template with the configured teacher reference:

- Workflow: `qwen3-tts-voiceclone`
- Seeds: `7` for 21 clips; the transcript-QA retry for `zipper-help` uses `9`
- Automatic QA: Whisper transcription saved beside each staged recipe; only matching clips enter the manifest
- Runtime fallback: `shared/js/voice-clips.js` reads the same text from `assets/audio/lines.json`

Generated voice clips and their recipe/transcript provenance are licensed CC BY 4.0 as part of this project.

## Link preview

| Asset | Source | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| `assets/og-image.jpg` | Automated capture of this game's generated splash art at 1200×630 | QLOBE Kids | CC BY 4.0 | No | Regenerate with `tools/pipeline/capture_og_images.mjs`; do not hand-edit |

## Attribution

Visual development: Krea 2, GPT Image 2, Qwen Image Edit, and Qwen Image Layered, directed and reviewed for QLOBE Kids. Narration: Qwen3 TTS using the project-authorized teacher reference. Integration and asset finalization: QLOBE Kids / Codex.
