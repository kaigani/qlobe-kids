# Asset Log — Then & Now (2026-09-20 rebuild)

Art world: **Watercolor / Storybook**. All game-facing illustrations are original raster assets created for this game; no browser emoji, SVG, canvas drawing, or CSS-drawn child-facing artwork is used. Generated assets are CC BY 4.0 for this project. Full prompts and acceptance notes are in `assets/source/PROMPTS.md`.

## GPT Image 2 authored art

The platform image-generation skill (GPT Image 2) used the concept overview and three UI mockups from `01-game-concepts/then-and-now/output/ui-mockups/` as style/composition references.

| Runtime assets | Accepted source | Notes |
|---|---|---|
| Six Then cards | `assets/source/gpt-image-2/then-cards-sheet.png` | Candle, quill, carriage, letter, phonograph, washboard; exact 2×3 charcoal-ground sheet |
| Six Now cards | `assets/source/gpt-image-2/now-cards-sheet.png` | Lightbulb, keyboard, car, smartphone, headphones, washing machine; exact 2×3 sheet |
| Splash environment | `assets/source/gpt-image-2/splash-background.png` | Bright history reading nook with an open blank book |
| Landscape play book | `assets/source/gpt-image-2/book-background.png` | Facing cream pages with blue/lavender page grammar |
| Portrait play book | `assets/source/gpt-image-2/book-background-portrait.png` | Stacked scrapbook panels for portrait composition |
| Reward environment | `assets/source/gpt-image-2/gallery-background.png` | Deep-blue watercolor star path with a clear center |
| Exact title lockup | `assets/source/gpt-image-2/title-lockup.png` | “THEN & NOW”, visually checked for spelling |
| UI source sheet | `assets/source/gpt-image-2/ui-sheet.png` | Initial six-part watercolor UI study; superseded for cutting by the Qwen edit below |

Runtime WebPs live under `assets/art/backgrounds/`, `assets/art/cards/`, and `assets/art/ui/`. Card and UI crops were detected with the required `tools/cut-asset-sheet.py`; cutter manifests and mask previews are kept in `assets/source/cuts/` and `assets/source/qa/`. A deterministic edge-connected alpha matte preserves the exact accepted pixels while removing only the plain sheet ground. `assets/source/qa/produced/contact-sheet.jpg` is the magenta alpha review sheet.

## Local image workflows

| Workflow | Asset | Result |
|---|---|---|
| Qwen Image Edit, seed 42 | `assets/source/local-api/qwen-edit/ui-separated-seed42.png` | Accepted. Rearranged the six UI pieces into a strict, non-touching 2×3 cutter sheet without changing their painted identity. |
| Qwen Image Layered, seed 42 | `assets/source/local-api/layered/` | Evaluated adversarially. Several layer_2 results omitted essential subject parts (for example, retaining an inkpot but dropping its quill), so those outputs were rejected for runtime use and retained as QA evidence. |
| Local edge-connected matte | all accepted cutter crops | Accepted after alpha statistics and magenta composite review; exact source pixels preserved. |
| Krea 2 Turbo T2I, seed 42 | `assets/source/local-api/hub/then-now-krea-seed-42.*` | Curated 640×533 catalog tile installed at `assets/hub/tiles/then-now-sort.jpg`. |

Asset production is resumable through:

```powershell
python games/then-now-sort/tools/produce-art.py --matte-only --skip-hub --force
python games/then-now-sort/tools/produce-art.py --skip-layered --install-hub
```

## Voice and sound

- Narration is generated from the rights-cleared `shared/assets/refs/voice-teacher.wav` reference with local `qwen3-tts-voiceclone`, using seed ladder 7/8/9.
- Every accepted line is checked with local `whisper-stt`; `assets/audio/voice/qa-report.json` records the intended line, transcript, similarity, duration, level, seed, and acceptance.
- Final batch: **32/32 accepted**, all exact normalized transcripts (ratio and coverage 1.0); 30 takes use seed 7 and two retries use seed 8. Durations are 0.600–5.472 s and measured mean level is −21.7 to −18.2 dB.
- `assets/audio/manifest.json` selects recorded MP3 clips; `assets/audio/lines.json` is the matching Web Speech fallback table.
- Each clip has a `.recipe.json` sidecar with symbolic voice provenance and generation/verification parameters.
- Runtime SFX are synthesized by `shared/js/sfx.js`. The licensed platform track `shared/assets/music/gentle-country-morning.mp3` is reused unmodified at low volume with narration ducking.

Regenerate or verify voice with:

```powershell
python games/then-now-sort/tools/generate-voice.py --workers 3
python games/then-now-sort/tools/generate-voice.py --check
```

## Shared / reused

| Asset | Source | License | Use |
|---|---|---|---|
| Fredoka SemiBold | `shared/fonts/fredoka-latin-600-normal.woff2` | SIL OFL 1.1 | Display type |
| Home, back, and sound controls | `shared/assets/ui/` | CC BY 4.0 | Platform HUD |
| Gentle Country Morning | `shared/assets/music/gentle-country-morning.mp3` | QLOBE shared library | Background music |
| Teacher voice reference | `shared/assets/refs/voice-teacher.wav` | Project rights-cleared reference | Local voice clone only; not shipped again |

## Link preview

`assets/og-image.jpg` is a 1200×630 capture derived from this game's final splash composition. Regenerate after splash changes; do not hand-draw or substitute generic artwork.
