# Rhyming Detective Assets

Production art for this game is generated locally via the **local ComfyUI API** (a private
LAN endpoint — never committed by name or IP to this repo) and post-processed in-repo. This
file supersedes the earlier prototype-era ASSETS.md, which described a different, now-replaced
build of this game (Web Speech only, shared object cards only, no baked art).

All generated art is original output of local diffusion models run against this project's own
prompts and reference images; it is treated as CC BY 4.0, matching the rest of the shared
QLOBE Kids art library.

## Produced this pass (WP1d raw generation + WP1e cutout extraction/finalization)

Pipeline for every cutout asset below: (1) generate/recolor on a plain grey or flat dark
charcoal background with the local API's `qwen-image-edit` workflow; (2) if the source render
was on medium grey rather than dark charcoal, normalize it to flat dark charcoal with a second
`qwen-image-edit` pass (grey extraction alone produced near-blank alpha on this batch — see
Deviations); (3) extract true alpha with `qwen-image-layered` (async job flow, explicit
two-layer prompt, `layer_2` fetched); (4) QA the alpha histogram (corner-floor bias measured
and subtracted, composited over magenta to eyeball the silhouette); (5) deterministic finalize
— alpha-trim to content bbox, pad 8px, resize, encode to `.webp` with `cwebp` inside the GDD §8.2
byte budget.

| asset | source mockup / identity ref | raw gen seed | extraction seed | outcome | dims | size |
|---|---|---|---|---|---|---|
| `assets/title.webp` | `01-title.png` (isolate on grey, then normalized to charcoal) | 42 | 42 | extracted clean | 1400×735 | 144.1 KB |
| `assets/mascots/cat-present.webp` | `01-title.png` (isolate on grey, then normalized) | 42 | 42 | extracted clean | 1024×1024 | 89.9 KB |
| `assets/mascots/cat-cheer.webp` | `cat-present-raw-42.png` (pose edit, then normalized) | 42 | 42 | extracted clean | 1024×1024 | 89.2 KB |
| `assets/mascots/bat-fly.webp` | `01-title.png` (isolate on grey, then normalized) | 42 | 42 | extracted clean | 1024×1024 | 73.4 KB |
| `assets/mascots/bat-cheer.webp` | `bat-fly-raw-42.png` (pose edit, then normalized) | 1337 (raw pose edit) / 42 (darkbg + extraction) | 42 | extracted clean | 1024×1024 | 80.6 KB |
| `assets/props/magnifier.webp` | `02-find-rhyme.png` (isolate on grey, then normalized) | 42 | 42 | extracted clean (retried; see Deviations) | 780×582 | 35.2 KB |
| `assets/sprites/bat.webp` | `shared/assets/objects/bat.webp` | 42 (regenerated standalone, no room-corner staging) | 42 | extracted clean (retried; see Deviations) | 512×462 | 13.2 KB |
| `assets/sprites/bed.webp` | `shared/assets/objects/bed.webp` | 42 | 42 | extracted clean | 512×341 | 31.9 KB |
| `assets/sprites/bug.webp` | `shared/assets/objects/bug.webp` | 42 | 42 | extracted clean | 512×425 | 41.9 KB |
| `assets/sprites/can.webp` | `shared/assets/objects/can.webp` | 42 | 42 | extracted clean | 512×460 | 41.5 KB |
| `assets/sprites/cap.webp` | `shared/assets/objects/cap.webp` | 42 | 42 | extracted clean | 512×379 | 34.7 KB |
| `assets/sprites/cat.webp` | `shared/assets/objects/cat.webp` | 42 | 42 | extracted clean | 420×512 | 48.4 KB |
| `assets/sprites/dog.webp` | `shared/assets/objects/dog.webp` | 42 | 42 | extracted clean | 512×251 | 32.2 KB |
| `assets/sprites/fan.webp` | `shared/assets/objects/fan.webp` | 42 (raw gen only) | 42 → 1337 → 9001, all failed | **Toy Table fallback** (GDD §8.5) | 512×512 | 76.4 KB |
| `assets/sprites/fig.webp` | `shared/assets/objects/fig.webp` | 42 | 42 | extracted clean | 479×512 | 31.2 KB |
| `assets/sprites/hat.webp` | `shared/assets/objects/hat.webp` | 42 | 42 | extracted clean | 441×512 | 41.0 KB |
| `assets/sprites/hen.webp` | `shared/assets/objects/hen.webp` | 42 | 42 | extracted clean | 415×512 | 37.9 KB |
| `assets/sprites/jet.webp` | `shared/assets/objects/jet.webp` | 42 | 42 | extracted clean | 512×395 | 32.0 KB |
| `assets/sprites/jug.webp` | `shared/assets/objects/jug.webp` | 42 | 42 | extracted clean | 480×512 | 39.0 KB |
| `assets/sprites/log.webp` | `shared/assets/objects/log.webp` | 42 | 42 | extracted clean | 512×373 | 49.4 KB |
| `assets/sprites/mat.webp` | `shared/assets/objects/mat.webp` | 42 | 42 | extracted clean | 512×201 | 40.0 KB |
| `assets/sprites/mop.webp` | `shared/assets/objects/mop.webp` | 42 | 42 | extracted clean | 512×497 | 30.0 KB |
| `assets/sprites/mug.webp` | `shared/assets/objects/mug.webp` | 42 | 42 | extracted clean | 512×451 | 38.5 KB |
| `assets/sprites/net.webp` | `shared/assets/objects/net.webp` | 42 | 42 | extracted clean | 364×512 | 53.3 KB |
| `assets/sprites/pan.webp` | `shared/assets/objects/pan.webp` | 42 | 42 | extracted clean | 512×309 | 27.5 KB |
| `assets/sprites/pen.webp` | `shared/assets/objects/pen.webp` | 42 | 42 | extracted clean | 512×487 | 31.5 KB |
| `assets/sprites/pet.webp` | `shared/assets/objects/pet.webp` | 42 | 42 | extracted clean | 402×512 | 67.2 KB |
| `assets/sprites/rat.webp` | `shared/assets/objects/rat.webp` | 42 | 42 | extracted clean | 456×512 | 45.0 KB |
| `assets/sprites/rug.webp` | `shared/assets/objects/rug.webp` | 42 | 42 | extracted clean | 512×176 | 28.3 KB |
| `assets/sprites/sun.webp` | `shared/assets/objects/sun.webp` | 42 | 42 | extracted clean | 431×512 | 63.6 KB |
| `assets/sprites/ten.webp` | `shared/assets/objects/ten.webp` | 42 | 42 | extracted clean | 512×396 | 47.0 KB |
| `assets/sprites/van.webp` | `shared/assets/objects/van.webp` | 42 | 42 | extracted clean | 512×406 | 52.9 KB |
| `assets/sprites/vet.webp` | `shared/assets/objects/vet.webp` | 42 | 42 | extracted clean | 399×512 | 50.9 KB |

