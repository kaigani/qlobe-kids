# Sound Cylinder Match — Asset Production and Provenance

All child-facing primary art is committed raster media. The game ships no
emoji, SVG, CSS-drawn toy, runtime model call, remote font, or asset CDN.

## Production summary

```text
concept brief + Kawaii mockups
→ GPT Image 2 visual-system masters
→ Krea hub-tile/button supplements
→ local connected-charcoal matte + alpha erosion/feather
→ magenta edge QA
→ deterministic WebP/JPEG finalization
→ authored WAV sample generation + validation
→ recorded generic teacher cues + exact Web Speech fallback
```

GPT Image 2 was the art-direction source of truth for the room, title,
cylinders, and star. Krea was used only for the platform-standard hub tile and
blank button plate. A planned Qwen Image Layered upload was denied by the
execution environment, so cutouts use the checked-in, deterministic local
matte in `tools/finalize-assets.py`. That matte removes only dark pixels
connected to the canvas border, preserving enclosed dark eyes and lid holes.

## Runtime art

| Runtime asset | Source master | Authoring workflow | Finalization | License |
| --- | --- | --- | --- | --- |
| `assets/bg/playroom.webp` | `assets/source/gpt-image-2-playroom.png` | built-in GPT Image 2, 2026-08-11 | 1600×1200 WebP quality 84 | CC BY 4.0 |
| `assets/art/title.webp` | `assets/source/gpt-image-2-title.png` | GPT Image 2 with playroom/shaker/star style refs | connected-charcoal matte, trim, ≤720 lossless WebP | CC BY 4.0 |
| `assets/art/cylinder-aqua.webp` | `assets/source/gpt-image-2-cylinder-aqua.png` | GPT Image 2 with playroom style ref | same local matte/finalizer | CC BY 4.0 |
| `assets/art/cylinder-coral.webp` | `assets/source/gpt-image-2-cylinder-coral.png` | GPT Image 2 precise color edit of aqua master | same local matte/finalizer | CC BY 4.0 |
| `assets/art/star.webp` | `assets/source/gpt-image-2-star.png` | GPT Image 2 with playroom/shaker style refs | same local matte/finalizer | CC BY 4.0 |
| `assets/art/sound-badge.webp` | `assets/source/gpt-image-2-sound-badge.png` | GPT Image 2 with playroom/shaker/star/button refs | same local matte/finalizer | CC BY 4.0 |
| `assets/art/reward-stage.webp` | `assets/source/gpt-image-2-reward-stage.png` | GPT Image 2 with full visual-system refs | global charcoal matte for the intentionally empty arch | CC BY 4.0 |
| `assets/art/muted.webp` | `assets/source/gpt-image-2-muted.png` | GPT Image 2 edit of the platform sound button | fixed circular export mask | CC BY 4.0 |
| `assets/art/button.webp` | `assets/source/krea-button.png` | local `krea2-turbo-t2i`, seed 42 | same local matte/finalizer | CC BY 4.0 |
| `../../assets/hub/tiles/sound-cylinder-match.jpg` | `assets/source/krea-hub-tile.png` | local `menu-game-tile` grammar, Krea seed 42 | 640×533 progressive JPEG | CC BY 4.0 |
| `assets/og-image.jpg` | actual runtime screenshot | QLOBE capture workflow | 1200×630 JPEG | CC BY 4.0 |

The exact normalized prompts and reference relationships live in
`assets/source/provenance.json`. Generated source masters are retained so the
production pass is inspectable and reproducible. `assets/source/qa/` contains
saturated-magenta composites used to check holes, halos, and matte erosion.

## Sound samples

`tools/generate-samples.py` deterministically writes six mono PCM WAV files at
44.1 kHz / 16 bit with fixed seeds. They are authored mathematical sound
design, not downloaded recordings and not runtime WebAudio synthesis.

| File | Intended quality | Duration |
| --- | --- | ---: |
| `assets/samples/seeds.wav` | dry soft double-shake/noise body | 0.72 s |
| `assets/samples/bell.wav` | bright inharmonic metallic ring | 1.05 s |
| `assets/samples/wood.wav` | short hollow wooden knock | 0.62 s |
| `assets/samples/sand.wav` | sustained fine-noise hush | 0.88 s |
| `assets/samples/drum.wav` | low rounded decaying thump | 0.70 s |
| `assets/samples/chime.wav` | clear high harmonic ping | 1.20 s |

`python3 tools/generate-samples.py --check` verifies WAV headers, duration,
nontrivial RMS, and six distinct PCM hashes. Code is MIT; generated samples are
CC BY 4.0.

## Narration

All 12 fixed narration lines ship as local Qwen3-TTS VoiceClone AAC/M4A clips
using the committed synthetic platform teacher reference at
`shared/assets/refs/voice-teacher.wav`. Every clip passed same-host Whisper
transcript QA at ratio 1.0 on seed 7; `assets/audio/manifest.json` has complete
coverage for `assets/audio/lines.json`, with durations, SHA-256 hashes, and text
hashes. `assets/audio/qa.json` preserves the generation evidence.

The authoring command is:

```sh
QLOBE_QWEN_URL=http://LAN-HOST:8100 \
  python3 games/sound-cylinder-match/tools/generate-voice.py \
  --voice-ref shared/assets/refs/voice-teacher.wav
```

Runtime playback remains offline and static. The shared voice player retains
exact Web Speech fallback text for a missing or playback-blocked clip, but no
fixed line is expected to use that fallback in a healthy release build.

## Shared assets

| Asset | Source | License |
| --- | --- | --- |
| Fredoka SemiBold | `shared/fonts/fredoka-latin-600-normal.woff2`, Fontsource | SIL OFL 1.1 |
| Home/back/sound HUD sprites | `shared/assets/ui/btn-*.png` | QLOBE Kids, CC BY 4.0 |
| Tactile SFX | `shared/js/sfx.js` deterministic WebAudio | MIT |

## Reproduction

From the repository root:

```sh
python3 games/sound-cylinder-match/tools/finalize-assets.py --qa
python3 games/sound-cylinder-match/tools/generate-samples.py --check
node games/sound-cylinder-match/tools/qa.mjs
```

The first command requires Pillow. All model calls are authoring-time only;
the committed game works offline apart from the platform-wide analytics tag.
