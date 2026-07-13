# Asset Log — Sand Tray Letters

## Generated material art

The three selection-card images were generated with the built-in GPT Image 2
workflow on 2026-07-13, then resized to 640 × 640 PNG for game delivery.

| Asset | Use | Prompt summary |
|---|---|---|
| `assets/materials/golden-sand.png` | Golden Sand card | Friendly centered mound of fine golden play sand on a sunny-yellow background; tactile polished children’s game art; no text or extra objects. |
| `assets/materials/white-salt.png` | White Salt card | Rounded glass jar of coarse salt crystals with a wooden lid on turquoise; tactile polished children’s game art; no text or branding. |
| `assets/materials/soft-flour.png` | Soft Flour card | Rounded wooden bowl of powdery white flour on violet; tactile polished children’s game art; no text or branding. |

Original built-in outputs remain in Codex’s generated-image store. The project
copies above are the production assets consumed by `index.html`.

## Procedural game visuals

The live tray does not use a static texture. `js/game.js` generates material
gradients and thousands of deterministic grain marks on an offscreen canvas,
then renders dynamic grooves, displaced edge grains, guides, progress points,
and the turquoise underlayer in real time.

## Shared assets

| Asset | Source | License |
|---|---|---|
| Fredoka SemiBold | `shared/fonts/fredoka-latin-600-normal.woff2` | SIL OFL 1.1 |
| Home, back, and sound buttons | `shared/assets/ui/` | QLOBE Kids shared library, CC BY 4.0 |
| Sound effects | `shared/js/sfx.js` | Synthesized at runtime |
| Teacher voice fallback | `shared/js/speech.js` | Device speech synthesis |

## External concept reference

- `sand-tray-letters/brief.md`
- `sand-tray-letters/dreamina-2026-07-12-7073-Tablet game demo for ages 5-6. Fast adve....mp4`
- `sand-tray-letters/output/ui-mockups/01-welcome.png` through `05-success-shake-reset.png`

These references live in the QLOBE concepts project and are not runtime assets.
