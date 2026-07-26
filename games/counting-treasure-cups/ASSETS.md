# Asset log — Counting Treasure Cups

Every asset here is original to QLOBE Kids and generated locally (no network call
to any model or service at runtime). Code is MIT; original assets are CC BY 4.0.

## Shared library (reused unmodified)

| Asset | Source | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | fonts.google.com/specimen/Fredoka via Fontsource | Milena Brandão & Hafontia | SIL OFL 1.1 | No UI attribution required | None |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-back.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | QLOBE Kids | CC BY 4.0 | No | None |
| Sound effects | Synthesized at runtime by `shared/js/sfx.js` (WebAudio) | — | — | — | No sourced audio |
| Web Speech fallback voice | Device built-in voices via `shared/js/speech.js` | — | — | — | Fallback only; every line has a recorded clip |

## Game art

Concept art was authored in `01-game-concepts/counting-treasure-cups/` (brief,
five UI mockups, two looping backdrops, alpha-cut foreground layers). The
cutouts every derived asset needs are kept in `assets/source/`, and

```
python3 games/counting-treasure-cups/tools/build-plates.py
```

rebuilds all ten derived PNGs byte-identically. Concept files that nothing
derives from (the still backgrounds, the peek chest, the rejected splash seeds)
were not copied in — they remain in the concept folder.

| Asset | Source | Pipeline | License | Modifications |
|---|---|---|---|---|
| `assets/gem-{red,blue,green,purple}.png` | `ui-diamond-*-alpha.png` (concept folder) | alpha floor → trim → 300 px → PNG-8 (224 colours) | CC BY 4.0 | Downscaled and quantized; 89 KB → 15 KB each |
| `assets/coin.png` | `ui-gold-coin-alpha.png` | same | CC BY 4.0 | 137 KB → 23 KB |
| `assets/tile.png` | `ui-tile-alpha.png` | same, 320 px | CC BY 4.0 | Also backs the numeral cards in How Many? |
| `assets/ship-back.png`, `assets/ship-front.png` | `assets/source/ship-plate.png` | `tools/build-plates.py` | CC BY 4.0 | Mirror-extended ±260 px, then split at the cup rim |
| `assets/beach-back.png`, `assets/beach-front.png` | `assets/source/chest-foreground-open-alpha.png` | `tools/build-plates.py` | CC BY 4.0 | Split at the chest's near rim |
| `assets/{sea,beach}-poster.jpg` | Frame 0 of each backdrop clip | ffmpeg | CC BY 4.0 | Video poster and the reduced-motion still |
| `assets/chest-full.png` | `beach-{back,front}.png` + the treasure sprites | `tools/build-plates.py` | CC BY 4.0 | The end-screen reward, composited through the same back/treasure/front sandwich and the same slot geometry as play — read from `config.json`, so it cannot drift from what the child just filled |
| `assets/hub/tiles/counting-treasure-cups.jpg` (repo root) | This game's own art | `tools/pipeline/capture_og_images.mjs` family | CC BY 4.0 | Hub tile |

### The back/front plate trick

`tools/build-plates.py` derives each container's **front** plate by masking its
**back** plate below the near rim — an ellipse arc for the cup, a level line for
the chest. Treasure sprites are drawn between the two, so they are visibly
*inside*. Because the front plate is literally the same pixels, an empty
container composites pixel-identical to the source art. Re-run the script after
replacing any source cutout; `--proof` writes QA sheets to
`assets/source/proof-*.png`.

The front plate handles the **bottom** edge. Anything else is handled at runtime:
`config.json` gives each stage an `aperture` and `Stage.applyAperture()` turns it
into a `clip-path` on the treasure layer. The two containers want different
answers, which is why this is data and not a hard-coded shape:

- **Cup** — `{kind: 'ellipse'}`, the inner mouth, extended straight upward. The
  bowl is narrow and a gem hanging off its rim reads as broken, so it is contained
  on all sides.
- **Chest** — `{kind: 'above', y: 368}`, the near rim only. The sides are
  deliberately open so an outer coin can overhang a side rail the way real
  treasure would; the outer slots are nudged out to make it happen. Clipping the
  sides too (the first attempt) put a hard straight cut through those coins.

Nothing crosses the near rim in either case, so treasure never appears in front
of the container.

**Both rim measurements were wrong on the first pass and both showed as treasure
spilling over the gold.** Get them by *drawing the candidate back onto the plate
and looking at it*, not by reading a grid overlay by eye:

- The cup was cut at the **outer** lip (`cy=180, ay=26`), leaving an ~11 px band
  where gems sat on top of the gold. The inner lip is `cx=782, cy=177, rx=157,
  ry=20`.
- The chest rim was read as sloping from `(296,366)` to `(742,322)`. It is
  **level at y=368** — confirmed by detecting the top of the gold band in every
  column, which reads 368 from x=370 to x=670. The bogus slope cut the front
  plate ~46 px too high on the right, so coins showed over the right-hand rim.

