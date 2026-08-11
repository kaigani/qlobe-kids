# Letter Treasure Hunt — Visual Quality Remediation Plan

## Purpose

Bring Letter Treasure Hunt to the visual quality and composition of the three
approved concept mockups while preserving its working interaction model,
accessibility, debug surface, and eventual A–Z extensibility.

## Implementation status — 10 August 2026

The B gold-master vertical slice and A/B/C expansion are approved. Phase 6 now
covers the complete A–Z game:

- The selection screen ships raster A–Z letter medallions, title, PLAY button,
  arrows, home, sound, and grown-up controls.
- Pause, grown-up, and portrait guidance use raster message plates and retain
  hidden semantic copy; modal states isolate background controls and restore
  focus when dismissed.
- The A, B, and C hunts ship separate raster badges, prompts, tokens, counts,
  feedback, controls, backgrounds, targets, and decoys as layered interactive
  scenes with island-specific coordinates. Each includes one cross-letter
  object distractor plus the neutral treasure-chest decoy.
- Each A/B/C completion ships an island-specific raster message panel, three
  filled tokens, and NEXT control over a dedicated celebration scene.
- Eight B teacher-narration clips are generated locally, transcript-QA'd, and
  played through `shared/js/voice-clips.js` with Web Speech fallback.
- All 27 A/B/C core, chest, and cross-letter narration lines have recorded
  teacher-voice clips in the runtime manifest and passed automated transcript
  matching. Human phoneme review remains required before audio acceptance.
- The prior A–C browser gate passed 48 of 48 checks with no console, page,
  request, or missing-asset errors.
- D–Z retain their high-quality illustrated plates as baked-target scenes and
  add one cross-letter raster distractor, a chest decoy, raster found markers,
  per-letter feedback/pause/completion plates, and a reusable open-chest
  completion overlay.
- All 234 A–Z narration lines are authored. I/O/U/X and S-shell use truthful
  letter-based exception copy. D–Z recording is the remaining external gate:
  the remote Qwen host currently accepts asynchronous jobs but crashes its
  synchronous worker before producing a stable batch.
- Expanded browser QA exercises all 26 scene records plus full D/I/S/X/Z paths;
  the default authored/fallback gate passes 86 of 86 checks. The opt-in
  `QLOBE_REQUIRE_RECORDED_AUDIO=1` release gate remains pending until D–Z
  audio is produced.

The D–Z visual/runtime expansion is complete. Recorded D–Z narration and human
phoneme audition remain the final audio acceptance work; Web Speech stays in
place as a runtime fallback rather than being presented as the final voice.

The first deliverable is a **gold-master vertical slice**, not a simultaneous
26-letter refresh:

1. A/B/C letter selection with B selected.
2. B hunt at 0 of 3 and during each collection state.
3. B completion with the ball, boat, butterfly, chest, tokens, and celebration.

Do not resume broad A–Z art production until this slice has been reviewed and
accepted side by side with the mockups.

## Ownership recommendation

This remediation should be led by the primary Sol agent. Luna should not own
the overall outcome.

Sol owns:

- Interpretation of the mockups and visual-quality bar.
- Composition, hierarchy, art-direction, and scope decisions.
- Decisions about bespoke versus reusable UI.
- Scene-layer and animation architecture.
- Image generation/editing prompts, asset selection, and rejection.
- Final integration, visual review, and acceptance.

Luna is appropriate for bounded work after Sol has supplied exact files,
coordinates, assets, and acceptance criteria. Suitable Luna tasks include:

- Mechanical markup and CSS changes from an approved composition spec.
- Asset renames, conversions, compression, and manifest updates.
- Adding explicit progress copy or debug fields.
- Repetitive per-letter metadata updates.
- Straightforward QA assertions and screenshot capture cases.

Luna should not independently decide whether a screen is visually finished,
redesign the composition, choose generated assets, generalize the gold-master
layout, or expand the work to all 26 islands.

## Source of truth

Visual references:

