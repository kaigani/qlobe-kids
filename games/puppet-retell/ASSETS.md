# Puppet Retell asset log

## Production lifecycle

Assets follow the QLOBE Studio lifecycle:

`brief → generate → source candidates → extract → visual/alpha QA → deterministic finalize → runtime asset → validate`

The model host is never stored in the repository. Local generators read it
from `QLOBE_QWEN_URL`.

## Runtime art

| Asset | Production source | Finalization |
|---|---|---|
| `assets/bg/splash.jpg` | GPT Image 2, guided by the concept overview mockup | 4:3 cover crop, 1400×1050 progressive JPEG |
| `assets/bg/cozy-room.jpg` | GPT Image 2 in the approved soft painted puppet-workshop style | 4:3 cover crop, 1400×1050 progressive JPEG |
| `assets/bg/sunny-meadow.jpg` | GPT Image 2 in the approved soft painted puppet-workshop style | 4:3 cover crop, 1400×1050 progressive JPEG |
| `assets/bg/puppet-theater.jpg` | GPT Image 2 in the approved soft painted puppet-workshop style | 4:3 cover crop, 1400×1050 progressive JPEG |
| `assets/props/crown.png` | Krea 2 seed 42, Qwen Image Layered subject extraction | alpha-QC on magenta, tight crop, 384px transparent PNG |
| `assets/props/explorer-hat.png` | Krea 2 seed 42, Qwen Image Layered subject extraction | alpha-QC on magenta, tight crop, 384px transparent PNG |
| `assets/props/magic-wand.png` | Krea 2 seed 42, Qwen Image Layered subject extraction | alpha-QC on magenta, tight crop, 384px transparent PNG |
| `assets/props/story-basket.png` | Krea 2 seed 42, Qwen Image Layered subject extraction | alpha-QC on magenta, tight crop, 384px transparent PNG |

GPT Image 2 originals are retained under
`assets/source/gpt-image-2/`. Krea originals, layered outputs, and magenta QC
composites are retained under `assets/source/local-api/`.

## Shared assets

- Eight canonical rigged characters under `shared/characters/`.
- Portable gesture clips under `shared/characters/acting-clips.json`.
- Fredoka SemiBold under `shared/fonts/` (SIL OFL 1.1).
- QLOBE HUD buttons under `shared/assets/ui/`.
- Runtime synthesized effects from `shared/js/sfx.js`.

## Voice

Narrator clips in `assets/audio/` are generated from the existing QLOBE guide
reference with Qwen3 TTS Voice Clone (seed 7 first), converted from model FLAC
to AAC/M4A, and checked by Whisper STT. `data/lines.json` is always the
authoring/fallback source; a missing or rejected clip uses device speech.

## Reproduction

```sh
export QLOBE_QWEN_URL=http://YOUR-MODEL-HOST:8100
python3 games/puppet-retell/tools/gen-props.py
python3 games/puppet-retell/tools/gen-voice.py
```

Generated files are owned by QLOBE Kids and released under the asset license
declared in `game.json`.
