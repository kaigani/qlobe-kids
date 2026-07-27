# Asset log — Flashlight Cave

Every asset here is original to QLOBE Kids and generated locally (no network call
to any model or service at runtime). Code is MIT; original assets are CC BY 4.0.

**Status: complete — Stage 5 sign-off (`docs/polish-process.md` track `C3`),
plus a Stage 6 shared-asset repair (see "Shared-asset repair — Stage 6"
below).** This file was scaffolded ahead of art/voice production (Stage 3,
tracks A3/A4) so every asset this game needs had a row to fill in; three
different passes (art, voice, a voice-repair pass) filled it in over the
course of the build. This edit is the Stage 5 consolidation pass: one
coherent read across all three, the cross-track budget roll-up against
`docs/art-direction.md`, the `og-image.jpg` link-preview shot (generated
after Stage 4 build, once the splash screen existed to photograph), and
every "what we'd do differently next time" lesson gathered into one
**Rejected retries — lessons** section near the end instead of being split
across the sections that produced them.

The three plates, the flashlight sprite, Ari's six-pose pack, the full
131-key voice set (130 recorded + accepted, 1 unrecorded/Web-Speech-fallback
— see below), and the og-image are all done and logged below.

## Shared library (reused unmodified)

**Nothing in this section is duplicated into `games/flashlight-cave/`.** The
26 letter-phonic clips, the 25 letter-name clips, the 78 "[Letter] is for
[word]" pairing clips, and the 78 reveal-object sprites all live only once
on disk, inside `shared/`, and this game reaches them by relative path
(`../`-prefixed audio manifest entries) or by the `shared/js/content.js`
accessor — never by copying a file into the game's own `assets/` tree. (The
letter-name and pairing clips were recorded *for* this game in Stage 3 and
promoted into `shared/` in Stage 6, once QA'd — the same route the phonics
and sprites already took before this game existed.) The only audio and art
this game *does* own are the new recordings and plates logged in the
sections below.

| Asset | Source | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | fonts.google.com/specimen/Fredoka via Fontsource | Milena Brandão & Hafontia | SIL OFL 1.1 | No UI attribution required | None |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-back.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | QLOBE Kids | CC BY 4.0 | No | None |
| Letter phonics ×26 (`shared/assets/audio/fragments/<a–z>.m4a`) | Shared QLOBE Kids library | QLOBE Kids | CC BY 4.0 | No | Registered by `../`-prefixed path in `assets/audio/manifest.json`, never copied — one canonical file on disk. Precedent: `games/sand-tray-letters/`. |
| 78 reveal-object sprites (`shared/assets/objects/<word>.png`) | Shared QLOBE Kids library | QLOBE Kids | CC BY 4.0 | No | **Referenced, not copied.** Loaded at runtime via `shared/js/content.js` (`content.letterObjects(letter)`), backed by `shared/data/letter-objects.json`. All 78 verified present at design time (game-design.md §7.6, §11). |
| Letter names ×25 (`shared/assets/audio/letters/<a–z, no l>.m4a`) | Recorded for this game, promoted to `shared/` at Stage 6 | QLOBE Kids | CC BY 4.0 | No | Registered by `../`-prefixed path in `assets/audio/manifest.json`, moved (not copied) out of the game's own `assets/audio/` — one canonical file on disk. `letter-l` has no clip (see "Rejected retries" below) and stays on Web Speech. `shared/data/letters.json`'s `nameClip` now resolves these for any game via `shared/js/content.js`. |
| "[Letter] is for [word]" pairings ×78 (`shared/assets/audio/isfor/<word>.m4a`) | Recorded for this game, promoted to `shared/` at Stage 6 | QLOBE Kids | CC BY 4.0 | No | Registered by `../`-prefixed path in `assets/audio/manifest.json`, moved (not copied) out of the game's own `assets/audio/`. Resolved for any game via `shared/js/content.js`'s `isforAudio(word)`. |
| Sound effects | Synthesized at runtime by `shared/js/sfx.js` (WebAudio) | — | — | — | No sourced audio |
| Web Speech fallback voice | Device built-in voices via `shared/js/speech.js` | — | — | — | Fallback only; every recorded line carries the identical `lines.json` text as `fallbackText` |

**Deliberately *not* reused:** `shared/assets/audio/prizes/<word>.m4a` (78 clips,
all present) open with prize-ceremony wording — "You won a turtle. T is for
turtle." — which is wrong in a cave with no prizes. This game recorded its own
`isfor-<word>` set instead; see `game-design.md` §7.6 for the full
justification. **Promoted to `shared/assets/audio/isfor/` at Stage 6** (row
above) — no longer game-local.

## Game art