### `assets/source/ship-plate.png` — provenance and a lesson

The ship deck arrived as an opaque 4:3 scene (`cup-foreground.png`) with the sky
and sea painted in. It was cut out with `qwen-image-layered` (async job flow —
`sync=true` returns the composite, not the cutout).

**Lesson for the next game:** the extractor returns *the foreground layer*
regardless of which subject the prompt names. Three prompts were tried — "the
golden trophy cup", "the deck and railings", and finally "the ocean, sky and
distant ship". All three returned a foreground layer; only the third was clean,
and it is the one that shipped. Do not spend retries trying to steer *which*
object comes out; steer the source image instead, and check the alpha histogram
(the accepted plate is 41 % clear / 58 % opaque with < 0.5 % partial — a clean
binary matte, not a soft film).

A colour key was attempted first and abandoned: the retained sea band reaches
255 in places, so it is not separable from the cup's pale specular highlights by
brightness or hue.

## Backdrop video

| Asset | Source | Modifications |
|---|---|---|
| `assets/video/sea.mp4` | `motion-background.mp4` (concept folder) | 960 px wide, h264 yuv420p, `+faststart`, audio stripped, CRF 25 → 927 KB, 8.0 s |
| `assets/video/beach.mp4` | `motion-background-2.mp4` | As above, then rebuilt as a ping-pong loop → 674 KB, 6.2 s |

Both source clips already loop seamlessly (first and last frames match to within
a couple of LSBs). The **sea** clip contains a breaching whale at ~t=5 s; that
was kept — it is on-theme, distant, and gives the scene something to notice on a
tenth play.

The **beach** clip contained a rainbow-haired humanoid figure that rises out of
the sea at t≈0.9 s, walks left and sinks at t≈5.8 s — a generation artefact that
reads as a glitch. Since the source loops, the clean window wraps the loop point:
`[5.90 s .. end] + [0 .. 0.85 s]` is a continuous 3.0 s piece. That piece is
concatenated with its own reverse (minus the duplicated seam frame) to give a
perfectly seamless 6.2 s ping-pong. Gentle surf hides the reversal completely.

**Lesson:** always contact-sheet a generated loop at ~0.5 s intervals before
shipping it. A stray figure that only appears for four seconds is invisible in a
poster frame and obvious in play.

## Characters

| Character | Poses | Pipeline | License |
|---|---|---|---|
| Captain Goldie (`assets/pose-actors/captain-goldie/`) | neutral, enter, notice, interact, react, celebrate | `krea2-turbo-t2i` on flat dark charcoal → `qwen-image-layered` → `tools/pipeline/pose_actor_assemble.py` | CC BY 4.0 |
| Skipper the parrot (`assets/pose-actors/skipper/`) | same six | same | CC BY 4.0 |

Both ship as `qlobe-pose-actor` v1 packs so the studio and a future pirate game
can reuse them. They are rendered in DOM by `js/actor.js` (the shared
`shared/js/stage/pose-sprite.js` is PixiJS-only, and this game's play-field has
to be DOM because the backdrop is a real `<video>` element); the pack format,
pose names and anchor semantics are identical.

Design constraint held throughout: **nothing menacing**. No weapons, no scars,
no eyepatch, no skulls.

### Lessons from the character batch

- **Derive the five action poses from the neutral, not from the prompt.** Each is
  a `qwen-image-edit` pass conditioned on the accepted neutral image, so the face,
  outfit, palette and proportions hold across all six. Generating six poses
  independently would give six different characters.
- **Keep the neutral calm, arms down.** A cheerful raised-arm reference bleeds its
  energy into every derived pose.
- `pose_actor_assemble.py` normalizes all six at ONE shared scale onto a common
  baseline, so a paper-pop swap cannot change how big the character is. Verify by
  compositing the set with the baseline drawn on — if a pose's feet sit off the
  line (other than a deliberate mid-stride `enter`), the pack will visibly jump.
- The derives come back with a faint speckled background rather than the flat
  charcoal of the neutral. It does not affect the extraction — the layered
  extractor separates by object recognition, not colour.

### What is kept in `assets/source/actors/`

`raw/*.jpg` — the six character renders per actor, the irreplaceable creative
step, re-encoded from PNG (there is no alpha to lose and the ground is flat).
The intermediate alpha cutouts are **not** kept: they cost one API call each to
regenerate from the raws, and the packs they produced are committed. Because the
extractor is generative, a re-run yields an equivalent but not identical cutout —
so treat the committed `poses/*.webp` as the reference, not something to
reproduce byte-for-byte.

## Voice

