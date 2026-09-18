# Family Story Interview — Asset and Provenance Log

The canonical art world is **Watercolor / Storybook**: warm rag paper,
wet-on-wet pigment blooms, colored-pencil edges, stitched cloth, torn paper,
tape, pressed flowers, and gentle wood. Functional copy remains live HTML; only
the exact title is baked into generated art. Runtime media never calls a model
or remote asset service.

## Shipped assets

| Asset group | Authored source and workflow | Runtime treatment | Rights / license |
|---|---|---|---|
| Scrapbook background, three topic cards, child reporter, listening grown-up, title lockup, microphone, camera/notebook, question page, three fabric control plates, memory book, stickers, train, teddy | Five original raster masters generated for this game with **GPT Image 2** through the approved Codex image-generation workflow. Exact production prompts and source filenames are in `assets/source/gpt-image-2/prompts.json`. | Opaque background converted to quality-84 WebP. Foreground objects were cut from the dark production sheets, matted, alpha-QA'd, resized, and optimized into `assets/art/`. | QLOBE Kids project-generated originals; released with this game's assets under CC BY 4.0. |
| Hub tile | **Krea 2** / `krea2-turbo-t2i`, seed 42, 768×640, eight steps, via the approved LAN API. Full prompt and settings are in `assets/source/krea/hub-recipe.json`; source candidate retained at `assets/source/krea/hub-seed42.png`. | Center-cover crop to 640×533, quality-88 progressive JPEG at `../../assets/hub/tiles/family-story-interview.jpg`. | QLOBE Kids project-generated original; CC BY 4.0. |
| Teacher narration, 26 clips | Approved shared teacher reference `shared/assets/refs/voice-teacher.wav`; local **Qwen3 TTS Voice Clone**, deterministic seed ladder 7 → 8 → 9. Seed 7 passed for every shipped line. Exact copy is `assets/audio/lines.json`. | Silence-trimmed, -18 LUFS / -2 dBTP normalized, mono 24 kHz AAC at 96 kbps with fast-start M4A. Runtime manifest is `assets/audio/manifest.json`. | Approved synthetic QLOBE teacher reference; generated for this project; CC BY 4.0. The reference is reused, not copied into this game. |
| Narration verification | Every generated take round-tripped through local **Whisper STT**, English/base, with the intended line as an initial prompt. | `assets/audio/qa.json` records transcript, similarity, coverage, duration, mean level, hashes, seed, and the reference checksum. Result: **26/26 accepted**, zero rejected runtime clips. | Local QA artifact; no personal speech or API address retained. |
| Background music | `shared/assets/music/mug-and-sunbeam.mp3`, the existing recorded QLOBE Kids music library. | Played at 0.12 volume, ducked beneath narration, silenced during family recording/replay. | Existing QLOBE Kids project recording; reused unmodified under the repository asset license. |
| Interface sounds | `shared/js/sfx.js`. | Synthesized locally with Web Audio for tap, save, sticker, and clear feedback. | Code-generated; no sourced recording. |
| HUD art | `shared/assets/ui/btn-home.png`, `btn-back.png`, `btn-sound.png`. | Reused raster home/back/sound controls. | Existing QLOBE Kids project art; CC BY 4.0. |
| Fredoka | `shared/fonts/fredoka-latin-600-normal.woff2`. | Live interface text. | Fredoka by Milena Brandão and Hafontia, SIL OFL 1.1. |
| Family recordings and photos | Created by the player at runtime. | Bounded to 60 seconds / 15 MB source photo, resized locally, stored as Blobs in the game's IndexedDB store, capped at twelve pages. | Private user media. Never committed, uploaded, logged, placed in URLs, or exposed through `QLOBE_DEBUG`. |

## GPT Image 2 production masters

`assets/source/gpt-image-2/prompts.json` is the source of truth. Its five
records preserve the exact model label, purpose, normalized prompt, and source
file. The generated deliverables are:

- `scrapbook-workspace-master.png` — full-bleed open scrapbook on wood, blank
  cream center, watercolor flora/tape/lace, no text.
- `topic-cards-sheet.png` — three distinct portrait question cards plus one
  inclusive child reporter, on a plain charcoal cutting ground.
- `reporter-props-sheet.png` — twelve separated props/control carriers on a
  plain charcoal cutting ground.
- `title-lockup-charcoal.png` — exact, spell-checked title “Family Story
  Interview” on a torn-paper banner.
- `grownup-listener-charcoal.png` — one inclusive, age-ambiguous listening
  grown-up in a tactile oval keepsake medallion, with no text.

The prompts explicitly prohibit extra objects, cropped subjects, watermarks,
and non-title text. They also define the shared cream/teal/coral/honey/leaf
palette and tactile paper/cloth materials used throughout the game.

## Cutter, matte, and alpha QA

The mandatory sheet-cutter step used the repository's
`tools/cut-asset-sheet.py` against all four foreground sources. Dry runs first
confirmed the expected counts (12 props, 4 topic assets, 1 title, 1 grown-up);
accepted bounding boxes and isolated crops are retained under
`assets/source/crops/`.

The production command family was:

```text
python tools/cut-asset-sheet.py --input <master> --output-dir <crop-dir> --expected-count <N> --mask-out <qa-mask>
python games/family-story-interview/tools/produce-art.py matte
python games/family-story-interview/tools/produce-art.py finalize-master
```

Qwen Image Layered was tested first as an approved LAN separation path. Its two
microphone `layer_2` candidates at seeds 42 and 1337 changed the authored
microphone and introduced color/shape damage, so both were rejected and kept
under `assets/source/layered/` with `qa.json`. Shipping art instead preserves
the exact GPT Image 2 pixels and uses the cutter silhouette, flood-fills only
enclosed dark details, feathers alpha by 0.65 px, then runs
`tools/pipeline/cutout_finalize.py`. This avoids a generative redraw.

All eighteen runtime cutouts passed the finalizer. Native magenta-edge
composites live in `assets/source/qa/alpha/`; the complete metrics ledger lives
at `assets/source/matted/qa.json`. The four cutter masks are retained in
`assets/source/qa/`.

## Reproduction

The LAN address and teacher-reference machine path are intentionally absent.
Inject approved local values at run time:

```text
QLOBE_QWEN_URL=<approved LAN base> python games/family-story-interview/tools/produce-art.py hub
QLOBE_QWEN_URL=<approved LAN base> QLOBE_TEACHER_VOICE=<approved reference> python games/family-story-interview/tools/produce-voice.py
python games/family-story-interview/tools/produce-voice.py --check
```

Both scripts are resumable. Voice candidates and per-take recipes are retained
under `assets/source/voice-clone/`; machine-local endpoint and reference paths
are never written.

## Link preview

`assets/og-image.jpg` is a 1200×630 capture of the production question shelf,
made with `tools/pipeline/capture_og_images.mjs`. Regenerate it from the running
game rather than editing it by hand. It is project-generated and CC BY 4.0.

The older tracked `assets/bg.jpg` is a dormant prototype artifact and is not
referenced by the production game.
