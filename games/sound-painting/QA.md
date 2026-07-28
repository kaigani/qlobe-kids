# Sound Painting — release evidence

## Local release candidate

Date: 2026-07-27

- Clean main-based worktree served at `http://127.0.0.1:4173`.
- Real Google Chrome, landscape 1180×820: pass.
- Real Google Chrome, portrait 820×1180: pass.
- Reduced-motion replay: pass.
- Automated game suite: **22/22**.
- Page errors: 0.
- Failed requests / 404s: 0.
- Runtime requests outside the static site: 0.
- Every child-facing painting control: at least 96 CSS px.
- Actual pointer drawing, semantic replay, undo, clear, local save/reload, and
  PNG download: pass.
- Recorded narrator begins after a child gesture: pass.
- Full repository validator: 0 errors, 23 pre-existing unrelated warnings.

## Visual review

Reviewed full-detail captures for:

- papercraft splash and all three mode cards;
- Calm River painted state;
- Bouncy Beat and Star Sparkles brush states;
- finished keepsake;
- portrait splash and portrait paint canvas.

The title/card hierarchy is clear, the play canvas remains the dominant target,
controls do not clip or overlap safe areas, the five-color palette remains
touchable in both orientations, dynamic marks read against the dark paper, and
the finished screen makes replay and local picture export distinct.

## Voice QA

Twelve of thirteen recorded teacher-voice lines passed Whisper transcript QA.
`sparkle-prompt` remains on the exact Web Speech fallback after seed 8 and 9
recordings both transcribed with singular “star” instead of scripted “stars.”

## Production

- Runtime commit: `e07256e` (`Build papercraft Sound Painting`).
- GitHub Pages run: `30318674234`, successful.
- Production URL: `https://qlo.be/games/sound-painting/`.
- The complete real-Google-Chrome suite against production: **22/22**.
- Production page errors: 0.
- Production failed requests / 404s: 0.
- Production remote runtime requests: 0.
- Production landscape splash, painted canvas, keepsake, all three brush
  states, portrait splash, and portrait paint screen visually reviewed at full
  useful detail: pass.

## Color-track orchestra revision

Date: 2026-07-27

- Every palette color resolves to a distinct consonant register:
  `-12, -5, 0, +7, +12` semitones.
- Selecting a swatch previews that color's track voice: pass.
- The first phrase of each color track begins at replay time zero: pass.
- Same-color phrases retain their exact recorded offsets and rests: pass.
- Regression example `2s orange + 3s rest + 2s orange`: second phrase begins
  at 5 seconds, preserving the full 3-second silence.
- Three real WebAudio color voices entered within 1.3 ms in Chrome and produced
  distinct measured pitches: 123 Hz, 247 Hz, and 440 Hz.
- Touch-enabled 1024×768 iPad layout at 2× density records Calm River pointer
  input on a 1676×1048 backing canvas: pass.
- Expanded local real-Chrome suite: **29/29**.
- Page errors: 0.
- Failed requests / 404s: 0.
- Production commit: `56d8451` (`Turn Sound Painting colors into music tracks`).
- GitHub Pages run: `30323033612`, successful.
- Production real-Chrome suite: **29/29**, with 1.1 ms measured three-track
  entry spread.
- Production iPad-density Calm River capture visually reviewed: pass.
