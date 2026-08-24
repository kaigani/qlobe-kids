# Sticker Line Challenge — Production Game Design

**Game id:** `sticker-line-challenge` · **Category:** writing-fine-motor · **Ages:** 5–6
**Status:** replaces the trace-path-engine stub in full (custom game, engine retired for this id)
**Art world:** **Papercraft** (canonical label; legacy runtime slug `paper-garden`)
**Concept source:** `../01-game-concepts/sticker-line-challenge/` (brief + 4 mockups)

---

## Product promise

A craft-table world of torn paper, washi tape, and die-cut stickers. The child
picks a sticker buddy, lays it at the start of a cut-paper ribbon path, and
traces the line with one finger — the buddy stamps a trail of mini-stickers as
it goes, star checkpoints pop as they are passed, and a finished line earns a
full rainbow celebration. One skill: **controlled continuous line tracing**
(pre-writing strokes).

## Core loop (45–75 s)

1. Splash: pick a sticker buddy (4 die-cut stickers), pick a line (3 paper
   cards: waves / zigzags / loops). Spoken guidance, zero reading.
2. Play: buddy sits on the start of a dashed paper ribbon on a notebook page.
   Child drags it along the path. Passing each control point pops a gold star
   checkpoint (sparkle sfx, counter cloud sheds a star). The buddy stamps a
   mini-sticker trail behind it.
3. Drifting off the ribbon softens it and — after ~1.5 s — a gentle spoken
   nudge. No failure state; progress is never lost.
4. Reaching the dashed buddy outline at the end: stamps wave, confetti, warm
   cheer → end screen (rainbow, "NEW LINE" banner button, back → splash).
5. A mode is 3 rounds with growing difficulty; rounds cycle within the mode.

## Screen map

| Screen | Contents | Exit |
| --- | --- | --- |
| Splash | Title lockup (generated art), buddy tray (4 stickers), 3 line cards, home btn | card tap → play |
| Play | Notebook-page panel on papercraft desk, ribbon path, checkpoints, buddy, counter cloud, back btn, sound btn | path done → end |
| End | Rainbow celebration backdrop, "Line complete!" banner, NEW LINE button, back btn | → splash |

Navigation follows the platform rule: **home** on splash only (→ catalog),
**back** on play/end (→ splash). (Departure from mockup 03, which shows a home
button on the end screen.)

## Modes (ids preserved from the registered stub)

- `waves` — Wavy Lines: 3 rounds, amplitude grows.
- `zigzags` — Zigzag Trails: 3 rounds, turn count grows.
- `loops` — Loop-the-Loops: 3 rounds, from two loops to a big loop-and-tail.

Each round = one path from `config.json` (`points`, control-point space
1200×800, smoothed at runtime with quadratic-through-midpoints sampling).

## Spoken script (verbatim, recorded voice, platform teacher clone)

| key | line |
| --- | --- |
| welcome | Hi! Pick a sticker friend! |
| picked | Great choice! |
| pick_line | Now, pick a line! |
| mode_waves | Wavy lines! Follow the wave with your finger. |
| mode_zigzags | Zigzag trail! In and out, here we go! |
| mode_loops | Loop the loops! Round and round! |
| round_start | Put your finger on the sticker and follow the line! |
| halfway | Halfway! Keep going! |
| almost | Almost there! |
| nudge | Oops! Come back to the line! |
| cheer_1 | You did it! Amazing tracing! |
| cheer_2 | Wonderful! You followed the whole line! |
| cheer_3 | Hooray! What careful fingers! |
| line_done | Line complete! You are a tracing superstar! |
| new_line | Pick a new line! |

Fallback: Web Speech via `voice-clips.js` defaults.

## Art list (all Papercraft; visible renderer vs interaction substrate)

Every child-facing object is an authored raster sprite. The canvas/DOM layers
supply only geometry, hit areas, and motion — never visible material.

