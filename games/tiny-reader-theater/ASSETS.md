# Asset Log — Tiny Reader Theater

This file supersedes the earlier prototype-era `ASSETS.md`, which documented a different,
never-implemented stub game at this same path (choose-one "Fill the Story" / "Act It Out",
shared object cards + Web Speech only, no baked art). That stub is superseded in full by this
build (word-by-word tap-to-read branching puppet theater) — see `game-design.md` for the full
departure note.

All new art and audio below is original output of the built-in image generator or local models
(ComfyUI wrapper on the LAN, `qwen-image-edit` / `qwen-image-layered` /
`qwen3-tts-voiceclone`) run against this project's own prompts and reference images, or
promoted/reused from this repo's own shared library. It is CC BY 4.0, matching the rest of the
QLOBE Kids art library, except where noted.

## Backdrops — promoted from `games/puppet-retell/` into `shared/assets/backdrops/`

| Asset | Source | Action | License |
|---|---|---|---|
| `shared/assets/backdrops/forest-cottage.jpg` | `games/puppet-retell/assets/bg/forest-cottage.jpg` | Copied byte-identical (verified via `diff`), not moved — `games/puppet-retell/` left untouched | CC BY 4.0 |
| `shared/assets/backdrops/enchanted-castle.jpg` | `games/puppet-retell/assets/bg/enchanted-castle.jpg` | Copied byte-identical, not moved | CC BY 4.0 |
| `shared/assets/backdrops/moon-adventure.jpg` | `games/puppet-retell/assets/bg/moon-adventure.jpg` | Copied byte-identical, not moved | CC BY 4.0 |

Promoted to `shared/` per the platform's shared-first rule now that a second game (this one)
uses them — Forest is the live backdrop for the shipped Forest tree; Castle and Outer Space are
wired for the locked "coming soon" settings per `config.json`'s `settings[].locked` flag and are
not yet content-complete.

## UI hero art (`games/tiny-reader-theater/assets/ui/`)

Extracted, not generated from scratch, from the three already-approved Tiny Reader Theater UI
mockups (`01-story-library.png`, `03-branch-choice.png`, `04-story-complete.png` in
`../../01-game-concepts/tiny-reader-theater/output/ui-mockups/`), which themselves were produced
against the real puppet-theater backdrop and rigged-character references — cropping/isolating
preserves style fidelity for free per the platform's mockup-asset-extraction pattern.

Workflow: local `qwen-image-edit` (`POST /workflows/qwen-image-edit?sync=true`) with an "Isolate
just the &lt;subject&gt;, cropped tight, on a plain white background, no other elements, no text
added, preserve the exact felt/stitched illustration style and colors from the source" prompt per
asset:

- `title-lockup.png` — isolates the curtain-banner title lockup from `01-story-library.png`
  (visually spell-checked at full size, no malformed letters).
- `world-forest.png`, `world-castle.png`, `world-outer-space.png` — isolate each world-select
  card's illustration only (label chrome and name text dropped) from `01-story-library.png`.
- `choice-map.png`, `choice-bird.png`, `choice-door.png` — isolate each Beginning choice card's
  illustration only (text label dropped, per-card colored border frame kept since it's art, not
  text) from `03-branch-choice.png`.
- `ending-stamp-filled.png`, `ending-stamp-outline.png` — isolate the two tree-stamp states from
  the endings tracker in `04-story-complete.png`.

The original isolated files came back on flat white with no transparency. This visual pass
preserves those originals in `assets/source/opaque/`, then submits every title/world/choice/stamp
source to `qwen-image-layered` (`layers=2`, seed 42) and fetches the true-alpha `layer_2` into
`assets/source/layered/`. Runtime no longer uses white-key blending. The resumable extraction,
alpha cleanup, exact-source-RGB preservation, trim, sizing, and magenta QA are implemented in
`tools/extract-ui-layers.py`; QA artifacts and the alpha report live in `assets/source/qa/`.
Runtime copies are alpha WebP (`assets/ui/*.webp`, quality 90); PNG masters remain under
`assets/source/` for lossless reprocessing.

