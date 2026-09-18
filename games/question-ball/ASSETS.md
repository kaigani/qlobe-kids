# Question Ball asset log

Question Ball ships as an offline-first cozy felt-puppet game. Generated-media workflows are authoring tools only; the game runtime makes no generation, transcription, voice-clone, asset, or child-audio network requests. The page retains the platform’s inherited analytics loader, governed by the platform policy and excluded from that game-asset claim. Exact image prompts are retained in `PROMPTS.md`, deterministic transforms in `tools/build-assets.py`, hashes and dimensions in `assets/source/processing.json`, and voice transcripts in `assets/source/voice/qa-transcripts.json`.

## Production art

| Asset family | Source and model | Production treatment | Shipped output |
|---|---|---|---|
| Playroom | GPT Image 2 through Codex built-in image generation | Cropped to 4:3, resized to 1600×1200, WebP encoded | `assets/art/playroom.webp` |
| Title lockup | GPT Image 2 source master; local Qwen Image Layered seed 42 `layer_2` extraction | QLOBE cutout finalizer, hostile-magenta edge review, trim/resize/WebP | `assets/art/title.webp` |
| Question Ball, open ball, Sharing Star, microphone, toss gesture, four topic icons, question bubble | GPT Image 2 coordinated 5×2 contact sheet | Required `tools/cut-asset-sheet.py` pass, tighter eight-pixel crop padding after hostile-background review, deterministic alpha normalization and WebP encoding | `assets/art/ball-*.webp`, `star.webp`, `microphone.webp`, `gesture-toss.webp`, `topic-*.webp`, `question-bubble.webp` |
| Maya and Leo felt poses | GPT Image 2 image edit using the platform-owned canonical `shared/characters/maya/portrait.png` and `shared/characters/leo/portrait.png` references | Required cutter pass, ten-pixel crop padding, identity/art review, WebP encoding | `assets/art/maya-*.webp`, `assets/art/leo-*.webp` |
| Blank UI furniture | GPT Image 2 coordinated seven-object contact sheet | Required cutter pass, eight-pixel crop padding, raster-first authored UI compositing | `assets/art/plaque-navy.webp`, `button-green.webp`, `prompt-panel.webp`, `card-*.webp` |
| Hub tile | Local Krea 2 Turbo text-to-image, seed 42, 768×640 | Curated and resized to 640×533 JPEG | `../../assets/hub/tiles/question-ball.jpg` |

The GPT source masters live in `assets/source/gpt-image-2/`. The local-model masters and structured recipes live in `assets/source/local-api/`. Cutter outputs, bounding boxes, debug masks, the finalized title, and the final hostile-magenta contact sheet remain under `assets/source/` so the entire promotion decision is auditable.

Required cutter invocations:

```text
python tools/cut-asset-sheet.py games/question-ball/assets/source/gpt-image-2/props-sheet.png games/question-ball/assets/source/cuts/props --names ball-idle ball-open star microphone gesture-toss topic-routines topic-animals topic-imagine topic-feelings question-bubble --expected-count 10 --padding 8 --format png --debug-mask games/question-ball/assets/source/cuts/props-mask.png
python tools/cut-asset-sheet.py games/question-ball/assets/source/gpt-image-2/characters-sheet.png games/question-ball/assets/source/cuts/characters --names maya-listen maya-celebrate leo-catch leo-celebrate --expected-count 4 --padding 10 --format png --debug-mask games/question-ball/assets/source/cuts/characters-mask.png
python tools/cut-asset-sheet.py games/question-ball/assets/source/gpt-image-2/ui-sheet.png games/question-ball/assets/source/cuts/ui --names plaque-navy button-green prompt-panel card-gold card-green card-lavender card-coral --expected-count 7 --padding 8 --format png --debug-mask games/question-ball/assets/source/cuts/ui-mask.png
python games/question-ball/tools/build-assets.py
```

The first cutter pass used wider padding and exposed tiny neighboring-object slivers on a magenta inspection background. Those crops were rejected and rebuilt with the recorded tighter padding. `assets/source/qa/final-alpha-contact-magenta.jpg` is the final 23-object inspection sheet.

An independent adversarial ART DIRECTOR reviewed the source contact sheet, hub tile, and settled landscape, portrait, and narrow-landscape runtime captures on 2026-09-17 and accepted the complete visual system with no release blockers. The only evidence issue—capturing the narrow layout mid-animation—was corrected by waiting for the authored 420 ms panel arrival before the final screenshot.

## Teacher voice

All 41 fixed narration and prompt lines in `assets/audio/lines.json` were synthesized with the approved local `qwen3-tts-voiceclone` workflow using the rights-cleared platform reference `shared/assets/refs/voice-teacher.wav`. Production used the documented seed ladder 7, 8, 9 and accepted only clips scoring at least 0.80 against the exact script with local `whisper-stt` (`base`, English). Accepted FLAC masters remain in `assets/source/voice/`; runtime copies are AAC M4A at 96 kbps with `faststart`.

`assets/audio/manifest.json` is the plain key map consumed by `shared/js/voice-clips.js`. Each entry includes `file`, `dur`, text/audio/reference hashes, and the accepted seed. `assets/source/voice/qa-transcripts.json` records expected text, transcript, similarity, workflow, seed, and pass state for every line. Device Web Speech is a graceful fallback only; it is not the authored primary voice.

Child speech is never sent to TTS, Whisper, or any remote service. Optional play recording uses browser `MediaRecorder`, stays in memory, and is destroyed when the question changes or the page closes.

## Shared runtime assets

| Asset | Source | License / attribution | Use |
|---|---|---|---|
| `shared/fonts/fredoka-latin-600-normal.woff2` | Fontsource / Google Fonts, Fredoka by Milena Brandão and Hafontia | SIL Open Font License 1.1; no UI attribution required | Child-facing functional copy |
| `shared/assets/music/upbeat-playground-pop.mp3` | QLOBE Kids shared library | Platform-owned; no in-game attribution required | Low-volume background music |
| `shared/assets/refs/voice-teacher.wav` | QLOBE Kids rights-cleared reference | Internal production reference; not redistributed by this game | Author-time voice cloning only |
| Maya and Leo canonical portraits | QLOBE Kids shared character library | Platform-owned | Identity references for generated felt-puppet variants |

Sound effects are synthesized locally at runtime by `shared/js/sfx.js`; there are no third-party sound downloads.

## Rights and release notes

- Game code: MIT, matching the repository.
- Game-specific generated art and audio: CC BY 4.0, matching `game.json`.
- No third-party stock art or downloaded voice material was introduced.
- LAN endpoints, credentials, machine-local paths, and service responses are intentionally absent from committed provenance.
- The game remains `beta` until the required real-iPad child playtest, although desktop/tablet emulation, functional smoke tests, and independent art review are required before deployment.

## Link preview

`assets/og-image.jpg` is a 1200×630 capture of the game’s own production splash screen. Regenerate it with the repository capture workflow after material splash changes; do not hand-edit it.
