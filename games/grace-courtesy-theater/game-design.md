# Grace & Courtesy Theater

## Product promise

A child opens a treasured felt playset, dresses two friendly puppets, and helps
them find the kind action in six everyday social moments. The experience is a
tiny role-play theater—not a worksheet and not a text quiz. Faces, poses, props,
voice, and stage transformation should make every answer understandable before
the child reads the label.

## Audience and session

- Primary audience: ages 4–7.
- Typical story: 45–90 seconds.
- Full six-story repertoire: about 6–10 minutes.
- Input: one-finger taps only.
- Reading: optional; every prompt and response is narrated.
- Emotional contract: misses are safe rehearsals. Nobody is shamed, punished,
  scared, or made into a “bad” character.

## Learning objectives

1. Notice another person's face, body, and situation before acting.
2. Practice six concrete grace-and-courtesy behaviors: greeting, asking before
   taking, thanking, waiting, listening, and repairing after an accident.
3. Connect polite words to the action behind them—making space, taking turns,
   acknowledging help, and rebuilding together.
4. Learn that a mistaken choice can be rewound and tried again.

## Art world

The whole game is a handmade miniature theater. Cranberry wool curtains frame a
deep plum stage; footlights warm a wooden floor; cream felt cards carry chunky
blanket stitching. Poppy is a peach felt bean puppet with burgundy yarn-loop
hair and a gold star patch. Coco is a cocoa-brown felt bean puppet with two
puff buns, teal ties, and a teal heart patch. Both keep the same facial design,
body proportions, materials, and identifying patches on every screen.

Raster assets do the visual storytelling. CSS is limited to layout, typography,
focus, compositing the costume headpieces, and motion. Browser emoji, vector
illustration, CSS-drawn character art, and runtime model calls are excluded.

## Screen flow

```text
Six-story marquee → costume trunk → focused stage choice → curtain call
         ↑                                               │
         └────────────── choose another story ───────────┘
```

### 1. Story marquee

Six large felt scenario cards show Poppy, Coco, and the relevant prop. A child
can recognize the story from the miniature tableau. An earned felt star appears
on completed stories, and a six-star shelf preserves repertoire progress.

### 2. Costume trunk

Poppy and Coco each have four authored felt headpieces: daisy, berry stars,
sunshine crown, and moonlight bow. Choosing a swatch visibly changes that puppet
everywhere, including the story cards, stage, and curtain call, while preserving
the puppet's skin tone and identity. The selection is saved locally; it never
blocks starting the show and has no purchase or unlock mechanic.

### 3. Theater stage

The selected story opens on the same warm stage with one or two concrete props,
large expressive puppet poses, and three full-width illustrated actions.
Choices stay hidden while the recorded prompt plays, then rise together so
listening and tapping do not compete.

### 4. Curtain call

The kind action transforms the central prop into a felt heart, both puppets
celebrate, a story star is earned, and the child hears why the action helped.
The curtain call offers “Again” or “Another Story.”

## Story repertoire

| Story | Situation shown | Kind action | Safe alternatives |
|---|---|---|---|
| Hello, Friend | Coco arrives at a welcome mat | Wave and say hello | Turn away; shout too loudly |
| Ask Kindly | Coco is using a red crayon | Ask with open hands | Grab it; stomp and demand |
| Thank You | Coco helped tidy blocks | Offer a warm thank-you | Walk away; demand more |
| Taking Turns | Coco is playing a drum | Wait by the clock and ask for next | Grab the drum; push ahead |
| Listening Ears | Coco is sharing a storybook | Look and listen | Talk over the story; look away |
| Make It Right | Poppy bumped the block tower | Say sorry and help rebuild | Hide; blame Coco |

## Core interaction loop

1. The child chooses an illustrated story.
2. The child may choose either puppet's felt headpiece.
3. The curtain opens; a short spoken setup names what the child can already see.
4. Three authored picture choices appear in a seeded random order.
5. A miss changes Coco's expression, shows “Let's rewind gently,” explains the
   social consequence, then restores input and visually hints the kind option.
