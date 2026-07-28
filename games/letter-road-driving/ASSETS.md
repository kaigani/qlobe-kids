# Asset log — Letter Road Driving

All original QLOBE game art and dialogue assets are CC BY 4.0. Runtime is fully
offline. Authoring recipes and QA artifacts are retained under `assets/source/`
and `assets/production/`.

| Asset | Source / workflow | Creator | License | Modifications / QA |
|---|---|---|---|---|
| `assets/hero-car.png` | gpt-image-2 built-in generation; prompt below | OpenAI + QLOBE Kids direction | CC BY 4.0 project asset | Qwen Image Layered `layer_2`; Studio cutout finalizer; alpha floor 4; bbox + 16 px; max 640; magenta composite checked |
| `assets/driver-car.png` | gpt-image-2 edit from hero identity/style; prompt below | OpenAI + QLOBE Kids direction | CC BY 4.0 project asset | Top-down game variant; Qwen Image Layered; same cutout QA |
| `assets/source/*-gpt-image-2.png` | Raw gpt-image-2 dark-ground renders | OpenAI + QLOBE Kids direction | CC BY 4.0 project asset | Retained as regeneration lineage |
| `assets/production/*.layer2.png` | `qwen-image-layered`, seed 42 | Local Qwen workflow | CC BY 4.0 project asset | True-alpha intermediate |
| `assets/production/*.qa-magenta.png` | `tools/pipeline/cutout_finalize.py` | QLOBE Kids | CC BY 4.0 project asset | Human silhouette review composite |
| `assets/letter-road-world-v2.jpg` | gpt-image-2 built-in generation using the supplied UI mockup as a style/composition reference; prompt below | OpenAI + QLOBE Kids direction | CC BY 4.0 project asset | 16:9 scene-only plate; no baked text/UI; JPEG quality 88; landscape and portrait crop checked in real Chrome |
| `assets/bg.jpg` | Existing QLOBE storybook-neighborhood backdrop | QLOBE Kids | CC BY 4.0 | Retained as an unused source-era asset |
| `assets/audio/*.m4a` | `qwen3-tts-voiceclone`, seeds 7→9, committed teacher reference | QLOBE Kids local pipeline | CC BY 4.0 project asset | AAC 96 kbps; each line transcribed with `whisper-stt`; results in `qa.json` |
| `shared/assets/refs/voice-teacher.wav` | Shared committed teacher reference | QLOBE Kids | CC BY 4.0 | Authoring input only; not duplicated |
| Fredoka SemiBold | Fontsource / Google Fonts | Milena Brandão & Hafontia | SIL OFL 1.1 | Reused unmodified |
| Shared HUD buttons | QLOBE shared UI library | QLOBE Kids | CC BY 4.0 | Reused unmodified |
| Road geometry and effects | Procedural Pixi/WebAudio code | QLOBE Kids | MIT | No external files |

## gpt-image-2 prompts

### Hero car

Single friendly compact rounded red cartoon car on uniform `#202428`, expressive
windshield eyes and grille smile, yellow lights, tactile painted 3D papercraft
finish, three-quarter front view facing right, generous padding, no shadow,
floor, scenery, road, text, logo, or watermark.

### Driver car variant

Preserve the hero car’s identity, palette, materials, and tactile style; render
one complete symmetrical 90-degree bird’s-eye view pointing upward on uniform
`#202428`, with no perspective angle, shadow, floor, road, text, or watermark.

### Storybook countryside world v2

Premium soft-3D preschool driving-game countryside, closely following the
supplied mockup’s color richness, warm sunny atmosphere, toy-like rendering,
and composition language. Bright sky and clouds, rolling green hills, cream
cottages with coral roofs at the outer thirds, trees, fences, flowers, sparkles,
and two pale-gold roads curving into a generous open center. Exact 16:9
edge-to-edge background plate with no car, title, words, letters, buttons,
icons, UI panels, people, border, or watermark.

## Qwen Layered extraction prompt

“Separate the exact friendly red cartoon car from the dark charcoal background.
Layer 1 is only a solid background. Layer 2 is only the complete car with true
transparent alpha, including every tire, mirror, roof light, and clean
antialiased edge. Keep the car identical to the input. No shadow, no floor, no
added objects.”

## Optional sourced sound replacements

The game currently uses synthesized `vroom` and `honk` effects. If sourced clips
are added later, use:

- a warm toy-motor rise shorter than 350 ms, mono, no brand-identifiable engine;
- a soft two-note “beep-beep” shorter than 500 ms, no traffic aggression.

Log creator, source URL, license, and edits here before shipping either file.
