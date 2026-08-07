# Throwing Target Garden — final three-critic visual review

**Review date:** 2026-08-06
**Screen reviewers:** independent `terra_reviewer` critics
`prod_visual_layout_production`, `prod_visual_art_production`, and
`prod_visual_child_production`
**Unchanged asset reviewers:** `visual-a`, `visual-b`, and `visual-c`
**Disposition:** **PASS**

The authoritative packet contains 44 real-Chrome screenshots captured from
`https://qlo.be` and 36 reviewed visual assets. After production deployment,
all 44 production screenshot bytes were reopened and rescored by three
independent critics. The unchanged assets retain their original three-critic
review. Acceptance required every screenshot and every `shipping: true` asset
to receive three scores of at least 9.0. The exact hashes, dimensions, byte
counts, per-item scores, scoped reviewer IDs, shipping flags, and QA/code-review
links are recorded in
`final-unanimous-visual-review.json`.

| Screen critic | Lowest screen | Result |
| --- | ---: | --- |
| `prod_visual_layout_production` | 9.2 | PASS |
| `prod_visual_art_production` | 9.2 | PASS |
| `prod_visual_child_production` | 9.1 | PASS |

The retained asset reviewers' lowest shipping-asset scores are 9.4, 9.2, and
9.2 respectively.

**Final inventory:** 44/44 screens PASS; 34/34 shipping assets PASS. The global
minimum screen score is 9.1 and the global minimum shipping-asset score is 9.2.
Receipt v3 binds 84 files under aggregate SHA-256
`3da051bee5deb384a4f4c5cdbd64addc9b8b78d87c9319e0f6fb488fd2a42cc1`.

The final loop closed the initial blockers by:

- giving near-miss, wrong-color, wrong-order, idle, and no-bag states durable,
  warm visual cues;
- teaching Touch Toss with explicit pick/drag/flick text, an immediate glowing
  suggested bag, and a measured color-aware stitched route from the rendered
  bag to the rendered active target that persists after camera fallback;
- distinguishing denied, unavailable, error, timeout, and in-play camera-loss
  fallbacks without showing or saving camera imagery;
- enlarging compact safety copy, labeling the three calibration lanes, and
  rebalancing compact reward/end hierarchy;
- replacing the generic clay hub card with reviewed Krea seed 2026, a full-frame
  felt target garden accepted at 9.4/9.7/9.3.

`assets/ui/target-hit.webp` and `assets/ui/end-garland.webp` remain explicit
`REJECTED_CONTROL` artifacts. They preserve the disallowed beanbag-on-target
composition for audit history only and are excluded from preload, runtime,
marketing, and the shipping minimum.
