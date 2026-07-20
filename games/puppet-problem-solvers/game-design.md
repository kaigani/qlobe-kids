# Problem-Solving Puppets — game design

**One skill:** choosing kind solutions to everyday social problems — after *seeing*
each solution acted out, never just hearing it described.

**Why puppets:** pre-literate five-year-olds reason about social situations far
better when they watch them happen than when they hear them summarized. Every
choice in this game is performed live by two plush puppets before the child is
asked to pick. Show, don't tell.

## The loop (one round, ~55–70s)

1. **Setup (~18s)** — the two puppets act out a small conflict (someone won't
   share, both want to go first, a job is too big alone) and freeze on the
   problem tableau. Narrator: "Uh oh! … What could they do?"
2. **Previews (~5s × 2–3)** — for each choice the narrator asks the option
   ("Should the friend grab it away?"), the puppets act a 3–4s vignette while
   that choice's picture card slides into the bottom rail and glows — the card
   is *born from its acted moment* — then the scene snaps back to the tableau.
3. **Choice** — "Now you choose!" One tap commits (platform one-press path; the
   previews already guaranteed every option was seen).
4. **Resolution** — the chosen idea plays out in full. Kind → acted happy
   ending + confetti + praise. Unkind → gentle sad beat (sad-puff, "That makes
   me feel sad."), snap back to the tableau, tried card dims but stays tappable,
   choice reopens. Repeating a sad choice is allowed — it re-teaches.

No fail states, no scores. Progress dots only.

## Casting

The child casts the show: they pick any 2 of the 8 rigged characters (bear,
doggy, fox, frog, rabbit, unicorn, princess-lily, princess-zoe) on a picker
screen; each pick says hello in its own recorded voice. Scenarios are written
for abstract roles **a** (left) and **b** (right), and every dialogue line
exists in all 8 character voices (the shared 28-line catalog), so any pair can
play any story.

## Modes (story packs) — 12 scenarios, surfaced randomly

- **Share** — toy-truck, red-crayon, storybook, big-ball
- **Take Turns** — slide, swing, drum, telescope
- **Ask for Help** — high-shelf, spilled-blocks, stuck-wagon, tangled-kite

Each session plays `rounds: 3` scenarios sampled from the pack's pool
(seeded shuffle; `QLOBE_DEBUG.seed(n)` makes it deterministic for QA).

## Tech

- Engine: `shared/js/engines/puppet-theater.js` (archetype: watch → previews →
  pick) on the theater substrate `shared/js/stage/theater.js` (cast loading,
  beat sequencer, props pinned to paws, tableau capture/restore, lip-sync).
- Acting clips: `shared/characters/acting-clips.json` — portable pack (sad,
  stomp, grab, ask, offer, nod, head-shake, hug, cheer, think) merged under
  each rig's own clips at load.
- Scenarios are pure data in `config.js` (beat grammar documented there).
- Reduced motion: every story beat carries a pose; scenes play as voiced
  tableaux, fully completable.
- Voice: narrator = shared teacher voice (`assets/audio/` manifest); character
  lines = per-character recorded clips + viseme cues from
  `shared/characters/<id>/voice/`. Web Speech fallback keeps everything
  playable if a clip is missing.

## Playtest checklist

- Cast picker: two taps, both puppets hop in and greet.
- Every choice is acted before the cards arm; cards ≥96px; one tap commits.
- Unkind pick: gentle, warm, scene restores, retry open, no shame.
- Full round ≤90s; three rounds per session; end screen → Play Again recasts.