| Voice | Reference | Origin | Lines |
|---|---|---|---|
| Captain Goldie | `assets/audio/ref/captain-goldie.flac` | Supplied recording, `01-game-concepts/counting-treasure-cups/assets/pirate-voice.mp3` ("Arr me hearty, here be me treasure!") — converted to mono 24 kHz, trimmed and levelled | 27 |
| Skipper | `assets/audio/ref/skipper.flac` | `qwen3-tts-voicedesign`, seed 7 | 14 |

The Captain originally used a designed voice (`qwen3-tts-voicedesign`, seed 7,
a warm storyteller). It was replaced with the supplied pirate recording; all 27
lines regenerated from it, every one accepted on the first seed. The change also
closed a level imbalance — the two characters previously sat 3.5 dB apart and now
sit within 0.2 dB (−18.3 / −18.1 dB mean).

Every line is cloned from its character reference with `qwen3-tts-voiceclone` by
`tools/gen-voice.py`, which is idempotent and re-runnable:

```
export QLOBE_QWEN_URL=http://<host>:<port>
python3 games/counting-treasure-cups/tools/gen-voice.py            # missing only
python3 games/counting-treasure-cups/tools/gen-voice.py --only par-3 --force
```

`config.json`'s `voice` map is the single authoring source. The script derives
`assets/audio/lines.json` from it, so a recorded clip and its Web Speech fallback
can never drift apart, and writes per-clip QA to `assets/audio/qa.json`.

**This game does not use the shared teacher voice.** That is a deliberate
departure (see `game-design.md` §8): the two in-world characters were requested,
and the parrot doing the counting is pedagogically apt. Both reference clips are
committed so a future pirate game matches.

### Lessons from the voice batch

- **The clone pads short utterances with silence.** "One!" came back as a 5.8 s
  clip that was mostly nothing. The fix is an ffmpeg trim
  (`silenceremove` on both ends via `areverse`) plus `loudnorm`, which also
  levels the two characters to one volume. After trimming, "One!" is 0.77 s.
- **Duration bounds catch both failure modes** — silent clips and runaway
  silence — scaled to word count rather than hand-tuned per key. Out-of-range
  clips retry the seed ladder 7 → 8 → 9 → 42 → 1337.
- **Whisper is unreliable on a single word in isolation** and writes count words
  as numerals. QA therefore passes an `initial_prompt` biased to this game's
  vocabulary and normalizes digits to words before comparing; without that, good
  count clips were being rejected.
- Output is FLAC despite the `.wav` naming in the API docs.
- **Never race a spoken line against a hard-coded timeout.** Swapping the
  Captain's reference made every line longer, and a fixed 3200 ms cap started
  cutting the end off a cheer. `Game.speakFully()` now bounds each wait by the
  clip's own recorded duration (from `manifest.json`) with the old constant as a
  floor, so the fallback path still can't hang and a re-recorded voice can't be
  clipped.

## Budget

**4.49 MB of runtime assets in total — over the ~4 MB guidance in
`docs/art-direction.md` by about 12 %.** The overage is the two pose-actor packs
(925 KB for twelve 1024² WebP sprites) and it is deliberate: the characters were
requested, and cutting them to fit was worse than exceeding a soft budget.
Re-encoding the packs at q78 only recovers 184 KB, which is not worth the quality.

What a child actually downloads is well under the total, because nothing that can
wait loads eagerly:

- **Boot**: shell + CSS + JS ≈ 80 KB, Fredoka 30 KB, splash 148 KB, and two small
  JSON files. No audio, no video, no character art.
- **Character poses** warm in idle time, one at a time, ordered by how many lines
  each pose carries (`Actor.preload`). A pose that has not loaded yet simply pops
  in a beat late.
- **Audio** streams on demand — `shared/js/voice-clips.js` swaps the src of one
  unlocked `<audio>` element per line, so only the clips actually spoken are
  fetched (the full set is 738 KB / 85 s across 41 clips).
- **Video** loads per stage: `Stage.show()` early-returns when the stage has not
  changed, so Fill the Cup only ever fetches `sea.mp4` (927 KB) and Big Treasure
  only `beach.mp4` (674 KB). How Many? alternates and so loads both.

First play of Fill the Cup is roughly 1.5 MB before any character or clip warms.

This mirrors the framing in `games/red-green-light/ASSETS.md`, which also exceeds
a stated per-game guidance and justifies it on per-session weight.

`assets/source/` (11 MB) and `tools/` are authoring material and are not served.

## Link preview (og:image)

| Asset | Source | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| `assets/og-image.jpg` | Generated screenshot of this game's own splash (1200×630), captured by `tools/pipeline/capture_og_images.mjs` | QLOBE Kids | CC BY 4.0 | No | Regenerate with the tool rather than editing by hand |
| `assets/splash.jpg` | `krea2-turbo-t2i` | QLOBE Kids | CC BY 4.0 | Title screen backdrop |
