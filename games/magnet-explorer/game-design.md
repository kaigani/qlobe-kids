# Magnet Explorer — Game Design

## Product promise

Magnet Explorer is a tactile preschool science toy that lets a child discover magnetism by moving a chunky horseshoe magnet, watching familiar objects react, and hearing a short explanation. It replaces the original sorting-engine prototype with three direct-manipulation experiments built for replay.

**Audience:** ages 5–6 in the current QLOBE catalog; interaction and language remain accessible to the concept brief's wider 3–6 range.

**Art world:** Toy — premium Montessori science table, painted maple, rounded joinery, visible grain, brushed steel, rope-wrapped trays, and warm studio light.

**Session length:** 2–5 minutes per experiment.

**Input:** touch, pointer, keyboard fallback, and deterministic debug controls.

## Learning goals

- Build a prediction-and-test loop: bring a magnet close, observe, and revise an idea.
- Recognize that the included steel objects are magnetic while wood, rubber, plastic, wool, cork, and leaves are not.
- Notice that attraction depends on proximity.
- Avoid the common misconception that every metal is magnetic: spoken and visual feedback names **steel**, never “all metal.”

## Core loop

1. Choose one of three wooden experiment medallions.
2. Move the red magnet close to an object or the steel ball.
3. Observe a snap, follower motion, or gentle bounce.
4. Hear a recorded teacher line naming the material and outcome.
5. Fill wooden star progress markers and earn the Explorer badge.

There is no failure state, timer, score pressure, advertising, or text-heavy instruction. Every experiment can be left and restarted.

## Modes

### Test Lab

Six balanced trials: three randomly ordered steel objects and three non-magnetic materials. The object sits on a testing pedestal. Dragging or tapping brings the magnet close. Steel objects snap to the magnet with sparkles, a clink, and haptics; other materials bounce gently. The result card appears only after the physical reaction so cause and effect stay legible.

### Treasure Sweep

Nine objects are scattered across the workbench. Five are steel treasures and four are decoys. The magnet is swept freely around the field. Magnetic objects form a visible little “comet tail” behind the magnet. Non-magnetic objects wobble once and remain on the table. The mode completes when five treasures are collected.

### Magnet Maze

A red magnet guides a separate steel ball through a carved wooden maze. The ball follows with damped lag only while the magnet remains close enough, making distance visible rather than simulated as instant attachment. Reaching the golden star socket completes the experiment.

## Screen flow

`Splash / mode choice → Experiment → Mode reward → Completion → replay or mode choice`

- The splash keeps three 96px+ targets inside a calm turquoise wooden alcove.
- Gameplay uses a dedicated, uncluttered top-down table and a short prompt plaque.
- Home/back and repeat-audio controls use the shared QLOBE HUD.
- Completion uses the same physical badge and sparkles as in-play rewards.

## Interaction and feedback

- The magnet captures a pointer on press and releases on up, cancel, blur, back, and screen exit.
- A tap on an object is a small-hands fallback that animates the magnet to it.
- Keyboard users can focus and activate test objects and mode cards.
- Touch targets are at least 96×96 CSS pixels at the production landscape viewport.
- Audio unlock occurs on the first gesture. Voice ducks the background track.
- Reduced-motion mode removes floating, wobble, sparkle spin, and long travel while preserving state feedback.
- Haptics are short and optional; unsupported devices continue normally.

## Visual system

All primary artwork is raster. CSS supplies layout, focus rings, type, translucent overlays, and shadows only; it does not draw the game world.

- **Krea 2 backgrounds:** 1600×1200 splash alcove, workbench, and maze; 768×640 catalog composition.
- **GPT Image 2 object family:** magnet, ball, twelve material objects, toy car, and star token, generated as one style-locked 4×4 sheet.
- **GPT Image 2 UI family:** title, three mode medallions, pedestal, two trays, badge, and sparkles, generated as one style-locked 3×3 sheet.
- **Cut pipeline:** border chroma removal, mandatory `tools/cut-asset-sheet.py` connected-component cut, then `cutout_finalize.py` alpha cleanup and QA.
- **Palette:** turquoise `#137bb8`, cobalt `#185b9f`, cherry `#ec4e35`, sunflower `#f6c94d`, leaf `#79b83d`, maple `#f8e7bf`.

The two contact sheets are the single source of truth for object and UI style. Their consistent camera, materials, outlines, and light keep generated assets from feeling assembled from unrelated packs.

## Audio direction

- Warm, patient teacher voice cloned from the approved QLOBE teacher reference with Qwen3 TTS.
- Twenty-four recorded clips cover onboarding, mode prompts, nudges, material explanations, and rewards.
- Every clip is transcribed with Whisper and must match its intended line before release.
- Shared `whimsical-toy-workshop.mp3` runs quietly under play; synthesized clink, boing, pop, and sparkle cues reinforce immediate physics.
- Text fallbacks in `data/lines.json` are exact semantic matches for the recordings.

## State and deterministic QA

The game exposes `window.QLOBE_DEBUG` only through the shared debug harness. The contract includes readiness, available modes, start/home/mute, state snapshots, deterministic magnet movement, current-object testing, mode completion, maze solving, and audio logs. Random deals use seeded `mulberry32(42)`.

Required release gates:

- no console errors, failed requests, or missing art;
- recorded AAC narration observed in real Chrome after the first gesture;
- all three modes playable to completion and replayable;
- pointer cancellation leaves no dragging state;
- splash, reaction, reward, portrait, short-landscape, and hub screenshots reviewed;
- minimum touch target and reduced-motion checks pass;
- game registry, Open Graph image, asset recipes, and provenance are current.

## Concept departures

The brief suggested a generic bin-sorting implementation and described magnets as attracting “metal.” The shipped design instead uses proximity-based manipulation in all three modes and identifies the magnetic set as steel. This is more scientifically truthful, more tactile, and much closer to the supplied screen mockups. The catalog age remains 5–6 to match platform policy even though the interaction was tuned for the brief’s 3–6 audience.
