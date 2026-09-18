# Nature Scavenger Hunt assets

All game-specific art is raster. CSS supplies layout, typography, focus,
shadows, and motion only; it does not draw the forest, character, treasures,
clipboard, plaques, badges, or celebration art. There are no third-party
runtime assets and no runtime calls to generation services.

## Runtime inventory

| Family | Runtime files | Source / production route |
| --- | --- | --- |
| Forest world | `assets/backgrounds/forest.webp` | gpt-image-2 master, 4:3 crop and WebP encode |
| Quest interface | `assets/ui/clipboard.webp`, `mission-plaque.webp`, `action-button.webp`, `quest-card.webp`, `check-badge.webp`, `found-halo.webp` | gpt-image-2 contact sheet; project cutter; charcoal matte; alpha QA |
| Title | `assets/ui/title.webp` | gpt-image-2 isolated title; original alpha retained and normalized |
| Guide | `assets/guide/hedgehog.webp` | gpt-image-2 isolated character; project cutter and alpha QA |
| Nature treasures | twelve files in `assets/items/` | gpt-image-2 4x3 contact sheet; project cutter and alpha QA |
| Hub tile | `../../assets/hub/tiles/nature-scavenger-hunt.jpg` | QLOBE Studio `menu-game-tile` template; Krea 2; seed 42; hand accepted |
| Narration | 28 M4A files in `assets/audio/` | Qwen3 TTS voice clone from the approved internal teacher reference; Whisper transcript QA |
| Shared controls / sounds | platform HUD and SFX loaded through shared modules | QLOBE Kids platform assets |
| Social preview | `assets/og-image.jpg` | captured from the final rendered splash screen |

The shipped object family is: leaf, stone, berries, dewdrop, flower, pinecone,
feather, twig, acorn, mushroom, shell, and paired seed. The hunt uses this
larger visual vocabulary to make its seeded three-clue decks feel different
across replays.

## GPT image production

The five master files are in `assets/source/gpt-image-2/`. They were generated
with **gpt-image-2 through Codex's built-in image-generation execution mode**,
using the concept mockups as references. The complete prompt set and reference
lineage are preserved in `assets/source/PROMPTS.md`.

`tools/produce-assets.py` owns the deterministic tail. It invokes the required
`tools/cut-asset-sheet.py` for both sheets, retains `boxes.json` and debug
masks, builds the composite halo from its verified pieces, runs the shared
cutout finalizer, writes magenta inspection plates, and encodes runtime WebP.
The title deliberately bypasses a second charcoal-key pass because its GPT
crop already carries useful alpha; that prevents transparent black RGB from
becoming a rectangular smoke matte.

## Qwen Image Layered acceptance decision

The authorized local `qwen-image-layered` workflow was exercised against the
clipboard with the asset-specific prompt recorded in `PROMPTS.md`. Its top
layer reduced alpha to the range 0-5 and visibly replaced the crisp tactile
surface with a dim, blurred veil. That candidate is retained at
`assets/source/layered/clipboard.layer2.png` as rejection evidence; it is not
shipped. Visual quality took precedence, so the approved runtime UI uses the
faithful deterministic charcoal extraction in `assets/source/keyed/`.
`assets/source/production-receipt.json` records that selection.

## Hub tile

The hub source and accepted QLOBE recipe are archived in
`assets/source/local-api/hub/`. The template, Toy Table style suffix, exact
prompt, seed, and 768x640 generation dimensions are in `recipe.json`.
`tools/produce-hub-tile.py` produces the exact 640x533 progressive JPEG used by
the platform. The image passed manual review for a strong child-readable
silhouette, one focal green leaf, an unmistakable blank clipboard, and no
accidental text.

## Narration

`assets/audio/lines.json` is the verbatim 28-line script.
`tools/produce-voice.py` performs the reproducible production tail:

1. create speech through the authorized local Qwen3 TTS voice-clone workflow,
   using `shared/assets/refs/voice-teacher.wav`;
2. trim silence, loudness-normalize, and encode mono 24 kHz AAC/M4A;
3. transcribe each clip through the local Whisper workflow;
4. admit only transcript-approved clips to `assets/audio/manifest.json`.

All 28 shipped lines passed transcript QA. Scores and transcripts are in
`assets/audio/qa.json`; the endpoint-free production receipt and raw local
working files are under `assets/source/local-api/voice/`. At runtime,
`shared/js/voice-clips.js` still provides the platform speech fallback if a
recording cannot play on a device.

## Rights and provenance

- Game-specific GPT, Krea, Qwen, and derived assets were created for this
  project under the user's explicit generation approval.
- The teacher voice reference and shared QLOBE controls/SFX are internal
  project assets.
- No stock image, external font, web video, or third-party audio is included.
- Google Analytics is the platform-standard telemetry exception; it is not a
  game asset and the game remains fully playable when it is unavailable.