- `../../../01-game-concepts/letter-treasure-hunt/output/ui-mockups/01-letter-quest.png`
- `../../../01-game-concepts/letter-treasure-hunt/output/ui-mockups/02-find-b.png`
- `../../../01-game-concepts/letter-treasure-hunt/output/ui-mockups/03-well-done.png`
- `../../../01-game-concepts/letter-treasure-hunt/output/ui-mockups/PROMPTS.md`

Implementation files:

- `index.html`
- `css/style.css`
- `js/main.js`
- `js/islands.js`
- `tools/qa.mjs`
- `assets/papercraft/`
- `assets/islands/`

The mockups govern visual hierarchy and material treatment. Visible game UI is
delivered as authored raster artwork rather than CSS-drawn shapes, inline SVG,
or live type. Semantic HTML remains underneath every visual asset for button
behavior, accessible names, focus, and state. Copy may be baked into a discrete
UI asset, but never into a full-screen scene plate.

## Current-state diagnosis

### Release-blocking defect

`assets/papercraft/decoy-chest.webp` contains a visible checkerboard rectangle
instead of usable transparency. `main.js` adds it to every non-B hunt and
`style.css` positions it in the same upper-right region regardless of scene.
It floats above the art and can cover the right-side correct target.

The current QA only confirms that the image loaded; it does not detect visual
corruption or scene occlusion.

### Systemic visual issues

- Papercraft backgrounds and glossy shared navigation icons conflict.
- One generic rounded dashed card is used where the mockups use deliberately
  shaped, layered, stitched paper components.
- Selection letters and name pills appear to float over blank island areas
  instead of being physical parts of the islands.
- The current B hunt is flatter and sparser than the approved composition;
  target prominence is uneven and the chest dominates.
- The visible `N of 3` hunt count is missing.
- Correct objects are baked into the background, so the transparent hotspot's
  opacity change cannot visually fade, collect, or animate the object.
- The found marker has no `lower-left` positioning rule for B's boat.
- Completion uses a generic chest plate even though the existing
  `island-celebration.webp` is much closer to the B reference.
- The completion card is a large flat overlay that hides the scene rather than
  feeling composed with it.
- Functional QA captures screenshots but does not compare them against an
  approved baseline or require human visual sign-off.

## Non-negotiable constraints

- Preserve `window.QLOBE_DEBUG` and the current externally used mode, target,
  timer, mute, navigation, and state behavior unless a separately approved API
  change is required.
- Preserve minimum 96 px touch targets at supported tablet viewports.
- Preserve semantic buttons, accessible labels, keyboard focus, reduced-motion
  support, and the portrait orientation message. When visible words or letters
  are rasterized, keep equivalent DOM copy visually hidden for assistive tech.
- Preserve the no-build static-site architecture.
- Avoid remote runtime dependencies and service calls.
- Do not use the existing glossy shared controls, inline SVG, emoji, or
  CSS-drawn UI illustrations in the final gold-master screens. Use game-local
  raster papercraft assets approved against the mockups.
- Do not add UI merely because the generic engine supports it. Every visible
  element must earn its place in the composition.
- Do not scale the refreshed visual system to D–Z before the gold-master gate.

## Implementation sequence

### Phase 0 — Establish the baseline and visual contract

**Owner: Sol**

1. Capture the current selection, B hunt, and B completion at:

   - 1448 × 1086, matching the mockups.
   - 1024 × 768, a common 4:3 tablet size.
   - 1180 × 820, the existing QA viewport.

2. Create annotated overlays or a short composition specification for each
   gold-master screen. Record:

   - Major safe areas.
   - Header, badge, progress, and CTA bounds.
   - Interactive-object centers and silhouettes.
   - Which decorative elements may be cropped outside exact 4:3.
   - Required z-order.
   - Elements from the current build that will be removed.

3. Decide the platform-navigation exception. The concept omits a home control
   on the hunt and completion screens. If platform policy requires one, retain
   a visually subordinate papercraft back/home control; otherwise follow the
   mockup hierarchy exactly.

4. Approve a compact visual vocabulary before implementation:

   - Cream paper/felt surface.
   - Stitched or perforated inset edge.
   - Layered paper edge and miniature shadow.
   - Teal, coral, blue, and gold accent roles.
   - One headline type treatment and one supporting type treatment.
   - Consistent corner radius and shadow direction.