The source images remain visually identical to the approved mockup extractions. Qwen's semantic
alpha occasionally classified a dark foreground tree or card border as background, so the
finalizer conservatively unions `layer_2` with the edge-connected flat-background silhouette.
This prevents subject loss; a fully opaque failed `layer_2` falls back to that deterministic
silhouette. Every final is reviewed on saturated magenta rather than accepted from a file-mode
check alone.

Style: felt/stitched puppet-theater world, matching `docs/art-direction.md`'s "Puppet / Cozy felt
fabric" canonical label. License: CC BY 4.0, derived from this project's own approved concept art.

**Maintainer note:** `games/tiny-reader-theater/assets/ui/` was untracked before this pass. Its
original opaque PNGs are now retained under `assets/source/opaque/`; runtime uses only the new
alpha WebP files, so the earlier extraction pass remains recoverable and comparable.

## Rendered UI furniture and setup theater

`assets/ui/setup-stage.webp` and the six reusable pieces under `assets/ui-kit/` were generated
with the built-in image-generation tool against the approved setup/read/complete screens as
style references. They supply the visible identity for the setup proscenium, cast carriers,
word tiles, label plaques, action buttons, story banners, and endings tracker. Live HTML remains
responsible for text, state, focus, and hit targets. The UI-kit contact sheet was extracted with
the same Qwen `layer_2` workflow and magenta QA as the other transparent UI art.

Exact prompts and source-to-runtime paths are recorded in `assets/source/PROMPTS.md`.

## Choice-card art — middle-chapter branches (9 files)

`choice-dig-log.png`, `choice-hop-mud.png`, `choice-climb-tree.png`, `choice-make-nest.png`,
`choice-sing-bird.png`, `choice-share-nut.png`, `choice-down-steps.png`, `choice-peek-den.png`,
`choice-follow-bugs.png`

Generated via local ComfyUI `qwen-image-edit` workflow (LAN model host), image-edited from the
game's own approved choice cards as style/identity references — `choice-map.png` for the three
middle-1 (map-branch) cards, `choice-bird.png` for the three middle-2 (bird-branch) cards,
`choice-door.png` for the three middle-3 (door-branch) cards — to keep each branch's card family
visibly continuous with its parent choice.

Prompt pattern: "Replace the [map/bird/door] with [scene-specific subject drawn from the
story-choice label], keeping this exact felt/stitched illustration style, card composition,
lighting, and color language. Isolated card art only, no text, no UI chrome."

All 9 accepted on the first pass at seed 42 (no retries needed); each was visually reviewed at
full size for on-model felt/wool texture, blanket-stitch border, embroidered detail, warm
theatrical lighting, correct subject, and absence of baked text or malformed anatomy before
acceptance.

Post-processing: downscaled to 500px width (Lanczos) and re-encoded as 8-bit indexed/palette PNG
(Floyd–Steinberg-free quantization, 24–48 colors depending on source detail) via Python/Pillow to
match the encoding and ~70–82KB file-size budget of the three source cards; no crop or content
changes beyond the `qwen-image-edit` generation itself.

Creator: QLOBE Kids. License: CC BY 4.0. No attribution required in-app.

## Stage props (`games/tiny-reader-theater/assets/props/`) — 2026-08 story rescue

14 transparent WebP props consumed by `js/theater-scene.js` staging: `map`, `bird`, `nut`,
`nest`, `gem`, `moon`, `fox-cub`, `squirrel`, `bug`, plus back-layer scenery `log`, `tree`,
`door`, `den`, `mud`.

- 10 extracted straight from this game's own approved choice-card art (`assets/ui/choice-*.webp`)
  via local `qwen-image-edit` "Isolate the &lt;subject&gt; … flat solid dark charcoal background",
  so the props on stage ARE the art on the cards.
- 4 generated in the same felt world (`gem`, `moon`, `fox-cub`, `squirrel`) by `qwen-image-edit`
  subject-replacement against `choice-share-nut` as the style/composition anchor.
- All cut to true alpha with the async `qwen-image-layered` two-layer flow (`layer_2`, seed 42),
  alpha-spread verified, trimmed, downscaled (256–640px), reviewed on a magenta contact sheet.

Creator: QLOBE Kids, derived from this project's own approved art. License: CC BY 4.0.

