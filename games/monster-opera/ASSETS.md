# Monster Opera asset provenance

All runtime model calls are authoring-time only. The shipped game is static and offline-capable. Original QLOBE project assets and generated derivatives are released under CC BY 4.0 unless a source row states otherwise.

## Authoritative concept media

| Runtime asset | Source | Production changes | Creator / license |
| --- | --- | --- | --- |
| `assets/concept/blackboard.jpg` | `01-game-concepts/_completed/monster-opera/new-monsters/blackboard.png` | High-quality opaque runtime transcode; lossless source retained at `assets/source/concept/blackboard.png` | User-supplied QLOBE project asset / CC BY 4.0 |
| `assets/monsters/monster-01…12/sprites/still.webp` | `assets/source/stills/monster-NN.webp` (the 640² black-backed still cut from `new-monsters/monster-NN/NN.png`) | Keyed to real alpha with the same contrast/saturation look as the animation frames (see below); the poster pose under a loading loop and the reduced-motion art | User-supplied QLOBE project assets / CC BY 4.0 |
| `assets/monsters/monster-01…12/sprites/dance-NN.webp` + `manifest.json` | `assets/source/video/monster-NN/dance.mp4` (480² H.264 concept dance loops, 20–24fps, 4.0–4.5s) | **Keyframe sprite strips.** Every source frame is decoded, the CSS `contrast(1.58) saturate(1.06)` look the game used to apply is baked in, alpha is derived from the brightest channel (the pixel's Screen contribution over black) and the colour is un-premultiplied, so each frame is a straight-alpha RGBA keyframe. Frames are cropped to the clip's union bounding box and packed eight per horizontal WebP strip (q85 colour, lossless alpha). Nothing is resampled in time: every source frame is stored and played at the source frame rate (the tool's optional hold-frame `sequence` table is left off because the concept loops have no exactly repeated frames). Built by `tools/build-sprites.sh` → `tools/video-to-sprite-strips.py`. | User-supplied QLOBE project assets / CC BY 4.0 |
| `assets/monsters/monster-01…12/sprites/noise-01…03-NN.webp` | `assets/source/video/monster-NN/noise-01…03.mp4` (36 concept performances trimmed to 4.000s, 480² H.264, 20fps; source exception `monster-05/noise-2.mp4` normalized to `noise-02.mp4`) | Same keyframe conversion as the dance loops; one-shot clips (`loop: false`) | User-supplied QLOBE project assets / CC BY 4.0 |
| Matching `noise-01…03.m4a` | Audio streams in the 36 concept videos | Extracted/finalized to 4.000s AAC for Web Audio scheduling; the sprite performance is started on the same clock so picture and sound stay together | User-supplied QLOBE project assets / CC BY 4.0 |
| Splash dancers (`monster-01`, `-06`, `-10`) | The same dance sprite packages | Looped from the cast packages; the former `assets/ambience/dance-*.mp4` copies were byte-identical duplicates and were removed | User-supplied QLOBE project assets / CC BY 4.0 |
| `assets/ambience/sound-loop.m4a` | `new-monsters/sound-loop.m4a` | Copied as supplied; decoded and looped gaplessly at runtime | User-supplied QLOBE project asset / CC BY 4.0 |
| Interaction references | `new-concept-01.png`, `new-concept-02.png`, `_all-monsters.png` | Style/layout references only; not shipped as gameplay screens | User-supplied QLOBE project assets / CC BY 4.0 |

## GPT Image 2 production art

Selected masters are retained in `assets/source/gpt-image-2/`; exact prompts and output IDs are in `PROMPTS.md`.

| Runtime asset | Accepted source | Production changes |
| --- | --- | --- |
| `assets/ui/title.png` | `exec-1098a006-6240-490a-a7e6-43966671b7a8.png` | Direct RGBA title master; exact spelling visually verified |
| `assets/ui/back.png`, `sound-on.png`, `sound-off.png`, `drum-on.png`, `drum-off.png`, `go.png`, `new-song.png`, `play.png` | Extracted-alpha control sheet `exec-35f43de1-5543-428a-a9c2-da3caba990bd.png` | Deterministic 4×2 grid slice; every control retains a ≥96px runtime hit substrate |
| `assets/ui/composer-rail.png`, `lane-white.png`, `lane-yellow.png`, `lane-teal.png` | `exec-bf38d061-bde6-49a5-9f69-c2941684fde5.png` | Full RGBA source plus deterministic full-width vertical lane-band crops |
| `assets/ui/concert-plate.png` | `exec-ea94464c-18fd-48c9-af96-c688053a73f9.png` | Black-backed selected plate; foreground Screen-blended over the blackboard and performer layers at runtime |
| `assets/ui/playhead.png`, `dot-white.png`, `dot-yellow.png`, `dot-teal.png` | `exec-cfcc8b6a-d1ab-4469-88d2-8e765e1efd94.png` | Deterministic 4×1 grid extraction, then semantic ordering by marker color/type; `playhead.png` remains the composer marker |
| `assets/ui/playhead-long.png` | User-supplied raster asset (140×880 RGBA) | Dedicated endless-scroll concert marker; preserves the long vertical artwork without stretching the composer marker |

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

Monster Opera deliberately carries 12 idle dances and 36 short audiovisual performances because the supplied moving cast and the child's chosen performances are the game mechanic, not decorative video.

Since the keyframe conversion the animations are **sprite strips, not video**. The trade is deliberate: intra-coded keyframes with a lossless alpha plane cost roughly 4–8 MB per four-second clip against 0.3–0.8 MB for the H.264 master (≈190 MB for the whole cast, all under `assets/monsters/*/sprites/`), but in return every frame composites onto the slate with real alpha — no `mix-blend-mode: screen`, no black matte, no hardware video planes, no per-event `<video>` decoders — and playback is a plain time-driven canvas draw that never drifts or stalls behind a media element.

The runtime (`js/sprite-clips.js`) keeps that affordable:

- nothing is fetched until it is needed: a cast member's dance loop streams in when it scrolls on stage (off-stage members only buffer), a performance clip when its event nears the concert viewport or is tapped;
- a clip only starts looping once its strips are buffered, so the still holds the pose instead of a stuttering half-loaded loop;
- decoded memory is a sliding window — the strip being drawn plus the next one, decoded off the main thread with `createImageBitmap` and closed as soon as no player wants them — so a dozen dancers hold well under 100 MB of bitmaps while compressed bytes stay cached as Blobs;
- every copy of a monster's dance in the concert shares one clock and therefore one decoded strip window; dense songs drop the concert canvases to 320px/240px exactly as the video renderer did.

`node games/monster-opera/tools/qa.mjs` asserts the frame-preservation contract on every manifest (≥20fps, ≥80 frames, sequence tables that only share hold frames) and the runtime budgets above. Source masters remain separated from runtime files under `assets/source/`.