**Exit criteria:** Sol has approved annotated layouts and UI-component examples
for all three screens. Luna has no design decisions left to infer.

### Phase 1 — Remove visible defects and restore content fidelity

**Owner: Luna for code changes; Sol supplies decisions and reviews**

1. Remove the broken non-B chest overlay from runtime immediately. Do not
   replace it with another globally positioned overlay in this phase.

2. Add an explicit found-marker position for `lower-left`, aligned to B's boat.

3. Add visible dynamic count copy, `0 of 3` through `3 of 3`, while retaining
   the three tokens and their accessible group label.

4. Route the B completion screen to the existing
   `assets/papercraft/island-celebration.webp`. Keep the generic celebration
   plate temporarily for non-B letters.

5. Change B's completion CTA to the approved `NEXT` copy unless a platform-wide
   naming requirement is documented.

6. Extend QA to prove:

   - No non-B decoy image is rendered.
   - The visible count matches state after each successful find.
   - The B boat marker receives the intended layout class and lies over the
     boat region.
   - B completion loads the B-specific art.

**Exit criteria:** no checkerboard or floating chest appears; B content matches
the required text and object inventory; all existing functional checks pass.

### Phase 2 — Build the B hunt as a layered interactive scene

**Owner: Sol**

The monolithic B plate prevents meaningful feedback. Replace it with a layered
scene package:

```text
assets/papercraft/b-hunt/
  background.webp
  butterfly.webp
  ball.webp
  boat.webp
  chest.webp
```

Each foreground object must have genuine alpha, consistent lighting, matching
paper texture, and enough transparent padding for shadows and motion. No asset
may contain checkerboard pixels, prompt text, tokens, or controls.

Recommended implementation model:

- The background remains one full-bleed raster plate.
- Each object is a semantic button containing or associated with a visible
  positioned image layer.
- Positions use normalized scene coordinates or CSS custom properties stored
  in the island data rather than generic left/center/right thirds.
- The visible object and its hit target are related but not identical: the hit
  area may be larger for preschool use without changing the silhouette.
- Decorative foreground layers may overlap target edges, but never obscure the
  identifying silhouette.

Recommended collection sequence:

1. On press, keep the target DOM stable.
2. Play an object-specific micro-animation:

   - Butterfly: lift/flutter and sparkle.
   - Ball: squash, bounce, and arc slightly toward the token row.
   - Boat: rock and glide a short distance.

3. Reveal the large letter/word feedback.
4. Fill one B token with a brief pop.
5. Transition the object to a collected state instead of leaving the unchanged
   raster underneath a checkmark.
6. Commit state and re-arm input.

`tapTreasure()` currently re-renders immediately after setting `found`. Refactor
the visual sequence so a full DOM replacement does not destroy the active
animation. Sol should choose and own this refactor. A simple acceptable model
is: animate the existing target, commit state after animation completion, then
render the stable collected state.

Wrong-object feedback should be gentle and material:

- Small chest wobble.
- Soft tick, not punitive feedback.
- Short live prompt such as “That is a treasure chest. Find a B thing.”
- No red error flash or loss state.

**Exit criteria:** all three targets visibly respond, collect, update progress,
and work in arbitrary order; reduced motion substitutes an immediate fade/pop;
touch and debug APIs remain functional.

### Phase 3 — Replace generic UI with a coherent papercraft kit

**Owner: Sol for design/assets; Luna may implement approved markup and CSS**

Create or approve game-local raster treatments for:

- Selection title banner.
- Target-letter medallion.
- Hunt prompt banner.
- Empty and filled tokens.
- PLAY and NEXT buttons.
- Pause, sound, back/home, and grown-up controls.
- Completion banner/card.
- Feedback toast.

The runtime must not construct visible UI imagery from CSS borders,
pseudo-elements, gradients, inline SVG, or live letter glyphs. Produce discrete
transparent WebP assets instead. The first asset pack includes:

- `letters/a.webp` through `letters/z.webp`, each with its uppercase glyph
  flattened into the same approved stitched medallion.