**Style pass note (word sprites).** Each sprite is a Storybook Rooms style-pass redraw over the
shared `objects/<w>.webp` identity reference (navy `#123a6b` outline, one highlight, one contact
shadow, glossy toy finish), per GDD §8.2. Ten of the 27 depict the word as a picture / toy /
model rather than the literal thing, per GDD §4.2 (`sun` a pinned child's drawing, `bat` a toy
baseball bat, `rat` a toy figurine, `log` firewood, `van`/`jet` toy vehicles, `vet` a framed
photo, `pet` a puppy in a basket, `ten` a numeral fridge magnet, `dog` sleeping, `hen` a china
ornament).

**Raw generation split.** WP1d's background batch delivered 13 of the 27 word-sprite raw
generations before this pass began (`bat, bug, can, cat, fan, hat, jug, mat, mug, pan, rat, rug,
van`); the remaining 14 (`sun, mop, dog, bed, hen, cap, pen, log, jet, net, vet, pet, ten, fig`)
were generated in this pass using the same `qwen-image-edit` recipe pattern and the same seed
(42), reading subject descriptions from `shared/data/words.json` and GDD §4.2. All 27 raw
intermediates plus recipe sidecars now live in `assets/source/sprites/`.

## Deviations from the batch-cutout recipe, logged per the local-genai skill doc

1. **Grey-background sources needed a charcoal normalization pass first.** `title`, both cat
   mascots, both bat mascots and `magnifier` were generated by WP1d on **plain medium grey**
   (per its own "Isolate the X on a plain grey background" recipe), not the flat dark charcoal
   the standard cutout pipeline calls for. Extracting directly from that grey source produced a
   near-blank alpha on every retry (seeds 42 and 1337 both failed on `magnifier`). Fix: a second
   `qwen-image-edit` pass, "change the background to a perfectly flat, solid, uniform dark
   charcoal background," re-run before `qwen-image-layered`. Clean extraction followed
   immediately on all six assets. Logged so a future batch generates straight onto charcoal and
   skips this extra hop.
