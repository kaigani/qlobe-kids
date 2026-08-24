# Tweezer Rescue — asset production record

Art direction: **Claymation** (`config.json` → `artDirection: "claymation"`; no generic Stage v2
slug exists yet). Concept source: `../01-game-concepts/tweezer-rescue/` (brief + 4 mockups:
`01-rescue-select.png`, `02-tweezer-rescue.png`, `03-rescue-complete.png`).

The full job table, every generation prompt, and the deterministic finalize/keying/tweezer-split
logic live in **`tools/produce-art.py`** (resumable — `python3 tools/produce-art.py plan` prints
job status with no network calls). This file is the **provenance record**: what ran, what seed
was accepted, and every defect found + fixed during production. New assets are CC BY 4.0, created
for QLOBE Kids.

Style suffix (verbatim in every generation prompt, per `game-design.md`):

> Handcrafted claymation stop-motion style, soft modeling clay with visible fingerprints and
> sculpted seams, rounded hand-shaped forms, matte plasticine texture, warm studio light,
> cheerful preschool garden diorama. No text, no letters, no watermark.

## Pipeline

```
t2i        krea2-turbo-t2i    5 backdrops + 4 from-scratch sprite sources     seed 42
lockups    ideogram4-t2i      "Tweezer Rescue" title + "Hooray!" banner       seed 42
edit       qwen-image-edit    25 mockup lifts + recolor/icon-swap variants    seed 42
cutout     qwen-image-layered 16 async true-alpha cutouts                    seed 42 (+ ladder)
finalize   local PIL, no net  key/trim/pad/resize/encode, tweezer arm split,
                              magenta QA composites -> assets/source/qa/
```

All stages completed. Every sidecar `.json` beside its source under `assets/source/{raw,edit,
cutouts}/` records the workflow, verbatim prompt, seed, ref image and timestamp — this table is
the summary.

## Defects found and fixed during production