## Audio (`games/tiny-reader-theater/assets/audio/`)

Word clips (`words/`), narrator line clips + ending summaries (`lines/`), and fixed UI-line +
endings-count clips (`ui/`). The 2026-08 story rescue regenerated all 39 line clips for the
rewritten Peppa-spirit stories, added ~67 new word clips (onomatopoeia included), 9 recorded
ending summaries (`summary:<endingId>`), and 9 recorded `ui:endingsFound:<n>` counts; 3 words
(`at`, `cub`, `fox`) reference the shared library rather than duplicating clips.

- Voice: `qwen3-tts-voiceclone`, teacher-voice reference clone.
- Seed: 7, with a retry ladder to seed 77 / seed 777 on QA mismatch.
- QA: Whisper-QA'd (`model_size=small`, `language=en`, space/digit-insensitive compare) against
  the expected text, with a biased `initial_prompt` second-chance pass before any rejection.
- Format: generated as FLAC, converted to AAC/M4A via `ffmpeg` (96k, faststart).
- Manifest: `assets/audio/manifest.json` (keys by word / line / ui id, per
  `shared/js/voice-clips.js`'s `init(manifestUrl, linesUrl, defaultLines)` contract); any key
  missing a clip falls back to the device Web Speech synth voice automatically.

Creator: QLOBE Kids. License: CC BY 4.0. No attribution required in-app.

## Castle setting (2026-08 second-setting production)

The Castle story tree (already authored in `config.json`) was fully produced and unlocked:
12 choice cards, 10 stage props, and 125 audio clips (64 words, 39 lines, 9 ending summaries,
9 `ui:endingsFound:castle:<n>` counts).

### Choice-card art (`games/tiny-reader-theater/assets/ui/choice-*.webp`, 12 files)

`choice-crown.webp`, `choice-dragon.webp`, `choice-ball.webp` (the 3 Beginning cards) generated
via local `qwen-image-edit` subject-replacement against the Forest Beginning cards
(`choice-map.webp` / `choice-bird.webp` / `choice-door.webp`) as style+composition references,
prompt pattern "Replace the &lt;forest subject&gt; with &lt;castle subject&gt; … keeping this
exact felt/stitched illustration style, card composition, border, lighting, and color language."
The 9 middle-branch cards (`choice-throne`, `choice-tower`, `choice-mouse`, `choice-tissue`,
`choice-lullaby`, `choice-rings`, `choice-drum`, `choice-dance`, `choice-wake`) were each
generated from their own parent Beginning card, keeping each branch family visually continuous —
same recipe as Forest's own middle cards. All 12 accepted on the first pass at seed 42, reviewed
at full size for on-model felt/stitched texture and absence of baked text. Because the
subject-replacement prompt deliberately preserves the parent card's composition/background, all
12 castle cards carry the same decorative forest-glade card background as their Forest
ancestors — a stylistic constant of this card family across settings, not a defect.

### Stage props (`games/tiny-reader-theater/assets/props/`, 10 files)

`crown`, `dragon`, `mouse`, `tissue`, `ring` (shared art for the `ring-1`/`ring-2`/`ring-3`
variants), `drum`, `throne`, `cat`, `gate`, `trumpet`. Pipeline: `qwen-image-edit` isolates each
subject from its choice card (or, for `cat`/`gate`/`trumpet`, generates it by subject-replacement
against a sibling card) onto a flat charcoal ground, then the async `qwen-image-layered` two-layer
workflow lifts it to true alpha, trimmed and downscaled (256–640px) same as Forest's props.

Two exceptions worth recording:

- **`crown` and `dragon`**: `qwen-image-layered` returned a fully-transparent top layer (0%
  opaque) across 5 attempts total (seeds 42 ×2, 1337, 9001, 5555 for `crown`; seeds 42 ×2, 1337
  for `dragon`; one of the `crown` attempts also used a simplified prompt) — a systematic model
  failure on these two source images, not seed noise. Both were recovered locally instead: their
  stage-1 isolates sit on a near-perfectly-uniform flat charcoal background (~3-level corner
  variance), so a deterministic four-corner flood-fill chroma-key (Pillow `ImageDraw.floodfill`,
  threshold 30, 1.2px Gaussian-feathered alpha) produced a clean true-alpha cutout with no further
  GPU calls. Verified edge-clean against both a saturated-green and saturated-magenta test
  composite.
- **`trumpet`**: the layered result's background alpha was non-zero (~11–28 of 255, not the
  usual ~0–2) rather than semi-transparent noise, so the original trim threshold (8) failed to
  crop it — it shipped as a near-full-canvas image with a faint background-rectangle halo. Fixed
  by raising the trim threshold to 40 (verified stable — ≤20px bbox drift — against the other 9
  props' clean near-zero backgrounds before applying it project-wide for this batch).

Creator: QLOBE Kids, derived from this project's own approved art. License: CC BY 4.0.

### Audio (125 new clips)

Same pipeline as Forest: `qwen3-tts-voiceclone` against the teacher-voice reference, seed 7 with
a retry ladder to 77/777, Whisper-QA'd (`model_size=small`, biased `initial_prompt` second-chance
pass before rejection), FLAC→AAC/M4A via `ffmpeg`. All 121 generated clips (64 words + 39 lines +
9 summaries + 9 `ui:endingsFound:castle:<n>` counts) passed QA on the first seed (7) with zero
rejects; 4 additional words (`cat`, `hid`, `hooray`, `tap`) reference the shared library rather
than duplicating clips already recorded for Forest. Coverage-checked: every castle word/line/
summary/ui key resolves to an existing manifest entry and file, zero missing.

