# Freeze Focus Dance assets

All shipped visual media is local, committed, and available offline. Original
generated sources are retained under `assets/source/`; authoring-time model calls
never run in the game. Original game art and its derivatives are licensed CC BY
4.0 as part of QLOBE Kids. Code-driven layout, masks, transforms, and motion are
used only to compose the authored raster pieces.

## GPT Image 2 claymation system

The built-in GPT Image 2 authoring workflow produced one coherent stop-motion
clay forest, Pip pose family, animal family, mode cards, and physical UI props.
Source outputs were copied without overwrite into `assets/source/gpt-image-2/`.
The image-generation service did not expose reproducible seeds; the committed
source PNGs are therefore the canonical masters.

| Runtime assets | Committed source | Processing and QA |
| --- | --- | --- |
| `assets/scenes/forest-day.webp`, `forest-night.webp` | `assets/source/gpt-image-2/forest-{day,night}.png` | 1448×1086 RGB masters resized to 1600×1200; WebP q92; day/night geometry checked side by side |
| `assets/ui/title.webp` | `assets/source/gpt-image-2/title-chroma.png` | chroma removal, alpha trim, 1200×460 transparent carrier; exact spelling checked at full size |
| `assets/ui/freeze.webp` | `assets/source/gpt-image-2/freeze-chroma.png` | source-color chroma mask, alpha trim, 1050×340; cream carrier holes repaired from the original RGB master; exact `FREEZE!` spelling checked |
| `assets/characters/pip-{dance,freeze,cheer,wide,tall,tiny,star}.webp` | `assets/source/gpt-image-2/pip-poses-chroma.png` | exact 3×2 sheet cells, local chroma removal, alpha trim/pad, normalized 720×820; `pip-star` intentionally reuses the accepted wide pose |
| `assets/animals/{owl,fox,raccoon,bunny}-{hidden,reveal}.webp` | `assets/source/gpt-image-2/animals-chroma.png` | exact 4×2 cells; hidden 360×360 and reveal 560×640 transparent carriers |
| `assets/ui/mode-{dance,lookout,statues}.webp` | `assets/source/gpt-image-2/mode-cards-chroma.png` | exact three-column cells, alpha trim/pad to 520×420 |
| `assets/ui/{camera,skip-star,mirror-frame,prompt-plaque,action-button,focus-star,snowflake,music-note,sparkle-cluster}.webp` | `assets/source/gpt-image-2/ui-props-chroma.png` | exact 3×3 cells; normalized transparent carriers; note recolored from low-alpha black to opaque purple clay; sparkle haze below alpha 120 removed |
| `assets/qa/contact-magenta.webp`, `report.json` | all runtime raster families | deterministic saturated-magenta contact sheet plus dimensions, alpha occupancy, border, and corner checks |

`tools/process-art.py` is the deterministic production path. It uses the
installed image-generation chroma helper, Pillow-only finishing, fixed grid
coordinates, Lanczos scaling, and WebP q92. Chroma intermediates remain under
`assets/source/processed/`; later stages never overwrite source masters.

### Final prompt families

The prompts used the image-generation skill's `stylized-concept`,
`logo-brand`, and reference-edit patterns. The production intent is preserved
here because the source images are committed.

**Day forest stage**

> A polished 4:3 stop-motion polymer-clay forest dance stage framed by two
> ancient sculpted trees, layered handmade leaves and flowers, a broad warm
> clay clearing, blue sky, and a readable hollow in the right tree. Cheerful
> preschool color, fingerprints and tool marks, soft daylight, calm open
> center; no characters, words, symbols, interface, or flat vector shapes.

**Night reward stage**

> Preserve the exact accepted day-stage geometry and camera. Transform only
> the lighting into a celebratory night performance with deep blue ambience,
> amber center light, and cyan/magenta side light on the trees. Keep the center
> open; no characters, text, badges, confetti, or interface.

**Pip pose sheet**

> Exact 3×2 contact sheet on flat chroma: the same small sky-blue clay child
> creature in every cell, with three rounded head bumps, huge brown-and-white
> eyes, orange bow tie, green-and-yellow jacket, red pants, and orange shoes.
> Poses in reading order: joyful dance kick, one-foot freeze, two-fist cheer,
> wide star pose, tall stretch, tiny crouch. Complete uncropped body, coherent
> proportions and lighting, no labels, floor, cast shadow, or extra props.

**Forest friend sheet**

> Exact 4×2 claymation contact sheet on flat chroma. Columns: owl, fox,
> raccoon, bunny. Top row: each friend subtly tucked into a matching tree
> hollow, leafy nook, rock nook, or flower nook. Bottom row: the same friend
> fully revealed, smiling and celebrating. Complete isolated subjects,
> consistent warm handmade clay, no words, UI, cropping, or extra animals.

**Title and freeze lockups**

> Handmade cream clay carriers on flat chroma with exact spelling. Title:
> `FREEZE / FOCUS / DANCE` in sky blue, sunny yellow, and coral clay with tiny
> music-note and star accents. Cue: one large exact `FREEZE!` in icy blue clay.
> Thick rounded preschool lettering, sculpted depth, contact shadow, no other
> words or objects.