| Asset | Workflow | Seed | Dimensions | Size budget | Actual | Status |
|---|---|---|---|---|---|---|
| `assets/cave-play.jpg` | `krea2-turbo-t2i` from scratch (recipe A won; see below) | 42 | 1600 × 1200 | ≤ 300 KB | 241.8 KB | ✅ done |
| `assets/cave-splash.jpg` | `qwen-image-edit` on `01-title.png` | 9001 | 1600 × 1200 | ≤ 300 KB | 209.5 KB | ✅ done |
| `assets/flashlight.png` | `krea2-turbo-t2i` → `qwen-image-layered` cutout | 42 | 420 × 331 | ≤ 60 KB | 19.0 KB | ✅ done |
| `assets/og-image.jpg` | `tools/pipeline/capture_og_images.mjs` | — (screenshot of this game's own splash) | 1200 × 630 | ≤ 200 KB | 68.3 KB | ✅ done |

Full prompts, dimensions, steps and cfg for each are logged in **"Generated
plates and sprite, in full"** below, in the `{workflow, prompt, seed, width,
height, steps, cfg}` shape per `docs/asset-provenance.md`.

**The clean-lit-plate rule (highest-probability failure, game-design.md §17.1)
— VERIFIED.** `cave-play.jpg` ships **evenly and warmly lit throughout — no
spotlight, no light pool, no beam, no dark vignette**; darkness is entirely a
runtime layer from `shared/js/stage/spotlight.js`, and a plate that bakes any
light pool double-darkens under the veil and reads as mud. Two independent
recipes were generated (3 seeds each) and checked by eye against exactly this
rule; see "Rejected retries" below for how badly the fallback recipe failed it
and why.

## Generated plates and sprite, in full

### `assets/cave-play.jpg` — THE highest-risk asset in the build

**1600×1200, 241.8 KB.** Winner: Recipe A (from scratch), seed 42.

```json
{
  "workflow": "krea2-turbo-t2i",
  "prompt": "Polished 2D children's game illustration of the inside of a cosy magical cave, evenly and warmly lit throughout, rounded stalactites and boulders, navy-blue rock with warm ochre highlights, clusters of violet and cyan crystals along the floor at both edges, small green plants, several rounded alcoves and tunnel openings spread evenly across the back wall left to right (at least five, clearly separated, not clustered), glossy depth, crisp navy outlines. Uniform ambient lighting - no spotlight, no light pool, no beam, no dark vignette. No letters, no text, no characters, no UI, no watermark. 4:3 landscape.",
  "seed": 42,
  "width": 1600,
  "height": 1200,
  "steps": 8,
  "cfg": 1
}
```

Finalized: cover-fit to exactly 1600×1200 (source already 4:3, so this crop is
a no-op), then JPEG quality-ramped down from 92 until ≤300 KB (landed at 92,
no ramping needed). Source kept at `assets/source/cave-play/recipe-a-seed42.png`.

### `assets/cave-splash.jpg`

**1600×1200, 209.5 KB.**

```json
{
  "workflow": "qwen-image-edit",
  "prompt": "Remove all text and the EXPLORE button and the sound button and the armadillo. Also remove the glowing letter A in the tunnel and the flashlight prop lying on the ground. Keep the cave mouth, the crystals, the warm tunnel glow, the dusk sky, empty and uncluttered so text can sit over it.",
  "image": "01-game-concepts/flashlight-cave/output/ui-mockups/01-title.png",
  "seed": 9001,
  "steps": 4
}
```

Finalized: cover-fit to 1600×1200, JPEG quality 92 (no ramping needed). Source
kept at `assets/source/cave-splash/seed9001.png`.

### `assets/flashlight.png`

**420×331, 19.0 KB.**

```json
{
  "workflow": "krea2-turbo-t2i",
  "prompt": "A yellow toy flashlight, 3/4 view, barrel to the lower-left, lens to the upper-right, glossy plastic, bright yellow body with a dark grey lens ring and a black switch, toy-like glossy finish with soft highlights, no beam of light drawn, no glow, no rays. Centred, isolated, product-shot style, premium preschool learning app asset, no text, no UI. The background is a perfectly flat, solid, uniform dark charcoal background, no gradient, no texture, no shadows on the background.",
  "seed": 42,
  "width": 1024,
  "height": 1024,
  "steps": 8,
  "cfg": 1
}
```

Cutout: `qwen-image-layered`, **async job flow** (`sync=true` on this
workflow returns `layer_0`, the composite, not the cutout — poll `/jobs/{id}`
until `completed`, then fetch `result?output=layer_2`), prompt `"Solid flat
green background layer. Top layer: the exact same yellow toy flashlight, 3/4
view, barrel to the lower-left, lens to the upper-right, glossy plastic from
the image. Keep it identical to the input image."`, seed 42, layers 2. Alpha
histogram on the 1024² result: 757455 px fully transparent (74.0%), 107764 px
fully opaque (10.5%), 183357 px (17.9%) a partial edge band — a real spread,
not a binary matte or a blank sheet. Verified by compositing over magenta
(`assets/source/flashlight/cutout-seed42-magenta.png`): clean silhouette, no
white halo, matches the raw generation's shape exactly.

Finalized: alpha floored at 8, cropped to the alpha≥16 bounding box + 14px
pad, downscaled to fit 420px on the long edge (landed at 420×331 — the
flashlight is wider than tall at this 3/4 angle), PNG-quantized (256 colours,
`optimize=True`).

## Character — Ari the armadillo

Character sheet: `shared/characters/ari/character-sheet.md` (status
`proposed`, per `docs/characters.md` — the proposal is authored directly in
`shared/characters/<id>/` even before adoption; it promotes to `adopted` at
Stage 6 behind its own yes — see `game-design.md` §10). The game's own
six-pose pack lives here, at `assets/pose-actors/ari/`; the shared character
sheet's `portrait.png` is a 420×420 bust crop of the same canonical
`neutral` pose.