Creator: QLOBE Kids. License: CC BY 4.0. No attribution required in-app.

## Outer Space setting (2026-08 third and final setting production)

The Outer Space story tree (already authored in `config.json`) was fully produced and
unlocked: 12 choice cards, 9 stage props, and 122 audio clips (65 words, 39 lines, 9 ending
summaries, 9 `ui:endingsFound:outer-space:<n>` counts).

### Choice-card art (`games/tiny-reader-theater/assets/ui/choice-*.webp`, 12 files)

`choice-bounce.webp`, `choice-star.webp`, `choice-visit.webp` (the 3 Beginning cards) generated
via local `qwen-image-edit` subject-replacement against the Forest Beginning cards
(`choice-map.webp` / `choice-bird.webp` / `choice-door.webp`) as style+composition references.
Unlike Castle, the subject-replacement prompt here also had to redress the ENTIRE background
(a moon-dust ground under a starry night sky, not the forest cards' glade) — a first-pass prompt
that only replaced the subject kept the forest trees/leaves behind it, so the prompt was extended
with an explicit "replace the ENTIRE background too" clause. The 9 middle-branch cards
(`choice-crater`, `choice-flag`, `choice-jump`, `choice-toss`, `choice-show`, `choice-dance`,
`choice-snack`, `choice-hide`, `choice-picnic`) were each generated from their own parent
Beginning card. Three needed a targeted second prompt pass:

- `crater` / `flag`: the parent `bounce` card's decorative motion-arc ribbons kept surviving a
  "replace the subject" prompt verbatim; fixed with an explicit "remove the colorful looping
  motion-arc ribbons completely" instruction.
- `toss`: a "star arcing back up" prompt returned a near-identical copy of the parent `star` card
  (a falling star) three times running — the edit model was over-anchored to the input
  composition. Fixed with a literal "turn this picture upside down" instruction: moon ground to
  the top, star and its sparkle trail streaming up from the bottom, which reads clearly as
  "just launched skyward" and keeps the felt/stitched style intact.
- `jump`: an unprompted human child character appeared in the generated scene (breaking the
  felt-puppet-only visual world); fixed by adding an explicit "no human figure, no person, no
  child" negative constraint.

All 12 accepted, reviewed at full size for on-model felt/stitched texture, correct subject, and
absence of stray characters/artifacts.

### Stage props (`games/tiny-reader-theater/assets/props/`, 9 files)

`star` (shared art for the `star`/`star-2` variants), `flag`, `earth`, `snack`, `rocket`,
`moon-friend`, plus back-layer scenery `rock`, `crater`, `moon-house`. Pipeline: `qwen-image-edit`
isolates each subject from its choice card (`rocket` from the setup screen's own
`world-outer-space.webp` tile, which already depicts it; `moon-friend`/`rock` generated by
subject-replacement against a sibling card) onto a flat charcoal ground, then the async
`qwen-image-layered` two-layer workflow lifts it to true alpha, trimmed and downscaled
(177–640px) same as Forest/Castle's props. All 9 succeeded on the first `qwen-image-layered` pass
— no floodkey fallback needed this round. Three isolates (`flag`, `crater`, `rock`) initially
returned the whole source card unchanged (border, background, and all) instead of an isolated
subject; a second, more explicit prompt pass ("remove the picture-frame border … no colorful arc
lines … no stars") on the same source resolved all three.

Creator: QLOBE Kids, derived from this project's own approved art. License: CC BY 4.0.

### Audio (122 new clips)

Same pipeline as Forest/Castle: `qwen3-tts-voiceclone` against the teacher-voice reference, seed 7
with a retry ladder to 77/777, Whisper-QA'd (`model_size=small`, biased `initial_prompt`
second-chance pass before rejection), FLAC→AAC/M4A via `ffmpeg`. 121 of 122 clips passed QA
within the 3-seed ladder (11 needed the biased second pass); the last (`word:peeks`) was accepted
manually after Whisper repeatedly, correctly transcribed it as the homophone "Peaks" across all
3 seeds — accepted per the platform's homophone rule rather than burning a 4th seed on an already
correct recording. Coverage-checked: every outer-space word/line/summary/ui key resolves to an
existing manifest entry and file, zero missing.

Creator: QLOBE Kids. License: CC BY 4.0. No attribution required in-app.

### Cross-setting audio-key collision fix (2026-08)

Producing this third setting surfaced a latent bug: `line:<nodeId>:<i>` and `summary:<endingId>`
manifest/lines.json keys were never scoped by setting, but Forest, Castle, and Outer Space all
reuse the exact same node ids (`beginning`, `middle-1`, `ending-1-1`, …) and ending ids. Each
setting's audio install therefore silently overwrote the previous setting's line/summary clips at
the identical manifest key AND the identical physical file (`lines/beginning-0.m4a` etc.) —
confirmed via each setting's own `audio-state.json`, which shows three different correct
sentences recorded under the identical key `line:beginning:0`. Castle's production had already
silently clobbered Forest's line/summary audio this way before this session began; QA never
caught it because `audio.heardClip()` checks that a real recorded clip fired for a key, not which
sentence it contains.

Fixed by scoping both key families by settingId (`line:<settingId>:<nodeId>:<i>`,
`summary:<settingId>:<endingId>`) in `js/theater-scene.js`'s `performLine()` and `js/main.js`'s
narration calls, and reinstalling all three settings' line/summary audio (144 files total) from
each production's own untouched scratchpad stage directory under new non-colliding filenames
(`lines/<settingId>-<nodeId>-<i>.m4a`). `tools/qa.mjs`'s narrator-line assertions were updated to
the new scoped keys. Word-level keys (`word:<word>`) were never affected — they are intentionally
global/shared across settings.

## Shared / reused assets (not new)

| Asset | Source | License |
|---|---|---|
| `shared/js/stage/stage.js`, `puppet.js`, `theater.js` | Shared QLOBE Kids puppet-theater engine | CC BY 4.0 (code MIT) |
| `shared/characters/{bear,doggy,fox,frog,rabbit,unicorn,princess-lily,princess-zoe}/` | Shared rigged QLOBE puppet cast (already produced for `games/puppet-retell/`) | CC BY 4.0 |
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | Google Fonts / Fontsource, linked via `shared/css/base.css` | SIL OFL 1.1 |
| HUD buttons, screens chrome | `shared/css/hud.css`, `shared/css/screens.css`, `shared/js/hud.js`, `shared/js/screens.js` | CC BY 4.0 (code MIT) |
| Sound effects | Synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A — no sourced audio |

## Link preview (og:image)

| Asset | Source | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| `assets/og-image.jpg` | Generated screenshot of this game's own splash screen (1200×630), captured by `tools/pipeline/capture_og_images.mjs` | QLOBE Kids | CC BY 4.0 | No | Regenerate with the tool rather than editing by hand |
