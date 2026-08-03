# Asset Log — Globe Spin Stories

## Shipped assets

| Asset | Source / creator | License | Modifications |
|---|---|---|---|
| `assets/title.webp` | Original generated with OpenAI GPT Image 2 for QLOBE Kids, 2026-08-03 | QLOBE project asset; distributed here under CC BY 4.0 | Magenta chroma removed with the Codex imagegen helper; transparent PNG converted to WebP. Source and alpha intermediate retained in `assets/source/`. |
| `assets/scenes/{asia,africa,australia,north-america,south-america}.webp` | Five original illustrations generated with OpenAI GPT Image 2 for QLOBE Kids, 2026-08-03 | QLOBE project assets; distributed here under CC BY 4.0 | Full-resolution PNG sources converted to 1600×1200 WebP, each kept below the 300 KB scene budget. Sources retained in `assets/source/`. |
| `assets/map/natural-earth-110m.json` | [Natural Earth 1:110m Land, version 4.1.0](https://www.naturalearthdata.com/downloads/110m-physical-vectors/), made by Natural Earth volunteers | Public domain | Official shapefile polygons parsed, rounded, simplified, and converted to a compact JSON ring set by `tools/convert-natural-earth.py`. Official source ZIP retained in `assets/source/`. |
| `shared/vendor/three.module.min.js` | [three.js](https://threejs.org/) | MIT | Existing QLOBE vendor copy reused by `shared/js/paper-globe.js`; no CDN request. |
| Fredoka SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | Milena Brandão and Hafontia, via Fontsource | SIL Open Font License 1.1 | Existing local QLOBE font reused unmodified. |
| QLOBE HUD art and confetti | Existing QLOBE shared asset library | CC BY 4.0 | Reused through the shared UI and celebration modules. |
| Sound effects | QLOBE `shared/js/sfx.js` | MIT project code | Synthesized locally at runtime with WebAudio; no sourced audio files. |
| Narration fallback | Device Web Speech API via QLOBE `shared/js/voice-clips.js` | Device/platform voice terms | All exact authored lines live in `data/lines.json`. No teacher-voice recording is shipped unless its local batch is explicitly authorized and transcript-QA accepted. |

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

The mockup screens in `01-game-concepts/globe-spin-stories/` guided composition and interaction hierarchy only; all shipped raster art is newly generated for this implementation.

## Optional recorded-voice workflow

`tools/gen-voice.mjs` is a resumable Studio client for the approved `character-voice-line` / `qwen3-tts-voiceclone` template. It requires explicit approval because it sends the configured teacher reference to a local Qwen service. For every authorized line it requires Whisper transcript match ≥0.8, accepts the media object, copies the `.m4a`, and preserves `recipe.json` plus `qa-transcript.json`. The current release intentionally keeps `assets/audio/manifest.json` empty and uses the safe speech fallback.

## Link preview (og:image)

| Asset | Source | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| `assets/og-image.jpg` | Generated screenshot of this game's own splash screen (1200×630), captured by `tools/pipeline/capture_og_images.mjs` | QLOBE Kids | CC BY 4.0 | No | Regenerate with the tool rather than editing by hand |