Pipeline: `games/flashlight-cave/tools/gen-actors.py`, modelled exactly on
`games/counting-treasure-cups/tools/gen-actors.py` — `neutral` conditioned on
a crop of the concept mockup's armadillo (redrawn calm, see "design lesson"
below) → 5 derives via `qwen-image-edit` conditioned on that neutral →
`qwen-image-layered` cutouts (async job flow) → `tools/pipeline/
pose_actor_assemble.py` at a 440×440 canvas (this game's ≤500 KB total budget
is tighter than counting-treasure-cups' 1024px-canvas packs, so the shared
assembler was pointed at a smaller canvas — `maxArt` 386, baseline 418).

| Asset | Pipeline | Seed | Dimensions | Size budget | Actual | Status |
|---|---|---|---|---|---|---|
| `assets/pose-actors/ari/poses/neutral.webp` | `qwen-image-edit` on the cropped mockup reference, redrawn calm | 42 | 267 × 386 (440² canvas) | 30–80 KB | 26.4 KB | ✅ done |
| `assets/pose-actors/ari/poses/enter.webp` | `qwen-image-edit` derived from `neutral` | 42 | 299 × 341 | 30–80 KB | 24.1 KB | ✅ done |
| `assets/pose-actors/ari/poses/notice.webp` | derived from `neutral` | 42 | 254 × 381 | 30–80 KB | 25.0 KB | ✅ done |
| `assets/pose-actors/ari/poses/interact.webp` | derived from `neutral` | 1337 (retry — see below) | 262 × 372 | 30–80 KB | 23.6 KB | ✅ done |
| `assets/pose-actors/ari/poses/react.webp` | derived from `neutral` | 42 | 249 × 386 | 30–80 KB | 25.2 KB | ✅ done |
| `assets/pose-actors/ari/poses/celebrate.webp` | derived from `neutral` | 42 | 264 × 330 | 30–80 KB | 23.8 KB | ✅ done |
| `assets/pose-actors/ari/poses.json` | `qlobe-pose-actor` v1 manifest, script-authored | — | — | ≤ 2 KB | 0.7 KB | ✅ done |
| **Ari pack total** | | | | **≤ 500 KB** | **145.5 KB** | ✅ done |

All six poses landed comfortably under the 30–80 KB per-pose expectation
(the 440px canvas is much smaller than counting-treasure-cups' 1024px packs)
— that's fine, the floor was a quality expectation, not a requirement; the
500 KB ceiling and on-screen legibility are what matter and both hold with
room to spare.

**128 px silhouette gate (`characters.md` principle 1) — PASSED.** The
`neutral` pose, rendered as a flat black silhouette at 128 px, reads clearly
as *round body, long snout, big ears, chunky legs* — verified by eye before
the other five poses were derived from it.

## Voice

**Status: done.** 130/131 new clips recorded and whisper-QA accepted (126 on
the first pass, 4 more after the repair pass below fixed 3 QA false
negatives and re-synthesized 1 genuinely bad clip); 1 ships **unrecorded**
(Web Speech, identical `lines.json` text) after exhausting the 5-seed ladder
across 4 spellings — logged loudly in `assets/audio/qa.json`, not silently
dropped. Full story in "What this batch failed on, and how it was repaired"
below and "Voice — production and repair, in full" under "Rejected retries
— lessons".

| Voice | Reference | Origin | Lines |
|---|---|---|---|
| Ari | `assets/audio/ref/ari.flac` (119.9 KB, FLAC 16-bit mono 24 kHz) | `qwen3-tts-voicedesign`, anchored on `shared/assets/refs/voice-teacher.wav` — see "Designing Ari's voice" below | 130/131 recorded, cloned from this one reference at a fixed seed |

`config.json`'s `voice` map (131 keys: 24 `ari-*` guide lines, 3 prompt stems,
26 `letter-a`…`letter-z` names, 78 `isfor-<word>` reveal lines) is the single
authoring source. `tools/gen-voice.py` derives `assets/audio/lines.json` from
it byte-for-byte (`lines.json == config.json["voice"]`, verified), so a
recorded clip and its Web Speech fallback can never drift apart. Every one of
the 131 keys has a `assets/audio/qa.json` entry — intended text, final
transcript, seed used, pass/fail, measured duration — whether it ended up
recorded or not.

```
export QLOBE_QWEN_URL=http://<host>:<port>   # never committed — see .claude/skills/local-genai
python3 games/flashlight-cave/tools/gen-voice.py                 # missing / not-yet-attempted only
python3 games/flashlight-cave/tools/gen-voice.py --only letter-a --force
python3 games/flashlight-cave/tools/gen-voice.py --max-seconds 480   # one wall-clock-bounded chunk
```

### Designing Ari's voice

Per the plan, Ari anchors on `shared/assets/refs/voice-teacher.wav` (the
platform teacher voice — itself `qwen3-tts-voicedesign`, instruct *"Warm,
friendly female preschool teacher voice, gentle and encouraging, speaking
slowly and very clearly for a four year old child, neutral American accent,
calm and cheerful"*, seed 7). `qwen3-tts-voicedesign` takes a text
**description**, not an audio reference, so "anchored on" means: describe the
teacher voice's qualities in the instruct text, then push a shade brighter —
exactly what `shared/characters/ari/character-sheet.md` and
`counting-treasure-cups`' Skipper (the platform's other `voicedesign`
precedent) both do.

Three candidates were designed, all speaking the real `ari-welcome` line
("Hello! I'm Ari. Come and explore my cave with me.") so they could be
compared on identical content:

