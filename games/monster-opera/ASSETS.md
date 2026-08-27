# Monster Opera asset provenance

All runtime model calls are authoring-time only. The shipped game is static and offline-capable. Original QLOBE project assets and generated derivatives are released under CC BY 4.0 unless a source row states otherwise.

## Authoritative concept media

| Runtime asset | Source | Production changes | Creator / license |
| --- | --- | --- | --- |
| `assets/concept/blackboard.jpg` | `01-game-concepts/_completed/monster-opera/new-monsters/blackboard.png` | High-quality opaque runtime transcode; lossless source retained at `assets/source/concept/blackboard.png` | User-supplied QLOBE project asset / CC BY 4.0 |
| `assets/monsters/monster-01…12/still.webp` | `new-monsters/monster-NN/NN.png` | Black-backed resize from 1024² to 640² and high-quality WebP delivery; composed in the same screen-blended overlay layer as performance video | User-supplied QLOBE project assets / CC BY 4.0 |
| `assets/monsters/monster-01…12/dance.mp4` | 12 matching `new-monsters/monster-NN/dance.mp4` files | Finalized to 4.000s; 480² H.264 yuv420p, 20fps, faststart, video-only. These are the looping Composer idle state, with each `<video>` directly using CSS Screen blend mode. | User-supplied QLOBE project assets / CC BY 4.0 |
| `assets/monsters/monster-01…12/noise-01…03.mp4` | 36 matching `noise-*.mp4` files | Trimmed to 4.000s; 480² H.264 yuv420p, 20fps, faststart, video-only. Source exception `monster-05/noise-2.mp4` normalized to `noise-02.mp4`. | User-supplied QLOBE project assets / CC BY 4.0 |
| Matching `noise-01…03.m4a` | Audio streams in the 36 concept videos | Extracted/finalized to 4.000s AAC for Web Audio scheduling; video delivery is muted to prevent doubled audio | User-supplied QLOBE project assets / CC BY 4.0 |
| `assets/ambience/dance-01.mp4`, `dance-06.mp4`, `dance-10.mp4` | Matching concept dance videos | Trimmed to 4.000s, 480² H.264, video-only, used muted on splash | User-supplied QLOBE project assets / CC BY 4.0 |
| `assets/ambience/sound-loop.m4a` | `new-monsters/sound-loop.m4a` | Copied as supplied; decoded and looped gaplessly at runtime | User-supplied QLOBE project asset / CC BY 4.0 |
| Interaction references | `new-concept-01.png`, `new-concept-02.png`, `_all-monsters.png` | Style/layout references only; not shipped as gameplay screens | User-supplied QLOBE project assets / CC BY 4.0 |

## GPT Image 2 production art

Selected masters are retained in `assets/source/gpt-image-2/`; exact prompts and output IDs are in `PROMPTS.md`.

| Runtime asset | Accepted source | Production changes |
| --- | --- | --- |
| `assets/ui/title.png` | `exec-1098a006-6240-490a-a7e6-43966671b7a8.png` | Direct RGBA title master; exact spelling visually verified |
| `assets/ui/back.png`, `sound-on.png`, `sound-off.png`, `drum-on.png`, `drum-off.png`, `go.png`, `new-song.png`, `play.png` | Extracted-alpha control sheet `exec-35f43de1-5543-428a-a9c2-da3caba990bd.png` | Deterministic 4×2 grid slice; every control retains a ≥96px runtime hit substrate |
| `assets/ui/composer-rail.png`, `lane-white.png`, `lane-yellow.png`, `lane-teal.png` | `exec-bf38d061-bde6-49a5-9f69-c2941684fde5.png` | Full RGBA source plus deterministic full-width vertical lane-band crops |
| `assets/ui/concert-plate.png` | `exec-ea94464c-18fd-48c9-af96-c688053a73f9.png` | Black-backed selected plate; intentionally screen-blended over blackboard at runtime |
| `assets/ui/playhead.png`, `dot-white.png`, `dot-yellow.png`, `dot-teal.png` | `exec-cfcc8b6a-d1ab-4469-88d2-8e765e1efd94.png` | Deterministic 4×1 grid extraction, then semantic ordering by marker color/type |

Creator: OpenAI GPT Image 2 through the approved Codex image-generation workflow, directed by the QLOBE Kids team. License: QLOBE project output, CC BY 4.0.

Rejected candidates were not shipped: the first controls sheet simulated transparency with a checkerboard; it was accepted only after a true-alpha extraction. A concert checkerboard extraction over-selected gray cells and was rejected in favor of the clean black-backed overlay plate.

## Catalog packaging

The shipped `assets/hub/tiles/monster-opera.jpg` is a deterministic 640×533 production-browser composition of the finished raster chalk title, actual supplied monster cast, three authored lane assets, and blackboard texture. This keeps the catalog entry visually identical to the game it opens.

QLOBE Studio's `menu-game-tile` template was also explored through the approved local Krea 2 pipeline (`krea2-turbo-t2i`, seeds 42 and 1337). Adversarial final art review rejected that smooth 3D direction as inconsistent with the chalk concept, so the candidate and recipe are retained only under `assets/source/krea-2/` for provenance and are not shipped as runtime or hub art.

`assets/og-image.jpg` is a deterministic 1200×630 production-browser capture of the finished splash composition with the catalog Home control hidden for a clean social share card. No new generated content was introduced during the capture.

## Shared assets

| Asset | Use | License |
| --- | --- | --- |
| `../../shared/assets/ui/btn-home.png` | Splash-only catalog navigation | QLOBE Kids shared asset / CC BY 4.0 |
| `../../shared/fonts/fredoka-latin-600-normal.woff2` | Accessible functional text and labels | See repository font metadata |

## Runtime budget note

Monster Opera deliberately carries 12 idle dances and 36 short audiovisual performances because the supplied moving cast and the child's chosen performances are the game mechanic, not decorative video. Delivery videos are resized, duration-bounded, video-only, and either loop only while Composer is visible or load on demand; audio is compact and decoded in the background after the start gesture. Source masters remain separated from runtime files.
