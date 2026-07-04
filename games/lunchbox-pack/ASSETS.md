# Asset Log — Lunchbox Pack

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandão & Hafontia | SIL OFL 1.1 | No UI attribution required | Subset latin-600 as shipped by Fontsource |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-sound.png`) | Shared QLOBE Kids library (see `games/sound-sprouts/ASSETS.md`) | Generated for this project | CC BY 4.0 | No | Reused unmodified |
| Sound effects | N/A — synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech fallback voices | N/A — device built-in Web Speech API voices | N/A | N/A | N/A | Used only if a recorded clip is missing |

## Generated assets (original works)

All assets below were generated locally with AI models and are original works
for this project, licensed **CC BY 4.0**. They contain no third-party content,
recognizable copyrighted characters, brand logos, or sampled material. The
runtime makes no network calls to any model or service.

| Asset | Tool / model (run locally) | Creator | License | Attribution required | Notes |
|---|---|---|---|---|---|
| Food library (`shared/assets/foods/*.png`, 18) | Qwen Image Edit + Krea2 image models | Generated for this project | CC BY 4.0 | No | Transparent food PNGs in the platform object style; seeded by this game, shared for reuse by other games |
| Character portraits (`shared/characters/{maya,leo,nia,sam}/portrait.png`) | Qwen Image Edit + Krea2 image models | Generated for this project | CC BY 4.0 | No | Transparent busts of the shared QLOBE Kids cast |
| Lunch box art (`assets/lunchbox-open.png`, `assets/lunchbox-closed.png`) | Qwen Image Edit + Krea2 image models | Generated for this project | CC BY 4.0 | No | Open bento-style box (lid up, 3 compartments) and matching closed box |
| Kitchen background (`assets/bg.jpg`) | Qwen Image Edit + Krea2 image models | Generated for this project | CC BY 4.0 | No | Soft-focus toy-style kitchen, 1280×800 |
| Splash art (`assets/splash.jpg`) | Qwen Image Edit + Krea2 image models | Generated for this project | CC BY 4.0 | No | Title art baked in; bottom-center kept clear for the HTML mode buttons |
| Voice clips (`assets/audio/*.m4a`, 60 + `manifest.json`) | Qwen3-TTS voice clone of the platform teacher voice | Generated for this project | CC BY 4.0 | No | One consistent warm teacher voice: intros, requests, yums, counts, cheers; every line QA round-tripped with Whisper transcription. Spoken text lives in `data/lines.json` |