| asset | size | renderer | notes |
| --- | --- | --- | --- |
| `assets/bg-splash.jpg` | 1600×1200 JPEG ≤300 KB | full-bleed backdrop | sky-blue torn-paper collage, washi tape corners, calm center (mockup 01) |
| `assets/bg-play.jpg` | 1600×1200 JPEG ≤300 KB | full-bleed backdrop | violet torn-paper desk, calm center for page (mockup 02) |
| `assets/bg-end.jpg` | 1600×1200 JPEG ≤300 KB | full-bleed backdrop | rainbow + paper stars on blue (mockup 03) |
| `assets/page.png` | ~1400×900 RGBA | play-field panel | torn-edge lined notebook paper |
| `assets/title.webp` | ~1100×460 RGBA | splash brand art | papercraft lettering lockup "Sticker Line" — spell-check every letter |
| `assets/cards/wave.png` `zigzag.png` `loop.png` | ~380×460 RGBA | mode cards | cream paper card + colored dashed ribbon (blue/pink/green) |
| `assets/buddies/star.png` `rainbow.png` `heart.png` `flower.png` | 420 px RGBA | buddy stickers, trail stamps, checkpoint stars | die-cut white border, glossy sticker finish |
| `assets/ui/dash.png` | ~72×30 RGBA | ribbon dashes | purple paper dash, stamped along path centerline |
| `assets/ui/blob.png` | ~120 px RGBA | ribbon band | soft lavender paper-texture pad, stamped overlapping along path |
| `assets/ui/banner-green.png` | ~620×170 RGBA | button skin | blank green torn-paper banner (HTML text on top) |
| `assets/ui/banner-pink.png` | ~700×170 RGBA | header skin | blank pink torn-paper banner (HTML text on top) |
| `assets/ui/cloud.png` | ~320×150 RGBA | counter label | blue paper cloud; mini star icons shed as checkpoints pass |
| shared `ui/btn-home.png` `btn-back.png` `btn-sound.png` | shared | HUD | reused from `shared/assets/ui/` |

**Procedural-renderer justification (the one allowed):** the ribbon band and
dashes are stamped along the exact path geometry using the authored paper
sprites above (rotation from path tangent). The *material* is authored art;
only placement is computed, because path shapes are data-driven. No CSS/SVG
gradients, borders, or shadows appear on any child-facing object.

**Departures from mockups (deliberate):** baked banner text → blank banners +
HTML Fredoka text (functional-text rule); "4 left" text → star-icon cloud
counter (pre-literate); end-screen home → back button (navigation rule);
buddy picker added to splash (agency promised in the brief, absent from
mockups).

## Interaction rules

- Pointer Events, window-level listeners keyed by `pointerId`; `pointercancel`
  / blur = cancel (progress kept); one active drag; grab forgiveness 140 px
  around the buddy; trace tolerance 80 px; pointer-to-buddy offset preserved.
- `touch-action: none` on the play field; kiosk guards; audio unlock fans out
  on first gesture (`audio-unlock.js`), voice via `voice-clips.js` with
  `sfx.js` for pops/sparkles, BGM from `shared/assets/music/` via `bgm.js`
  (quiet, ducked during speech, stops on exit).
- Idle nudge ladder after 12 s of no touch (auto-demo comet along the path).
- Reduced motion: confetti/tada no-ops (shared `celebrate.js`), stamps appear
  without bounce.

## Difficulty & replay

Within a mode, rounds order fixed easy→hard; after round 3 the mode loops with
a cheer. Buddy choice is free every round (re-pick at splash). Variation comes
from 9 distinct paths and 4 buddies.

## Privacy / persistence / fallback

No network calls at runtime, no microphone, no persistence beyond nothing
(stateless rounds). Recorded clips with Web Speech fallback; game fully
playable with clips missing.

## Shared modules used / strengthened

`voice-clips`, `sfx`, `audio-unlock`, `hud`, `tap`, `screens`, `celebrate`,
`idle-nudge`, `debug-harness`, `timers`, `rng`, `preload`, `bgm`, `dom`,
shared HUD art. New shared capability: none required (path-stamp rendering is
game-local; if a second tracing game adopts it, promote `js/paper-trace.js` to
`shared/js/`).

## `QLOBE_DEBUG` surface (v1)

`ready`, `listModes`, `startMode(id, round)`, `getState()` (screen, mode,
round, path id, progress arc length, checkpoints passed, buddy, dragging),
`getTargets()` (buddy start, path samples), `trace(points[])` (drive the real
pointer handler through a path), `winRound()`, `mute()`, `seed(n)`,
`fastTimers()`, `voice(key)`.

## Risks / release gate

- Layered extraction is a redraw: eyeball every buddy against its charcoal
  source before shipping.
- Title lockup: AI typography — reroll on any malformed letter.
- Loop paths must read as loops after midpoint smoothing — visual QC each of
  the 9 paths at tablet size.
- Gate: zero page errors/404s, smoke test green in landscape+portrait, art
  director review passed, then `beta` until the real-iPad playtest.
