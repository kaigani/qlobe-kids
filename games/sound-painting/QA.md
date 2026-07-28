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

Pending deployment and the same real-Chrome suite against `https://qlo.be`.