- `quest-title.webp`, with `Choose a Letter Quest` rendered exactly.
- `play.webp` and `next.webp`.
- Game-local raster home/back, sound, grown-up, previous, next, pause, and resume
  controls.
- A–Z hunt badges, A–Z instruction banners, empty/filled treasure tokens, and
  `0 of 3` through `3 of 3` count plates.
- A B gold-master completion panel with `Well Done!`, `B is for Ball!`, and
  `3 of 3` rendered exactly; other completion panels are produced with their
  island art batches after B approval.

Shared blank source components may be used during authoring, but all visible
text and iconography is flattened into the shipped raster outputs. Runtime CSS
may position, scale, focus-outline, and animate those images; it must not draw
their material surface or icon silhouettes.

Do not recreate an entire screen as one image. Discrete assets preserve state,
responsive composition, semantic hit targets, and replaceable copy. Every
rasterized word or glyph must retain matching visually hidden DOM text and an
accessible control label.

All game-local iconography must share:

- The same material and edge treatment.
- A consistent light direction and shadow depth.
- A consistent outline weight.
- Clear silhouettes at the minimum rendered size.
- Pressed and focus-visible states.

**Exit criteria:** no glossy shared icon appears within the gold-master flow;
no visible UI component is rendered by CSS, SVG, or live type; controls and
scene art look authored as one system; A–Z medallions are complete before the
carousel is accepted.

### Phase 3A — Ship recorded teacher narration

**Owner: Sol for line design and integration; Luna may prepare manifests and
run an approved generation script**

The current Web Speech narration is a prototype fallback, not the production
voice. Adopt the established shared recorded-voice path:

- Add `assets/audio/lines.json`, `manifest.json`, `.m4a` clips, and `qa.json`.
- Initialize `shared/js/voice-clips.js` and keep exact-text Web Speech fallback
  for a missing or unplayable clip.
- Preserve the existing first-gesture/iOS audio unlock path.
- Route every spoken event through a stable key; the sound button must replay
  that same key instead of rebuilding similar copy independently.
- Keep the ARIA live region synchronized with the canonical line text.
- Stop recorded voice on navigation, pause, mute, and superseding feedback.

Required line families:

- `island-{letter}` — carousel selection, including a clear phoneme cue.
- `hunt-{letter}` — hunt instruction.
- `found-{letter}-{item}` — positive item naming and sound connection.
- `wrong-{letter}` — gentle corrective guidance.
- `idle-{letter}` — one restrained nudge.
- `complete-{letter}` — celebration and one example word.

For the B gold master, record and QA the B selection, hunt, butterfly, ball,
boat, wrong chest, idle, and completion lines. After approval, generate the
remaining A–Z line set from the same rights-cleared teacher reference voice in
small reviewed batches. Reusable shared word clips may be referenced directly
when their recording, wording, and voice version match; missing vocabulary must
be recorded rather than silently synthesized in the final pack.

Audio QA must verify manifest/file parity, nonzero duration, decode success,
transcript agreement, recorded-clip use in the debug audio log, sound-button
replay, interruption, mute, pause, and Web Speech fallback.

**Exit criteria:** the full B journey uses recorded teacher clips, replay and
mute are deterministic, and simulated missing clips fall back without blocking
play.

### Phase 4 — Recompose each gold-master screen

#### Selection screen

**Owner: Sol; Luna may implement approved coordinates**

- Match the concept's simple hierarchy: title, three islands, central selected
  B, route, and PLAY.
- Make B materially more prominent than A and C through scale, elevation,
  shadow, and/or selection rim—not through extra explanatory copy.
- Treat the letters as stitched/applied island badges rather than plain text
  floating in an empty patch.
- Remove the Apple/Beach Ball/Cupcake name pills from the gold-master screen
  unless user testing proves they are necessary.
- Remove or strongly subordinate `B island · 2 of 26`.
- Keep carousel hit areas and accessible island names even if the visible name
  pills are removed.
- Reduce navigation clutter. If arrows remain, integrate them into the same
  papercraft control family and ensure they do not compete with PLAY.
- Preserve wraparound A–Z behavior behind the gold-master presentation.

#### B hunt screen

**Owner: Sol**

