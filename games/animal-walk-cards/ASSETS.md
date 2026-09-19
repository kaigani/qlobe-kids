# Animal Motion Cards — asset provenance

All shipped art and audio is committed locally. The game performs no model,
font, image, voice, analytics beyond the platform tag, or other asset request at
runtime. Original game assets are released under CC BY 4.0 with QLOBE Kids.

## Runtime art

| Runtime asset | Source and workflow | Modifications | License / attribution |
| --- | --- | --- | --- |
| `assets/art/meadow-landscape.webp`, `meadow-portrait.webp` | Original GPT Image generation requested as `gpt-image-2` through the authenticated Codex image-generation transport; exact prompts in `assets/source/gpt-image-2/PROMPTS.md` | Responsive companion masters, RGB WebP optimization | CC BY 4.0; QLOBE Kids; no external attribution required |
| `assets/art/title-lockup.webp` | Original GPT Image title generation; source master retained | Spelling reviewed at full size, alpha-trimmed, resized, WebP encoded | CC BY 4.0; QLOBE Kids |
| `assets/art/card-*.webp` | Six-card GPT Image contact sheet | Shared connected-component cutter, verbatim crops, WebP encoding | CC BY 4.0; QLOBE Kids |
| `assets/art/pose-*.webp` | Two identity-guided GPT Image pose sheets using the approved card sheet as reference | Shared cutter, deterministic chroma-key alpha extraction, full magenta QA, WebP encoding | CC BY 4.0; QLOBE Kids |
| `assets/art/kid-*.webp` | Two GPT Image child-demonstrator sheets guided by the approved game art and active-screen mockup | Shared cutter, deterministic chroma-key alpha extraction, full magenta QA, WebP encoding | CC BY 4.0; QLOBE Kids |
| `assets/art/action-button.webp`, `paw-stamp.webp`, `parade-banner.webp` | Original GPT Image UI contact sheet | Shared cutter; Qwen Layered was attempted but failed the alpha gate; accepted assets use deterministic chroma-key fallback; alpha trim and WebP | CC BY 4.0; QLOBE Kids |
| `assets/og-image.jpg` | Deterministic composition of this game’s own accepted meadow, title, and card art | 1200×630 progressive JPEG | CC BY 4.0; QLOBE Kids |
| `../../assets/hub/tiles/animal-walk-cards.jpg` | Local LAN `krea2-turbo-t2i` tactile-diorama take, seed 84, then `qwen-image-edit`, seed 42, with the approved character sheet and meadow as identity/style references | Identity/world alignment, center crop/resize to 640×533, progressive JPEG | CC BY 4.0; QLOBE Kids |

The first Krea seed-42 tile was rejected because it flattened the animal cards
into vector-like graphic faces. Both source takes and the accepted recipe remain
under `assets/source/local-api/hub/` so the selection is auditable. The accepted
Qwen edit preserves the Krea composition while bringing the frog, bear, crab,
felt meadow, stepping stones, and palette into the shipped game world.

## Cutting and alpha QA

The production sheets were cut with the required shared tool and hard expected
counts:

