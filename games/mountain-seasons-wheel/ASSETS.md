# Asset log — Mountain Seasons Wheel

All child-facing game artwork is raster. No remote media or model is called at runtime.

## Generated art

| Runtime assets | Source / tool | Creator | License | Production work |
| --- | --- | --- | --- | --- |
| `assets/backgrounds/{splash,wheel}.webp` | OpenAI image generation (`gpt-image-2`) | OpenAI model, directed by QLOBE Kids / Codex | CC BY 4.0 for this project | Generated as one 4:3 four-season papercraft diorama; resized/encoded to WebP; the accepted plate is intentionally reused behind the wheel |
| `assets/backgrounds/{spring,summer,autumn,winter}.webp` | OpenAI image generation (`gpt-image-2`) | OpenAI model, directed by QLOBE Kids / Codex | CC BY 4.0 for this project | Four coordinated 4:3 plates of one mountain/camera; compressed individually to the production budget |
| `assets/reward/four-seasons.webp` | OpenAI image generation (`gpt-image-2`) | OpenAI model, directed by QLOBE Kids / Codex | CC BY 4.0 for this project | Generated as a four-panel folded-paper mountain reward and encoded to WebP |
| `assets/title.webp` | OpenAI image generation (`gpt-image-2`) | OpenAI model, directed by QLOBE Kids / Codex | CC BY 4.0 for this project | Exact-spelling cut-paper lockup; alpha edge inspected on cyan; resized to 900px wide |
| `assets/ui/wheel.webp` | OpenAI image generation (`gpt-image-2`) | OpenAI model, directed by QLOBE Kids / Codex | CC BY 4.0 for this project | Generated on a flat key color with exactly four equal wedges; keyed, edge-checked, and encoded with alpha |
| `assets/character/juni-*.webp` | OpenAI image generation (`gpt-image-2`) contact sheet | OpenAI model, directed by QLOBE Kids / Codex | CC BY 4.0 for this project | One 2×3 identity sheet supplied base, spring, summer, autumn, and winter states; cells were isolated, keyed, matte-checked, and encoded |
| `assets/clothes/*.webp` | OpenAI image generation (`gpt-image-2`) contact sheet | OpenAI model, directed by QLOBE Kids / Codex | CC BY 4.0 for this project | One 2×2 coordinated garment sheet; isolated and alpha-checked |
| `assets/ui/{button,prompt-banner,mode-wheel,mode-dress,garment-card,leaf-seal,paw-seal,fact-card,pointer}.webp` | OpenAI image generation (`gpt-image-2`) contact sheet | OpenAI model, directed by QLOBE Kids / Codex | CC BY 4.0 for this project | One coordinated UI sheet; individual cells cropped, keyed, visually checked, and tight-cropped after in-browser QA |
| `assets/ui/stamps/*.webp`, `assets/ui/particles/{rain,sun,leaf,snow}.webp` | OpenAI image generation (`gpt-image-2`) contact sheet | OpenAI model, directed by QLOBE Kids / Codex | CC BY 4.0 for this project | Generated as a coordinated stamp/particle sheet; isolated and inspected on contrasting mattes |
| `assets/ui/particles/petal-qwen.webp` | Local `qwen-image-layered` workflow | Qwen model, directed by QLOBE Kids / Codex | CC BY 4.0 for this project | Accepted subject layer from a layered extraction; cropped, resized, alpha-checked on cyan and magenta, and encoded to WebP |
| `assets/discoveries/*.webp` | Crops of the accepted seasonal plates above | QLOBE Kids / Codex | Same as parent generated plate | Eight close crops selected from the authored scene subjects and encoded as square WebPs |

The Dress for Weather reward is a live composition of the accepted splash, Juni, garment, stamp, and button rasters. Celebration uses the accepted raster particle set. This avoids inventing CSS/vector artwork or adding a redundant reward plate.

Full prompts, accepted/rejected model roles, and source filenames are recorded in `assets/source/PROMPTS.md`. Large generation sources and alpha-QA mattes remain in `assets/source/`.

## Shared platform assets

| Asset | Source | License | Use |
| --- | --- | --- | --- |
| `shared/fonts/fredoka-latin-600-normal.woff2` | Fredoka by Milena Brandão and Hafontia, distributed through Fontsource | SIL OFL 1.1 | UI type |
| `shared/assets/ui/btn-home.png`, `btn-back.png`, `btn-sound.png` | QLOBE Kids shared library | CC BY 4.0 | Home only on splash; Back and replay below splash |
| Shared synthesized SFX | `shared/js/sfx.js` | Project code (MIT) | Wheel ticks, paper feedback, sparkle, and reward flourish |

## Voice

`data/lines.json` is the source of truth for 42 child-facing lines. `shared/js/voice-clips.js` uses `assets/audio/manifest.json` when an accepted AAC clip exists and truthfully falls back per line to device speech otherwise. The production recipe is text-only Qwen3 voice design with one fixed warm-preschool-teacher instruction, seed retries 7/8/9, AAC 96kbps loudness normalization, and blind forced-English Whisper-medium transcription with no expected-text prompt. Acceptance requires exact normalized spoken copy after one token-boundary-only orthographic rule: Whisper's `Junie` spelling canonicalizes to the authored name `Juni`; variants such as `Johnny`, `Julie`, and all other lexical differences still fail. The recipe sends only public game copy and a non-sensitive delivery instruction—no identity sample. `tools/generate-voice.py` is resumable, stages lossless candidates outside the repository, and keeps QA results in `assets/audio/qa.json`. Optional clone mode remains available for a future authorized run, but requires both an explicit engine selection and `--allow-voice-upload` because that workflow sends the selected reference WAV to the configured authoring service.

The accepted production pack contains 42/42 clips: 34 from seed 7, seven retries from seed 8, and the `Lupine` fact from seed 9, totaling 164.86 seconds and 2,103,978 bytes. `assets/audio/qa.json` preserves each raw transcript and records the canonicalized/source normalization, applied-alias list and rule version, no-prompt verifier workflow/model/language, seed, duration, loudness, encoded-file checksum, text and instruction checksums, and UTC check time. It stores no endpoint, job id, or local path.

No private LAN address or local teacher-reference path is stored in the repository.

## Link preview

`assets/og-image.jpg` is generated from this game's own splash screen with `tools/pipeline/capture_og_images.mjs`; it is not separately illustrated. The catalog tile under `assets/hub/tiles/` remains user-curated and is not modified by the game build.
