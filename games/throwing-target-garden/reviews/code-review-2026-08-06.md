# Throwing Target Garden — independent code and regression review

**Review date:** 2026-08-06
**Reviewers:** independent `terra_reviewer` passes (`final_pipeline_review`,
`final_code_audit`, `polish_diff_review`, and `final_code_review`) plus the
separate reward-path trace
**Final disposition:** **PASS — no local runtime or integration blocker**

## Scope

The final read-only review covered the game runtime, shared camera tracker,
catalog/hub registration, asset/audio manifests, real-Chrome QA driver,
deterministic art export, Krea staging/install tool, Qwen/Whisper voice tool,
published recorded batch, and offline pipeline regressions. Real-device/child
validation is treated as a declared external gate, not silently waived.

## Finding and closure record

| Finding | Resolution | Verification |
| --- | --- | --- |
| Successful camera, tap, and drag paths all converged on a direct-target reward that contradicted the basket-only safety contract. | Rebuilt the shared reward and end renderers around `basket.webp`; the target remains only a separate recognition cue, and unsafe lockup/garland assets are no longer preloaded or rendered. | Four reward paths assert basket destination, bag geometry, semantics, and absence of unsafe lockups; real-Chrome QA passes. |
| HTML messages used CSS-styled panels despite the no-CSS-art rule. | Replaced them with the accepted green raster carrier, including a deterministic three-slice wide export. | QA asserts raster image carrier, transparent DOM background, and zero borders on setup, privacy, and end messages. |
| Voice QA could become stale relative to the authored script, and worker/command failures could leave misleading publication state. | Added intended-text hashes/timestamps for all 49 lines, model-family batching, timeout/start-error results, a single-writer lock, atomic clip publication, and immediate fail-closed manifest blanking. | All 49 clips are published; independent rehash/media review found zero mismatches, and Chrome verifies the checksum-bound recorded path plus forced empty-manifest fallback. |
| Concurrent hub installs or an interruption after JPEG replacement could leave two installed receipts or a final/receipt mismatch. | Added a publication lock, per-process final temporary, final SHA receipt, atomic supersession, and a hash-bound recovery journal written before replacement. | Distinct-seed concurrency leaves exactly one canonical receipt; an injected interruption after replacement is recovered to the exact installed hash on the next locked publication. |
| Same-seed forced generation still had a candidate/receipt TOCTOU risk. | Recompute and compare candidate SHA while holding the publication lock in both install and candidate-only publication; fail before writing on mismatch. | Deterministic same-seed replacement regression proves neither final JPEG nor receipt is written; independent pipeline re-review: **PASS**. |
| `--install` could label an unreviewed candidate accepted without separate critic evidence. | Installation now requires a separate `qlobe-visual-review` receipt bound to the exact candidate path and SHA, with at least two unanimous scores of 9.0 or higher; the installed recipe records the review path and hash instead of fabricating acceptance. | Offline regressions reject missing and hash-mismatched review receipts; canonical seed 2026 is bound to the exact Krea candidate and three independent scores **9.4/9.7/9.3**. |
| A track ending while `video.play()` was pending could be overwritten as live, and a stale request completion could release a newer stream. | Startup now requires the current token, exact stream identity, and `requesting` state; stream-specific release can never detach a newer owner. | Two deferred-play browser regressions retain `ended` after an early track end and preserve stream B through stale stream A completion. |
| Hidden/pagehide, ended-track, frame-read-error, and true timeout/late-grant teardown existed without mocked-stream regression coverage. | Added mocked real track/stream lifecycle tests that assert stop, source release, and fail-closed state/reason for every path. | Current Chrome rerun includes stationary captureStream no-score, flipped/unmirrored side-target hit, and real track-ended-during-camera-flight with no stale reward (manually dispatched real-track `ended` handler), plus recorded/fallback audio and responsive coverage; **192/192** checks, **44/44** captures; independent final code review: **PASS**, no P0–P2. |
| The first production-polish Touch Toss route was color-aware but dock-local, so its vertical arrow could point away from a side target and its presence-only test could not detect that mismatch. | Moved the cue into play-screen coordinates and measure the actual rendered guide bag and active target on render, selection/reset, and resize. | Browser QA independently checks origin/tip geometry, target color/X identity, alignment cosine, route length, and viewport containment in fresh, camera-fallback, and compact play. The left-target fallback measures 1.03px at the bag, 5.98px at the target, and 0.9999997 alignment; post-fix code review: **PASS**. |
| Generated head metadata had drifted from `game.json`. | Regenerated the canonical head block with the repository pipeline. | `gen-head-meta.mjs --check --only throwing-target-garden` reports exact agreement. |
| Design/asset handoff text still cited an older check count and pending visual rerun. | Reconciled the GDD and asset handoff with the authoritative final run and blind matrix. | Final reviewer confirmed the evidence is internally consistent. |

## Final verification evidence

- Real Google Chrome: **192/192 checks**, **44/44 captures**, including the actual
  hub listing/launch; the complete report is written only after flows and
  browser close succeed.
- Shared tracker: color/component/motion/cooldown tests plus denial, stop/late
  grant, timeout/late grant, hidden, pagehide, track-ended, and frame-read-error
  lifecycle tests.
- Offline authoring pipelines: **10/10 tests**.
- Asset exporter/audit: deterministic source-preserving processing; **34/34**
  audited raster outputs valid.
- Registry validator: **0 errors** (unrelated pre-existing warnings only).
- Generate-template validator: **0 errors**.
- JSON parsing, ES-module syntax checks, and `git diff --check`: **PASS**.
- Runtime network audit: no unexpected remote requests in landscape, portrait,
  compact, wide-short, reduced-motion, recorded-voice, or forced-fallback
  sessions.

## Open gates, not review defects

1. Complete the specified real-iPad throw matrix and target-child playtest
   before changing the game from `beta`.
