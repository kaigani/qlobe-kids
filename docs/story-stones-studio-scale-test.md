# Story Stones: QLOBE Studio scale test

Status: implemented and browser-verified 2026-07-22

Story Stones tests a second animation architecture alongside standard puppets:
new AI-assisted storybook art, whole-image pose swaps, reusable props, and a
combinatorial story grammar.

## What scaled successfully

- The Studio registry exposes only the workspaces a project supports. Story
  Stones shows **Poses**, Props, and Scenes; puppet games retain Build, Rig,
  Animate, Speech, Props, Scenes, and/or Music Sync as declared.
- Five actors share one six-pose semantic vocabulary: `neutral`, `enter`,
  `notice`, `interact`, `react`, and `celebrate`.
- Pose manifests keep a fixed canvas, baseline, anchor, accessible description,
  and paper-pop duration editable in Studio.
- Story Composer browses all 220 unordered combinations, authors complete
  three-beat stories and reveal/story/settle pose cues, generates unique Krea
  scenes, and previews the exact shipping resolver and Pixi stage.
- Prop Studio previews both standard puppets and pose actors.
- One v2 story pack contains 220 complete stories and collapses all 1,320 input
  permutations onto the correct unordered set.
- Each story owns a stable cast order, three teacher-narration keys, and one of
  220 unique 1344×768 environment-only WebP settings.
- Krea concepts, GPT Image 2 masters/variations, keyed alpha sources, and compact
  runtime derivatives remain separated and reproducible.

## Architectural result

PixiJS plus QLOBE Studio remains the right boundary for this game family. The
system now supports two deliberately separate actor contracts:

1. Canonical or flexible bone-rig puppets for continuous acting, speech, props,
   and music performance.
2. Pose actors for authored storybook moments where a complete illustration is
   more expressive and art-directable than deformation.

Both use the shared theater, prop, effect, scene, and static-HTML5 infrastructure.
Adopting Godot would not improve this asset contract enough to justify losing the
open web workflow.

## Verified result

- 30 production pose sprites and five valid pose manifests.
- Seven rebuilt prop sprites and one rebuilt Castle Meadow backdrop.
- Exhaustive resolver pass: 220/220 combinations and 1,320/1,320 permutations.
- Shipping vignette: two pose actors plus a prop, ending in `celebrate`.
- Studio Poses, Props, and Scenes loaded with zero console/network failures.
- My Puppet Band and Puppet Problem Solvers regression flows remained healthy.

## Current limits

- Pose changes are discrete authored beats, not continuous interpolation.
- Complete-image sprites cannot inherit puppet hand sockets; Story Stones props
  are therefore floor/stage objects. A future pose manifest may add pose-local
  semantic sockets when a storybook game needs held props.
- Matte cleanup is deterministic but difficult color-on-key combinations still
  benefit from hand review in an image editor.
