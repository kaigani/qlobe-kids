# Smell Jars — production game design

## Product promise

Smell Jars turns visual matching into a tiny tactile scent-apothecary ritual. A child chooses a closed wooden jar, physically lifts its colored lid, watches a friendly handcrafted scent plume rise, and matches that clue to a chunky ingredient medallion. The game is readable without text and never frames a wrong guess as failure.

- Audience: ages 5–6.
- Canonical art direction: **Toy**.
- Interior treatment: warm honey-maple workshop, cream plaster, sage fabric, matte painted relief, friendly carved sun.
- Session length: four jars, roughly 45–90 seconds.
- Release state: beta until an on-device child playtest.

## Why this implementation

The concept brief and mockups promise a magical jar-opening and picture-matching fantasy. The old prototype instead described a grown-up-led real-kitchen smell journal and depended on an unfinished generic observe-journal path. This replacement keeps the registered route and sensorial vocabulary goal, but delivers the concept's direct, self-contained play loop.

The game is a custom DOM module because the lid ritual, transient plume memory, physical token placement, and two-input parity would be flattened by a generic choose-one engine. It still composes the platform's shared screen, HUD, input, drag, timing, audio, narration, celebration, preload, random, and debug services.

## Modes

### Smell & Match

- Four unique jars per session.
- The scent plume remains visible while the child chooses.
- Three picture tokens appear.
- Skill: picture matching from a persistent multimodal clue.

### Nose Memory

- Four unique jars per session.
- The scent plume appears alone, then fades before choices arrive.
- Four picture tokens appear.
- Skill: hold a colorful visual scent signature in working memory.

## Screen map

1. **Splash**
   - Raster title plaque.
   - Two large picture-only mode medallions, with supporting text for adults.
   - Home is present only here.
   - The first real gesture unlocks audio and can play the recorded welcome.
2. **Mystery shelf**
   - Three closed jars on a recessed wooden tray.
   - Lid color differentiates the objects without revealing the ingredient.
   - Any chosen jar becomes the current round.
3. **Closed hero jar**
   - One oversized jar and lid.
   - The spoken instruction and physical lid affordance make the next action immediate.
4. **Scent reveal**
   - Lid lifts and lands beside the jar.
   - A distinct raster scent plume rises.
   - Nose Memory holds this beat longer and removes the clue before the choice step.
5. **Match**
   - Smell & Match shows three medallions; Nose Memory shows four.
   - Drag a medallion onto the jar label, or tap the medallion and then the label.
6. **Gentle retry**
   - The token gives a small side-to-side response.
   - The first retry is verbal only.
   - After a second miss, the correct token breathes and the plume briefly returns.
7. **Success**
   - The medallion seats into the jar label.
   - Check medallion, sun mascot, sparkles, recorded ingredient description, and a small confetti burst.
8. **Smell shelf ending**
   - The four matched medallions stand on the tray.
   - Back returns to mode choice; Play Again repeats the same mode with a new deterministic shuffle.

## Ingredient vocabulary

| Ingredient | Visual plume | Spoken description |
|---|---|---|
| Lemon | sunny yellow curls and zest dots | fresh, bright, and zesty |
| Mint | aqua-green curls and leaf motifs | cool, leafy, and crisp |
| Cinnamon | amber-russet curls and spice flecks | warm, sweet, and spicy |
| Lavender | violet curls and petals | soft, flowery, and calm |
| Cocoa | brown-cream curls and beans | rich, roasty, and cozy |
| Pine | deep-green curls and needles | green, woody, and fresh |

Every completed jar is removed from the remaining mystery pool, so the four session answers are unique. Three mystery jars remain available even in the last round because the full six-item pool begins larger than the completion target.

## Interaction rules

- All primary press targets are at least 96 px.
- Pointer taps, assistive activation, and keyboard activation share the same semantic handlers.
- Dragging uses the shared single-pointer controller, window-level release handling, pointer cancellation, forgiving slot padding, and a raster ghost.
- A dropped token outside the jar safely returns home and remains selected.
- Tapping a token selects it; tapping the jar confirms it. This keeps tap and drag equally capable.
- Input is locked only during the lid's scripted reveal and after a correct answer.
- No life, score loss, countdown, game over, or punitive sound exists.
- Idle guidance replays the current recorded direction and animates the actual next target.

