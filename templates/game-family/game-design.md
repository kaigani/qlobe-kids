# Game Design Document — Game Family Template

> This is a PRE-FILLED copy of `docs/game-design-template.md` with placeholder
> text, so you can see the shape. Replace every `<…>` and example line with your
> real design. Delete this note when you start.

## Game title
Game Family Template 🧩

## Category
`reading-phonics` — change to whichever of the 10 categories fits (see
`docs/categories.md`).

## Age target
5–6 (platform default).

## Concept video (optional)
_None yet._ If you make a proof-of-concept clip, drop it at `concept/poc.mp4`
(≤15 MB) or link it here.

## Learning goals (3–5)
1. <First observable skill the child practices.>
2. <Second skill.>
3. <Third skill.>

## Mini-games / modes

### Mode 1 — Mode A
- **Skill:** <the one skill Mode A practices>
- **Core loop (30–90s):** <A child hears a prompt, sees the options, taps one,
  and gets a warm reveal + celebration. Then the next round begins.>

### Mode 2 — Mode B
- **Skill:** <the one skill Mode B practices>
- **Core loop (30–90s):** <Describe one full round here.>

## Shared assets used
- `shared/js/audio.js` — recorded teacher voice with Web Speech fallback.
- `shared/js/sfx.js` — synthesized sound effects (no files).
- `shared/js/speech.js` — Web Speech wrapper.
- `shared/fonts/fredoka-latin-600-normal.woff2` — display font.

### New assets needed
- <List any new art/audio. Note shared/ vs local, and log provenance + license
  in this folder's `ASSETS.md`.>

## Interaction model
Tap. Touch-first, minimum 96px targets, no reading required, audio-rich.

## Feedback model
- **Success:** voice praise + `sfx.sparkle()`, plus a visual reveal.
- **Retry:** gentle spoken re-prompt with a hint; no "wrong" buzzer.
- **Hint:** highlight or replay the target after a short pause.
- **Celebration:** a small sound-and-motion payoff to close the loop.

> No punishment, no failure states, no loot mechanics.

## Difficulty progression (tiny steps)
<Describe how round N+1 nudges slightly harder while most things stay the same.>

## Replay variation
<Describe what shuffles or refreshes each play so repetition stays fun.>

## Movement prompts (optional)
<Optional real-world action, or delete this section.>
