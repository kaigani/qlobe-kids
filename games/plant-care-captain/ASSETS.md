# Plant Care Captain assets

Plant Care Captain is a fully authored raster-art game. All child-facing world
art—the greenhouse, plants, tools, effects, title, cards, plaques, buttons,
progress carriers, gauge, and reward—is rendered artwork. CSS is limited to
layout, hit areas, text, masking, and motion; it does not draw game objects.

## Runtime inventory

| Runtime asset | Source and production path | Notes |
|---|---|---|
| `assets/backgrounds/greenhouse.webp` | `assets/source/gpt-image-2/greenhouse-workbench-master.png` | GPT Image 2 clay greenhouse master; empty central workbench, 1440×1080 WebP |
| `assets/backgrounds/greenhouse-thriving.webp` | GPT Image 2 master → local `qwen-image-edit` seed 42 (rejected: added a generic plant) → seed 1337 corrective edit | Accepted final has a warm sunrise and an empty round clay display stage |
| `assets/plants/{sunflower,pea,basil}-{dry,watered,misted,bloom}.webp` | Three GPT Image 2 2×2 identity sheets → repository cutter; pea sheet also passed through local `qwen-image-layered` | Twelve stable plant/pot states. Magenta contact sheet: `assets/source/qa/contact/plant-states.jpg` |
| `assets/tools/*.webp`, `assets/effects/*.webp` | GPT Image 2 tool/effect sheet → repository cutter → shared finalizer | Four tools plus six feedback/reward effects. The three diagonal water drops are isolated from the cutter’s overlapping rectangular bboxes by retaining the intended alpha component |
| `assets/ui/*.webp` | GPT Image 2 title and carrier masters → repository cutter → shared finalizer | The opaque carrier sheet uses a deterministic sampled-neutral-matte extraction so the accepted pixels remain the authored master. Grouped and individual Qwen Layered attempts are retained but rejected because they dropped pieces, lost an ornament, or returned nearly empty alpha |
| `assets/audio/*.m4a` | Approved teacher reference → local `qwen3-tts-voiceclone` → AAC 64 kbps M4A → local `whisper-stt` small/en | Fourteen recorded lines, all transcript-approved. Web Speech is an error fallback only |
| `../../assets/hub/tiles/plant-care-captain.jpg` | Local `krea2-turbo-t2i`, menu-game-tile prompt, seed 42, 768×640 → centered 640×533 JPEG | Separate catalog composition: happy sunflower and chunky blue watering can; no title text |
| `assets/og-image.jpg` | Deterministic composition of the accepted thriving background, title, and three bloom sprites | 1200×630 social preview |

Runtime art is approximately 1.1 MB excluding voice; the two backgrounds are
about 220 KB combined. No model or LAN service is called by the production
game.

## GPT Image 2 masters

The built-in image generation tool used `gpt-image-2`. The accepted masters are
under `assets/source/gpt-image-2/`; prompts and acceptance notes are frozen in
`assets/source/PROMPTS.md`. The model does not expose a reproducible seed. The
visual anchor was the platform’s established handcrafted clay world, with the
concept mockups and brief as the composition authority.

Generated families:

- one empty 4:3 greenhouse workbench;
- three four-state plant sheets with stable pot/face identity;
- one ten-component tools/effects sheet;
- one six-component UI-carrier sheet;
- one correctly spelled transparent title lockup.

## Cutter and alpha QA

Every sheet was located with the repository cutter before runtime processing.
Representative commands (the checked-in `boxes.json` files hold the exact
coordinates and source hashes):

```powershell
python tools/cut-asset-sheet.py games/plant-care-captain/assets/source/gpt-image-2/sunflower-states-sheet.png games/plant-care-captain/assets/source/cuts/sunflower --names dry watered misted bloom --expected-count 4 --debug-mask games/plant-care-captain/assets/source/cuts/sunflower-mask.png
python tools/cut-asset-sheet.py games/plant-care-captain/assets/source/gpt-image-2/tools-effects-sheet.png games/plant-care-captain/assets/source/cuts/tools --names watering-can mister shears dry-leaf water-drop-1 water-drop-2 water-drop-3 mist-cloud glint rosette --expected-count 10 --debug-mask games/plant-care-captain/assets/source/cuts/tools-mask.png
python tools/cut-asset-sheet.py games/plant-care-captain/assets/source/gpt-image-2/ui-carriers-sheet.png games/plant-care-captain/assets/source/cuts/ui-opaque --names choice-card instruction-plaque action-button progress-tray intro-cloud moisture-gauge --expected-count 6 --debug-mask games/plant-care-captain/assets/source/cuts/ui-opaque-mask.png
```

`tools/process-assets.py` then runs every accepted cutout through
`tools/pipeline/cutout_finalize.py`, writes magenta composites under
`assets/source/qa/magenta/`, encodes runtime WebP, builds contact sheets, the
hub tile, the social card, and `assets/manifest.json` with hashes and rejected
candidates. GPT Image 2 uses alpha 254 for many visually opaque pixels; the
script snaps only alpha 240–254 to 255 so the shared exact-255 QA gate can
measure the opaque core while preserving the antialiased middle band.

```powershell
python games/plant-care-captain/tools/process-assets.py
```

## LAN authoring receipts

`assets/source/recipes.json` records workflow IDs, prompts, seeds, and job IDs
without recording the private service host.

- Krea 2: catalog tile, accepted at seed 42.
- Qwen Image Edit: thriving light/state continuity. Seed 42 is retained as a
  visual rejection; the seed-1337 correction is accepted.
- Qwen Image Layered: pea-state subject extraction accepted. The grouped UI
  attempt and six individual UI attempts are retained as rejected evidence.
- Qwen TTS voice clone: fourteen teacher lines use seed 7 except
  `water-intro`. Whisper heard an extra leading word in its seed-7 take, so
  that take and transcript are retained and the exact seed-8 retry ships.
- Whisper STT: `small`, English, normalized punctuation/case comparison;
  final result 14/14 accepted. `assets/audio/qa.json` and each
  `assets/source/local-api/voice/<key>/whisper-response.json` preserve results.

`tools/finalize-voice.py` verifies all clips with `ffprobe`, hashes the encoded
files, verifies the canonical transcripts, and writes the runtime-compatible
`file`/`dur` manifest:

```powershell
python games/plant-care-captain/tools/finalize-voice.py
```

## License and attribution

The game-specific generated art and audio were produced for QLOBE Kids and are
licensed with the repository asset bundle under CC BY 4.0. Code is MIT. The
teacher reference is the project’s approved, rights-cleared synthetic voice at
`shared/assets/refs/voice-teacher.wav`; its machine location is never stored in
the recipes. No third-party downloaded imagery or sound is shipped.
