# Problem-Solving Puppets — game design

**One skill:** judging whether a choice was kind — after *seeing* it acted out
with its consequence, never just hearing it described.

**Why puppets:** pre-literate five-year-olds reason about social situations far
better when they watch them happen than when they hear them summarized. Every
choice the child judges has just been performed live by two plush puppets,
consequence and all. Show, don't tell — then ask what they think.

## The loop (one 3-scenario show, ~2 min; a judgment every ~25-30s)

1. **Setup (~15s)** — the two puppets act out a small conflict (someone won't
   share, both want to go first, a job is too big alone) and freeze on the
   problem tableau.
2. **Acting** — narrator: "Watch what they do!" and ONE of the scenario's
   authored choices plays out at random, consequence included. Every show is
   guaranteed at least one kind and one unkind draw.
3. **Judge pause** — "Did you like that choice?" Two big round buttons: red
   unhappy face (I didn't like it) / green happy face (I liked it). One tap
   commits. Correct → sparkle + the narrator names what happened. Wrong →
   gentle nudge ("Look at their faces!") and a re-ask.
4. **Repair** — after a correctly-judged unkind choice, "Let's watch them try
   a kinder way!" and a kind choice plays out, so every scene ends warm.
5. **Bridge** — props swap, the backdrop crossfades if the place changes, and
   the next scenario flows in ("And then..."). One big celebration after all
   three scenarios.

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
