# Bean Sprout Watch asset log

All child-facing primary art is authored raster artwork. CSS and canvas provide
layout, hit regions, guide/stroke rendering, and state transitions only.

## Generated visual sources

| Source | Generator / workflow | Provenance | Decision |
| --- | --- | --- | --- |
| `assets/source/gpt-image-2/growth-tools-sheet-chroma.png` | OpenAI GPT Image 2, generation | Full final prompt in `assets/source/gpt-image-2/prompts.json` | Accepted after alpha/composition QA; provides six registered plant stages plus water, sun, and badge |
| `assets/source/gpt-image-2/title-chroma.png` | OpenAI GPT Image 2, generation | Full final prompt in `assets/source/gpt-image-2/prompts.json` | Accepted; title spelling checked at full resolution |
| `assets/source/gpt-image-2/ui-carriers-sheet-chroma.png` | OpenAI GPT Image 2, generation | Full final prompt in `assets/source/gpt-image-2/prompts.json` | Accepted; provides blank HTML-text carriers, reset token, and five-leaf vine |
| `assets/source-local-api/bean-sprout-watch-garden-seed42.png` | QLOBE Studio / Krea 2 Turbo T2I | Adjacent `.png.recipe.json`; seed 42; accepted through Studio | Accepted Watercolor / Storybook environment; calm crop-safe center |
| `assets/source-local-api/bean-sprout-watch-hub-seed42.png` | QLOBE Studio / Krea 2 Turbo T2I | Adjacent `.png.recipe.json`; seed 42; accepted through Studio | Accepted Toy hub tile source; no baked text |

The magenta masters and transparent intermediates are retained for repeatable
post-processing. `tools/process-art.py` owns crop boxes, chroma keying,
registered canvases, authored-texture brush extraction, WebP encoding, hub
resizing, and QA metrics. Run:

```sh
python3 games/bean-sprout-watch/tools/process-art.py
python3 games/bean-sprout-watch/tools/process-art.py --check
```

QA composites and dimensions/byte counts live in `assets/source/qa/`. The
runtime visual pack is under 700 KB in the recorded metrics; no individual
generated runtime asset exceeds 100 KB.

## Shipped visual assets

- `assets/backgrounds/bean-sprout-watch-garden.webp` — full-bleed garden.
- `assets/plants/stage-0.webp` through `stage-5.webp` — registered pot/growth sequence.
- `assets/ui/title.webp`, `day-card.webp`, `prompt-banner.webp`,
  `action-terracotta.webp`, `action-green.webp`, `reset-seed.webp`,
  `progress-vine.webp`, `water.webp`, `sun.webp`,
  `nature-badge.webp`, and `brush-stamp.webp`.
- `../../assets/hub/tiles/bean-sprout-watch.jpg` — catalog tile.
- `assets/og-image.jpg` — 1200×630 capture of the shipped splash, regenerated
  with `tools/pipeline/capture_og_images.mjs`.

## Audio

| Audio | Source | Notes |
| --- | --- | --- |
| garden music | `shared/assets/music/gentle-country-morning.mp3` | Shared recorded track; starts only after a gesture, loops with a fade, and ducks under narration via `shared/js/bgm.js` |
| water, sun, leaf, badge | `js/botany-sounds.js` WebAudio synthesis | Game-local, gentle, mute-safe, and lazy-unlocked |
| shared ticks / celebration | `shared/js/sfx.js` and `shared/js/celebrate.js` | Reused platform feedback |
| teacher narration | 27 Qwen3 teacher-voice-clone AAC clips in `assets/audio/` | Recorded voice is primary; exact text remains the Web Speech fallback through `shared/js/voice-clips.js` |

`tools/generate-voice.py` is the reproducible Qwen3 voice-clone pipeline. It
uses the git-ignored platform teacher reference, seeds 7 → 8 → 9, the localhost
Studio queue, and Studio's unconditioned Whisper transcript. A clip is published
only when normalized intended and heard text match exactly and its duration and
volume pass. Normalization ignores punctuation/case and treats Whisper's
single-digit spelling (`5`) as equivalent to the spoken word (`five`); all
other words remain exact, including the rejected `root`/`route` distinction.

The user-approved 2026-08-19 Studio run passed **27/27** lines. Twenty-two final
takes use seed 7 and five day-intro takes use seed 9. `assets/audio/qa.json`
records intended/heard text, duration, loudness, hashes, reference checksum,
seed, and source recipe for every runtime clip. `assets/audio/manifest.json`
publishes the matching 27 stable keys. Accepted authoring masters and their
Studio recipes live under `assets/voice-source/`; no LAN host or private source
path is committed. Re-run and verify with:

```sh
python3 games/bean-sprout-watch/tools/generate-voice.py
python3 games/bean-sprout-watch/tools/generate-voice.py --check
```

## Licensing

- Shared HUD raster buttons and instrument samples are project assets documented
  in the root/shared asset logs and reused without modification.
- Code is MIT; game-specific generated visual assets are released under
  CC BY 4.0 as declared in `game.json`.

### Recorded voice authoring masters

Each accepted master below has an adjacent `qlobe-recipe` sidecar under
`assets/voice-source/`; the runtime key and exact source recipe are joined in
`assets/audio/qa.json`.
- `bean-sprout-watch-welcome-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-welcome-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-choose-day-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-choose-day-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-future-day-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-future-day-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-water-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-water-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-sun-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-sun-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-care-ready-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-care-ready-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-trace-2-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-trace-2-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-trace-3-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-trace-3-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-trace-4-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-trace-4-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-trace-5-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-trace-5-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-trace-nudge-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-trace-nudge-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-care-nudge-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-care-nudge-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-success-2-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-success-2-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-success-3-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-success-3-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-success-4-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-success-4-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-success-5-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-success-5-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-badge-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-badge-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-all-grown-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-all-grown-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-reset-check-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-reset-check-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-reset-done-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-reset-done-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-day-1-intro-seed9.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-day-1-intro-seed9.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-day-2-intro-seed9.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-day-2-intro-seed9.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-day-3-intro-seed9.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-day-3-intro-seed9.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-day-4-intro-seed9.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-day-4-intro-seed9.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-day-5-intro-seed9.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-day-5-intro-seed9.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-trace-1-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-trace-1-seed7.m4a.recipe.json`, CC BY 4.0.
- `bean-sprout-watch-success-1-seed7.m4a` — generated via QLOBE Studio (voice; qwen3-tts-voiceclone), recipe `bean-sprout-watch-success-1-seed7.m4a.recipe.json`, CC BY 4.0.