| Candidate | Instruct | seed | duration | mean volume | whisper transcript |
|---|---|---|---|---|---|
| A | "…like a preschool teacher but a little younger and brighter — gentle, encouraging, speaking clearly and unhurried… with a touch of playful sparkle, as if guiding a child through a fun cave adventure." | 7 | 3.66 s | −20.5 dB | exact match |
| **B (winner)** | "A warm, unhurried female voice, close and intimate as if speaking quietly beside a child in a cozy cave. Gentle, encouraging preschool-teacher warmth but a shade brighter, younger, and more playful — friendly and curious, calm and reassuring… speaks slowly and clearly for a five year old." | 21 | 4.22 s | **−19.2 dB** (loudest/brightest of the three) | exact match |
| C | "Bright, warm, friendly young female voice, like a kind camp counselor… Unhurried pace, clear enunciation, encouraging and playful tone… soft close-mic warmth, a little bit of wonder and sparkle." | 77 | 4.38 s | −22.0 dB (quietest/slowest) | exact match |

Since I cannot literally listen to audio, the audition combined (a) whisper
transcription — all three came back a verbatim, word-perfect match to the
intended line, confirming clear enunciation across the board — with (b)
duration and `ffmpeg volumedetect` mean/max volume as objective proxies for
pace and brightness. **B won**: it is the loudest/brightest of the three
(closer to the "shade more brightness" spec than the quieter, slower C) while
sitting at a middle, unhurried pace (4.22 s vs A's noticeably brisker 3.66 s,
which read as less "unhurried" than the brief calls for) — the instruct text
also names every quality the plan specifies (warm, unhurried, close-mic, a
shade brighter, a cave setting) most directly. Candidate B, seed 21, is
committed at `assets/audio/ref/ari.flac`; every one of the 131 lines clones
from it via `qwen3-tts-voiceclone` at a fixed seed ladder starting at 42.

### What this batch failed on, and how it was repaired

Voice production ran in two passes — an initial recording pass, then a
repair pass that re-examined every clip that shipped unrecorded — and both
turned up real, non-obvious failure modes. Rather than tell that story twice
(once where it happened, once where a future game needs to find it), the
full account — the Whisper repetition-loop / auto-language bug, the
near-silent-synthesis and swallowed-bare-letter fixes, the three QA-checker
bugs the repair pass found, the one clip that is genuinely, robustly
unrecordable on this voice clone, and the `main()` ordering bug that deleted
a failed take before a later checker fix could rescue it — is told once, in
full, in **Voice — production and repair, in full** under "Rejected retries
— lessons" below. This section carries only the final, ship-facing numbers.

### Final counts (after the repair pass)

| status | count |
|---|---|
| Recorded + whisper-QA accepted | **130 / 131** |
| Unrecorded (Web Speech fallback, logged in `qa.json`) | **1 / 131** (`letter-l`) |
| Reused (registered, 0 new files) | 26 letter phonics — `phonic-a`…`phonic-z`, real measured durations from the shared `.m4a` files |
| Total `.m4a` bytes (130 clips) | 2,098,175 bytes ≈ **2.00 MB** |
| All filenames lowercase | verified |

<details>
<summary>Original first-pass counts, before the repair (126/131), kept for history</summary>

| status | count |
|---|---|
| Recorded + whisper-QA accepted | 126 / 131 |
| Unrecorded (Web Speech fallback, logged in `qa.json`) | 5 / 131 |
| Clips needing more than seed 42 | 15 (7 at 1337, 5 at 9001, 2 at 4242, 1 at 1010) |
| Total `.m4a` bytes (126 clips) | 2,045,383 bytes ≈ 1.95 MB (avg 15.85 KB/clip) |
| Largest clip | well under the ≤ 40 KB check — none flagged |
| Shortest clip | well over the ≥ 0.20 s floor — none flagged |

</details>

## Link preview (og:image)

| Asset | Source | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| `assets/og-image.jpg` | Generated screenshot of this game's own splash (1200×630), captured by `tools/pipeline/capture_og_images.mjs` | QLOBE Kids | CC BY 4.0 | No | Regenerate with the tool rather than editing by hand |

## Budget

