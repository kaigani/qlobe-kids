# Local Nature Guide Assets

All child-facing art is project-local raster artwork. The shipped game performs no model or LAN request at runtime. Source masters, cutter receipts, local-API intermediates, alpha-QA composites, generation prompts, and the machine-readable recipe are retained under `assets/source/`.

## Production chain

| Stage | Tool/workflow | Role | Seed / QA |
|---|---|---|---|
| Style masters | OpenAI built-in image generation on the user-requested GPT Image 2 path | Suri pose sheet, specimen sheet, title, journal, UI carriers, track ribbons, and trail-hub plate | Visual selection and targeted background-only corrections |
| Sheet cutting | `tools/cut-asset-sheet.py` | Required connected-component cutter for 6 Suri poses, 15 specimens, 9 UI carriers, 3 trails, and 1 title | Every `--expected-count` passed; `boxes.json` and masks retained |
| Scene adaptation | LAN `qwen-image-edit` | Forest, bird, and track scene plates anchored to the accepted trail-hub style | Seed 42; first animal-contaminated pass rejected and rerun with corrected negative constraints |
| Alpha separation study | LAN `qwen-image-layered` | Produce and retain a two-layer candidate for every accepted cutter crop | Two layers, seed 42; candidates retained under `assets/source/layered/` |
| Deterministic finalization | `tools/pipeline/cutout_finalize.py` | Select the largest connected source subject, build an exact-pixel matte, alpha-bounds/fringe-QA it, crop, pad, resize, and export WebP | The Layered endpoint returned inconsistent ordering/alpha across subjects, so no redraw was shipped; magenta composites and `cutout-report.json` prove the selected source-faithful mattes |
| Hub tile | LAN `krea2-turbo-t2i` | Separate platform Toy-table 6:5 diorama | Seed 42; final 640×533 progressive JPEG |
| Teacher narration | LAN `qwen3-tts-voiceclone` | Friendly teacher voice cloned from the approved platform reference | Seeds 7/8/9 ladder; loudnorm AAC; every line must pass Whisper similarity ≥0.90 |
| Voice QA | LAN `whisper-stt` + ffprobe/ffmpeg | Transcript, duration, level, checksum, and manifest validation | Fail-closed: an incomplete batch publishes an empty manifest |

The complete normalized accepted prompt set is in [`assets/source/PROMPTS.md`](assets/source/PROMPTS.md). The reproducible workflow summary is in `assets/source/recipe.json`.

Final alpha composites and rendered screens passed adversarial visual review at 1180×820 landscape, 820×1180 portrait, and 1180×520 wide-short viewports. The production Chrome suite also verifies every authored trace path, fresh-page journal persistence, recorded narration, reduced motion, target sizing, and zero runtime remote requests.

## Runtime art inventory

### Background plates

- `assets/backgrounds/trail-hub.webp` — splash/trail map.
- `assets/backgrounds/forest-clearing.webp` — Forest Finds.
- `assets/backgrounds/bird-meadow.webp` — Bird Listening.
- `assets/backgrounds/muddy-trail.webp` — Track Finder.
- `assets/backgrounds/journal-glow.webp` — Nature Journal reward.

### Suri

- `assets/characters/suri-welcome.webp`
- `assets/characters/suri-point.webp`
- `assets/characters/suri-listen.webp`
- `assets/characters/suri-trace.webp`
- `assets/characters/suri-journal.webp`
- `assets/characters/suri-celebrate.webp`

### Specimens and tracks

- Forest: `pinecone.webp`, `maple-leaf.webp`, `river-stone.webp`, `acorn.webp`, `fern.webp`, `feather.webp`.
- Birds: `chickadee.webp`, `robin.webp`, `woodpecker.webp`.
- Animals: `rabbit.webp`, `deer.webp`, `raccoon.webp`.
- Trace ribbons: `track-rabbit.webp`, `track-deer.webp`, `track-raccoon.webp`.
- Production extras/source family: badge, binoculars, magnifier.

### Authored UI carriers

- `title.webp`
- `mode-forest.webp`, `mode-birds.webp`, `mode-tracks.webp`
- `button-wide.webp`, `prompt-plate.webp`, `journal-tab.webp`
- `sticker-carrier.webp`, `discovery-glow.webp`, `trace-brush.webp`, `badge.webp`
- `journal-open.webp` is a prepared copy of the journal plate for compatible UI consumption.

HTML supplies dynamic labels and accessible names on top of these raster carriers. CSS supplies only layout, focus treatment, and motion; canvas supplies only the child’s transient trace stroke.

## Audio

- `assets/audio/lines.json` is the single narration script and Web Speech fallback source.
- `assets/audio/*.m4a` are mono 48 kHz AAC teacher-voice clips normalized to −18 LUFS / −2 dBTP.
- `assets/audio/manifest.json` is published only when every line passes synthesis, audio, and Whisper checks.
- `assets/source/voice/qa-transcripts.json` records intended text, heard text, similarity, duration, level, checksum, reference checksum, seed, and timestamp without persisting the LAN endpoint or local reference path.
- Bird calls are three short WebAudio patterns created locally at runtime; they are functional auditory stimuli, not downloaded recordings.

## Hub and sharing

| Asset | Source | Creator | License | Modifications |
|---|---|---|---|---|
| `../../assets/hub/tiles/local-nature-guide.jpg` | Krea 2 generation from the prompt in `assets/source/PROMPTS.md` | QLOBE Kids / OpenAI-assisted production | CC BY 4.0 | Resize to 640×533, JPEG optimization |
| `assets/og-image.jpg` | Screenshot of the game’s own production splash captured by `tools/pipeline/capture_og_images.mjs` | QLOBE Kids | CC BY 4.0 | Deterministic 1200×630 capture |

## License and attribution

Project-authored/generated art and voice are released with this game under CC BY 4.0. Code is MIT. No third-party stock, emoji artwork, SVG illustration, remote image, or runtime-generated model output is shipped.
