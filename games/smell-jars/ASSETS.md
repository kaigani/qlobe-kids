# Smell Jars asset log

All model calls are authoring-time only. The shipped game reads committed static files and makes no runtime generation request.

## Production art

| Runtime asset | Source / workflow | Model or creator | Rights / attribution | Production treatment |
|---|---|---|---|---|
| `assets/art/environment-wide.webp` | `assets/source/gpt-image-2/environment-wide-source.png` | GPT Image 2 through Codex built-in image generation | Project-generated; no external attribution | 1920×1080 crop-safe room plate, WebP |
| `assets/art/environment-portrait.webp` | precise-object edit of accepted wide room | GPT Image 2 through Codex built-in image generation | Project-generated; no external attribution | independently recomposed 1080×1440 portrait plate |
| `assets/art/title.webp` | GPT Image 2 title source, local Qwen Image Edit cleanup, then Qwen Image Layered separation | GPT Image 2 + Qwen Image Edit + Qwen Image Layered | Project-generated; no external attribution | exact lettering preserved; color spill removed; alpha finalized and hostile-magenta checked |
| jar, tray, button, check, lids, sun, spark | `assets/source/gpt-image-2/props-sheet-source.png` | GPT Image 2 + Qwen Image Layered for sparkle isolation | Project-generated; no external attribution | cut with required `tools/cut-asset-sheet.py`, sparkle layer isolated, trimmed, and encoded as WebP |
| six ingredient tokens | `assets/source/gpt-image-2/tokens-sheet-source.png` | GPT Image 2 | Project-generated; no external attribution | cut from strict 3×2 sheet and alpha-QA'd |
| six scent plumes | `assets/source/gpt-image-2/plumes-sheet-source.png` | GPT Image 2 | Project-generated; no external attribution | cut from strict 3×2 sheet and alpha-QA'd |
| two mode medallions | `assets/source/gpt-image-2/modes-sheet-source.png` | GPT Image 2 | Project-generated; no external attribution | cut from two-item sheet and alpha-QA'd |
| `assets/hub/tiles/smell-jars.jpg` | accepted local candidate `krea2-seed-1337-candidate.jpg` | Krea 2 Turbo through approved LAN API | Project-generated; no external attribution | hand-reviewed 640×533 hub crop; hash preserved |

The rejected Krea seed 42 remains beside the accepted seed with the rejection reason in its recipe. The production tile is never overwritten automatically by the generation script.

Full GPT prompts are recorded in `assets/source/gpt-image-2/prompts.json`. Every local workflow has a recipe with model, prompt, seed, source hash, output hash, and QA decision.

## Cutting and deterministic finalization

Contact sheets were processed with the repository's required cutter:

- props: fourteen cutter regions, mapped to eleven gameplay props plus the reviewed center sparkle;
- tokens: six regions;
- plumes: six regions;
- modes: two regions.

Each cut folder includes the transparent PNG parts, mask, box preview, and manifest. `tools/build-assets.py` performs only deterministic alpha normalization, transparent trim, resize, room-plate fit, and WebP encoding. It writes:

- `assets/source/processing.json` with source and runtime hashes;
- `assets/source/final-alpha-qc-magenta.jpg` for fringe inspection.

The first title-layer extraction preserved the words but retained thin red/yellow generator spill at its silhouette, so its recipe is marked rejected. The accepted title uses Qwen Image Edit to retain the exact plaque while cleaning those artifacts, then Qwen Image Layered for the production alpha. The selected sparkle begins with the `spark-b` cutter result, then uses Qwen Image Layered plus a deterministic largest-component cleanup. Both accepted finals pass hostile-magenta review.

## Voice

| Asset | Source / workflow | Rights / attribution | QA |
|---|---|---|---|
| `assets/audio/*.m4a` | Qwen3 TTS voice clone through approved LAN API | cloned only from `shared/assets/refs/voice-teacher.wav`, the project's approved synthetic teacher reference | all 17 clips accepted by local Whisper |
| `assets/audio/lines.json` | canonical text from `config.json` | project text | exact fallback/script record |
| `assets/audio/manifest.json` | generation pipeline | project metadata | duration, SHA-256, and text hash per clip |
| `assets/audio/qa.json` | local Whisper transcription | project metadata | intended text, transcript, coverage, score, seed, model, reference hash |

`tools/generate-voice.py` synthesizes each line, trims edge silence, normalizes to -18 LUFS / -2 dB peak, encodes mono 24 kHz AAC, transcribes the final encoded file, and rejects a line that misses the similarity and word-coverage gates.

The shared voice runtime falls back to Web Speech only if a committed clip cannot load.

## Shared runtime assets

| Asset | Source | License / attribution | Use |
|---|---|---|---|
| Fredoka SemiBold | `shared/fonts/fredoka-latin-600-normal.woff2`, Fontsource / Google Fonts; Milena Brandão and Hafontia | SIL OFL 1.1 | display type |
| QLOBE home/back/sound controls | `shared/assets/ui/` | project-created, CC BY 4.0 | shared HUD |
| `whimsical-toy-workshop.mp3` | `shared/assets/music/` | QLOBE shared recorded library | quiet BGM through `shared/js/bgm.js` |
| tick, whoosh, sparkle, silly, tada | `shared/js/sfx.js` | project-authored synthesized effects | touch and feedback cues |

## Link preview

`assets/og-image.jpg` is a 1200×630 browser capture of the final splash composition produced with the repository capture workflow after visual QA. It contains only this game's committed art.

## Regeneration

Core art was generated in the Codex image-generation session recorded in `prompts.json`. Local supplemental assets can be regenerated with explicit API coordinates:

```text
python games/smell-jars/tools/generate-hub-tile.py --api-url <local-api> --seed 1337
python games/smell-jars/tools/generate-title-clean.py --api-url <local-api> --seed 42
python games/smell-jars/tools/generate-spark-layer.py --api-url <local-api> --seed 1337
python games/smell-jars/tools/generate-voice.py --api-url <local-api> --seed 7
python games/smell-jars/tools/build-assets.py
```

Do not commit LAN URLs or machine-local API state. Regeneration outputs remain review candidates until their recipe QA state is explicitly accepted.
