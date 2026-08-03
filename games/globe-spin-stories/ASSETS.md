# Asset Log — Globe Spin Stories

## Shipped assets

| Asset | Source / creator | License | Modifications |
|---|---|---|---|
| `assets/title.webp` | Original generated with OpenAI GPT Image 2 for QLOBE Kids, 2026-08-03 | QLOBE project asset; distributed here under CC BY 4.0 | Magenta chroma removed with the Codex imagegen helper; transparent PNG converted to WebP. Source and alpha intermediate retained in `assets/source/`. |
| `assets/scenes/{asia,africa,australia,north-america,south-america}.webp` | Five original illustrations generated with OpenAI GPT Image 2 for QLOBE Kids, 2026-08-03 | QLOBE project assets; distributed here under CC BY 4.0 | Full-resolution PNG sources converted to 1600×1200 WebP, each kept below the 300 KB scene budget. Sources retained in `assets/source/`. |
| `assets/backgrounds/{splash,globe}.webp` | Two original scene backdrops generated with OpenAI GPT Image 2 for QLOBE Kids, 2026-08-03 | QLOBE project assets; distributed here under CC BY 4.0 | Full-resolution sources resized to 1440×1080 WebP. Sources retained in `assets/source/raster-ui/`. |
| `assets/ui/*.webp` | Fourteen original papercraft UI pieces generated with OpenAI GPT Image 2 for QLOBE Kids, 2026-08-03 | QLOBE project assets; distributed here under CC BY 4.0 | Each piece was generated against a flat magenta chroma field, isolated to a transparent layer with the Codex imagegen chroma helper, tightly cropped, resized, and encoded by `tools/process-raster-ui.py`. Original chroma sources are retained in `assets/source/raster-ui/`; alpha intermediates are reproducible and omitted from the release tree. |
| `assets/map/natural-earth-110m.json` | [Natural Earth 1:110m Land, version 4.1.0](https://www.naturalearthdata.com/downloads/110m-physical-vectors/), made by Natural Earth volunteers | Public domain | Official shapefile polygons parsed, rounded, simplified, and converted to a compact JSON ring set by `tools/convert-natural-earth.py`. Official source ZIP retained in `assets/source/`. |
| `assets/map/world-paper-map.webp` | Natural Earth geometry above, rendered locally by QLOBE Kids | Public domain geography; QLOBE project rendering under CC BY 4.0 | `tools/render-paper-map.py` bakes the colored land, ocean, graticule, shadows, and paper flecks into one 2048×1024 raster texture. No browser canvas drawing is used. |
| `shared/vendor/three.module.min.js` | [three.js](https://threejs.org/) | MIT | Existing QLOBE vendor copy reused by `shared/js/paper-globe.js`; no CDN request. |
| Fredoka SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | Milena Brandão and Hafontia, via Fontsource | SIL Open Font License 1.1 | Existing local QLOBE font reused unmodified. |
| QLOBE HUD art | Existing QLOBE shared asset library | CC BY 4.0 | Existing raster home, back, and sound controls reused through the shared HUD stylesheet. |
| Sound effects | QLOBE `shared/js/sfx.js` | MIT project code | Synthesized locally at runtime with WebAudio; no sourced audio files. |
| Recorded narration (`assets/audio/*.m4a`) | QLOBE teacher voice, authored through the local QLOBE Studio API with `character-voice-line` / `qwen3-tts-voiceclone` | QLOBE approved, rights-cleared teacher reference | 38 authored lines encoded as AAC/M4A. Exact copy lives in `data/lines.json`; accepted recipes and Whisper transcripts are retained under `assets/source/voice-{recipes,qa}/`. Device Web Speech remains an error fallback only. |

## GPT Image 2 production record

Generation mode: built-in Codex image generation, one new image per request, with no source-image attachment. The visual target was a premium preschool papercraft picture-book: visibly cut construction paper, stitched/felt details, friendly dimensional lighting, bold simple silhouettes, no gradients or photorealism, and no text except the title asset.

| Final asset | Prompt-specific direction |
|---|---|
| `title.webp` | Exact readable title “Globe Spin Stories” as chunky cream felt letters sewn onto a curved deep-navy ribbon, little thread and paper-tab details, centered on a flat solid magenta chroma background, no extra words. |
| `scenes/asia.webp` | Open tactile book viewed nearly straight-on; quiet pale left page for UI facts; right-page layered bamboo forest with a gentle giant panda, red paper lantern, tiny pagoda silhouette, tactile stars; no words. |
| `scenes/africa.webp` | Same book system; warm savanna with a friendly elephant, acacia trees, layered sunset hills, woven-paper accents; culturally neutral, no costume caricatures, no words. |
| `scenes/australia.webp` | Same book system; eucalyptus woodland with a friendly koala, layered ochre rocks, paper leaves and stars; no flag motifs, no words. |
| `scenes/north-america.webp` | Same book system; mountain forest with a friendly black bear, pine layers, blue lake and paper mountain peaks; no flag motifs, no words. |
| `scenes/south-america.webp` | Same book system; lush rainforest with a friendly toucan, layered canopy, vines, bright paper flowers and river curve; no words. |
| `backgrounds/splash.webp` | 4:3 premium papercraft travel scene with a geographically recognizable globe, layered hills, clouds, airplane, balloon and bird; generous dark-blue title space; no text. |
| `backgrounds/globe.webp` | 4:3 cyan torn-paper sky and rolling stitched hills with quiet central play space, small balloon, clouds and landscape details; no text. |
| `ui/prompt-panel.webp` | Large blank cream stitched felt cloud panel, centered on flat magenta for transparent isolation; no words or symbols. |
| `ui/passport-book.webp` | Open cream handmade passport book with one blank header patch and five stitched stamp slots, plus tiny globe, airplane and balloon decorations; no text. |
| `ui/end-card.webp` | Blank layered cream-and-golden papercraft celebration card on flat magenta; no text. |
| `ui/confetti.webp` | Full-frame papercraft confetti, streamers and stitched stars around a quiet transparent center; generated on flat magenta. |
| `ui/map-pin.webp` | Friendly golden stitched map pin with a blank cream hanging label; generated on flat magenta. |
| `ui/passport-cover.webp` | Deep navy tactile passport cover with a golden globe emblem and blank count badge; generated on flat magenta, no words. |
| `ui/seal-{leaf,paw,star}.webp` | Three cream stitched discovery medallions with navy felt leaf, paw and star marks; each isolated from flat magenta. |
| `ui/stamp-star.webp` | Warm orange stamped-star paper patch for progress and passport collections; isolated from flat magenta. |
| `ui/button-{play,spin,stamp,replay}.webp` | Four tactile stitched button faces with their play, spin, stamp-star and replay symbols already baked into the raster; blank text areas preserved for accessible live labels. |

The mockup screens in `01-game-concepts/globe-spin-stories/` guided composition and interaction hierarchy only; all shipped raster art is newly generated for this implementation. Runtime CSS is limited to layout, typography, state, and accessibility. It does not draw scene art, icons, panels, buttons, seals, pins, stamps, or confetti with vectors or CSS primitives.

## Recorded-voice production record

`tools/gen-voice.mjs` is the resumable local Studio client used for this release. With the user-authorized, rights-cleared `shared/assets/refs/voice-teacher.wav` reference, it runs the approved `character-voice-line` / `qwen3-tts-voiceclone` template over every authored line using the deterministic seed ladder 7, 8, 9. A clip is accepted only when local Whisper reports a transcript match ratio of at least 0.98. The tool then stages the AAC/M4A file, its accepted `recipe.json`, and its `qa-transcript.json`, and rebuilds the flat runtime manifest.

The shipped batch contains 38/38 lines. Prompt Africa required seed 9; the North America and South America landing lines required seed 8. The Australia animal and habitat facts and the South America wonder fact were lightly rewritten for clear child-directed pronunciation, then regenerated and rechecked. All final clips meet the ≥0.98 gate; the South America wonder line is an exact transcript match.

## Link preview (og:image)

| Asset | Source | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| `assets/og-image.jpg` | Generated screenshot of this game's own splash screen (1200×630), captured by `tools/pipeline/capture_og_images.mjs` | QLOBE Kids | CC BY 4.0 | No | Regenerate with the tool rather than editing by hand |
