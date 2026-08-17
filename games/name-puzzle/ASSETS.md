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
| `assets/characters/{belle,emma,luna,sofia,aria,hazel,nora,lily,ellie,lucy,liam,noah,james,henry,lucas,mateo,levi,jack,owen,ezra}.webp` | Twenty GPT Image 2 masters in `assets/source/gpt-image-2/*-master.png`, then LAN `qwen-image-layered` `layer_2` at seed 42 | Generated for QLOBE Kids; project artwork, CC BY 4.0 | Raw authoritative RGBA layers are retained in `assets/source/layered/`. `tools/finalize-assets.py` only trims, fits to 640×720, and encodes WebP quality 90; it never flood-fills, chroma-keys, or reconstructs a silhouette. |
| `assets/art/classroom.webp` | `assets/source/gpt-image-2/classroom-master.png`; GPT Image 2 | Generated for QLOBE Kids; project artwork, CC BY 4.0 | Full-bleed felt classroom, WebP quality 84; broad calm center preserved for gameplay. |
| `assets/ui/title.webp` | `title-master.png`; GPT Image 2, then Qwen `layer_2` | Generated for QLOBE Kids; project artwork, CC BY 4.0 | Authoritative Layered alpha fitted to 900×600. |
| Eight `assets/ui/letter-*.webp` tiles | `letter-kit-master.png`; GPT Image 2 4×2 contact sheet, deterministically cropped, background-presented by Qwen Image Edit, then eight Qwen Image Layered `layer_2` jobs | Generated for QLOBE Kids; project artwork, CC BY 4.0 | Each tile owns an authoritative Layered alpha and is fitted to a 300×300 canvas. Image Edit changes only the model presentation; no local matte is inferred. Runtime letters remain real HTML. |
| Six `assets/ui/panel-*.webp` cards | `panel-kit-master.png`; GPT Image 2 3×2 contact sheet, then Qwen `layer_2` | Generated for QLOBE Kids; project artwork, CC BY 4.0 | The authoritative transparent sheet is deterministically cropped after Qwen extraction; cells are fitted to 560×360 canvases. Runtime labels remain real HTML. |
| `assets/ui/name-board.webp` | `name-board-master.png`; GPT Image 2, then Qwen `layer_2` | Generated for QLOBE Kids; project artwork, CC BY 4.0 | Authoritative Layered alpha fitted to 1200×1200. |
| `assets/ui/star-medal.webp` | `star-medal-master.png`; GPT Image 2, then Qwen `layer_2` | Generated for QLOBE Kids; project artwork, CC BY 4.0 | Fitted to 340×420; also serves as the neutral missing-character fallback. |
| `assets/ui/hud-{home,back,sound}.webp`, `pager-{prev,next}.webp` | `navigation-kit-master.png`; GPT Image 2 5×1 contact sheet, then Qwen `layer_2` | Generated for QLOBE Kids; project artwork, CC BY 4.0 | The five disconnected objects are bounded from Qwen's returned alpha, without changing it, so no neighboring control enters a crop; controls are fitted to 300×300. These deliberately replace glossy shared controls while preserving the shared semantic HUD buttons. |
| `../../assets/hub/tiles/name-puzzle.jpg` | `assets/source/gpt-image-2/hub-tile-master.png`; GPT Image 2 image-to-image composition from the finished Belle and classroom masters | Generated for QLOBE Kids; project artwork, CC BY 4.0 | Manually reviewed for identity, exact BELLE spelling, thumbnail clarity, and 6:5 safe area, then deliberately promoted to the curator-owned hub path at 640×533 JPEG. No bulk pipeline writes this file. |

Belle's private user-supplied visual reference was used only for subject and
outfit identity during the authorized transformation. It is not copied into
the repository or shipped by the game. The resulting Belle master preserves
the requested brown skin, black curly updo and ringlets, large brown eyes,
jeweled rainbow crown, rainbow dress, and crystal staff in stitched felt form.

### Layer and alpha evidence

`python3 tools/extract-characters.py` submits one LAN `qwen-image-layered` job
for each of 20 characters, three single UI masters, eight letter tiles, and the
panel and navigation sheets. The letter cells are cropped and background-
presented by Qwen Image Edit first because whole-sheet decompositions were
rejected as near-empty; the other sheets are cropped only after Layered returns
their alpha. It downloads only `output=layer_2` and validates transparent
corners, subject coverage, opaque core, aspect ratio, and foreground drift. It
retains the 33 raw layers plus a model receipt in
`assets/source/qwen-layer-report.json`; rejected candidates and their reasons
are retained separately in `assets/source/qwen-layer-rejections.json`. The
characters and whole UI masters start at seed 42. Individual letters use the
bounded seed ladder 1337, 42, then 9001. `qwen-jobs.json` contains only the
accepted job/seed pair bound into each layer report; `qwen-pending-jobs.json`
must be empty for `--check` to pass. `tools/finalize-assets.py` then
recreates all 43 game-local runtime image files and writes:

- `assets/source/qa-layered/contact-sheet.png`, every cutout displayed over a
  saturated magenta checker;
- `assets/source/qa-layered/alpha-report.json`, fixed dimensions, extraction
  workflow, matte authority, and alpha statistics for every runtime file.

Qwen `layer_2` is the sole matte authority. A returned layer that fails machine
or full-size magenta review is rejected and regenerated; there is no flood-fill
or local silhouette-repair fallback.

## Narration and sound

| Asset | Source / tool | Processing and QA | License / attribution |
|---|---|---|---|
| `assets/audio/*.m4a` (45 clips), `lines.json`, `manifest.json`, `qa.json` | Exact authored lines in `lines.json`; LAN `qwen3-tts-voiceclone` using the approved synthetic platform teacher-narrator reference | AAC mono 48 kHz at 96 kbps, `+faststart`, loudness normalized to -18 LUFS. Every take is duration/volume/hash checked and round-tripped through LAN `whisper-stt`; seeds 7, 8, and 9 form the retry ladder. Shipped result: 45/45 accepted at seed 7, transcript ratio 1.0, duration 1.278–5.600 s, mean volume -20.7 to -17.9 dB. | The approved reference is the synthetic project voice documented in `shared/assets/refs/ASSETS.md`; its checksum, never its machine path, is retained in every QA receipt. |
| Correct-letter sounds | `shared/assets/audio/fragments/{a-z}.m4a` through `shared/js/content.js` | Existing shared recorded alphabet fragment library | See shared asset log. |
| Interface feedback and celebration | `shared/js/sfx.js`, `shared/js/celebrate.js` | Synthesized at runtime with Web Audio / DOM confetti; reduced-motion path is respected | QLOBE Kids code, MIT. |
| Missing-clip fallback | `shared/js/voice-clips.js` → `shared/js/speech.js` | Device speech is selected only when a manifest entry is absent or a committed recording cannot play | Device/browser supplied; no bundled recording. |

`tools/generate-voice.py --check` accepts only the Qwen teacher-narrator engine
and its 64-character reference checksum. System speech is a runtime recovery
path for a missing/unplayable clip, never an acceptable source for the recorded
production pack.

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
python3 tools/extract-characters.py --workers 4
python3 tools/extract-characters.py --check
python3 tools/finalize-assets.py
python3 tools/generate-voice.py --force --workers 3
python3 tools/generate-voice.py --check
node tools/qa.mjs --base http://127.0.0.1:8000
```

The LAN endpoint and teacher reference resolve from explicit flags, environment
variables, or git-ignored `tools/state/local.json`. Neither machine-specific
value is written to committed receipts.