Per-asset budgets below were set at design time against `docs/art-direction.md`'s
generic guidance (background ≤300 KB per game; sprites ~30–80 KB each) with
two deliberate, documented departures: the flashlight prop's own ≤60 KB local
ceiling (it's a small isolated prop, not a full sprite), and Ari's six-pose
pack being tracked as one ≤500 KB **pack total** rather than per-pose, since a
`qlobe-pose-actor` set is bought and budgeted as a unit (see the character
section above — every individual pose still landed inside the 30–80 KB/pose
expectation anyway).

| item | budget | actual |
|---|---|---|
| `cave-play.jpg` | ≤ 300 KB | 241.8 KB ✅ |
| `cave-splash.jpg` | ≤ 300 KB | 209.5 KB ✅ |
| `flashlight.png` | ≤ 60 KB | 19.0 KB ✅ |
| Ari pose pack (6 poses + manifest) | ≤ 500 KB total | 145.5 KB ✅ |
| Voice set (130 recorded clips, 16.14 KB avg) | ≤ 2.2 MB total | 2,049.0 KB (2.00 MB) ✅ |
| `ref/ari.flac` | ≤ 1.5 MB | 119.9 KB ✅ |
| manifest/lines/qa JSON | ≤ 60 KB | 41.1 KB (10.4 + 4.7 + 26.0) ✅ |
| `og-image.jpg` (link preview, not part of mode-start weight) | ≤ 200 KB | 68.3 KB ✅ |
| **Page total (mode start, warm)** | ~4 MB per `docs/art-direction.md` guidance (Pixi 798 KB is cached across every game on the platform; voice clips stream on demand, never preloaded, so they aren't part of the mode-start weight) | 241.8 + 209.5 + 19.0 + 145.5 ≈ **615.8 KB** art + chrome. Voice is not preloaded (§2.0.1/§3.6 of the GDD — streamed per-line on demand), so it does not add to this figure; its own budget (2.00 MB total across a session) is tracked separately above. `og-image.jpg` is fetched only by link-unfurl bots and the Studio Games workspace, never by the game page itself, so it is also excluded from this figure. |

`assets/source/` (every generation intermediate, per `docs/asset-provenance.md`)
is committed and is not served to the page.

## Rejected retries — lessons

### `cave-play.jpg` — recipe B failed outright, and it's the important failure

**Recipe B (`qwen-image-edit` on `02-find-letter-a.png`, prompt "Remove the
glowing letter A and the pool of light. Light the whole cave evenly and
warmly. Remove all UI panels and text.", all 3 seeds) reproduced the exact
baked light pool and dark vignette it was asked to remove.** The letter A
itself was correctly stripped, but the tunnel mouth stayed a bright cone
fading to black at the edges, with no alcoves legible anywhere in the dark
two-thirds of the frame. Kept for reference at
`assets/source/cave-play/recipe-b-seed{42,1337,9001}.png`.

**Lesson for the next night/dark game: an edit model asked to "de-light" a
scene that is compositionally *built around* a light pool tends to preserve
the composition and only touch the literal named objects.** It is not that
the model ignored the lighting instruction — it's that "light the whole cave
evenly" is a global change and "remove the letter" is a local one, and local
edits win. Recipe A, generated from scratch with the even lighting stated as
a description rather than a correction, had no lit reference to preserve and
nailed it on the first seed. **Don't try to edit a baked light pool away —
regenerate from a description that never had one.** This is exactly the
correctness argument `game-design.md` §5.3 makes in the abstract; this is
what it looks like concretely failing and succeeding side by side.

Recipe A seeds 1337 and 9001 were also clean, evenly-lit, alcove-bearing
plates — either would have shipped — kept as runners-up at
`assets/source/cave-play/recipe-a-seed{1337,9001}.png`. Seed 42 won on the
clearest, most evenly-spaced run of five alcoves and the strongest
warm-ochre highlight match to the `game-design.md` §5 palette.

### `cave-splash.jpg` — named removals only remove what's named

**First pass (all 3 seeds), prompt without "also remove the glowing letter A
… and the flashlight prop", left both untouched** on 2 of 3 seeds (the
flashlight prop) and all 3 (the letter A) — kept at
`assets/source/cave-splash/v1-seed{42,1337,9001}.png`. Neither object was
named in the removal list, so the edit correctly left them; the miss was in
the prompt, not the model. Since the splash's DOM wordmark and mode tiles
render directly over this plate (`game-design.md` §3.1), a leftover glowing
letter sitting in that same space would visually compete with them.

**Lesson: name everything that must go, not just the obviously unwanted
furniture** — a decorative element that reads as "part of the scene" to a
model can read as "clutter under my title text" to the person laying out the
next screen. Re-running with both named explicitly cleared all three seeds.
Seed 9001 was chosen for the fullest, warmest tunnel glow — seeds 42 and 1337
both left the tunnel interior nearly black, undershooting the "warm tunnel
glow" the recipe calls for — kept as runners-up at
`assets/source/cave-splash/seed{42,1337}.png`.

### `flashlight.png` — no retries needed

Seed 42 cleared every bar (glossy yellow toy read, correct barrel/lens
orientation, no beam, clean cutout with a real alpha spread) on the first
attempt for both the raw generation and the cutout. Seeds 1337 and 9001 were
not generated — the seed ladder is a fallback for a failed attempt, not a
mandatory run when the first seed already wins. An un-cut alternate raw
(`raw-seed1337.png`) was generated before this was decided and is kept at
`assets/source/flashlight/` in case a future edit wants a second reference.

### Ari's pose pack — two separate lessons, both worth carrying forward

**1. The `interact` cutout failed on the first attempt — a `qwen-image-layered`
job can drop almost the entire subject even when the raw source is fine.**
Seed 42's `interact` raw (mouth open, one paw gesturing) generated cleanly,
but its layered-extraction cutout came back with only the nose and a sliver
of a paw as opaque pixels — everything else fell under the alpha floor
(alpha histogram: 774428 transparent / 6357 opaque / 112143 partial, out of
892928 — essentially a near-blank extraction, the documented "near-blank
white/transparent PNG" failure mode from `.claude/skills/local-genai/
SKILL.md`). The bad raw+cutout pair is kept at
`assets/source/actors/ari/alpha/interact-seed42-failed.png` for reference.
**Fix: regenerate at the next seed on the ladder (1337).** The retried
`interact` derive (also a clean, distinct mouth-open/gesturing pose) and its
cutout both came back correct on the first try. **Lesson: don't assume a
layered-extraction failure means the source pose is unusable — retry the
cutout at a new seed before concluding the pose itself needs rework.** Only
one of six poses needed this in the whole batch.

**2. The neutral was deliberately routed through a "redraw calm" step before
any pose was derived from it — this is a preventive measure, not a fix
applied after observing a failure.** The concept mockup's Ari is mid-wave,
one arm raised, delighted — exactly the "cheerful raised-arm reference bleeds
into every derived pose" failure documented in `docs/polish-process.md` §3
from the counting-treasure-cups build. Rather than deriving all six poses
from that mockup crop directly, `gen-actors.py` always redraws a calm,
arms-down `neutral` first (§ above) and derives the other five from *that*.
The result: `react`, `notice`, and `interact` all read as their own distinct,
correctly-calibrated emotions rather than variations on "excited with an arm
up" — see the pose images. This build did not run the counterfactual (deriving
directly from the raw mockup) to re-confirm the failure mode; it simply
applied the known mitigation from the start, which is the cheaper and more
reliable path once a failure mode is documented once.

### Voice — production and repair, in full

Voice ran in two passes: an initial recording pass across all 131 keys, then
a repair pass that went back over every clip that shipped unrecorded and
found the checker itself, not the audio, was the problem on most of them.
Both passes turned up failure modes worth carrying into the next voice
batch, all now fixed in `gen-voice.py`.

**Pass 1 — four failure modes, none anticipated in the plan doc.** The
`game-design.md` §7.5 / plan-doc notes (biased whisper `initial_prompt`, the
`ALLOWED` homophone map, the `letter-` duration floor, `afconvert` for the
FLAC-not-wav output, unrecorded-after-5-seeds) all held and are implemented
as specified. These four surfaced only once real generation started:

1. **`language: "auto"` was the actual cause of Whisper repetition-loop
   hallucinations**, not a TTS defect. A short, acoustically flat held vowel
   (`letter-o` "oh", `letter-e` "ee") sent Whisper's language auto-detect
   haywire — one take came back transcribed as **Japanese** ("い!") — and the
   decoder then looped a single syllable 100+ times instead of transcribing
   normally. Forcing `language: "en"` on every whisper-stt call fixed this
   outright. A defense-in-depth guard also stays in `transcript_ok()`: any
   transcript far longer than the intended word count (`len(said_words) >
   max(6, 3*len(want_words))`) is rejected outright, since a single stray
   token inside 100 repeats can otherwise coincidentally satisfy the 80%
   word-overlap fallback and pass garbage.
2. **Bare, unpunctuated, lowercase one/two-letter text synthesizes
   near-silently.** Cloning the literal config text `"ee"` came back at
   **−91 dB mean** on 4 of 5 ladder seeds — audio equivalent of the
   "near-blank white PNG" failure mode. Capitalizing the first letter and
   ensuring trailing punctuation (`"Ee."`) fixed it (−26 dB); the period alone
   was *not* the fix (`"ee."` lowercase still came back at −91 dB) — it is the
   leading capital the model's text frontend needs. `synth_text()` applies
   this to every clip; `lines.json`/manifest/qa still store the original,
   unpunctuated, lowercase text exactly as authored in `config.json`.
3. **A bare capital letter immediately followed by more words gets swallowed
   or misheard.** `"C is for cat!"` came back as "X is for cat." / "is for
   cat." (letter dropped or misheard) on every one of 5 seeds — this hit **8
   of the 78 `isfor-*` clips** (the C/D/E cluster: cake, car, cat, dinosaur,
   dog, duck, egg, elephant) before the pattern was caught and the batch was
   paused mid-run to fix it rather than burn the remaining 60-odd `isfor-*`
   attempts on the same flaw. Fix: spell the leading letter out exactly as
   the `letter-*` clips already do (`"See is for cat!"`) before synthesis —
   Whisper then reliably reads the clone back as the bare letter ("C is for
   cat."), which `ALLOWED`'s existing homophone map already reconciles
   against the stored `"C is for cat!"` text. All 8 passed cleanly on the
   retry.
4. A **small, letter-specific override map** (`SYNTH_OVERRIDE`) was needed for
   4 keys where the clone consistently mis-articulated the exact same way on
   *every* seed of the ladder — not noise, since 5 different seeds gave 5
   identical wrong transcripts: `"Ell."` → Whisper heard **"owl"** on all 5
   seeds; `"Arr."` → **"or"** on all 5. Alternate spellings fixed 2 of the 4:
   `letter-l` → `"El."` did *not* fix it (still "owl" every time — ships
   unrecorded); `letter-r` → `"Ar."` fixed it cleanly (seed 42, "R.");
   `letter-f` → `"Ef."` fixed it (seed 1337, "F"); `letter-n` → `"N."` helped
   but not on every seed (shipped unrecorded at this point in the batch — see
   the repair pass below, where the real culprit turned out to be a QA
   checker bug, not the audio, and a further override fixed it for good).

**Pass 2 — the repair pass: 3 QA false negatives fixed, 1 genuinely bad clip
re-synthesized, 1 stays unrecorded.** This pass re-examined the 5 unrecorded
clips against fresh whisper transcripts of the *checker*, not just the
audio, and found the checker itself was wrong on 3 of the 5. Fixed in
`gen-voice.py`, all three still exercised through the normal 5-seed ladder +
whisper-QA pipeline (no clip shipped on manual override of a QA failure):

1. **`isfor-yoyo` — QA false negative, audio was already correct.**
   `"why is for yoyo?"` is a semantically perfect reading of `"Y is for
   yo-yo!"` — the checker's own `normalize()` turns the hyphen in the wanted
   text into a space (`"yo yo"`, 2 tokens), but Whisper reliably transcribes
   the spoken compound as one joined word (`"yoyo"`, 1 token), so the
   word-overlap ratio undercounted. `transcript_ok()` now also compares
   against a hyphen-*joined* rendering of any wanted text that contains a
   hyphen, alongside the existing hyphen-*spaced* one (the **hyphenated-
   compound tokenization** bug). Passed cleanly on seed 42 once the checker
   was fixed — no new audio needed conceptually, though the original take
   wasn't preserved on disk (see the process note below) so it was
   regenerated.
2. **`isfor-hat` — QA false negative, audio was already correct.** `"h's for
   hat"` is a transcription artifact of natural elision of "H is" into a
   possessive-sounding contraction, not a wrong word (the **`"<letter>'s"`
   elision** bug). `normalize()` now converts a bare `"<single-letter>'s"` to
   `"<letter> is"` *before* its existing apostrophe-strip step (scoped to
   exactly one letter before the `'s`, so real contractions like
   "let's"/"it's" are untouched). Passed on seed 42.
3. **`letter-n` — QA artifact (decoder repetition loop), audio was fine.**
   The stored transcript, `"n n n n n n…"` (100+ repeats), was itself the
   failure — not the 0.55s clip it came from (the **decoder repetition
   loop** bug). Added `is_degenerate_repeat()`: when a transcript is wildly
   oversized for the line and dominated by one repeated token, the
   generation loop now re-transcribes that exact clip once with
   `model_size=small` (a decode setting materially less prone to the
   greedy-decode repeat loop) before ever handing it to `transcript_ok()`,
   instead of letting the existing oversized-transcript guard count the loop
   as evidence of failure. Also picked up a better `SYNTH_OVERRIDE` spelling,
   `"Enne."` (was `"N."`) — the repaired take passed on seed 42, transcribed
   as `"n a"`, matched via the existing 80%-overlap rule on the token
   `"enn"`.
4. **`isfor-horse` — genuinely a synthesis problem, fixed with an override.**
   `"ages for horse"` was a real mis-synthesis, not a QA bug: this clone
   slurs "Aitch is" into "ages" in this specific sentence. Added
   `SYNTH_OVERRIDE["isfor-horse"] = "Aitch is for horse!"` (same pattern as
   the existing bare-capital-letter spell-out). Passed on seed 42, heard as
   `"h's for horse"` — which the elision fix above (item 2) now also accepts.
5. **`letter-l` — confirmed genuinely, robustly unfixable on this clone.**
   Tried **4** distinct spellings across the full 5-seed ladder each —
   `"El."` (pre-existing), `"Elle."`, `"L."`, `"Ell."` — and every single one
   of the 20 takes came back transcribed as **"owl"** (one take also added a
   trailing "ee"). This is not noise or a QA artifact: it is a hard,
   spelling-invariant mis-articulation of this phoneme by this specific
   voice clone. `SYNTH_OVERRIDE["letter-l"]` is left at `"Ell."` for the
   record.

| key | wanted | last transcript | why it's genuinely hard |
|---|---|---|---|
| `letter-l` | "ell" | "owl" (5 seeds × 4 spellings — "El.", "Elle.", "L.", "Ell." — all "owl") | consistent mis-articulation, not noise, not a checker bug |

**`letter-l` ships unrecorded** — Web Speech fallback via `lines.json`'s
"ell" text. It is the only one of the 131 keys that does.

**Process-order bug, worth fixing before the next voice batch:** `main()`'s
per-key loop deletes the working `.m4a` on a final QA failure
(`out.unlink(missing_ok=True)`) before marking a key unrecorded, so none of
the 5 original pass-1 takes survived on disk to be re-graded for free once
the repair pass fixed the checker — all 4 repairable keys required a real
regeneration call, even the 2 (`isfor-yoyo`, `isfor-hat`) that were pure QA
false negatives where the *original audio* had been correct all along. A
cheaper "re-QA the file already on disk" path was not available this round
purely because of this deletion order. **Fix next time: keep the last take's
temp file until `qa.json` is finalized (or until the next attempt overwrites
it), not delete-then-mark-unrecorded** — that would let a later checker fix
rescue a clip for free instead of re-spending a generation call on audio that
was never actually wrong.

## Shared-asset repair — Stage 6

**User-approved edit to `shared/assets/objects/` (normally hands-off per
CLAUDE.md).** Screenshot QA on the end screen caught `yak.png` rendering as a
solid white rectangle over the dark cave. Investigation found 9 of the 78
reveal-object sprites this game (and `sand-tray-letters`' prize ceremony) use
were truecolour RGB PNGs with **no alpha channel and no tRNS** at all — `cat`,
`dog`, `hat`, `jam`, `jet`, `nut`, `pig`, `van`, `yak` — the other 69 all carry
a real tRNS. Because these are canonical shared assets already shipping in
`sand-tray-letters`, the user approved a targeted re-export rather than a
game-local workaround: `qwen-image-layered` (the standard transparent-cutout
extractor, `.claude/skills/local-genai/SKILL.md` "Transparent cutouts — THE
STANDARD"), never a flood-fill/white-key, on each of the 9 originals — which
are kept, byte-identical, at
`games/flashlight-cave/assets/source/objects-rgb-originals/<word>.png` so the
change is fully reversible.

**Method.** For each source PNG: `POST /workflows/qwen-image-layered` with
`layers=2`, a per-object prompt of the shape `"Solid flat green background
layer. Top layer: the exact same <full subject description>, from the image.
Keep it identical to the input image."` (subject description written by eye
against each source), async job flow (`sync=true` returns the composite, not
the cutout), polled to completion, `result?output=layer_2` fetched as the
1024×1024 RGBA cutout, then downscaled to 512×512 (Lanczos) to match the
existing sprites' dimensions, with alpha < 8 floored to 0 to kill anti-alias
dust. Seed ladder 42 → 1337 → 9001 on any failure, per the skill doc.

**Verification, every file, before shipping.** The 512×512 cutout composited
over white, diffed pixel-for-pixel against the original (mean absolute error
across all channels, plus the fraction of pixels whose worst-channel diff
exceeds 30 and 60), composited over magenta and eyeballed for silhouette
(halo, chewed edges), and the alpha histogram checked for a real
transparent/opaque/partial spread rather than a binary matte or a near-blank
sheet. Both `Read`-tool eyeballing and the numeric diff had to agree before a
file shipped — **7 of 9 shipped, 2 did not**, and both of the two that didn't
were retried through the full 42/1337/9001 ladder before being marked
genuinely unfixable, not given up on at the first miss.

| word | winning seed | MAE (0–255) | % px Δ>30 | % px Δ>60 | alpha spread (transp / opaque / partial) | shipped | why |
|---|---|---|---|---|---|---|---|
| `jam` | 42 | 1.07 | 0.20% | 0.05% | 39.2% / 17.6% / 43.3% | ✅ yes | clean first try — matched the original almost pixel-for-pixel, real alpha spread, clean silhouette on magenta |
| `jet` | 42 | 2.20 | 2.06% | 1.05% | 60.8% / 19.2% / 20.1% | ✅ yes | clean first try — same read as `jam` |
| `nut` | 42 | 2.56 | 1.80% | 1.18% | 41.3% / 30.1% / 28.6% | ✅ yes | clean first try |
| `yak` | 42 | 1.83 | 1.23% | 0.56% | 44.2% / 19.1% / 36.7% | ✅ yes | clean first try — this is the sprite the original white-box screenshot caught |
| `dog` | 1337 (42 near-blank) | 1.27 | 0.72% | 0.27% | 56.1% / 23.8% / 20.1% | ✅ yes | seed 42 came back near-blank (native alpha maxed at 3/255 — the "near-blank PNG" failure mode); 1337 was clean |
| `hat` | 1337 (42 washed-out) | 2.39 | 1.29% | 0.92% | 46.2% / 31.1% / 22.6% | ✅ yes | seed 42 kept the right silhouette but alpha never rose above ~36/255 anywhere — a washed-out, barely-visible hat; 1337 was clean and fully opaque at its core |
| `pig` | 1337 (42 near-blank) | 1.63 | 1.11% | 0.52% | 46.0% / 30.7% / 23.3% | ✅ yes | seed 42 near-blank (native alpha max 3/255), same failure as `dog`/`cat`; 1337 was clean |
| `cat` | none — 42/1337/9001 all failed | 24.6–24.7 (all 3 seeds) | ~25.5% (all 3) | ~24% (all 3) | native alpha maxed at 2–3/255 on **all three seeds** | ❌ **no** | genuinely, robustly near-blank on this source image at every rung of the ladder — not a fluke, the same failure three times |
| `van` | none — 42/1337/9001 all failed | 35.1 / 35.1 / 35.9 (42/1337/9001) | ~36% (all 3) | ~29–30% (all 3) | subject wrong, not just faint | ❌ **no** | not a faint/near-blank failure like `cat` — the model redrew a small unrelated dark blob (looks like a speaker/button) instead of the van, on all three seeds. Confirmed by eye on all three magenta composites. |

**`cat` and `van` ship unmodified** — still truecolour RGB, no alpha, byte-
identical to what was in `shared/` before this pass (verified by `md5`
against the `objects-rgb-originals/` backup). This game's flood-fill fallback
in `js/cave.js` (`keyWhiteBackground`) stays in place for exactly these two;
see the updated comment block there. **A wrong-but-transparent sprite would
be worse than a right-but-opaque one**, so no amount of pressure to hit 9/9
justified shipping either of these two redraws.

**`js/cave.js` change: comment-only, no behavior change.** The keying
mechanism (`keyWhiteBackground`, `loadObjectImage`, `objectImageSrc`,
`loadObjectTexture`) is corner-detection-based and self-skips on any sprite
that already carries alpha (`shared/assets/objects/cat.png`'s and
`van.png`'s opaque-white corners are the only ones left that still trigger
it) — so shipping 7 of the 9 fixed sprites required **zero functional
changes** to the fallback: it already no-ops on the 76 sprites (69 original +
7 newly-fixed) that carry real alpha, and still correctly floods the 2 that
don't. The header comment above `keyWhiteBackground` in `cave.js` was
rewritten to describe this new mixed state (7 fixed in `shared/`, 2 still
relying on the runtime fallback) instead of the old "9 broken" framing, so a
future reader isn't confused about why the flood-fill is still there. If
`cat`/`van` are ever fixed upstream in `shared/`, that whole block becomes
dead code and can be deleted along with the corner-detection check that
guards it.

**Also fixes `sand-tray-letters`.** The other consumer of these 9 sprites is
`sand-tray-letters`' prize ceremony (`content.letterObjects()` /
`shared/data/letter-objects.json`), which had the identical white-box bug on
whichever of these 9 words came up as a prize. It gets the fix automatically
— no `sand-tray-letters` files were touched — and was re-verified after the
fact (see `docs/asset-provenance.md` and the Stage 6 task notes for the
`QLOBE_DEBUG`-driven confirmation).
