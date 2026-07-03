# Asset Log — Sound Sprouts

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| three.js r166 (`vendor/three.module.min.js`) | https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.min.js | three.js authors | MIT | No UI attribution required | Unmodified |
| RoundedBoxGeometry.js (`vendor/RoundedBoxGeometry.js`) | https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/geometries/RoundedBoxGeometry.js | three.js authors | MIT | No UI attribution required | Unmodified |
| Twemoji 15.1.0 emoji artwork (31 SVGs, see `assets/twemoji/`) | https://github.com/jdecked/twemoji | Twitter/X & Twemoji contributors | CC-BY 4.0 | YES — attribution given in ASSETS.md and README | Unmodified |
| Fredoka font SemiBold (`assets/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandão & Hafontia | SIL OFL 1.1 | No UI attribution required | Subset latin-600 as shipped by Fontsource |
| Sound effects | N/A — synthesized at runtime via WebAudio API | N/A | N/A | N/A | No sourced audio assets |
| Web Speech fallback voices | N/A — device built-in Web Speech API voices | N/A | N/A | N/A | Used only if a recorded clip is missing |

## Phase 2 — generated assets (original works, no third-party license)

All Phase 2 assets below were generated locally and are original works for this
project. They contain no third-party content, recognizable copyrighted
characters, brand logos, or sampled material, so no external license or
attribution applies. The runtime makes no network calls to any model or service.

| Asset | Tool / model (run locally) | Creator | License | Attribution required | Notes |
|---|---|---|---|---|---|
| Letter tiles (`assets/gen/tiles/*.png`, 56) | Qwen Image Edit 2509 (local) | Generated for this project | Original work — project-owned | No | Blue onset / orange rime glossy tiles (19 onsets + 37 rimes), edited from a single seed tile per color |
| Object picture cards (`assets/gen/objects/*.png`, 133 + `mystery.png`) | Qwen Image Edit 2509 (local) | Generated for this project | Original work — project-owned | No | Consistent toy-style objects; nouns plus verbs/adjectives drawn as simple scenes; one shared reference style |
| HUD buttons (`assets/gen/ui/btn-*.png`) | Concept art (home/sound) + Qwen Image Edit (shuffle/play), local | Generated for this project | Original work — project-owned | No | Ringed glossy style: orange home, blue sound, purple shuffle, green play |
| Splash/menu UI kit (`assets/gen/ui/splash/*.png`) | Provided by project owner; keyed + composited locally | Project owner | Original work — project-owned | No | Title, three pill button shapes, three text labels, three icons (ABC blocks, peeking cat, bowl of letters); background keyed out and buttons composited for the menu |
| Background plate (`assets/gen/bg.jpg`) | Qwen Image Edit 2509 (local) | Generated for this project | Original work — project-owned | No | Garden scene + podium stage |
| Voice clips (`assets/audio/**`, 463 + `manifest.json`) | Qwen3 TTS voice-design + voice-clone (local) | Generated for this project | Original work — project-owned | No | One consistent warm preschool-teacher voice; 56 fragments, 133 words, 133 celebrations, 133 prompts, 8 misc; QA round-tripped with Whisper |

The earlier Twemoji emoji set is retained as a defensive fallback only and is
still covered by its CC-BY 4.0 attribution below.

---

**CC-BY 4.0 Attribution:**
Emoji artwork © Twitter, Inc and other contributors, from the Twemoji project (https://github.com/jdecked/twemoji), licensed under CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