- Use the layered scene from Phase 2.
- Keep the B badge, prompt, three tokens, pause, and visible `N of 3` count.
- Match the mockup's target clarity: butterfly isolated from foliage, ball with
  strong central contrast, boat fully readable as a boat, chest recognizable
  but not more visually dominant than the targets.
- Reserve the top band for HUD elements so they do not collide with the sun,
  clouds, palms, or target silhouettes.
- Ensure all target areas are at least 96 px and do not overlap the decoy target.
- Avoid decorative clutter over the identifying edges of target objects.

#### B completion screen

**Owner: Sol; Luna may wire the approved asset and state copy**

- Use `island-celebration.webp` initially, or a Sol-approved replacement.
- Show the found ball, boat, and butterfly around the open chest.
- Place three filled B tokens prominently above or within the celebration
  banner, matching the concept hierarchy.
- Show `Well Done!`, `B is for Ball!`, `3 of 3`, and `NEXT` exactly.
- Remove the `Beach Ball Island` eyebrow unless it has a clear tested purpose.
- Reduce the current oversized generic card. The banner may overlap scenery,
  but it must not hide the chest glow or collected objects.
- Keep confetti restrained so it does not reduce text or object clarity.

**Exit criteria:** at 1448 × 1086, a side-by-side review recognizes the same
composition, hierarchy, material world, and content as each approved mockup.

### Phase 5 — Gold-master verification and acceptance gate

**Owner: Sol; terra reviewer recommended after implementation**

Run functional QA and capture at least:

- Selection with B selected.
- B hunt at 0/3.
- B hunt after butterfly, ball, and boat individually.
- B hunt after a wrong chest tap.
- B completion.
- Reduced-motion B hunt.
- Keyboard focus-visible states.
- Portrait orientation guidance.

Viewport matrix:

- 1448 × 1086.
- 1024 × 768.
- 1180 × 820.
- One wider landscape viewport to inspect `object-fit: cover` behavior.

Functional acceptance:

- Existing QA passes with no console, page, request, or asset errors.
- Debug start, tap, win, mute, fast-timer, home, and carousel behavior remains.
- Finds work in arbitrary order.
- Wrong taps never increment progress.
- Every actionable target meets the 96 px floor.
- Recorded narration and SFX unlock after user gesture; the debug audio log
  identifies B narration as recorded clips rather than Web Speech.

Visual acceptance:

- No checkerboards, halos, malformed cutouts, in-scene baked UI, or inconsistent
  transparency. Discrete UI assets intentionally contain approved baked text.
- No HUD/object overlap at supported viewports.
- No correct target is visually obscured by the decoy or foreground foliage.
- Letter, prompt, progress, and primary CTA are readable within one glance.
- Empty and filled token states are unmistakable.
- All interactive feedback visibly affects the object that was touched.
- UI and scene share paper texture, edge treatment, lighting, and shadow logic.
- The completion screen retains the chest, all three collected objects, and a
  clear uninterrupted path to NEXT.

The gold master requires explicit user or Sol approval. Passing automated QA
alone is not approval.

### Phase 6 — Scale the approved system to A–Z

**Owner: Sol defines the template; Luna may perform bounded batch production**

Phase 5 visuals were approved by the owner. A/C established the layered
template. During D–Z implementation, Sol approved preserving the stronger
full island plates as baked-target scenes, with raster overlay distractors,
chests, found markers, completion treatment, and semantic hit geometry.

1. Extend the island data model with explicit visual metadata rather than
   relying on generic thirds:

```js
{
  scene: {
    background: '...',
    completion: '...',
    targets: {
      butterfly: { art: '...', x: 0.18, y: 0.52, w: 0.20, h: 0.24 },
      ball:      { art: '...', x: 0.50, y: 0.60, w: 0.16, h: 0.18 },
      boat:      { art: '...', x: 0.22, y: 0.78, w: 0.24, h: 0.18 }
    },
    decoy: { art: '...', x: 0.81, y: 0.57, w: 0.20, h: 0.25 }
  }
}
```

Coordinates above are illustrative only; Sol must supply approved values.

2. Produce A and C next so the entire visible selection window is coherent.

