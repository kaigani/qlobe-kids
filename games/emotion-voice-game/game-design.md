# Emotion Voice Game — production design

## Product promise

Teddy shows a feeling, models one short line, and invites the child to make the
same words sound happy, proud, calm, or silly. The 45–90 second loop builds
expressive prosody and performance confidence without grading the child’s
emotion or saving their voice.

One mode, one skill: **expressing the same sentence with contrasting vocal
feelings**. Repeating “I can do it!” removes language load so pitch movement,
energy, pacing, and steadiness become the play material.

## Screen map and navigation

1. **Feeling chooser / splash** — authored title, Teddy, and four large felt
   cards. Home is available only here and returns to the catalog.
2. **Performance stage** — selected Teddy pose, spoken model, exact line,
   microphone button, live three-light voice meter, and four progress dots.
   Back returns to the in-page chooser.
3. **Celebration** — matching Teddy pose, one to three voice sparks, spoken
   specific praise, confetti, and Next Feeling. Back returns to the chooser.
4. After all four feelings, Next becomes Encore and resets the set.

## Core loop

1. Child taps Happy, Proud, Calm, or Silly.
2. Teddy’s visual pose changes and the coach models “I can do it!” in that
   style, then invites imitation.
3. Child taps the microphone. Permission is requested only from that gesture.
4. The service analyzes volume, pitch range, energy variation, and voiced
   duration locally for about 2.3 seconds. No samples or recording are retained.
5. Any clearly heard attempt succeeds. The features vary the one-to-three spark
   reward; they never produce a wrong answer or claim to identify an emotion.
6. If the mic is unavailable or denied, a large star becomes the perform button;
   the child says the line while tapping and receives the same warm completion.

## Spoken script (verbatim)

- Welcome: “Welcome to the Feelings Theater! Choose a feeling for Teddy to try.”
- Next: “Choose another feeling for Teddy.”
- Ready: “When the light glows, say: I can do it!”
- No mic: “That is okay. Tap the sparkling star while you say the line.”
- Quiet nudge: “I am listening. Bring your voice a little closer.”
- Happy model: “Happy voice! I can do it! Now show me your bright, bouncy voice.”
- Proud model: “Proud voice! I can do it! Now stand tall and use your strong, steady voice.”
- Calm model: “Calm voice. I can do it. Now breathe in and use your soft, smooth voice.”
- Silly model: “Silly voice! I can do it! Boing boing! Now make your funniest wiggly voice.”
- Happy praise: “I heard that happy sparkle!”
- Proud praise: “That voice sounded strong and proud!”
- Calm praise: “That was soft and peaceful.”
- Silly praise: “Ha! That was wonderfully silly!”
- Finale: “Bravo! Your voice brought every feeling to life!”

The exact script lives in `assets/audio/lines.json`. Teddy uses the previously
shipped Benny Bear character voice as the production reference. Each recorded
line is Whisper-checked and Rhubarb-aligned; canonical cue files drive Teddy's
generated muzzle visemes through the shared cue walker. All 14 production lines
ship locally as M4A plus cue JSON; `voice-clips.js` retains device speech only as
the standard missing-file safety fallback.

## Art direction and inventory

World: **Puppet / cozy felt fabric**. The concept mockups’ red-curtain theater,
cream stitched banners, navy/orange palette, plush hero, and front-lit stage are
the visual north star. Instructional text remains HTML; every primary physical
object (stage, character, emotion card, mic, and reward star) is raster art.

| Asset | Runtime size / format | Purpose |
| --- | --- | --- |
| `assets/felt-stage.webp` | 1440 × 1080, opaque WebP | full-bleed 4:3 theater |
| `assets/title.webp` | alpha WebP, ≤980 × 440 | exact splash title lockup |
| five `assets/characters/bear-*.webp` | 480 × 680 alpha WebP | registered emotion poses |
| ten `assets/characters/teddy/anim/mouth-*.png` | 150 × 130 alpha PNG | canonical timed speech shapes plus rest |
| four `assets/ui/card-*.webp` | alpha WebP | authored felt choice carriers |
| `assets/ui/mic.webp` | alpha WebP | microphone action control |
| `assets/ui/star.webp` | alpha WebP | fallback action and voice sparks |
| `assets/ui/prompt-banner.webp`, `next-button.webp` | alpha WebP | authored instruction and action carriers |

Generated sources are retained under `assets/source/`. Chroma extraction,
largest-component cleanup, normalization, sizing, and encoding are reproducible
through `tools/process-art.py`.

## Interaction and feedback rules

- All controls are at least 96 CSS pixels in tested layouts.
- First-gesture audio unlock uses the shared platform fan-out.
- A newer screen stops the previous spoken line.
- Live meter lights respond to energy but never expose numbers to the child.
- Quiet input gets one gentle spoken nudge and another try.
- Clear speech always completes; spark count is variation, not a grade.
- The mic is stopped whenever play is exited, and on `pagehide`.
- Touch, context-menu, zoom, safe-area, and reduced-motion guards use shared
  platform behavior.

## Capability made stronger

`shared/js/voice-meter.js` is the reusable service introduced by this game. It
owns microphone request/teardown, local time-domain analysis, pitch estimation,
summary features, and gentle profile-relative spark scoring. Pure analysis and
scoring functions are exported for deterministic verification. The service
does not record, persist, upload, or label a child’s emotion.

## Privacy, permission, and fallback

- Audio samples remain inside the live `AudioContext` graph and are discarded.
- No `MediaRecorder`, Blob, IndexedDB, localStorage, network request, account,
  analytics, or tracking is used.
- Permission is requested only after the child taps the microphone.
- Denial, unsupported APIs, or unavailable `AudioContext` all route to the
  same image-led tap-and-say fallback.

## Departures from the concept and old prototype

- The old `observe-journal` emoji prototype is replaced completely; expressive
  voice is now the mechanic rather than a pretend sticker journal.
- “Scared” and “sleepy” become Calm and Silly. This creates four contrasting,
  inviting acoustic profiles and avoids making a child perform fear to proceed.
- One repeated phrase replaces several sentence and animal submodes. It better
  isolates prosody, keeps the loop under 90 seconds, and makes every screen
  readable within five seconds.
- The result does not say an algorithm recognized a feeling. Browser microphone
  features cannot support that claim fairly; the feedback celebrates intentional
  voice play instead.

## Debug and release gate

`window.QLOBE_DEBUG` v1 exposes `ready`, mode start, current screen/emotion,
completed feelings, microphone permission/mode, the last acoustic summary,
target collection, fake-mic deterministic play, tap, win, mute, and home.

Production QA (`node games/emotion-voice-game/tools/qa.mjs`) covers landscape,
1024×768 mic denial, 820×1180 touch portrait, compact reduced motion, viseme
registration, the full
choose → perform → celebrate loop, ≥96 px targets, progress, no-mic completion,
zero page errors, zero failed requests, and zero remote runtime calls.

Status remains **beta** until a real child playtest confirms microphone distance,
spoken-prompt pacing, and whether four rounds feels right.
