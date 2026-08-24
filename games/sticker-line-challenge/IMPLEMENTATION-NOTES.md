# Implementation notes — Sticker Line Challenge rebuild

## What changed

The trace-path-engine stub (emoji placeholders, Web Speech only) was replaced
with a bespoke papercraft game. `config.js` is now a thin fetch shim over
`config.json` (studio-editable); the old engine config is gone.

## Files

| file | role |
| --- | --- |
| `index.html` | three `[data-qk-screen]` sections (splash / play / end) + aria-live status |
| `config.js` | fetch shim → `config.json` |
| `config.json` | lines, buddies, tuning, music, 3 modes × 3 rounds of path control points |
| `css/style.css` | layout only; all visible art is raster sprites (no CSS illustration) |
| `js/paths.js` | pure path math: midpoint-quadratic sampling, arc-length resample, tangents, windowed nearest-sample, stamp layout |
| `js/playfield.js` | canvas renderer + pointer trace controller (static layer cached to offscreen canvas; ribbon/dashes are authored paper sprites stamped along the path tangent) |
| `js/main.js` | screens router, audio, HUD, buddy/mode pickers, celebration, QLOBE_DEBUG |
| `tools/gen_images.sh` | resumable local-API generation (t2i + layered extraction) |
| `tools/postprocess.py` | trim / resize / encode / alpha QA composites |
| `tools/gen_audio.sh` | resumable voiceclone batch + manifest + whisper QA |
| `tools/fix_page.sh` | one-off landscape page regen (kept for provenance) |
| `tools/smoke.mjs` | house-driver Chrome QA (34 checks) |

## Shared modules used

voice-clips, sfx, audio-unlock, hud, tap, screens, celebrate, idle-nudge,
debug-harness, timers, rng, preload, bgm + shared HUD art and
`whimsical-toy-workshop.mp3` (craft-table mood; quiet 0.16, ducked under
speech).

## QLOBE_DEBUG surface

`ready`, `listModes`, `startMode(id, round)`, `getState` (screen, mode, round,
pathId, buddy, progressFraction, checkpointsPassed/Count, dragging, wandering,
completed), `getTargets`, `tracePoints` (live sampled path as canvas
fractions), `trace(points)` (drives the real window pointer handlers),
`winRound`, `mute`, `seed`, `sayLine(key)`, `fastTimers`.

## Deviations / known items

- Voice batch pending: `qwen3-tts-voiceclone` was returning connection resets
  server-side during the build pass; `tools/gen_audio.sh` is resumable and the
  game runs on the Web Speech fallback until it lands.
- End screen uses back (not home as in mockup 03) per the platform nav rule;
  banner text is HTML on blank paper banners per the functional-text rule.
- Checkpoints: control points when ≤6, else 6 evenly spaced by arc length.
- Hub tile unchanged (curated surface, already matches the hub grammar).
