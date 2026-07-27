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
| `assets/bg/enchanted-castle.jpg` | GPT Image 2, guided by the finished stage backdrops | 4:3 cover crop, 1400×1050 progressive JPEG |
| `assets/bg/moon-adventure.jpg` | GPT Image 2, guided by the finished stage backdrops | 4:3 cover crop, 1400×1050 progressive JPEG |
| `assets/bg/forest-cottage.jpg` | GPT Image 2, guided by the finished stage backdrops | 4:3 cover crop, 1400×1050 progressive JPEG |
| `../../assets/hub/tiles/puppet-retell.jpg` | Krea 2 Turbo text-to-image, seed 42, generated through QLOBE Studio | 6:5 resize, 640×533 JPEG; no text baked into art |
| `assets/story/*.jpg` | GPT Image 2, six-scene story-card contact sheet guided by the finished stage art | deterministic 3×2 crop, 640×400 progressive JPEG |
| `assets/ui/mode-*.png` | GPT Image 2, mode/action contact sheet guided by the finished stage art | chroma-key extraction, deterministic 3×3 crop, 320px transparent PNG |
| `assets/ui/action-*.png` | GPT Image 2, mode/action contact sheet guided by the finished stage art | chroma-key extraction, deterministic 3×3 crop, 320px transparent PNG |
| `assets/ui/{no-prop,privacy-lock,delete,curtain-loading,show-saved,replay}.png` | GPT Image 2 utility contact sheet guided by the finished stage art | chroma-key extraction, deterministic 3×2 crop, 320px transparent PNG |
| `assets/props/crown.png` | Krea 2 seed 42, Qwen Image Layered subject extraction | alpha-QC on magenta, tight crop, 384px transparent PNG |
| `assets/props/explorer-hat.png` | Krea 2 seed 42, Qwen Image Layered subject extraction | alpha-QC on magenta, tight crop, 384px transparent PNG |
| `assets/props/magic-wand.png` | Krea 2 seed 42, Qwen Image Layered subject extraction | alpha-QC on magenta, tight crop, 384px transparent PNG |
| `assets/props/story-basket.png` | Krea 2 seed 42, Qwen Image Layered subject extraction | alpha-QC on magenta, tight crop, 384px transparent PNG |

GPT Image 2 originals are retained under
`assets/source/gpt-image-2/`. The final visual-pass sheets and generation
briefs are retained under `assets/source/gpt-image-2-polish/`. Krea originals,
layered outputs, and magenta QC composites are retained under
`assets/source/local-api/`.

The selected Krea 2 Turbo hub-tile source and its reproducible QLOBE recipe are
retained under `assets/source/local-api/hub-tile/`.

The three-stage expansion sources and prompts are retained under
`assets/source/gpt-image-2-stage-expansion/`.

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

## Local MP4 export

`shared/js/performance-video-export.js` replays the saved action timeline into
a fixed 1280×720 Pixi canvas and records it with the browser's native MP4
encoder. When a saved voice track exists, Web Audio routes it directly into the
capture stream as AAC; movement-only shows export as silent H.264 MP4. The
finished file is offered through Save and, where supported, the device share
sheet. No performance data is uploaded.

## Reproduction

```sh
export QLOBE_QWEN_URL=http://YOUR-MODEL-HOST:8100
python3 games/puppet-retell/tools/gen-props.py
python3 games/puppet-retell/tools/gen-voice.py
python3 games/puppet-retell/tools/finalize-polish-art.py
python3 games/puppet-retell/tools/finalize-stage-expansion.py
```

Generated files are owned by QLOBE Kids and released under the asset license
declared in `game.json`.
