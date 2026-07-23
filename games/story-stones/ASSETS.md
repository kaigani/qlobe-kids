# Story Stones assets

All new game artwork is project-owned and released under CC BY 4.0 with the
rest of QLOBE Kids. No third-party character or prop art is used.

## Storybook production pipeline

| Asset | Production path | Source / processing |
|---|---|---|
| Splash and stone-selection backgrounds | `assets/ui/splash-background.webp`, `assets/ui/select-background.webp` | Native GPT Image generation using the UI concepts for composition and the Castle Meadow source backdrop for storybook style continuity |
| Splash and stone-selection title art | `assets/ui/splash-title.webp`, `assets/ui/select-title.webp` | Native GPT Image generation on a flat magenta key; local soft-matte alpha extraction and WebP optimization |
| Castle Meadow stage | `assets/backdrops/castle-meadow-storybook.webp` | Krea 2 concept, then GPT Image 2 composition refinement with a clear performance area |
| 220 story settings | `assets/backdrops/stories/*.webp` | Local Krea 2 direct generation at 1344×768; one unique environment-only setting per unordered combination |
| Five pose actors | `assets/pose-actors/<id>/poses/*.webp` | Krea 2 concepts; GPT Image 2 identity masters and six semantic pose variations; local chroma key and fixed-canvas normalization |
| Seven story props | `assets/props/*.webp` | Krea 2 concepts; GPT Image 2 isolation; local chroma key and deterministic normalization |
| Twelve stone thumbnails | `assets/stones/*.png` | Deterministic derivatives of neutral actor poses and production prop art |
| Hub tile | `../../assets/hub/tiles/story-stones.jpg` | Deterministic composite of the production backdrop and neutral poses |
| Narrator library | `assets/audio/*.m4a`, `manifest.json`, `lines.json` | Local Qwen3-TTS clone of the canonical teacher reference; local Whisper acceptance check |

The selected visual anchor is Krea 2 seed `1337`, prompted as “Children's
storybook dragon in a cosy illustration style.” Character identity was then
locked with a neutral GPT Image 2 master before producing `neutral`, `enter`,
`notice`, `interact`, `react`, and `celebrate` poses. The production poses share
a transparent 1024×1024 canvas, anchor, and baseline so swapping never changes
the actor's stage mark.

The launch and selection UI sources are preserved under
`assets/source/ui-gpt-image-2/`. The generated title sources use a flat magenta
key; their `*-alpha.png` derivatives preserve the locally extracted transparency.
The game's home and replay-audio controls reuse the existing shared QLOBE Kids
assets at `../../shared/assets/ui/btn-home.png` and `btn-sound.png` unchanged.

Character and prop generation inputs remain under `assets/source/`. To keep the
open repository practical to clone, story settings retain their exact prompt,
seed, dimensions, steps, and CFG in `story-pack.json` instead of committing 220
large source PNGs. Their WebP finals can be regenerated resumably with
`tools/generate-story-stones-scenes.py`.

## Runtime packs

- `assets/actors/pack.json` maps five cast members to pose manifests.
- `assets/pose-actors/<id>/poses.json` defines each actor's six complete-image
  poses, common anchor, and paper-pop transition.
- `assets/props/pack.json` defines seven scene props.
- `story-pack.json` v2 defines pose cue defaults, twelve stones, and all 220
  complete unordered stories with their cast order, three beats, unique setting,
  Krea recipe, and review state.

The superseded Story Stones rig sheets, part cuts, rig manifests, v1 props, and
v1 backdrop were removed after migration. Standard QLOBE puppet assets and
their Rig/Animate workflow are unchanged.
