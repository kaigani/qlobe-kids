# Asset log — Name Puzzle

Name Puzzle ships a game-local raster felt world: 20 unique reveal characters,
one classroom stage, 22 UI art files, one curated hub tile, and 45 recorded
narration clips. No visible game artwork is drawn with CSS, SVG, emoji, or a
runtime model. HTML remains responsible for accessible labels and letter glyphs.

The exact final image prompts, source paths, generation execution IDs, and local
layer-extraction prompt are recorded in `assets/source/PROMPTS.md`.

## Authored image assets

| Runtime asset | Source master / method | Creator / license | Processing and QA |
|---|---|---|---|
| `assets/characters/{belle,emma,luna,sofia,aria,hazel,nora,lily,ellie,lucy,liam,noah,james,henry,lucas,mateo,levi,jack,owen,ezra}.webp` | Twenty GPT Image 2 masters in `assets/source/gpt-image-2/*-master.png`, generated with the built-in image-generation tool | Generated for QLOBE Kids; project artwork, CC BY 4.0 | `tools/finalize-assets.py` removes the authored charcoal extraction matte, trims, fits to 640×720, and writes WebP quality 90. Belle uses an all-region charcoal key so enclosed gaps between curls remain transparent. |
| `assets/art/classroom.webp` | `assets/source/gpt-image-2/classroom-master.png`; GPT Image 2 | Generated for QLOBE Kids; project artwork, CC BY 4.0 | Full-bleed felt classroom, WebP quality 84; broad calm center preserved for gameplay. |
| `assets/ui/title.webp` | `title-master.png`; GPT Image 2 | Generated for QLOBE Kids; project artwork, CC BY 4.0 | Isolated raster felt title, fitted to 900×600. |
| Eight `assets/ui/letter-*.webp` tiles | `letter-kit-master.png`; GPT Image 2 4×2 contact sheet | Generated for QLOBE Kids; project artwork, CC BY 4.0 | Deterministically split in documented row-major order and fitted to 300×300 alpha canvases. Runtime letters remain real HTML. |
| Six `assets/ui/panel-*.webp` cards | `panel-kit-master.png`; GPT Image 2 3×2 contact sheet | Generated for QLOBE Kids; project artwork, CC BY 4.0 | Deterministically split and fitted to 560×360 alpha canvases. Runtime labels remain real HTML. |
| `assets/ui/name-board.webp` | `name-board-master.png`; GPT Image 2 | Generated for QLOBE Kids; project artwork, CC BY 4.0 | Charcoal matte removed and board fitted to 1200×1200. |
| `assets/ui/star-medal.webp` | `star-medal-master.png`; GPT Image 2 | Generated for QLOBE Kids; project artwork, CC BY 4.0 | Fitted to 340×420; also serves as the neutral missing-character fallback. |
| `assets/ui/hud-{home,back,sound}.webp`, `pager-{prev,next}.webp` | `navigation-kit-master.png`; GPT Image 2 5×1 contact sheet | Generated for QLOBE Kids; project artwork, CC BY 4.0 | The five whole authored objects are segmented by alpha-connected component, sorted left-to-right, and fitted to 300×300; this avoids neighboring contact-sheet bleed. These deliberately replace glossy shared controls inside this tactile world while preserving the shared semantic HUD buttons. |
| `../../assets/hub/tiles/name-puzzle.jpg` | `assets/source/gpt-image-2/hub-tile-master.png`; GPT Image 2 image-to-image composition from the finished Belle and classroom masters | Generated for QLOBE Kids; project artwork, CC BY 4.0 | Manually reviewed for identity, exact BELLE spelling, thumbnail clarity, and 6:5 safe area, then deliberately promoted to the curator-owned hub path at 640×533 JPEG. No bulk pipeline writes this file. |

Belle's private user-supplied visual reference was used only for subject and
outfit identity during the authorized transformation. It is not copied into
the repository or shipped by the game. The resulting Belle master preserves
the requested brown skin, black curly updo and ringlets, large brown eyes,
jeweled rainbow crown, rainbow dress, and crystal staff in stitched felt form.

### Matte and alpha evidence