```sh
python tools/cut-asset-sheet.py \
  games/animal-walk-cards/assets/source/gpt-image-2/animal-card-sheet-master.png \
  games/animal-walk-cards/assets/source/cuts/cards \
  --names frog bear crab bunny penguin flamingo \
  --expected-count 6 --padding 8 \
  --debug-mask games/animal-walk-cards/assets/source/cuts/cards-mask.png

python tools/cut-asset-sheet.py \
  games/animal-walk-cards/assets/source/gpt-image-2/poses-frog-bear-crab-master.png \
  games/animal-walk-cards/assets/source/cuts/poses-a \
  --names frog-1 frog-2 frog-3 bear-1 bear-2 bear-3 crab-1 crab-2 crab-3 \
  --expected-count 9 --padding 6 \
  --debug-mask games/animal-walk-cards/assets/source/cuts/poses-a-mask.png

python tools/cut-asset-sheet.py \
  games/animal-walk-cards/assets/source/gpt-image-2/poses-bunny-penguin-flamingo-master.png \
  games/animal-walk-cards/assets/source/cuts/poses-b \
  --names bunny-1 bunny-2 bunny-3 penguin-1 penguin-2 penguin-3 flamingo-1 flamingo-2 flamingo-3 \
  --expected-count 9 --padding 6 \
  --debug-mask games/animal-walk-cards/assets/source/cuts/poses-b-mask.png

python tools/cut-asset-sheet.py \
  games/animal-walk-cards/assets/source/gpt-image-2/kid-poses-frog-bear-crab-master.png \
  games/animal-walk-cards/assets/source/cuts/kid-poses-a \
  --names frog-1 frog-2 frog-3 bear-1 bear-2 bear-3 crab-1 crab-2 crab-3 \
  --expected-count 9 --padding 6 \
  --debug-mask games/animal-walk-cards/assets/source/qa/kid-poses-a-mask.png

python tools/cut-asset-sheet.py \
  games/animal-walk-cards/assets/source/gpt-image-2/kid-poses-bunny-penguin-flamingo-master.png \
  games/animal-walk-cards/assets/source/cuts/kid-poses-b \
  --names bunny-1 bunny-2 bunny-3 penguin-1 penguin-2 penguin-3 flamingo-1 flamingo-2 flamingo-3 \
  --expected-count 9 --padding 6 \
  --debug-mask games/animal-walk-cards/assets/source/qa/kid-poses-b-mask.png

python tools/cut-asset-sheet.py \
  games/animal-walk-cards/assets/source/gpt-image-2/ui-sheet-master.png \
  games/animal-walk-cards/assets/source/cuts/ui \
  --names action-button paw-stamp parade-banner \
  --expected-count 3 --padding 14 \
  --debug-mask games/animal-walk-cards/assets/source/cuts/ui-mask.png
```

Every call emitted `boxes.json` with the source hash, detection parameters,
pixel boxes, and normalized boxes. `tools/build-assets.py` recreates the runtime
WebP files, magenta alpha-QA composites, OG image, and hub tile from accepted
sources. The title and every transparent runtime asset were inspected at full
useful size; the animal ears, feet, claws, wings, eye stalks, and flamingo legs
remain inside their crops.

### Rejected Qwen Layered pass

The three cut UI objects were submitted independently to the authorized local
`qwen-image-layered` workflow with `layers=2`, and only `layer_2` was retrieved.
The finalizer rejected every result as 100% transparent. Those files are
retained under `assets/source/layered/`; they are not runtime inputs. The
accepted fallback uses the uniform-magenta GPT sheet plus the image skill’s
deterministic chroma-key remover. See
`assets/source/local-api/FAILED-JOBS.md`.

## Recorded teacher voice

`assets/audio/lines.json` is the verbatim 19-line script. The reproducible
pipeline is:

1. local LAN `qwen3-tts-voiceclone`, seed 7 first, using the approved
   `shared/assets/refs/voice-teacher.wav` reference;
2. silence trim and EBU-style loudness normalization;
3. mono 24 kHz AAC/M4A at 80 kbps with `+faststart`;
4. one batched `whisper-stt` transcript pass after all TTS jobs;
5. only transcript-approved files enter `assets/audio/manifest.json`.

Run from the repository root:

```sh
python games/animal-walk-cards/tools/generate-voice.py --force
```

Raw FLAC, transcript JSON, and the endpoint-redacted production receipt live in
`assets/source/local-api/voice/`. Any rejected or missing key intentionally
falls back to device speech through `shared/js/voice-clips.js`.

## Source inventory

- `assets/source/gpt-image-2/`: accepted image masters and exact prompts
- `assets/source/cuts/`: verbatim crops, masks, and cutter manifests
- `assets/source/finalized/`: accepted deterministic alpha intermediates
- `assets/source/qa/`: magenta-background edge checks
- `assets/source/local-api/hub/`: Krea masters and recipe
- `assets/source/local-api/voice/`: raw voice, Whisper transcripts, receipt
- `assets/source/layered/`: rejected fully transparent Qwen Layered results

No third-party trademark, stock asset, or attribution-bearing download is used.
