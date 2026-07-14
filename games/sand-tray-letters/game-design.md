# Game Design Document — Sand Tray Letters

## Product summary

Sand Tray Letters is a custom, tactile early-writing game for ages 5–6. It
translates a Montessori-style material tray into a responsive digital surface:
the child chooses sand, salt, or flour, follows ordered formation cues, and
reveals a turquoise layer as each groove is traced.

The rebuilt game is based on the July 2026 concept video, brief, and approved
UI mockups. It no longer uses the shared `trace-path` engine.

## Learning goals

1. Build motor memory for uppercase letter formation.
2. Practice starting position, direction, and stroke order.
3. Connect a completed letter shape to its spoken sound.
4. Encourage controlled one-finger movement with forgiving guidance.

## Core loop

1. Choose Golden Sand, White Salt, or Soft Flour.
2. Follow the orange start point and arrow for the current stroke.
3. Drag near the dotted path to part the material and reveal blue beneath.
4. Complete every ordered stroke and hear the letter name/sound.
5. Shake the device to smooth the tray, or tap Next Letter.

## Letter sequence

The production set contains all 26 uppercase forms, A–Z. Each new run shuffles
the full deck with Fisher–Yates, then presents every letter exactly once without
repeats. Starting another run creates a fresh order.

Formation paths and their ordered strokes are stored as 1000 × 700 board
coordinates in `config.js`. The custom engine resamples them into forgiving
progress checkpoints at runtime.

## Voice

Recorded teacher voice via `shared/js/voice-clips.js` (Web Speech fallback).
Each letter's spoken sound reuses the shared phonics library
(`shared/assets/audio/fragments/`) where a fragment exists (19 letters); the
seven without one carry the phonic in their praise clip. See `ASSETS.md`.

## Interaction and feedback

- A trace must begin near the current orange marker.
- Progress moves forward along the expected stroke; large deviations gently
  shake the tray and replay a short cue.
- Completed grooves use a dark displaced-material rim, turquoise underlayer,
  highlight, and sparse edge grains.
- Each material has a procedural grain surface and filtered noise response:
  smooth sand, crisp salt, and muted flour.
- The guide becomes more subtle later in the sequence, while the start point
  and direction arrow remain explicit.
- Success adds star confetti, a letter-specific affirmation, and the spoken
  letter sound.

## Shake and reset

`DeviceMotionEvent` is used when available. A deliberate shake on the success
screen advances to the next letter with a smoothing animation. Because motion
permission and accelerometers are not universal, Reset and Next Letter remain
fully equivalent touch controls.

## Accessibility and safety

- Large controls and forgiving path tolerance support early motor skills.
- Every image has alt text; the canvas and state changes have accessible labels.
- Visual copy is reinforced by speech.
- Reduced-motion preferences disable extended animation and confetti.
- No score, timer, failure state, or judgmental correction is used.

## Debug contract

The game implements `window.QLOBE_DEBUG` v1 with the custom engine identifier
`custom-sand-canvas`. `winRound()` completes a letter through the same groove
rendering state and advances to the next round. `tracePoints()` exposes the
current stroke for pointer-input review automation.
