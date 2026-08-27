# Monster Opera — independent art review

**Date:** 2026-08-27

**Reviewer:** independent adversarial `terra_reviewer` pass

**Final verdict:** **PASS WITH POLISH — no release blockers**

## Scorecard

| Area | Score |
| --- | ---: |
| Mockup fidelity | 8/10 |
| Hierarchy | 8/10 |
| Child delight | 9/10 |
| Tablet usability | 8/10 |
| Finish | 8/10 |

## Coverage

The reviewer inspected the production captures for splash, authored composer,
concert, portrait, short-landscape, and reduced-motion layouts, plus the final
catalog tile. The package passed its visual release gate with:

- no black video/media rectangles or rectangular shadow halos;
- no materially tiny targets or clipped controls;
- a stable and legible reduced-motion concert;
- one coherent chalk-blackboard world across catalog, splash, composer,
  concert, and social packaging; and
- a catalog tile made from the actual title, cast, slate, and lane artwork.

The final real-Chrome interaction run passed all 198 production checks. Its
review captures are reproducible with `node games/monster-opera/tools/qa.mjs`.

## Resolved during review

- Replaced the rejected glossy generated catalog candidate with a production
  composition built from the game's final chalk artwork and supplied cast.
- Removed opaque rectangular drop-shadow treatments around black-backed media.
- Corrected the playhead and lane-marker slicing, enlarged authored dots, and
  restored full-width composer lane strokes.
- Enlarged sparse concert performers, softened the concert plate, and added a
  gentle first-interaction invitation.
- Added a portrait cast-rail discovery nudge without obscuring the timeline.
- Replaced every composer's static idle pose with its four-second dance loop,
  while preserving the still artwork as the reduced-motion fallback.
- Applied Screen blending directly to every video and added a Screen-blended
  media group fallback for browsers that promote video into hardware layers.
- Added mouse-wheel and click-drag navigation to the cast rail while retaining
  native touch swiping and preventing drags from accidentally recording notes.

## Correction re-review

Fresh production captures of the splash, dancing composer, active concert
solo, portrait, and short-landscape layouts show no black rectangles, gray
mats, compression-box outlines, or shadow halos. The independent adversarial
review remains **PASS WITH POLISH**, with no release blockers.

The final Listen-mode re-review also inspected the idle dance renderer, manual
solo, and exact 16→0 seam frame after moving dense songs onto the twelve-source
shared video pool. It returned **PASS**: no canvas matte, scaling degradation,
stale idle frame, or Screen-blending mismatch was visible.

The final spacing re-review added dense landscape and portrait compositions,
near-time groups, loop-seam groups, control clearance, and direct center-point
tap ownership. It returned **PASS**: local grids are evenly spaced, stay centered
on their authored musical moments, remain visually continuous at the seam, and
do not spill between lanes or behind fixed controls.

## Non-blocking polish

For a song with only one or two events, the concert's large looping chalk arcs
remain deliberately theatrical and can dominate the sparse cast. The supplied
slate also has bright wear marks in its right third. Both are taste-level
characteristics of the approved art world, not comprehension or release issues.