1. **Tweezer orientation mismatch.** The first `tweezers-open` lift from mockup 02 ("isolate...
   exactly as shown") came back as a vertical V (hinge at bottom, tips at top). `js/tweezers.js`
   (`DEFAULT_META`, the `-35deg` runtime rotation) and the deterministic arm-split algorithm both
   require a **horizontal** canonical pose — hinge on the right, tips on the left, arms mirrored
   top/bottom. Rewrote the prompt to explicitly force that orientation; the reroll matched exactly
   and the split QA (`assets/source/qa/tweezers-split.magenta.png`) recomposites pixel-identical
   to the source with the pivot/tip markers landing correctly.
2. **`stage_tweezers` hinge-detection bug.** The scan for the hinge zone started at the image's
   very last pixel column, but `alpha_trim`'s padding guarantees that column is empty — the loop
   broke on its first iteration every time, regardless of content (`ERROR no hinge zone found`).
   Fixed to skip the empty padding columns before requiring single-run contiguity.
3. **`counter-chip` stray fragment.** The first lift left a disconnected sliver of the blue banner
   at the top of the frame (the prompt said "below the blue banner" but never said to remove it),
   which would have corrupted the trim bbox into a two-blob canvas. Reworded the prompt to
   explicitly require the banner's total removal; the reroll is a clean single pill.
4. **`ladybug` and `bee` — `qwen-image-layered` failed on all 4 seed-ladder attempts** (42, 1337,
   9001, 7): mostly near-blank alpha washes (max alpha 3–20/255), one wrong-subject partial redraw
   (only the bee's wing/antenna fragment). Root cause is most likely that both subjects' black
   head/legs/stripes sit too close in luminance to the flat charcoal ground, confusing the
   generative separator. Both `EDIT/ladybug.png` and `EDIT/bee.png` are already clean, sharp-edged,
   single-object lifts with no fine fuzz that needs a *generative* alpha, so both were switched in
   `FINAL_SPECS` from the `src=` (layered-cutout) path to the `key=` (deterministic border-flood)
   path already used for the honeycomb/pools/buttons/cards/tweezers. Both re-finalized clean.
5. **`title`/`hooray` lockup interior holes.** The border-flood key only clears background pixels
   *connected to the image edge* — the charcoal gap between the "Tweezer" and "Rescue" lines (and
   inside a couple of letter counters) is fully enclosed by letterforms and stayed opaque black
   instead of transparent. Added an optional `close_holes` pass to `key_charcoal()` (keys any
   remaining background-colored pixel by color alone, not just connectivity) and enabled it for
   just the two lockups — **not** applied to the general `key` path, since other key'd assets (the
   ladybug, the tweezer hinge) have legitimate enclosed dark regions that must stay opaque.

6. **Art-director pass (B2/M1/M2) — `title.png` ornaments, `banner-hooray.png` and `card-fish.png`
   cutout debris.** Three defects caught by an adversarial art-director review after initial ship:
   - **B2 — title ornaments.** The generated tweezer icon beside "Tweezer" was flat vector-style
     clip-art (no clay texture, wrong silhouette vs. the shipped `tweezer-arm-*.png`), and both
     flower ornaments had rendering blotches and a wrong 5-point-star petal silhouette vs. the
     shipped `flower-pink.png` gerbera shape. First tried the preferred fix — a `qwen-image-edit`
     reroll of `RAW/title.png` with `image2=EDIT/tweezers-open.png` and `image3=EDIT/flower-pink.png`
     as real reference slots (new `title-ornaments` job, seeds 42 and 1337) — but the workflow
     collapsed onto a near-verbatim copy of `image2` and discarded the actual title canvas on both
     seeds, a repeatable failure of this 3-image-input call (kept under
     `assets/source/edit/title-ornaments.png` + sidecar as a documented failed candidate, not
     shipped). Fell back to the review's explicitly-blessed simplest fix: added
     `erase_color_blobs()` — a connected-component pass that matches ornament-only colors (clay
     blue, petal pink/red, center yellow, all well outside the cream letterform palette) and paints
     matching blobs ≥150px with the sampled background color before `key_charcoal` runs, so the
     border-flood key treats them as background. Scattered stray pixels inside letter shading that
     happen to match a color rule stay below the area threshold and are never touched. Letterforms
     ("Tweezer Rescue") are pixel-identical to the accepted, already-approved lockup — only the two
     ornament regions changed.
   - **M1 — `banner-hooray.png` cutout debris.** Two small disconnected clay blobs floated near
     each ribbon tail — the same defect class as fix #3 (`chip.png`) but undetected at the time.
     Added `keep_largest_component()` — a general connected-component alpha cleanup (BFS labeling,
     no numpy) that keeps the dominant silhouette plus any component whose bounding box overlaps
     it, and zeroes out everything else below 1% of the dominant's area. Wired in as
     `clean_components: True` on the `hooray` finalize spec; dropped exactly the two stray blobs
     (593px, 706px vs. a 96,179px dominant ribbon).
   - **M2 — `card-fish.png` frame sliver.** Investigation found this was *not* a disconnected
     island (`keep_largest_component` alone left it untouched, and a morphological-opening
     despeckle pass also failed — the defect is a ~2px outward bulge fused onto the frame's own
     anti-aliased edge across an 18-row run, so dilation always reconnected it to the true nearby
     edge value). Added `clone_stamp()` — copies a same-size patch from a nearby clean run of the
     identical straight edge (60px above, verified jump-free by a full boundary scan) onto the
     defect region *before* `key_charcoal` runs, so the deterministic key derives correct alpha for
     the patched area for free. Wired in via a new `patch` field on the `card-fish` finalize spec
     (`key_charcoal(..., patch=[...])`).

   All three fixes are deterministic, live in `tools/produce-art.py`, and re-verified via fresh
   magenta QA composites (`assets/source/qa/{title,banner-hooray,card-fish}.magenta.png`).

7. **`honeycomb.png` un-keyed inter-cell pockets — shipped-and-caught-in-production.** Two of the
   six hex cells' shared diamond notches rendered as a dark reddish-brown crevice-shadow color
   (~(60,3,0)) rather than the flat charcoal ground the rest of the background used — far enough
   from the sampled corner background (Euclidean distance ~83–120 vs. `key_charcoal`'s tol of 42)
   that the border flood-fill never reached them (they're fully enclosed, never touching the image
   edge). The existing `close_holes` pass (a single fixed-tolerance color match) was tested and
   confirmed *not* to close them either — wrong tool for a pocket whose color diverges this far
   from the reference. Visibly shipped as two floating black diamonds in the live bees-mode scene
   (`qa-shots/tweezer-rescue/prod2/01-bees-play.png`) until caught. Root cause of the whole defect
   class: `qwen-image-layered` (the platform's specified ML segmentation) was never attempted for
   honeycomb (or most other UI/prop assets) — it went straight to the deterministic `key` path,
   unlike `ladybug`/`bee` above, which only fall back to `key` after real, evidence-backed
   `qwen-image-layered` failures (defect #4). Regenerating this asset via `qwen-image-layered` is
   still not the right fix even now: honeycomb's exact cell geometry (used directly by gameplay
   anchors) must stay deterministic, same rationale as the tweezer split. Fixed with
   `close_dark_pockets()` — a bounded neighbor-chained color-flood ("magic wand") seeded at
   near-black pixels, capped by a small bounding-box footprint and hard drift distance from the
   seed, so it closes only small fully-enclosed pockets (verified: two regions, 2374px/2448px,
   bbox ~618–679×291–353 and ~480–540×292–354, exactly matching the two notches) without touching
   the six much larger legitimate hex-cell shadow interiors. Re-verified by direct alpha sampling
   at both former gap coordinates (now `(0,0,0,0)`) and a fresh magenta composite.

All fixes are in `tools/produce-art.py` (not hand-patched image files), so a future `--force`
rerun reproduces the same accepted result.

## Provenance — as shipped

| Asset | File | Accepted seed / path | Bytes | Note |
| --- | --- | --- | --- | --- |
| Splash backdrop | `assets/backdrops/splash.jpg` | 42 · krea2-turbo-t2i | 153 KB | Calm open center per spec |
| Ladybug garden backdrop | `assets/backdrops/ladybugs.jpg` | 42 · krea2-turbo-t2i | 148 KB | Blurred flowers at corners only |
| Bee meadow backdrop | `assets/backdrops/bees.jpg` | 42 · krea2-turbo-t2i | 111 KB | |
| Goldfish pond backdrop | `assets/backdrops/fish.jpg` | 42 · krea2-turbo-t2i | 172 KB | |
| Pom-pom corner backdrop | `assets/backdrops/pompoms.jpg` | 42 · krea2-turbo-t2i | 219 KB | |
| Title lockup | `assets/ui/title.png` | 42 · ideogram4-t2i, `close_holes` key, `erase_color_blobs` ornament removal | 94 KB | Spell-checked full size: "Tweezer Rescue" ✓. Ornaments (flat tweezer icon, blotchy flowers, see defect #6/B2) deterministically erased — clay letters ship alone |
| "Hooray!" banner | `assets/ui/banner-hooray.png` | 42 · ideogram4-t2i, `close_holes` key, `keep_largest_component` cleanup | 60 KB | Spell-checked full size: "Hooray!" ✓. Two disconnected debris blobs at the ribbon tails removed, see defect #6/M1 |
| Card — ladybugs | `assets/ui/card-ladybugs.png` | 42 · qwen-image-edit lift from mockup 01, key | 73 KB | |
| Card — bees | `assets/ui/card-bees.png` | 42 · qwen-image-edit lift from mockup 01, key | 72 KB | |
| Card — fish | `assets/ui/card-fish.png` | 42 · qwen-image-edit lift from mockup 01, key, `clone_stamp` frame-edge repair | 86 KB | Stray frame-edge sliver (fused bulge, not a disconnected island) repaired, see defect #6/M2 |
| Card — pom-poms | `assets/ui/card-pompoms.png` | 42 · qwen-image-edit variant of card-ladybugs, key | 63 KB | |
| Tweezer top arm | `assets/sprites/tweezer-arm-top.png` | 42 (reroll, corrected orientation) · deterministic split | 34 KB | Shares hinge with bottom arm; `tweezers.json` sidecar |
| Tweezer bottom arm | `assets/sprites/tweezer-arm-bottom.png` | 42 (reroll) · deterministic split | 34 KB | |
| Ladybug | `assets/sprites/ladybug.png` | 42 · qwen-image-edit lift, **key fallback** (layered failed ×4 seeds) | 20 KB | See defect #4 |
| Bee | `assets/sprites/bee.png` | 42 · qwen-image-edit lift, **key fallback** (layered failed ×4 seeds) | 20 KB | See defect #4 |
| Goldfish | `assets/sprites/goldfish.png` | 42 · qwen-image-edit lift → qwen-image-layered | 21 KB | |
| Flower — pink | `assets/sprites/flower-pink.png` | 42 · lift → layered | 28 KB | |
| Flower — white | `assets/sprites/flower-white.png` | 42 · lift → layered | 29 KB | |
| Flower — purple | `assets/sprites/flower-purple.png` | 1337 (reroll — seed 42 was a near-blank wash) · lift → layered | 25 KB | |
| Leaf perch | `assets/sprites/leaf.png` | 42 · lift → layered | 27 KB | |
| Honeycomb board | `assets/sprites/honeycomb.png` | 42 · krea2-turbo-t2i, key + `close_dark_pockets` | 48 KB | 6 open cells, 2 rows of 3; see defect #7 |
| Pool — big | `assets/sprites/pool-big.png` | 42 · krea2-turbo-t2i, key | 27 KB | Shares one `sp-pool.png` source, 3 sizes |
| Pool — medium | `assets/sprites/pool-medium.png` | 42 · krea2-turbo-t2i, key | 19 KB | |
| Pool — little | `assets/sprites/pool-little.png` | 42 · krea2-turbo-t2i, key | 13 KB | |
| Pom-pom — red | `assets/sprites/pompom-red.png` | 42 · krea2-turbo-t2i → layered | 23 KB | |
| Pom-pom — yellow | `assets/sprites/pompom-yellow.png` | 42 · edit variant → layered | 32 KB | |
| Pom-pom — blue | `assets/sprites/pompom-blue.png` | 42 · edit variant → layered | 29 KB | |
| Pom-pom — green | `assets/sprites/pompom-green.png` | 42 · edit variant → layered | 32 KB | |
| Nest — red | `assets/sprites/nest-red.png` | 42 · edit variant → layered | 22 KB | |
| Nest — yellow | `assets/sprites/nest-yellow.png` | 42 · edit variant → layered | 25 KB | |
| Nest — blue | `assets/sprites/nest-blue.png` | 42 · edit variant → layered | 23 KB | |
| Nest — green | `assets/sprites/nest-green.png` | 42 · edit variant → layered | 25 KB | |
| HUD — back | `assets/ui/btn-back.png` | 42 · lift from mockup 02, key | 14 KB | |
| HUD — home | `assets/ui/btn-home.png` | 42 · icon-swap variant, key | 14 KB | |
| HUD — sound on | `assets/ui/btn-sound-on.png` | 42 · icon-swap variant, key | 15 KB | |
| HUD — sound off | `assets/ui/btn-sound-off.png` | 42 · icon-swap variant, key | 13 KB | |
| HUD — next | `assets/ui/btn-next.png` | 42 · lift from mockup 03 (NEXT text replaced with arrow), key | 24 KB | |
| Counter chip | `assets/ui/chip.png` | 42 (reroll — first lift kept a banner fragment) · key | 51 KB | See defect #3 |
| Celebration badge | `assets/ui/badge.png` | 42 · krea2-turbo-t2i → layered | 26 KB | |

All 34 shipped sprite/UI/backdrop files plus the tweezer split were re-verified via magenta
composite QA (`assets/source/qa/*.magenta.png` + `tweezers-split.magenta.png`) — clean silhouettes,
no white/charcoal halos, real alpha spread confirmed on the fuzzy pom-poms and badge.

(Stretch) celebration video loop — not produced; not required to ship.

## Reused shared assets

| Asset | Source | Creator | License | Attribution required | Modifications |
| --- | --- | --- | --- | --- | --- |
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandão & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| `shared/assets/music/gentle-country-morning.mp3` (BGM) | Shared QLOBE Kids library | Generated/sourced for the platform | CC BY 4.0 | No | Reused unmodified via `shared/js/bgm.js` |
| Sound effects | N/A — synthesized at runtime via WebAudio (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Web Speech fallback voice | N/A — device built-in voices via `shared/js/speech.js` | N/A | N/A | N/A | Fallback when a recorded clip is absent |
| Concept mockups (`01-game-concepts/tweezer-rescue/output/ui-mockups/*.png`) | Generated for this project from the brief | QLOBE Kids | CC BY 4.0 | No | Composition/lift reference only — not shipped, not redistributed |

## Voice production

Recorded teacher-voice clips (`assets/audio/voice/`) — all 35 lines of the GDD "Voice script"
table, shipped 2026-08-23. Pipeline: `tools/produce-voice.py` (four resumable phases —
`tts` → `encode` → `qa` → `finalize`; `tools/lines.json` is the driver's copy of the verbatim
script). Voice: `qwen3-tts-voiceclone` cloned from the platform teacher-voice reference
(`shared/assets/refs/voice-teacher.wav`), seed 7 for every line — no line needed the 8/9 ladder.
Encode: `ffmpeg` FLAC → AAC/M4A, mono, 44.1 kHz, 96 kbps, `loudnorm I=-16:TP=-2:LRA=9`,
`+faststart`. QA: `whisper-stt` transcribed the **final candidate m4a** (not the raw FLAC) so an
encoding artifact would be caught too, not just a TTS mis-take.

32/35 lines passed whisper QA (`base` model) outright on the first take. The remaining 3
(`count-4`, `prompt-big`, `nudge-wrong`) were **not** re-recorded — a manual re-check confirmed the
clips themselves were correct and it was whisper's `base` model mis-hearing them (documented
gotcha: short/tricky words need the `small` model):

| key | `base` heard | `small` heard | verdict |
| --- | --- | --- | --- |
| `count-4` | "Four B's." (degenerate on a 0.96 s clip) | "Four bees." (biased prompt) | accepted, seed 7 |
| `prompt-big` | "Find **a** big pool." | "Find **the** big pool." (matches intended exactly) | accepted, seed 7 |
| `nudge-wrong` | "**Jettley** now!" | "**Gently** now." (matches intended exactly) | accepted, seed 7 |

Result: **35/35 clips shipped**, none omitted. Total `assets/audio/voice/` size: **1.1 MB** (well
under the ~2.5 MB budget). Every clip verified to decode with a nonzero duration via `afinfo`
(mono AAC, 44.1 kHz) and `ffprobe`. `manifest.json` carries `{file, dur, rev}` per key (`rev` is a
10-char content hash — cache-busting/provenance token, not currently appended by
`voice-clips.js`, which treats `file` as a plain relative path). `lines.json` carries `{text}` for
every key, matching `config.json`'s `lines` object verbatim so the recorded clip and the Web
Speech fallback can never drift. Full per-line QA verdicts (scores, transcripts, seeds) are in
`tools/voice-qa.json`.

## Link preview (og:image)

| Asset | Source | Creator | License | Attribution required | Modifications |
| --- | --- | --- | --- | --- | --- |
| `assets/og-image.jpg` | Generated screenshot of this game's own splash screen (1200×630), captured by `tools/pipeline/capture_og_images.mjs` | QLOBE Kids | CC BY 4.0 | No | Regenerate with the tool rather than editing by hand — should be recaptured now that the splash carries finished art instead of placeholders |
