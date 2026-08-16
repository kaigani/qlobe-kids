# Bead Path Builder assets

All game-specific visual and voice assets were authored for this project. They
are licensed CC BY 4.0 with the rest of the QLOBE Kids asset set. Runtime code
is MIT. Exact GPT Image 2 prompts and references are preserved in
`assets/source/gpt-image-2/prompts.json`; LAN workflow requests, job IDs, seeds,
outputs, and transcript results are preserved under `assets/source/qa/`.

## Runtime Toy artwork

| Runtime asset | Source | Creator / model | Processing and use | License |
|---|---|---|---|---|
| `assets/atelier.webp` (1448×1086) | `assets/source/gpt-image-2/atelier-source.png`, guided by the concept overview | OpenAI GPT Image 2 through Codex built-in image generation | Downscaled and encoded as opaque WebP; full-bleed atelier plate | CC BY 4.0 |
| `assets/workboard.webp` (1448×1086) | `assets/source/gpt-image-2/workboard-source.png`, guided by the approved atelier and concept board | OpenAI GPT Image 2 through Codex built-in image generation | Downscaled and encoded as opaque WebP; cord, linen, frame, and tray plate | CC BY 4.0 |
| `assets/title.webp` (1000×412) | `assets/source/gpt-image-2/title-chroma.png` | OpenAI GPT Image 2 through Codex built-in image generation | Uniform magenta key removed with the imagegen `remove_chroma_key.py` helper, edge checked on black/magenta, then encoded as alpha WebP; processed PNG retained in `assets/source/processed-alpha/title.png` | CC BY 4.0 |
| `assets/ui/mode-card.webp` (480×625) | `assets/source/gpt-image-2/mode-card-chroma.png` | OpenAI GPT Image 2 through Codex built-in image generation | Uniform magenta key removed and encoded as alpha WebP; reused beneath live HTML previews and labels | CC BY 4.0 |
| `assets/ui/wear-button.webp` (640×210) | `assets/source/gpt-image-2/wear-button-chroma.png` | OpenAI GPT Image 2 through Codex built-in image generation | Uniform magenta key removed, edge checked, and encoded as alpha WebP; processed PNG retained in `assets/source/processed-alpha/wear-button.png` | CC BY 4.0 |
| `assets/beads/*.webp` (six at 384×384) | `assets/source/gpt-image-2/beads-contact-sheet.png` | OpenAI GPT Image 2 through Codex built-in image generation | Contact sheet split into `assets/source/bead-crops/`, uniform charcoal matte removed deterministically, normalized to equal transparent canvases, then encoded as alpha WebP; accepted PNGs retained under `assets/source/processed-alpha/beads/` | CC BY 4.0 |

The six bead sprites are `round-red`, `barrel-yellow`, `diamond-blue`,
`flower-teal`, `star-purple`, and `heart-coral`. A Qwen Image Layered pilot was
attempted for semantic separation, timed out, and was rejected; it did not
replace the cleaner deterministic matte.

CSS and DOM supply responsive placement, hit areas, focus rings, target guides,
glow, and motion only. The board, cord, tray, cards, title, CTA, beads, and
reward subject are authored rasters rather than CSS/vector substitutes.

## MiniMax H3 video

| Runtime asset | Source and model | Processing / QA | License |
|---|---|---|---|
| `assets/video/threading-tip-poster.webp` (832×480) | `assets/source/gpt-image-2/threading-tip-key.png`, OpenAI GPT Image 2 | Opaque WebP poster and first-frame fallback | CC BY 4.0 |
| `assets/video/threading-tip.mp4` (832×480) | Poster/key above plus `drag-cue` voice reference; MiniMax H3 reference-to-video | Static top-down cord-through-hole demonstration. H.264, yuv420p, mono AAC, `+faststart`; final clean Qwen voice remuxed after H3 altered the conditioned speech. Final audio Whisper ratio: 1.0. Raw H3 output retained as `assets/source/video-raw/threading-tip-raw.mp4`. | CC BY 4.0 |
| `assets/video/fox-necklace-poster.webp` (832×480) | `assets/source/gpt-image-2/fox-necklace-key.png`, OpenAI GPT Image 2 | Opaque WebP poster and first-frame fallback | CC BY 4.0 |
| `assets/video/fox-necklace.mp4` (832×480) | Poster/key above plus `wear-cheer` voice reference; MiniMax H3 reference-to-video | One-shot wooden fox touch, nod, and sway reward. H.264, yuv420p, mono AAC, `+faststart`; final clean Qwen voice remuxed after H3 altered the conditioned speech. Final audio Whisper ratio: 1.0. Raw H3 output retained as `assets/source/video-raw/fox-necklace-raw.mp4`. | CC BY 4.0 |

Exact video prompts, dimensions, seeds, reference paths, LAN job IDs, and raw
output sizes are in `assets/source/qa/*.video.recipe.json`. The clean audio
masters supplied to H3 are under `assets/source/video-audio/`; extracted final
audio and final-video Whisper records are under `assets/source/qa/`.

## Recorded narration

`assets/audio/` contains 24 browser-ready mono AAC-LC `.m4a` clips at 44.1 kHz
and 96 kbps, with integrated loudness normalized to -16 LUFS and true peak
limited to -1.5 dBTP. `manifest.json` supplies filenames/durations and
`lines.json` preserves the exact fallback script.

| Source | Creator / workflow | Processing / QA | License |
|---|---|---|---|
| `assets/source/voice-raw/*.flac` | Non-identifying warm preschool-teacher voice designed from text with local `qwen3-tts-voicedesign`; no reference voice or identity clone was uploaded | Every line was transcribed with local `whisper-stt`; all 24 met the ≥0.80 acceptance threshold. Exact text, seed, job IDs, transcript, and ratio live in `assets/source/qa/<key>.recipe.json`. | CC BY 4.0 |
| `assets/audio/*.m4a` | Accepted FLAC masters above | Packaged by `tools/package-audio.py`; ffprobe validates a positive-duration mono AAC stream before atomic install | CC BY 4.0 |

Recorded clips are primary. `shared/js/voice-clips.js` falls back to the exact
line through device Web Speech if a clip cannot load.

## Shared runtime assets

| Asset | Source / creator | License | Use |
|---|---|---|---|
| Fredoka SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | Milena Brandão & Hafontia via Fontsource | SIL OFL 1.1 | Runtime labels |
| Shared raster HUD/action buttons (`shared/assets/ui/`) | QLOBE Kids asset library | CC BY 4.0 | Home, back, sound, play, and shuffle controls |
| Runtime SFX (`shared/js/sfx.js`) | QLOBE Kids WebAudio synthesis | MIT code; no file asset | Gentle tick, wood pop, mismatch nudge, and celebration sounds |
| Catalog tile (`assets/hub/tiles/bead-path-builder.jpg`) | Existing user-curated QLOBE Kids hub artwork | QLOBE Kids catalog license | Preserved unchanged; game production did not overwrite it |

## Link preview

`assets/og-image.jpg` is a generated 1200×630 screenshot of the finished pattern
shelf. Regenerate it with
`node tools/pipeline/capture_og_images.mjs --only bead-path-builder --force`;
do not retouch it by hand.
