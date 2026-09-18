# Calm Corner Cards — Production Game Design

## Product promise

Calm Corner Cards is a score-free, timer-free regulation space for children ages 2–6, with the platform listing focused on ages 5–6. Sunny, a small handmade felt friend, offers four equally valid ways to settle: breathe, squeeze, draw, or rest. There are no wrong choices, streaks, penalties, or demands to finish.

The production game replaces the old generic choose-one prototype. It is a custom four-activity module built around the concept brief and mockups in `01-game-concepts/calm-corner-cards/`.

## Art world

**Canonical direction:** Puppet / Cozy felt fabric.

The whole game reads as a miniature bedtime nook assembled by hand: a moonlit lavender room, stitched floor mat, warm lamp glow, rounded wool cards, and dimensional felt appliqués. Sunny and every primary control are authored raster art. HTML text remains live for legibility and accessibility; CSS is limited to layout, focus, state, and motion rather than drawing the visual world. The breathing focal rings are a transparent raster embroidery asset.

Motion stays slow and breathable. Breathing expands and settles Sunny, the squeeze toy compresses under the hand, stars dim softly, and rewards arrive as quiet glows rather than confetti.

## Experience map

1. **Card shelf** — The room opens with Sunny and four large felt cards. A recorded welcome asks the child to pick what their body needs.
2. **Activity** — One card becomes a focused tactile scene. Back always returns to the shelf; Sound repeats the current direction.
3. **Calm reflection** — A generated felt end panel names the activity without scoring it and offers “Again” or “Cards.”

The first meaningful gesture unlocks recorded narration and starts the low-volume shared lullaby. Music ducks under every spoken line.

## Activity loops

### Breathe

- Tap Sunny’s belly to begin one complete breath.
- Sunny slowly grows for a 2.85-second inhale while an authored golden stitched-ring overlay expands, a flower cue appears, and “Smell the flower” narration plays.
- Sunny settles for a 3.35-second exhale beside a cloud cue and “Blow the cloud” narration.
- A live “Breath 1 of 3” cue and three large stitched stars make pacing explicit. The child decides when to begin the next breath.
- Three breaths complete the card. Navigating away cancels every pending phase safely.

The rhythm is deliberately child-paced between breaths. It never grades breathing or requires microphone input.

### Squeeze

- Press and hold the striped felt squeeze ball; it visibly compresses.
- Release whenever the child’s hand is ready.
- A soft star spark and spoken “Squeeze and soften” acknowledge the release.
- Three press-and-release cycles complete the card.

Pointer capture, pointer cancellation, focus loss, keyboard press/release, and assistive click paths all return the toy to a safe neutral state.

### Draw

- Pick one of four authored patches: sunny yellow, rainbow coral, cloud blue, or star purple.
- Draw freely on a cream felt blanket with a finger, stylus, mouse, or trackpad.
- Undo restores the previous stroke, Clear starts a fresh blanket, and Done is available at any time.
- Done copies the child’s real canvas marks onto a cream felt keepsake card for the reflection screen; the picture is praised before it is discarded.
- There is no drawing recognition or required picture.

Only the child’s transient mark is canvas-rendered. The palette, blanket setting, controls, and surrounding art are raster assets from the game’s felt family.

### Rest

- Sunny rests with a sleepy star under the moonlit room ambience.
- Five tactile felt stars can be dimmed or brightened in any order.
- “All done” remains available immediately; the activity is intentionally open-ended.
- The first softened star receives a quiet recorded acknowledgment.

## Feedback and tone

- **Voice:** warm, unhurried teacher voice clips. Web Speech is fallback only.
- **Music:** `cozy-starlight-lullaby.mp3` at 12% volume, ducked under narration.
- **SFX:** tiny shared taps, pops, sparkles, and whooshes; never loud or startling.
- **Completion:** descriptive, not evaluative. Examples include “Three soft breaths” and “Your happy place.”
- **Idle support:** after 12 seconds of inactivity, the current recorded direction repeats and the primary object gives one subtle brightness pulse.

## Interaction and accessibility contract

- All primary child controls are at least 96×96 CSS pixels in supported layouts.
- Large hit areas use native buttons, visible focus, accessible names, and `aria-pressed` for toggle state.
- Drawing supports pointer/touch plus a keyboard or switch path: arrow keys move an authored star cursor and Space or Enter places a colored mark.
- The game supports landscape, portrait, wide-short screens, safe areas, and reduced motion.
- Kiosk guards suppress accidental selection and context menus while preserving controls and drawing.
- Home on the card shelf returns to the QLOBE catalog. Back during play or reflection returns to the four cards.
- No personal data, microphone, camera, network model call, or persistent child drawing is used.

## Narration script

`assets/audio/lines.json` is the canonical 20-line script. It contains the shelf welcome, each activity introduction, action prompts, idle nudges, completion reflections, and replay line. `assets/audio/manifest.json` publishes only the accepted clips, and `assets/audio/qa.json` records the Whisper comparison for every line.

## Shared module integration

- `audio-unlock.js` — first-gesture media unlock and kiosk guards
- `bgm.js` — looped lullaby, volume, mute, and narration ducking
- `debug-harness.js` — QLOBE_DEBUG v1 automation surface
- `hud.js` — platform Home, Back, and Sound controls
- `idle-nudge.js` — gentle inactivity prompt
- `narrator.js` + `voice-clips.js` — recorded-primary narration with fallback
- `preload.js` — raster decode before reveal
- `screens.js` — shelf/play/end lifecycle
- `sfx.js`, `tap.js`, `timers.js` — consistent input, feedback, and teardown-safe timing

## Automation contract

`window.QLOBE_DEBUG` exposes standard readiness, mode listing, mode start, state, tap, round completion, home, mute, seed, and audio-log methods. Calm-specific helpers can complete breathing, apply one squeeze, finish a drawing, or toggle a rest star. `getState()` reports screen, mode, step, phase, completion, input readiness, drawing stroke count, dimmed stars, mute, timers, and music state.

## Replay and progression

There is no escalating difficulty. Replay value comes from choosing a different body tool, controlling the pace, drawing a different place, and arranging starlight differently. The game’s job is repeatable regulation, not mastery pressure.

## Departures from the prototype

- Replaced the generic choose-one engine and emoji placeholders with a custom tactile four-card room.
- Replaced scenario quizzes and balloon-size choices with the concept brief’s four direct regulation activities.
- Replaced browser speech with 20 recorded voice-clone clips that passed Whisper QA.
- Replaced shared character portraits with Sunny, a game-specific felt mascot.
- Added a real drawing surface, press-and-release mechanics, open-ended rest play, lifecycle-safe cancellation, production responsive layouts, and a generated hub tile.

## Release gate

- All four activities complete with real pointer input.
- Back navigation leaves no timers, held pointers, or narration behind.
- Every image decodes; no remote runtime request occurs.
- Voice manifest and transcript QA contain exactly the canonical 20 keys.
- Primary targets pass 96px sizing in desktop, portrait, and compact landscape.
- Chrome screenshots pass visual review in shelf, active activity, reflection, portrait, compact, and reduced-motion states.
- Registry, usage index, validator, source checks, and production smoke all pass.