6. A kind tap changes both poses, turns the prop into a heart, plays a sparkle
   beat, adds a star, and explains the helpful result.
7. The curtain call lets the child replay or return to the repertoire.

## Interaction and accessibility

- Primary targets are at least 96 CSS pixels in the standard tablet layout.
- Each picture choice includes a concise text label and accessible name.
- All decorative art has empty alternative text; meaningful puppets and props
  have direct labels where they enter the reading order.
- A sound control repeats the current prompt. Back always returns in-page to the
  story marquee; the platform home button appears only on that marquee.
- Recorded teacher clips are primary. Missing or rejected clips fall back to
  device speech with the identical checked-in script.
- Reduced-motion mode removes breathing, bounce, confetti, and long transitions
  while leaving every state and reward available.
- Portrait, tablet landscape, and short phone landscape receive dedicated
  compositions rather than horizontal scrolling.

## Feedback language

- Neutral setup: “Watch their faces.”
- Choice prompt: “What helps both friends?”
- Miss: “Let's rewind gently,” followed by a concrete consequence and a kind
  action to try. The selected card wiggles; it is not crossed out or booed.
- Success: the narration names both the phrase and why it helps.
- Idle: after 11 seconds, replay a short clue and lift the correct picture.
- Completion: “Take a bow! You helped kindness shine.”

The verbatim production voice script lives in
`assets/audio/lines.json`; `config.json` carries the same fallback text.

## Replay and progression

Answer order is seeded and shuffled. The six independent stories can be played
in any order. Completion stars and two costume selections are stored in local
storage under `qk-grace-courtesy-theater`. There is no score, streak, timer,
failure state, account, analytics dependency, or remote save.

## Runtime architecture

This is a custom DOM game rather than the former generic `choose-one` stub.
The game uses the platform modules for screens, tap normalization, HUD, audio
unlock, narration, recorded clips, music, SFX, timers, idle nudging, seeded RNG,
preloading, celebration, DOM escaping, and the debug harness. All model output
is converted to committed runtime assets; production play makes no generation
or LAN API request.

## QLOBE_DEBUG v1

- Engine: `grace-courtesy-theater-custom`.
- Modes: the six story IDs.
- State: screen, mode, phase, attempts, choice order, costume choices, earned
  stories, input lock, and mute state.
- Actions: `startMode`, `tap`, `winRound`, `home`, `mute`, `seed`,
  plus `chooseScenario`, `chooseCostume`, and `resetProgress`.
- Timers pass through the shared timer registry so automated fast-timer mode
  preserves sequencing and navigation-race coverage.

## Production departures from the concept

- “Sharing” became six specific, developmentally concrete stories.
- Customization changes authored felt headpieces instead of offering an unlock
  economy. This keeps skin tone and identity stable, makes the choice immediate,
  and avoids extrinsic reward pressure.
- The child selects a modeled action rather than puppeteering dialogue word by
  word; this keeps the experience fully usable for pre-readers.
- A dedicated felt cast replaces shared portrait placeholders and emoji.
- The concept's generic home/customize/stage flow is retained, but the final
  stage is deeper, darker, and more theatrical than the early mockup.

## Release gate

- All 56 production cutouts pass exact-count cutting and magenta-background edge
  inspection.
- Every generated voice line passes Whisper transcript and duration QA or is
  truthfully omitted from the recorded manifest.
- Real Chrome smoke tests cover a real pointer path, a miss, a win, all six
  modes, completion persistence, recorded audio, hub click-through, responsive
  layouts, reduced motion, decoded images, and clean requests/console.
- Tablet and phone screenshots receive a separate adversarial art-direction
  review against the concept mockups.
- Registry validator, source syntax checks, `git diff --check`, and production
  URL smoke tests must pass before the launch commit is accepted.

Status is `beta` until an actual child/iPad playtest is recorded; deployment to
the public production site does not waive that human-play requirement.
