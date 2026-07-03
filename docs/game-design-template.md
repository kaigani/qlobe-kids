# Game Design Document — <Game Title>

> The blank GDD template. Copy this into your game folder as `game-design.md`
> and fill every section. Keep it short and concrete — this is a design brief,
> not a spec. Canonical design principles live in `docs/philosophy.md`.

## Game title
<Name of the game family. An emoji is welcome.>

## Category
<One of the 10 categories — see `docs/categories.md`. Use the kebab-case id,
e.g. `reading-phonics`.>

## Age target
5–6 (platform default). Note here if a mode skews younger or older.

## Concept video (optional)
<Relative path to `concept/<file>.mp4` (≤15 MB) or an external link. An
AI-generated proof-of-concept clip is a great way to align on the feel before
building. Delete this line if you have none.>

## Learning goals (3–5)
1. <A concrete, observable skill a child practices.>
2. <…>
3. <…>

## Mini-games / modes
> One game family, many small modes. Each mode teaches ONE skill and runs a
> 30–90 second loop. Aim for 2–4 modes.

### Mode 1 — <name>
- **Skill:** <the single skill this mode practices>
- **Core loop (30–90s):** <hear-it → see-it → do-it. Describe one round from
  start to celebration.>

### Mode 2 — <name>
- **Skill:** <…>
- **Core loop (30–90s):** <…>

## Shared assets used
> Check `docs/asset-system.md` FIRST — reuse before you make anything new.
- <e.g. `shared/js/audio.js` for teacher-voice + speech fallback>
- <e.g. `shared/assets/objects/*.png` picture cards>
- <e.g. `shared/fonts/fredoka-latin-600-normal.woff2`>

### New assets needed
- <List anything not yet in `shared/`. Note if it belongs in `shared/` (reusable)
  or stays local to this game. Log provenance + license in the game's ASSETS.md.>

## Interaction model
<How the child acts: tap, drag, match, sort, trace, pour, tilt… Touch-first,
minimum 96px targets, no reading required. Audio-rich.>

## Feedback model
- **Success:** <voice praise, sparkle sfx, visual reveal…>
- **Retry:** <gentle re-prompt — never a harsh "wrong">
- **Hint:** <what nudges a stuck child forward>
- **Celebration:** <the little payoff that closes a loop>

> Rule: no punishment, no failure states, no loot mechanics. Repeat with
> variation instead.

## Difficulty progression (tiny steps)
<Kumon-style micro-increments. How does round N+1 differ from round N? What
stays constant so the child feels mastery?>

## Replay variation
<What changes each play so 100 rounds don't feel identical — new words, shuffled
order, new pictures, small surprises.>

## Movement prompts (optional)
<Optional real-world actions that pull the child off the screen: "hop like the
frog", "go find something red". Delete if not applicable.>
