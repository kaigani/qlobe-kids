# Playdough Letter Factory assets

All shipped media is committed and runs offline. Original generated sources are retained under `assets/source/`; generated assets and documentation are CC BY 4.0 unless a shared asset's own row says otherwise.

## GPT Image 2 claymation system

The built-in GPT Image 2 workflow produced the environment, exact-spelling title art, original factory guide, and three material-matched foreground props. Full final prompts and deterministic processing notes are recorded in `assets/source/gpt-image-2/prompts.json`.

| Runtime asset | Source | Processing | QA |
|---|---|---|---|
| `assets/scenes/factory.webp` | `assets/source/gpt-image-2/factory-backdrop.png` | resized 1448×1086 → 1280×960; WebP q88 | 114 KB; no text/UI/characters; calm overlay center |
| `assets/ui/title.webp` | `assets/source/gpt-image-2/title-chroma.png` | magenta removed with installed imagegen helper; WebP q90 | exact “Playdough Letter Factory” spelling checked at full size; alpha edge checked |
| `assets/ui/mascot.webp` | `assets/source/gpt-image-2/mascot-chroma.png` | magenta removed with installed imagegen helper; resized to 720 px wide; WebP q88 | one complete character; anatomy, crop, and alpha edge checked |
| `assets/ui/dough-tub.webp` | `assets/source/gpt-image-2/foreground-tub-chroma.png` | factory backdrop used as style reference; Qwen Layered seed 42 `layer_2`; alpha trim/pad to 362×420; WebP q88 | clean magenta composite; 30.554% opaque core; runtime hue variants visually checked |
| `assets/ui/rolling-pin.webp` | `assets/source/gpt-image-2/foreground-roller-chroma.png` | factory backdrop used as style reference; Qwen Layered seed 42 `layer_2`; alpha trim/pad to 520×144; WebP q88 | clean magenta composite; 1.228% partial-alpha band |
| `assets/ui/letter-tile.webp` | `assets/source/gpt-image-2/foreground-tile-chroma.png` | factory backdrop used as style reference; Qwen Layered seed 42 `layer_2`; alpha trim/pad to 420×420; WebP q88 | blank center preserved; clean magenta composite; exact runtime letters remain HTML |

For both transparent assets, background removal used `remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill`. The shipped WebPs preserve alpha; their larger `title-alpha.png` and `mascot-alpha.png` masters remain beside the sources in `assets/source/gpt-image-2/`.

The foreground pass uses `tools/extract-foreground-props.py` with the configured local `qwen-image-layered` service. `layer_2` is the true-alpha subject, finalized with `tools/pipeline/cutout_finalize.py`; every large source, layered result, final PNG master, and saturated-magenta QA composite is retained beside the prompts. Runtime CSS uses the tub as one authored material master with deterministic hue variants, and reuses the blank tile as the physical carrier for exact dynamic HTML letters.

## QLOBE Studio / Krea hub tile

| Runtime asset | Source/recipe | Workflow | QA |
|---|---|---|---|
| `../../assets/hub/tiles/playdough-letter-factory.jpg` | `assets/source/krea/hub-seed42.png`; `hub-seed42.recipe.json` | Studio `menu-game-tile`, `krea2-turbo-t2i`, Toy Table style, seed 42, 768×640 → curated 640×533 JPEG | accepted in Studio; no title/UI/text; visually recognizable tubs, roller, press, conveyor, and dough rope |

The source recipe freezes this prompt:

> A charming miniature clay playdough workshop staged as toy objects: five open tubs of bright red, yellow, blue, green, and purple dough on a mint conveyor belt, a chunky cream rolling pin, a small teal dough press, rounded gears, and one freshly rolled red dough rope curling across a cream work tray. No people and no interface.

Studio appends the proven Toy Table style suffix. Assignment into the hub tile folder was hand-curated, per the template's `assignHint`.

## Recorded guide voice

Every clip was created by QLOBE Studio with `qwen3-tts-voiceclone`, encoded to 96 kbps AAC/M4A with `+faststart`, and transcribed by `whisper-stt`. Each `<key>.m4a.recipe.json` records the frozen text, seed, symbolic approved teacher-voice reference, and transcript QA.

| Key | Duration | Seed | Transcript QA |
|---|---:|---:|---|
| `welcome` | 3.115 s | 7 | 0.974, accepted (“Play Doh” normalization only) |
| `color` | 1.677 s | 7 | 1.000 |
| `roll` | 2.316 s | 7 | 1.000 |
| `trace` (`playdough-trace-impress.m4a`) | 1.677 s | 7 | 1.000 |
| `nudge` | 2.157 s | 7 | 1.000 |
| `letter-done` | 2.077 s | 7 | 1.000 |
| `word-cat` | 3.675 s | 8 | 1.000; seed 7 rejected because Whisper heard “it” instead of “cat” |
| `word-dog` | 2.876 s | 7 | 1.000 |
| `word-sun` | 2.556 s | 7 | 0.952, intended word and letter sequence preserved |
| `word-done` | 3.355 s | 7 | 1.000 |
| `free` | 3.035 s | 7 | 1.000 |
| `again` | 1.837 s | 7 | 1.000 |

`assets/audio/manifest.json` provides durations and `assets/audio/lines.json` is the spoken source of truth. `voice-clips.js` supplies Web Speech fallback.
The updated trace cue, “Press along the letter groove,” was regenerated through the Studio `character-voice-line` template after the interaction changed from a dotted trace to a recessed dough impression; its accepted recipe is `assets/audio/playdough-trace-impress.m4a.recipe.json`.

## Shared assets

| Asset | Creator/source | License | Use/modification |
|---|---|---|---|
| Fredoka SemiBold | Milena Brandão & Hafontia via Fontsource | SIL OFL 1.1 | UI/runtime text, unmodified |
| `shared/assets/ui/btn-home.png`, `btn-back.png`, `btn-sound.png` | QLOBE Kids shared UI | CC BY 4.0 | platform navigation, unmodified |
| `shared/assets/objects/apple.webp`, `cat.webp`, `dog.webp`, `lion.webp`, `octopus.webp`, `sun.webp`, `turtle.webp` | QLOBE Kids shared object library | CC BY 4.0 | phonics/word picture clues, unmodified |
| shared phonics and “is for” recordings resolved by `content.js` | QLOBE Kids shared audio library | project-recorded / CC BY 4.0 | letter payoff, unmodified |
| Runtime SFX | WebAudio synthesis in `shared/js/sfx.js` | N/A | no file asset |

## Link preview

`assets/og-image.jpg` is a generated screenshot of the game's own splash at 1200×630. Regenerate it with `node tools/pipeline/capture_og_images.mjs --only playdough-letter-factory --force`; do not retouch it.