## Audio

Recorded narration is primary. Seventeen AAC clips use the approved synthetic platform-teacher reference through Qwen voice cloning. Every final clip was loudness-normalized and transcribed through local Whisper; all 17 passed phrase coverage. The shared voice layer still provides Web Speech only as an emergency missing-clip fallback.

The shared recorded track `whimsical-toy-workshop.mp3` plays quietly after mode selection. It uses shared preload/unlock behavior, narration ducking, mute state, fade in/out, and page teardown.

Runtime sound effects are the shared short Web Audio cues: tick, whoosh, sparkle, silly, and tada.

## Spoken script

The canonical verbatim script lives in `config.json` and is mirrored to `assets/audio/lines.json`. It includes:

- welcome and both mode explanations;
- jar selection and lid directions;
- persistent-clue and memory-clue questions;
- two escalating gentle retry lines;
- one named descriptive success line for every scent;
- next-round and final celebration lines.

The HUD sound button always repeats the truthful current cue.

## Visual production

GPT Image 2 supplied the canonical room plates, title source, jar/prop family, lids, ingredient tokens, scent plumes, sun, sparks, and mode medallions. Sources and prompt provenance are committed under `assets/source/gpt-image-2/`.

The required shared asset cutter segmented every contact sheet into isolated PNG sources under `assets/source/cuts/`, including masks, boxes, and manifests. Qwen Image Layered separated and refined the title alpha; its recipe and hostile-magenta QA image are preserved. `tools/build-assets.py` deterministically trims, normalizes, resizes, and encodes runtime WebP files, then writes a hash receipt and alpha contact sheet.

Krea 2 generated two hub candidates. Seed 1337 was accepted because it has one clear hero jar, one mascot, three readable tokens, and a strong small-scale silhouette. Seed 42 was rejected for a duplicate mascot. Both raw candidates and recipes remain for audit.

No runtime UI calls a model. No primary artwork is drawn with SVG, canvas, CSS illustration, or emoji.

## Responsive composition

- Landscape uses a central hero jar with the token dock at the right.
- Portrait uses a separately generated and composed room plate, a taller central ritual, and a full-width token rail.
- Short landscape compresses prompts, jar height, and token rows without shrinking targets below 96 px.
- HUD controls respect safe-area insets.
- Reduced-motion preference collapses movement while preserving state transitions and feedback.

## Shared modules

- `screens.js`: splash/play/end routing and teardown bags.
- `hud.js`, `tap.js`: child-sized controls and de-duplicated activation.
- `stage/drag-to-slot-dom.js`: robust direct manipulation.
- `audio-unlock.js`, `voice-clips.js`, `narrator.js`, `bgm.js`, `sfx.js`: recorded guidance and audio lifecycle.
- `timers.js`, `idle-nudge.js`: cancellable beats and gentle help.
- `rng.js`: reproducible jar and choice shuffles.
- `preload.js`: critical art loading.
- `celebrate.js`: bounded success payoff.
- `debug-harness.js`: QLOBE_DEBUG v1.

## Debug and QA contract

`window.QLOBE_DEBUG` exposes:

- `ready`, `listModes`, `startMode`, `getState`, and truthful current targets;
- semantic `tap`, `openJar`, `chooseScent`, `next`, `winRound`, and `home`;
- mute, deterministic seed, fast timers, audio log, art-failure log, and current layout.

The local QA script checks required files, config cardinality, referenced art, audio metadata, screen structure, shared CSS, raster-only implementation, and the touch floor. Browser QA drives both modes, a wrong answer, four successes, navigation, landscape, portrait, and reduced motion while collecting page errors, failed requests, audio logs, target rectangles, and screenshots.

## Privacy and permissions

The game does not use a microphone, camera, location, storage, account, or network service at runtime. TTS and image generation are authoring-time only.

## Known release gate

Automated and adversarial visual review can establish technical beta quality, but only an actual child playtest on the target iPad can establish whether the lid ritual and two-step tap path are understood without coaching. Keep status at beta until that observation is complete.