2. **A uniform low alpha floor (not exactly 0) sits under every clean extraction's background
   region** — observed 0–43/255 across this batch, likely a `qwen-image-layered` decomposition
   artifact rather than true transparency. `finalize.py` measures the four-corner median alpha
   per asset and rescales `(alpha − floor) / (255 − floor)` before trimming, which zeroes the
   background cleanly while preserving the real soft-shadow gradient under each mascot/prop
   (visible as a faint darker ellipse, intentional per GDD §8.1's "one soft contact shadow").
   Composited over magenta and over navy/cream proxies (`bg-study.jpg` does not exist yet — see
   below) with no visible fringe.
3. **`bat.webp` needed a source regeneration, not just a seed retry.** WP1d's raw `bat` sprite
   staged the toy baseball bat "leaning in a corner" with visible navy room-corner lines baked
   into the render. `qwen-image-layered` reproduced those corner lines as part of the extracted
   top layer on both seed 42 (near-blank/hollow interior, a false pass under the automated alpha
   heuristic — caught on visual review) and seed 1337 (properly filled, but the corner lines
   persisted at full opacity even with an explicit "no corner lines, no walls" extraction
   prompt). Root cause: the corner geometry is baked into the raw pixels, not separable at
   extraction time. Fix: regenerated `bat-raw-42-v2.png` from the shared identity ref with the
   corner staging removed ("standing alone... no walls, no corner, no room"), then extracted
   clean on the first try. This is the one asset in the batch that needed more than a seed
   retry; logged since it is a source-authoring lesson for any future "object leaning against/in
   X" prompt.
4. **Automated alpha QA needed a visual backstop.** The scripted alpha-histogram check (percent
   background / percent opaque) treated `bat`'s hollow-outline seed-42 extraction as a pass,
   because a thin fully-opaque outline stroke is enough pixel mass to clear the numeric
   threshold. Every extraction in this batch was also composited over magenta and eyeballed
   (per the skill doc's QA method) — that step is what actually caught the defect. Recommend any
   future automation add a "largest opaque connected component fills > N% of its own bbox" check
   to catch hollow-outline failures without a human pass.
5. **Three sprites finalize under the 30 KB floor** (`bat.webp` 13.2 KB, `pan.webp` 27.5 KB,
   `rug.webp` 28.3 KB) despite `cwebp` already running at `-q 95` (max quality this pipeline
   uses before falling back to reduce it for budget). These are genuinely small/simple
   silhouettes (a thin bat, a low-detail pan, a flat round rug); pushing quality higher would
   only inflate the file with no visible gain. Not treated as a defect — smaller than target at
   full visual quality is strictly better than the alternative.
6. **`fan.webp` ships as the Toy Table fallback**, per GDD §8.5. All three retry seeds
   (42 → 1337 → 9001) produced a fully blank/near-blank extraction (0% opaque pixels). The raw
   `fan` render itself looks correct (a glossy navy desk fan) but was staged with a soft warm
   spotlight/gradient under the fan rather than the flat charcoal the rest of the batch used,
   which likely confused the decomposition. `assets/sprites/fan.webp` is a direct copy of
   `shared/assets/objects/fan.webp` (512×512, 76.4 KB); the in-game warm-tint CSS filter and
   contact shadow are applied at runtime per the fallback spec, not baked into the file.
7. **Composite-over-`bg-study.jpg` QA deferred.** The skill doc's alpha QA method calls for
   compositing over both magenta and the actual room background. `assets/bg-study.jpg` (and
   `bg-kitchen.jpg`, `bg-bedroom.jpg`) are a different work package's deliverable and do not
   exist yet in this worktree. Every sprite/mascot/prop was instead checked over magenta, over a
   navy `#123a6b` swatch and over the cream `#fffdf6` panel colour from GDD §8.1's palette table
   as a proxy for both dark and light room surfaces — no fringing observed in either direction.
   **Follow-up for whoever builds the room plates:** re-check the full sprite set once
   `bg-study.jpg` exists; the alpha-floor fix in point 2 should hold, but it has not been proven
   against the real backgrounds.

## Not yet produced (other work packages / not owned by WP1e)

- `assets/bg-study.jpg`, `assets/bg-kitchen.jpg`, `assets/bg-bedroom.jpg` — room plates.
- `assets/splash-bg.jpg` — splash field.
- `assets/lockups/great-job.webp`, `assets/lockups/they-rhyme.webp` — celebration lockups.
- `assets/og-image.jpg` — captured from the finished splash once it exists.

## Voice production (WP1f) — 24 clips cloned, Whisper-QA'd, encoded

Pipeline: `qwen3-tts-voiceclone` (voice=`shared/assets/refs/voice-teacher.wav`) seeded 7 → 8 → 9,
batched per the model-thrash rule — **all 24 clips generated at seed 7, then all 24 whisper-QA'd**,
before any seed-8 retry began (and again for seed 9), rather than interleaving generate/QA
per clip. Every take was transcribed with `whisper-stt` (`model_size=base`, `language=en`,
`small` for the two sub-1.5 s clips `they-rhyme`/`two-more`/`one-more`/`case-closed`) and
compared against the GDD §3.2 verbatim text (normalized: lowercased, punctuation stripped, loose
word-sequence match). A mismatch got one biased re-check — `whisper-stt` re-run with
`initial_prompt` set to the intended line — before being rejected outright.

**Result: 24/24 accepted, 0 omitted.** 23 of 24 passed clean on the first take (seed 7). `no-1`
("Ooh, that one doesn't rhyme. Keep looking!") took three rounds: seed 7 and seed 8 both
transcribed the leading interjection as "Oh" instead of "Ooh" (a genuine mis-hearing by Whisper,
not a mispronunciation — the biased re-check with the intended text as `initial_prompt` did not
flip either verdict), seed 9 transcribed "Ooh" correctly and was accepted.

| key | accepted seed | dur (s) | notes |
|---|---|---|---|
| welcome | 7 | 3.20 | |
| mode-rhyme-hunt | 7 | 3.35 | |
| mode-sound-detective | 7 | 3.83 | |
| again | 7 | 1.76 | |
| case-stem | 7 | 1.52 | trailing-rise prosody, per GDD §3.2 |
| sound-listen | 7 | 3.28 | trailing-rise prosody, per GDD §3.2 |
| yes-1 | 7 | 1.68 | |
| yes-2 | 7 | 2.24 | |
| yes-3 | 7 | 2.48 | |
| they-rhyme | 7 | 0.96 | gain-corrected, see below |
| no-1 | **9** | 2.80 | rejected seed 7 + seed 8 ("Oh" heard for "Ooh"); accepted seed 9 |
| no-2 | 7 | 2.88 | |
| no-3 | 7 | 3.51 | |
| two-more | 7 | 1.12 | |
| one-more | 7 | 1.12 | |
| great-job | 7 | 1.44 | |
| case-closed | 7 | 1.12 | |
| next-case | 7 | 1.20 | gain-corrected, see below |
| idle-1 | 7 | 2.72 | |
| idle-2 | 7 | 1.92 | |
| hint-look | 7 | 2.32 | |
| end | 7 | 2.88 | |
| end-tip | 7 | 3.75 | |
| sound-again | 7 | 1.44 | |

Full per-attempt transcripts (including the two rejected `no-1` takes and their biased-prompt
re-checks) are in `assets/audio/qa.json`.

**Encoding**: `afconvert -f m4af -d aac -b 64000` from the cloned FLAC take (the workflow returns
FLAC data inside a `.wav`-named file — not actually WAV; converted straight to AAC, no
intermediate PCM round-trip except for the two gain corrections below). Output verified AAC
mono 24 kHz, `moov` atom immediately after `ftype` (faststart) on every file via `ffprobe`/hex
inspection.

**Loudness matching**: every clip measured against `shared/assets/audio/words/cat.m4a`
(-19.2 LUFS integrated, `ffmpeg -af loudnorm=print_format=summary`, single-pass measurement).
Most clips landed within ±1.5 LU of the reference — accepted as natural clone-to-clone variance,
matching the platform's existing per-clip TTS output rather than forcing every line through a
uniform normalizer. Two clips were clearly off and gain-corrected (FLAC → `ffmpeg -af volume=NdB`
→ PCM → `afconvert` → AAC):

| key | measured (before) | correction | measured (after) |
|---|---|---|---|
| `next-case` | -23.7 LUFS | +4.5 dB | -19.2 LUFS |
| `they-rhyme` | -16.1 LUFS | -3.1 dB | -19.1 LUFS |

**`assets/audio/manifest.json`** (4.0 KB, budget ≤ 8 KB): 24 local entries (`"file": "<key>.m4a"`,
resolved by `voice-clips.js` against its own `assets/audio/` base) + 27 `word-<w>` entries
pointing at `../../shared/assets/audio/words/<w>.m4a`. Path-resolution note for whoever audits
this next: `voice-clips.js:clipUrl()` passes any `../`-prefixed `file` straight through
unmodified, and the browser then resolves it **relative to the document (`index.html`), not to
`manifest.json`'s own folder** — the fetch path and the playback path have different bases,
which is easy to get wrong. From `games/rhyming-detective/index.html`, `../../shared/...` lands
at `<repo-root>/shared/...`, exactly two levels up. Verified two ways: (1) precedent —
`games/sand-tray-letters/assets/audio/manifest.json` uses the identical `../../shared/...` depth
for its shared `fragments/` clips; (2) direct check — every one of the 51 manifest entries (24
local + 27 shared) was resolved with Python's `os.path.normpath` against the game's `index.html`
directory and confirmed to exist on disk. **All 51 resolve; none missing.**

**`assets/audio/qa.json`** (13.0 KB, budget ≤ 30 KB): per-clip, per-seed transcript/verdict log
for the 24 new clips, plus the three shared `prompts/` transcriptions GDD §3.3 asked to be
recorded for the platform record (`cat`, `pan`, `bug` — chosen from the case-1/case-2/case-3
targets). All three transcribed as `"Can you make <word>?"`, confirming the documented known
finding: per-word prompts cannot express "…that rhymes with X" and are correctly NOT used by
this game; the composed `case-stem` + `word-<target>` sequence is the primary design, not a
fallback.

**Deviation — total `.m4a` payload over the GDD §8.2 budget line.** The budget row reads
"~14 KB avg, ≤ 400 KB total"; actual is **571 KB total, ~23.8 KB avg** (24 files, 12.1–37.0 KB
each). Root cause: this game's 24 lines are full sentences (`mode-sound-detective` alone is 3.8 s)
where the ~14 KB-avg precedent this budget was likely modeled on (`sand-tray-letters`) mixes in
many single-word/short-phrase clips. At the spec's own fixed bitrate (**"AAC 64 kbps mono" is
stated in the same table row as the KB budget** — both cannot bind simultaneously given these
line lengths), 64 kbps × ~2.4 s average ≈ 19 KB/clip is the arithmetic floor; observed sizes are
in that neighborhood. Not treated as a silent fix: dropping bitrate to force the KB number down
would trade audio clarity for a budget line that conflicts with an explicit, more specific spec
in the same row. Flagging for the integrator to either accept the actual total or revisit the
bitrate/line-length tradeoff — not something WP1f should decide unilaterally.

**FLAC raws**: the accepted take for every one of the 24 clips (pre-gain-correction, i.e. the
literal `qwen3-tts-voiceclone` output) is kept at `assets/source/audio/<key>.flac` for
traceability. Rejected `no-1` takes (seeds 7 and 8) are not kept — only the accepted seed's raw
survives per clip, consistent with the sprite pipeline's "keep the winner" convention elsewhere
in this file.

## Shared runtime assets (reused, nothing new produced)

| Asset | Source URL | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandao & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-back.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused per GDD §8.3 corner/centre placements |
| Object cards (`shared/assets/objects/*.webp`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Used as identity references for the style pass (this pass) and as the per-sprite fallback (GDD §8.5); `fan.webp` shipped verbatim |
| `shared/assets/audio/words/<w>.m4a` × 27 | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Registered by `../`-path, unmodified |
| Sound effects | N/A — synthesized at runtime via WebAudio API (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| `shared/data/words.json` | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Read-only; never edited by this game |

## Local generation provenance (applies to every "produced this pass" row above)

- **Workflows**: `qwen-image-edit` (isolate / recolor / redraw / background-normalize passes),
  `qwen-image-layered` (alpha extraction, async job flow, `layer_2` fetched).
- **Host**: a private local ComfyUI API on the LAN — referred to here only as "local ComfyUI
  API"; its address is never committed to this repo.
- **Reference images**: the four game mockups (`01-title.png`, `02-find-rhyme.png` and others
  named in `assets/source/*.json` sidecars) for the title/mascots/prop; `shared/assets/objects/
  <w>.webp` for every word sprite.
- Every raw generation and its prompt/seed/source sidecar (`<name>-raw-<seed>.json`) is kept in
  `assets/source/` and `assets/source/sprites/` for traceability; these are intermediates and
  are not shipped to the page.

## Produced this pass — room plates, splash field, celebration lockups, mascot budget fix

Supersedes the "Not yet produced" list above for `assets/bg-study.jpg`, `assets/bg-kitchen.jpg`,
`assets/bg-bedroom.jpg`, `assets/splash-bg.jpg`, `assets/lockups/great-job.webp` and
`assets/lockups/they-rhyme.webp` — all six now exist. `assets/og-image.jpg` was subsequently
captured in Phase 2 (see "Phase 2 integration" below), so nothing on that list is outstanding.

**Backgrounds** (`krea2-turbo-t2i`, 1600×1200, JPEG): every plate generated cleanly on the first
seed (**42**); no retry into the 1337 → 9001 → 7 ladder was needed. Storybook Rooms world rules
(§8.1) and the GDD §8.2 per-room furniture descriptions were composed directly into each prompt,
with an explicit "no small clutter, no toys, no tappable-looking items beyond the named furniture"
clause to protect GDD §4.3's calm-surface hard rule for the eight zone rects.

| asset | seed | outcome | dims | size |
|---|---|---|---|---|
| `assets/bg-study.jpg` | 42 (prompt revised once, same seed — see below) | accepted v2 | 1600×1200 | 147.5 KB |
| `assets/bg-kitchen.jpg` | 42 | accepted first try | 1600×1200 | 144.9 KB |
| `assets/bg-bedroom.jpg` | 42 | accepted first try | 1600×1200 | 126.4 KB |
| `assets/splash-bg.jpg` | 42 | accepted first try | 1600×1200 | 79.6 KB |

**`bg-study.jpg` needed one prompt revision, not a seed retry.** The first pass
(`assets/source/bg/study-raw-42-v1-rejected-clutter.png`) matched mockup 02's palette and
furniture well (red brick, green window, wood shelf + dresser right, potted plant left) but the
mockup's own decorative detail — five stacked books on the wall shelf, plus a plant and two more
books on the dresser top — landed directly inside GDD §4.3 zones 3 (`shelf-right`) and 5
(`dresser-top`), which the spec requires to stay calm and low-detail (a hotspot object and its
speech bubble would have competed with painted books for the same small surface). Re-prompted
with the shelf and dresser top explicitly bare (still present as furniture, per the GDD row's own
text, which never asked for books) and regenerated at the same seed 42 —
`assets/source/bg/study-raw-42-v2.png`, accepted. Every other zone/room was checked by eye against
the §4.3 lattice (art-px rects overlaid mentally against each 1600×1200 plate): calm in all cases,
including the deliberate overlaps precedented by mockup 02 itself (e.g. a hotspot sitting against
the window frame or a floor plant, same as mockup 02's sun/hat placement logic).

Encoded PNG → JPEG with `ffmpeg -q:v 4` (high quality, no visible banding at full size); all four
land well inside the 300 KB/plate budget with headroom.

**Celebration lockups** (mockup 03 → `qwen-image-edit` isolate → `qwen-image-edit` charcoal
normalize → `qwen-image-layered` async job/`layer_2` → alpha-trim (thresholded bbox, not raw
`getbbox()` — see gotcha below) → `cwebp`). Both extracted clean on the first seed (**42**) with
no retries needed.

| asset | seed | dims | size | budget | spell-check |
|---|---|---|---|---|---|
| `assets/lockups/great-job.webp` | 42 | 1083×300 | 85.4 KB | ≤90 KB | **"Great Job!" — correct, verified at full zoom** |
| `assets/lockups/they-rhyme.webp` | 42 | 634×200 | 39.9 KB | ≤60 KB | **"They rhyme!" — correct, verified at full zoom** |

**Gotcha: `qwen-image-layered` output alpha never reaches exact 0 anywhere in the canvas.** A raw
`Image.getbbox()` call on the extracted layer's alpha channel returned the full 1024×760 canvas
for both lockups — the known "uniform low alpha floor" artifact (see the Deviations section
above) is present as scattered near-zero (not exactly zero) pixels across the whole frame, not
just a flat pedestal under the subject. Fix: threshold the alpha to a mask (`alpha >= 24`) before
computing the crop bbox; the real subject bbox then comes out correctly (e.g. 735×192 art px for
`great-job`). `cwebp -q 93 -alpha_q 100` for `great-job` and `-q 95 -alpha_q 100` for `they-rhyme`
were the highest quality settings that still cleared each budget line.

**Mascot budget fix — re-encode only, no regeneration**, per GDD §8.2's `≤ 90 KB` mascot row
(both files shipped from the earlier pass slightly over):

| asset | before | after | dims (unchanged) |
|---|---|---|---|
| `assets/mascots/cat-present.webp` | 92,074 B | 89,310 B | 1024×1024 |
| `assets/mascots/cat-cheer.webp` | 91,372 B | 89,616 B | 1024×1024 |

Method: `dwebp` decode to PNG (lossless round-trip, exact pixels/alpha preserved) → `cwebp -q 55
-alpha_q 92 -m 6`. Note the quality number is not comparable across encodes — re-compressing an
already-lossy WebP at the same nominal `-q` the original likely used (~80s, based on file-size
back-calculation) produced a *larger* file than the original at every quality tested from 90 down
to 58; only 55 and below cleared the 90 KB line. Eyeballed side-by-side against the original at
full size: no visible banding, edge softening or color shift. Source PNG intermediates were not
kept (pure re-encode of already-canonical pixels, not a new generation); the decision and before/
after byte counts are logged in `assets/source/mascots/cat-present-reencode.json` and
`cat-cheer-reencode.json`.

**Sources kept**: `assets/source/bg/` (both study attempts, all four accepted raws, prompt `.txt`
files, `<name>-raw-42.json` sidecars) and `assets/source/lockups/` (mockup 03 copy, every pipeline
stage PNG for both lockups including the magenta-composite QA renders, `<name>-raw-42.json`
sidecars). Not shipped to the page.

**Not satisfied**: none. All six rows in this pass's scope (`bg-study.jpg`, `bg-kitchen.jpg`,
`bg-bedroom.jpg`, `splash-bg.jpg`, `lockups/great-job.webp`, `lockups/they-rhyme.webp`) plus the
two mascot re-encodes were produced and pass their GDD §8.2 budgets on the first or second attempt
with no unresolved defects.

## Phase 2 integration — og-image captured, one stale file removed

**`assets/og-image.jpg` — 1200×630, 58.8 KB (budget ≤ 200 KB), q82.** Not hand-drawn art: a
screenshot of this game's own finished splash, taken by the standard pipeline against a locally
served copy of the repo, exactly as `docs/asset-provenance.md` requires. Regenerate rather than
edit:

```
python3 -m http.server 8000
node tools/pipeline/capture_og_images.mjs --playwright /private/tmp/pw/node_modules \
  --only rhyming-detective --force
```

The capture's own blank-render QA (luma standard deviation) passed, so the shot is a real splash
and not a grey rectangle. It supersedes the 64 KB stub image the old match-pairs game shipped.

**`assets/bg.jpg` deleted.** A 110 KB leftover of the 7-file match-pairs stub this build replaced.
Nothing in `index.html`, `css/style.css`, `js/`, `config.json` or `ASSETS.md` referenced it — the
play field takes its plate from `config.rooms.<id>.bg` (`bg-study` / `bg-kitchen` / `bg-bedroom`),
never from a single `bg.jpg`. `tools/qa.mjs` asserts it stays gone, so it cannot creep back in.

**Hands-off, confirmed untouched:** `assets/hub/tiles/rhyming-detective.jpg` (user-curated),
`shared/assets/`, `shared/data/words.json`, every other game.

## Phase 3 (WP3-SPRITES) — three sprites regenerated for house-style drift

Same pipeline as the original WP1d/e pass (style pass on a dark-charcoal ground with
`qwen-image-edit`, then `qwen-image-layered` async extraction with an explicit two-layer
prompt, alpha-trim to bbox, pad 8px, resize to longest edge 512, `cwebp -q 100 -alpha_q 100
-m 6`), re-run because these three had drifted from the house style set by `cat.webp` /
`mug.webp` / `hat.webp` (bold navy outline, glossy storybook depth, warm saturated color,
chunky toy proportions).

| asset | source identity ref | style-pass seed | extraction seed | outcome | dims | size |
|---|---|---|---|---|---|---|
| `assets/sprites/jet.webp` | `shared/assets/objects/jet.webp` | 42 | 42 | extracted clean, first seed accepted | 512×401 | 43.9 KB |
| `assets/sprites/pan.webp` | `shared/assets/objects/pan.webp` | 1337 (seed 42 retried; see below) | 42 | extracted clean | 512×317 | 41.5 KB |
| `assets/sprites/bat.webp` | **`assets/sprites/bat.webp` itself (see Deviation below)** | 9001 (seeds 42, then a second 42 pass, retried; see below) | 42 | extracted clean | 185×512 | 31.1 KB |

**jet** — the old sprite (`jet-raw-42.png`/`jet.webp`, superseded) was a soft, near-photoreal
toy render with no outline at all; it blended into any background. The style-pass prompt asked
directly for "thick solid navy-blue outline traced around every silhouette edge" plus the same
glossy/chunky/cel-shaded language used for the siblings, run once against the shared
`jet.webp` identity ref, seed 42. First candidate was clean on inspection (crisp outline,
glossy highlights, correct navy/white palette) and matched the siblings closely enough to skip
further seeds. New source: `assets/source/sprites/jet-raw-42-v2.png` / `.json`.

**pan** — the old sprite was near-black and photorealistic, no house outline. Seed 42 of the
new style-pass prompt lightened the body correctly (warm grey-blue, wood handle, glossy
highlights) but rendered the "navy outline" instruction as a navy drop-shadow/puddle shape
under the pan instead of a line hugging the silhouette — a miss worth flagging since it reads
as a different failure mode than the usual near-blank-alpha retries. Retried at seed 1337 with
the prompt reworded to explicitly rule out "shadow / puddle / glow" and ask for a "comic book
line-art outline exactly along the silhouette edge"; this produced a clean, crisp navy contour
matching the siblings. New source: `assets/source/sprites/pan-raw-1337-v2.png` / `.json`
(supersedes the seed-42 attempt, not saved).

**bat** — the old sprite was a real baseball bat (correct identity) but a 13.2 KB, 71×384-content
sliver (aspect ratio 0.185 — only ~19% as wide as tall) that read as barely-there in-room.
**Deviation from the WP3 assignment:** the assignment named `shared/assets/objects/bat.webp` as
the identity reference, but that file is the purple flying-animal Detective Bat mascot, not the
baseball-bat object card — feeding it to the style pass would have redrawn the wrong subject
entirely (the game already keeps the two concepts separate: compare
`assets/mascots/bat-fly.webp` / `bat-cheer.webp`, the animal sidekick, against this object
sprite). The current in-game `assets/sprites/bat.webp` (right identity, wrong style) was used as
the source instead. Three rounds: seed 42 with a "chunky toy bat" prompt landed a visibly
thicker barrel but modest gain (content aspect 0.258); a second seed-42 pass with stronger
"stubby toy club, short overall length" wording pushed it further, and seed 9001 of that wording
was the accepted candidate at content aspect 0.347 — the barrel is now clearly thick and the
overall silhouette noticeably squatter, while still unambiguously reading as a wooden baseball
bat (wood grain, tapered handle, rounded knob) rather than a mallet or club. Composited into
`bg-study.jpg` at the config's 200 art-px hotspot box, the bat now renders at 72×200 art px
instead of the old ~37×200 — roughly double the visible width at the same box scale. New source:
`assets/source/sprites/bat-raw-9001-v3.png` / `.json` (supersedes `bat-raw-42-v2.png`, which
itself had superseded the original `bat-raw-42.png`).

All three re-extracted with the standard `qwen-image-layered` async flow (explicit two-layer
prompt naming the exact subject, `layer_2` fetched) and passed the alpha-histogram check (real
spread, not near-blank) before finalizing. Composited over `bg-study.jpg` for an in-room
eyeball check alongside `cat.webp` / `mug.webp` / `hat.webp` before accepting.

## Phase 4 (QC follow-up) — five sprites regenerated for wrong-subject / off-style content

A full-size QC pass flagged five sprites as failing to read correctly at their shipped in-game
scale, independent of the Phase 3 house-style drift issue: `hat.webp` was a red party cone with a
pom-pom (not a hat at all — no crown/brim structure), `bat.webp` (the Phase 3 seed-9001-v3
asset) still read as a stubby bowling pin / mallet rather than a baseball bat once composited
in-room, `sun.webp` was a crayon scribble pinned to paper that broke house-style continuity with
every other sprite (no navy outline, no glossy toy finish), `fig.webp` was a single whole purple
fruit indistinguishable from an eggplant with no cut cross-section to identify it, and `mat.webp`
was a round rainbow bead coaster with "Welcome" text baked into the render — wrong shape (not a
rectangular doormat), a hard text violation, and low-contrast against `bg-study.jpg`'s warm wood
floor.

Same pipeline as WP1d/e and Phase 3 (`qwen-image-edit` style pass on the shared identity ref —
or, where the identity ref is itself wrong, an explicit from-scratch subject description — on a
flat dark-charcoal ground, then `qwen-image-layered` async extraction with a two-layer prompt,
alpha-floor correction by four-corner median, threshold-bbox trim at alpha>=24, pad 8px, resize to
longest edge 512, `cwebp -q 100 -alpha_q 100 -m 6`), composited over `bg-study.jpg` /
`bg-kitchen.jpg` at true in-game scale (not just over magenta) before accepting, per the skill
doc's QA method.

| asset | source ref | edit seed | extraction seed | outcome | dims | size |
|---|---|---|---|---|---|---|
| `assets/sprites/hat.webp` | `shared/assets/objects/hat.webp` | 9001 (42, 1337 retried; see below) | 42 | extracted clean | 512×352 | 52.1 KB |
| `assets/sprites/bat.webp` | `assets/sprites/bat.webp` itself (Phase 3 asset; shared ref is the wrong subject, see prior deviation) | 42 | 9001 (42, 1337 retried; see below) | extracted clean | 225×512 | 38.7 KB |
| `assets/sprites/sun.webp` | `shared/assets/objects/sun.webp` | 42 | 42 | extracted clean, first seed accepted | 508×512 | 63.1 KB |
| `assets/sprites/fig.webp` | `shared/assets/objects/fig.webp` | 42 | 42 | extracted clean, first seed accepted | 512×386 | 72.7 KB |
| `assets/sprites/mat.webp` | `shared/assets/objects/mat.webp` | 42 | 42 | extracted clean, first seed accepted | 512×226 | 65.7 KB |

**hat** — the shared identity ref is a cylindrical top-hat/bucket-hat shape, not the brimmed
detective hat mockup 02 shows. Seed 42 of the first prompt drew a bowler-ish dome with a stray
leaf/tail poking off the crown top. A seed-1337 retry that explicitly said "no leaf, no bow, no
ribbon curl" backfired — the negation primed the model and it drew an actual bow on top instead.
Seed 9001 dropped every negative clause in favour of a purely positive description ("a smooth,
unbroken, rounded dome... nothing attached to it") and landed clean on the first try: a fedora-style
dome with a light center dent, a wide curved brim, a navy band, navy outline, glossy toy finish.
Lesson logged for future prompts on this model: describe the wanted shape positively; naming the
unwanted feature to exclude it can put that feature into the frame instead.

**bat** — the Phase 3 edit prompt (seed 42, reusing the in-game bat as its own source per the
established shared-ref deviation) produced a correctly tapered barrel-to-handle silhouette with a
round knob, a clean improvement over the Phase 3 asset. The extraction stage is what failed this
time: both seed 42 and seed 1337 of `qwen-image-layered` filled the interior at only ~90–140/255
alpha (a partial, magenta-bleeding fill visible on the standard magenta-composite check) rather
than the ~255 every other sprite in this batch hit — a softer variant of the known hollow-outline
extraction defect, this time partial rather than fully empty. Seed 9001 of the extraction (prompt
reworded to "a solid opaque wooden toy baseball bat... no transparency inside the bat shape")
filled solid at 254–255 throughout on the first try at that seed. Logged because the defect this
time was in the *extraction* stage on an already-correct edit-stage source, not the generation —
worth re-checking alpha at a few interior sample points, not just the corner/histogram check, on
any thin diagonal sprite.

**sun** — redrawn directly off the shared identity ref (already close to house style) with the
paper/pushpin/crayon treatment dropped entirely, per an explicit "smooth clean flat-shaded toy
style only" clause. Accepted clean on the first seed.

**fig** — redrawn with a second fig, cut in half, placed beside the whole one, specifically to
carry the pink-red flesh and visible seeds that identify a fig and distinguish it from an
eggplant. Accepted clean on the first seed.

**mat** — replaced entirely (identity ref subject was wrong, not just off-style): a rectangular
woven mat in a warm red/orange/yellow/cream stripe pattern, drawn in a slight floor perspective,
explicitly no beads and no text. Accepted clean on the first seed.

**Footprint / grounding fix (`config.json` + `js/game.js`).** `hotspot-scene.js` draws every
sprite inside a *square* art box (`wideBox`'s `s x s`) with CSS `object-fit:contain`, centred on
both axes. A sprite raster wider than it is tall — `mat.webp` (512×226) and, to a lesser degree,
`fig.webp` (512×386) — is therefore width-constrained inside that square, leaving vertical slack
split evenly above and below. On a grounded zone (one with a `base` contact line — floors and
shelves) that slack put the drawn foot `slack/2` art px *above* `base` instead of on it: the
hotspot's hit box touched the surface correctly, but the visible object floated. Measured from
each sprite's shipped aspect at its configured `sizes[word]`: `mat` at `size:170` floats 47 art px,
`fig` at `size:150` floats 18 art px. Added a `footPad` map to `config.json` (`{"mat": 47, "fig":
18}`, with a `_footPadNotes` block explaining the derivation and when to re-measure it) and one
line in `wideBox()` (`js/game.js`) that adds it to the grounded `y` only when `zone.base` is
defined — a no-op on wall zones and for any word with no entry. `bat.webp`'s aspect (225×512, taller
than wide) is height-constrained instead, so it already had zero vertical slack and needed no
correction; `hat.webp`'s and `sun.webp`'s only case-1/case-4 placements are wall zones (no `base`),
so grounding does not apply to them at all. Verified against real screenshots at both `wide` and
`compact` layout, not just computed: `mat` now sits flush on `bg-study.jpg`'s floor line with no
visible gap; `bat` stands on its own contact shadow; `fig` sits flush on `bg-kitchen.jpg`'s
counter edge.

**QA.** `tools/qa.mjs` run in full against the local worktree: **206/206 checks passed**, 54
screenshots captured to `/private/tmp/qlobe-rd-shots` (outside the repo, per the tool's own
convention), zero page/console errors, zero failed or 4xx requests, zero remote requests, across
all five viewport/reduced-motion sessions. `qa.mjs`'s standard drive only exercises case-1 (study:
`hat`, `bat`, `mat`, `sun`, `mop`); `fig` only appears in case-5 (kitchen), which the gate does not
visit, so it was additionally checked with a one-off `QLOBE_DEBUG.winRound()` /
`QLOBE_DEBUG.nextCase()` drive to reach case-5 and screenshot the kitchen counter placement
directly — composited cleanly, both fig pieces glossy and grounded, no fringe.

**Sources kept**: `assets/source/sprites/hat-raw-9001-v2.png`/`.json`,
`assets/source/sprites/bat-raw-42-v4.png`/`.json` (edit-stage source; the accepted extraction is
at seed 9001, not encoded in this filename — see the sidecar), `assets/source/sprites/sun-raw-42-v2
.png`/`.json`, `assets/source/sprites/fig-raw-42-v2.png`/`.json`,
`assets/source/sprites/mat-raw-42-v2.png`/`.json`. Not shipped to the page.

**Not satisfied**: none. All five sprites in this pass's scope, plus the `footPad` grounding fix,
were produced and verified (alpha QA, in-room composite QA at true scale, and the full `qa.mjs`
gate) with no unresolved defects.
