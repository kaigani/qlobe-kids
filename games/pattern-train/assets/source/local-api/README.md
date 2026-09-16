# Local model production notes

Private host details are intentionally excluded. These calls used the approved
QLOBE local workflow wrapper and are reproducible by workflow name, prompt,
input asset, and seed through the Studio/local pipeline.

## Curated hub tile

`krea2/hub-tile-master.png`

- Workflow: `krea2-turbo-t2i`
- Prompt: “Premium preschool game library cover for Pattern Train in a tactile
  hand-painted wooden Toy world. A cheerful coral-red locomotive pulls three
  teal open wagons through a sunny miniature meadow; wagons carry a large red
  triangle, blue square, red triangle, blue square repeating pattern. Low
  three-quarter side view, big readable silhouettes, visible wood grain, soft
  studio light, powder-blue sky and rounded clouds, jubilant but uncluttered,
  centered safe composition for a 640 by 533 catalog tile. No words, letters,
  UI, people, logos, or watermark.”
- Result: strong composition and style; the generated cargo sequence was not
  semantically reliable enough to ship unchanged.

`krea2/hub-tile-qwen-edit.png`

- Workflow: `qwen-image-edit`
- Input: `krea2/hub-tile-master.png`
- Prompt: “Keep this image, train, camera, lighting, wooden Toy style, meadow,
  and composition identical. Correct only the wagon cargo so it reads clearly
  from left to right as a repeating pattern: red triangle, blue square, red
  triangle, blue square. Make every cargo piece large, simple, and fully
  visible. Do not add text, symbols, UI, people, or extra train cars.”
- Result: accepted and cropped by `tools/finalize-art.py` to
  `assets/hub/tiles/pattern-train.jpg`.

## Qwen Image Layered evaluation

The GPT Image 2 contact sheets were also evaluated with
`qwen-image-layered` as a possible automated extraction route. The requested
top layers were the exact six rail/UI objects, exact eight token objects, and
exact six mode/effect objects from their respective transparent sheets. The
model returned transparent layers but generatively dropped or merged multiple
objects. Those candidates are retained under `layered/` as rejection evidence
and are not runtime inputs. The accepted route is the deterministic repository
cutter, whose source hashes and crop coordinates are committed in each
`boxes.json`.

## Voice

`games/pattern-train/tools/generate-voice.py` batches all configured dialogue
through `qwen3-tts-voiceclone` with seed ladder 7, 8, 9 and the committed
platform teacher reference. Every candidate is encoded to mono MP3, normalized,
then checked with `whisper-stt` (`base`, English, intended line as prompt).
Only a complete batch publishes `assets/audio/manifest.json`; exact transcripts,
similarity ratios, durations, level checks, hashes, seeds, and the non-reversible
reference checksum live in `assets/audio/qa-report.json`.