**Mode cards**

> Exact three-column clay picture-card sheet on flat chroma, no words. Card 1:
> Pip dancing on a star stage with music note and snowflake. Card 2: Pip peeking
> around a tree toward a little owl. Card 3: Pip holding a wide statue beside a
> golden star under colored spotlights. Thick irregular cream clay frames,
> complete isolated cards, consistent Pip and forest world.

**UI props**

> Exact 3×3 clay-prop sheet on flat chroma: blue camera medallion, yellow skip
> star medallion, twisted multicolor magic-mirror frame; long cream prompt
> plaque, coral action plaque, golden Focus Star; icy snowflake, purple music
> note, five tiny colorful sparkles. No words, labels, hands, extra props,
> cropping, or cast shadow outside each item.

## Hub tile

| Runtime asset | Accepted source | Workflow and curation |
| --- | --- | --- |
| `../../assets/hub/tiles/freeze-focus-dance.jpg` | `assets/source/assembled/freeze-focus-dance-hub-tile.png` | `tools/build-hub-tile.py` composes the exact accepted forest, Pip dance pose, owl, Focus Star, and snowflake rasters at 768×640, then emits the reviewed 640×533 q92 JPEG |

The hub tile contains no title or UI and uses the same runtime asset bytes as
the game, preventing mascot drift between catalog and play. Its soft shadows,
crop, and JPEG are deterministic and reproducible from committed sources.

The earlier QLOBE Studio / Krea attempts remain under
`assets/source/studio/freeze-focus-dance-hub-tile/` with their complete text-only
recipe. Seed 42 was rejected because Pip became a generic blue blob. Seed 1337
restored the requested motifs but still rendered a smoother pastel toy mascot
with different cheeks, head tufts, jacket construction, and lighting. The final
blind cross-surface gate rejected that identity split, so its recipe is marked
`failed-qa` and it is not shipped.

## Narration and music

| Asset or service | Source | Runtime behavior |
| --- | --- | --- |
| `assets/audio/lines.json` | 38 game-local authored English prompts | canonical script passed to `voice-clips.js` |
| `assets/audio/manifest.json` | game-local recorded-clip manifest | populated only by accepted voice-clone outputs; device Web Speech remains the non-blocking fallback |
| `assets/audio/qa.json` | authoring-time transcript gate | records accepted/rejected Qwen seeds and Whisper transcript ratios; never loaded at runtime |
| `tools/generate-voice.py` | QLOBE LAN Qwen3 voice clone + Whisper QA | defaults to the committed synthetic platform reference `shared/assets/refs/voice-teacher.wav`; seeds 7/8/9, transcript gate, AAC/M4A output; no runtime network |
| `tools/check-voice.mjs` | deterministic release validator | proves exact key coverage, local filenames, script/byte hashes, mono AAC format, duration, loudness/no-clipping envelope, transcript acceptance, and absence of stray clips |
| `shared/js/music.js` + shared instrument manifest | QLOBE Kids local sampled instruments | deterministic four-bar `Pip Clay Hop`; no streamed audio |
| `shared/js/sfx.js` | QLOBE Kids WebAudio synthesis | local tick, whoosh, sparkle, and celebration cues |

The recorded narration batch is deliberately fail-closed: no clip is entered
in the runtime manifest until synthesis, encoding, and transcript QA succeed.
The game remains playable if a clip is absent because spoken feedback never
gates progress.

The platform reference is a CC BY 4.0 synthetic voice designed with
`qwen3-tts-voicedesign` at seed 7. It is not a recording or likeness of a
person. The generator will not read a machine-local teacher-reference path;
using any different reference requires an explicit `--voice-ref` argument.

The accepted production batch contains 38/38 clips (98.42 seconds,
1,273,731 bytes). Every line passed at seed 7 with normalized Whisper ratio
1.0. `node games/freeze-focus-dance/tools/check-voice.mjs` independently
re-hashes and probes the final M4A files, and the real-Chrome QA starts decoded
clips from all three modes with sound unmuted. The runtime still retains exact
Web Speech fallback for device resilience, but no authored line depends on it
in the shipped batch.

## Shared runtime assets

| Shared asset | Creator / license | Use |
| --- | --- | --- |
| Fredoka SemiBold | Milena Brandão and Hafontia, SIL OFL 1.1 | functional HTML text |
| QLOBE HUD home/back/sound buttons | QLOBE Kids, CC BY 4.0 | platform navigation and prompt replay, unmodified |
| camera-motion module | QLOBE Kids, MIT | private 64×48 local frame differencing; no recording, recognition, persistence, or upload |

## Link preview

`assets/og-image.jpg` is the 1200×630 generated screenshot of this game's own
finished splash screen. Regenerate it from a locally served repo with
`node tools/pipeline/capture_og_images.mjs --only freeze-focus-dance --force`;
never retouch it by hand.

The retired `assets/bg.jpg` predates this custom build and is not referenced by
runtime code.
