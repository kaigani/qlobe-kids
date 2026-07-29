# Asset Log — Sink or Float Lab

All new art and voice for this game were generated on the local GenAI API
(ComfyUI wrapper on the LAN; host configured via `QLOBE_QWEN_URL`, never
committed) and finalized deterministically by the scripts in `tools/`.
Original generations are retained under `assets/source/`. New assets:
CC BY 4.0, created for QLOBE Kids.

## Pipeline

```
krea2-turbo-t2i (style anchors, seeds 42/1337/9001)
  → qwen-image-edit (17 objects from the approved duck anchor, seed 42)
  → qwen-image-layered (async job, layer_2 = true-alpha cutout, seed 42)
  → tools/finalize-art.py (alpha-trim, pad 4%, resize, webp/png, magenta QA)
qwen3-tts-voiceclone (platform teacher voice ref via QLOBE_VOICE_REF, seeds 7/8/9)
  → whisper-stt QA (model small, language en; transcript must match script)
  → ffmpeg AAC 64k m4a +faststart → manifest.json  (tools/gen-voice.py)
```

## Generated for this game (CC BY 4.0)

| Asset | Source | Recipe |
|---|---|---|
| `assets/bg.webp` 1600×1200 | `assets/source/anchors/bg.png` | krea2-turbo-t2i seed 1337 — Field Journal garden porch table |
| `assets/splash.webp` 1600×1200 | `assets/source/anchors/splash.png` | krea2-turbo-t2i seed 1337 — jar/journal/duck tableau |
| `assets/title.png` 620×560 | `01-game-concepts/_completed/sink-or-float-lab/title-asset-alpha.png` | approved concept title artwork; transparent canvas alpha-trimmed with 20px side padding for responsive placement |
| `assets/og-image.jpg` 1200×630 | center-crop of splash source | deterministic (`tools/finalize-art.py`) |
| `assets/objects/*.webp` ×18, 400px | `assets/source/raw-edit/`, `assets/source/cutouts/` | duck: krea2 seed 1337; others: qwen-image-edit from duck anchor, seed 42; all extracted with qwen-image-layered |
| `assets/jar.png` | `assets/source/anchors/jar.png` | krea2-turbo-t2i (seed noted in source dir) + layered extraction |
| `assets/journal.png` | `assets/source/anchors/journal.png` | krea2-turbo-t2i seed 42 + layered extraction |
| `assets/ui/badge-*.png`, `assets/ui/icon-*.png` 300px | `assets/source/anchors/` | krea2-turbo-t2i seed 42 + layered extraction |
| `assets/audio/*.m4a` + `manifest.json` + `lines.json` | `assets/source/voice/` | qwen3-tts-voiceclone seed ladder 7/8/9, whisper-QA'd; failing lines omitted (Web Speech fallback) |
| `assets/source/hub/tile-candidate.jpg` 640×533 | `assets/source/anchors/hub-tile.png` | krea2-turbo-t2i seed 42, Toy Table hub grammar. Staged only — `assets/hub/tiles/` is hand-curated by the maintainer |

Alpha QA composites (magenta) for every cutout: `assets/source/qa/`.

## Reused shared assets

| Asset | Source | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandão & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-back.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused unmodified |
| PixiJS (`shared/vendor/pixi.min.js`) | vendored platform library | PixiJS team | MIT | No | Reused unmodified |
| Sound effects | N/A — synthesized at runtime via WebAudio (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech fallback voice | N/A — device built-in voices via `shared/js/speech.js` | N/A | N/A | N/A | Fallback when a recorded clip is absent |
