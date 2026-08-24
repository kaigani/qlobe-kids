# Number Sense Kitchen — asset record

All shipped visual media is project-authored raster art. The game makes no
runtime request to an authoring or generation service.

## Visual production

| Asset family | Shipped target | Source and processing | QA / status |
| --- | --- | --- | --- |
| Kitchen plate, Toy contact sheet, title lockup | `assets/bg/`, `assets/world/`, `assets/ui/` | Built-in GPT Image 2 source prompts: `assets/source/gpt-image-2-prompts.json`; immutable masters: `assets/source/gpt-image-2/{kitchen-source,toy-contact-sheet,title-source}.png` | Deterministic slice, alpha trim/pad/resize/WebP; magenta composites in `assets/source/qa/` |
| Toy objects and UI | `assets/world/`, `assets/ui/` | A single full-sheet Qwen Image Layered (`layer_2`) extraction was planned, but its job stalled. The inspected, flat-charcoal contact-sheet cells therefore used deterministic contiguous-ground keying; no redraw was substituted. | Every final has a magenta alpha composite; count clusters and fruit groups are deterministic compositions of accepted source sprites. |
| Ravi chef | `assets/characters/ravi-chef.webp` | Qwen Image Edit seed 42, conditioned on shared Ravi and the Toy contact sheet, was rejected in art review for identity drift. The accepted canonical full-body QLOBE Ravi from Chocolate Chip Count was reused, alpha-trimmed, and resized. | Ravi magenta composite retained; rejected Qwen source remains in `assets/source/local-api/edit/`. |
| Hub tile | `../../assets/hub/tiles/number-sense-kitchen.jpg` | Krea 2 `menu-game-tile` / `toy-table` grammar, seed 42; recipe: `assets/source/local-api/hub/recipe.json`. | Curated 640×533 JPEG; no baked title or UI. |
| OG image | generated at release | Deterministic 1200×630 capture of the final production splash, not a crop of the hub tile. | Must be checked after production deploy. |

Creator: QLOBE Kids project-authored media with GPT Image 2 and approved local
authoring workflows. Project license: CC BY 4.0.

## Audio and privacy

`assets/audio/lines.json` is the exact spoken-script source. Recorded Qwen3
voice-clone delivery is intentionally all-or-none: the current beta has **0 of
32** accepted clips, no runtime `.m4a` files, and an empty `manifest.json`.
One isolated line exhausted seeds 7, 8, and 9 with three bounded service stalls;
the truthful result is in `assets/audio/qa.json`. Earlier unverified clips are
source-only under `assets/source/local-api/voice/unverified/` and are never
loaded by the game. Runtime uses local device Web Speech with the same exact
lines until a complete, Whisper-validated (ratio ≥0.92) 32-line voice set is
available.

The approved shared BGM is `shared/assets/music/whimsical-toy-workshop.mp3`;
it is a local project asset, starts only after a real child gesture, and ducks
under narration. The game requests no microphone, camera, account, or
child-authored data and emits no game-specific analytics events. It retains
the platform's shared page-view analytics tag. Generation services are
authoring-time only.
