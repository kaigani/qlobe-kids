# Joke Workshop asset provenance

All shipped art is local; runtime makes no model, upload, generation, or content-service call. The standard shared analytics tag remains present. Paths below are relative to `games/joke-workshop/`.

## Generated artwork

GPT Image 2 sources are retained in `assets/source/gpt-image-2/`; accepted runtime derivatives are in `assets/art/`:

- `stage-background.png` → `art/backgrounds/comedy-stage.webp` (1448×1086, WebP q82).
- `character-sheet-alpha.png` → deterministic 4×3 grid of 362×362 cells → `art/topics/{bear,banana,ghost}.webp` and `art/answers/*.webp` (WebP q88, alpha q96).
- `ui-sheet-alpha.png` → inspected fixed crops in `source/gpt-image-2/finalized/ui/` → `art/ui/*.webp` (q88, alpha q96). These are blank paper furniture; HTML supplies text.
- `title-alpha.png` → `crop=1448:760:0:135`, scale width 1000 → `art/title.webp` (q90, alpha q98).
- The corrupted contact-sheet gummy cell was rejected. Dedicated `gummy-bear-alpha.png` is resized to 362×362 → `art/answers/bear-gummy.webp` (q90, alpha q98).
- The recording microphone is a generated paper-craft chrome cutout, keyed from a uniform magenta plate with the imagegen chroma-key utility, then encoded to `art/ui/recording-microphone.webp`; its transparent source is retained as `assets/source/imagegen/recording-microphone-alpha.png`.
- Supplied `source/audience-neutral.png` is encoded to `art/stage/audience-neutral.webp`; supplied `source/audience-laugh.mp4` and `source/audience-confused.mp4` are copied to `art/stage/` for the post-punchline audience reactions.

`tools/finalize-art.sh` is the deterministic crop and WebP record. Magenta source plates are QA only.

## Local Studio assets

- Hub tile: `assets/source/local-api/hub/source.png`; recipe uses `krea2-turbo-t2i`, seed 42, 768×640, `menu-game-tile` / `toy-table`, accepted by Studio and curated to the 640×533 catalog JPEG at `../../assets/hub/tiles/joke-workshop.jpg`.
- Comedian Star: Krea `krea2-turbo-t2i`, seed 42, 1024², then Qwen `qwen-image-layered` extraction (seed 42), bbox+12/max-640 PNG finalize. Because the accepted Qwen layer retained partial-alpha background noise, `qa-magenta.png` was re-keyed deterministically to `clean-alpha.png` before the 360×360 runtime WebP at `art/ui/comedian-star.webp`; all original Studio outputs and the recipe remain under `assets/source/local-api/comedian-star/`.

## Audio and shared systems

The 26 active fixed voice entries in `assets/audio/manifest.json` ship as local recorded M4A clips. The recording prompt is intentionally Web Speech because its copy is new. `tools/gen-voice.py` cloned the project concept reference at `../../../01-game-concepts/joke-workshop/voice-comedian.wav` (SHA-256 `1b73795b25c95179e5c4040cfcfdbb5ed9d263527a567e7f247c1f4d823db13b`) through the configured private-network Qwen `qwen3-tts-voiceclone` workflow. Seed 19 produced the main batch; `crowd-laugh` uses an accepted seed-31 retry. The script trims and loudness-normalizes each take, then writes mono 24 kHz AAC M4A files.

`assets/audio/qa.json` records the local Whisper `base` transcript check for the active authored clips; it also retains historical checks for retired prototype prompts. The active manifest entries persist the authorized reference SHA-256, actual per-line seed, authored-text SHA-256, and final M4A SHA-256, and the generator compares all four before reusing a clip. The `wordplay` comparison canonicalizes Whisper's equivalent two-word spelling, “word play.” The tool refuses a changed reference hash or a non-local/non-private service URL. `voice-clips.js` uses device Web Speech for the recording prompt or as runtime resilience if a recorded file cannot play. No custom child text is sent to Qwen, Whisper, or any other service.

Rimshot, applause, interaction SFX, and confetti use shared QLOBE systems (`shared/js/sfx.js`, `shared/js/celebrate.js`) and synthesized WebAudio; no sourced sound-effect files ship.

Shared font: `shared/fonts/fredoka-latin-600-normal.woff2`. Preview: `assets/og-image.jpg`, a splash screenshot captured by `tools/pipeline/capture_og_images.mjs`.