3. Expand in small reviewed batches, for example D–F, G–I, and so on. Do not
   generate or integrate all remaining art before reviewing the first batch.

4. Each island requires:

   - Background plate.
   - Three transparent target layers.
   - One or two transparent, clearly identifiable object layers from other
     letters; these are interactive wrong choices with named letter-contrast
     feedback and do not advance progress.
   - One transparent decoy layer or a decoy deliberately composed into the
     background with a non-overlapping hotspot.
   - Approved normalized positions and hit bounds.
   - Completion strategy: island-specific art or an approved reusable scene
     that can display the collected object layers convincingly.
   - A screenshot at 0/3 and completion.

5. Maintain one prompt template and one negative-prompt checklist for art
   production. Reject assets with:

   - Checkerboard or white matte backgrounds.
   - Incorrect object counts.
   - Accidental letters, words, logos, or watermarks.
   - Inconsistent material style.
   - Mismatched light direction or camera angle.
   - Cropped silhouettes.
   - Objects too close to the HUD safe area.
   - Unclear preschool-level identification.

6. Update QA per batch to check asset existence, natural dimensions, target
   geometry, non-overlapping hit regions, state copy, and screenshot coverage.

## Recommended task breakdown for Luna

Give Luna one task at a time, only after its dependencies are approved.

### Luna task 1 — Correctness cleanup

Files owned: `js/main.js`, `css/style.css`, `tools/qa.mjs`.

Acceptance criteria:

- Broken non-B decoy removed.
- Visible dynamic count added.
- `lower-left` found marker positioned from Sol-provided coordinates.
- B completion uses Sol-approved B art.
- Existing and new functional QA pass.
- No other layout or asset changes.

### Luna task 2 — Approved UI markup integration

Files owned: `js/main.js` and named sections of `css/style.css`.

Inputs required from Sol:

- Final component assets.
- Exact DOM contract.
- Approved coordinate sheet.
- Required and removed controls.
- Reference screenshots.

Acceptance criteria:

- Implementation matches the coordinate sheet at all required viewports.
- Visible UI copy is rasterized and equivalent hidden DOM text remains
  accessible.
- No unapproved copy, control, or layout generalization is introduced.

### Luna task 3 — QA expansion

File owned: `tools/qa.mjs`.

Acceptance criteria:

- Captures every state listed in Phase 5.
- Asserts visible count and correct completion art.
- Records target and decoy rectangles and fails on overlap.
- Retains existing carousel, input, audio-state, and error checks.
- Writes reviewable screenshot artifacts to the agreed output directory.

### Luna task 4 — Approved A–Z metadata batches

Files owned: `js/islands.js` plus an explicitly named asset batch.

Acceptance criteria:

- Only the assigned letters are touched.
- Uses Sol-provided assets and coordinates without creative substitution.
- No asset is accepted with a matte/checkerboard background.
- QA passes for each assigned island and screenshots are returned for Sol
  review.

## Definition of done

This project is visually remediated when:

1. The A/B/C selection and all three A/B/C hunt and completion flows pass their
   visual acceptance gates.
2. The build no longer contains visible placeholder/checkerboard artifacts.
3. UI and scene art read as one papercraft system.
4. Each A/B/C target provides clear, satisfying, stateful visual feedback.
5. The completion screen contains the collected objects and matches the
   approved hierarchy.
6. Functional, accessibility, responsive, and reduced-motion behavior remains
   intact.
7. A–Z expansion proceeds only through reviewed asset batches based on the
   approved template.
8. Selection UI ships complete A–Z raster letter medallions, and the B
   gold-master flow contains no CSS/vector UI imagery.
9. A/B/C narration is recorded, phoneme- and transcript-QA'd teacher voice with
   Web Speech only as a tested fallback.

## Next action

Listen through all 27 recorded A/B/C clips and review their short-vowel,
hard-C, and letter-contrast delivery before closing the A–C batch. Automated
transcription is evidence of line coverage, not phoneme acceptance.
Then review the four A/C hunt/completion captures and begin the next small
Phase 6 batch only after explicit acceptance. Sol continues to own art
direction and acceptance; Luna receives only bounded production tasks with
approved assets, copy, and coordinates.