`python3 tools/finalize-assets.py` recreates all 43 game-local runtime image
files and writes:

- `assets/source/qa-local/contact-sheet.png`, every cutout displayed over a
  saturated magenta checker;
- `assets/source/qa-local/alpha-report.json`, fixed dimensions plus alpha
  minimum/maximum and transparent-pixel counts for every character and UI file.

The production session also prepared `tools/extract-characters.py` for the
approved LAN `qwen-image-layered` workflow (two layers, seed 42). The managed
environment did not authorize uploading the private reference-derived masters
to that LAN destination, so no Qwen layer result is claimed or shipped. The
deterministic local charcoal-matte finalizer was the production extraction path.

## Narration and sound

| Asset | Source / tool | Processing and QA | License / attribution |
|---|---|---|---|
| `assets/audio/*.m4a` (45 clips), `lines.json`, `manifest.json`, `qa.json` | Exact authored lines in `lines.json`; rendered fully on-device with the installed macOS Samantha system voice by `tools/generate-voice.py --offline-samantha` | AAC mono 48 kHz at 96 kbps, `+faststart`, loudness normalized to -18 LUFS. Every clip is duration/volume/hash checked and round-tripped through the installed CPU-only whisper.cpp small model. Result: 45/45 accepted, normalized transcript ratio 1.0, duration range 0.705–3.500 s. Manifest publication fails closed if any line is rejected. | No external reference recording is incorporated; the source is a local OS speech component. |
| Correct-letter sounds | `shared/assets/audio/fragments/{a-z}.m4a` through `shared/js/content.js` | Existing shared recorded alphabet fragment library | See shared asset log. |
| Interface feedback and celebration | `shared/js/sfx.js`, `shared/js/celebrate.js` | Synthesized at runtime with Web Audio / DOM confetti; reduced-motion path is respected | QLOBE Kids code, MIT. |
| Missing-clip fallback | `shared/js/voice-clips.js` → `shared/js/speech.js` | Device speech is selected only when a manifest entry is absent or a committed recording cannot play | Device/browser supplied; no bundled recording. |

The preferred platform-standard Qwen teacher-voice plus Whisper LAN pipeline is
also implemented in `tools/generate-voice.py`. Its committed synthetic teacher
reference and authored text were not uploaded in this production session because
the managed egress guard required destination-specific user approval. The local
Samantha + local whisper.cpp receipts above are the actual shipped provenance.

## Shared presentation assets

| Asset | Source | Creator / license | Use |
|---|---|---|---|
| `shared/fonts/fredoka-latin-600-normal.woff2` | Fontsource package for Fredoka | Milena Brandão and Hafontia; SIL OFL 1.1 | All real HTML labels and letter glyphs. |
| Shared reset/screen/HUD/input modules | `shared/css/base.css`, `shared/js/` | QLOBE Kids; MIT | Semantic page shell, audio unlock, screen routing, accessible HUD controls, tap/drag input, timers, debug hook. |

## Link preview

| Asset | Source | Creator / license | Reproduction |
|---|---|---|---|
| `assets/og-image.jpg` | Purpose-composed GPT Image 2 social preview from `assets/source/gpt-image-2/og-promo-master.png`, referencing the finished hub composition and exact felt title | QLOBE Kids; CC BY 4.0 | Reviewed for exact title/BELLE spelling, Belle identity, social-card hierarchy, and encoded at 1200×630 JPEG. The generic screenshot-capture pipeline must not overwrite this authored preview. |

## Reproduction commands

Run from `games/name-puzzle/` unless noted:

```sh
python3 tools/finalize-assets.py
python3 tools/generate-voice.py --offline-samantha --workers 3 \
  --whisper-cli /absolute/path/to/whisper-cli \
  --whisper-model /absolute/path/to/ggml-model-whisper-small.bin
python3 tools/generate-voice.py --check
node tools/qa.mjs --base http://127.0.0.1:8000
```

Both offline Whisper paths are required. The tool supplies conventional
machine-local defaults when present, validates them before touching the
published manifest, and accepts the explicit flags above for every other
machine. With destination-specific permission for the configured LAN teacher
reference upload, omit `--offline-samantha` to use the Qwen/Whisper path.
