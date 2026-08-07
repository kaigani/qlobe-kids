# Throwing Target Garden — final three-critic visual review

**Review date:** 2026-08-06
**Screen reviewers:** independent `terra_reviewer` critics
`prod_visual_layout_v2`, `prod_visual_art_v2`, and `prod_visual_child_v2`
**Unchanged asset reviewers:** `visual-a`, `visual-b`, and `visual-c`
**Disposition:** **PASS**

The authoritative packet contains 44 real-Chrome screenshots and 36 reviewed
visual assets. After production-polish changes, all 44 screenshot bytes were
reopened and rescored by three independent critics. The unchanged assets retain
their original three-critic review. Acceptance required every screenshot and
every `shipping: true` asset to receive three scores of at least 9.0. The exact
hashes, dimensions, byte counts, per-item scores, scoped reviewer IDs, shipping
flags, and QA/code-review links are recorded in
`final-unanimous-visual-review.json`.

| Screen critic | Lowest screen | Result |
| --- | ---: | --- |
| `prod_visual_layout_v2` | 9.2 | PASS |
| `prod_visual_art_v2` | 9.2 | PASS |
| `prod_visual_child_v2` | 9.1 | PASS |

The retained asset reviewers' lowest shipping-asset scores are 9.4, 9.2, and
9.2 respectively.

**Final inventory:** 44/44 screens PASS; 34/34 shipping assets PASS. The global
minimum screen score is 9.1 and the global minimum shipping-asset score is 9.2.
Receipt v2 binds 84 files under aggregate SHA-256
`75a47fbd938342d3cf75c788b60de4ec7d32ebd6d1f9e32dcb88a04a1e41f54b`.

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
